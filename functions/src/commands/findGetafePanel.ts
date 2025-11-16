import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";

/**
 * Callable Function: findGetafePanel
 * Busca el panel de Getafe para identificar su código exacto
 */
export const findGetafePanel = functions
  .region("europe-west1")
  .https.onCall(async (data: unknown, context) => {
    assertIsAdmin(context);

    const db = admin.firestore();
    
    // Buscar paneles que contengan "Getafe" en municipio o código
    const panelsSnapshot = await db.collection("panels").get();
    const getafePanels: any[] = [];
    
    panelsSnapshot.forEach(doc => {
      const data = doc.data();
      const codigo = data.codigo?.toLowerCase() || "";
      const municipio = data.municipioId?.toLowerCase() || "";
      
      if (codigo.includes("getafe") || codigo.includes("tft") || municipio.includes("getafe")) {
        getafePanels.push({
          id: doc.id,
          codigo: data.codigo,
          municipio: data.municipioId,
          estadoActual: data.estadoActual,
          tarifaBaseMes: data.tarifaBaseMes,
        });
      }
    });

    return {
      success: true,
      found: getafePanels.length,
      panels: getafePanels,
    };
  });
