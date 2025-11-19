/**
 * SummaryHeader Component
 * Selector de mes (YYYY-MM) con estado de bloqueo y gestión de meses
 * Diseño neutro en escala de grises, sin iconos
 */

"use client";

import { useState, useEffect } from "react";
import { createNextMonth, toggleMonthLock } from "@/lib/api";

interface SummaryHeaderProps {
  monthKey: string;
  isLocked: boolean;
  onMonthChange: (monthKey: string) => void;
  onDataRefresh?: () => void;
}

export default function SummaryHeader({
  monthKey,
  isLocked,
  onMonthChange,
  onDataRefresh,
}: SummaryHeaderProps) {
  const [selectedMonth, setSelectedMonth] = useState(monthKey);
  const [isCreating, setIsCreating] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    setSelectedMonth(monthKey);
  }, [monthKey]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMonth = e.target.value;
    setSelectedMonth(newMonth);
    onMonthChange(newMonth);
  };

  const handleCreateNextMonth = async () => {
    if (!confirm("¿Crear el mes siguiente heredando estados del mes actual?")) {
      return;
    }

    setIsCreating(true);
    try {
      const [year, month] = monthKey.split("-").map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;

      const result = await createNextMonth(nextMonthKey);
      alert(
        `✅ Mes ${result.monthKey} creado exitosamente.\n\n` +
        `• ${result.panelsCreated} paneles creados\n` +
        `• Estados heredados de ${result.previousMonthKey}`
      );

      // Cambiar al mes nuevo
      onMonthChange(nextMonthKey);
      if (onDataRefresh) onDataRefresh();
    } catch (error: any) {
      alert(`❌ Error al crear mes:\n${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleLock = async () => {
    const action = isLocked ? "abrir" : "cerrar";
    if (!confirm(`¿${action.toUpperCase()} el mes ${monthKey}?`)) {
      return;
    }

    setIsToggling(true);
    try {
      const result = await toggleMonthLock(monthKey, !isLocked);
      alert(
        `✅ Mes ${result.monthKey} ${result.isLocked ? "cerrado" : "abierto"} correctamente.`
      );
      if (onDataRefresh) onDataRefresh();
    } catch (error: any) {
      alert(`❌ Error al ${action} mes:\n${error.message}`);
    } finally {
      setIsToggling(false);
    }
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

        {/* Botón: Crear mes siguiente */}
        <button
          onClick={handleCreateNextMonth}
          disabled={isCreating}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 500,
            color: "#FFF",
            backgroundColor: isCreating ? "#8C8C8C" : "#262626",
            border: "none",
            borderRadius: "2px",
            cursor: isCreating ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "background-color 150ms",
          }}
          onMouseEnter={(e) => {
            if (!isCreating) e.currentTarget.style.backgroundColor = "#000";
          }}
          onMouseLeave={(e) => {
            if (!isCreating) e.currentTarget.style.backgroundColor = "#262626";
          }}
        >
          {isCreating ? "Creando..." : "Crear mes siguiente"}
        </button>

        {/* Botón: Cerrar/Abrir mes */}
        <button
          onClick={handleToggleLock}
          disabled={isToggling}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 500,
            color: isLocked ? "#FFF" : "#000",
            backgroundColor: isToggling
              ? "#D9D9D9"
              : isLocked
              ? "#595959"
              : "#FFF",
            border: `1px solid ${isLocked ? "#595959" : "#D9D9D9"}`,
            borderRadius: "2px",
            cursor: isToggling ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => {
            if (!isToggling) {
              e.currentTarget.style.backgroundColor = isLocked ? "#262626" : "#F7F7F7";
            }
          }}
          onMouseLeave={(e) => {
            if (!isToggling) {
              e.currentTarget.style.backgroundColor = isLocked ? "#595959" : "#FFF";
            }
          }}
        >
          {isToggling ? "Procesando..." : isLocked ? "Abrir mes" : "Cerrar mes"}
        </button>
      </div>
    </div>
  );
}
