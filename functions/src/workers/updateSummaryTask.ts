import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { recalculateSummary } from "../lib/summaryCalculations";

interface UpdateSummaryPayload {
  monthKey: string;
}

/**
 * HTTP Function: updateSummaryTask
 * 
 * Esta función sirve como handler para la cola de Cloud Tasks "update-summary".
 * Recalcula los totales agregados del mes (billingSummary) basándose en los datos
 * de billingMonthlyPanel.
 * 
 * IMPORTANTE: NO usa FieldValue.increment() para evitar drift.
 * En su lugar, realiza consultas agregadas (sum, count) y sobrescribe el documento
 * con valores exactos.
 * 
 * PROCESO:
 * 1. Lee todos los billingMonthlyPanel del mes (monthKey)
 * 2. Calcula totales exactos mediante agregación:
 *    - totalImporteMes: sum(totalImporte)
 *    - totalPanelesFacturables: count(*) where totalImporte > 0
 *    - panelesActivos: count(*) where totalDiasFacturables >= 30
 *    - panelesParciales: count(*) where 0 < totalDiasFacturables < 30
 * 3. Cuenta total de eventos del mes (panelEvents)
 * 4. Sobrescribe billingSummary/{monthKey} con valores exactos
 * 
 * @param req - Request de Cloud Tasks
 * @param res - Response
 */
export const updateSummaryTask = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos (por si hay muchos paneles)
    memory: "1GB",
  })
  .https.onRequest(async (req, res) => {
    // 1. Validar método HTTP
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // 2. Validar autenticación (OIDC token)
    // Firebase Functions valida automáticamente el OIDC token cuando se configura en Cloud Tasks

    // 3. Parsear el payload
    let payload: UpdateSummaryPayload;

    try {
      payload = JSON.parse(
        Buffer.from(req.body, "base64").toString("utf-8")
      ) as UpdateSummaryPayload;
    } catch (error) {
      functions.logger.error("Error al parsear el payload:", error);
      res.status(400).send("Bad Request: Invalid payload");
      return;
    }

    const { monthKey } = payload;

    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      functions.logger.error("monthKey inválido:", monthKey);
      res.status(400).send("Bad Request: Invalid monthKey");
      return;
    }

    functions.logger.info(`[updateSummaryTask] Recalculando billingSummary para ${monthKey}`);

    try {
      await recalculateSummary(monthKey);

      functions.logger.info(`[updateSummaryTask] billingSummary actualizado para ${monthKey}`);

      // Responder con 200 OK
      res.status(200).send({
        success: true,
        monthKey,
        message: "Summary updated successfully",
      });
    } catch (error) {
      functions.logger.error("[updateSummaryTask] Error al actualizar summary:", error);

      // Responder con 500 para que Cloud Tasks reintente la tarea
      res.status(500).send({
        success: false,
        error: "Internal Server Error",
        message: (error as Error).message,
      });
    }
  });
