/**
 * CreatePanelForm Component
 * Formulario de alta unificada de panel individual
 * Permite crear un panel con fecha personalizada y auto-tarificación
 * PATRÓN: Confirmación con Previsualización Completa
 */

"use client";

import { useState } from "react";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

interface Rate {
  year: string;
  importe: number;
  updatedAt?: string;
  updatedBy?: string;
}

interface PreviewData {
  // Datos maestros (del formulario)
  codigo: string;
  municipio: string;
  fechaAlta: string;
  // Datos técnicos (calculados)
  municipioId: string;
  estado: string;
  tipo: string;
  tarifaBase: number | null;
  year: number;
  tarifaEncontrada: boolean;
}

interface CreatePanelFormProps {
  rates: Rate[];
  existingLocations: string[];
}

export default function CreatePanelForm({ rates, existingLocations }: CreatePanelFormProps) {
  // Estados del formulario
  const [codigo, setCodigo] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [fechaAlta, setFechaAlta] = useState("");
  
  // Estados del componente (modo y previsualización)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  
  // Estados de UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /**
   * PASO 1: Verificación y Simulación (Cliente)
   * Genera ID técnico y busca tarifa SIN llamar al backend
   */
  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validaciones estrictas
    if (!codigo.trim()) {
      setError("❌ El código del panel es obligatorio");
      return;
    }

    if (!municipio.trim()) {
      setError("❌ El municipio es obligatorio");
      return;
    }

    if (!fechaAlta) {
      setError("❌ La fecha de alta es obligatoria");
      return;
    }

    // Validar formato de fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fechaAlta)) {
      setError("❌ Formato de fecha inválido (debe ser YYYY-MM-DD)");
      return;
    }

    // Extraer año
    const year = parseInt(fechaAlta.split("-")[0], 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      setError("❌ Año inválido (debe estar entre 2000 y 2100)");
      return;
    }

    // Generar ID técnico (RÉPLICA EXACTA del backend)
    // Respeta tildes y unicode: "Móstoles_4321", "Getafe_1234"
    const municipioId = `${municipio.trim()}_${codigo.trim()}`;

    // Buscar tarifa del año en rates
    const rate = rates.find((r) => r.year === year.toString());
    const tarifaBase = rate ? rate.importe : null;

    // Crear datos de previsualización
    const preview: PreviewData = {
      codigo: codigo.trim(),
      municipio: municipio.trim(),
      fechaAlta,
      municipioId,
      estado: "ACTIVO",
      tipo: "PIV",
      tarifaBase,
      year,
      tarifaEncontrada: !!rate,
    };

    setPreviewData(preview);
    setMode("preview");
  };

  /**
   * PASO 2: Confirmación (Llama al Backend)
   * Solo se ejecuta tras aprobación del usuario
   */
  const handleConfirm = async () => {
    if (!previewData) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const createPanelFn = httpsCallable<
        { codigo: string; municipio: string; fechaAlta: string },
        {
          success: boolean;
          message: string;
          codigo: string;
          monthKey: string;
          diasFacturables: number;
          importe: number;
          tarifa: number;
        }
      >(functions, "createPanel");

      const result = await createPanelFn({
        codigo: previewData.codigo,
        municipio: previewData.municipio,
        fechaAlta: previewData.fechaAlta,
      });

      if (result.data.success) {
        setSuccess(
          `✅ ${result.data.message}\n\n` +
          `📅 Mes: ${result.data.monthKey}\n` +
          `📊 Días facturables: ${result.data.diasFacturables}\n` +
          `💰 Importe: ${result.data.importe.toFixed(2)}€\n` +
          `💵 Tarifa aplicada: ${result.data.tarifa.toFixed(2)}€`
        );

        // Limpiar formulario y volver a modo edición
        setCodigo("");
        setMunicipio("");
        setFechaAlta("");
        setPreviewData(null);
        setMode("edit");

        // Recargar página después de 3 segundos
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    } catch (err: any) {
      console.error("❌ Error creando panel:", err);

      // Manejo defensivo de errores HTTP
      let errorMsg = "Error desconocido al crear el panel";

      if (err.code === "already-exists") {
        errorMsg = `El código "${previewData.codigo}" ya existe en el sistema`;
      } else if (err.code === "failed-precondition") {
        errorMsg = err.message || `No hay tarifa configurada para el año ${previewData.year}`;
      } else if (err.code === "invalid-argument") {
        errorMsg = `Datos inválidos: ${err.message || "Verifica los campos"}`;
      } else if (err.code === "permission-denied") {
        errorMsg = "No tienes permisos para crear paneles";
      } else if (err.code === "unavailable") {
        errorMsg = "Servicio temporalmente no disponible. Intenta de nuevo.";
      } else if (err.message) {
        errorMsg = err.message;
      }

      setError(`❌ ${errorMsg}`);
      setMode("edit"); // Volver al formulario
    } finally {
      setLoading(false);
    }
  };

  /**
   * Volver al formulario desde previsualización
   */
  const handleCorrect = () => {
    setMode("edit");
    setPreviewData(null);
    setError(null);
  };

  /**
   * Limpiar formulario completamente
   */
  const handleCancel = () => {
    setCodigo("");
    setMunicipio("");
    setFechaAlta("");
    setError(null);
    setSuccess(null);
    setPreviewData(null);
    setMode("edit");
  };

  // Obtener fecha de hoy en formato YYYY-MM-DD para el input date
  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      <h3
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "#000",
          marginBottom: "8px",
        }}
      >
        📦 Alta de Panel Individual
      </h3>

      <p
        style={{
          fontSize: "13px",
          color: "#595959",
          marginBottom: "24px",
          lineHeight: "1.6",
        }}
      >
        {mode === "edit"
          ? "Completa los datos del panel. Verifica antes de confirmar el alta."
          : "Revisa los datos técnicos generados. Confirma para grabar en el sistema."}
      </p>

      {error && (
        <div
          style={{
            padding: "12px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
            whiteSpace: "pre-line",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "12px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#52C41A",
            backgroundColor: "#F6FFED",
            border: "1px solid #B7EB8F",
            borderRadius: "2px",
            whiteSpace: "pre-line",
          }}
        >
          {success}
        </div>
      )}

      {/* MODO 1: FORMULARIO DE EDICIÓN */}
      {mode === "edit" && (
        <form onSubmit={handleVerify}>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#000",
              marginBottom: "6px",
            }}
          >
            Código del Panel *
          </label>
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            disabled={loading}
            placeholder="Ej: 12345"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              backgroundColor: loading ? "#F5F5F5" : "#FFF",
            }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#000",
              marginBottom: "6px",
            }}
          >
            Municipio *
          </label>
          <input
            list="locations-list"
            type="text"
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            disabled={loading}
            placeholder="Ej: Getafe, Madrid... (o escribe uno nuevo)"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              backgroundColor: loading ? "#F5F5F5" : "#FFF",
            }}
          />
          <datalist id="locations-list">
            {existingLocations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
          {existingLocations.length > 0 && (
            <p style={{ fontSize: "11px", color: "#8C8C8C", marginTop: "4px" }}>
              💡 {existingLocations.length} ubicaciones disponibles
            </p>
          )}
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#000",
              marginBottom: "6px",
            }}
          >
            Fecha de Alta *
          </label>
          <input
            type="date"
            value={fechaAlta}
            onChange={(e) => setFechaAlta(e.target.value)}
            disabled={loading}
            max="2099-12-31"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              backgroundColor: loading ? "#F5F5F5" : "#FFF",
            }}
          />
          <p style={{ fontSize: "11px", color: "#8C8C8C", marginTop: "4px" }}>
            Puedes seleccionar fechas pasadas o futuras
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#FFF",
              backgroundColor: loading ? "#CCC" : "#722ED1",
              border: "none",
              borderRadius: "2px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            🔍 Verificar Datos
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#595959",
              backgroundColor: "#FFF",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Limpiar
          </button>
        </div>
      </form>
      )}

      {/* MODO 2: PREVISUALIZACIÓN Y AUDITORÍA */}
      {mode === "preview" && previewData && (
        <div>
          {/* Advertencia si falta tarifa */}
          {!previewData.tarifaEncontrada && (
            <div
              style={{
                padding: "12px",
                marginBottom: "16px",
                fontSize: "13px",
                color: "#CF1322",
                backgroundColor: "#FFF1F0",
                border: "2px solid #CF1322",
                borderRadius: "2px",
                fontWeight: 600,
              }}
            >
              ⚠️ NO EXISTE TARIFA CONFIGURADA PARA EL AÑO {previewData.year}
              <br />
              <span style={{ fontWeight: 400, fontSize: "12px" }}>
                Debes configurar la tarifa antes de dar de alta este panel.
              </span>
            </div>
          )}

          {/* Ficha técnica completa */}
          <div
            style={{
              border: "2px solid #722ED1",
              borderRadius: "4px",
              padding: "16px",
              backgroundColor: "#F9F0FF",
            }}
          >
            <h4
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#722ED1",
                marginBottom: "16px",
              }}
            >
              📋 AUDITORÍA DE DATOS (Pre-grabación)
            </h4>

            {/* Datos Maestros */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#000",
                  marginBottom: "8px",
                }}
              >
                🏷️ DATOS MAESTROS (del formulario):
              </div>
              <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959", width: "40%" }}>
                      Código:
                    </td>
                    <td style={{ padding: "4px 0", color: "#000", fontWeight: 500 }}>
                      {previewData.codigo}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959" }}>Municipio:</td>
                    <td style={{ padding: "4px 0", color: "#000", fontWeight: 500 }}>
                      {previewData.municipio}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959" }}>Fecha de Alta:</td>
                    <td style={{ padding: "4px 0", color: "#000", fontWeight: 500 }}>
                      {previewData.fechaAlta}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Datos Técnicos Calculados */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#000",
                  marginBottom: "8px",
                }}
              >
                ⚙️ DATOS TÉCNICOS (generados automáticamente):
              </div>
              <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959", width: "40%" }}>
                      ID Técnico:
                    </td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: "#722ED1",
                        fontWeight: 600,
                        fontFamily: "monospace",
                      }}
                    >
                      {previewData.municipioId}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959" }}>Estado:</td>
                    <td style={{ padding: "4px 0", color: "#52C41A", fontWeight: 600 }}>
                      {previewData.estado}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959" }}>Tipo:</td>
                    <td style={{ padding: "4px 0", color: "#000", fontWeight: 500 }}>
                      {previewData.tipo}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959" }}>Año:</td>
                    <td style={{ padding: "4px 0", color: "#000", fontWeight: 500 }}>
                      {previewData.year}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "4px 0", color: "#595959" }}>Tarifa Base:</td>
                    <td
                      style={{
                        padding: "4px 0",
                        color: previewData.tarifaEncontrada ? "#1890FF" : "#CF1322",
                        fontWeight: 600,
                      }}
                    >
                      {previewData.tarifaBase
                        ? `${previewData.tarifaBase.toFixed(2)} €`
                        : "⚠️ NO CONFIGURADA"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
            <button
              type="button"
              onClick={handleCorrect}
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#595959",
                backgroundColor: "#FFF",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              ✏️ Corregir
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !previewData.tarifaEncontrada}
              style={{
                flex: 2,
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#FFF",
                backgroundColor:
                  loading || !previewData.tarifaEncontrada ? "#CCC" : "#52C41A",
                border: "none",
                borderRadius: "2px",
                cursor:
                  loading || !previewData.tarifaEncontrada ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "⏳ Grabando..." : "✅ Confirmar Alta"}
            </button>
          </div>
        </div>
      )}

      {/* Info box solo visible en modo edit */}
      {mode === "edit" && (
        <div
          style={{
            marginTop: "24px",
            padding: "12px",
            fontSize: "11px",
            color: "#8C8C8C",
            backgroundColor: "#FAFAFA",
            border: "1px solid #EAEAEA",
            borderRadius: "2px",
          }}
        >
          <strong>ℹ️ Funcionamiento:</strong>
          <ul style={{ marginTop: "8px", marginLeft: "20px", lineHeight: "1.6" }}>
            <li>Pulsa "Verificar" para ver una previsualización completa antes de grabar</li>
            <li>El ID técnico se generará automáticamente desde municipio + código</li>
            <li>La tarifa se asignará según el año (debe estar configurada)</li>
            <li>Los días facturables se prorratearán desde el día de alta</li>
          </ul>
        </div>
      )}
    </div>
  );
}
