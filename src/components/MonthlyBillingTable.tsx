/**
 * MonthlyBillingTable Component
 * Tabla con paginación, ordenación y export CSV
 * Diseño: filas 48-56px, bordes sutiles, hover gris
 */

"use client";

import { useState, useMemo } from "react";
import { BillingMonthlyPanel } from "@/lib/api";
import PanelActionsMenu from "./PanelActionsMenu";

interface MonthlyBillingTableProps {
  panels: BillingMonthlyPanel[];
  isLoading?: boolean;
  searchQuery?: string;
  statusFilter?: string;
  monthKey?: string;
  onRefresh?: () => void;
}

export default function MonthlyBillingTable({
  panels,
  isLoading = false,
  searchQuery = "",
  statusFilter = "all",
  monthKey,
  onRefresh,
}: MonthlyBillingTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string>("codigo");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const pageSize = 20;

  // Filtrado y ordenación
  const filteredAndSortedPanels = useMemo(() => {
    let filtered = [...panels];

    // Aplicar búsqueda
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (panel) =>
          panel.codigo.toLowerCase().includes(query) ||
          panel.municipio.toLowerCase().includes(query)
      );
    }

    // Aplicar filtro de estado
    if (statusFilter !== "all") {
      if (statusFilter === "PARCIAL") {
        filtered = filtered.filter(
          (panel) =>
            panel.totalDiasFacturables > 0 && panel.totalDiasFacturables < 30
        );
      } else {
        filtered = filtered.filter(
          (panel) => panel.estadoAlCierre === statusFilter
        );
      }
    }

    // Ordenar
    filtered.sort((a, b) => {
      const aValue = a[sortColumn as keyof BillingMonthlyPanel];
      const bValue = b[sortColumn as keyof BillingMonthlyPanel];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });

    return filtered;
  }, [panels, searchQuery, statusFilter, sortColumn, sortDirection]);

  // Paginación
  const totalPages = Math.ceil(filteredAndSortedPanels.length / pageSize);
  const paginatedPanels = filteredAndSortedPanels.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Función de ordenación
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Export CSV (separador ; con UTF-8 BOM para Excel)
  const handleExportCSV = () => {
    const headers = [
      "Código",
      "Municipio",
      "Días",
      "Importe",
      "Estado",
      "Tarifa",
    ];

    const csvContent = [
      headers.join(";"),
      ...filteredAndSortedPanels.map((panel) =>
        [
          panel.codigo,
          panel.municipio,
          panel.totalDiasFacturables,
          panel.totalImporte.toFixed(2).replace(".", ","),
          panel.estadoAlCierre,
          panel.tarifaAplicada.toFixed(2).replace(".", ","),
        ].join(";")
      ),
    ].join("\n");

    // UTF-8 BOM para Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `billing_${panels[0]?.monthKey || "export"}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div
        style={{
          backgroundColor: "#FFF",
          border: "1px solid #EAEAEA",
          borderRadius: "2px",
        }}
      >
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            style={{
              padding: "16px",
              borderBottom: index < 4 ? "1px solid #EAEAEA" : "none",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "16px",
                backgroundColor: "#F7F7F7",
                borderRadius: "2px",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header con contador y export */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            color: "#595959",
          }}
        >
          {filteredAndSortedPanels.length} panel
          {filteredAndSortedPanels.length !== 1 ? "es" : ""}
        </div>

        <button
          onClick={handleExportCSV}
          disabled={filteredAndSortedPanels.length === 0}
          style={{
            padding: "8px 16px",
            fontSize: "12px",
            fontWeight: 500,
            color: filteredAndSortedPanels.length === 0 ? "#A3A3A3" : "#000",
            backgroundColor: "#FFF",
            border: "1px solid #D9D9D9",
            borderRadius: "2px",
            cursor:
              filteredAndSortedPanels.length === 0 ? "not-allowed" : "pointer",
            transition: "all 150ms",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            if (filteredAndSortedPanels.length > 0) {
              e.currentTarget.style.backgroundColor = "#F7F7F7";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FFF";
          }}
        >
          Exportar CSV
        </button>
      </div>

      {/* Tabla */}
      <div
        style={{
          backgroundColor: "#FFF",
          border: "1px solid #EAEAEA",
          borderRadius: "2px",
          overflow: "visible",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "#F7F7F7",
                borderBottom: "1px solid #EAEAEA",
              }}
            >
              {[
                { key: "codigo", label: "Código" },
                { key: "municipio", label: "Municipio" },
                { key: "totalDiasFacturables", label: "Días" },
                { key: "totalImporte", label: "Importe" },
                { key: "estadoAlCierre", label: "Estado" },
                { key: "tarifaAplicada", label: "Tarifa" },
                { key: "actions", label: "Acciones" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.key !== "actions" && handleSort(col.key)}
                  style={{
                    padding: "12px 16px",
                    textAlign: col.key === "actions" ? "center" : "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#595959",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: col.key === "actions" ? "default" : "pointer",
                    userSelect: "none",
                    width: col.key === "actions" ? "80px" : "auto",
                  }}
                >
                  {col.label}
                  {sortColumn === col.key && col.key !== "actions" && (
                    <span style={{ marginLeft: "4px" }}>
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedPanels.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "48px 24px",
                    textAlign: "center",
                    fontSize: "14px",
                    color: "#595959",
                  }}
                >
                  No se encontraron paneles
                </td>
              </tr>
            ) : (
              paginatedPanels.map((panel, index) => (
                <tr
                  key={panel.panelId}
                  style={{
                    borderBottom:
                      index < paginatedPanels.length - 1
                        ? "1px solid #EAEAEA"
                        : "none",
                    transition: "background-color 150ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#F7F7F7";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#000",
                    }}
                  >
                    {panel.codigo}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      color: "#595959",
                    }}
                  >
                    {panel.municipio}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      color: "#000",
                      textAlign: "right",
                    }}
                  >
                    {panel.totalDiasFacturables}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#000",
                      textAlign: "right",
                    }}
                  >
                    {panel.totalImporte.toFixed(2)} €
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "12px",
                      color: "#595959",
                    }}
                  >
                    {panel.estadoAlCierre}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      color: "#595959",
                      textAlign: "right",
                    }}
                  >
                    {panel.tarifaAplicada.toFixed(2)} €
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      textAlign: "center",
                    }}
                  >
                    {monthKey && (
                      <PanelActionsMenu
                        panelId={panel.panelId}
                        monthKey={monthKey}
                        codigo={panel.codigo}
                        municipio={panel.municipio}
                        tarifaActual={panel.tarifaAplicada}
                        onSuccess={onRefresh}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            marginTop: "24px",
          }}
        >
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: 500,
              color: currentPage === 1 ? "#A3A3A3" : "#000",
              backgroundColor: "#FFF",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              outline: "none",
            }}
          >
            Anterior
          </button>

          <span
            style={{
              fontSize: "14px",
              color: "#595959",
            }}
          >
            Página {currentPage} de {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: 500,
              color: currentPage === totalPages ? "#A3A3A3" : "#000",
              backgroundColor: "#FFF",
              border: "1px solid #D9D9D9",
              borderRadius: "2px",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              outline: "none",
            }}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
