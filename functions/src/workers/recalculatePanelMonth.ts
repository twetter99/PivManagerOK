import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { CloudTasksClient } from "@google-cloud/tasks";
import {
  calculateBillableDays,
  calculateImporte,
  getDayOfMonth,
  getPreviousMonthKey,
  getNewPanelState,
} from "../lib/billingRules";
import { recalculateSummary } from "../lib/summaryCalculations";
import { getStandardRateForYear } from "../lib/rateService";
import { PanelSnapshot } from "../lib/schemas";

interface PanelEventData {
  action: string;
  effectiveDateLocal: string;
  motivo?: string;
  snapshotBefore: PanelSnapshot | null;
  snapshotAfter: PanelSnapshot | null;
  idempotencyKey: string;
}

interface BillingState {
  totalDiasFacturables: number;
  totalImporte: number;
  estadoAlCierre: "ACTIVO" | "DESMONTADO" | "BAJA";
  tarifaAplicada: number;
}

const tasksClient = new CloudTasksClient();

/**
 * Motor de Recálculo: recalculatePanelMonth
 * 
 * Esta función es el "cerebro" del sistema. Recalcula la facturación de un panel
 * para un mes específico, aplicando todos los eventos en orden cronológico.
 * 
 * PROCESO:
 * 1. Lee el billingMonthlyPanel del mes anterior (N-1) para obtener el estado inicial
 * 2. Lee todos los panelEvents del mes actual (N) que no estén eliminados
 * 3. Aplica las reglas de prorrateo para cada evento
 * 4. Sobrescribe billingMonthlyPanel del mes actual en una transacción
 * 5. Actualiza panels.estadoActual en la misma transacción
 * 6. Encola una tarea en update-summary para recalcular los totales del mes
 * 
 * @param panelId - ID del panel a recalcular
 * @param monthKey - Mes a recalcular en formato YYYY-MM
 */
