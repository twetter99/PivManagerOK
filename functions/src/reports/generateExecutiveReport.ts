/**
 * generateExecutiveReport - Informe ejecutivo financiero mensual
 * 
 * Genera un reporte con las métricas financieras principales del mes:
 * - Resumen financiero global
 * - Actividad del mes (altas, bajas, ajustes)
 * - Top municipios por facturación
 * - Indicadores de calidad
 * - Eventos destacados
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

interface ExecutiveReport {
  monthKey: string;
  generatedAt: string;
  
  resumenFinanciero: {
    totalFacturado: number;
    totalPaneles: number;
    panelesActivos: number;
    panelesParciales: number;
    panelesBaja: number;
    importePromedio: number;
  };
  
  actividadMes: {
    altasNuevas: { cantidad: number; importeGenerado: number };
    bajas: { cantidad: number; importePerdido: number };
    desmontajes: { cantidad: number };
    reinstalaciones: { cantidad: number };
    ajustesManuales: { cantidad: number; importeTotal: number };
  };
  
  topMunicipios: Array<{
    nombre: string;
    importe: number;
    paneles: number;
  }>;
  
  indicadoresCalidad: {
    panelesCompletos: number;
    panelesParciales: number;
    panelesProblematicos: number;
  };
  
  eventosDestacados: Array<{
    fecha: string;
    tipo: string;
    panel: string;
    municipio: string;
    importe: number;
  }>;
}

export const generateExecutiveReport = functions
  .region("europe-west1")
  .https.onCall(async (data: { monthKey: string }, context) => {
    // 1. Validación de autenticación
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado para generar el informe"
      );
    }

    const userEmail = context.auth.token.email || "unknown";

    // Verificar que el usuario es admin
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData || userData.role !== "admin") {
      functions.logger.warn(
        `[generateExecutiveReport] ❌ Intento no autorizado por ${userEmail}`
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo administradores pueden generar informes ejecutivos"
      );
    }

    const { monthKey } = data;

    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "monthKey debe estar en formato YYYY-MM"
      );
    }

    functions.logger.info(
      `[generateExecutiveReport] Generando informe para ${monthKey} por ${userEmail}`
    );

    try {
      // 2. Leer billingSummary del mes
      const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
      
      if (!summaryDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          `No existe facturación para el mes ${monthKey}`
        );
      }

      const summary = summaryDoc.data()!;

      // 3. Leer todos los paneles del mes
      const billingSnapshot = await db
        .collection("billingMonthlyPanel")
        .where("monthKey", "==", monthKey)
        .get();

      // 4. Calcular métricas por municipio
      const byMunicipio: { [key: string]: { importe: number; paneles: number } } = {};
      let panelesCompletos = 0;
      let panelesParciales = 0;
      let panelesProblematicos = 0;
      let panelesBaja = 0;

      billingSnapshot.docs.forEach(doc => {
        const panel = doc.data();
        
        // Extraer el nombre del municipio limpio (el campo municipio contiene panelId completo)
        // Formato: "Municipio_Nombre_codigo" → extraer solo "Municipio Nombre"
        let municipioLimpio = "Sin municipio";
        if (panel.municipio) {
          // Quitar el código del final (últimos dígitos después del último _)
          const partes = panel.municipio.split('_');
          if (partes.length > 1) {
            // Quitar la última parte (el código) y unir con espacios
            partes.pop();
            municipioLimpio = partes.join(' ').replace(/_/g, ' ');
          } else {
            municipioLimpio = panel.municipio;
          }
        }
        
        // Agrupar por municipio
        if (!byMunicipio[municipioLimpio]) {
          byMunicipio[municipioLimpio] = { importe: 0, paneles: 0 };
        }
        byMunicipio[municipioLimpio].importe += panel.totalImporte;
        byMunicipio[municipioLimpio].paneles += 1;

        // Indicadores de calidad
        if (panel.totalDiasFacturables === 30) {
          panelesCompletos++;
        } else if (panel.totalDiasFacturables > 0 && panel.totalDiasFacturables < 30) {
          panelesParciales++;
        }

        if (panel.estadoAlCierre === "ACTIVO" && panel.totalImporte === 0) {
          panelesProblematicos++;
        }

        if (panel.estadoAlCierre === "BAJA") {
          panelesBaja++;
        }
      });

      // Top 5 municipios ordenados por importe
      const topMunicipios = Object.entries(byMunicipio)
        .map(([nombre, data]) => ({
          nombre,
          importe: data.importe,
          paneles: data.paneles,
        }))
        .sort((a, b) => b.importe - a.importe)
        .slice(0, 5);

      // 5. Leer eventos del mes para actividad
      // En lugar de collectionGroup (que requiere índice), leemos desde cada panel
      let altasNuevas = 0;
      let importeAltasNuevas = 0;
      let bajas = 0;
      let importeBajas = 0;
      let desmontajes = 0;
      let reinstalaciones = 0;
      let ajustesManuales = 0;
      let importeAjustes = 0;

      const eventosDestacados: Array<{
        fecha: string;
        tipo: string;
        panel: string;
        municipio: string;
        importe: number;
      }> = [];

      // Obtener lista única de panelIds del mes
      const uniquePanelIds = new Set<string>();
      billingSnapshot.docs.forEach(doc => {
        uniquePanelIds.add(doc.data().panelId);
      });

      // Cache para almacenar información de paneles y evitar lecturas duplicadas
      const panelInfoCache = new Map<string, { codigo: string; municipio: string }>();
      
      // Cache para almacenar importes de facturación del mes
      const billingCache = new Map<string, number>();
      billingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        billingCache.set(data.panelId, data.totalImporte || 0);
      });

      // Leer eventos de cada panel (máximo 500 paneles, procesamos en lotes)
      const panelIdsArray = Array.from(uniquePanelIds);
      const BATCH_SIZE = 10; // Firestore permite hasta 10 queries paralelas
      
      for (let i = 0; i < panelIdsArray.length; i += BATCH_SIZE) {
        const batch = panelIdsArray.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (panelId) => {
          const eventsSnapshot = await db
            .collection("panels")
            .doc(panelId)
            .collection("panelEvents")
            .where("monthKey", "==", monthKey)
            .get();
          return { panelId, events: eventsSnapshot.docs };
        });

        const batchResults = await Promise.all(batchPromises);

        for (const { panelId, events } of batchResults) {
          // Obtener información del panel una sola vez (con caché)
          if (!panelInfoCache.has(panelId)) {
            const panelDoc = await db.collection("panels").doc(panelId).get();
            if (panelDoc.exists) {
              const panelData = panelDoc.data();
              panelInfoCache.set(panelId, {
                codigo: panelData?.codigo || "N/A",
                municipio: panelData?.ubicacion || "N/A"
              });
            } else {
              panelInfoCache.set(panelId, { codigo: "N/A", municipio: "N/A" });
            }
          }

          const panelInfo = panelInfoCache.get(panelId)!;

          for (const eventDoc of events) {
            const event = eventDoc.data();
            
            // Ignorar eventos eliminados
            if (event.isDeleted === true) continue;

            switch (event.action) {
              case "ALTA_INICIAL":
              case "ALTA":
                altasNuevas++;
                importeAltasNuevas += event.importe || 0;
                eventosDestacados.push({
                  fecha: event.effectiveDateLocal,
                  tipo: event.action,
                  panel: panelInfo.codigo,
                  municipio: panelInfo.municipio,
                  importe: event.importe || 0,
                });
                break;
              
              case "BAJA":
                bajas++;
                // Para bajas, el importe perdido está en el panel antes de la baja
                eventosDestacados.push({
                  fecha: event.effectiveDateLocal,
                  tipo: event.action,
                  panel: panelInfo.codigo,
                  municipio: panelInfo.municipio,
                  importe: 0,
                });
                break;
              
              case "DESMONTADO":
              case "DESMONTAJE":
                desmontajes++;
                // Para desmontajes, mostrar el importe facturado hasta el desmontaje
                const importeDesmontaje = billingCache.get(panelId) || 0;
                eventosDestacados.push({
                  fecha: event.effectiveDateLocal,
                  tipo: event.action,
                  panel: panelInfo.codigo,
                  municipio: panelInfo.municipio,
                  importe: importeDesmontaje,
                });
                break;
              
              case "REINSTALACION":
                reinstalaciones++;
                eventosDestacados.push({
                  fecha: event.effectiveDateLocal,
                  tipo: event.action,
                  panel: panelInfo.codigo,
                  municipio: panelInfo.municipio,
                  importe: event.importe || 0,
                });
                break;
              
              case "AJUSTE_MANUAL":
                ajustesManuales++;
                const ajuste = event.snapshotAfter?.importeAjuste || 0;
                importeAjustes += ajuste;
                eventosDestacados.push({
                  fecha: event.effectiveDateLocal,
                  tipo: event.action,
                  panel: panelInfo.codigo,
                  municipio: panelInfo.municipio,
                  importe: ajuste,
                });
                break;
            }
          }
        }
      }

      // Ordenar eventos por fecha
      eventosDestacados.sort((a, b) => a.fecha.localeCompare(b.fecha));

      // 6. Calcular importe promedio
      const importePromedio = billingSnapshot.size > 0
        ? summary.totalImporteMes / billingSnapshot.size
        : 0;

      // 7. Construir reporte
      const report: ExecutiveReport = {
        monthKey,
        generatedAt: new Date().toISOString(),
        
        resumenFinanciero: {
          totalFacturado: summary.totalImporteMes,
          totalPaneles: billingSnapshot.size,
          panelesActivos: summary.panelesActivos,
          panelesParciales: summary.panelesParciales,
          panelesBaja,
          importePromedio: Math.round(importePromedio * 100) / 100,
        },
        
        actividadMes: {
          altasNuevas: {
            cantidad: altasNuevas,
            importeGenerado: Math.round(importeAltasNuevas * 100) / 100,
          },
          bajas: {
            cantidad: bajas,
            importePerdido: Math.round(importeBajas * 100) / 100,
          },
          desmontajes: { cantidad: desmontajes },
          reinstalaciones: { cantidad: reinstalaciones },
          ajustesManuales: {
            cantidad: ajustesManuales,
            importeTotal: Math.round(importeAjustes * 100) / 100,
          },
        },
        
        topMunicipios: topMunicipios.map(m => ({
          ...m,
          importe: Math.round(m.importe * 100) / 100,
        })),
        
        indicadoresCalidad: {
          panelesCompletos,
          panelesParciales,
          panelesProblematicos,
        },
        
        eventosDestacados: eventosDestacados.map(e => ({
          ...e,
          importe: Math.round(e.importe * 100) / 100,
        })),
      };

      functions.logger.info(
        `[generateExecutiveReport] ✅ Informe generado: ${billingSnapshot.size} paneles, ${eventosDestacados.length} eventos`
      );

      return report;

    } catch (error: any) {
      functions.logger.error("[generateExecutiveReport] ❌ Error:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Error al generar el informe: ${error.message}`
      );
    }
  });
