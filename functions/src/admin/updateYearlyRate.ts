/**
 * updateYearlyRate Cloud Function
 * Actualiza la tarifa anual en Firestore (colección rates)
 * Solo accesible por usuarios con rol Admin
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { calculateImporte } from "../lib/billingRules";

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
  propagation: {
    panelsUpdated: number;
    monthsAffected: string[];
    monthsSkipped: string[];
    skippedReason: "locked" | "none";
  };
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

      // 5. PROPAGACIÓN INTELIGENTE: Actualizar solo meses abiertos del año
      let panelsUpdated = 0;
      const monthsAffected: string[] = [];
      const monthsSkipped: string[] = [];
      let skippedReason: "locked" | "none" = "none";

      try {
        // Calcular rango de meses: desde mes actual hasta fin del año objetivo
        const nowDate = new Date();
        const currentYear = nowDate.getFullYear();
        const currentMonth = nowDate.getMonth() + 1; // 1-12

        let startMonthKey: string;
        let endMonthKey: string;

        if (parseInt(year) > currentYear) {
          // Año futuro: propagar desde Enero hasta Diciembre
          startMonthKey = `${year}-01`;
          endMonthKey = `${year}-12`;
        } else if (parseInt(year) === currentYear) {
          // Año actual: propagar desde mes actual hasta Diciembre
          startMonthKey = `${year}-${String(currentMonth).padStart(2, "0")}`;
          endMonthKey = `${year}-12`;
        } else {
          // Año pasado: propagar desde Enero hasta Diciembre (auditoría)
          startMonthKey = `${year}-01`;
          endMonthKey = `${year}-12`;
        }

        functions.logger.info(
          `[updateYearlyRate] Buscando paneles en rango: ${startMonthKey} → ${endMonthKey}`
        );

        // Buscar todos los billingMonthlyPanel del rango de meses
        const billingSnapshot = await db
          .collection("billingMonthlyPanel")
          .where("monthKey", ">=", startMonthKey)
          .where("monthKey", "<=", endMonthKey)
          .get();

        if (!billingSnapshot.empty) {
          functions.logger.info(
            `[updateYearlyRate] Encontrados ${billingSnapshot.size} documentos en el rango`
          );

          // Agrupar paneles por mes para verificar si están cerrados
          const panelsByMonth = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
          for (const doc of billingSnapshot.docs) {
            const monthKey = doc.data().monthKey;
            if (!panelsByMonth.has(monthKey)) {
              panelsByMonth.set(monthKey, []);
            }
            panelsByMonth.get(monthKey)!.push(doc);
          }

          // Verificar qué meses están cerrados
          const lockedMonths = new Set<string>();
          for (const monthKey of panelsByMonth.keys()) {
            const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
            if (summaryDoc.exists && summaryDoc.data()?.isLocked === true) {
              lockedMonths.add(monthKey);
              monthsSkipped.push(monthKey);
              skippedReason = "locked";
              functions.logger.warn(
                `[updateYearlyRate] 🔒 Mes ${monthKey} cerrado - omitiendo actualización`
              );
            }
          }

          // Usar batch para actualización masiva (máx 500 por batch)
          const batchSize = 500;
          let batch = db.batch();
          let batchCount = 0;

          for (const doc of billingSnapshot.docs) {
            const docData = doc.data();
            const monthKey = docData.monthKey;

            // Saltar meses cerrados
            if (lockedMonths.has(monthKey)) {
              continue;
            }

            const diasFacturables = docData.totalDiasFacturables || 0;

            // Recalcular importe con precisión contable (céntimos)
            const nuevoImporte = calculateImporte(diasFacturables, amount);

            // Normalizar a 2 decimales para evitar basura decimal
            const nuevoImporteNormalizado = Math.round(nuevoImporte * 100) / 100;

            batch.update(doc.ref, {
              tarifaAplicada: amount,
              totalImporte: nuevoImporteNormalizado,
              updatedAt: now,
              updatedBy: `auto:${userEmail}`,
            });

            batchCount++;
            panelsUpdated++;

            // Registrar mes afectado (sin duplicados)
            if (!monthsAffected.includes(monthKey)) {
              monthsAffected.push(monthKey);
            }

            // Commit batch cada 500 operaciones
            if (batchCount >= batchSize) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
              functions.logger.info(
                `[updateYearlyRate] Batch commit: ${panelsUpdated} paneles actualizados hasta ahora`
              );
            }
          }

          // Commit batch final
          if (batchCount > 0) {
            await batch.commit();
          }

          // Ordenar meses afectados para mejor legibilidad
          monthsAffected.sort();
          monthsSkipped.sort();

          functions.logger.info(
            `[updateYearlyRate] ✅ Propagación completada: ${panelsUpdated} paneles en ${monthsAffected.length} meses`
          );
          if (monthsSkipped.length > 0) {
            functions.logger.info(
              `[updateYearlyRate] 🔒 Meses omitidos (cerrados): ${monthsSkipped.join(", ")}`
            );
          }
        } else {
          functions.logger.info(
            `[updateYearlyRate] ℹ️ No se encontraron paneles en el rango ${startMonthKey} → ${endMonthKey}`
          );
        }
      } catch (propagationError: any) {
        functions.logger.error(
          `[updateYearlyRate] ⚠️ Error en propagación automática: ${propagationError.message}`
        );
        // No fallar la operación principal si la propagación falla
      }

      // Construir mensaje descriptivo
      let message = `Tarifa ${year} guardada correctamente`;
      if (panelsUpdated > 0) {
        message = `Tarifa ${year} actualizada y propagada a ${panelsUpdated} paneles en ${monthsAffected.length} mes(es)`;
        if (monthsSkipped.length > 0) {
          message += `. ${monthsSkipped.length} mes(es) cerrado(s) omitido(s)`;
        }
      }

      return {
        success: true,
        message,
        year,
        amount,
        updatedAt: now,
        updatedBy: userEmail,
        propagation: {
          panelsUpdated,
          monthsAffected,
          monthsSkipped,
          skippedReason,
        },
      };
    }
  );