export async function recalculatePanelMonth(
  panelId: string,
  monthKey: string
): Promise<void> {
  const db = admin.firestore();

  functions.logger.info(`[recalculatePanelMonth] Iniciando recálculo: ${panelId} / ${monthKey}`);

  // 0. Obtener tarifa estándar del año objetivo
  const targetYear = monthKey.split("-")[0];
  const standardRate = await getStandardRateForYear(targetYear);
  functions.logger.info(`[recalculatePanelMonth] Tarifa base para ${targetYear}: ${standardRate}€`);

  // 1. Leer el billingMonthlyPanel del mes anterior (N-1) para obtener el estado inicial
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const previousBillingDocId = `${panelId}_${previousMonthKey}`;
  const previousBillingDoc = await db
    .collection("billingMonthlyPanel")
    .doc(previousBillingDocId)
    .get();

  let initialState: BillingState;

  if (previousBillingDoc.exists) {
    const prevData = previousBillingDoc.data()!;
    
    // PRIORIDAD ANUAL: Detectar cambio de año para forzar actualización automática
    const prevYear = previousMonthKey.split("-")[0];
    let tarifaAUsar: number;

    if (prevYear !== targetYear) {
      // CAMBIO DE AÑO: Forzar tarifa del nuevo año (actualización automática)
      tarifaAUsar = standardRate;
      functions.logger.warn(
        `[recalculatePanelMonth] 🔄 Actualización Automática por Cambio de Año: ${prevYear} → ${targetYear}. ` +
        `Tarifa anterior: ${prevData.tarifaAplicada || "N/A"}€, nueva tarifa: ${tarifaAUsar}€`
      );
    } else {
      // MISMO AÑO: Heredar tarifa (respeta personalizaciones manuales)
      tarifaAUsar = prevData.tarifaAplicada || standardRate;
      
      // Auditoría: Log si se está respetando un precio personalizado
      if (tarifaAUsar !== standardRate) {
        functions.logger.info(
          `[recalculatePanelMonth] 💰 Precio personalizado heredado: ${tarifaAUsar}€ ` +
          `(tarifa estándar ${targetYear}: ${standardRate}€)`
        );
      }
    }

    initialState = {
      totalDiasFacturables: 0, // Siempre empezamos desde 0 para el nuevo mes
      totalImporte: 0,
      estadoAlCierre: prevData.estadoAlCierre || "ACTIVO",
      tarifaAplicada: tarifaAUsar,
    };
    functions.logger.info(
      `[recalculatePanelMonth] Estado inicial desde mes anterior: ${prevData.estadoAlCierre}, tarifa aplicada: ${initialState.tarifaAplicada}€`
    );
  } else {
    // No hay mes anterior: panel nuevo o primer mes
    // Usar ACTIVO como estado inicial por defecto (panel recién instalado)
    initialState = {
      totalDiasFacturables: 0,
      totalImporte: 0,
      estadoAlCierre: "ACTIVO", // Por defecto, un panel sin historial se asume ACTIVO
      tarifaAplicada: standardRate, // Usar tarifa estándar del año objetivo
    };
    functions.logger.info(
      `[recalculatePanelMonth] Sin mes anterior. Estado inicial por defecto: ACTIVO, tarifa estándar: ${initialState.tarifaAplicada}€`
    );
  }

  // 2. Leer todos los panelEvents del mes N (where isDeleted != true)
  // Nota: NO filtramos por isDeleted en la query porque eventos legacy no tienen ese campo
  // Tampoco usamos orderBy() para evitar necesidad de índice compuesto
  const eventsSnapshot = await db
    .collection("panels")
    .doc(panelId)
    .collection("panelEvents")
    .where("monthKey", "==", monthKey)
    .get();

  // Filtrar eventos eliminados Y ordenar en memoria (evita índice compuesto)
  const validEvents = eventsSnapshot.docs
    .filter(doc => doc.data().isDeleted !== true)
    .sort((a, b) => {
      const getMillis = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = d.data() as any;
        const eff = data.effectiveDate;
        if (eff && typeof eff.toMillis === "function") {
          try { return eff.toMillis(); } catch { /* noop */ }
        }
        const local: string | undefined = data.effectiveDateLocal;
        const ms = local ? Date.parse(local) : NaN;
        return Number.isNaN(ms) ? 0 : ms;
      };
      return getMillis(a) - getMillis(b);
    });

  functions.logger.info(`[recalculatePanelMonth] Eventos encontrados: ${validEvents.length} (${eventsSnapshot.size} total)`);

  // 3. Aplicar las reglas de prorrateo calculando períodos de actividad
  let currentState = { ...initialState };
  let currentImporte = 0;
  let panelDoc: any = null;

  // Nuevo algoritmo: calcular períodos activos entre eventos
  let estadoActual = initialState.estadoAlCierre; // Estado heredado del mes anterior
  let periodos: Array<{ inicio: number; fin: number }> = [];
  let ultimoCambio = 1; // Día donde empieza el período actual

  // CASO ESPECIAL: Si hay un evento ALTA_INICIAL, el panel NO estaba activo antes
  // Resetear estado a BAJA hasta que ocurra el ALTA_INICIAL
  const hasAltaInicial = validEvents.some(doc => {
    const data = doc.data() as PanelEventData;
    return data.action === "ALTA_INICIAL";
  });

  if (hasAltaInicial) {
    estadoActual = "BAJA"; // El panel NO estaba activo antes del ALTA_INICIAL
    functions.logger.info(
      `[recalculatePanelMonth] Detectado ALTA_INICIAL: Estado inicial ajustado a BAJA (panel no existía antes)`
    );
  } else {
    functions.logger.info(
      `[recalculatePanelMonth] Estado inicial heredado: ${estadoActual}`
    );
  }

  // Si el panel inicia el mes ACTIVO y no hay eventos, facturar todo el mes
  if (validEvents.length === 0) {
    if (estadoActual === "ACTIVO") {
      periodos.push({ inicio: 1, fin: 30 });
      functions.logger.info(
        `[recalculatePanelMonth] Sin eventos: Panel ACTIVO heredado, facturando mes completo (30 días)`
      );
    } else {
      functions.logger.info(
        `[recalculatePanelMonth] Sin eventos: Panel ${estadoActual} heredado, sin facturación`
      );
    }
    // Mantener el estado heredado del mes anterior
    currentState.estadoAlCierre = estadoActual;
  } else {
    // Procesar eventos cronológicamente para determinar períodos activos
    for (const eventDoc of validEvents) {
      const event = eventDoc.data() as PanelEventData;
      const dayOfMonth = getDayOfMonth(event.effectiveDateLocal);

      functions.logger.info(
        `[recalculatePanelMonth] Procesando evento: ${event.action} (día ${dayOfMonth}), estado previo: ${estadoActual}`
      );

      // LÓGICA DE PERÍODOS ACTIVOS
      if (["ALTA", "ALTA_INICIAL", "REINSTALACION"].includes(event.action)) {
        // Si estaba DESMONTADO/BAJA antes, empezar nuevo período ACTIVO desde este día
        // Si estaba ACTIVO antes, NO hacer nada (ya está facturando)
        if (estadoActual !== "ACTIVO") {
          estadoActual = "ACTIVO";
          ultimoCambio = dayOfMonth; // Nuevo período comienza este día
          currentState.estadoAlCierre = "ACTIVO";
        }
      } else if (["DESMONTADO", "DESMONTAJE", "BAJA"].includes(event.action)) {
        // Si estaba ACTIVO, facturar desde el inicio del período hasta el día del desmontaje (inclusive)
        // REGLA CRÍTICA: DESMONTAJE/BAJA el día X SÍ factura el día X
        // El panel se desmonta a las 23:59, por lo que el día completo debe facturarse
        // - ALTA día 10, BAJA día 10 → 1 día (el día 10 completo)
        // - ALTA día 10, BAJA día 11 → 2 días (días 10 y 11)
        // - ALTA día 10, BAJA día 12 → 3 días (días 10, 11 y 12)
        if (estadoActual === "ACTIVO" && ultimoCambio <= dayOfMonth) {
          periodos.push({ inicio: ultimoCambio, fin: dayOfMonth });
        }
        // Cambiar a DESMONTADO/BAJA
        estadoActual = event.action === "BAJA" ? "BAJA" : "DESMONTADO";
        ultimoCambio = dayOfMonth + 1; // Siguiente día ya no factura
        currentState.estadoAlCierre = estadoActual;
      } else if (event.action === "CAMBIO_TARIFA") {
        // Actualizar tarifa sin afectar períodos
        const nuevaTarifa = event.snapshotAfter?.tarifaBaseMes ?? event.snapshotAfter?.tarifaAplicada;
        if (nuevaTarifa !== undefined) {
          currentState.tarifaAplicada = nuevaTarifa;
          functions.logger.info(
            `[recalculatePanelMonth] Tarifa actualizada a: ${currentState.tarifaAplicada}`
          );
        }
      } else if (event.action === "AJUSTE_MANUAL") {
        // Ajuste manual de importe
        if (event.snapshotAfter?.importeAjuste !== undefined) {
          currentImporte += event.snapshotAfter.importeAjuste;
          functions.logger.info(
            `[recalculatePanelMonth] Ajuste manual aplicado: ${event.snapshotAfter.importeAjuste}`
          );
        }
      } else if (event.action === "INTERVENCION") {
        // Intervención puntual: suma el importe sin afectar estado ni períodos
        // Estas intervenciones son "stateless" y solo afectan a la facturación del mes actual
        const importeIntervencion = event.snapshotAfter?.importeAjuste || 0;
        currentImporte += importeIntervencion;
        
        // Log con detalles de la intervención para auditoría
        const tipoIntervencion = (event as any).tipoIntervencion || "N/A";
        const concepto = (event as any).concepto || "Sin descripción";
        
        functions.logger.info(
          `[recalculatePanelMonth] Intervención aplicada: ${importeIntervencion}€ ` +
          `(Tipo: ${tipoIntervencion}, Concepto: "${concepto}", Estado panel: ${estadoActual})`
        );
        
        // Validación: advertir si la intervención ocurre en un panel inactivo
        if (estadoActual === "BAJA" || estadoActual === "DESMONTADO") {
          functions.logger.warn(
            `[recalculatePanelMonth] ⚠️ Intervención registrada en panel con estado ${estadoActual} ` +
            `(día ${dayOfMonth}). Verificar si es correcto.`
          );
        }
      }
    }

    // Si termina el mes ACTIVO, facturar hasta el día 30
    if (estadoActual === "ACTIVO" && ultimoCambio <= 30) {
      periodos.push({ inicio: ultimoCambio, fin: 30 });
    }
  }

  // Calcular total de días facturables sumando todos los períodos
  let currentDiasFacturables = 0;
  for (const periodo of periodos) {
    const dias = periodo.fin - periodo.inicio + 1;
    currentDiasFacturables += dias;
    functions.logger.info(
      `[recalculatePanelMonth] Período activo: días ${periodo.inicio}-${periodo.fin} = ${dias} días`
    );
  }

  // Aplicar tope máximo de 30 días
  currentDiasFacturables = Math.min(currentDiasFacturables, 30);

  // Calcular el importe total según los días y la tarifa
  currentImporte += calculateImporte(currentDiasFacturables, currentState.tarifaAplicada);

  currentState.totalDiasFacturables = currentDiasFacturables;
  
  // Normalizar a 2 decimales para evitar basura decimal en Firestore
  // Protege contra ajustes manuales con redondeo extraño (edge cases)
  currentState.totalImporte = Math.round(currentImporte * 100) / 100;

  functions.logger.info(
    `[recalculatePanelMonth] Resultado: ${currentDiasFacturables} días, ${currentState.totalImporte.toFixed(2)}€, estado: ${currentState.estadoAlCierre}`
  );

  // 4. Leer el panel para obtener datos denormalizados (código, municipio)
  if (!panelDoc) {
    panelDoc = await db.collection("panels").doc(panelId).get();
  }

  if (!panelDoc.exists) {
    throw new Error(`Panel ${panelId} no encontrado`);
  }

  const panelData = panelDoc.data()!;

  // Obtener el nombre del municipio (si existe una colección municipalities)
  let municipioNombre = panelData.municipioId; // Fallback: usar el ID

  try {
    const municipioDoc = await db.collection("municipalities").doc(panelData.municipioId).get();
    if (municipioDoc.exists) {
      municipioNombre = municipioDoc.data()!.nombre || panelData.municipioId;
    }
  } catch (error) {
    // Si no existe la colección municipalities, usamos el ID
    functions.logger.warn(`[recalculatePanelMonth] No se pudo leer el municipio: ${error}`);
  }

  // 5. Sobrescribir billingMonthlyPanel y actualizar panels.estadoActual (TRANSACCIÓN)
  // IMPORTANTE: Solo actualizamos panels.estadoActual si estamos recalculando el mes actual o más reciente
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const shouldUpdatePanelState = monthKey >= currentMonthKey; // Solo actualizar si es mes actual o futuro

  await db.runTransaction(async (transaction) => {
    const billingDocId = `${panelId}_${monthKey}`;
    const billingRef = db.collection("billingMonthlyPanel").doc(billingDocId);
    const panelRef = db.collection("panels").doc(panelId);

    // Sobrescribir (set) el billingMonthlyPanel
    transaction.set(billingRef, {
      panelId,
      monthKey,
      codigo: panelData.codigo,
      municipio: municipioNombre,
      totalDiasFacturables: currentState.totalDiasFacturables,
      totalImporte: currentState.totalImporte,
      estadoAlCierre: currentState.estadoAlCierre,
      tarifaAplicada: currentState.tarifaAplicada,
      updatedAt: admin.firestore.Timestamp.now(),
      schemaVersion: 1,
    });

    // Actualizar el estado actual del panel SOLO si estamos en el mes actual o futuro
    if (shouldUpdatePanelState) {
      transaction.update(panelRef, {
        estadoActual: currentState.estadoAlCierre,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      functions.logger.info(`[recalculatePanelMonth] panels.estadoActual actualizado a: ${currentState.estadoAlCierre}`);
    } else {
      functions.logger.info(`[recalculatePanelMonth] Mes histórico (${monthKey}), no se actualiza panels.estadoActual`);
    }

    functions.logger.info(`[recalculatePanelMonth] Transacción completada: billingMonthlyPanel actualizado`);
  });

  // 6. Recalcular summary del mes sincrónicamente
  try {
    await recalculateSummary(monthKey);
    functions.logger.info(`[recalculatePanelMonth] billingSummary actualizado para ${monthKey}`);
  } catch (summaryError) {
    functions.logger.error(`[recalculatePanelMonth] Error al actualizar summary:`, summaryError);
    // No propagamos el error para no fallar todo el proceso
  }

  functions.logger.info(`[recalculatePanelMonth] Recálculo completado para ${panelId} / ${monthKey}`);
}

/**
 * Encola una tarea en Cloud Tasks para actualizar el billingSummary del mes.
 * 
 * @param monthKey - Mes a actualizar en formato YYYY-MM
 */
async function enqueueUpdateSummaryTask(monthKey: string): Promise<void> {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const location = "europe-west1";
  const queue = "update-summary";

  if (!project) {
    throw new Error("No se pudo determinar el ID del proyecto (GCLOUD_PROJECT)");
  }

  const parent = tasksClient.queuePath(project, location, queue);
  const url = `https://${location}-${project}.cloudfunctions.net/updateSummaryTask`;

  // Usamos monthKey como taskId para deduplicación
  // Si hay múltiples recálculos en el mismo mes, solo se encola una tarea de summary
  const task = {
    name: `${parent}/tasks/${monthKey.replace("-", "")}`, // "2025-11" -> "202511"
    httpRequest: {
      httpMethod: "POST" as const,
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(
        JSON.stringify({
          monthKey,
        })
      ).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
      },
    },
  };

  try {
    await tasksClient.createTask({ parent, task });
    functions.logger.info(`[enqueueUpdateSummaryTask] Tarea encolada para mes ${monthKey}`);
  } catch (error: any) {
    // Si la tarea ya existe (mismo taskId), no es un error
    if (error.code === 6) {
      // ALREADY_EXISTS
      functions.logger.info(`[enqueueUpdateSummaryTask] Tarea ya existe para mes ${monthKey} (OK)`);
    } else {
      throw error;
    }
  }
}
