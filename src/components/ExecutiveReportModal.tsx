/**
 * ExecutiveReportModal Component
 * Modal que muestra el informe ejecutivo financiero mensual
 */

"use client";

import { useState } from "react";
import { ExecutiveReport } from "@/lib/api";
import * as XLSX from "xlsx";

interface ExecutiveReportModalProps {
  report: ExecutiveReport;
  onClose: () => void;
}

export default function ExecutiveReportModal({
  report,
  onClose,
}: ExecutiveReportModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const formatEuros = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatEurosForExcel = (amount: number) => {
    return amount; // Devolver número puro para Excel
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const getEventLabel = (tipo: string) => {
    const labels: { [key: string]: string } = {
      ALTA_INICIAL: "Alta Inicial",
      ALTA: "Alta",
      BAJA: "Baja",
      DESMONTADO: "Desmontado",
      DESMONTAJE: "Desmontaje",
      REINSTALACION: "Reinstalación",
      AJUSTE_MANUAL: "Ajuste Manual",
      CAMBIO_TARIFA: "Cambio Tarifa",
    };
    return labels[tipo] || tipo;
  };

  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split("-");
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const downloadExcel = () => {
    setIsDownloading(true);
    try {
      // Crear un nuevo libro de trabajo
      const workbook = XLSX.utils.book_new();

      // Hoja 1: Resumen Financiero
      const retencion = report.resumenFinanciero.totalFacturado * 0.04;
      const importeNeto = report.resumenFinanciero.totalFacturado - retencion;
      
      const summaryData = [
        ["RESUMEN FINANCIERO"],
        ["Mes", getMonthName(report.monthKey)],
        [""],
        ["Concepto", "Importe (EUR)"],
        ["Total Facturado", formatEurosForExcel(report.resumenFinanciero.totalFacturado)],
        ["Retención (-4%)", formatEurosForExcel(retencion)],
        ["Importe Neto", formatEurosForExcel(importeNeto)],
        [""],
        ["Concepto", "Cantidad"],
        ["Total Paneles", report.resumenFinanciero.totalPaneles],
        ["Paneles Activos", report.resumenFinanciero.panelesActivos],
        ["Paneles Parciales", report.resumenFinanciero.panelesParciales],
        ["Paneles de Baja", report.resumenFinanciero.panelesBaja],
        [""],
        ["Importe Promedio por Panel", formatEurosForExcel(report.resumenFinanciero.importePromedio)],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet["!cols"] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen Financiero");

      // Hoja 2: Actividad del Mes
      const activityData = [
        ["ACTIVIDAD DEL MES"],
        [""],
        ["Concepto", "Cantidad", "Importe (EUR)"],
        ["Altas Nuevas", report.actividadMes.altasNuevas.cantidad, formatEurosForExcel(report.actividadMes.altasNuevas.importeGenerado)],
        ["Bajas", report.actividadMes.bajas.cantidad, formatEurosForExcel(report.actividadMes.bajas.importePerdido)],
        ["Desmontajes", report.actividadMes.desmontajes.cantidad, "-"],
        ["Reinstalaciones", report.actividadMes.reinstalaciones.cantidad, "-"],
        ["Ajustes Manuales", report.actividadMes.ajustesManuales.cantidad, formatEurosForExcel(report.actividadMes.ajustesManuales.importeTotal)],
      ];
      const activitySheet = XLSX.utils.aoa_to_sheet(activityData);
      activitySheet["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, activitySheet, "Actividad");

      // Hoja 3: Top Municipios
      const municipiosData = [
        ["TOP 5 MUNICIPIOS POR FACTURACIÓN"],
        [""],
        ["Municipio", "Paneles", "Importe Facturado (EUR)"],
        ...report.topMunicipios.map((m) => [
          m.nombre,
          m.paneles,
          formatEurosForExcel(m.importe),
        ]),
      ];
      const municipiosSheet = XLSX.utils.aoa_to_sheet(municipiosData);
      municipiosSheet["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(workbook, municipiosSheet, "Top Municipios");

      // Hoja 4: Indicadores de Calidad
      const totalPaneles = report.indicadoresCalidad.panelesCompletos + 
                          report.indicadoresCalidad.panelesParciales + 
                          report.indicadoresCalidad.panelesProblematicos;
      
      const calidadData = [
        ["INDICADORES DE CALIDAD"],
        [""],
        ["Concepto", "Cantidad", "Porcentaje"],
        ["Paneles Completos (30 días)", report.indicadoresCalidad.panelesCompletos, 
         `${((report.indicadoresCalidad.panelesCompletos / totalPaneles) * 100).toFixed(1)}%`],
        ["Paneles Parciales", report.indicadoresCalidad.panelesParciales,
         `${((report.indicadoresCalidad.panelesParciales / totalPaneles) * 100).toFixed(1)}%`],
        ["Paneles Problemáticos", report.indicadoresCalidad.panelesProblematicos,
         `${((report.indicadoresCalidad.panelesProblematicos / totalPaneles) * 100).toFixed(1)}%`],
      ];
      const calidadSheet = XLSX.utils.aoa_to_sheet(calidadData);
      calidadSheet["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, calidadSheet, "Calidad");

      // Hoja 5: Eventos Destacados (si existen)
      if (report.eventosDestacados && report.eventosDestacados.length > 0) {
        const eventosData = [
          ["EVENTOS DESTACADOS"],
          [""],
          ["Fecha", "Panel", "Municipio", "Tipo", "Importe (EUR)"],
          ...report.eventosDestacados.map((e) => [
            new Date(e.fecha).toLocaleDateString("es-ES"),
            e.panel,
            e.municipio,
            getEventLabel(e.tipo),
            e.importe !== 0 ? formatEurosForExcel(e.importe) : 0,
          ]),
        ];
        const eventosSheet = XLSX.utils.aoa_to_sheet(eventosData);
        eventosSheet["!cols"] = [{ wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(workbook, eventosSheet, "Eventos");
      }

      // Generar y descargar el archivo
      const fileName = `Informe_Ejecutivo_${report.monthKey}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error("Error generando Excel:", error);
      alert("Error al generar el archivo Excel");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        overflow: "auto",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFF",
          borderRadius: "8px",
          maxWidth: "900px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "2px solid #1890FF",
            position: "sticky",
            top: 0,
            backgroundColor: "#FFF",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px", color: "#262626", fontWeight: 600 }}>
                📄 Informe Ejecutivo
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#8C8C8C" }}>
                {getMonthName(report.monthKey)}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                color: "#595959",
                backgroundColor: "#FFF",
                border: "1px solid #D9D9D9",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {/* Resumen Financiero */}
          <section style={{ marginBottom: "32px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#262626", fontWeight: 600 }}>
              💰 Resumen Financiero
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
              }}
            >
              <div style={{ padding: "16px", backgroundColor: "#E6F7FF", borderRadius: "4px", border: "1px solid #91D5FF" }}>
                <div style={{ fontSize: "12px", color: "#595959", marginBottom: "4px" }}>Total Facturado</div>
                <div style={{ fontSize: "24px", color: "#1890FF", fontWeight: 600 }}>
                  {formatEuros(report.resumenFinanciero.totalFacturado)}
                </div>
              </div>
              <div style={{ padding: "16px", backgroundColor: "#F6FFED", borderRadius: "4px", border: "1px solid #B7EB8F" }}>
                <div style={{ fontSize: "12px", color: "#595959", marginBottom: "4px" }}>Total Paneles</div>
                <div style={{ fontSize: "24px", color: "#52C41A", fontWeight: 600 }}>
                  {report.resumenFinanciero.totalPaneles}
                </div>
              </div>
              <div style={{ padding: "16px", backgroundColor: "#FFF7E6", borderRadius: "4px", border: "1px solid #FFD591" }}>
                <div style={{ fontSize: "12px", color: "#595959", marginBottom: "4px" }}>Importe Promedio</div>
                <div style={{ fontSize: "24px", color: "#FA8C16", fontWeight: 600 }}>
                  {formatEuros(report.resumenFinanciero.importePromedio)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "12px", fontSize: "13px", color: "#595959", display: "flex", gap: "16px" }}>
              <span>✅ Activos: {report.resumenFinanciero.panelesActivos}</span>
              <span>⚠️ Parciales: {report.resumenFinanciero.panelesParciales}</span>
              <span>❌ Baja: {report.resumenFinanciero.panelesBaja}</span>
            </div>
          </section>

          {/* Actividad del Mes */}
          <section style={{ marginBottom: "32px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#262626", fontWeight: 600 }}>
              📊 Actividad del Mes
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
              <div style={{ padding: "12px", backgroundColor: "#F6FFED", borderRadius: "4px", border: "1px solid #D9F7BE" }}>
                <div style={{ fontSize: "11px", color: "#595959", marginBottom: "4px" }}>🆕 Altas Nuevas</div>
                <div style={{ fontSize: "18px", color: "#52C41A", fontWeight: 600 }}>
                  {report.actividadMes.altasNuevas.cantidad}
                </div>
                <div style={{ fontSize: "11px", color: "#8C8C8C" }}>
                  +{formatEuros(report.actividadMes.altasNuevas.importeGenerado)}
                </div>
              </div>
              <div style={{ padding: "12px", backgroundColor: "#FFF1F0", borderRadius: "4px", border: "1px solid #FFCCC7" }}>
                <div style={{ fontSize: "11px", color: "#595959", marginBottom: "4px" }}>❌ Bajas</div>
                <div style={{ fontSize: "18px", color: "#FF4D4F", fontWeight: 600 }}>
                  {report.actividadMes.bajas.cantidad}
                </div>
                <div style={{ fontSize: "11px", color: "#8C8C8C" }}>
                  -{formatEuros(report.actividadMes.bajas.importePerdido)}
                </div>
              </div>
              <div style={{ padding: "12px", backgroundColor: "#FFF7E6", borderRadius: "4px", border: "1px solid #FFE7BA" }}>
                <div style={{ fontSize: "11px", color: "#595959", marginBottom: "4px" }}>🔧 Desmontajes</div>
                <div style={{ fontSize: "18px", color: "#FA8C16", fontWeight: 600 }}>
                  {report.actividadMes.desmontajes.cantidad}
                </div>
              </div>
              <div style={{ padding: "12px", backgroundColor: "#E6F7FF", borderRadius: "4px", border: "1px solid #BAE7FF" }}>
                <div style={{ fontSize: "11px", color: "#595959", marginBottom: "4px" }}>🔄 Reinstalaciones</div>
                <div style={{ fontSize: "18px", color: "#1890FF", fontWeight: 600 }}>
                  {report.actividadMes.reinstalaciones.cantidad}
                </div>
              </div>
              <div style={{ padding: "12px", backgroundColor: "#F9F0FF", borderRadius: "4px", border: "1px solid #D3ADF7" }}>
                <div style={{ fontSize: "11px", color: "#595959", marginBottom: "4px" }}>⚙️ Ajustes</div>
                <div style={{ fontSize: "18px", color: "#722ED1", fontWeight: 600 }}>
                  {report.actividadMes.ajustesManuales.cantidad}
                </div>
                <div style={{ fontSize: "11px", color: "#8C8C8C" }}>
                  {report.actividadMes.ajustesManuales.importeTotal >= 0 ? "+" : ""}
                  {formatEuros(report.actividadMes.ajustesManuales.importeTotal)}
                </div>
              </div>
            </div>
          </section>

          {/* Top Municipios */}
          <section style={{ marginBottom: "32px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#262626", fontWeight: 600 }}>
              🏙️ Top 5 Municipios
            </h3>
            <div style={{ border: "1px solid #F0F0F0", borderRadius: "4px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAFAFA" }}>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#595959" }}>
                      #
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#595959" }}>
                      Municipio
                    </th>
                    <th style={{ padding: "12px", textAlign: "right", fontSize: "12px", fontWeight: 600, color: "#595959" }}>
                      Paneles
                    </th>
                    <th style={{ padding: "12px", textAlign: "right", fontSize: "12px", fontWeight: 600, color: "#595959" }}>
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.topMunicipios.map((municipio, index) => (
                    <tr
                      key={index}
                      style={{
                        borderTop: index > 0 ? "1px solid #F0F0F0" : "none",
                      }}
                    >
                      <td style={{ padding: "12px", fontSize: "13px", color: "#8C8C8C" }}>
                        {index + 1}
                      </td>
                      <td style={{ padding: "12px", fontSize: "13px", color: "#262626" }}>
                        {municipio.nombre}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontSize: "13px", color: "#595959" }}>
                        {municipio.paneles}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontSize: "13px", color: "#1890FF", fontWeight: 600 }}>
                        {formatEuros(municipio.importe)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Indicadores de Calidad */}
          <section style={{ marginBottom: "32px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#262626", fontWeight: 600 }}>
              ✅ Indicadores de Calidad
            </h3>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ padding: "12px 16px", backgroundColor: "#F6FFED", borderRadius: "4px", border: "1px solid #B7EB8F" }}>
                <span style={{ fontSize: "13px", color: "#595959" }}>Paneles Completos (30 días): </span>
                <span style={{ fontSize: "14px", color: "#52C41A", fontWeight: 600 }}>
                  {report.indicadoresCalidad.panelesCompletos}
                </span>
              </div>
              <div style={{ padding: "12px 16px", backgroundColor: "#FFF7E6", borderRadius: "4px", border: "1px solid #FFD591" }}>
                <span style={{ fontSize: "13px", color: "#595959" }}>Paneles Parciales: </span>
                <span style={{ fontSize: "14px", color: "#FA8C16", fontWeight: 600 }}>
                  {report.indicadoresCalidad.panelesParciales}
                </span>
              </div>
              <div style={{ padding: "12px 16px", backgroundColor: report.indicadoresCalidad.panelesProblematicos > 0 ? "#FFF1F0" : "#F6FFED", borderRadius: "4px", border: `1px solid ${report.indicadoresCalidad.panelesProblematicos > 0 ? "#FFCCC7" : "#B7EB8F"}` }}>
                <span style={{ fontSize: "13px", color: "#595959" }}>⚠️ Paneles Problemáticos: </span>
                <span style={{ fontSize: "14px", color: report.indicadoresCalidad.panelesProblematicos > 0 ? "#FF4D4F" : "#52C41A", fontWeight: 600 }}>
                  {report.indicadoresCalidad.panelesProblematicos}
                </span>
              </div>
            </div>
          </section>

          {/* Eventos Destacados */}
          {report.eventosDestacados.length > 0 && (
            <section>
              <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#262626", fontWeight: 600 }}>
                📅 Eventos del Mes ({report.eventosDestacados.length})
              </h3>
              <div
                style={{
                  maxHeight: "300px",
                  overflow: "auto",
                  border: "1px solid #F0F0F0",
                  borderRadius: "4px",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "#FAFAFA", zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: "10px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#595959" }}>
                        Fecha
                      </th>
                      <th style={{ padding: "10px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#595959" }}>
                        Tipo
                      </th>
                      <th style={{ padding: "10px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#595959" }}>
                        Panel
                      </th>
                      <th style={{ padding: "10px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#595959" }}>
                        Municipio
                      </th>
                      <th style={{ padding: "10px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#595959" }}>
                        Importe
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.eventosDestacados.map((evento, index) => (
                      <tr
                        key={index}
                        style={{
                          borderTop: index > 0 ? "1px solid #F0F0F0" : "none",
                        }}
                      >
                        <td style={{ padding: "10px", fontSize: "12px", color: "#595959" }}>
                          {formatDate(evento.fecha)}
                        </td>
                        <td style={{ padding: "10px", fontSize: "12px", color: "#262626" }}>
                          {getEventLabel(evento.tipo)}
                        </td>
                        <td style={{ padding: "10px", fontSize: "12px", color: "#262626", fontFamily: "monospace" }}>
                          {evento.panel}
                        </td>
                        <td style={{ padding: "10px", fontSize: "12px", color: "#595959" }}>
                          {evento.municipio}
                        </td>
                        <td style={{ padding: "10px", textAlign: "right", fontSize: "12px", color: evento.importe !== 0 ? "#1890FF" : "#8C8C8C" }}>
                          {evento.importe !== 0 ? formatEuros(evento.importe) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #F0F0F0",
            backgroundColor: "#FAFAFA",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: "#8C8C8C" }}>
            Generado: {new Date(report.generatedAt).toLocaleString("es-ES")}
          </span>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={downloadExcel}
              disabled={isDownloading}
              style={{
                padding: "8px 24px",
                fontSize: "14px",
                color: "#FFF",
                backgroundColor: isDownloading ? "#8C8C8C" : "#52C41A",
                border: "none",
                borderRadius: "4px",
                cursor: isDownloading ? "not-allowed" : "pointer",
                fontWeight: 500,
                opacity: isDownloading ? 0.6 : 1,
              }}
            >
              {isDownloading ? "Generando..." : "Descargar Excel"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "8px 24px",
                fontSize: "14px",
                color: "#FFF",
                backgroundColor: "#1890FF",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
