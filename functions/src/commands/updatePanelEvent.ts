import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { CloudTasksClient } from "@google-cloud/tasks";
import { assertIsEditorOrAdmin, getUserEmail, now } from "../lib/utils";
import { PanelSnapshot } from "../lib/schemas";
import { z } from "zod";

// Schema de validación para snapshots
const PanelSnapshotSchema = z.object({
  estadoActual: z.enum(["ACTIVO", "DESMONTADO", "BAJA"]).optional(),
  estadoAlCierre: z.enum(["ACTIVO", "DESMONTADO", "BAJA"]).optional(),
  tarifaBaseMes: z.number().positive().optional(),
  tarifaAplicada: z.number().positive().optional(),
  importeAjuste: z.number().optional(),
  codigo: z.string().optional(),
  municipio: z.string().optional(),
  ubicacion: z.string().optional(),
  diasFacturables: z.number().int().optional(),
  totalImporte: z.number().optional(),
}).passthrough();

// Schema de validación para updatePanelEvent
const UpdatePanelEventRequest = z.object({
  panelId: z.string().min(1, "El panelId es obligatorio"),
  eventId: z.string().min(1, "El eventId es obligatorio"),
  updates: z.object({
    motivo: z.string().optional(),
    diasFacturables: z.number().int().min(0).max(31).optional(),
    importeAFacturar: z.number().min(0).optional(),
    // Permitir actualizar snapshots si es necesario (tipados)
    snapshotBefore: PanelSnapshotSchema.nullable().optional(),
    snapshotAfter: PanelSnapshotSchema.nullable().optional(),
  }).refine(
    (data) => Object.keys(data).length > 0,
    "Debe proporcionar al menos un campo para actualizar"
  ),
});

const tasksClient = new CloudTasksClient();

/**
 * Callable Function: updatePanelEvent
 * 
 * Actualiza un evento de panel existente.
 * Permite modificar motivo, diasFacturables, importeAFacturar y snapshots.
 * Después de actualizar, encola una tarea para recalcular el mes.
 * 
 * PROCESO:
 * 1. Valida que el usuario sea editor o admin
 * 2. Verifica que el evento exista y no esté eliminado
 * 3. Verifica que el mes no esté bloqueado
 * 4. Actualiza los campos especificados en el evento
 * 5. Encola una tarea processPanelEventTask para recalcular
 * 
 * @param data - { panelId: string, eventId: string, updates: {...} }
 * @param context - Contexto de autenticación
 * @returns { success: true, eventId: string }
 */
export const updatePanelEvent = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea editor o admin
    assertIsEditorOrAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar el payload
    const parseResult = UpdatePanelEventRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { panelId, eventId, updates } = parseResult.data;

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

    // Verificar que no esté eliminado
    if (eventData.isDeleted === true) {
      throw new functions.https.HttpsError("failed-precondition", "No se puede actualizar un evento eliminado");
    }

    const monthKey = eventData.monthKey;

    // 4. Verificar que el mes no esté bloqueado
    const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
    if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El mes ${monthKey} está cerrado y no se pueden actualizar eventos`
      );
    }

    // 5. Preparar los campos a actualizar
    const updateData: any = {
      updatedAt: timestamp,
      updatedBy: userEmail,
    };

    // Copiar solo los campos proporcionados en updates
    if (updates.motivo !== undefined) {
      updateData.motivo = updates.motivo;
    }

    if (updates.diasFacturables !== undefined) {
      updateData.diasFacturables = updates.diasFacturables;
    }

    if (updates.importeAFacturar !== undefined) {
      updateData.importeAFacturar = updates.importeAFacturar;
    }

    if (updates.snapshotBefore !== undefined) {
      updateData.snapshotBefore = updates.snapshotBefore;
    }

    if (updates.snapshotAfter !== undefined) {
      updateData.snapshotAfter = updates.snapshotAfter;
    }

    // 6. Actualizar el evento
    await eventRef.update(updateData);

    functions.logger.info(
      `Evento ${eventId} actualizado por ${userEmail}. Campos: ${Object.keys(updates).join(", ")}`
    );

    // 7. Encolar tarea para recalcular el mes
    try {
      await enqueueProcessPanelEventTask(panelId, eventId, eventData.idempotencyKey || eventId);
      functions.logger.info(`Tarea de recálculo encolada para panel ${panelId}`);
    } catch (error) {
      functions.logger.error("Error al encolar tarea de recálculo:", error);
      // No lanzamos error porque la actualización ya se realizó
    }

    // 8. Responder
    return {
      success: true,
      eventId,
      message: "Evento actualizado correctamente",
    };
  });

/**
 * Encola una tarea en Cloud Tasks para procesar el evento de panel.
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

  // Usar idempotencyKey + timestamp para permitir múltiples recálculos
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
