/**
 * updateYearlyRate Cloud Function
 * Actualiza la tarifa anual en Firestore (colección rates)
 * Solo accesible por usuarios con rol Admin
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

interface UpdateYearlyRateRequest {
  year: string;
  amount: number;
}

interface UpdateYearlyRateResponse {
  success: boolean;
  message: string;
  year: string;
  amount: number;
  updatedAt: string;
  updatedBy: string;
}

export const updateYearlyRate = functions
  .region("europe-west1")
  .https.onCall(
    async (
      data: UpdateYearlyRateRequest,
      context
    ): Promise<UpdateYearlyRateResponse> => {
      // 1. Verificar autenticación
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Usuario no autenticado"
        );
      }

      const userId = context.auth.uid;
      const userEmail = context.auth.token.email || "unknown";

      // 2. Verificar rol de Admin
      const db = admin.firestore();
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists || userDoc.data()?.role !== "admin") {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Solo los administradores pueden actualizar tarifas"
        );
      }

      // 3. Validar input
      const { year, amount } = data;

      if (!year || !/^\d{4}$/.test(year)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "El año debe ser un string de 4 dígitos (ej: '2026')"
        );
      }

      if (typeof amount !== "number" || amount <= 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "El importe debe ser un número positivo"
        );
      }

      // 4. Escribir/Actualizar en Firestore
      const rateRef = db.collection("rates").doc(year);
      const now = new Date().toISOString();

      await rateRef.set(
        {
          year,
          importe: amount,
          updatedAt: now,
          updatedBy: userEmail,
        },
        { merge: true }
      );

      functions.logger.info(
        `[updateYearlyRate] Tarifa ${year} actualizada a ${amount}€ por ${userEmail}`
      );

      return {
        success: true,
        message: `Tarifa ${year} actualizada correctamente`,
        year,
        amount,
        updatedAt: now,
        updatedBy: userEmail,
      };
    }
  );
