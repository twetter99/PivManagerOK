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

interface PanelEventData {
  action: string;
  effectiveDateLocal: string;
  motivo?: string;
  snapshotBefore: any;
  snapshotAfter: any;
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
    initialState = {
      totalDiasFacturables: 0, // Siempre empezamos desde 0 para el nuevo mes
      totalImporte: 0,
      estadoAlCierre: prevData.estadoAlCierre || "ACTIVO",
      tarifaAplicada: 37.70, // Tarifa estándar 2025 (NO heredar del mes anterior)
    };
    functions.logger.info(
      `[recalculatePanelMonth] Estado inicial desde mes anterior: ${prevData.estadoAlCierre}, tarifa fija 2025: 37.70`
    );
  } else {
    // No hay mes anterior: panel nuevo o primer mes
    const panelDoc = await db.collection("panels").doc(panelId).get();
    if (!panelDoc.exists) {
      throw new Error(`Panel ${panelId} no encontrado`);
    }
    const panelData = panelDoc.data()!;
    initialState = {
      totalDiasFacturables: 0,
      totalImporte: 0,
      estadoAlCierre: panelData.estadoActual || "ACTIVO",
      tarifaAplicada: panelData.tarifaBaseMes || 37.70,
    };
    functions.logger.info(
      `[recalculatePanelMonth] Sin mes anterior. Estado inicial desde panel: ${panelData.estadoActual}`
    );
  }

  // 2. Leer todos los panelEvents del mes N (where isDeleted != true)
  const eventsSnapshot = await db
    .collection("panels")
    .doc(panelId)
    .collection("panelEvents")
    .where("monthKey", "==", monthKey)
    .where("isDeleted", "==", false)
    .orderBy("effectiveDate", "asc") // Orden cronológico
    .get();

  functions.logger.info(`[recalculatePanelMonth] Eventos encontrados: ${eventsSnapshot.size}`);

  // 3. Aplicar las reglas de prorrateo para cada evento
  let currentState = { ...initialState };
  let currentDiasFacturables = 0;
  let currentImporte = 0;
  let panelDoc: any = null;

  for (const eventDoc of eventsSnapshot.docs) {
    const event = eventDoc.data() as PanelEventData;
    const dayOfMonth = getDayOfMonth(event.effectiveDateLocal);

    functions.logger.info(
      `[recalculatePanelMonth] Procesando evento: ${event.action} (día ${dayOfMonth})`
    );

    // Calcular días facturables según la acción
    const diasEvento = calculateBillableDays(event.action, dayOfMonth);

    // Acumular días facturables
    currentDiasFacturables += diasEvento;

    // Actualizar estado del panel según el evento
    if (["ALTA", "ALTA_INICIAL", "REINSTALACION", "DESMONTADO", "BAJA"].includes(event.action)) {
      currentState.estadoAlCierre = getNewPanelState(event.action);
    }

    // Si el evento es CAMBIO_TARIFA, actualizar la tarifa aplicada
    if (event.action === "CAMBIO_TARIFA" && event.snapshotAfter?.tarifaBaseMes) {
      currentState.tarifaAplicada = event.snapshotAfter.tarifaBaseMes;
      functions.logger.info(`[recalculatePanelMonth] Tarifa actualizada a: ${currentState.tarifaAplicada}`);
    }

    // Si el evento es AJUSTE_MANUAL, puede tener un importe específico
    if (event.action === "AJUSTE_MANUAL" && event.snapshotAfter?.importeAjuste !== undefined) {
      currentImporte += event.snapshotAfter.importeAjuste;
      functions.logger.info(`[recalculatePanelMonth] Ajuste manual aplicado: ${event.snapshotAfter.importeAjuste}`);
    }
  }

  // LÓGICA CRÍTICA: Panel ACTIVO sin eventos = mes completo (30 días)
  if (currentState.estadoAlCierre === "ACTIVO" && currentDiasFacturables === 0) {
    currentDiasFacturables = 30;
    functions.logger.info(`[recalculatePanelMonth] Panel ACTIVO sin eventos: asignando 30 días automáticamente`);
  }

  // Calcular el importe total según los días acumulados y la tarifa
  currentImporte += calculateImporte(currentDiasFacturables, currentState.tarifaAplicada);

  currentState.totalDiasFacturables = currentDiasFacturables;
  currentState.totalImporte = currentImporte;

  functions.logger.info(
    `[recalculatePanelMonth] Resultado: ${currentDiasFacturables} días, ${currentImporte.toFixed(2)}€, estado: ${currentState.estadoAlCierre}`
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

    // Actualizar el estado actual del panel
    transaction.update(panelRef, {
      estadoActual: currentState.estadoAlCierre,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    functions.logger.info(`[recalculatePanelMonth] Transacción completada: billingMonthlyPanel y panels actualizados`);
  });

  // 6. Encolar tarea en update-summary para recalcular los totales del mes
  await enqueueUpdateSummaryTask(monthKey);

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
  const url = `https://${location}-${project}.cloudfunctions.net/updateSummary`;

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
