/**
 * AdminConsoleModal Component
 * Modal con pestañas para organizar todas las herramientas administrativas
 * Pestañas: General, Operaciones Mensuales, Mantenimiento, Legacy/Dev
 */

"use client";

import { useState, useEffect } from "react";
import YearlyRatesManager from "./admin/YearlyRatesManager";
import CreatePanelForm from "./admin/CreatePanelForm";

interface AdminConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthKey: string;
  isLocked: boolean;
  onMonthClosed?: () => void;
}

type Tab = "general" | "monthly" | "inventory" | "maintenance" | "legacy";

export default function AdminConsoleModal({
  isOpen,
  onClose,
  monthKey,
  isLocked,
  onMonthClosed,
}: AdminConsoleModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  if (!isOpen) return null;

  const tabs = [
    { id: "general" as Tab, label: "🟢 General", color: "#52C41A" },
    { id: "monthly" as Tab, label: "🔵 Operaciones Mensuales", color: "#1890FF" },
    { id: "inventory" as Tab, label: "📦 Inventario / Altas", color: "#722ED1" },
    { id: "maintenance" as Tab, label: "🟠 Mantenimiento", color: "#FA8C16" },
    { id: "legacy" as Tab, label: "⚪ Legacy / Dev", color: "#8C8C8C" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFF",
          borderRadius: "4px",
          maxWidth: "1000px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #EAEAEA",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#000",
              margin: 0,
            }}
          >
            ⚙️ Consola de Administración
          </h2>
          <button
            onClick={onClose}
            style={{
              fontSize: "24px",
              color: "#8C8C8C",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            padding: "0 24px",
            borderBottom: "1px solid #EAEAEA",
            backgroundColor: "#FAFAFA",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === tab.id ? tab.color : "#595959",
                backgroundColor:
                  activeTab === tab.id ? "#FFF" : "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab.id ? `2px solid ${tab.color}` : "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "24px",
          }}
        >
          {activeTab === "general" && (
            <GeneralTab monthKey={monthKey} />
          )}
          {activeTab === "monthly" && (
            <MonthlyOpsTab
              monthKey={monthKey}
              isLocked={isLocked}
              onMonthClosed={onMonthClosed}
            />
          )}
          {activeTab === "inventory" && <InventoryTab monthKey={monthKey} />}
          {activeTab === "maintenance" && (
            <MaintenanceTab monthKey={monthKey} isLocked={isLocked} />
          )}
          {activeTab === "legacy" && <LegacyTab monthKey={monthKey} />}
        </div>
      </div>
    </div>
  );
}

/**
 * TAB 1: GENERAL
 * Gestión de tarifas anuales y usuarios
 */
function GeneralTab({ monthKey }: { monthKey: string }) {
  return (
    <div>
      <YearlyRatesManager />

      <div
        style={{
          marginTop: "32px",
          paddingTop: "24px",
          borderTop: "1px solid #EAEAEA",
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#000",
            marginBottom: "16px",
          }}
        >
          👥 Gestión de Usuarios
        </h3>
        <p style={{ fontSize: "13px", color: "#8C8C8C" }}>
          Funcionalidad de setUserRole pendiente de integración
        </p>
      </div>
    </div>
  );
}

/**
 * TAB 2: OPERACIONES MENSUALES
 * Crear mes siguiente, cerrar/abrir mes
 */
function MonthlyOpsTab({
  monthKey,
  isLocked,
  onMonthClosed,
}: {
  monthKey: string;
  isLocked: boolean;
  onMonthClosed?: () => void;
}) {
  return (
    <div>
      <CreateNextMonthSection monthKey={monthKey} isLocked={isLocked} />
      <ToggleMonthLockSection
        monthKey={monthKey}
        isLocked={isLocked}
        onMonthClosed={onMonthClosed}
      />
    </div>
  );
}

/**
 * TAB 3: INVENTARIO / ALTAS
 * Alta de paneles individuales
 */
