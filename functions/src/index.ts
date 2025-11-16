import * as admin from "firebase-admin";

// Inicializar Firebase Admin SDK
admin.initializeApp();

// ============================================================================
// FUNCIONES DE ADMINISTRACIÓN (Paso 2)
// ============================================================================
export { setUserRole } from "./admin/setUserRole";
export { importBaseMonth } from "./admin/importBaseMonth";
export { regenerateMonthBilling } from "./commands/regenerateMonthBilling";
export { cleanMonthDuplicates } from "./commands/cleanMonthDuplicates";
export { diagnoseDuplicates } from "./commands/diagnoseDuplicates";
export { cleanupDuplicatePanels } from "./commands/cleanupDuplicatePanels";
export { deleteMonthData } from "./commands/deleteMonthData";
export { createNovemberTransitionEvents } from "./commands/createNovemberTransitionEvents";
export { findGetafePanel } from "./commands/findGetafePanel";

// ============================================================================
// COMANDOS (Paso 3 - Patrón Asíncrono)
// ============================================================================
export { requestPanelChange } from "./commands/requestPanelChange";

// ============================================================================
// COMANDOS (Paso 6 - Gestión de Eventos)
// ============================================================================
export { deletePanelEvent } from "./commands/deletePanelEvent";
export { updatePanelEvent } from "./commands/updatePanelEvent";

// ============================================================================
// WORKERS (Paso 4 - Motor de Recálculo)
// ============================================================================
export { processPanelEventTask } from "./workers/processPanelEventTask";

// ============================================================================
// WORKERS (Paso 5 - Agregación de Totales)
// ============================================================================
export { updateSummaryTask } from "./workers/updateSummaryTask";

// ============================================================================
// SCHEDULED JOBS (Paso 6 - Cierre Automático de Mes)
// ============================================================================
export { closeMonthJob } from "./scheduled/closeMonthJob";

// ============================================================================
// REPORTES (Paso 7)
// ============================================================================
export { generateReport } from "./reports/generateReport";
