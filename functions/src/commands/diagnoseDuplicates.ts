import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";

const DiagnosticRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Formato de monthKey inválido (YYYY-MM)"),
});

interface DiagnosticResult {
  success: boolean;
  totalPanels: number;
  totalBillingDocs: number;
  duplicatedCodigosInPanels: number;
  duplicatedPanelIdsInBilling: number;
  duplicatedCodigosInBilling: number;
  samples: {
    panelDuplicates?: Array<{ codigo: string; panels: any[] }>;
    billingDuplicates?: Array<{ codigo: string; docs: any[] }>;
  };
  conclusion: string;
}

/**
 * Callable Function: diagnoseDuplicates
 * 
 * Diagnostica la causa raíz de los duplicados en el sistema de facturación.
 */
export const diagnoseDuplicates = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .https.onCall(async (data: unknown, context): Promise<DiagnosticResult> => {
    assertIsAdmin(context);

    const parseResult = DiagnosticRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors
        .map((e: any) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey } = parseResult.data;
    const db = admin.firestore();

    functions.logger.info(`[diagnoseDuplicates] Iniciando diagnóstico para ${monthKey}`);

    try {
      // 1. Analizar colección PANELS
      const panelsSnapshot = await db.collection("panels").get();
      const totalPanels = panelsSnapshot.size;

      const codigoToPanelIds = new Map<string, Array<{
        id: string;
        estadoActual: string;
        municipioId: string;
      }>>();

      panelsSnapshot.forEach((doc) => {
        const data = doc.data();
        const codigo = data.codigo;
        if (!codigoToPanelIds.has(codigo)) {
          codigoToPanelIds.set(codigo, []);
        }
        codigoToPanelIds.get(codigo)!.push({
          id: doc.id,
          estadoActual: data.estadoActual,
          municipioId: data.municipioId,
        });
      });

      const duplicatedCodigosInPanels = Array.from(codigoToPanelIds.entries())
        .filter(([_, panels]) => panels.length > 1);

      functions.logger.info(
        `[diagnoseDuplicates] Panels: ${totalPanels}, Códigos duplicados: ${duplicatedCodigosInPanels.length}`
      );

      // 2. Analizar billingMonthlyPanel
      const billingSnapshot = await db
        .collection("billingMonthlyPanel")
        .where("monthKey", "==", monthKey)
        .get();

      const totalBillingDocs = billingSnapshot.size;

      const panelIdToDocs = new Map<string, Array<{
        docId: string;
        codigo: string;
        dias: number;
        importe: number;
      }>>();

      const codigoToDocs = new Map<string, Array<{
        docId: string;
        panelId: string;
        dias: number;
        importe: number;
      }>>();

      billingSnapshot.forEach((doc) => {
        const data = doc.data();
        const panelId = data.panelId;
        const codigo = data.codigo;

        if (!panelIdToDocs.has(panelId)) {
          panelIdToDocs.set(panelId, []);
        }
        panelIdToDocs.get(panelId)!.push({
          docId: doc.id,
          codigo: codigo,
          dias: data.totalDiasFacturables,
          importe: data.totalImporte,
        });

        if (!codigoToDocs.has(codigo)) {
          codigoToDocs.set(codigo, []);
        }
        codigoToDocs.get(codigo)!.push({
          docId: doc.id,
          panelId: panelId,
          dias: data.totalDiasFacturables,
          importe: data.totalImporte,
        });
      });

      const duplicatedPanelIds = Array.from(panelIdToDocs.entries())
        .filter(([_, docs]) => docs.length > 1);

      const duplicatedCodigosInBilling = Array.from(codigoToDocs.entries())
        .filter(([_, docs]) => docs.length > 1);

      functions.logger.info(
        `[diagnoseDuplicates] Billing: ${totalBillingDocs}, ` +
        `PanelIds duplicados: ${duplicatedPanelIds.length}, ` +
        `Códigos duplicados: ${duplicatedCodigosInBilling.length}`
      );

      // 3. Determinar la conclusión
      let conclusion = "";
      if (duplicatedCodigosInPanels.length > 0) {
        conclusion =
          "❌ CAUSA RAÍZ: La colección PANELS tiene códigos duplicados. " +
          `${duplicatedCodigosInPanels.length} códigos tienen múltiples documentos. ` +
          "Cuando regenerateMonthBilling procesa todos los paneles, crea documentos de billing duplicados. " +
          "SOLUCIÓN: Limpiar duplicados en PANELS antes de regenerar.";
      } else if (duplicatedCodigosInBilling.length > 0 && duplicatedPanelIds.length === 0) {
        conclusion =
          "⚠️  SITUACIÓN: Hay códigos duplicados en billing pero NO en panels. " +
          "Posible causa: regeneración ejecutada múltiples veces o limpieza parcial de panels. " +
          "SOLUCIÓN: Limpiar billing y regenerar.";
      } else if (duplicatedPanelIds.length > 0) {
        conclusion =
          "❌ ERROR CRÍTICO: Mismo panelId con múltiples documentos de billing. " +
          "El docId debe ser ${panelId}_${monthKey} pero está generando duplicados. " +
          "SOLUCIÓN: Revisar lógica de recalculatePanelMonth.";
      } else {
        conclusion = "✅ No se detectaron duplicados.";
      }

      return {
        success: true,
        totalPanels,
        totalBillingDocs,
        duplicatedCodigosInPanels: duplicatedCodigosInPanels.length,
        duplicatedPanelIdsInBilling: duplicatedPanelIds.length,
        duplicatedCodigosInBilling: duplicatedCodigosInBilling.length,
        samples: {
          panelDuplicates: duplicatedCodigosInPanels.slice(0, 5).map(([codigo, panels]) => ({
            codigo,
            panels: panels.map(p => ({ id: p.id, estado: p.estadoActual })),
          })),
          billingDuplicates: duplicatedCodigosInBilling.slice(0, 5).map(([codigo, docs]) => ({
            codigo,
            docs: docs.map(d => ({ panelId: d.panelId, dias: d.dias, importe: d.importe })),
          })),
        },
        conclusion,
      };
    } catch (error) {
      functions.logger.error(`[diagnoseDuplicates] Error:`, error);
      throw new functions.https.HttpsError(
        "internal",
        `Error en diagnóstico: ${(error as Error).message}`
      );
    }
  });
