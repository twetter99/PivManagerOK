import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsEditorOrAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";

// Schema de validación para la solicitud de intervención
const CreateIntervencionSchema = z.object({
  panelId: z.string().min(1, "El panelId es obligatorio"),
  effectiveDateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  tipoIntervencion: z.enum(["REPARACION", "INSTALACION", "MANTENIMIENTO", "VANDALISMO", "OTRO"]),
  concepto: z.string().min(1, "El concepto es obligatorio").max(500, "El concepto es demasiado largo"),
  importe: z.number().refine(val => val !== 0, "El importe no puede ser 0"),
  evidenciaUrl: z.string().url().nullish(), // Acepta string, null o undefined
});

type CreateIntervencionData = z.infer<typeof CreateIntervencionSchema>;

/**
 * Callable Function: createIntervencion
 * 
 * Registra una intervención puntual en un panel (reparación, vandalismo, etc.)
 * Las intervenciones son "stateless": NO cambian el estado del panel, solo suman/restan
 * al importe total del mes en curso.
 * 
 * Flujo:
 * 1. Valida permisos (editor/admin)
 * 2. Valida que el mes no esté cerrado
 * 3. Verifica que el panel existe
 * 4. Crea el evento INTERVENCION en Firestore
 * 5. Recalcula el mes sincrónicamente
 * 
 * @param data - Datos de la intervención (panelId, fecha, tipo, concepto, importe)
 * @param context - Contexto de autenticación
 * @returns { status: "ok", eventId: string }
 */
export const createIntervencion = functions
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

    // 2. Validar el payload contra el schema de Zod
    const parseResult = CreateIntervencionSchema.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { panelId, effectiveDateLocal, tipoIntervencion, concepto, importe, evidenciaUrl } = parseResult.data;

    const db = admin.firestore();

    // Extraer monthKey de la fecha (YYYY-MM)
    const monthKey = effectiveDateLocal.substring(0, 7);

    functions.logger.info(`[createIntervencion] Iniciando: ${panelId} / ${monthKey} / ${tipoIntervencion} / ${importe}€`);

    // 3. Validar que el monthKey no esté bloqueado
    const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();

    if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El mes ${monthKey} está cerrado y no se pueden crear nuevas intervenciones.`
      );
    }

    // 4. Verificar que el panel existe
    const panelDoc = await db.collection("panels").doc(panelId).get();
    
    if (!panelDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `Panel ${panelId} no encontrado`
      );
    }

    const panelData = panelDoc.data()!;

    // 5. Obtener el día del mes (1-31)
    const dayOfMonth = parseInt(effectiveDateLocal.substring(8, 10), 10);

    // 6. Crear el evento INTERVENCION en Firestore
    const idempotencyKey = uuidv4();
    const eventRef = db.collection("panels").doc(panelId).collection("panelEvents").doc();

    const eventData = {
      action: "INTERVENCION",
      effectiveDate: admin.firestore.Timestamp.fromDate(new Date(effectiveDateLocal)),
      effectiveDateLocal,
      monthKey,
      
      // Para intervenciones, diasFacturables es 0 (no afecta días)
      diasFacturables: 0,
      importeAFacturar: 0, // No se usa este campo para intervenciones
      
      // Campos específicos de intervención
      tipoIntervencion,
      concepto,
      evidenciaUrl: evidenciaUrl || null,
      
      // Snapshot AFTER contiene el importe de la intervención
      snapshotBefore: null,
      snapshotAfter: {
        importeAjuste: importe, // Usamos importeAjuste para el importe de la intervención
        codigo: panelData.codigo,
        ubicacion: panelData.ubicacion || panelData.municipioId,
      },
      
      idempotencyKey,
      isDeleted: false,
      
      createdAt: timestamp,
      createdBy: userEmail,
      updatedAt: timestamp,
      schemaVersion: 1,
    };

    await eventRef.set(eventData);

    functions.logger.info(`[createIntervencion] Evento creado: ${eventRef.id}`);

    // 7. Recalcular el mes sincrónicamente
    try {
      await recalculatePanelMonth(panelId, monthKey);
      functions.logger.info(`[createIntervencion] Recálculo completado para ${panelId} / ${monthKey}`);
    } catch (error) {
      functions.logger.error(`[createIntervencion] Error en recálculo:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "La intervención se creó pero hubo un error al recalcular la facturación."
      );
    }

    // 8. Log de auditoría
    functions.logger.info(
      `[createIntervencion] ✅ Intervención registrada por ${userEmail}: ` +
      `${tipoIntervencion} en panel ${panelData.codigo} (${effectiveDateLocal}) → ${importe}€`
    );

    return {
      status: "ok",
      eventId: eventRef.id,
      idempotencyKey,
    };
  });
