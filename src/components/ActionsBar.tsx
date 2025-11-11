/**
 * ActionsBar Component
 * Botones para generar reportes PDF/Excel
 * Diseño: horizontal, botones neutrales, estados de carga
 */

"use client";

import { useState } from "react";
import { generateReport } from "@/lib/api";

interface ActionsBarProps {
  monthKey: string;
  disabled?: boolean;
}

export default function ActionsBar({ monthKey, disabled = false }: ActionsBarProps) {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async (format: "pdf" | "excel") => {
    const setLoading = format === "pdf" ? setLoadingPDF : setLoadingExcel;
    setLoading(true);
    setError(null);

    try {
      const result = await generateReport({ monthKey, type: format });
      
      // Abrir en nueva pestaña
      window.open(result.url, "_blank");
    } catch (err: any) {
      setError(err.message || "Error al generar el reporte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => handleGenerateReport("pdf")}
          disabled={disabled || loadingPDF || loadingExcel}
          style={{
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 500,
            color: disabled || loadingPDF || loadingExcel ? "#A3A3A3" : "#000",
            backgroundColor: "#FFF",
            border: "1px solid #D9D9D9",
            borderRadius: "2px",
            cursor: disabled || loadingPDF || loadingExcel ? "not-allowed" : "pointer",
            transition: "all 150ms",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            if (!disabled && !loadingPDF && !loadingExcel) {
              e.currentTarget.style.backgroundColor = "#F7F7F7";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FFF";
          }}
        >
          {loadingPDF ? "Generando..." : "Generar PDF"}
        </button>

        <button
          onClick={() => handleGenerateReport("excel")}
          disabled={disabled || loadingPDF || loadingExcel}
          style={{
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 500,
            color: disabled || loadingPDF || loadingExcel ? "#A3A3A3" : "#000",
            backgroundColor: "#FFF",
            border: "1px solid #D9D9D9",
            borderRadius: "2px",
            cursor: disabled || loadingPDF || loadingExcel ? "not-allowed" : "pointer",
            transition: "all 150ms",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            if (!disabled && !loadingPDF && !loadingExcel) {
              e.currentTarget.style.backgroundColor = "#F7F7F7";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FFF";
          }}
        >
          {loadingExcel ? "Generando..." : "Generar Excel"}
        </button>
      </div>

      {error && (
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
          {error}
        </div>
      )}
    </div>
  );
}
