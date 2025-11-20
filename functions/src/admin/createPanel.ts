/**
 * createPanel Cloud Function
 * Alta unificada de panel individual
 * Crea panel, candado de unicidad, evento ALTA_INICIAL y facturación del primer mes
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { calculateBillableDays, calculateImporte, getDayOfMonth } from "../lib/billingRules";
import { getStandardRateForYear } from "../lib/rateService";
import { recalculateSummary } from "../lib/summaryCalculations";

interface CreatePanelRequest {
  codigo: string;
  municipio: string;
  fechaAlta: string; // Formato YYYY-MM-DD
}

interface CreatePanelResponse {
  success: boolean;
  message: string;
  panelId: string;
  codigo: string;
  monthKey: string;
  diasFacturables: number;
  importe: number;
  tarifa: number;
}

export const createPanel = functions
  .region("europe-west1")
  .runWith({
    memory: "256MB",
    timeoutSeconds: 60,
  })
  .https.onCall(
    async (
      data: CreatePanelRequest,
      context
    ): Promise<CreatePanelResponse> => {
      // ============================================================
      // FASE 1: VALIDACIÓN ESTRICTA DE SEGURIDAD Y ENTRADA
      // ============================================================
      
      // 1. Verificar autenticación
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Usuario no autenticado"
        );
      }

      const userId = context.auth.uid;
      const userEmail = context.auth.token.email || "unknown";

      functions.logger.info(
        `[createPanel] Iniciando alta de panel. Usuario: ${userEmail} (${userId})`
      );

      // 2. Verificar rol de Admin
      const db = admin.firestore();
      
      try {
        const userDoc = await db.collection("users").doc(userId).get();

        if (!userDoc.exists || userDoc.data()?.role !== "admin") {
          throw new functions.https.HttpsError(
            "permission-denied",
            "Solo los administradores pueden crear paneles"
          );
        }
      } catch (err: any) {
        if (err instanceof functions.https.HttpsError) {
          throw err;
        }
        functions.logger.error(`[createPanel] Error verificando permisos: ${err.message}`);
        throw new functions.https.HttpsError(
          "internal",
          "Error verificando permisos de usuario"
        );
      }

      // 3. Validar input (ESTRICTO)
      if (!data || typeof data !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Datos de entrada inválidos"
        );
      }

      const { codigo, municipio, fechaAlta } = data;

      if (!codigo || typeof codigo !== "string" || codigo.trim().length === 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "El código del panel es obligatorio"
        );
      }

      if (!municipio || typeof municipio !== "string" || municipio.trim().length === 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "El municipio es obligatorio"
        );
      }

      // Validar formato de fecha YYYY-MM-DD
      if (!fechaAlta || !/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "La fecha de alta debe tener formato YYYY-MM-DD (ej: 2025-11-20)"
        );
      }

      const codigoClean = codigo.trim();
      const municipioClean = municipio.trim();

      // ============================================================
      // FASE 2: LÓGICA DE NEGOCIO (BLINDADA CON TRY/CATCH)
      // ============================================================

      try {
        // 4. Check de unicidad (candado panelCodes)
        const codeRef = db.collection("panelCodes").doc(codigoClean);
        const codeDoc = await codeRef.get();

        if (codeDoc.exists) {
          throw new functions.https.HttpsError(
            "already-exists",
            `El código "${codigoClean}" ya está registrado en el sistema`
          );
        }

        // 5. Auto-tarificación: Obtener tarifa del año
        const [year, month, day] = fechaAlta.split("-");
        const monthKey = `${year}-${month}`;
        const dayOfMonth = parseInt(day, 10);

        if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            `El día (${day}) debe estar entre 1 y 31`
          );
        }

        // Validar mes
        const monthNum = parseInt(month, 10);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            `El mes (${month}) debe estar entre 01 y 12`
          );
        }

        // Validar año
        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            `El año (${year}) debe estar entre 2000 y 2100`
          );
        }

        let standardRate: number;
        try {
          standardRate = await getStandardRateForYear(year);
        } catch (err: any) {
          functions.logger.error(
            `[createPanel] ❌ No se encontró tarifa para el año ${year}: ${err.message}`
          );
          throw new functions.https.HttpsError(
            "failed-precondition",
            `No se encontró tarifa para el año ${year}. Por favor, configura la tarifa en la consola de administración antes de crear el panel.`
          );
        }

        functions.logger.info(
          `[createPanel] Código: ${codigoClean}, Municipio: ${municipioClean}, Fecha: ${fechaAlta}, Tarifa ${year}: ${standardRate}€`
        );

        // 6. Cálculo de prorrateo (ALTA_INICIAL) con precisión contable
        const diasFacturables = calculateBillableDays("ALTA_INICIAL", dayOfMonth);
        const importe = calculateImporte(diasFacturables, standardRate);

        functions.logger.info(
          `[createPanel] Días facturables: ${diasFacturables}, Importe: ${importe.toFixed(2)}€ (calculado con precisión en céntimos)`
        );

        // 7. Escritura atómica con batch
        const batch = db.batch();
        const now = admin.firestore.Timestamp.now();
        const effectiveDate = admin.firestore.Timestamp.fromDate(new Date(fechaAlta));

        // Panel ID único: Ubicación + Código (respetando tildes y unicode)
        // Compatible con datos históricos: "Móstoles_4321", "Getafe_1234"
        const panelId = `${municipioClean}_${codigoClean}`;

        functions.logger.info(`[createPanel] Panel ID generado: ${panelId}`);

        // 7.1. Crear documento en panels
        const panelRef = db.collection("panels").doc(panelId);
        batch.set(panelRef, {
          codigo: codigoClean,
          municipio: municipioClean,
          ubicacion: municipioClean,
          tipo: "PIV",
          estado: "ACTIVO",
          fechaAlta: effectiveDate,
          tarifaActual: standardRate,
          createdAt: now,
          createdBy: userEmail,
          updatedAt: now,
        });

        // 7.2. Crear candado de unicidad en panelCodes
        batch.set(codeRef, {
          panelId,
          codigo: codigoClean,
          createdAt: now,
        });

        // 7.3. Crear evento ALTA_INICIAL
        const eventId = `${Date.now()}_ALTA_INICIAL`;
        const eventRef = panelRef.collection("panelEvents").doc(eventId);
        batch.set(eventRef, {
          action: "ALTA_INICIAL",
          effectiveDate,
          effectiveDateLocal: fechaAlta,
          monthKey,
          panelId,
          codigo: codigoClean,
          municipio: municipioClean,
          diasFacturables,
          importe,
          tarifaAplicada: standardRate,
          observaciones: `Alta inicial del panel el ${fechaAlta}`,
          createdAt: now,
          createdBy: userEmail,
          isDeleted: false,
        });

        // 7.4. Crear documento de facturación para el mes
        const billingDocId = `${panelId}_${monthKey}`;
        const billingRef = db.collection("billingMonthlyPanel").doc(billingDocId);
        batch.set(billingRef, {
          panelId,
          codigo: codigoClean,
          municipio: municipioClean,
          monthKey,
          totalDiasFacturables: diasFacturables,
          totalImporte: importe,
          tarifaAplicada: standardRate,
          estadoAlCierre: "ACTIVO",
          createdAt: now,
          updatedAt: now,
          updatedBy: `createPanel:${userEmail}`,
        });

        // Commit batch (TRANSACCIÓN ATÓMICA)
        functions.logger.info("[createPanel] Ejecutando batch.commit()...");
        await batch.commit();

        functions.logger.info(
          `[createPanel] ✅ Panel creado exitosamente: ${panelId} (${codigoClean})`
        );

        // 8. Post-proceso: Actualizar summary del mes
        try {
          await recalculateSummary(monthKey);
          functions.logger.info(
            `[createPanel] Summary del mes ${monthKey} recalculado correctamente`
          );
        } catch (summaryErr: any) {
          functions.logger.warn(
            `[createPanel] ⚠️ No se pudo recalcular summary: ${summaryErr.message}`
          );
          // No fallar la operación principal si el summary falla
        }

        // ============================================================
        // RESPUESTA EXITOSA
        // ============================================================
        return {
          success: true,
          message: `Panel ${codigoClean} dado de alta correctamente en ${municipioClean}`,
          panelId,
          codigo: codigoClean,
          monthKey,
          diasFacturables,
          importe: parseFloat(importe.toFixed(2)),
          tarifa: standardRate,
        };

      } catch (err: any) {
        // ============================================================
        // MANEJO DEFENSIVO DE ERRORES
        // ============================================================
        functions.logger.error(
          `[createPanel] ❌ ERROR CRÍTICO: ${err.message}`,
          {
            codigo: codigoClean,
            municipio: municipioClean,
            fechaAlta,
            errorCode: err.code,
            errorStack: err.stack,
          }
        );

        // Si ya es HttpsError, relanzarla
        if (err instanceof functions.https.HttpsError) {
          throw err;
        }

        // Convertir errores inesperados a HttpsError
        throw new functions.https.HttpsError(
          "internal",
          `Error interno al crear el panel: ${err.message || "Error desconocido"}`
        );
      }
    }
  );
