import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { CloudTasksClient } from "@google-cloud/tasks";
import { assertIsEditorOrAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";

// Schema de validación para deletePanelEvent
const DeletePanelEventRequest = z.object({
  panelId: z.string().min(1, "El panelId es obligatorio"),
  eventId: z.string().min(1, "El eventId es obligatorio"),
});

const tasksClient = new CloudTasksClient();

/**
 * Callable Function: deletePanelEvent
 * 
 * Realiza un soft-delete de un evento de panel.
 * NO borra el documento físicamente, sino que marca isDeleted: true.
 * Esto preserva la auditoría y permite recuperar eventos si es necesario.
 * 
 * PROCESO:
 * 1. Valida que el usuario sea editor o admin
 * 2. Actualiza el evento con isDeleted: true, deletedAt, deletedBy
 * 3. Encola una tarea processPanelEventTask para recalcular el mes
 * 
 * @param data - { panelId: string, eventId: string }
 * @param context - Contexto de autenticación
 * @returns { success: true, eventId: string }
 */
export const deletePanelEvent = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea editor o admin
    await assertIsEditorOrAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar el payload
    const parseResult = DeletePanelEventRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { panelId, eventId } = parseResult.data;

    const db = admin.firestore();
    const eventRef = db
      .collection("panels")
      .doc(panelId)
      .collection("panelEvents")
      .doc(eventId);

    // 3. Verificar que el evento existe
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError("not-found", `Evento ${eventId} no encontrado`);
    }

    const eventData = eventDoc.data()!;

    // Verificar que no esté ya eliminado
    if (eventData.isDeleted === true) {
      throw new functions.https.HttpsError("failed-precondition", "El evento ya está eliminado");
    }

    const monthKey = eventData.monthKey;

    // 4. Verificar que el mes no esté bloqueado
    const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
    if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El mes ${monthKey} está cerrado y no se pueden eliminar eventos`
      );
    }

    // 5. Actualizar el evento (soft-delete)
    await eventRef.update({
      isDeleted: true,
      deletedAt: timestamp,
      deletedBy: userEmail,
      updatedAt: timestamp,
      updatedBy: userEmail,
    });

    functions.logger.info(`Evento ${eventId} marcado como eliminado por ${userEmail}`);

    // 6. Encolar tarea para recalcular el mes
    try {
      await enqueueProcessPanelEventTask(panelId, eventId, eventData.idempotencyKey || eventId);
      functions.logger.info(`Tarea de recálculo encolada para panel ${panelId}`);
    } catch (error) {
      functions.logger.error("Error al encolar tarea de recálculo:", error);
      // No lanzamos error porque el soft-delete ya se realizó
    }

    // 7. Responder
    return {
      success: true,
      eventId,
      message: "Evento eliminado correctamente",
    };
  });

/**
 * Encola una tarea en Cloud Tasks para procesar el evento de panel.
 * Reutilizado de requestPanelChange.
 */
async function enqueueProcessPanelEventTask(
  panelId: string,
  eventId: string,
  idempotencyKey: string
): Promise<void> {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const location = "europe-west1";
  const queue = "process-panel-event";

  if (!project) {
    throw new Error("No se pudo determinar el ID del proyecto (GCLOUD_PROJECT)");
  }

  const parent = tasksClient.queuePath(project, location, queue);
  const url = `https://${location}-${project}.cloudfunctions.net/processPanelEventTask`;

  // Usar idempotencyKey + timestamp para evitar conflictos con tareas anteriores
  const taskId = `${idempotencyKey}-${Date.now()}`;

  const task = {
    name: `${parent}/tasks/${taskId}`,
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

  await tasksClient.createTask({ parent, task });
}
