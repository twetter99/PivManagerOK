/**
 * AdminSection Component
 * Controles de administración: importar base, cerrar mes
 * Solo visible para usuarios con rol admin
 * Diseño: sección con borde superior, controles neutrales
 */

"use client";

import { useState } from "react";
import { importBaseMonth } from "@/lib/api";

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
 * CleanupDuplicatesSection Component
 * Proceso completo de limpieza y regeneración
 */
function CleanupDuplicatesSection() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);

  const handleFullCleanup = async () => {
    if (!confirm(
      "🔧 PROCESO COMPLETO DE LIMPIEZA\n\n" +
      "Se ejecutarán 3 pasos:\n" +
      "1. Limpiar paneles duplicados (894 → 447)\n" +
      "2. Eliminar datos de noviembre 2025\n" +
      "3. Regenerar facturación de noviembre\n\n" +
      "Esto tomará aproximadamente 2-3 minutos.\n\n" +
      "¿Continuar?"
    )) {
      return;
    }

    setIsProcessing(true);
    setResults([]);
    setCurrentStep("Paso 1/3: Limpiando paneles duplicados...");

    try {
      const functions = await import("@/lib/firebase").then((m) => m.functions);
      const { httpsCallable } = await import("firebase/functions");

      // Paso 1: Limpiar paneles duplicados
      const cleanupFn = httpsCallable(functions, "cleanupDuplicatePanels");
      const cleanupResult = await cleanupFn({ dryRun: false });
      setResults(prev => [...prev, {
        step: "1. Limpieza de paneles",
        data: cleanupResult.data,
        success: true
      }]);

      // Esperar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Paso 2: Eliminar billing de noviembre
      setCurrentStep("Paso 2/3: Eliminando datos de noviembre...");
      const deleteFn = httpsCallable(functions, "deleteMonthData");
      const deleteResult = await deleteFn({ monthKey: "2025-11" });
      setResults(prev => [...prev, {
        step: "2. Eliminación de noviembre",
        data: deleteResult.data,
        success: true
      }]);

      // Esperar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Paso 3: Regenerar noviembre
      setCurrentStep("Paso 3/3: Regenerando facturación...");
      const regenerateFn = httpsCallable(functions, "regenerateMonthBilling");
      const regenerateResult = await regenerateFn({ monthKey: "2025-11" });
      setResults(prev => [...prev, {
        step: "3. Regeneración de facturación",
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
        <strong>Problema detectado:</strong> 894 paneles (deberían ser 447)<br />
        <strong>Causa:</strong> Importación duplicada<br />
        <br />
        Este proceso ejecutará automáticamente:
      </p>

      <ol style={{ fontSize: "12px", marginLeft: "20px", marginBottom: "16px", lineHeight: "1.8" }}>
        <li>Limpieza de paneles duplicados (894 → 447)</li>
        <li>Eliminación de datos de noviembre 2025</li>
        <li>Regeneración de facturación de noviembre</li>
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
