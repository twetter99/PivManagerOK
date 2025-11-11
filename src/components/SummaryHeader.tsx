/**
 * SummaryHeader Component
 * Selector de mes (YYYY-MM) con estado de bloqueo
 * Diseño neutro en escala de grises, sin iconos
 */

"use client";

import { useState, useEffect } from "react";

interface SummaryHeaderProps {
  monthKey: string;
  isLocked: boolean;
  onMonthChange: (monthKey: string) => void;
}

export default function SummaryHeader({
  monthKey,
  isLocked,
  onMonthChange,
}: SummaryHeaderProps) {
  const [selectedMonth, setSelectedMonth] = useState(monthKey);

  useEffect(() => {
    setSelectedMonth(monthKey);
  }, [monthKey]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMonth = e.target.value;
    setSelectedMonth(newMonth);
    onMonthChange(newMonth);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 0",
        borderBottom: "1px solid #EAEAEA",
        marginBottom: "24px",
      }}
    >
      <div>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "#000",
            margin: 0,
            marginBottom: "4px",
          }}
        >
          Dashboard de Facturación
        </h1>
        <p
          style={{
            fontSize: "14px",
            fontWeight: 400,
            color: "#595959",
            margin: 0,
          }}
        >
          Gestión y análisis de paneles PIV
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        {/* Selector de mes */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <label
            htmlFor="month-selector"
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "#595959",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Mes
          </label>
          <input
            id="month-selector"
            type="month"
            value={selectedMonth}
            onChange={handleMonthChange}
            style={{
              padding: "8px 12px",
              fontSize: "14px",
              fontWeight: 400,
              color: "#000",
              backgroundColor: "#FFF",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              outline: "none",
              minWidth: "160px",
              cursor: "pointer",
              transition: "border-color 150ms",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#595959";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#D9D9D9";
            }}
          />
        </div>

        {/* Indicador de bloqueo */}
        {isLocked && (
          <div
            style={{
              padding: "8px 12px",
              fontSize: "12px",
              fontWeight: 500,
              color: "#595959",
              backgroundColor: "#F7F7F7",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              whiteSpace: "nowrap",
            }}
          >
            Mes cerrado
          </div>
        )}
      </div>
    </div>
  );
}
