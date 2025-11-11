import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin } from "../lib/utils";
import { z } from "zod";

// Schema de validación para la solicitud
const SetUserRoleRequest = z.object({
  uid: z.string().min(1, "El UID del usuario es obligatorio"),
  role: z.enum(["admin", "user"], {
    errorMap: () => ({ message: "El rol debe ser 'admin' o 'user'" }),
  }),
});

type SetUserRoleRequestData = z.infer<typeof SetUserRoleRequest>;

/**
 * Callable Function: setUserRole
 * 
 * Permite a un administrador asignar roles (custom claims) a otros usuarios.
 * 
 * @param data - { uid: string, role: "admin" | "user" }
 * @param context - Contexto de autenticación
 * @returns { success: true, uid: string, role: string }
 * 
 * @throws {functions.https.HttpsError} Si el llamante no es admin o los datos son inválidos
 */
export const setUserRole = functions
  .region("europe-west1") // Ajusta la región según tu proyecto
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el llamante sea admin
    assertIsAdmin(context);

    // 2. Validar los datos de entrada con Zod
    const parseResult = SetUserRoleRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => e.message).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { uid, role } = parseResult.data;

    try {
      // 3. Verificar que el usuario objetivo existe
      await admin.auth().getUser(uid);

      // 4. Asignar el custom claim
      const customClaims: Record<string, boolean> = {};
      
      if (role === "admin") {
        customClaims.admin = true;
      } else {
        // Si el rol es "user", eliminamos el claim admin (si existe)
        customClaims.admin = false;
      }

      await admin.auth().setCustomUserClaims(uid, customClaims);

      functions.logger.info(`Rol '${role}' asignado al usuario ${uid} por ${context.auth?.uid}`);

      return {
        success: true,
        uid,
        role,
        message: `Rol '${role}' asignado correctamente al usuario ${uid}`,
      };
    } catch (error) {
      functions.logger.error("Error al asignar rol:", error);

      if ((error as any).code === "auth/user-not-found") {
        throw new functions.https.HttpsError(
          "not-found",
          `No se encontró el usuario con UID: ${uid}`
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Error al asignar el rol. Inténtalo de nuevo."
      );
    }
  });