function InventoryTab({ monthKey }: { monthKey: string }) {
  const [rates, setRates] = useState<Array<{year: string; importe: number}>>([]);
  const [existingLocations, setExistingLocations] = useState<string[]>([]);
  const [loadingRates, setLoadingRates] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);

  useEffect(() => {
    // Pequeño delay para asegurar que Firebase esté completamente inicializado
    const timer = setTimeout(() => {
      loadRates();
      loadLocations();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [monthKey]);

  const loadRates = async () => {
    try {
      const { collection, query, orderBy, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      const ratesRef = collection(db, "rates");
      const q = query(ratesRef, orderBy("year", "asc"));
      const snapshot = await getDocs(q);

      const loadedRates = snapshot.docs.map((doc) => ({
        year: doc.id,
        importe: doc.data().importe,
      }));

      setRates(loadedRates);
    } catch (err) {
      console.error("Error cargando tarifas:", err);
    } finally {
      setLoadingRates(false);
    }
  };

  const loadLocations = async () => {
    try {
      const { functions } = await import("@/lib/firebase");
      const { httpsCallable } = await import("firebase/functions");
      
      console.log("[InventoryTab] Llamando a getUniqueLocations...");
      
      // Llamar a la Cloud Function optimizada
      const getUniqueLocationsFn = httpsCallable<
        void,
        { locations: string[] }
      >(functions, "getUniqueLocations");
      
      const result = await getUniqueLocationsFn();
      
      console.log(`[InventoryTab] ✅ Ubicaciones recibidas: ${result.data.locations.length}`);
      
      setExistingLocations(result.data.locations);
    } catch (err: any) {
      console.error("[InventoryTab] ❌ Error cargando ubicaciones:", err);
      console.error("[InventoryTab] Error code:", err.code);
      console.error("[InventoryTab] Error message:", err.message);
      
      // Si falla, dejamos el array vacío (el usuario podrá escribir manualmente)
      setExistingLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  };

  const isLoading = loadingRates || loadingLocations;

  if (isLoading) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#8C8C8C" }}>
        ⏳ Cargando datos...
      </div>
    );
  }

  return (
    <div>
      <CreatePanelForm rates={rates} existingLocations={existingLocations} />
    </div>
  );
}

/**
 * TAB 4: MANTENIMIENTO
 * Importar CSV, resincronizar mes
 */
function MaintenanceTab({
  monthKey,
  isLocked,
}: {
  monthKey: string;
  isLocked: boolean;
}) {
  return (
    <div>
      <div
        style={{
          padding: "16px",
          marginBottom: "24px",
          backgroundColor: "#FFF7E6",
          border: "1px solid #FFD591",
          borderRadius: "4px",
          fontSize: "13px",
          color: "#8C5F00",
        }}
      >
        ⚠️ <strong>Precaución:</strong> Estas operaciones modifican datos críticos.
        Úsalas solo cuando sea necesario.
      </div>

      <ImportBaseMonthSection isLocked={isLocked} monthKey={monthKey} />
      <ResyncMonthSection monthKey={monthKey} isLocked={isLocked} />
      <DeleteMonthSection monthKey={monthKey} isLocked={isLocked} />
    </div>
  );
}

/**
 * TAB 4: LEGACY / DEV
 * Herramientas obsoletas o de desarrollo
 */
function LegacyTab({ monthKey }: { monthKey: string }) {
  return (
    <div>
      <div
        style={{
          padding: "16px",
          marginBottom: "24px",
          backgroundColor: "#F5F5F5",
          border: "1px solid #D9D9D9",
          borderRadius: "4px",
          fontSize: "13px",
          color: "#595959",
        }}
      >
        ℹ️ Herramientas de desarrollo y utilidades temporales. No usar en producción sin supervisión.
      </div>

      <RegenerateMonthSection monthKey={monthKey} />
      <DiagnoseSection monthKey={monthKey} />
      <CleanupDuplicatesSection />
      <RegenerateOctoberNovemberSection />
      <CreateTransitionEventsSection />
      <VerifyEventsSection />
    </div>
  );
}

// ============================================================================
// SECCIONES REUTILIZABLES (del AdminSection original)
// ============================================================================

/**
 * Importar base del mes desde CSV
 */
function ImportBaseMonthSection({ isLocked, monthKey }: { isLocked: boolean; monthKey: string }) {
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setImportError("El archivo debe ser un CSV válido");
      return;
    }

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await file.text();
      const lines = text.split("\n");

      if (lines.length < 2) {
        throw new Error("El archivo debe contener al menos un panel");
      }

      const panels = lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line, index) => {
          const parts = line.includes("\t")
            ? line.split("\t")
            : line.includes(";")
            ? line.split(";")
            : line.split(",");

          const [municipio, codigo, tarifa] = parts.map((s) => s.trim());

          if (!municipio || !codigo || !tarifa) {
            console.warn(`⚠️ Línea ${index + 2} incompleta:`, line);
            return null;
          }

          const codigoClean = codigo.trim();
          const tarifaClean = tarifa.replace(/[€\s]/g, "").replace(",", ".");
          const tarifaNum = parseFloat(tarifaClean);

          if (isNaN(tarifaNum)) {
            console.warn(`⚠️ Tarifa inválida en línea ${index + 2}:`, tarifa);
            return null;
          }

          const diasMes = 30;
          const municipioId = `${municipio.substring(0, 20)}_${codigoClean}`.replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
          );

          return {
            codigo: codigoClean,
            municipioId,
            municipioNombre: municipio,
            tarifaBaseMes: 37.7,
            ubicacion: municipio,
            tipo: "PIV",
            fechaAlta: `${monthKey}-30`,
            diasFacturables: diasMes,
            importeAFacturar: tarifaNum,
          };
        })
        .filter((p) => p !== null);

      if (panels.length === 0) {
        throw new Error("No se encontraron paneles válidos en el archivo");
      }

      const { importBaseMonth } = await import("@/lib/api");
      await importBaseMonth({ monthKey, data: panels });

      setImportSuccess(true);
      setTimeout(() => window.location.reload(), 2000);
      e.target.value = "";
    } catch (err: any) {
      console.error("❌ Error en importación:", err);
      setImportError(err.message || "Error al importar el archivo");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          color: isLocked ? "#A3A3A3" : "#000",
          marginBottom: "8px",
        }}
      >
        📥 Importar base del mes
      </label>

      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={importLoading || isLocked}
        style={{
          fontSize: "14px",
          color: isLocked ? "#A3A3A3" : "#595959",
          cursor: isLocked ? "not-allowed" : "pointer",
          marginBottom: "8px",
        }}
      />

      {importLoading && (
        <div style={{ fontSize: "12px", color: "#595959" }}>
          Importando...
        </div>
      )}

      {importError && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
          }}
        >
          {importError}
        </div>
      )}

      {importSuccess && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#52C41A",
            backgroundColor: "#F6FFED",
            border: "1px solid #B7EB8F",
            borderRadius: "2px",
          }}
        >
          ✓ Importación completada
        </div>
      )}

      <p style={{ marginTop: "8px", fontSize: "11px", color: "#A3A3A3" }}>
        Formato CSV: Municipio, Código Parada, Facturación
      </p>
    </div>
  );
}

