/**
 * getUniqueLocations Cloud Function
 * Obtiene lista única de ubicaciones desde la colección maestra panels
 * Optimizada con .select() para traer solo el campo ubicacion
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

interface GetUniqueLocationsResponse {
  locations: string[];
}

export const getUniqueLocations = functions
  .region("europe-west1")
  .https.onCall(
    async (data, context): Promise<GetUniqueLocationsResponse> => {
      // Verificar autenticación (cualquier usuario logueado puede leer ubicaciones)
      if (!context.auth) {
        functions.logger.warn("[getUniqueLocations] Intento de acceso sin autenticación");
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Debe estar autenticado para ver las ubicaciones"
        );
      }

      const userId = context.auth.uid;
      const userEmail = context.auth.token.email || "unknown";

      functions.logger.info(
        `[getUniqueLocations] Usuario autenticado: ${userEmail} (${userId})`
      );

      try {
        const db = admin.firestore();
        
        functions.logger.info("[getUniqueLocations] Iniciando query a panels collection...");

        // Query optimizada: solo trae el campo 'ubicacion'
        // Nota: Usa Admin SDK, ignora las reglas de seguridad de Firestore
        const panelsRef = db.collection("panels");
        
        functions.logger.info("[getUniqueLocations] Ejecutando panelsRef.select('ubicacion').get()...");
        
        const snapshot = await panelsRef.select("ubicacion").get();

        functions.logger.info(
          `[getUniqueLocations] ✅ Query exitosa. Leídos ${snapshot.size} paneles`
        );

        // Extraer ubicaciones únicas
        const locationSet = new Set<string>();

        snapshot.forEach((doc) => {
          const ubicacion = doc.data().ubicacion;
          if (ubicacion && typeof ubicacion === "string" && ubicacion.trim().length > 0) {
            locationSet.add(ubicacion.trim());
          }
        });

        // Convertir Set a Array y ordenar alfabéticamente (respetando español)
        const sortedLocations = Array.from(locationSet).sort((a, b) =>
          a.localeCompare(b, "es", { sensitivity: "base" })
        );

        functions.logger.info(
          `[getUniqueLocations] Retornando ${sortedLocations.length} ubicaciones únicas`
        );

        return {
          locations: sortedLocations,
        };
      } catch (err: any) {
        functions.logger.error(
          `[getUniqueLocations] Error: ${err.message}`,
          {
            errorStack: err.stack,
          }
        );

        throw new functions.https.HttpsError(
          "internal",
          `Error obteniendo ubicaciones: ${err.message || "Error desconocido"}`
        );
      }
    }
  );
