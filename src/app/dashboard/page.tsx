/**
 * Dashboard Page
 * Integra todos los componentes: Header, KPIs, Filtros, Tabla, Acciones, Admin
 * Diseño: layout responsivo con 8pt spacing, paleta neutral
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase";
import {
  getSummary,
  getMonthlyBilling,
  BillingSummary,
  BillingMonthlyPanel,
} from "@/lib/api";
import SummaryHeader from "@/components/SummaryHeader";
import KPIGrid from "@/components/KPIGrid";
import FiltersBar from "@/components/FiltersBar";
import MonthlyBillingTable from "@/components/MonthlyBillingTable";
import ActionsBar from "@/components/ActionsBar";
import AdminSection from "@/components/AdminSection";
import RefreshTokenButton from "@/components/RefreshTokenButton";

export default function DashboardPage() {
  const router = useRouter();
  
  // Estado
  const [monthKey, setMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [panels, setPanels] = useState<BillingMonthlyPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Auth
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.token?.admin === true;
  const isLocked = summary?.isLocked ?? false;

  // Protección de ruta: redirigir a login si no hay usuario
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [summaryData, panelsData] = await Promise.all([
          getSummary(monthKey),
          getMonthlyBilling(monthKey),
        ]);

        setSummary(summaryData);
        setPanels(panelsData);
      } catch (err: any) {
        setError(err.message || "Error al cargar los datos");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [monthKey]);

  const handleMonthChange = (newMonth: string) => {
    setMonthKey(newMonth);
  };

  const handleMonthClosed = () => {
    // Recargar summary para actualizar isLocked
    getSummary(monthKey).then(setSummary).catch(console.error);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F7F7F7",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <SummaryHeader
          monthKey={monthKey}
          isLocked={isLocked}
          onMonthChange={handleMonthChange}
          onDataRefresh={() => {
            getSummary(monthKey).then(setSummary).catch(console.error);
            getMonthlyBilling(monthKey).then(setPanels).catch(console.error);
          }}
        />

        {/* Aviso si mes bloqueado */}
        {isLocked && !loading && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              backgroundColor: "#F7F7F7",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
              fontSize: "14px",
              color: "#595959",
            }}
          >
            Este mes está cerrado. No se pueden crear ni modificar eventos.
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              backgroundColor: "#FFF",
              border: "1px solid #EAEAEA",
              borderRadius: "2px",
              fontSize: "14px",
              color: "#595959",
            }}
          >
            {error}
          </div>
        )}

        {/* KPIs */}
        <div style={{ marginTop: "24px" }}>
          <KPIGrid summary={summary} isLoading={loading} />
        </div>

        {/* Filters */}
        <div style={{ marginTop: "24px" }}>
          <FiltersBar
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onSearchChange={setSearchQuery}
            onStatusFilterChange={setStatusFilter}
          />
        </div>

        {/* Table */}
        <div style={{ marginTop: "24px" }}>
          <MonthlyBillingTable
            panels={panels}
            isLoading={loading}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            monthKey={monthKey}
            onRefresh={() => {
              getSummary(monthKey).then(setSummary).catch(console.error);
              getMonthlyBilling(monthKey).then(setPanels).catch(console.error);
            }}
          />
        </div>

        {/* Actions - Los reportes son lectura, siempre habilitados */}
        <div style={{ marginTop: "24px" }}>
          <ActionsBar monthKey={monthKey} disabled={loading} />
        </div>

        {/* Admin Section - Import/Close bloqueados si isLocked */}
        {isAdmin && (
          <AdminSection
            isAdmin={isAdmin}
            isLocked={isLocked}
            monthKey={monthKey}
            onMonthClosed={handleMonthClosed}
          />
        )}

        {/* Botón temporal para refrescar Custom Claims */}
        <RefreshTokenButton />
      </div>
    </div>
  );
}
