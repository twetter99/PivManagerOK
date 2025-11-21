import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";

/**
 * Schema de validación
 */
const CleanDuplicatesRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Formato de monthKey inválido (YYYY-MM)"),
  dryRun: z.boolean().optional(),
});

/**
 * Callable Function: cleanMonthDuplicates
 * 
 * Limpia paneles duplicados en billingMonthlyPanel para un mes específico.
 * Mantiene solo el documento más reciente para cada panelId.
 * 
 * @param data - { monthKey: "YYYY-MM", dryRun?: boolean }
 * @param context - Contexto de autenticación
 * @returns { success: true, totalFound: number, duplicates: number, deleted: number }
 */
export const cleanMonthDuplicates = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea admin
    await assertIsAdmin(context);

    // 2. Validar el payload
    const parseResult = CleanDuplicatesRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors
        .map((e: any) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey, dryRun = false } = parseResult.data;

    functions.logger.info(
      `[cleanMonthDuplicates] ${dryRun ? 'DRY RUN - ' : ''}Iniciando limpieza para ${monthKey}`
    );

    const db = admin.firestore();

    try {
      // 3. Obtener todos los documentos del mes
      const snapshot = await db
        .collection("billingMonthlyPanel")
        .where("monthKey", "==", monthKey)
        .get();

      const totalFound = snapshot.size;
      functions.logger.info(`[cleanMonthDuplicates] Documentos encontrados: ${totalFound}`);

      if (totalFound === 0) {
        return {
          success: true,
          message: `No se encontraron documentos para ${monthKey}`,
          totalFound: 0,
          duplicates: 0,
          deleted: 0,
        };
      }

      // 4. Agrupar por panelId
      const panelIdMap = new Map<string, Array<{
        docId: string;
        codigo: string;
        dias: number;
        importe: number;
        updatedAt: admin.firestore.Timestamp | undefined;
      }>>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const panelId = data.panelId;

        if (!panelIdMap.has(panelId)) {
          panelIdMap.set(panelId, []);
        }

        panelIdMap.get(panelId)!.push({
          docId: doc.id,
          codigo: data.codigo,
          dias: data.totalDiasFacturables,
          importe: data.totalImporte,
          updatedAt: data.updatedAt,
        });
      });

      functions.logger.info(`[cleanMonthDuplicates] Paneles únicos: ${panelIdMap.size}`);

      // 5. Identificar duplicados
      const toDelete: string[] = [];
      let duplicateCount = 0;

      for (const [panelId, docs] of panelIdMap.entries()) {
        if (docs.length > 1) {
          duplicateCount++;
          
          // Ordenar por updatedAt (más reciente primero)
          docs.sort((a, b) => {
            if (!a.updatedAt || !b.updatedAt) return 0;
            return b.updatedAt.seconds - a.updatedAt.seconds;
          });

          // Marcar todos excepto el más reciente para borrar
          for (let i = 1; i < docs.length; i++) {
            toDelete.push(docs[i].docId);
          }

          // Log de los primeros 5 casos
          if (duplicateCount <= 5) {
            functions.logger.info(
              `[cleanMonthDuplicates] Duplicado #${duplicateCount}: ${panelId} (${docs.length} docs) - ` +
              `Mantener: ${docs[0].docId} (${docs[0].dias}d, ${docs[0].importe}€), ` +
              `Borrar: ${docs.slice(1).map(d => d.docId).join(', ')}`
            );
          }
        }
      }

      functions.logger.info(
        `[cleanMonthDuplicates] Duplicados encontrados: ${duplicateCount} paneles, ${toDelete.length} documentos a eliminar`
      );

      // 6. Eliminar duplicados (si no es dry run)
      let deleted = 0;
      if (!dryRun && toDelete.length > 0) {
        const BATCH_SIZE = 500;

        for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const batchDocs = toDelete.slice(i, i + BATCH_SIZE);

          batchDocs.forEach((docId) => {
            batch.delete(db.collection("billingMonthlyPanel").doc(docId));
          });

          await batch.commit();
          deleted += batchDocs.length;

          functions.logger.info(
            `[cleanMonthDuplicates] Progreso: ${deleted}/${toDelete.length} eliminados`
          );
        }
      }

      const message = dryRun
        ? `DRY RUN: Se eliminarían ${toDelete.length} documentos duplicados`
        : `Limpieza completada: ${deleted} documentos duplicados eliminados`;

      return {
        success: true,
        message,
        totalFound,
        uniquePanels: panelIdMap.size,
        duplicates: duplicateCount,
        toDelete: toDelete.length,
        deleted: dryRun ? 0 : deleted,
      };
    } catch (error) {
      functions.logger.error(
        `[cleanMonthDuplicates] Error durante la limpieza:`,
        error
      );
      throw new functions.https.HttpsError(
        "internal",
        `Error al limpiar duplicados: ${(error as Error).message}`
      );
    }
  });
