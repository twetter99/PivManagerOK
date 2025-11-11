import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

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

/**
 * Recalcula el billingSummary de un mes basándose en los datos agregados
 * de billingMonthlyPanel y panelEvents.
 * 
 * NO usa FieldValue.increment() para evitar drift.
 * 
 * @param monthKey - Mes a recalcular en formato YYYY-MM
 */
async function recalculateSummary(monthKey: string): Promise<void> {
  const db = admin.firestore();

  // 1. Consultar todos los billingMonthlyPanel del mes
  const billingSnapshot = await db
    .collection("billingMonthlyPanel")
    .where("monthKey", "==", monthKey)
    .get();

  functions.logger.info(
    `[recalculateSummary] Paneles encontrados para ${monthKey}: ${billingSnapshot.size}`
  );

  // 2. Calcular totales mediante agregación manual
  let totalImporteMes = 0;
  let totalPanelesFacturables = 0;
  let panelesActivos = 0; // días >= 30
  let panelesParciales = 0; // 0 < días < 30

  for (const doc of billingSnapshot.docs) {
    const data = doc.data();
    const totalDiasFacturables = data.totalDiasFacturables || 0;
    const totalImporte = data.totalImporte || 0;

    // Acumular importe total
    totalImporteMes += totalImporte;

    // Contar paneles facturables (con importe > 0)
    if (totalImporte > 0) {
      totalPanelesFacturables++;
    }

    // Clasificar paneles según días facturables
    if (totalDiasFacturables >= 30) {
      panelesActivos++;
    } else if (totalDiasFacturables > 0) {
      panelesParciales++;
    }
  }

  // Redondear totalImporteMes a 2 decimales
  totalImporteMes = Math.round(totalImporteMes * 100) / 100;

  functions.logger.info(
    `[recalculateSummary] Totales calculados: ${totalImporteMes}€, ${totalPanelesFacturables} paneles, ` +
    `${panelesActivos} activos, ${panelesParciales} parciales`
  );

  // 3. Contar total de eventos del mes (de todos los paneles)
  // Usamos collectionGroup para consultar todos los panelEvents de todos los paneles
  const eventsSnapshot = await db
    .collectionGroup("panelEvents")
    .where("monthKey", "==", monthKey)
    .where("isDeleted", "==", false)
    .get();

  const totalEventos = eventsSnapshot.size;

  functions.logger.info(`[recalculateSummary] Total eventos del mes: ${totalEventos}`);

  // 4. Sobrescribir billingSummary/{monthKey} con valores exactos
  const summaryRef = db.collection("billingSummary").doc(monthKey);

  // Leer el documento actual para preservar isLocked si existe
  const currentSummary = await summaryRef.get();
  const isLocked = currentSummary.exists ? currentSummary.data()!.isLocked || false : false;

  await summaryRef.set({
    monthKey,
    totalImporteMes,
    totalPanelesFacturables,
    panelesActivos,
    panelesParciales,
    totalEventos,
    isLocked, // Preservar el estado de bloqueo
    updatedAt: admin.firestore.Timestamp.now(),
    schemaVersion: 1,
  });

  functions.logger.info(`[recalculateSummary] billingSummary/${monthKey} actualizado correctamente`);
}
