/**
 * KPIGrid Component
 * Grid de 5 KPIs en diseño responsive
 * Spacing 8pt, diseño neutro
 */

"use client";

import KPICard from "./KPICard";
import { BillingSummary } from "@/lib/api";

interface KPIGridProps {
  summary: BillingSummary | null;
  isLoading?: boolean;
}

export default function KPIGrid({ summary, isLoading = false }: KPIGridProps) {
  // Formato de número con separadores de miles (punto)
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat("es-ES", {
      useGrouping: true,
    }).format(num);
  };

  // Formato de moneda: 1.234,56 €
  const formatCurrency = (num: number): string => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {[...Array(5)].map((_, index) => (
          <KPICard key={index} label="" value="" isLoading={true} />
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          backgroundColor: "#F7F7F7",
          border: "1px solid #EAEAEA",
          borderRadius: "2px",
          marginBottom: "32px",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            color: "#595959",
            margin: 0,
          }}
        >
          No hay datos disponibles para este mes
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "32px",
      }}
    >
      <KPICard
        label="Total Facturado"
        value={formatCurrency(summary.totalImporteMes)}
        unit="€"
      />

      <KPICard
        label="Paneles Facturables"
        value={formatNumber(summary.totalPanelesFacturables)}
      />

      <KPICard
        label="Paneles Activos"
        value={formatNumber(summary.panelesActivos)}
      />

      <KPICard
        label="Paneles Parciales"
        value={formatNumber(summary.panelesParciales)}
      />

      <KPICard
        label="Eventos del Mes"
        value={formatNumber(summary.totalEventos)}
      />
    </div>
  );
}
