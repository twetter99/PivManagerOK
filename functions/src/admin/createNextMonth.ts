import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";

const CreateNextMonthRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "El monthKey debe tener formato YYYY-MM"),
});

/**
 * Callable Function: createNextMonth
 * 
 * Crea un nuevo mes usando la MISMA lógica que regenerateMonthBilling.
 * 
 * PROCESO (idéntico a regenerateMonthBilling):
 * 1. Lee TODOS los paneles de la colección 'panels'
 * 2. Para cada panel, ejecuta recalculatePanelMonth(panelId, newMonthKey)
 * 3. recalculatePanelMonth automáticamente:
 *    - Lee el billingMonthlyPanel del mes anterior
 *    - Hereda el estadoAlCierre (ACTIVO, DESMONTADO, BAJA)
 *    - Inicia con 0 días, 0€
 *    - Aplica eventos del mes nuevo si existen
 *    - Calcula facturación según reglas de negocio
 * 4. Actualiza billingSummary con los totales
 * 
 * VENTAJA: Consistencia total con regenerateMonthBilling
 * 
 * @param data - { monthKey: "YYYY-MM" } - El mes NUEVO a crear
 * @param context - Contexto de autenticación
 * @returns { success: true, monthKey: string, panelsProcessed: number }
 */
export const createNextMonth = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el llamante sea admin
    assertIsAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar los datos de entrada
    const parseResult = CreateNextMonthRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => e.message).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey: newMonthKey } = parseResult.data;

    functions.logger.info(`[createNextMonth] Creando mes ${newMonthKey} por ${userEmail}`);

    const db = admin.firestore();

    // 3. Verificar que el mes nuevo no exista ya
    const existingSummary = await db.collection("billingSummary").doc(newMonthKey).get();
    if (existingSummary.exists) {
      throw new functions.https.HttpsError(
        "already-exists",
        `El mes ${newMonthKey} ya existe. No se puede crear de nuevo.`
      );
    }

    // 4. Calcular el mes anterior para verificación
    const [year, month] = newMonthKey.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const previousMonthKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    functions.logger.info(`[createNextMonth] Verificando mes anterior: ${previousMonthKey}`);

    // Verificar que exista el mes anterior
    const previousSummary = await db.collection("billingSummary").doc(previousMonthKey).get();
    if (!previousSummary.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `El mes anterior (${previousMonthKey}) no existe. No se puede crear ${newMonthKey}.`
      );
    }

    // 5. Crear billingSummary inicial (se recalculará después)
    await db.collection("billingSummary").doc(newMonthKey).set({
      monthKey: newMonthKey,
      totalImporteMes: 0,
      totalPanelesFacturables: 0,
      panelesActivos: 0,
      panelesParciales: 0,
      totalEventos: 0,
      isLocked: false,
      updatedAt: timestamp,
      schemaVersion: 1,
    });

    functions.logger.info(`[createNextMonth] billingSummary inicial creado para ${newMonthKey}`);

    // 6. Leer TODOS los paneles de la colección 'panels' (igual que regenerateMonthBilling)
    const panelsSnapshot = await db.collection("panels").get();
    const totalPanels = panelsSnapshot.size;

    functions.logger.info(
      `[createNextMonth] Encontrados ${totalPanels} paneles para procesar con recalculatePanelMonth`
    );

    if (totalPanels === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No se encontraron paneles en la base de datos"
      );
    }

    // 7. Procesar cada panel con recalculatePanelMonth (igual que regenerateMonthBilling)
    const BATCH_SIZE = 50; // Procesar 50 paneles a la vez
    const panelDocs = panelsSnapshot.docs;
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < panelDocs.length; i += BATCH_SIZE) {
      const batch = panelDocs.slice(i, i + BATCH_SIZE);
      
      // Procesar batch en paralelo
      await Promise.allSettled(
        batch.map(async (panelDoc) => {
          const panelId = panelDoc.id;
          try {
            await recalculatePanelMonth(panelId, newMonthKey);
            processed++;
            
            // Log progreso cada 50 paneles
            if (processed % 50 === 0) {
              functions.logger.info(
                `[createNextMonth] Progreso: ${processed}/${totalPanels} paneles procesados`
              );
            }
          } catch (error) {
            const errorMsg = `Panel ${panelId}: ${(error as Error).message}`;
            errors.push(errorMsg);
            functions.logger.error(
              `[createNextMonth] Error procesando panel ${panelId}:`,
              error
            );
          }
        })
      );
    }

    functions.logger.info(
      `[createNextMonth] Procesamiento completado: ${processed}/${totalPanels} paneles`
    );

    // 8. El billingSummary ya está actualizado por recalculatePanelMonth (llama a recalculateSummary)
    // Solo logueamos el resumen final
    const finalSummary = await db.collection("billingSummary").doc(newMonthKey).get();
    const summaryData = finalSummary.data();

    functions.logger.info(
      `[createNextMonth] Mes ${newMonthKey} creado exitosamente:\n` +
      `  - Paneles procesados: ${processed}/${totalPanels}\n` +
      `  - Total facturación: ${summaryData?.totalImporteMes || 0}€\n` +
      `  - Paneles facturables: ${summaryData?.totalPanelesFacturables || 0}\n` +
      `  - Paneles activos: ${summaryData?.panelesActivos || 0}\n` +
      `  - Paneles parciales: ${summaryData?.panelesParciales || 0}`
    );

    return {
      success: true,
      monthKey: newMonthKey,
      previousMonthKey,
      panelsProcessed: processed,
      totalPanels,
      summary: {
        totalImporteMes: summaryData?.totalImporteMes || 0,
        totalPanelesFacturables: summaryData?.totalPanelesFacturables || 0,
        panelesActivos: summaryData?.panelesActivos || 0,
        panelesParciales: summaryData?.panelesParciales || 0,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
  });
