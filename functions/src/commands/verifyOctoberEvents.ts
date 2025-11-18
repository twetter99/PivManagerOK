import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";

/**
 * Callable Function: verifyOctoberEvents
 * Verifica si existen los eventos de transición de octubre para los paneles críticos
 */
export const verifyOctoberEvents = functions
  .region("europe-west1")
  .https.onCall(async (data: unknown, context) => {
    assertIsAdmin(context);

    const db = admin.firestore();
    
    // Códigos de paneles a verificar
    const targetCodes = ["10573", "18257", "8933", "TFT Hosp.Getafe"];
    const results: any[] = [];
    
    // Buscar paneles por código
    const panelsSnapshot = await db.collection("panels").get();
    
    for (const targetCode of targetCodes) {
      const panelDoc = panelsSnapshot.docs.find(doc => 
        doc.data().codigo?.includes(targetCode) || 
        doc.data().codigo === targetCode
      );
      
      if (!panelDoc) {
        results.push({
          codigo: targetCode,
          found: false,
          message: "Panel no encontrado en colección panels"
        });
        continue;
      }
      
      const panelId = panelDoc.id;
      const panelData = panelDoc.data();
      
      // Buscar eventos de octubre (2025-10)
      const eventsSnapshot = await db
        .collection("panels")
        .doc(panelId)
        .collection("panelEvents")
        .where("monthKey", "==", "2025-10")
        .get();
      
      const events = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        action: doc.data().action,
        effectiveDateLocal: doc.data().effectiveDateLocal,
        isDeleted: doc.data().isDeleted,
        snapshotAfter: doc.data().snapshotAfter,
      }));
      
      results.push({
        codigo: panelData.codigo,
        panelId,
        estadoActual: panelData.estadoActual,
        tarifaBaseMes: panelData.tarifaBaseMes,
        eventosOctubre: events.length,
        eventos: events,
      });
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      results,
    };
  });
