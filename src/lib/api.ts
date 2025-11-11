/**
 * API Functions for PIV Manager Pro
 * Connects to Firebase Cloud Functions
 */

import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db, callableFunction } from "./firebase";

// ============================================================================
// TYPES
// ============================================================================

export interface BillingSummary {
  monthKey: string;
  totalImporteMes: number;
  totalPanelesFacturables: number;
  panelesActivos: number;
  panelesParciales: number;
  totalEventos: number;
  isLocked: boolean;
  updatedAt: any;
}

export interface BillingMonthlyPanel {
  panelId: string;
  monthKey: string;
  codigo: string;
  municipio: string;
  totalDiasFacturables: number;
  totalImporte: number;
  estadoAlCierre: "ACTIVO" | "DESMONTADO" | "BAJA";
  tarifaAplicada: number;
  updatedAt: any;
}

// ============================================================================
// DASHBOARD - SUMMARY (KPIs)
// ============================================================================

/**
 * Obtiene el resumen de facturación de un mes (billingSummary)
 * Usado en el Dashboard para mostrar los KPIs principales
 */
export async function getSummary(monthKey: string): Promise<BillingSummary | null> {
  try {
    const summaryRef = doc(db, "billingSummary", monthKey);
    const summaryDoc = await getDoc(summaryRef);

    if (!summaryDoc.exists()) {
      return null;
    }

    return summaryDoc.data() as BillingSummary;
  } catch (error) {
    console.error("Error fetching summary:", error);
    throw error;
  }
}

// ============================================================================
// DASHBOARD - MONTHLY BILLING (Tabla de Paneles)
// ============================================================================

/**
 * Obtiene la facturación mensual de todos los paneles (billingMonthlyPanel)
 * Usado en la tabla de paneles del Dashboard
 */
export async function getMonthlyBilling(monthKey: string): Promise<BillingMonthlyPanel[]> {
  try {
    const billingRef = collection(db, "billingMonthlyPanel");
    const q = query(billingRef, where("monthKey", "==", monthKey));
    const querySnapshot = await getDocs(q);

    const panels: BillingMonthlyPanel[] = [];

    querySnapshot.forEach((doc) => {
      panels.push(doc.data() as BillingMonthlyPanel);
    });

    // Ordenar por código
    panels.sort((a, b) => a.codigo.localeCompare(b.codigo));

    return panels;
  } catch (error) {
    console.error("Error fetching monthly billing:", error);
    throw error;
  }
}

// ============================================================================
// PANEL EVENTS (CRUD)
// ============================================================================

/**
 * Solicita un cambio en un panel (crear evento)
 */
export async function requestPanelChange(data: {
  panelId: string;
  action: string;
  effectiveDateLocal: string;
  monthKey: string;
  diasFacturables: number;
  importeAFacturar: number;
  motivo?: string;
  snapshotBefore: any;
  snapshotAfter: any;
}): Promise<{ status: string; eventId: string; idempotencyKey: string }> {
  const fn = callableFunction<typeof data, any>("requestPanelChange");
  const result = await fn(data);
  return result.data;
}

/**
 * Actualiza un evento existente
 */
export async function updatePanelEvent(data: {
  panelId: string;
  eventId: string;
  updates: {
    motivo?: string;
    diasFacturables?: number;
    importeAFacturar?: number;
  };
}): Promise<{ success: boolean; eventId: string }> {
  const fn = callableFunction<typeof data, any>("updatePanelEvent");
  const result = await fn(data);
  return result.data;
}

/**
 * Elimina un evento (soft-delete)
 */
export async function deletePanelEvent(data: {
  panelId: string;
  eventId: string;
}): Promise<{ success: boolean; eventId: string }> {
  const fn = callableFunction<typeof data, any>("deletePanelEvent");
  const result = await fn(data);
  return result.data;
}

// ============================================================================
// REPORTS
// ============================================================================

/**
 * Genera un reporte (PDF o Excel) y devuelve una Signed URL
 */
export async function generateReport(data: {
  monthKey: string;
  type: "pdf" | "excel";
}): Promise<{ success: boolean; url: string; fileName: string; expiresAt: string }> {
  const fn = callableFunction<typeof data, any>("generateReport");
  const result = await fn(data);
  return result.data;
}

// ============================================================================
// ADMIN
// ============================================================================

/**
 * Importa paneles masivamente desde CSV
 */
export async function importBaseMonth(data: {
  monthKey: string;
  data: Array<{
    codigo: string;
    municipioId: string;
    municipioNombre: string;
    tarifaBaseMes: number;
    ubicacion?: string;
    tipo?: string;
    fechaAlta: string;
    diasFacturables: number;
    importeAFacturar: number;
  }>;
}): Promise<{
  success: boolean;
  panelsCreated: number;
  monthKey: string;
  totalImporteMes: number;
}> {
  const fn = callableFunction<typeof data, any>("importBaseMonth");
  const result = await fn(data);
  return result.data;
}

/**
 * Asigna un rol a un usuario
 */
export async function setUserRole(data: {
  uid: string;
  role: "admin" | "user";
}): Promise<{ success: boolean; uid: string; role: string }> {
  const fn = callableFunction<typeof data, any>("setUserRole");
  const result = await fn(data);
  return result.data;
}