/**
 * Crear mes siguiente
 */
function CreateNextMonthSection({
  monthKey,
  isLocked,
}: {
  monthKey: string;
  isLocked: boolean;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  const handleCreate = async () => {
    const [year, month] = monthKey.split("-").map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;

    if (
      !confirm(
        `📅 CREAR MES: ${nextMonthKey}\n\n` +
          `Se creará el mes siguiente heredando los estados de ${monthKey}.\n\n` +
          `¿Continuar?`
      )
    ) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const { createNextMonth } = await import("@/lib/api");
      const result = await createNextMonth(nextMonthKey);
      setSuccess(result);

      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setError(err.message || "Error al crear el mes");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          color: "#000",
          marginBottom: "8px",
        }}
      >
        📅 Crear mes siguiente
      </label>

      <p style={{ fontSize: "12px", color: "#8C8C8C", marginBottom: "12px" }}>
        Crea el mes siguiente heredando estados del mes actual.
      </p>

      <button
        onClick={handleCreate}
        disabled={isCreating || isLocked}
        style={{
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 500,
          color: isCreating || isLocked ? "#A3A3A3" : "#FFF",
          backgroundColor: isCreating || isLocked ? "#F0F0F0" : "#1890FF",
          border: "none",
          borderRadius: "2px",
          cursor: isCreating || isLocked ? "not-allowed" : "pointer",
        }}
      >
        {isCreating ? "Creando..." : "Crear mes siguiente"}
      </button>

      {error && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            fontSize: "12px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            fontSize: "12px",
            color: "#52C41A",
            backgroundColor: "#F6FFED",
            border: "1px solid #B7EB8F",
            borderRadius: "2px",
          }}
        >
          ✓ Mes {success.monthKey} creado. Recargando...
        </div>
      )}
    </div>
  );
}

/**
 * Cerrar/Abrir mes
 */
