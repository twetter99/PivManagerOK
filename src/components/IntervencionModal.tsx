/**
 * IntervencionModal Component
 * Modal para registrar intervenciones puntuales en paneles
 * (reparaciones, vandalismos, mantenimiento, etc.)
 */

"use client";

import { useState } from "react";
import { createIntervencion } from "@/lib/api";

interface IntervencionModalProps {
  isOpen: boolean;
  onClose: () => void;
  panelId: string;
  codigo: string;
  municipio: string;
  monthKey: string;
  onSuccess?: () => void;
}

const TIPOS_INTERVENCION = [
  { value: "REPARACION", label: "Reparación" },
  { value: "INSTALACION", label: "Instalación" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "VANDALISMO", label: "Vandalismo" },
  { value: "OTRO", label: "Otro" },
] as const;

export default function IntervencionModal({
  isOpen,
  onClose,
  panelId,
  codigo,
  municipio,
  monthKey,
  onSuccess,
}: IntervencionModalProps) {
  const [fecha, setFecha] = useState("");
  const [tipoIntervencion, setTipoIntervencion] = useState<string>("REPARACION");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [evidenciaUrl, setEvidenciaUrl] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Validar fecha en tiempo real
  const handleFechaChange = (value: string) => {
    setFecha(value);
    setWarning(null);
    
    if (value) {
      const [year, month] = value.split("-");
      const inputMonthKey = `${year}-${month}`;
      
      if (inputMonthKey !== monthKey) {
        setWarning(`La fecha seleccionada no pertenece al mes actual (${monthKey}). Las intervenciones solo afectan al mes en que ocurren.`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validar campos
      if (!fecha || !concepto.trim() || !importe) {
        throw new Error("Completa todos los campos obligatorios");
      }

      const importeNum = parseFloat(importe);
      if (isNaN(importeNum) || importeNum === 0) {
        throw new Error("El importe debe ser un número diferente de 0");
      }

      // Validar que la fecha esté en el mes correcto
      const [year, month] = fecha.split("-");
      const inputMonthKey = `${year}-${month}`;
      
      if (inputMonthKey !== monthKey) {
        throw new Error(`La fecha debe estar en el mes ${monthKey}`);
      }

      await createIntervencion({
        panelId,
        effectiveDateLocal: fecha,
        tipoIntervencion: tipoIntervencion as any,
        concepto: concepto.trim(),
        importe: importeNum,
        evidenciaUrl: evidenciaUrl.trim() || undefined,
      });

      // Limpiar formulario
      setFecha("");
      setTipoIntervencion("REPARACION");
      setConcepto("");
      setImporte("");
      setEvidenciaUrl("");
      
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al registrar la intervención");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

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
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFF",
          borderRadius: "2px",
          width: "540px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #EAEAEA",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
              color: "#000",
            }}
          >
            Registrar Intervención
          </h2>
          <div
            style={{
              marginTop: "8px",
              fontSize: "14px",
              color: "#595959",
            }}
          >
            Panel: <strong>{codigo}</strong> • {municipio}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px" }}>
            {/* Advertencia si hay warning */}
            {warning && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px 16px",
                  backgroundColor: "#FFF3CD",
                  border: "1px solid #FFE69C",
                  borderRadius: "2px",
                  fontSize: "13px",
                  color: "#856404",
                }}
              >
                ⚠️ {warning}
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px 16px",
                  backgroundColor: "#FFE5E5",
                  border: "1px solid #FFB3B3",
                  borderRadius: "2px",
                  fontSize: "13px",
                  color: "#C62828",
                }}
              >
                {error}
              </div>
            )}

            {/* Fecha */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#000",
                }}
              >
                Fecha de la intervención *
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => handleFechaChange(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  outline: "none",
                  transition: "border-color 150ms",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#000";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D9D9D9";
                }}
              />
            </div>

            {/* Tipo de intervención */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#000",
                }}
              >
                Tipo de intervención *
              </label>
              <select
                value={tipoIntervencion}
                onChange={(e) => setTipoIntervencion(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  outline: "none",
                  backgroundColor: "#FFF",
                  cursor: "pointer",
                  transition: "border-color 150ms",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#000";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D9D9D9";
                }}
              >
                {TIPOS_INTERVENCION.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Concepto */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#000",
                }}
              >
                Concepto / Descripción *
              </label>
              <textarea
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: Sustitución de cristal vandalizado"
                required
                maxLength={500}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  transition: "border-color 150ms",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#000";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D9D9D9";
                }}
              />
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#8C8C8C",
                  textAlign: "right",
                }}
              >
                {concepto.length}/500 caracteres
              </div>
            </div>

            {/* Importe */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#000",
                }}
              >
                Importe (€) *
              </label>
              <input
                type="number"
                step="0.01"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="50.00"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  outline: "none",
                  transition: "border-color 150ms",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#000";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D9D9D9";
                }}
              />
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#8C8C8C",
                }}
              >
                Puede ser positivo (cargo) o negativo (descuento)
              </div>
            </div>

            {/* Evidencia (opcional) */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#000",
                }}
              >
                URL de evidencia (opcional)
              </label>
              <input
                type="url"
                value={evidenciaUrl}
                onChange={(e) => setEvidenciaUrl(e.target.value)}
                placeholder="https://ejemplo.com/foto.jpg"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  outline: "none",
                  transition: "border-color 150ms",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#000";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D9D9D9";
                }}
              />
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#8C8C8C",
                }}
              >
                Link a foto o documento de la intervención
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #EAEAEA",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#000",
                backgroundColor: "#FFF",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                outline: "none",
                transition: "all 150ms",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#F7F7F7";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#FFF";
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#FFF",
                backgroundColor: loading ? "#8C8C8C" : "#000",
                border: "none",
                borderRadius: "2px",
                cursor: loading ? "not-allowed" : "pointer",
                outline: "none",
                transition: "all 150ms",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#262626";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#000";
                }
              }}
            >
              {loading ? "Registrando..." : "Registrar Intervención"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
