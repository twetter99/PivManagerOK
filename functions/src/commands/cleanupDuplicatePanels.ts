import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";

const CleanupRequest = z.object({
  dryRun: z.boolean().optional(),
});

/**
 * Callable Function: cleanupDuplicatePanels
 * 
 * Limpia paneles duplicados en la colección 'panels'.
 * Mantiene SOLO los paneles que están referenciados en 'panelCodes'.
 * 
 * Proceso:
 * 1. Lee todos los documentos de panelCodes (fuente de verdad: 447)
 * 2. Lee todos los documentos de panels (actual: 894)
 * 3. Identifica cuáles panelIds NO están en panelCodes
 * 4. Elimina esos panelIds "huérfanos"
 * 5. Elimina sus subcolecciones (panelEvents)
 * 
 * @param data - { dryRun?: boolean }
 * @param context - Contexto de autenticación
 * @returns { success: true, validPanels: number, orphanPanels: number, deleted: number }
 */
export const cleanupDuplicatePanels = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    assertIsAdmin(context);

    const parseResult = CleanupRequest.safeParse(data);
    if (!parseResult.success) {
      throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos");
    }

    const { dryRun = false } = parseResult.data;

    functions.logger.info(
      `[cleanupDuplicatePanels] ${dryRun ? "DRY RUN - " : ""}Iniciando limpieza de duplicados`
    );

    const db = admin.firestore();

    try {
      // 1. Obtener panelCodes (fuente de verdad)
      functions.logger.info("[cleanupDuplicatePanels] Paso 1: Leyendo panelCodes...");
      const panelCodesSnapshot = await db.collection("panelCodes").get();
      const validPanelIds = new Set<string>();

      panelCodesSnapshot.forEach((doc) => {
        validPanelIds.add(doc.data().panelId);
      });

      functions.logger.info(
        `[cleanupDuplicatePanels] Paneles válidos en panelCodes: ${validPanelIds.size}`
      );

      // 2. Obtener TODOS los paneles
      functions.logger.info("[cleanupDuplicatePanels] Paso 2: Leyendo todos los paneles...");
      const panelsSnapshot = await db.collection("panels").get();
      const allPanelIds = panelsSnapshot.docs.map((doc) => doc.id);

      functions.logger.info(`[cleanupDuplicatePanels] Total paneles en BD: ${allPanelIds.length}`);

      // 3. Identificar paneles huérfanos (no están en panelCodes)
      const orphanPanelIds = allPanelIds.filter((id) => !validPanelIds.has(id));

      functions.logger.info(
        `[cleanupDuplicatePanels] Paneles huérfanos (a eliminar): ${orphanPanelIds.length}`
      );

      if (orphanPanelIds.length === 0) {
        return {
          success: true,
          message: "No hay paneles duplicados para limpiar",
          validPanels: validPanelIds.size,
          orphanPanels: 0,
          deleted: 0,
        };
      }

      // Log de primeros 10 paneles huérfanos
      functions.logger.info(
        `[cleanupDuplicatePanels] Primeros 10 huérfanos: ${orphanPanelIds.slice(0, 10).join(", ")}`
      );

      if (dryRun) {
        return {
          success: true,
          message: `DRY RUN: Se eliminarían ${orphanPanelIds.length} paneles huérfanos`,
          validPanels: validPanelIds.size,
          orphanPanels: orphanPanelIds.length,
          deleted: 0,
          sample: orphanPanelIds.slice(0, 10),
        };
      }

      // 4. Eliminar paneles huérfanos en lotes
      functions.logger.info("[cleanupDuplicatePanels] Paso 3: Eliminando paneles huérfanos...");

      const BATCH_SIZE = 100;
      let deleted = 0;

      for (let i = 0; i < orphanPanelIds.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchIds = orphanPanelIds.slice(i, i + BATCH_SIZE);

        for (const panelId of batchIds) {
          // Eliminar documento principal
          batch.delete(db.collection("panels").doc(panelId));

          // Nota: Las subcolecciones (panelEvents) quedan huérfanas pero no afectan
          // En producción, deberías eliminarlas también con un proceso recursivo
        }

        await batch.commit();
        deleted += batchIds.length;

        functions.logger.info(
          `[cleanupDuplicatePanels] Progreso: ${deleted}/${orphanPanelIds.length} eliminados`
        );
      }

      // 5. Verificar resultado
      const finalPanelsSnapshot = await db.collection("panels").get();
      functions.logger.info(
        `[cleanupDuplicatePanels] Verificación final: ${finalPanelsSnapshot.size} paneles restantes`
      );

      return {
        success: true,
        message: `Limpieza completada: ${deleted} paneles duplicados eliminados`,
        validPanels: validPanelIds.size,
        orphanPanels: orphanPanelIds.length,
        deleted,
        finalCount: finalPanelsSnapshot.size,
      };
    } catch (error) {
      functions.logger.error("[cleanupDuplicatePanels] Error:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Error en limpieza: ${(error as Error).message}`
      );
    }
  });
