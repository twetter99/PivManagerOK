import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";

/**
 * Callable Function: createNovemberTransitionEvents
 * 
 * Crea los eventos de transición para noviembre 2025 basándose en los cambios
 * que ocurrieron en octubre pero que deben reflejarse en la facturación de noviembre.
 * 
 * Eventos a crear:
 * 1. Panel 10573 (Villaviciosa de Odón) - DESMONTAJE día 9 octubre → No factura en noviembre
 * 2. Panel 18257 (Hoyo de Manzanares) - DESMONTAJE día 24 octubre → No factura en noviembre
 * 3. Panel 8933 (Brunete) - DESMONTAJE día 24 octubre → No factura en noviembre
 * 4. Panel TFT Getafe - ALTA día 24 octubre → Factura desde día 1 noviembre
 * 
 * IMPORTANTE: No modifica octubre (que está correcto), solo asegura que noviembre
 * herede el estado correcto al cierre de octubre.
 */
export const createNovemberTransitionEvents = functions
  .region("europe-west1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el usuario sea admin
    assertIsAdmin(context);

    functions.logger.info("[createNovemberTransitionEvents] Iniciando creación de eventos de transición");

    const db = admin.firestore();
    const results: any[] = [];

    try {
      // Buscar los paneles por código
      const panelsSnapshot = await db.collection("panels").get();
      const panelsByCode: Record<string, string> = {};
      
      panelsSnapshot.forEach(doc => {
        const codigo = doc.data().codigo;
        if (codigo) {
          panelsByCode[codigo] = doc.id;
        }
      });

      functions.logger.info(`[createNovemberTransitionEvents] Encontrados ${Object.keys(panelsByCode).length} paneles`);

      // Definir los eventos a crear
      const eventsToCreate = [
        {
          codigo: "10573",
          municipio: "Villaviciosa de Odón",
          action: "DESMONTAJE",
          effectiveDateLocal: "2025-10-09",
          monthKey: "2025-10",
          motivo: "Desmontaje registrado en octubre - reflejo en noviembre",
        },
        {
          codigo: "18257",
          municipio: "Hoyo de Manzanares",
          action: "DESMONTAJE",
          effectiveDateLocal: "2025-10-24",
          monthKey: "2025-10",
          motivo: "Desmontaje registrado en octubre - reflejo en noviembre",
        },
        {
          codigo: "8933",
          municipio: "Brunete",
          action: "DESMONTAJE",
          effectiveDateLocal: "2025-10-24",
          monthKey: "2025-10",
          motivo: "Desmontaje registrado en octubre - reflejo en noviembre",
        },
        {
          codigo: "TFT Getafe",
          municipio: "Getafe",
          action: "ALTA",
          effectiveDateLocal: "2025-10-24",
          monthKey: "2025-10",
          motivo: "Alta registrada en octubre - reflejo en noviembre",
        },
      ];

      // Crear cada evento
      for (const eventData of eventsToCreate) {
        const panelId = panelsByCode[eventData.codigo];
        
        if (!panelId) {
          const error = `Panel ${eventData.codigo} no encontrado en la base de datos`;
          functions.logger.error(error);
          results.push({
            codigo: eventData.codigo,
            success: false,
            error,
          });
          continue;
        }

        // Verificar si ya existe un evento similar
        const existingEvents = await db
          .collection("panels")
          .doc(panelId)
          .collection("panelEvents")
          .where("monthKey", "==", eventData.monthKey)
          .where("action", "==", eventData.action)
          .where("effectiveDateLocal", "==", eventData.effectiveDateLocal)
          .get();

        if (!existingEvents.empty) {
          const warning = `Evento ya existe para panel ${eventData.codigo}`;
          functions.logger.warn(warning);
          results.push({
            codigo: eventData.codigo,
            success: true,
            skipped: true,
            message: warning,
          });
          continue;
        }

        // Crear el evento
        const eventRef = db
          .collection("panels")
          .doc(panelId)
          .collection("panelEvents")
          .doc();

        const eventDoc = {
          action: eventData.action,
          effectiveDateLocal: eventData.effectiveDateLocal,
          effectiveDate: admin.firestore.Timestamp.fromDate(
            new Date(eventData.effectiveDateLocal + "T00:00:00Z")
          ),
          monthKey: eventData.monthKey,
          motivo: eventData.motivo,
          isDeleted: false,
          snapshotBefore: {},
          snapshotAfter: {
            estadoActual: eventData.action === "DESMONTAJE" ? "DESMONTADO" : "ACTIVO",
          },
          idempotencyKey: `transition-nov-2025-${eventData.codigo}-${eventData.action}`,
          createdAt: admin.firestore.Timestamp.now(),
          createdBy: context.auth?.uid || "system",
        };

        await eventRef.set(eventDoc);

        functions.logger.info(
          `[createNovemberTransitionEvents] Evento creado: ${eventData.codigo} - ${eventData.action} (${eventData.effectiveDateLocal})`
        );

        results.push({
          codigo: eventData.codigo,
          municipio: eventData.municipio,
          action: eventData.action,
          date: eventData.effectiveDateLocal,
          success: true,
          eventId: eventRef.id,
        });
      }

      // Resumen
      const successful = results.filter(r => r.success && !r.skipped).length;
      const skipped = results.filter(r => r.skipped).length;
      const failed = results.filter(r => !r.success).length;

      functions.logger.info(
        `[createNovemberTransitionEvents] Completado: ${successful} creados, ${skipped} omitidos, ${failed} fallidos`
      );

      return {
        success: true,
        message: "Eventos de transición creados correctamente",
        summary: {
          created: successful,
          skipped,
          failed,
          total: results.length,
        },
        details: results,
      };

    } catch (error: any) {
      functions.logger.error("[createNovemberTransitionEvents] Error:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Error al crear eventos: ${error.message}`
      );
    }
  });
