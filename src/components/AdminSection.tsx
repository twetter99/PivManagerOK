/**
 * AdminSection Component
 * Controles de administración: importar base, cerrar mes
 * Solo visible para usuarios con rol admin
 * Diseño: sección con borde superior, controles neutrales
 */

"use client";

import { useState } from "react";
import { importBaseMonth, regenerateMonthBilling } from "@/lib/api";

interface AdminSectionProps {
  isAdmin: boolean;
  isLocked: boolean;
  monthKey: string;
  onMonthClosed?: () => void;
}

export default function AdminSection({
  isAdmin,
  isLocked,
  monthKey,
  onMonthClosed,
}: AdminSectionProps) {
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateSuccess, setRegenerateSuccess] = useState(false);

  if (!isAdmin) {
    return null;
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("📁 Archivo seleccionado:", file?.name);
    
    if (!file) {
      console.log("❌ No hay archivo");
      return;
    }

    // Validar CSV
    if (!file.name.endsWith(".csv")) {
      setImportError("El archivo debe ser un CSV válido");
      console.log("❌ No es CSV");
      return;
    }

    console.log("⏳ Iniciando importación...");
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await file.text();
      const lines = text.split("\n");

      // Validar formato (esperamos al menos header + 1 panel)
      if (lines.length < 2) {
        throw new Error("El archivo debe contener al menos un panel");
      }

      const header = lines[0].trim().toLowerCase();
      if (!header.includes("codigo") && !header.includes("código")) {
        throw new Error("El CSV debe tener las columnas: Municipio, Código Parada, Facturación");
      }

      // Parsear paneles
      const panels = lines.slice(1).filter(line => line.trim()).map((line, index) => {
        // Soportar delimitadores: coma, tabulador o punto y coma
        const parts = line.includes("\t") 
          ? line.split("\t") 
          : line.includes(";") 
            ? line.split(";") 
            : line.split(",");
        
        const [municipio, codigo, tarifa] = parts.map(s => s.trim());
        
        // Validar que tenemos datos
        if (!municipio || !codigo || !tarifa) {
          console.warn(`⚠️ Línea ${index + 2} incompleta:`, line);
          return null;
        }
        
        // Limpiar el código (quitar espacios extra, normalizar)
        const codigoClean = codigo.trim();
        
        // Limpiar el valor de tarifa (quitar €, espacios, etc.)
        const tarifaClean = tarifa.replace(/[€\s]/g, "").replace(",", ".");
        const tarifaNum = parseFloat(tarifaClean);
        
        if (isNaN(tarifaNum)) {
          console.warn(`⚠️ Tarifa inválida en línea ${index + 2}:`, tarifa);
          return null;
        }
        
        // Calcular días del mes (FIJO: base 30 días)
        const [year, month] = monthKey.split("-").map(Number);
        const diasMes = 30; // Base fija para todos los meses
        
        // Generar ID único (municipio + código, sanitizado)
        const municipioId = `${municipio.substring(0, 20)}_${codigoClean}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        
        return {
          codigo: codigoClean,
          municipioId: municipioId,
          municipioNombre: municipio,
          tarifaBaseMes: 37.70, // Tarifa estándar 2025 (CSV contiene importe del mes, no tarifa)
          ubicacion: municipio,
          tipo: "PIV",
          fechaAlta: `${monthKey}-30`, // Fecha 30 del mes
          diasFacturables: diasMes,
          importeAFacturar: tarifaNum,
        };
      }).filter(p => p !== null);

      if (panels.length === 0) {
        throw new Error("No se encontraron paneles válidos en el archivo");
      }

      console.log(`📊 Importando ${panels.length} paneles...`);

      // Llamar a la Cloud Function
      const result = await importBaseMonth({ monthKey, data: panels });

      console.log("✅ Importación exitosa:", result);
      setImportSuccess(true);
      
      // Recargar página después de 2 segundos para ver los datos
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
      // Limpiar input
      e.target.value = "";
    } catch (err: any) {
      console.error("❌ Error en importación:", err);
      setImportError(err.message || "Error al importar el archivo");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "32px",
        paddingTop: "24px",
        borderTop: "1px solid #EAEAEA",
      }}
    >
      <h2
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "#000",
          marginBottom: "16px",
        }}
      >
        Administración
      </h2>

      {/* Lock indicator */}
      {isLocked && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "14px",
            color: "#595959",
            backgroundColor: "#F7F7F7",
            border: "1px solid #EAEAEA",
            borderRadius: "2px",
          }}
        >
          Este mes está cerrado. No se pueden realizar cambios.
        </div>
      )}

      {/* Import base month */}
      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            color: isLocked ? "#A3A3A3" : "#000",
            marginBottom: "8px",
          }}
        >
          Importar base del mes
        </label>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={importLoading || isLocked}
            style={{
              fontSize: "14px",
              color: isLocked ? "#A3A3A3" : "#595959",
              cursor: isLocked ? "not-allowed" : "pointer",
            }}
          />

          {importLoading && (
            <span
              style={{
                fontSize: "12px",
                color: "#595959",
              }}
            >
              Importando...
            </span>
          )}
        </div>

        {importError && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              border: "1px solid #EAEAEA",
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
              color: "#595959",
              backgroundColor: "#F7F7F7",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            Importación completada con éxito
          </div>
        )}

        <p
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "#A3A3A3",
          }}
        >
          Formato CSV: Municipio, Código Parada, Facturación (con o sin encabezado)
        </p>
      </div>

      {/* Botón temporal: Regenerar Octubre */}
      <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#FFF9E6", border: "1px solid #FFD700", borderRadius: "4px" }}>
        <p style={{ fontSize: "13px", color: "#595959", marginBottom: "8px" }}>
          🔧 <strong>Herramienta temporal:</strong> Regenerar facturación de octubre 2025
        </p>
        <button
          onClick={async () => {
            if (regenerating) return;
            if (!confirm("¿Regenerar facturación de OCTUBRE 2025? Esto recalculará todos los paneles.")) return;
            setRegenerating(true);
            setRegenerateSuccess(false);
            setImportError(null);
            try {
              await regenerateMonthBilling("2025-10");
              setRegenerateSuccess(true);
              setTimeout(() => window.location.reload(), 2000);
            } catch (err: any) {
              setImportError(err.message || "Error al regenerar");
            } finally {
              setRegenerating(false);
            }
          }}
          disabled={regenerating}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            color: "#FFF",
            backgroundColor: regenerating ? "#ccc" : "#FF9800",
            border: "none",
            borderRadius: "2px",
            cursor: regenerating ? "not-allowed" : "pointer",
          }}
        >
          {regenerating ? "Regenerando..." : "Regenerar Octubre 2025"}
        </button>
        {regenerateSuccess && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#52C41A" }}>
            ✓ Octubre regenerado. Recargando...
          </div>
        )}
      </div>

      {/* Crear eventos de transición octubre→noviembre */}
      <CreateTransitionEventsSection />

      {/* Regenerar octubre y noviembre en secuencia */}
      <RegenerateOctoberNovemberSection />

      {/* Verificar Eventos de Octubre */}
      <VerifyEventsSection />

      {/* Regenerar facturación del mes */}
      <DiagnoseSection monthKey={monthKey} />

      <CleanupDuplicatesSection />

      <RegenerateMonthSection monthKey={monthKey} />

      {/* Close month (manual trigger opcional - closeMonthJob se ejecuta automáticamente) */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            color: "#000",
            marginBottom: "8px",
          }}
        >
          Cerrar mes
        </label>

        <p
          style={{
            fontSize: "12px",
            color: "#A3A3A3",
            marginBottom: "8px",
          }}
        >
          El cierre automático se ejecuta el día 1 de cada mes a las 02:00 AM.
          Una vez cerrado, no se pueden crear ni modificar eventos.
        </p>

        {isLocked ? (
          <p
            style={{
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              padding: "8px 12px",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            Este mes está cerrado. No se puede ejecutar el cierre manualmente.
          </p>
        ) : (
          <p
            style={{
              fontSize: "12px",
              color: "#595959",
              backgroundColor: "#F7F7F7",
              padding: "8px 12px",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
            }}
          >
            Este mes aún no está cerrado. El cierre se realizará automáticamente.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * RegenerateOctoberNovemberSection Component
 * Regenera octubre primero (para aplicar eventos) y luego noviembre (para heredar estado correcto)
 */
function RegenerateOctoberNovemberSection() {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);

  const handleRegenerate = async () => {
    if (!confirm(
      "🔄 REGENERAR OCTUBRE Y NOVIEMBRE\n\n" +
      "Se ejecutarán 2 pasos en secuencia:\n\n" +
      "1. Regenerar OCTUBRE 2025\n" +
      "   → Aplicará eventos de DESMONTAJE (09/10 y 24/10)\n" +
      "   → Actualizará estadoAlCierre de octubre\n\n" +
      "2. Regenerar NOVIEMBRE 2025\n" +
      "   → Heredará estado correcto de octubre\n" +
      "   → Paneles desmontados: 0 días, 0€\n" +
      "   → TFT Getafe: 30 días, 37.70€\n\n" +
      "Tiempo estimado: 2-3 minutos\n\n" +
      "¿Continuar?"
    )) {
      return;
    }

    setIsRegenerating(true);
    setResults([]);
    setCurrentStep("Paso 1/2: Regenerando octubre 2025...");

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");
      
      // Paso 1: Regenerar octubre
      const regenerateFn = httpsCallable(functions, "regenerateMonthBilling");
      const octoberResult = await regenerateFn({ monthKey: "2025-10" });
      setResults(prev => [...prev, {
        step: "1. Regeneración de octubre",
        data: octoberResult.data,
        success: true
      }]);

      // Esperar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Paso 2: Regenerar noviembre
      setCurrentStep("Paso 2/2: Regenerando noviembre 2025...");
      const novemberResult = await regenerateFn({ monthKey: "2025-11" });
      setResults(prev => [...prev, {
        step: "2. Regeneración de noviembre",
        data: novemberResult.data,
        success: true
      }]);

      setCurrentStep("✅ Proceso completado. Recargando en 3 segundos...");

      // Recargar página
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (err: any) {
      console.error("Error en regeneración:", err);
      setResults(prev => [...prev, {
        step: `Error en ${currentStep}`,
        data: { message: err.message },
        success: false
      }]);
      setCurrentStep("❌ Error en el proceso");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#FFF7E6", border: "2px solid #FFA940", borderRadius: "4px" }}>
      <label
        style={{
          display: "block",
          fontSize: "16px",
          fontWeight: 700,
          color: "#D46B08",
          marginBottom: "8px",
        }}
      >
        🔄 PASO 2: Regenerar Octubre + Noviembre
      </label>

      <p
        style={{
          fontSize: "13px",
          color: "#873800",
          marginBottom: "16px",
          lineHeight: "1.6",
        }}
      >
        <strong>¿Por qué regenerar octubre primero?</strong><br />
        Los eventos de DESMONTAJE están en octubre (09/10 y 24/10). Para que noviembre
        herede el estado correcto (DESMONTADO), primero debemos regenerar octubre para
        que aplique esos eventos y actualice el estadoAlCierre.<br />
        <br />
        <strong>Resultado esperado:</strong><br />
        • Octubre: aplicará DESMONTAJES, estadoAlCierre = DESMONTADO<br />
        • Noviembre: heredará DESMONTADO → 0 días, 0€ para paneles desmontados<br />
        • TFT Getafe: heredará ACTIVO → 30 días, 37.70€
      </p>

      <button
        onClick={handleRegenerate}
        disabled={isRegenerating}
        style={{
          padding: "12px 24px",
          fontSize: "15px",
          fontWeight: 600,
          color: "#FFF",
          backgroundColor: isRegenerating ? "#CCC" : "#FA8C16",
          border: "none",
          borderRadius: "4px",
          cursor: isRegenerating ? "not-allowed" : "pointer",
          marginBottom: "16px",
        }}
      >
        {isRegenerating ? currentStep : "🔄 Regenerar Octubre + Noviembre"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          {results.map((result, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "8px",
                padding: "8px",
                backgroundColor: result.success ? "#F6FFED" : "#FFF1F0",
                border: `1px solid ${result.success ? "#B7EB8F" : "#FFCCC7"}`,
                borderRadius: "2px",
                fontSize: "12px",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                {result.success ? "✅" : "❌"} {result.step}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#666" }}>
                {JSON.stringify(result.data, null, 2).substring(0, 200)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CreateTransitionEventsSection Component
 * Crea eventos de transición para noviembre basados en cambios de octubre
 */
function CreateTransitionEventsSection() {
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleCreateEvents = async () => {
    if (!confirm(
      "📝 CREAR EVENTOS DE TRANSICIÓN OCTUBRE→NOVIEMBRE\n\n" +
      "Se crearán 4 eventos en octubre que afectan noviembre:\n\n" +
      "• 10573 (Villaviciosa) - DESMONTAJE 09/10\n" +
      "• 18257 (Hoyo Manzanares) - DESMONTAJE 24/10\n" +
      "• 8933 (Brunete) - DESMONTAJE 24/10\n" +
      "• TFT Getafe - ALTA 24/10\n\n" +
      "Estos eventos NO modificarán octubre (ya correcto)\n" +
      "pero permitirán que noviembre herede el estado correcto.\n\n" +
      "¿Continuar?"
    )) {
      return;
    }

    setIsCreating(true);
    setResult(null);

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");
      
      const createEventsFn = httpsCallable(functions, "createNovemberTransitionEvents");
      const response = await createEventsFn({});
      const data = response.data as any;
      setResult(data);

      alert(`✅ Eventos creados correctamente\n\n${data?.summary?.created || 0} eventos creados`);
    } catch (err: any) {
      console.error("Error creando eventos:", err);
      setResult({
        success: false,
        error: err.message
      });
      alert(`❌ Error: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#E6F7FF", border: "2px solid #1890FF", borderRadius: "4px" }}>
      <label
        style={{
          display: "block",
          fontSize: "16px",
          fontWeight: 700,
          color: "#0050B3",
          marginBottom: "8px",
        }}
      >
        📝 PASO 1: Crear Eventos de Transición Oct→Nov
      </label>

      <p
        style={{
          fontSize: "13px",
          color: "#003A8C",
          marginBottom: "16px",
          lineHeight: "1.6",
        }}
      >
        <strong>Situación:</strong><br />
        Octubre está correcto pero noviembre no refleja los cambios:<br />
        • 3 paneles desmontados en octubre (deben facturar 0€ en nov)<br />
        • 1 panel dado de alta en octubre (debe facturar 37.70€ en nov)<br />
        <br />
        <strong>Solución:</strong><br />
        Crear eventos en octubre que permitan heredar el estado correcto a noviembre.
      </p>

      <button
        onClick={handleCreateEvents}
        disabled={isCreating}
        style={{
          padding: "12px 24px",
          fontSize: "15px",
          fontWeight: 600,
          color: "#FFF",
          backgroundColor: isCreating ? "#CCC" : "#1890FF",
          border: "none",
          borderRadius: "4px",
          cursor: isCreating ? "not-allowed" : "pointer",
          marginBottom: "16px",
        }}
      >
        {isCreating ? "Creando eventos..." : "🚀 Crear 4 Eventos de Transición"}
      </button>

      {result && (
        <div
          style={{
            padding: "12px",
            backgroundColor: result.success ? "#F6FFED" : "#FFF1F0",
            border: `1px solid ${result.success ? "#B7EB8F" : "#FFCCC7"}`,
            borderRadius: "4px",
            marginTop: "12px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            {result.success ? "✅ Completado" : "❌ Error"}
          </div>
          {result.summary && (
            <div style={{ fontSize: "12px", marginBottom: "8px" }}>
              Creados: {result.summary.created} | Omitidos: {result.summary.skipped} | Fallidos: {result.summary.failed}
            </div>
          )}
          {result.details && (
            <div style={{ fontSize: "11px", fontFamily: "monospace", maxHeight: "200px", overflow: "auto" }}>
              {result.details.map((detail: any, idx: number) => (
                <div key={idx} style={{ marginBottom: "4px" }}>
                  {detail.success ? "✅" : "❌"} {detail.codigo} - {detail.action} ({detail.date})
                  {detail.skipped && " (ya existe)"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * VerifyEventsSection Component
 * Verifica si existen los eventos de octubre
 */
function VerifyEventsSection() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    setResults(null);

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");

      const verifyFn = httpsCallable(functions, "verifyOctoberEvents");
      const result = await verifyFn({});
      setResults(result.data);
    } catch (err: any) {
      console.error("Error verificando eventos:", err);
      setResults({ success: false, error: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#E6F7FF", border: "2px solid #1890FF", borderRadius: "4px" }}>
      <label
        style={{
          display: "block",
          fontSize: "16px",
          fontWeight: 700,
          color: "#0050B3",
          marginBottom: "8px",
        }}
      >
        🔍 VERIFICAR EVENTOS DE OCTUBRE
      </label>

      <p style={{ fontSize: "13px", marginBottom: "16px", lineHeight: "1.6" }}>
        Verifica si los eventos de transición de octubre existen en Firestore
      </p>

      <button
        onClick={handleVerify}
        disabled={isVerifying}
        style={{
          padding: "12px 24px",
          fontSize: "15px",
          fontWeight: 600,
          color: "#FFF",
          backgroundColor: isVerifying ? "#A3A3A3" : "#1890FF",
          border: "none",
          borderRadius: "4px",
          cursor: isVerifying ? "not-allowed" : "pointer",
          marginBottom: "16px",
        }}
      >
        {isVerifying ? "Verificando..." : "🔍 Verificar Eventos"}
      </button>

      {results && (
        <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#FFF", border: "1px solid #D9D9D9", borderRadius: "4px" }}>
          <pre style={{ fontSize: "11px", overflow: "auto", maxHeight: "400px" }}>
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * CleanupDuplicatesSection Component
 * Proceso completo de limpieza y regeneración
 */
function CleanupDuplicatesSection() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);

  const handleFullCleanup = async () => {
    if (!confirm(
      "🔧 REGENERAR FACTURACIÓN DE NOVIEMBRE\n\n" +
      "Se ejecutarán 2 pasos:\n" +
      "1. Eliminar facturación actual de noviembre 2025\n" +
      "2. Regenerar con la nueva lógica de períodos activos\n\n" +
      "Esto tomará aproximadamente 1-2 minutos.\n\n" +
      "¿Continuar?"
    )) {
      return;
    }

    setIsProcessing(true);
    setResults([]);
    setCurrentStep("Paso 1/2: Eliminando facturación actual de noviembre...");

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");

      // Paso 1: Verificación inicial
      setResults(prev => [...prev, {
        step: "1. Verificación inicial",
        data: { message: "Iniciando proceso de limpieza y regeneración..." },
        success: true
      }]);

      // Esperar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Paso 2: Limpiar SOLO billing de noviembre duplicado (octubre intocable)
      setCurrentStep("Paso 1/2: Limpiando billing duplicado de noviembre...");
      const deleteFn = httpsCallable(functions, "deleteMonthData");
      const deleteResult = await deleteFn({ monthKey: "2025-11" });
      setResults(prev => [...prev, {
        step: "2. Eliminación de noviembre",
        data: deleteResult.data,
        success: true
      }]);

      // Esperar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Paso 3: Regenerar SOLO noviembre (heredar estado de octubre que YA está correcto)
      setCurrentStep("Paso 2/2: Regenerando noviembre (heredar de octubre)...");
      const regenerateFn = httpsCallable(functions, "regenerateMonthBilling");
      const regenerateResult = await regenerateFn({ monthKey: "2025-11" });
      setResults(prev => [...prev, {
        step: "3. Regeneración de noviembre",
        data: regenerateResult.data,
        success: true
      }]);

      setCurrentStep("✅ Proceso completado. Recargando en 3 segundos...");

      // Recargar página
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (err: any) {
      console.error("Error en proceso:", err);
      setResults(prev => [...prev, {
        step: `Error en ${currentStep}`,
        data: { message: err.message },
        success: false
      }]);
      setCurrentStep("❌ Error en el proceso");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#FFF0F0", border: "2px solid #FF4D4F", borderRadius: "4px" }}>
      <label
        style={{
          display: "block",
          fontSize: "16px",
          fontWeight: 700,
          color: "#CF1322",
          marginBottom: "8px",
        }}
      >
        🔧 LIMPIEZA COMPLETA Y REGENERACIÓN
      </label>

      <p
        style={{
          fontSize: "13px",
          color: "#7F4F24",
          marginBottom: "16px",
          lineHeight: "1.6",
        }}
      >
        <strong>Situación actual:</strong><br />
        • Octubre 2025 CORRECTO (447 paneles, 16.781,53€) - NO SE TOCA<br />
        • Noviembre 2025 con datos incorrectos (necesita heredar de octubre)<br />
        • 447 paneles únicos en base de datos<br />
        <br />
        Este proceso ejecutará automáticamente:
      </p>

      <ol style={{ fontSize: "12px", marginLeft: "20px", marginBottom: "16px", lineHeight: "1.8" }}>
        <li>Eliminar facturación actual de noviembre 2025 (octubre queda intacto)</li>
        <li>Regenerar noviembre 2025 heredando el estado correcto de octubre</li>
      </ol>

      <button
        onClick={handleFullCleanup}
        disabled={isProcessing}
        style={{
          padding: "12px 24px",
          fontSize: "15px",
          fontWeight: 600,
          color: "#FFF",
          backgroundColor: isProcessing ? "#A3A3A3" : "#CF1322",
          border: "none",
          borderRadius: "4px",
          cursor: isProcessing ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {isProcessing ? currentStep : "🚀 Ejecutar Limpieza Completa"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          {results.map((result, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "8px",
                padding: "12px",
                backgroundColor: result.success ? "#F6FFED" : "#FFF1F0",
                border: `1px solid ${result.success ? "#B7EB8F" : "#FFA39E"}`,
                borderRadius: "2px",
                fontSize: "12px",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                {result.success ? "✅" : "❌"} {result.step}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#666" }}>
                {JSON.stringify(result.data, null, 2).substring(0, 200)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DiagnoseSection Component
 * Diagnostica duplicados en el sistema de facturación
 */
function DiagnoseSection({ monthKey }: { monthKey: string }) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    setResult(null);

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");
      
      const diagnoseFn = httpsCallable(functions, "diagnoseDuplicates");
      const response = await diagnoseFn({ monthKey });
      setResult(response.data);
    } catch (err: any) {
      console.error("Error en diagnóstico:", err);
      setResult({
        success: false,
        conclusion: `Error: ${err.message}`
      });
    } finally {
      setIsDiagnosing(false);
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
        🔍 Diagnosticar Duplicados
      </label>

      <p
        style={{
          fontSize: "12px",
          color: "#A3A3A3",
          marginBottom: "12px",
        }}
      >
        Analiza la causa raíz de los paneles duplicados en el sistema.
      </p>

      <button
        onClick={handleDiagnose}
        disabled={isDiagnosing}
        style={{
          padding: "8px 16px",
          fontSize: "14px",
          fontWeight: 500,
          color: isDiagnosing ? "#A3A3A3" : "#000",
          backgroundColor: "#FFF7E6",
          border: "1px solid #FFD591",
          borderRadius: "2px",
          cursor: isDiagnosing ? "not-allowed" : "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!isDiagnosing) {
            e.currentTarget.style.backgroundColor = "#FFE7BA";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#FFF7E6";
        }}
      >
        {isDiagnosing ? "Analizando..." : "Ejecutar Diagnóstico"}
      </button>

      {result && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            backgroundColor: result.success && result.duplicatedCodigosInPanels === 0 ? "#F0FFF4" : "#FFF1F0",
            border: `1px solid ${result.success && result.duplicatedCodigosInPanels === 0 ? "#B7EB8F" : "#FFA39E"}`,
            borderRadius: "2px",
            fontSize: "12px",
          }}
        >
          <div style={{ marginBottom: "8px", fontWeight: 600 }}>
            Resultado del Diagnóstico:
          </div>
          
          <div style={{ marginBottom: "8px" }}>
            <strong>Paneles en BD:</strong> {result.totalPanels}<br />
            <strong>Documentos billing:</strong> {result.totalBillingDocs}<br />
            <strong>Códigos duplicados en PANELS:</strong> {result.duplicatedCodigosInPanels}<br />
            <strong>Códigos duplicados en BILLING:</strong> {result.duplicatedCodigosInBilling}
          </div>

          <div
            style={{
              marginTop: "12px",
              padding: "8px",
              backgroundColor: "#FFF",
              borderLeft: "3px solid #FF4D4F",
              fontFamily: "monospace",
              fontSize: "11px",
              whiteSpace: "pre-wrap",
            }}
          >
            {result.conclusion}
          </div>

          {result.samples?.panelDuplicates && result.samples.panelDuplicates.length > 0 && (
            <details style={{ marginTop: "12px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Ver ejemplos de duplicados en PANELS
              </summary>
              <div style={{ marginTop: "8px", fontSize: "11px", fontFamily: "monospace" }}>
                {result.samples.panelDuplicates.map((item: any, idx: number) => (
                  <div key={idx} style={{ marginBottom: "8px" }}>
                    <strong>{item.codigo}:</strong>
                    {item.panels.map((p: any, i: number) => (
                      <div key={i} style={{ marginLeft: "16px" }}>
                        - {p.id} ({p.estado})
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * RegenerateMonthSection Component
 * Permite regenerar la facturación de todos los paneles para un mes
 */
function RegenerateMonthSection({ monthKey }: { monthKey: string }) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ processed: number; total: number } | null>(null);

  const handleRegenerate = async () => {
    if (!confirm(`¿Estás seguro de regenerar la facturación para ${monthKey}?\n\nEsto recalculará TODOS los paneles del mes.`)) {
      return;
    }

    setIsRegenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");
      
      const regenerateFn = httpsCallable<
        { monthKey: string },
        { success: boolean; totalPanels: number; processed: number; errors?: string[] }
      >(functions, "regenerateMonthBilling");

      const result = await regenerateFn({ monthKey });

      if (result.data.success) {
        setSuccess({
          processed: result.data.processed,
          total: result.data.totalPanels,
        });
        
        // Recargar la página después de 2 segundos
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "Error al regenerar la facturación");
      console.error("Error regenerando facturación:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          color: "#000",
          marginBottom: "8px",
        }}
      >
        Regenerar facturación del mes
      </label>

      <p
        style={{
          fontSize: "12px",
          color: "#A3A3A3",
          marginBottom: "12px",
        }}
      >
        Recalcula la facturación de todos los paneles para el mes actual.
        Útil después de corregir reglas de cálculo o para regenerar meses futuros.
      </p>

      <button
        onClick={handleRegenerate}
        disabled={isRegenerating}
        style={{
          padding: "8px 16px",
          fontSize: "14px",
          fontWeight: 500,
          color: isRegenerating ? "#A3A3A3" : "#000",
          backgroundColor: "#F7F7F7",
          border: "1px solid #EAEAEA",
          borderRadius: "2px",
          cursor: isRegenerating ? "not-allowed" : "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!isRegenerating) {
            e.currentTarget.style.backgroundColor = "#EAEAEA";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#F7F7F7";
        }}
      >
        {isRegenerating ? "Regenerando..." : `Regenerar ${monthKey}`}
      </button>

      {error && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#EF4444",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FEE2E2",
            borderRadius: "2px",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#10B981",
            backgroundColor: "#F0FDF4",
            border: "1px solid #D1FAE5",
            borderRadius: "2px",
          }}
        >
          ✓ {success.processed}/{success.total} paneles regenerados correctamente. Recargando...
        </div>
      )}
    </div>
  );
}
