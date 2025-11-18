import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsEditorOrAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";

const DeleteAllPanelEventsRequest = z.object({
  panelId: z.string().min(1, "panelId requerido"),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/ , "monthKey debe ser YYYY-MM"),
});

export const deleteAllPanelEvents = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onCall(async (data: unknown, context) => {
    // 1) Authz
    assertIsEditorOrAdmin(context);
    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2) Validate
    const parse = DeleteAllPanelEventsRequest.safeParse(data);
    if (!parse.success) {
      const errors = parse.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }
    const { panelId, monthKey } = parse.data;

    const db = admin.firestore();

    // 3) Check not locked month
    const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
    if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El mes ${monthKey} está cerrado; no se pueden eliminar eventos.`
      );
    }

    // 4) Query all events of that month
    const eventsSnap = await db
      .collection("panels").doc(panelId)
      .collection("panelEvents")
      .where("monthKey", "==", monthKey)
      .get();

    if (eventsSnap.empty) {
      return { success: true, deleted: 0, message: "No había eventos para eliminar" };
    }

    // 5) Soft-delete in batches
    let deleted = 0;
    const BATCH_LIMIT = 450; // keep margin under 500 WU
    let batch = db.batch();
    let ops = 0;
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      if (data.isDeleted === true) continue;
      batch.update(doc.ref, {
        isDeleted: true,
        deletedAt: timestamp,
        deletedBy: userEmail,
        updatedAt: timestamp,
      });
      deleted++;
      ops++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
    }

    functions.logger.info(`[deleteAllPanelEvents] ${deleted} eventos eliminados en ${panelId}/${monthKey}`);

    // 6) Recalculate month for this panel to reflect no events
    try {
      await recalculatePanelMonth(panelId, monthKey);
    } catch (err) {
      functions.logger.error(`[deleteAllPanelEvents] Error recalc:`, err);
      // No propagamos para no ocultar la eliminación, pero informamos
    }

    // 7) Leer el billingMonthlyPanel actualizado para informar impacto exacto
    const billingRef = db.collection("billingMonthlyPanel").doc(`${panelId}_${monthKey}`);
    const billingDoc = await billingRef.get();
    const billing = billingDoc.exists ? billingDoc.data() as any : null;

    return {
      success: true,
      panelId,
      monthKey,
      deleted,
      totals: billing
        ? {
            totalDiasFacturables: billing.totalDiasFacturables || 0,
            totalImporte: billing.totalImporte || 0,
            estadoAlCierre: billing.estadoAlCierre || "ACTIVO",
            tarifaAplicada: billing.tarifaAplicada || 0,
          }
        : undefined,
      message: `Eliminados ${deleted} eventos; facturación recalculada`,
    };
  });
