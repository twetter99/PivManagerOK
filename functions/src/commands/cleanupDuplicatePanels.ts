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
 * Limpia paneles duplicados en la colección 'panels' basándose en el campo 'codigo'.
 * Para cada código duplicado, mantiene el panel más reciente (por updatedAt) y elimina los demás.
 * 
 * Proceso:
 * 1. Lee todos los documentos de panels
 * 2. Agrupa por campo 'codigo'
 * 3. Para cada grupo con más de 1 panel:
 *    - Ordena por updatedAt descendente
 *    - Mantiene el primero (más reciente)
 *    - Marca los demás para eliminación
 * 4. Elimina paneles duplicados y su billing asociado
 * 
 * @param data - { dryRun?: boolean }
 * @param context - Contexto de autenticación
 * @returns { success: true, totalPanels: number, duplicates: number, deleted: number }
 */
export const cleanupDuplicatePanels = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
  })
  .https.onCall(async (data: unknown, context) => {
    await assertIsAdmin(context);

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
      // 1. Obtener TODOS los paneles
      functions.logger.info("[cleanupDuplicatePanels] Paso 1: Leyendo todos los paneles...");
      const panelsSnapshot = await db.collection("panels").get();

      functions.logger.info(`[cleanupDuplicatePanels] Total paneles en BD: ${panelsSnapshot.size}`);

      // 2. Agrupar por código
      functions.logger.info("[cleanupDuplicatePanels] Paso 2: Agrupando por código...");
      const panelsByCodigo = new Map<string, any[]>();

      panelsSnapshot.forEach((doc) => {
        const data = doc.data();
        const codigo = data.codigo;

        if (!codigo) {
          functions.logger.warn(`[cleanupDuplicatePanels] Panel sin código: ${doc.id}`);
          return;
        }

        if (!panelsByCodigo.has(codigo)) {
          panelsByCodigo.set(codigo, []);
        }

        panelsByCodigo.get(codigo)!.push({
          id: doc.id,
          codigo,
          updatedAt: data.updatedAt?.toDate() || new Date(0),
          createdAt: data.createdAt?.toDate() || new Date(0),
          data,
        });
      });

      functions.logger.info(
        `[cleanupDuplicatePanels] Códigos únicos encontrados: ${panelsByCodigo.size}`
      );

      // 3. Identificar duplicados
      const toDelete: string[] = [];
      let duplicateGroups = 0;

      panelsByCodigo.forEach((panels, codigo) => {
        if (panels.length > 1) {
          duplicateGroups++;
          // Ordenar por updatedAt descendente (más reciente primero)
          panels.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

          // Mantener el primero, eliminar el resto
          const keep = panels[0];
          const duplicates = panels.slice(1);

          functions.logger.info(
            `[cleanupDuplicatePanels] Código "${codigo}" duplicado ${panels.length} veces. Manteniendo: ${keep.id}, Eliminando: ${duplicates.map(p => p.id).join(", ")}`
          );

          duplicates.forEach((panel) => toDelete.push(panel.id));
        }
      });

      functions.logger.info(
        `[cleanupDuplicatePanels] Grupos duplicados: ${duplicateGroups}, Paneles a eliminar: ${toDelete.length}`
      );

      if (toDelete.length === 0) {
        return {
          success: true,
          message: "No hay paneles duplicados para limpiar",
          totalPanels: panelsSnapshot.size,
          uniqueCodes: panelsByCodigo.size,
          duplicates: 0,
          deleted: 0,
        };
      }

      // Log de primeros 10 paneles a eliminar
      functions.logger.info(
        `[cleanupDuplicatePanels] Primeros 10 a eliminar: ${toDelete.slice(0, 10).join(", ")}`
      );

      if (dryRun) {
        return {
          success: true,
          message: `DRY RUN: Se eliminarían ${toDelete.length} paneles duplicados`,
          totalPanels: panelsSnapshot.size,
          uniqueCodes: panelsByCodigo.size,
          duplicateGroups,
          duplicates: toDelete.length,
          deleted: 0,
          sample: toDelete.slice(0, 10),
        };
      }

      // 4. Eliminar paneles duplicados en lotes
      functions.logger.info("[cleanupDuplicatePanels] Paso 3: Eliminando paneles duplicados...");

      const BATCH_SIZE = 100;
      let deleted = 0;

      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchIds = toDelete.slice(i, i + BATCH_SIZE);

        for (const panelId of batchIds) {
          // Eliminar documento principal
          batch.delete(db.collection("panels").doc(panelId));
        }

        await batch.commit();
        deleted += batchIds.length;

        functions.logger.info(
          `[cleanupDuplicatePanels] Progreso: ${deleted}/${toDelete.length} eliminados`
        );
      }

      // 5. Eliminar billing asociado a paneles eliminados
      functions.logger.info("[cleanupDuplicatePanels] Paso 4: Eliminando billing de paneles duplicados...");
      
      const billingToDelete: string[] = [];
      const billingSnapshot = await db.collection("billingMonthlyPanel").get();
      
      billingSnapshot.forEach(doc => {
        const panelId = doc.data().panelId;
        if (toDelete.includes(panelId)) {
          billingToDelete.push(doc.id);
        }
      });

      functions.logger.info(
        `[cleanupDuplicatePanels] Documentos de billing a eliminar: ${billingToDelete.length}`
      );

      let billingDeleted = 0;
      for (let i = 0; i < billingToDelete.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchIds = billingToDelete.slice(i, i + BATCH_SIZE);

        for (const docId of batchIds) {
          batch.delete(db.collection("billingMonthlyPanel").doc(docId));
        }

        await batch.commit();
        billingDeleted += batchIds.length;

        functions.logger.info(
          `[cleanupDuplicatePanels] Billing eliminado: ${billingDeleted}/${billingToDelete.length}`
        );
      }

      // 6. Verificar resultado
      const finalPanelsSnapshot = await db.collection("panels").get();
      functions.logger.info(
        `[cleanupDuplicatePanels] Verificación final: ${finalPanelsSnapshot.size} paneles restantes`
      );

      return {
        success: true,
        message: `Limpieza completada: ${deleted} paneles duplicados eliminados, ${billingDeleted} documentos de billing eliminados`,
        totalPanels: panelsSnapshot.size,
        uniqueCodes: panelsByCodigo.size,
        duplicateGroups,
        duplicates: toDelete.length,
        deleted,
        billingDeleted,
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
