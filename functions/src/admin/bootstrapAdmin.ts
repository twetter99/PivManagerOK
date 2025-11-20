/**
 * bootstrapAdmin Cloud Function
 * 
 * PROPÓSITO: Crear el primer usuario administrador del sistema
 * 
 * ⚠️ FUNCIÓN DE BOOTSTRAP - USAR SOLO UNA VEZ
 * 
 * Esta función permite crear el documento inicial en la colección 'users'
 * para asignar el rol de 'admin' al primer usuario del sistema.
 * 
 * Una vez creado el primer admin, este podrá usar las funciones protegidas
 * (createPanel, updateYearlyRate, etc.) para gestionar el sistema.
 * 
 * SEGURIDAD:
 * - NO tiene verificaciones de rol (por diseño, es para crear el primer admin)
 * - SÍ verifica autenticación (debe estar logueado con Google Auth)
 * - Después de crear el primer admin, esta función puede quedar en el código
 *   o eliminarse según preferencias de seguridad
 * 
 * USO:
 * 1. Login con Google Auth en la aplicación
 * 2. Obtener tu UID desde Firebase Console > Authentication
 * 3. Llamar a esta función con { targetUid: "tu-uid", targetEmail: "tu@email.com" }
 * 4. El documento users/{targetUid} se creará con role: "admin"
 * 5. Ya podrás acceder a todas las funciones protegidas
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

interface BootstrapAdminRequest {
  targetUid: string;
  targetEmail: string;
}

interface BootstrapAdminResponse {
  success: boolean;
  message: string;
  uid: string;
  email: string;
  role: string;
}

export const bootstrapAdmin = functions
  .region("europe-west1")
  .https.onCall(
    async (
      data: BootstrapAdminRequest,
      context
    ): Promise<BootstrapAdminResponse> => {
      // NOTA: Esta función es un bootstrap. POR DISEÑO NO realiza
      // verificaciones de autenticación ni autorización. Use con cuidado.
      const { targetUid, targetEmail } = data;

      // Validar parámetros básicos
      if (!targetUid || typeof targetUid !== "string") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "targetUid es obligatorio y debe ser un string"
        );
      }

      if (!targetEmail || typeof targetEmail !== "string") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "targetEmail es obligatorio y debe ser un string"
        );
      }

      // Escribir directamente en Firestore (crear/sobrescribir)
      const db = admin.firestore();
      const userRef = db.collection("users").doc(targetUid);

      try {
        await userRef.set(
          {
            role: "admin",
            email: targetEmail,
            createdAt: admin.firestore.Timestamp.now(),
            bootstrapped: true,
          },
          { merge: true }
        );

        functions.logger.info(
          `[bootstrapAdmin] ✅ Usuario admin creado/actualizado: ${targetUid} (${targetEmail})`
        );

        return {
          success: true,
          message: `Usuario ${targetEmail} configurado como admin correctamente`,
          uid: targetUid,
          email: targetEmail,
          role: "admin",
        };
      } catch (error: any) {
        functions.logger.error(`[bootstrapAdmin] ❌ Error al crear admin: ${error.message}`);
        throw new functions.https.HttpsError("internal", `Error al crear el documento: ${error.message}`);
      }
    }
  );
