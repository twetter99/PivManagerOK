import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";

const DeleteMonthRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Formato de monthKey inválido (YYYY-MM)"),
});

/**
 * Callable Function: deleteMonthData
 * 
 * Elimina TODOS los datos de facturación de un mes específico:
 * - billingMonthlyPanel (todos los paneles del mes)
 * - billingSummary (resumen del mes)
 * - panelEvents fantasma (eventos con monthKey del mes que no deberían existir)
 * 
 * IMPORTANTE: Elimina eventos fantasma que causan cálculos incorrectos.
 * Esto resuelve el problema de paneles mostrando "1 día" en lugar de "30 días".
 * 
 * @param data - { monthKey: "YYYY-MM" }
 * @param context - Contexto de autenticación
 * @returns { success: true, deletedBilling: number, deletedSummary: boolean, deletedEvents: number }
 */
export const deleteMonthData = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .https.onCall(async (data: unknown, context) => {
    assertIsAdmin(context);

    const parseResult = DeleteMonthRequest.safeParse(data);
    if (!parseResult.success) {
      throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos");
    }

    const { monthKey } = parseResult.data;

    functions.logger.info(`[deleteMonthData] Eliminando datos de ${monthKey}`);

    const db = admin.firestore();

    try {
      // 1. Eliminar billingMonthlyPanel
      functions.logger.info(`[deleteMonthData] Eliminando billingMonthlyPanel...`);
      const billingSnapshot = await db
        .collection("billingMonthlyPanel")
        .where("monthKey", "==", monthKey)
        .get();

      const totalDocs = billingSnapshot.size;
      functions.logger.info(`[deleteMonthData] Documentos a eliminar: ${totalDocs}`);

      if (totalDocs === 0) {
        functions.logger.info(`[deleteMonthData] No hay documentos para eliminar`);
      } else {
        const BATCH_SIZE = 500;
        let deleted = 0;

        for (let i = 0; i < billingSnapshot.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const batchDocs = billingSnapshot.docs.slice(i, i + BATCH_SIZE);

          batchDocs.forEach((doc) => {
            batch.delete(doc.ref);
          });

          await batch.commit();
          deleted += batchDocs.length;

          functions.logger.info(
            `[deleteMonthData] Progreso: ${deleted}/${totalDocs} eliminados`
          );
        }
      }

      // 2. Eliminar billingSummary
      functions.logger.info(`[deleteMonthData] Eliminando billingSummary...`);
      const summaryRef = db.collection("billingSummary").doc(monthKey);
      const summaryDoc = await summaryRef.get();
      const deletedSummary = summaryDoc.exists;
      
      if (deletedSummary) {
        await summaryRef.delete();
      }

      // 3. Eliminar panelEvents fantasma del mes (collectionGroup query)
      functions.logger.info(`[deleteMonthData] Eliminando panelEvents con monthKey=${monthKey}...`);
      const eventsSnapshot = await db
        .collectionGroup("panelEvents")
        .where("monthKey", "==", monthKey)
        .get();

      const totalEvents = eventsSnapshot.size;
      functions.logger.info(`[deleteMonthData] Eventos fantasma encontrados: ${totalEvents}`);

      if (totalEvents > 0) {
        const EVENT_BATCH_SIZE = 500;
        let deletedEvents = 0;

        for (let i = 0; i < eventsSnapshot.docs.length; i += EVENT_BATCH_SIZE) {
          const batch = db.batch();
          const batchDocs = eventsSnapshot.docs.slice(i, i + EVENT_BATCH_SIZE);

          batchDocs.forEach((doc) => {
            batch.delete(doc.ref);
          });

          await batch.commit();
          deletedEvents += batchDocs.length;

          functions.logger.info(
            `[deleteMonthData] Eventos eliminados: ${deletedEvents}/${totalEvents}`
          );
        }
      }

      // 4. Verificar billingMonthlyPanel
      const verifySnapshot = await db
        .collection("billingMonthlyPanel")
        .where("monthKey", "==", monthKey)
        .get();

      functions.logger.info(
        `[deleteMonthData] Verificación billing: ${verifySnapshot.size} documentos restantes`
      );

      // 5. Verificar panelEvents
      const verifyEventsSnapshot = await db
        .collectionGroup("panelEvents")
        .where("monthKey", "==", monthKey)
        .get();

      functions.logger.info(
        `[deleteMonthData] Verificación eventos: ${verifyEventsSnapshot.size} eventos restantes`
      );

      return {
        success: true,
        message: `Datos de ${monthKey} eliminados correctamente`,
        deletedBilling: totalDocs,
        deletedSummary,
        deletedEvents: totalEvents,
        verified: verifySnapshot.size === 0 && verifyEventsSnapshot.size === 0,
      };
    } catch (error) {
      functions.logger.error("[deleteMonthData] Error:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Error al eliminar datos: ${(error as Error).message}`
      );
    }
  });
