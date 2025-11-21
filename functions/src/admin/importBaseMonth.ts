import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin, getUserEmail, now, dateToTimestamp, getMonthKey } from "../lib/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

// Schema de validación para cada panel en el CSV
const PanelDataSchema = z.object({
  codigo: z.string().min(1),
  municipioId: z.string().min(1),
  municipioNombre: z.string().min(1),
  tarifaBaseMes: z.number().positive(),
  ubicacion: z.string().optional(),
  tipo: z.string().optional(),
  fechaAlta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "YYYY-MM-DD"
  diasFacturables: z.number().int().min(0).max(31),
  importeAFacturar: z.number().min(0),
});

// Schema de la solicitud completa
const ImportBaseMonthRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "El monthKey debe tener formato YYYY-MM"),
  data: z.array(PanelDataSchema).min(1, "Debe proporcionar al menos un panel"),
});

type PanelData = z.infer<typeof PanelDataSchema>;
type ImportBaseMonthRequestData = z.infer<typeof ImportBaseMonthRequest>;

const BATCH_SIZE = 120; // Lotes de 120 paneles (4 documentos por panel = 480 operaciones)

/**
 * Callable Function: importBaseMonth
 * 
 * Importa masivamente paneles desde un CSV, creando 4 documentos por panel:
 * - panels/{panelId}
 * - panelCodes/{codigo}
 * - panelEvents/{eventId} (ALTA_INICIAL)
 * - billingMonthlyPanel/{panelId}_{YYYYMM}
 * 
 * Al final, calcula los totales y crea billingSummary/{YYYYMM}
 * 
 * @param data - { monthKey: "YYYY-MM", data: PanelData[] }
 * @param context - Contexto de autenticación
 * @returns { success: true, panelsCreated: number, monthKey: string }
 * 
 * Timeout: 9 minutos
 * Batched Writes: 120 paneles por lote
 */
export const importBaseMonth = functions
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
    const parseResult = ImportBaseMonthRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => e.message).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey, data: panels } = parseResult.data;

    functions.logger.info(
      `Iniciando importación de ${panels.length} paneles para el mes ${monthKey} por ${userEmail}`
    );

    const db = admin.firestore();

    // 3. Variables para acumular totales
    let totalImporteMes = 0;
    let totalPanelesFacturables = 0;
    let panelesActivos = 0; // días >= 30
    let panelesParciales = 0; // días > 0 y < 30
    let totalEventos = 0;

    // 4. Procesar en lotes de 120 paneles
    const batches = Math.ceil(panels.length / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchEnd = Math.min((i + 1) * BATCH_SIZE, panels.length);
      const batchPanels = panels.slice(batchStart, batchEnd);

      functions.logger.info(`Procesando lote ${i + 1}/${batches} (${batchPanels.length} paneles)`);

      const batch = db.batch();

      for (const panel of batchPanels) {
        const panelId = db.collection("panels").doc().id;
        const eventId = uuidv4();
        const effectiveDate = dateToTimestamp(panel.fechaAlta);

        // --- 1. Documento en panels/{panelId} ---
        const panelRef = db.collection("panels").doc(panelId);
        batch.set(panelRef, {
          codigo: panel.codigo,
          municipioId: panel.municipioId,
          estadoActual: "ACTIVO",
          tarifaBaseMes: panel.tarifaBaseMes,
          ubicacion: panel.ubicacion || "",
          tipo: panel.tipo || "",
          createdAt: timestamp,
          createdBy: userEmail,
          updatedAt: timestamp,
          schemaVersion: 1,
        });

        // --- 2. Documento en panelCodes/{codigo} (candado de unicidad) ---
        const panelCodeRef = db.collection("panelCodes").doc(panel.codigo);
        batch.set(panelCodeRef, {
          panelId,
        });

        // --- 3. Documento en panelEvents/{eventId} (subcolección) ---
        const eventRef = db
          .collection("panels")
          .doc(panelId)
          .collection("panelEvents")
          .doc(eventId);

        batch.set(eventRef, {
          action: "ALTA_INICIAL",
          effectiveDate,
          effectiveDateLocal: panel.fechaAlta,
          monthKey: getMonthKey(panel.fechaAlta),
          diasFacturables: panel.diasFacturables,
          importeAFacturar: panel.importeAFacturar,
          motivo: "Importación masiva inicial",
          snapshotBefore: {},
          snapshotAfter: {
            codigo: panel.codigo,
            estadoActual: "ACTIVO",
            tarifaBaseMes: panel.tarifaBaseMes,
          },
          idempotencyKey: eventId,
          isDeleted: false,
          createdAt: timestamp,
          createdBy: userEmail,
          updatedAt: timestamp,
          schemaVersion: 1,
        });

        // --- 4. Documento en billingMonthlyPanel/{panelId}_{YYYYMM} ---
        const billingDocId = `${panelId}_${monthKey}`;
        const billingRef = db.collection("billingMonthlyPanel").doc(billingDocId);

        batch.set(billingRef, {
          panelId,
          monthKey,
          codigo: panel.codigo,
          municipio: panel.municipioNombre,
          totalDiasFacturables: panel.diasFacturables,
          totalImporte: panel.importeAFacturar,
          estadoAlCierre: "ACTIVO",
          tarifaAplicada: panel.tarifaBaseMes,
          updatedAt: timestamp,
          schemaVersion: 1,
        });

        // Acumular totales
        totalImporteMes += panel.importeAFacturar;
        totalEventos++;

        if (panel.diasFacturables > 0) {
          totalPanelesFacturables++;
        }

        if (panel.diasFacturables >= 30) {
          panelesActivos++;
        } else if (panel.diasFacturables > 0) {
          panelesParciales++;
        }
      }

      // Commit del lote
      await batch.commit();
      functions.logger.info(`Lote ${i + 1}/${batches} completado`);
    }

    // 5. Crear el documento billingSummary/{YYYYMM}
    functions.logger.info(`Creando billingSummary/${monthKey} con los totales`);

    await db.collection("billingSummary").doc(monthKey).set({
      monthKey,
      totalImporteMes,
      totalPanelesFacturables,
      panelesActivos,
      panelesParciales,
      totalEventos,
      isLocked: false,
      updatedAt: timestamp,
      schemaVersion: 1,
    });

    functions.logger.info(
      `Importación completada: ${panels.length} paneles, ${totalImporteMes.toFixed(2)}€`
    );

    return {
      success: true,
      panelsCreated: panels.length,
      monthKey,
      totalImporteMes,
      totalPanelesFacturables,
      panelesActivos,
      panelesParciales,
    };
  });
