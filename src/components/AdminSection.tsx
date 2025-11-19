/**
 * AdminSection Component
 * Launcher para abrir la Consola de Administración
 * Solo visible para usuarios con rol admin
 */

"use client";

import { useState } from "react";
import AdminConsoleModal from "./AdminConsoleModal";

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
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <div
        style={{
          marginTop: "32px",
          paddingTop: "24px",
          borderTop: "1px solid #EAEAEA",
          textAlign: "center",
        }}
      >
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: "16px 32px",
            fontSize: "16px",
            fontWeight: 600,
            color: "#FFF",
            backgroundColor: "#1890FF",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#40A9FF";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#1890FF";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
          }}
        >
          <span style={{ fontSize: "20px" }}>⚙️</span>
          <span>Consola de Administración</span>
        </button>

        <p
          style={{
            marginTop: "12px",
            fontSize: "13px",
            color: "#8C8C8C",
          }}
        >
          Gestión de tarifas, operaciones mensuales y mantenimiento
        </p>
      </div>

      <AdminConsoleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        monthKey={monthKey}
        isLocked={isLocked}
        onMonthClosed={onMonthClosed}
      />
    </>
  );
}
