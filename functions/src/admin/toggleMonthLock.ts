import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { assertIsAdmin, getUserEmail, now } from "../lib/utils";
import { z } from "zod";

const ToggleMonthLockRequest = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, "El monthKey debe tener formato YYYY-MM"),
  isLocked: z.boolean(),
});

/**
 * Callable Function: toggleMonthLock
 * 
 * Cierra o abre un mes cambiando el flag isLocked en billingSummary.
 * Solo admins pueden ejecutar esta función.
 * 
 * @param data - { monthKey: "YYYY-MM", isLocked: true/false }
 * @param context - Contexto de autenticación
 * @returns { success: true, monthKey: string, isLocked: boolean }
 */
export const toggleMonthLock = functions
  .region("europe-west1")
  .https.onCall(async (data: unknown, context) => {
    // 1. Validar que el llamante sea admin
    await assertIsAdmin(context);

    const userEmail = getUserEmail(context);
    const timestamp = now();

    // 2. Validar los datos de entrada
    const parseResult = ToggleMonthLockRequest.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => e.message).join(", ");
      throw new functions.https.HttpsError("invalid-argument", errors);
    }

    const { monthKey, isLocked } = parseResult.data;

    functions.logger.info(
      `[toggleMonthLock] ${isLocked ? "Cerrando" : "Abriendo"} mes ${monthKey} por ${userEmail}`
    );

    const db = admin.firestore();

    // 3. Verificar que el mes exista
    const summaryRef = db.collection("billingSummary").doc(monthKey);
    const summaryDoc = await summaryRef.get();

    if (!summaryDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `El mes ${monthKey} no existe. No se puede ${isLocked ? "cerrar" : "abrir"}.`
      );
    }

    // 3.5. Si se está abriendo un mes cerrado, verificar si existe mes siguiente
    if (!isLocked && summaryDoc.data()?.isLocked) {
      const [year, month] = monthKey.split("-").map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;

      const nextMonthDoc = await db.collection("billingSummary").doc(nextMonthKey).get();
      
      if (nextMonthDoc.exists) {
        functions.logger.warn(
          `[toggleMonthLock] Abriendo ${monthKey} pero ${nextMonthKey} ya existe. ` +
          `Cambios en ${monthKey} no se sincronizarán automáticamente.`
        );
        // No bloqueamos, solo advertimos en logs
      }
    }

    // 4. Actualizar el flag isLocked
    await summaryRef.update({
      isLocked,
      updatedAt: timestamp,
    });

    functions.logger.info(
      `[toggleMonthLock] Mes ${monthKey} ${isLocked ? "cerrado" : "abierto"} exitosamente`
    );

    return {
      success: true,
      monthKey,
      isLocked,
    };
  });
