import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";
import { recalculatePanelMonth } from "../workers/recalculatePanelMonth";
import { eurosToCents, centsToEuros, sumImportesCents } from "../lib/moneyUtils";

/**
 * Schema de validación para regenerateMonthBilling
 */
const RegenerateMonthRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Formato de monthKey inválido (YYYY-MM)"),
});

/**
 * Callable Function: regenerateMonthBilling
 * 
 * Regenera la facturación de TODOS los paneles para un mes específico.
 * Útil para:
 * - Aplicar correcciones de cálculo a un mes completo
 * - Regenerar meses futuros (noviembre, diciembre, etc.)
 * - Recalcular después de modificar reglas de negocio
 * 
 * Proceso:
 * 1. Valida que el usuario sea admin
 * 2. Obtiene todos los paneles activos de la colección 'panels'
 * 3. Para cada panel, ejecuta recalculatePanelMonth(panelId, monthKey)
 * 4. Al final, actualiza billingSummary automáticamente
 * 
 * @param data - { monthKey: "YYYY-MM" }
 * @param context - Contexto de autenticación
 * @returns { success: true, totalPanels: number, processed: number, errors: string[] }
 */
export const regenerateMonthBilling = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540, // 9 minutos para procesar todos los paneles
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea admin
    await assertIsAdmin(context);

    // 2. Validar el payload
    const parseResult = RegenerateMonthRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors
        .map((e: any) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey } = parseResult.data;

    functions.logger.info(
      `[regenerateMonthBilling] Iniciando regeneración de facturación para ${monthKey}`
    );

    const db = admin.firestore();
    const errors: string[] = [];
    let processed = 0;

    try {
      // 3. Obtener todos los paneles
      const panelsSnapshot = await db.collection("panels").get();
      const totalPanels = panelsSnapshot.size;

      functions.logger.info(
        `[regenerateMonthBilling] Encontrados ${totalPanels} paneles para procesar`
      );

      if (totalPanels === 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "No se encontraron paneles en la base de datos"
        );
      }

      // 4. Procesar cada panel (en lotes para evitar timeout)
      const BATCH_SIZE = 50; // Procesar 50 paneles a la vez
      const panelDocs = panelsSnapshot.docs;

      for (let i = 0; i < panelDocs.length; i += BATCH_SIZE) {
        const batch = panelDocs.slice(i, i + BATCH_SIZE);
        
        // Procesar batch en paralelo
        await Promise.allSettled(
          batch.map(async (panelDoc) => {
            const panelId = panelDoc.id;
            try {
              await recalculatePanelMonth(panelId, monthKey);
              processed++;
              
              // Log progreso cada 50 paneles
              if (processed % 50 === 0) {
                functions.logger.info(
                  `[regenerateMonthBilling] Progreso: ${processed}/${totalPanels} paneles procesados`
                );
              }
            } catch (error) {
              const errorMsg = `Panel ${panelId}: ${(error as Error).message}`;
              errors.push(errorMsg);
              functions.logger.error(
                `[regenerateMonthBilling] Error procesando panel ${panelId}:`,
                error
              );
            }
          })
        );
      }

      functions.logger.info(
        `[regenerateMonthBilling] Regeneración completada: ${processed}/${totalPanels} paneles procesados correctamente`
      );

      // 5. Calcular billingSummary inmediatamente después de la regeneración
      functions.logger.info(`[regenerateMonthBilling] Calculando billingSummary para ${monthKey}...`);
      
      const billingSnapshot = await db
        .collection("billingMonthlyPanel")
        .where("monthKey", "==", monthKey)
        .get();

      const importesCents: number[] = [];
      let totalPanelesFacturables = 0;
      let panelesActivos = 0;
      let panelesParciales = 0;

      for (const doc of billingSnapshot.docs) {
        const data = doc.data();
        const diasFacturables = data.totalDiasFacturables || 0;
        const importe = data.totalImporte || 0;

        if (importe > 0) {
          importesCents.push(eurosToCents(importe));
          totalPanelesFacturables++;
        }

        if (diasFacturables >= 30) {
          panelesActivos++;
        } else if (diasFacturables > 0) {
          panelesParciales++;
        }
      }

      // Sumar con precisión de céntimos y normalizar a 2 decimales
      // Consistente con summaryCalculations.ts
      const totalImporteCents = sumImportesCents(importesCents);
      const totalImporteMes = Math.round(centsToEuros(totalImporteCents) * 100) / 100;

      // Nota: totalEventos se calcula posteriormente de forma asíncrona por updateSummaryTask
      const totalEventos = 0;

      // Obtener isLocked actual si existe
      const currentSummary = await db.collection("billingSummary").doc(monthKey).get();
      const isLocked = currentSummary.exists ? currentSummary.data()!.isLocked || false : false;

      // Guardar billingSummary
      await db.collection("billingSummary").doc(monthKey).set({
        monthKey,
        totalImporteMes,
        totalPanelesFacturables,
        panelesActivos,
        panelesParciales,
        totalEventos,
        isLocked,
        updatedAt: admin.firestore.Timestamp.now(),
        schemaVersion: 1,
      });

      functions.logger.info(
        `[regenerateMonthBilling] billingSummary actualizado: ${totalImporteMes}€, ${totalPanelesFacturables} paneles`
      );

      // 6. Retornar resultado
      return {
        success: true,
        monthKey,
        totalPanels,
        processed,
        summary: {
          totalImporteMes,
          totalPanelesFacturables,
          panelesActivos,
          panelesParciales,
          totalEventos,
        },
        errors: errors.length > 0 ? errors : undefined,
        message:
          errors.length === 0
            ? `Facturación regenerada correctamente para ${monthKey}`
            : `Facturación regenerada con ${errors.length} errores`,
      };
    } catch (error) {
      functions.logger.error(
        `[regenerateMonthBilling] Error fatal durante la regeneración:`,
        error
      );
      throw new functions.https.HttpsError(
        "internal",
        `Error al regenerar la facturación: ${(error as Error).message}`
      );
    }
  });
