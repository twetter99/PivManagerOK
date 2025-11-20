/**
 * deletePanel - Elimina completamente un panel y todos sus datos relacionados
 * 
 * ATENCIÓN: Esta operación es IRREVERSIBLE
 * 
 * Elimina:
 * - Documento en panels
 * - Documento en panelCodes (candado de unicidad)
 * - Subcolección panelEvents (todos los eventos del panel)
 * - Documentos en billingMonthlyPanel (todos los meses del panel)
 * - Recalcula billingSummary de los meses afectados
 * 
 * Restricciones:
 * - Solo admins pueden ejecutar
 * - No permite eliminar si hay meses bloqueados (isLocked: true)
 * - Requiere confirmación explícita con el código del panel
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { recalculateSummary } from "../lib/summaryCalculations";

const db = admin.firestore();

interface DeletePanelRequest {
  panelId: string;
  confirmCode: string; // Usuario debe escribir el código del panel para confirmar
}

export const deletePanel = functions
  .region("europe-west1")
  .https.onCall(async (data: DeletePanelRequest, context) => {
    // 1. Validación de autenticación y permisos
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado para eliminar un panel"
      );
    }

    const userEmail = context.auth.token.email || "unknown";

    // Verificar que el usuario es admin
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData || userData.role !== "admin") {
      functions.logger.warn(
        `[deletePanel] ❌ Intento no autorizado por ${userEmail}`
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo administradores pueden eliminar paneles"
      );
    }

    const { panelId, confirmCode } = data;

    if (!panelId || !confirmCode) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "panelId y confirmCode son requeridos"
      );
    }

    functions.logger.info(
      `[deletePanel] Inicio de eliminación: ${panelId} por ${userEmail}`
    );

    // 2. Verificar que el panel existe y obtener su código
    const panelRef = db.collection("panels").doc(panelId);
    const panelDoc = await panelRef.get();

    if (!panelDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `Panel ${panelId} no encontrado`
      );
    }

    const panelData = panelDoc.data()!;
    const codigoPanelReal = panelData.codigo;

    // 3. Validar código de confirmación
    if (confirmCode !== codigoPanelReal) {
      functions.logger.warn(
        `[deletePanel] ❌ Código de confirmación incorrecto: esperado "${codigoPanelReal}", recibido "${confirmCode}"`
      );
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Código de confirmación incorrecto. Debes escribir "${codigoPanelReal}" para confirmar`
      );
    }

    // 4. Verificar meses bloqueados
    const billingSnapshot = await db
      .collection("billingMonthlyPanel")
      .where("panelId", "==", panelId)
      .get();

    const monthsWithBilling = billingSnapshot.docs.map(doc => doc.data().monthKey);
    const affectedMonths = new Set<string>(monthsWithBilling);

    // Verificar si algún mes está bloqueado
    for (const monthKey of affectedMonths) {
      const summaryDoc = await db
        .collection("billingSummary")
        .doc(monthKey)
        .get();

      if (summaryDoc.exists && summaryDoc.data()!.isLocked === true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `No se puede eliminar: el mes ${monthKey} está bloqueado. Desbloquea el mes primero.`
        );
      }
    }

    functions.logger.info(
      `[deletePanel] Meses afectados: ${Array.from(affectedMonths).join(", ")}`
    );

    // 5. ELIMINACIÓN COMPLETA (usando batch para atomicidad)
    const batch = db.batch();

    // 5.1. Eliminar documento principal en panels
    batch.delete(panelRef);
    functions.logger.info(`[deletePanel] ✓ Marcado para eliminar: panels/${panelId}`);

    // 5.2. Eliminar candado de unicidad en panelCodes
    const codeRef = db.collection("panelCodes").doc(codigoPanelReal);
    batch.delete(codeRef);
    functions.logger.info(
      `[deletePanel] ✓ Marcado para eliminar: panelCodes/${codigoPanelReal}`
    );

    // 5.3. Eliminar todos los documentos en billingMonthlyPanel
    for (const doc of billingSnapshot.docs) {
      batch.delete(doc.ref);
      functions.logger.info(
        `[deletePanel] ✓ Marcado para eliminar: billingMonthlyPanel/${doc.id}`
      );
    }

    // Commit del batch principal
    await batch.commit();
    functions.logger.info(`[deletePanel] ✓ Batch principal completado`);

    // 5.4. Eliminar subcolección panelEvents (las subcolecciones no se eliminan con el documento padre)
    const eventsSnapshot = await panelRef.collection("panelEvents").get();
    
    if (!eventsSnapshot.empty) {
      const eventsBatch = db.batch();
      eventsSnapshot.docs.forEach(doc => {
        eventsBatch.delete(doc.ref);
      });
      await eventsBatch.commit();
      functions.logger.info(
        `[deletePanel] ✓ Eliminados ${eventsSnapshot.size} eventos de la subcolección panelEvents`
      );
    }

    // 6. Recalcular billingSummary de todos los meses afectados
    functions.logger.info(
      `[deletePanel] Recalculando summaries de ${affectedMonths.size} meses...`
    );

    for (const monthKey of affectedMonths) {
      try {
        await recalculateSummary(monthKey);
        functions.logger.info(`[deletePanel] ✓ Summary recalculado: ${monthKey}`);
      } catch (error) {
        functions.logger.error(
          `[deletePanel] ⚠️ Error al recalcular summary ${monthKey}:`,
          error
        );
        // No propagamos el error para no fallar toda la operación
      }
    }

    // 7. Log de auditoría
    const auditLog = {
      action: "DELETE_PANEL",
      panelId,
      codigo: codigoPanelReal,
      municipio: panelData.municipioId || panelData.municipio || "unknown",
      deletedBy: userEmail,
      deletedAt: admin.firestore.Timestamp.now(),
      affectedMonths: Array.from(affectedMonths),
      eventsDeleted: eventsSnapshot.size,
      billingDocsDeleted: billingSnapshot.size,
    };

    await db.collection("auditLogs").add(auditLog);
    functions.logger.info(`[deletePanel] ✓ Audit log registrado`);

    functions.logger.info(
      `[deletePanel] ✅ Panel ${panelId} eliminado completamente por ${userEmail}`
    );

    return {
      success: true,
      message: `Panel ${codigoPanelReal} eliminado completamente`,
      details: {
        panelId,
        codigo: codigoPanelReal,
        eventsDeleted: eventsSnapshot.size,
        billingDocsDeleted: billingSnapshot.size,
        affectedMonths: Array.from(affectedMonths),
      },
    };
  });
