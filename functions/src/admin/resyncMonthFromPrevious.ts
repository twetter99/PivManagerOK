import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";

const ResyncMonthRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "El monthKey debe tener formato YYYY-MM"),
});

/**
 * Callable Function: resyncMonthFromPrevious
 * 
 * Resincroniza un mes heredando los estados de cierre del mes anterior.
 * Útil cuando corriges el mes anterior y necesitas actualizar el mes actual.
 * 
 * Proceso:
 * 1. Lee todos los billingMonthlyPanel del mes anterior
 * 2. Actualiza estadoAlCierre de cada panel del mes actual
 * 3. Recalcula facturación de cada panel
 * 4. NO toca los eventos del mes actual
 * 
 * @param data - { monthKey: "YYYY-MM" } - El mes a resincronizar
 * @param context - Contexto de autenticación
 * @returns { success: true, monthKey: string, panelsUpdated: number }
 */
export const resyncMonthFromPrevious = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el llamante sea admin
    assertIsAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar los datos de entrada
    const parseResult = ResyncMonthRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => e.message).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey } = parseResult.data;

    functions.logger.info(`[resyncMonthFromPrevious] Resincronizando ${monthKey} por ${userEmail}`);

    const db = admin.firestore();

    // 3. Verificar que el mes exista
    const summaryRef = db.collection("billingSummary").doc(monthKey);
    const summaryDoc = await summaryRef.get();

    if (!summaryDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `El mes ${monthKey} no existe.`
      );
    }

    // 4. Calcular el mes anterior
    const [year, month] = monthKey.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const previousMonthKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    functions.logger.info(`[resyncMonthFromPrevious] Leyendo estados del mes anterior: ${previousMonthKey}`);

    // 5. Leer todos los billingMonthlyPanel del mes anterior
    const previousBillingSnapshot = await db
      .collection("billingMonthlyPanel")
      .where("monthKey", "==", previousMonthKey)
      .get();

    if (previousBillingSnapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        `No hay datos del mes anterior (${previousMonthKey}). No se puede resincronizar.`
      );
    }

    functions.logger.info(
      `[resyncMonthFromPrevious] Encontrados ${previousBillingSnapshot.size} paneles en ${previousMonthKey}`
    );

    // 6. Crear mapa de estados del mes anterior: panelId -> estadoAlCierre
    const previousStates = new Map<string, string>();
    for (const doc of previousBillingSnapshot.docs) {
      const data = doc.data();
      previousStates.set(data.panelId, data.estadoAlCierre);
    }

    // 7. Actualizar estadoAlCierre de cada panel del mes actual
    const currentBillingSnapshot = await db
      .collection("billingMonthlyPanel")
      .where("monthKey", "==", monthKey)
      .get();

    if (currentBillingSnapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        `No hay datos del mes ${monthKey}. No se puede resincronizar.`
      );
    }

    functions.logger.info(
      `[resyncMonthFromPrevious] Actualizando ${currentBillingSnapshot.size} paneles en ${monthKey}`
    );

    const BATCH_SIZE = 450;
    let panelsUpdated = 0;
    let batch = db.batch();
    let opsInBatch = 0;

    const panelsToRecalculate: string[] = [];

    for (const doc of currentBillingSnapshot.docs) {
      const currentData = doc.data();
      const previousState = previousStates.get(currentData.panelId);

      if (!previousState) {
        functions.logger.warn(
          `[resyncMonthFromPrevious] Panel ${currentData.panelId} no encontrado en mes anterior, omitiendo`
        );
        continue;
      }

      // Actualizar solo si cambió el estado
      if (currentData.estadoAlCierre !== previousState) {
        functions.logger.info(
          `[resyncMonthFromPrevious] Panel ${currentData.codigo}: ${currentData.estadoAlCierre} → ${previousState}`
        );

        batch.update(doc.ref, {
          estadoAlCierre: previousState,
          updatedAt: timestamp,
        });

        panelsToRecalculate.push(currentData.panelId);
        panelsUpdated++;
        opsInBatch++;

        if (opsInBatch >= BATCH_SIZE) {
          await batch.commit();
          functions.logger.info(`[resyncMonthFromPrevious] Lote completado: ${panelsUpdated} paneles actualizados`);
          batch = db.batch();
          opsInBatch = 0;
        }
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      functions.logger.info(`[resyncMonthFromPrevious] Último lote: ${panelsUpdated} paneles actualizados`);
    }

    // 8. Recalcular facturación de los paneles actualizados
    functions.logger.info(
      `[resyncMonthFromPrevious] Recalculando facturación de ${panelsToRecalculate.length} paneles`
    );

    for (const panelId of panelsToRecalculate) {
      try {
        await recalculatePanelMonth(panelId, monthKey);
      } catch (error) {
        functions.logger.error(
          `[resyncMonthFromPrevious] Error recalculando panel ${panelId}:`,
          error
        );
        // Continuar con los demás paneles
      }
    }

    functions.logger.info(
      `[resyncMonthFromPrevious] Resincronización completada: ${panelsUpdated} paneles actualizados`
    );

    return {
      success: true,
      monthKey,
      previousMonthKey,
      panelsUpdated,
      panelsRecalculated: panelsToRecalculate.length,
    };
  });
