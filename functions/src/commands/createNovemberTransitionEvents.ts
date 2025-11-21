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
    await assertIsAdmin(context);

    functions.logger.info("[createNovemberTransitionEvents] Iniciando creación de eventos de transición");

    const db = admin.firestore();
    const results: any[] = [];

    try {
      // Buscar los paneles por código (búsqueda flexible)
      const panelsSnapshot = await db.collection("panels").get();
      const panelsByCode: Record<string, string> = {};
      const allPanels: any[] = [];
      
      panelsSnapshot.forEach(doc => {
        const data = doc.data();
        const codigo = data.codigo;
        if (codigo) {
          panelsByCode[codigo] = doc.id;
          allPanels.push({ id: doc.id, codigo, municipio: data.municipioId });
        }
      });

      functions.logger.info(`[createNovemberTransitionEvents] Encontrados ${Object.keys(panelsByCode).length} paneles`);
      
      // Buscar paneles que contengan "Getafe" o "TFT" si no se encuentra "TFT Getafe"
      const getafePanels = allPanels.filter(p => 
        p.codigo?.toLowerCase().includes("tft") || 
        p.codigo?.toLowerCase().includes("getafe") ||
        p.municipio?.toLowerCase().includes("getafe")
      );
      
      if (getafePanels.length > 0) {
        functions.logger.info(`[createNovemberTransitionEvents] Paneles de Getafe encontrados:`, getafePanels);
      }

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
          codigo: "TFT Hosp.Getafe",
          municipio: "Getafe",
          action: "ALTA",
          effectiveDateLocal: "2025-10-24",
          monthKey: "2025-10",
          motivo: "Alta registrada en octubre - reflejo en noviembre",
        },
      ];

      // Crear cada evento
      for (const eventData of eventsToCreate) {
        let panelId = panelsByCode[eventData.codigo];
        
        // Si no se encuentra por código exacto, buscar paneles de Getafe/TFT
        if (!panelId && (eventData.codigo.includes("TFT") || eventData.codigo.includes("Getafe"))) {
          const getafeMatch = allPanels.find(p => 
            (p.codigo?.toLowerCase().includes("tft") || p.codigo?.toLowerCase().includes("getafe")) &&
            p.municipio?.toLowerCase().includes("getafe")
          );
          
          if (getafeMatch) {
            panelId = getafeMatch.id;
            functions.logger.info(`[createNovemberTransitionEvents] Panel TFT/Getafe encontrado con código: ${getafeMatch.codigo} (id: ${panelId})`);
          }
        }
        
        if (!panelId) {
          const error = `Panel ${eventData.codigo} no encontrado en la base de datos`;
          functions.logger.error(error);
          functions.logger.error(`Búsqueda flexible también falló. Paneles disponibles en Getafe:`, getafePanels);
          results.push({
            codigo: eventData.codigo,
            success: false,
            error,
            availableGetafePanels: getafePanels.length > 0 ? getafePanels : undefined,
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

        // Crear el evento con verificación
        functions.logger.info(
          `[createNovemberTransitionEvents] Creando evento para panel ${eventData.codigo} (ID: ${panelId})`
        );

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

        // Usar add() en lugar de doc().set() para garantizar escritura
        const eventRef = await db
          .collection("panels")
          .doc(panelId)
          .collection("panelEvents")
          .add(eventDoc);

        functions.logger.info(
          `[createNovemberTransitionEvents] ✅ Evento creado exitosamente: ${eventData.codigo} - ${eventData.action} (${eventData.effectiveDateLocal}) - Event ID: ${eventRef.id}`
        );

        // Verificar que se escribió leyéndolo de vuelta
        const verifyDoc = await eventRef.get();
        if (!verifyDoc.exists) {
          throw new Error(`Error: Evento no se pudo verificar después de crearlo`);
        }

        functions.logger.info(
          `[createNovemberTransitionEvents] ✅ Evento verificado en Firestore: ${eventRef.id}`
        );

        results.push({
          codigo: eventData.codigo,
          municipio: eventData.municipio,
          action: eventData.action,
          date: eventData.effectiveDateLocal,
          success: true,
          eventId: eventRef.id,
          verified: true,
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
