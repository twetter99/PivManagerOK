/**
 * PanelActionsMenu Component
 * Menú de acciones para cada panel: editar tarifa, dar de baja
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { requestPanelChange } from "@/lib/api";

interface PanelActionsMenuProps {
  panelId: string;
  monthKey: string;
  codigo: string;
  municipio: string;
  tarifaActual: number;
  onSuccess?: () => void;
}

export default function PanelActionsMenu({
  panelId,
  monthKey,
  codigo,
  municipio,
  tarifaActual,
  onSuccess,
}: PanelActionsMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [showDesmontadoModal, setShowDesmontadoModal] = useState(false);
  const [showReinstalacionModal, setShowReinstalacionModal] = useState(false);
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [fechaBaja, setFechaBaja] = useState("");
  const [fechaDesmontado, setFechaDesmontado] = useState("");
  const [fechaReinstalacion, setFechaReinstalacion] = useState("");
  const [fechaAjuste, setFechaAjuste] = useState("");
  const [importeAjuste, setImporteAjuste] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showMenu]);

  const handleDarDeBaja = async () => {
    if (!fechaBaja) {
      setError("Selecciona una fecha de baja");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requestPanelChange({
        panelId,
        monthKey,
        action: "BAJA",
        effectiveDateLocal: fechaBaja,
        diasFacturables: 0,
        importeAFacturar: 0,
        snapshotBefore: {},
        snapshotAfter: {},
      });

      setShowBajaModal(false);
      setShowMenu(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Error al dar de baja");
    } finally {
      setLoading(false);
    }
  };

  const handleDesmontado = async () => {
    if (!fechaDesmontado) {
      setError("Selecciona una fecha de desmontaje");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requestPanelChange({
        panelId,
        monthKey,
        action: "DESMONTADO",
        effectiveDateLocal: fechaDesmontado,
        diasFacturables: 0,
        importeAFacturar: 0,
        snapshotBefore: {},
        snapshotAfter: {},
      });

      setShowDesmontadoModal(false);
      setShowMenu(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Error al desmontar");
    } finally {
      setLoading(false);
    }
  };

  const handleReinstalacion = async () => {
    if (!fechaReinstalacion) {
      setError("Selecciona una fecha de reinstalación");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requestPanelChange({
        panelId,
        monthKey,
        action: "REINSTALACION",
        effectiveDateLocal: fechaReinstalacion,
        diasFacturables: 0,
        importeAFacturar: 0,
        snapshotBefore: {},
        snapshotAfter: {},
      });

      setShowReinstalacionModal(false);
      setShowMenu(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Error al reinstalar");
    } finally {
      setLoading(false);
    }
  };

  const handleAjusteManual = async () => {
    if (!fechaAjuste || !importeAjuste || parseFloat(importeAjuste) < 0) {
      setError("Ingresa una fecha y un importe válido");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requestPanelChange({
        panelId,
        monthKey,
        action: "AJUSTE_MANUAL",
        effectiveDateLocal: fechaAjuste,
        diasFacturables: 0,
        importeAFacturar: parseFloat(importeAjuste),
        snapshotBefore: {},
        snapshotAfter: { importeAjuste: parseFloat(importeAjuste) },
      });

      setShowAjusteModal(false);
      setShowMenu(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Error al aplicar ajuste");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      {/* Botón de acciones */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          padding: "4px 8px",
          fontSize: "12px",
          color: "#595959",
          backgroundColor: "transparent",
          border: "1px solid #D9D9D9",
          borderRadius: "2px",
          cursor: "pointer",
        }}
      >
        ⋯
      </button>

      {/* Menú desplegable */}
      {showMenu && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "4px",
            backgroundColor: "#FFF",
            border: "1px solid #EAEAEA",
            borderRadius: "2px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            zIndex: 9999,
            minWidth: "150px",
          }}
        >
          <button
            onClick={() => {
              setShowDesmontadoModal(true);
              setShowMenu(false);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#000",
              backgroundColor: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F7F7F7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Desmontar panel
          </button>
          <button
            onClick={() => {
              setShowReinstalacionModal(true);
              setShowMenu(false);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#000",
              backgroundColor: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F7F7F7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Reinstalar panel
          </button>
          <button
            onClick={() => {
              setShowAjusteModal(true);
              setShowMenu(false);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#000",
              backgroundColor: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F7F7F7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Ajuste manual
          </button>
          <button
            onClick={() => {
              setShowBajaModal(true);
              setShowMenu(false);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#D32F2F",
              backgroundColor: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FFE5E5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Dar de baja
          </button>
        </div>
      )}

      {/* Modal: Desmontar Panel */}
      {showDesmontadoModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowDesmontadoModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "24px",
              borderRadius: "4px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
              Desmontar Panel
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#595959" }}>
              Panel: {codigo} - {municipio}
            </p>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
              Fecha de Desmontaje
            </label>
            <input
              type="date"
              value={fechaDesmontado}
              onChange={(e) => setFechaDesmontado(e.target.value)}
              max={`${monthKey}-31`}
              min={`${monthKey}-01`}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                marginBottom: "16px",
              }}
            />
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDesmontadoModal(false)}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#595959",
                  backgroundColor: "transparent",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDesmontado}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#FFF",
                  backgroundColor: loading ? "#ccc" : "#FF9800",
                  border: "none",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Procesando..." : "Desmontar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reinstalar Panel */}
      {showReinstalacionModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowReinstalacionModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "24px",
              borderRadius: "4px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
              Reinstalar Panel
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#595959" }}>
              Panel: {codigo} - {municipio}
            </p>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
              Fecha de Reinstalación
            </label>
            <input
              type="date"
              value={fechaReinstalacion}
              onChange={(e) => setFechaReinstalacion(e.target.value)}
              max={`${monthKey}-31`}
              min={`${monthKey}-01`}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                marginBottom: "16px",
              }}
            />
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowReinstalacionModal(false)}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#595959",
                  backgroundColor: "transparent",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleReinstalacion}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#FFF",
                  backgroundColor: loading ? "#ccc" : "#4CAF50",
                  border: "none",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Procesando..." : "Reinstalar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ajuste Manual */}
      {showAjusteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowAjusteModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "24px",
              borderRadius: "4px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
              Ajuste Manual
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#595959" }}>
              Panel: {codigo} - {municipio}
            </p>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
              Fecha del Ajuste
            </label>
            <input
              type="date"
              value={fechaAjuste}
              onChange={(e) => setFechaAjuste(e.target.value)}
              max={`${monthKey}-31`}
              min={`${monthKey}-01`}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                marginBottom: "16px",
              }}
            />
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
              Importe del Ajuste (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={importeAjuste}
              onChange={(e) => setImporteAjuste(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                marginBottom: "16px",
              }}
            />
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAjusteModal(false)}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#595959",
                  backgroundColor: "transparent",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAjusteManual}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#FFF",
                  backgroundColor: loading ? "#ccc" : "#2196F3",
                  border: "none",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Guardando..." : "Aplicar Ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dar de Baja */}
      {showBajaModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowBajaModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "24px",
              borderRadius: "4px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
              Dar de Baja Panel
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#595959" }}>
              Panel: {codigo} - {municipio}
            </p>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
              Fecha de Baja
            </label>
            <input
              type="date"
              value={fechaBaja}
              onChange={(e) => setFechaBaja(e.target.value)}
              max={`${monthKey}-31`}
              min={`${monthKey}-01`}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #D9D9D9",
                borderRadius: "2px",
                marginBottom: "16px",
              }}
            />
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowBajaModal(false)}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#595959",
                  backgroundColor: "transparent",
                  border: "1px solid #D9D9D9",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDarDeBaja}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#FFF",
                  backgroundColor: loading ? "#ccc" : "#D32F2F",
                  border: "none",
                  borderRadius: "2px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Procesando..." : "Dar de Baja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
