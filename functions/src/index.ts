import * as admin from "firebase-admin";

// Inicializar Firebase Admin SDK
admin.initializeApp();

// ============================================================================
// FUNCIONES DE ADMINISTRACIÓN (Paso 2)
// ============================================================================
export { setUserRole } from "./admin/setUserRole";
export { importBaseMonth } from "./admin/importBaseMonth";
export { createNextMonth } from "./admin/createNextMonth";
export { toggleMonthLock } from "./admin/toggleMonthLock";
export { deleteMonth } from "./admin/deleteMonth";
export { resyncMonthFromPrevious } from "./admin/resyncMonthFromPrevious";
export { regenerateMonthBilling } from "./commands/regenerateMonthBilling";
export { cleanMonthDuplicates } from "./commands/cleanMonthDuplicates";
export { diagnoseDuplicates } from "./commands/diagnoseDuplicates";
export { cleanupDuplicatePanels } from "./commands/cleanupDuplicatePanels";
export { deleteMonthData } from "./commands/deleteMonthData";
export { createNovemberTransitionEvents } from "./commands/createNovemberTransitionEvents";
export { findGetafePanel } from "./commands/findGetafePanel";
export { verifyOctoberEvents } from "./commands/verifyOctoberEvents";

// ============================================================================
// COMANDOS (Paso 3 - Patrón Asíncrono)
// ============================================================================
export { requestPanelChange } from "./commands/requestPanelChange";

// ============================================================================
// COMANDOS (Paso 6 - Gestión de Eventos)
// ============================================================================
export { deletePanelEvent } from "./commands/deletePanelEvent";
export { deleteAllPanelEvents } from "./commands/deleteAllPanelEvents";
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
// SCHEDULED JOBS (ELIMINADO - Cierre manual desde frontend)
// ============================================================================
// export { closeMonthJob } from "./scheduled/closeMonthJob"; // DESHABILITADO

// ============================================================================
// REPORTES (Paso 7)
// ============================================================================
export { generateReport } from "./reports/generateReport";
