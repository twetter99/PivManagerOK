import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { CloudTasksClient } from "@google-cloud/tasks";
import { getPreviousMonthKey } from "../lib/billingRules";

const tasksClient = new CloudTasksClient();

/**
 * Scheduled Function: closeMonthJob
 * 
 * Se ejecuta automáticamente el día 1 de cada mes a las 02:00 AM (timezone Europe/Madrid).
 * Cierra el mes anterior para evitar modificaciones posteriores.
 * 
 * PROCESO:
 * 1. Calcula el monthKey del mes anterior (YYYY-MM)
 * 2. Encola una tarea updateSummaryTask para recalcular los totales finales
 * 3. Espera 5 minutos (para dar tiempo a que se complete la tarea)
 * 4. Marca billingSummary/{monthKeyAnterior} con isLocked: true
 * 
 * CONFIGURACIÓN:
 * - Programación: 0 2 1 * * (cron: día 1 de cada mes a las 02:00 AM)
 * - Timezone: Europe/Madrid
 * - Timeout: 10 minutos
 * 
 * @param context - Contexto de la función programada
 */
export const closeMonthJob = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos (máximo permitido)
    memory: "512MB",
  })
  .pubsub.schedule("0 2 1 * *") // Día 1 de cada mes a las 02:00 AM
  .timeZone("Europe/Madrid")
  .onRun(async (context) => {
    functions.logger.info("[closeMonthJob] Iniciando cierre de mes");

    // 1. Calcular el monthKey del mes anterior
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // getMonth() devuelve 0-11
    const currentMonthKey = `${currentYear}-${currentMonth.toString().padStart(2, "0")}`;

    const previousMonthKey = getPreviousMonthKey(currentMonthKey);

    functions.logger.info(`[closeMonthJob] Cerrando mes: ${previousMonthKey}`);

    const db = admin.firestore();

    // 2. Verificar que el mes no esté ya cerrado
    const summaryRef = db.collection("billingSummary").doc(previousMonthKey);
    const summaryDoc = await summaryRef.get();

    if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
      functions.logger.info(`[closeMonthJob] El mes ${previousMonthKey} ya está cerrado. Nada que hacer.`);
      return null;
    }

    // 3. Encolar tarea updateSummaryTask para recalcular los totales finales
    functions.logger.info(`[closeMonthJob] Encolando updateSummaryTask para ${previousMonthKey}`);

    try {
      await enqueueUpdateSummaryTask(previousMonthKey);
      functions.logger.info(`[closeMonthJob] Tarea updateSummaryTask encolada correctamente`);
    } catch (error) {
      functions.logger.error("[closeMonthJob] Error al encolar updateSummaryTask:", error);
      throw error; // Reintentará la función programada
    }

    // 4. Esperar 5 minutos para dar tiempo a que se complete la tarea
    functions.logger.info("[closeMonthJob] Esperando 5 minutos para que se complete el recálculo...");
    await sleep(5 * 60 * 1000); // 5 minutos

    // 5. Marcar billingSummary como bloqueado
    await summaryRef.set(
      {
        isLocked: true,
        lockedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true } // Merge para preservar los datos existentes
    );

    functions.logger.info(`[closeMonthJob] Mes ${previousMonthKey} cerrado exitosamente (isLocked: true)`);

    return null;
  });

/**
 * Encola una tarea en Cloud Tasks para actualizar el billingSummary del mes.
 */
async function enqueueUpdateSummaryTask(monthKey: string): Promise<void> {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const location = "europe-west1";
  const queue = "update-summary";

  if (!project) {
    throw new Error("No se pudo determinar el ID del proyecto (GCLOUD_PROJECT)");
  }

  const parent = tasksClient.queuePath(project, location, queue);
  const url = `https://${location}-${project}.cloudfunctions.net/updateSummaryTask`;

  // Usamos monthKey como taskId para deduplicación
  const task = {
    name: `${parent}/tasks/${monthKey.replace("-", "")}`, // "2025-11" -> "202511"
    httpRequest: {
      httpMethod: "POST" as const,
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(
        JSON.stringify({
          monthKey,
        })
      ).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
      },
    },
  };

  try {
    await tasksClient.createTask({ parent, task });
  } catch (error: any) {
    // Si la tarea ya existe (mismo taskId), no es un error
    if (error.code === 6) {
      // ALREADY_EXISTS
      functions.logger.info(`[enqueueUpdateSummaryTask] Tarea ya existe para mes ${monthKey} (OK)`);
    } else {
      throw error;
    }
  }
}

/**
 * Helper para esperar un tiempo determinado (sleep)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