function ToggleMonthLockSection({
  monthKey,
  isLocked,
  onMonthClosed,
}: {
  monthKey: string;
  isLocked: boolean;
  onMonthClosed?: () => void;
}) {
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const action = isLocked ? "ABRIR" : "CERRAR";

    if (
      !confirm(
        `🔒 ${action} MES: ${monthKey}\n\n` +
          (isLocked
            ? "Al abrir podrás modificar eventos.\n\n¿Continuar?"
            : "Al cerrar NO se podrán hacer cambios.\n\n¿Continuar?")
      )
    ) {
      return;
    }

    setIsToggling(true);
    setError(null);

    try {
      const { toggleMonthLock } = await import("@/lib/api");
      await toggleMonthLock(monthKey, !isLocked);

      if (!isLocked && onMonthClosed) {
        onMonthClosed();
      }

      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setError(err.message || "Error al cambiar el estado del mes");
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          color: "#000",
          marginBottom: "8px",
        }}
      >
        🔒 {isLocked ? "Abrir mes" : "Cerrar mes"}
      </label>

      <p style={{ fontSize: "12px", color: "#8C8C8C", marginBottom: "12px" }}>
        {isLocked
          ? "El mes está cerrado. Ábrelo para modificar eventos."
          : "Cierra el mes cuando la facturación esté correcta."}
      </p>

      <button
        onClick={handleToggle}
        disabled={isToggling}
        style={{
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 500,
          color: isToggling ? "#A3A3A3" : "#FFF",
          backgroundColor: isToggling
            ? "#F0F0F0"
            : isLocked
            ? "#52C41A"
            : "#FF4D4F",
          border: "none",
          borderRadius: "2px",
          cursor: isToggling ? "not-allowed" : "pointer",
        }}
      >
        {isToggling ? "..." : isLocked ? "🔓 Abrir mes" : "🔒 Cerrar mes"}
      </button>

      {error && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            fontSize: "12px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Resincronizar mes
 */
function ResyncMonthSection({
  monthKey,
  isLocked,
}: {
  monthKey: string;
  isLocked: boolean;
}) {
  const [isResyncing, setIsResyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  const handleResync = async () => {
    if (
      !confirm(
        `🔄 RESINCRONIZAR ${monthKey}\n\nActualizará estados desde el mes anterior.\n\n¿Continuar?`
      )
    ) {
      return;
    }

    setIsResyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const { resyncMonthFromPrevious } = await import("@/lib/api");
      const result = await resyncMonthFromPrevious(monthKey);
      setSuccess(result);

      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setError(err.message || "Error al resincronizar el mes");
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          color: "#000",
          marginBottom: "8px",
        }}
      >
        🔄 Resincronizar desde mes anterior
      </label>

      <p style={{ fontSize: "12px", color: "#8C8C8C", marginBottom: "12px" }}>
        Actualiza estados heredándolos del mes anterior.
      </p>

      <button
        onClick={handleResync}
        disabled={isResyncing || isLocked}
        style={{
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 500,
          color: isResyncing || isLocked ? "#A3A3A3" : "#FFF",
          backgroundColor: isResyncing || isLocked ? "#F0F0F0" : "#FA8C16",
          border: "none",
          borderRadius: "2px",
          cursor: isResyncing || isLocked ? "not-allowed" : "pointer",
        }}
      >
        {isResyncing ? "Resincronizando..." : "Resincronizar"}
      </button>

      {error && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            fontSize: "12px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            fontSize: "12px",
            color: "#52C41A",
            backgroundColor: "#F6FFED",
            border: "1px solid #B7EB8F",
            borderRadius: "2px",
          }}
        >
          ✓ {success.panelsUpdated} paneles actualizados. Recargando...
        </div>
      )}
    </div>
  );
}

/**
 * Eliminar mes
 */
