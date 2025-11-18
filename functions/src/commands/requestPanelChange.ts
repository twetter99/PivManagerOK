import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { CloudTasksClient } from "@google-cloud/tasks";
import { assertIsEditorOrAdmin, getUserEmail, now } from "../lib/utils";
import { PanelEventAction } from "../lib/schemas";
import { getPreviousMonthKey } from "../lib/billingRules";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";

// Schema de validación para la solicitud de cambio de panel
const RequestPanelChangeSchema = z.object({
  panelId: z.string().min(1, "El panelId es obligatorio"),
  action: PanelEventAction,
  effectiveDateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Formato de monthKey inválido (YYYY-MM)"),
  diasFacturables: z.number().int().min(0).max(31),
  importeAFacturar: z.number().min(0),
  motivo: z.string().optional(),
  snapshotBefore: z.object({}).passthrough(),
  snapshotAfter: z.object({}).passthrough(),
});

type RequestPanelChangeData = z.infer<typeof RequestPanelChangeSchema>;

// Cliente de Cloud Tasks
const tasksClient = new CloudTasksClient();

/**
 * Callable Function: requestPanelChange
 * 
 * Patrón Asíncrono: La UI llama esta función para crear un evento de panel.
 * La función valida, crea el evento en Firestore y encola una tarea en Cloud Tasks.
 * Responde inmediatamente con {status: "ok"} sin esperar el procesamiento.
 * 
 * @param data - Datos del evento (action, effectiveDate, diasFacturables, etc.)
 * @param context - Contexto de autenticación
 * @returns { status: "ok", eventId: string, idempotencyKey: string }
 */
export const requestPanelChange = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 60, // 1 minuto es suficiente para validar y encolar
    memory: "256MB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea editor o admin
    assertIsEditorOrAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar el payload contra el schema de Zod
    const parseResult = RequestPanelChangeSchema.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const eventData = parseResult.data;
    const { panelId, monthKey } = eventData;

    const db = admin.firestore();

    // 3. Validar que el monthKey no esté bloqueado
    const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();

    if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El mes ${monthKey} está cerrado y no se pueden crear nuevos eventos.`
      );
    }

    // 3.1 Validación ligera para REINSTALACION: requiere estado previo DESMONTADO/BAJA
    if (eventData.action === "REINSTALACION") {
      const previousMonthKey = getPreviousMonthKey(monthKey);

      const panelSnap = await db.collection("panels").doc(panelId).get();
      const prevBillingSnap = await db
        .collection("billingMonthlyPanel")
        .doc(`${panelId}_${previousMonthKey}`)
        .get();

      const prevState: string = prevBillingSnap.exists
        ? (prevBillingSnap.data()!.estadoAlCierre as string)
        : (panelSnap.data()?.estadoActual as string) || "ACTIVO";

      if (prevState === "ACTIVO") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `No se puede REINSTALAR porque el estado previo (${previousMonthKey}) es ACTIVO. ` +
            `Primero debe quedar DESMONTADO o BAJA en el mes anterior.`
        );
      }
    }

    // 4. Generar idempotencyKey (UUID v4)
    const idempotencyKey = uuidv4();
    const eventId = idempotencyKey; // Usamos el mismo UUID como ID del documento

    // 5. Escribir el documento en panels/{panelId}/panelEvents/{eventId}
    const effectiveDate = admin.firestore.Timestamp.fromDate(new Date(eventData.effectiveDateLocal));

    const eventRef = db
      .collection("panels")
      .doc(panelId)
      .collection("panelEvents")
      .doc(eventId);

    await eventRef.set({
      action: eventData.action,
      effectiveDate,
      effectiveDateLocal: eventData.effectiveDateLocal,
      monthKey: eventData.monthKey,
      diasFacturables: eventData.diasFacturables,
      importeAFacturar: eventData.importeAFacturar,
      motivo: eventData.motivo || "",
      snapshotBefore: eventData.snapshotBefore,
      snapshotAfter: eventData.snapshotAfter,
      idempotencyKey,
      isDeleted: false,
      createdAt: timestamp,
      createdBy: userEmail,
      updatedAt: timestamp,
      schemaVersion: 1,
    });

    functions.logger.info(`Evento ${eventId} creado para el panel ${panelId} (action: ${eventData.action})`);

    // 6. Encolar tarea en Cloud Tasks (cola: process-panel-event)
    try {
      await enqueueProcessPanelEventTask(panelId, eventId, idempotencyKey);
      functions.logger.info(`Tarea encolada en Cloud Tasks con taskId: ${idempotencyKey}`);
    } catch (error) {
      functions.logger.error("Error al encolar la tarea en Cloud Tasks:", error);
      // No lanzamos error aquí porque el evento ya está creado.
      // La tarea puede ser reencolada manualmente o mediante un trigger.
    }

    // 7. Recalcular facturación inmediatamente y devolver totales
    try {
      await recalculatePanelMonth(panelId, monthKey);
    } catch (recalcError) {
      functions.logger.error("Error al recalcular panel:", recalcError);
      // Continuar para devolver respuesta
    }

    // Leer el billingMonthlyPanel actualizado
    const billingRef = db.collection("billingMonthlyPanel").doc(`${panelId}_${monthKey}`);
    const billingDoc = await billingRef.get();
    const billing = billingDoc.exists ? billingDoc.data() as any : null;

    // 8. Responder con totales de facturación
    return {
      status: "ok",
      eventId,
      idempotencyKey,
      totals: billing
        ? {
            totalDiasFacturables: billing.totalDiasFacturables || 0,
            totalImporte: billing.totalImporte || 0,
            estadoAlCierre: billing.estadoAlCierre || "ACTIVO",
            tarifaAplicada: billing.tarifaAplicada || 0,
          }
        : undefined,
    };
  });

/**
 * Encola una tarea en Cloud Tasks para procesar el evento de panel.
 * Usa idempotencyKey como taskId para deduplicación automática.
 * 
 * @param panelId - ID del panel
 * @param eventId - ID del evento
 * @param idempotencyKey - Clave de idempotencia (UUID v4)
 */
async function enqueueProcessPanelEventTask(
  panelId: string,
  eventId: string,
  idempotencyKey: string
): Promise<void> {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const location = "europe-west1"; // Ajustar según tu configuración
  const queue = "process-panel-event";

  if (!project) {
    throw new Error("No se pudo determinar el ID del proyecto (GCLOUD_PROJECT)");
  }

  // Construir la ruta de la cola
  const parent = tasksClient.queuePath(project, location, queue);

  // URL del Cloud Function HTTP que procesará el evento
  const url = `https://${location}-${project}.cloudfunctions.net/processPanelEventTask`;

  // Crear la tarea con idempotencyKey como taskId
  const task = {
    name: `${parent}/tasks/${idempotencyKey}`, // Deduplicación automática
    httpRequest: {
      httpMethod: "POST" as const,
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(
        JSON.stringify({
          panelId,
          eventId,
          idempotencyKey,
        })
      ).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
      },
    },
  };

  // Encolar la tarea
  await tasksClient.createTask({ parent, task });
}
