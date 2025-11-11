/**
 * KPICard Component
 * Tarjeta reutilizable para mostrar KPIs
 * Diseño neutro: borde 1px, sin sombras, tipografía sobria
 */

"use client";

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  isLoading?: boolean;
}

export default function KPICard({
  label,
  value,
  unit,
  isLoading = false,
}: KPICardProps) {
  if (isLoading) {
    return (
      <div
        style={{
          padding: "24px",
          backgroundColor: "#FFF",
          border: "1px solid #EAEAEA",
          borderRadius: "2px",
          minHeight: "120px",
        }}
      >
        {/* Skeleton loading */}
        <div
          style={{
            width: "60%",
            height: "14px",
            backgroundColor: "#F7F7F7",
            marginBottom: "16px",
            borderRadius: "2px",
          }}
        />
        <div
          style={{
            width: "80%",
            height: "28px",
            backgroundColor: "#F7F7F7",
            borderRadius: "2px",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "24px",
        backgroundColor: "#FFF",
        border: "1px solid #EAEAEA",
        borderRadius: "2px",
        minHeight: "120px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: "#595959",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "12px",
        }}
      >
        {label}
      </div>

      {/* Value */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "4px",
        }}
      >
        <span
          style={{
            fontSize: "28px",
            fontWeight: 600,
            color: "#000",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: "16px",
              fontWeight: 400,
              color: "#A3A3A3",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
