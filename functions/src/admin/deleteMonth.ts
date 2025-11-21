import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";

const DeleteMonthRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "El monthKey debe tener formato YYYY-MM"),
});

/**
 * Callable Function: deleteMonth
 * 
 * Elimina completamente un mes:
 * - Todos los billingMonthlyPanel del mes
 * - El billingSummary del mes
 * - Todos los panelEvents del mes
 * 
 * ⚠️ OPERACIÓN DESTRUCTIVA - No se puede deshacer
 * 
 * @param data - { monthKey: "YYYY-MM" }
 * @param context - Contexto de autenticación
 * @returns { success: true, monthKey: string, deleted: { panels, events, summary } }
 */
export const deleteMonth = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el llamante sea admin
    await assertIsAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar los datos de entrada
    const parseResult = DeleteMonthRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => e.message).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey } = parseResult.data;

    functions.logger.info(`[deleteMonth] Eliminando mes ${monthKey} por ${userEmail}`);

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

    // 4. Verificar que el mes esté abierto (no se puede eliminar mes cerrado por seguridad)
    const summaryData = summaryDoc.data();
    if (summaryData?.isLocked) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El mes ${monthKey} está cerrado. Ábrelo primero antes de eliminarlo.`
      );
    }

    let deletedPanels = 0;
    let deletedEvents = 0;

    // 5. Eliminar todos los billingMonthlyPanel del mes
    const BATCH_SIZE = 450;
    const billingSnapshot = await db
      .collection("billingMonthlyPanel")
      .where("monthKey", "==", monthKey)
      .get();

    functions.logger.info(`[deleteMonth] Eliminando ${billingSnapshot.size} billingMonthlyPanel`);

    let batch = db.batch();
    let opsInBatch = 0;

    for (const doc of billingSnapshot.docs) {
      batch.delete(doc.ref);
      deletedPanels++;
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        await batch.commit();
        functions.logger.info(`[deleteMonth] Lote completado: ${deletedPanels} paneles eliminados`);
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      functions.logger.info(`[deleteMonth] Último lote: ${deletedPanels} paneles eliminados`);
    }

    // 6. Eliminar todos los panelEvents del mes
    const eventsSnapshot = await db
      .collection("panelEvents")
      .where("monthKey", "==", monthKey)
      .get();

    functions.logger.info(`[deleteMonth] Eliminando ${eventsSnapshot.size} panelEvents`);

    batch = db.batch();
    opsInBatch = 0;

    for (const doc of eventsSnapshot.docs) {
      batch.delete(doc.ref);
      deletedEvents++;
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        await batch.commit();
        functions.logger.info(`[deleteMonth] Lote completado: ${deletedEvents} eventos eliminados`);
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      functions.logger.info(`[deleteMonth] Último lote: ${deletedEvents} eventos eliminados`);
    }

    // 7. Eliminar el billingSummary
    await summaryRef.delete();

    functions.logger.info(
      `[deleteMonth] Mes ${monthKey} eliminado completamente: ${deletedPanels} paneles, ${deletedEvents} eventos`
    );

    return {
      success: true,
      monthKey,
      deleted: {
        panels: deletedPanels,
        events: deletedEvents,
        summary: 1,
      },
    };
  });