function DeleteMonthSection({
  monthKey,
  isLocked,
}: {
  monthKey: string;
  isLocked: boolean;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (
      !confirm(
        `🗑️ ELIMINAR MES: ${monthKey}\n\n⚠️ NO SE PUEDE DESHACER ⚠️\n\nEscribe "ELIMINAR" para confirmar.`
      )
    ) {
      return;
    }

    const confirmText = prompt(`Escribe "ELIMINAR" en mayúsculas:`);
    if (confirmText !== "ELIMINAR") {
      alert("Operación cancelada");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const { deleteMonth } = await import("@/lib/api");
      await deleteMonth(monthKey);

      alert(`✓ Mes ${monthKey} eliminado`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setError(err.message || "Error al eliminar el mes");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: "24px",
        padding: "16px",
        backgroundColor: "#FFF1F0",
        border: "2px solid #FF4D4F",
        borderRadius: "4px",
      }}
    >
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 600,
          color: "#CF1322",
          marginBottom: "8px",
        }}
      >
        🗑️ Eliminar mes (⚠️ Peligroso)
      </label>

      <p style={{ fontSize: "12px", color: "#8C1F1F", marginBottom: "12px" }}>
        Elimina completamente este mes. No se puede deshacer.
      </p>

      <button
        onClick={handleDelete}
        disabled={isDeleting || isLocked}
        style={{
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 500,
          color: isDeleting || isLocked ? "#A3A3A3" : "#FFF",
          backgroundColor: isDeleting || isLocked ? "#F0F0F0" : "#FF4D4F",
          border: "none",
          borderRadius: "2px",
          cursor: isDeleting || isLocked ? "not-allowed" : "pointer",
        }}
      >
        {isDeleting ? "Eliminando..." : "🗑️ Eliminar mes"}
      </button>

      {isLocked && (
        <div style={{ marginTop: "8px", fontSize: "11px", color: "#8C8C8C" }}>
          ℹ️ Debes abrir el mes antes de eliminarlo
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            fontSize: "12px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECCIONES LEGACY (copiar del AdminSection original)
// ============================================================================

function RegenerateMonthSection({ monthKey }: { monthKey: string }) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  const handleRegenerate = async () => {
    if (!confirm(`¿Regenerar facturación para ${monthKey}?`)) return;

    setIsRegenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const { regenerateMonthBilling } = await import("@/lib/api");
      const result = await regenerateMonthBilling(monthKey);
      setSuccess(result);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setError(err.message || "Error al regenerar");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>
        🔄 Regenerar facturación
      </label>
      <button
        onClick={handleRegenerate}
        disabled={isRegenerating}
        style={{
          padding: "8px 16px",
          fontSize: "13px",
          color: isRegenerating ? "#A3A3A3" : "#FFF",
          backgroundColor: isRegenerating ? "#F0F0F0" : "#FA8C16",
          border: "none",
          borderRadius: "2px",
          cursor: isRegenerating ? "not-allowed" : "pointer",
        }}
      >
        {isRegenerating ? "Regenerando..." : `Regenerar ${monthKey}`}
      </button>
      {error && <div style={{ marginTop: "8px", fontSize: "12px", color: "#CF1322" }}>{error}</div>}
      {success && <div style={{ marginTop: "8px", fontSize: "12px", color: "#52C41A" }}>✓ Regenerado</div>}
    </div>
  );
}

function DiagnoseSection({ monthKey }: { monthKey: string }) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setResult(null);

    try {
      const { functions } = await import("@/lib/firebase");
      const { httpsCallable } = await import("firebase/functions");
      const diagnoseFn = httpsCallable(functions, "diagnoseDuplicates");
      const response = await diagnoseFn({ monthKey });
      setResult(response.data);
    } catch (err: any) {
      setResult({ success: false, conclusion: `Error: ${err.message}` });
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>
        🔍 Diagnosticar Duplicados
      </label>
      <button
        onClick={handleDiagnose}
        disabled={isDiagnosing}
        style={{
          padding: "8px 16px",
          fontSize: "13px",
          color: isDiagnosing ? "#A3A3A3" : "#000",
          backgroundColor: "#FFF7E6",
          border: "1px solid #FFD591",
          borderRadius: "2px",
          cursor: isDiagnosing ? "not-allowed" : "pointer",
        }}
      >
        {isDiagnosing ? "Analizando..." : "Ejecutar Diagnóstico"}
      </button>
      {result && (
        <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#F5F5F5", fontSize: "11px", fontFamily: "monospace", maxHeight: "200px", overflow: "auto" }}>
          {result.conclusion}
        </div>
      )}
    </div>
  );
}

function CleanupDuplicatesSection() {
  return (
    <div style={{ marginBottom: "24px", padding: "12px", backgroundColor: "#FFF1F0", border: "1px solid #FFCCC7", borderRadius: "4px" }}>
      <p style={{ fontSize: "13px", color: "#8C1F1F" }}>Funcionalidad legacy - No usar</p>
    </div>
  );
}

function RegenerateOctoberNovemberSection() {
  return (
    <div style={{ marginBottom: "24px", padding: "12px", backgroundColor: "#FFF1F0", border: "1px solid #FFCCC7", borderRadius: "4px" }}>
      <p style={{ fontSize: "13px", color: "#8C1F1F" }}>Funcionalidad legacy - No usar</p>
    </div>
  );
}

function CreateTransitionEventsSection() {
  return (
    <div style={{ marginBottom: "24px", padding: "12px", backgroundColor: "#FFF1F0", border: "1px solid #FFCCC7", borderRadius: "4px" }}>
      <p style={{ fontSize: "13px", color: "#8C1F1F" }}>Funcionalidad legacy - No usar</p>
    </div>
  );
}

function VerifyEventsSection() {
  return (
    <div style={{ marginBottom: "24px", padding: "12px", backgroundColor: "#FFF1F0", border: "1px solid #FFCCC7", borderRadius: "4px" }}>
      <p style={{ fontSize: "13px", color: "#8C1F1F" }}>Funcionalidad legacy - No usar</p>
    </div>
  );
}
