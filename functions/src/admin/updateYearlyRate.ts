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

      // 5. PROPAGACIÓN AUTOMÁTICA: Actualizar Enero del año objetivo
      let panelsUpdated = 0;
      const targetMonthKey = `${year}-01`; // Enero del año modificado

      try {
        // Buscar todos los billingMonthlyPanel de Enero de ese año
        const billingSnapshot = await db
          .collection("billingMonthlyPanel")
          .where("monthKey", "==", targetMonthKey)
          .get();

        if (!billingSnapshot.empty) {
          functions.logger.info(
            `[updateYearlyRate] Propagando tarifa a ${billingSnapshot.size} paneles de ${targetMonthKey}`
          );

          // Usar batch para actualización masiva (máx 500 por batch)
          const batchSize = 500;
          let batch = db.batch();
          let batchCount = 0;

          for (const doc of billingSnapshot.docs) {
            const docData = doc.data();
            const diasFacturables = docData.totalDiasFacturables || 0;

            // Recalcular importe: (dias / 30) * nuevaTarifa
            const nuevoImporte = (diasFacturables / 30) * amount;

            batch.update(doc.ref, {
              tarifaAplicada: amount,
              totalImporte: nuevoImporte,
              updatedAt: now,
              updatedBy: `auto:${userEmail}`,
            });

            batchCount++;
            panelsUpdated++;

            // Commit batch cada 500 operaciones
            if (batchCount >= batchSize) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
            }
          }

          // Commit batch final
          if (batchCount > 0) {
            await batch.commit();
          }

          functions.logger.info(
            `[updateYearlyRate] ✅ Propagación completada: ${panelsUpdated} paneles actualizados en ${targetMonthKey}`
          );
        } else {
          functions.logger.info(
            `[updateYearlyRate] ℹ️ No se encontraron paneles en ${targetMonthKey} (mes aún no creado)`
          );
        }
      } catch (propagationError: any) {
        functions.logger.error(
          `[updateYearlyRate] ⚠️ Error en propagación automática: ${propagationError.message}`
        );
        // No fallar la operación principal si la propagación falla
      }

      return {
        success: true,
        message:
          panelsUpdated > 0
            ? `Tarifa ${year} guardada y propagada a ${panelsUpdated} paneles de ${targetMonthKey}`
            : `Tarifa ${year} guardada correctamente`,
        year,
        amount,
        updatedAt: now,
        updatedBy: userEmail,
      };
    }
  );
