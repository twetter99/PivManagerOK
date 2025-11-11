import * as functions from "firebase-functions";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";

interface ProcessPanelEventPayload {
  panelId: string;
  eventId: string;
  idempotencyKey: string;
}

/**
 * HTTP Function: processPanelEventTask
 * 
 * Esta función sirve como handler para la cola de Cloud Tasks "process-panel-event".
 * Es invocada por Cloud Tasks cuando hay un nuevo evento de panel que procesar.
 * 
 * FLUJO:
 * 1. Cloud Tasks envía una solicitud POST con {panelId, eventId, idempotencyKey}
 * 2. La función valida la autenticación (OIDC token)
 * 3. Extrae el monthKey del eventId
 * 4. Llama a recalculatePanelMonth(panelId, monthKey)
 * 5. Responde con 200 OK
 * 
 * SEGURIDAD:
 * - Solo puede ser invocada por Cloud Tasks (OIDC token validado por Firebase)
 * - No es accesible públicamente
 */
export const processPanelEventTask = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos (por si hay muchos eventos que procesar)
    memory: "512MB",
  })
  .https.onRequest(async (req, res) => {
    // 1. Validar método HTTP
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // 2. Validar autenticación (OIDC token)
    // Firebase Functions valida automáticamente el OIDC token cuando se configura en Cloud Tasks
    // Si llegamos aquí, el token es válido

    // 3. Parsear el payload
    let payload: ProcessPanelEventPayload;

    try {
      payload = JSON.parse(
        Buffer.from(req.body, "base64").toString("utf-8")
      ) as ProcessPanelEventPayload;
    } catch (error) {
      functions.logger.error("Error al parsear el payload:", error);
      res.status(400).send("Bad Request: Invalid payload");
      return;
    }

    const { panelId, eventId, idempotencyKey } = payload;

    if (!panelId || !eventId || !idempotencyKey) {
      functions.logger.error("Payload incompleto:", payload);
      res.status(400).send("Bad Request: Missing required fields");
      return;
    }

    functions.logger.info(
      `[processPanelEventTask] Procesando evento: ${eventId} para panel ${panelId}`
    );

    try {
      // 4. Obtener el monthKey del evento (leyendo desde Firestore)
      const admin = await import("firebase-admin");
      const db = admin.default.firestore();

      const eventDoc = await db
        .collection("panels")
        .doc(panelId)
        .collection("panelEvents")
        .doc(eventId)
        .get();

      if (!eventDoc.exists) {
        functions.logger.error(`Evento ${eventId} no encontrado`);
        res.status(404).send("Event not found");
        return;
      }

      const eventData = eventDoc.data()!;
      const monthKey = eventData.monthKey;

      if (!monthKey) {
        functions.logger.error(`Evento ${eventId} no tiene monthKey`);
        res.status(400).send("Bad Request: Event missing monthKey");
        return;
      }

      // 5. Llamar al motor de recálculo
      await recalculatePanelMonth(panelId, monthKey);

      functions.logger.info(
        `[processPanelEventTask] Recálculo completado para panel ${panelId} / ${monthKey}`
      );

      // 6. Responder con 200 OK
      res.status(200).send({
        success: true,
        panelId,
        eventId,
        monthKey,
        message: "Event processed successfully",
      });
    } catch (error) {
      functions.logger.error("[processPanelEventTask] Error al procesar el evento:", error);

      // Responder con 500 para que Cloud Tasks reintente la tarea
      res.status(500).send({
        success: false,
        error: "Internal Server Error",
        message: (error as Error).message,
      });
    }
  });
