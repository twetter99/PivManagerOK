/**
 * PanelActionsMenu Component
 * Menú de acciones para cada panel: editar tarifa, dar de baja
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { requestPanelChange, deleteAllPanelEvents, waitForBillingUpdate, deletePanel } from "@/lib/api";

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
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showDeletePanelModal, setShowDeletePanelModal] = useState(false);
  const [deleteAllResult, setDeleteAllResult] = useState<
    | {
        totalDiasFacturables: number;
        totalImporte: number;
        estadoAlCierre: "ACTIVO" | "DESMONTADO" | "BAJA";
        tarifaAplicada: number;
      }
    | null
  >(null);
  // NUEVOS ESTADOS PARA RESULTADOS DE FACTURACIÓN
  const [billingResultDesmontado, setBillingResultDesmontado] = useState<any>(null);
  const [billingResultReinstalacion, setBillingResultReinstalacion] = useState<any>(null);
  const [billingResultBaja, setBillingResultBaja] = useState<any>(null);
  const [billingResultAjuste, setBillingResultAjuste] = useState<any>(null);
  const [fechaBaja, setFechaBaja] = useState("");
  const [fechaDesmontado, setFechaDesmontado] = useState("");
  const [fechaReinstalacion, setFechaReinstalacion] = useState("");
  const [fechaAjuste, setFechaAjuste] = useState("");
  const [importeAjuste, setImporteAjuste] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionCompleted, setActionCompleted] = useState(false);
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
      const res = await requestPanelChange({
        panelId,
        monthKey,
        action: "BAJA",
        effectiveDateLocal: fechaBaja,
        diasFacturables: 0,
        importeAFacturar: 0,
        snapshotBefore: {},
        snapshotAfter: {},
      });
      if (res?.totals) setBillingResultBaja(res.totals);
      setActionCompleted(true);
      setTimeout(() => { if (onSuccess) onSuccess(); }, 200);
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
      const res = await requestPanelChange({
        panelId,
        monthKey,
        action: "DESMONTADO",
        effectiveDateLocal: fechaDesmontado,
        diasFacturables: 0,
        importeAFacturar: 0,
        snapshotBefore: {},
        snapshotAfter: {},
      });
      if (res?.totals) setBillingResultDesmontado(res.totals);
      setActionCompleted(true);
      setTimeout(() => { if (onSuccess) onSuccess(); }, 200);
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
      const res = await requestPanelChange({
        panelId,
        monthKey,
        action: "REINSTALACION",
        effectiveDateLocal: fechaReinstalacion,
        diasFacturables: 0,
        importeAFacturar: 0,
        snapshotBefore: {},
        snapshotAfter: {},
      });
      if (res?.totals) setBillingResultReinstalacion(res.totals);
      setActionCompleted(true);
      setTimeout(() => { if (onSuccess) onSuccess(); }, 200);
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
      const res = await requestPanelChange({
        panelId,
        monthKey,
        action: "AJUSTE_MANUAL",
        effectiveDateLocal: fechaAjuste,
        diasFacturables: 0,
        importeAFacturar: parseFloat(importeAjuste),
        snapshotBefore: {},
        snapshotAfter: { importeAjuste: parseFloat(importeAjuste) },
      });
      if (res?.totals) setBillingResultAjuste(res.totals);
      setActionCompleted(true);
      setTimeout(() => { if (onSuccess) onSuccess(); }, 200);
    } catch (err: any) {
      setError(err.message || "Error al aplicar ajuste");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await deleteAllPanelEvents({ panelId, monthKey });
      if (res.totals) {
        setDeleteAllResult(res.totals);
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Error al eliminar eventos");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePanel = async () => {
    if (!confirmCode || confirmCode !== codigo) {
      setError(`Debes escribir "${codigo}" para confirmar la eliminación`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await deletePanel({ panelId, confirmCode });
      setActionCompleted(true);
      alert(`✅ ${res.message}\n\nDetalles:\n- Eventos eliminados: ${res.details.eventsDeleted}\n- Documentos de facturación: ${res.details.billingDocsDeleted}\n- Meses afectados: ${res.details.affectedMonths.join(", ")}`);
      setTimeout(() => { if (onSuccess) onSuccess(); }, 500);
    } catch (err: any) {
      setError(err.message || "Error al eliminar panel");
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
              setShowDeleteAllModal(true);
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
            Eliminar eventos del mes
          </button>
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
          <div style={{ borderTop: "1px solid #EAEAEA", margin: "4px 0" }} />
          <button
            onClick={() => {
              setShowDeletePanelModal(true);
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
              fontWeight: "600",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FFE5E5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            🗑️ Eliminar panel completo
          </button>
        </div>
      )}
      {/* Modal: Eliminar todos los eventos del mes */}
      {showDeleteAllModal && (
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
          onClick={() => {
            setDeleteAllResult(null);
            setShowDeleteAllModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "24px",
              borderRadius: "4px",
              maxWidth: "420px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
              Eliminar eventos del mes
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#595959" }}>
              Panel: {codigo} - {municipio}
            </p>
            <p style={{ margin: "0 0 16px 8px", fontSize: "13px", color: "#A8071A" }}>
              Esta acción marcará como eliminados todos los eventos de {monthKey} y recalculará la facturación.
            </p>
            {deleteAllResult && (
              <div
                style={{
                  border: "1px solid #EAEAEA",
                  borderRadius: 4,
                  padding: "12px 12px",
                  marginBottom: 16,
                  background: "#FAFAFA",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Días facturables: <strong>{deleteAllResult.totalDiasFacturables}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Importe: <strong>{deleteAllResult.totalImporte.toFixed(2)} €</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Estado al cierre: <strong>{deleteAllResult.estadoAlCierre}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Tarifa aplicada: <strong>{deleteAllResult.tarifaAplicada.toFixed(2)} €</strong>
                </div>
              </div>
            )}
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteAllModal(false)}
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
              {!deleteAllResult && (
                <button
                  onClick={handleDeleteAllEvents}
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
                  {loading ? "Eliminando..." : "Eliminar eventos"}
                </button>
              )}
              {deleteAllResult && (
                <button
                  onClick={() => {
                    setDeleteAllResult(null);
                    setShowDeleteAllModal(false);
                    setShowMenu(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    color: "#FFF",
                    backgroundColor: "#4CAF50",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                  }}
                >
                  Hecho
                </button>
              )}
            </div>
          </div>
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
            {actionCompleted && !error && (
              <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "#F6FFED", border: "1px solid #B7EB8F", color: "#52C41A", fontSize: "13px", borderRadius: "4px" }}>
                ✓ Panel desmontado correctamente.
              </div>
            )}
            {billingResultDesmontado && (
              <div
                style={{
                  border: "1px solid #EAEAEA",
                  borderRadius: 4,
                  padding: "12px 12px",
                  marginBottom: 16,
                  background: "#FAFAFA",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Días facturables: <strong>{billingResultDesmontado.totalDiasFacturables}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Importe: <strong>{billingResultDesmontado.totalImporte.toFixed(2)} €</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Estado al cierre: <strong>{billingResultDesmontado.estadoAlCierre}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Tarifa aplicada: <strong>{billingResultDesmontado.tarifaAplicada.toFixed(2)} €</strong>
                </div>
              </div>
            )}
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              {!actionCompleted && (
                <>
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
                </>
              )}
              {actionCompleted && (
                <button
                  onClick={() => {
                    setActionCompleted(false);
                    setShowDesmontadoModal(false);
                    setShowMenu(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    color: "#FFF",
                    backgroundColor: "#4CAF50",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                  }}
                >
                  Hecho
                </button>
              )}
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
            {actionCompleted && !error && (
              <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "#F6FFED", border: "1px solid #B7EB8F", color: "#52C41A", fontSize: "13px", borderRadius: "4px" }}>
                ✓ Panel reinstalado correctamente.
              </div>
            )}
            {billingResultReinstalacion && (
              <div
                style={{
                  border: "1px solid #EAEAEA",
                  borderRadius: 4,
                  padding: "12px 12px",
                  marginBottom: 16,
                  background: "#FAFAFA",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Días facturables: <strong>{billingResultReinstalacion.totalDiasFacturables}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Importe: <strong>{billingResultReinstalacion.totalImporte.toFixed(2)} €</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Estado al cierre: <strong>{billingResultReinstalacion.estadoAlCierre}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Tarifa aplicada: <strong>{billingResultReinstalacion.tarifaAplicada.toFixed(2)} €</strong>
                </div>
              </div>
            )}
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              {!actionCompleted && (
                <>
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
                </>
              )}
              {actionCompleted && (
                <button
                  onClick={() => {
                    setActionCompleted(false);
                    setShowReinstalacionModal(false);
                    setShowMenu(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    color: "#FFF",
                    backgroundColor: "#4CAF50",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                  }}
                >
                  Hecho
                </button>
              )}
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
            {actionCompleted && !error && (
              <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "#F6FFED", border: "1px solid #B7EB8F", color: "#52C41A", fontSize: "13px", borderRadius: "4px" }}>
                ✓ Ajuste manual aplicado correctamente.
              </div>
            )}
            {billingResultAjuste && (
              <div
                style={{
                  border: "1px solid #EAEAEA",
                  borderRadius: 4,
                  padding: "12px 12px",
                  marginBottom: 16,
                  background: "#FAFAFA",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Días facturables: <strong>{billingResultAjuste.totalDiasFacturables}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Importe: <strong>{billingResultAjuste.totalImporte.toFixed(2)} €</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Estado al cierre: <strong>{billingResultAjuste.estadoAlCierre}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Tarifa aplicada: <strong>{billingResultAjuste.tarifaAplicada.toFixed(2)} €</strong>
                </div>
              </div>
            )}
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              {!actionCompleted && (
                <>
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
                </>
              )}
              {actionCompleted && (
                <button
                  onClick={() => {
                    setActionCompleted(false);
                    setShowAjusteModal(false);
                    setShowMenu(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    color: "#FFF",
                    backgroundColor: "#4CAF50",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                  }}
                >
                  Hecho
                </button>
              )}
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
            {actionCompleted && !error && (
              <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "#F6FFED", border: "1px solid #B7EB8F", color: "#52C41A", fontSize: "13px", borderRadius: "4px" }}>
                ✓ Panel dado de baja correctamente.
              </div>
            )}
            {billingResultBaja && (
              <div
                style={{
                  border: "1px solid #EAEAEA",
                  borderRadius: 4,
                  padding: "12px 12px",
                  marginBottom: 16,
                  background: "#FAFAFA",
                }}
              >
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Días facturables: <strong>{billingResultBaja.totalDiasFacturables}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Importe: <strong>{billingResultBaja.totalImporte.toFixed(2)} €</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Estado al cierre: <strong>{billingResultBaja.estadoAlCierre}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Tarifa aplicada: <strong>{billingResultBaja.tarifaAplicada.toFixed(2)} €</strong>
                </div>
              </div>
            )}
            {error && (
              <div style={{ padding: "8px", marginBottom: "16px", backgroundColor: "#FFE5E5", color: "#D32F2F", fontSize: "12px", borderRadius: "2px" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              {!actionCompleted && (
                <>
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
                </>
              )}
              {actionCompleted && (
                <button
                  onClick={() => {
                    setActionCompleted(false);
                    setShowBajaModal(false);
                    setShowMenu(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    color: "#FFF",
                    backgroundColor: "#4CAF50",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                  }}
                >
                  Hecho
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Eliminar panel completo */}
      {showDeletePanelModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => {
            if (!loading) {
              setShowDeletePanelModal(false);
              setError(null);
              setConfirmCode("");
              setActionCompleted(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "24px",
              borderRadius: "4px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#D32F2F" }}>
              ⚠️ Eliminar Panel Completo
            </h3>
            {!actionCompleted && (
              <>
                <div style={{ marginBottom: "16px", fontSize: "14px", lineHeight: "1.6" }}>
                  <p style={{ margin: "0 0 12px 0", fontWeight: "600" }}>
                    Esta acción es <strong>IRREVERSIBLE</strong> y eliminará:
                  </p>
                  <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px" }}>
                    <li>El panel <strong>{codigo}</strong> ({municipio})</li>
                    <li>Todos los eventos del panel (subcolección panelEvents)</li>
                    <li>Todos los registros de facturación mensual</li>
                    <li>El candado de unicidad del código</li>
                  </ul>
                  <p style={{ margin: "0 0 12px 0", color: "#D32F2F", fontWeight: "600" }}>
                    ⚠️ Los resúmenes mensuales (billingSummary) se recalcularán automáticamente
                  </p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#666" }}>
                    No se puede eliminar si hay meses bloqueados (isLocked: true)
                  </p>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600" }}>
                    Para confirmar, escribe el código del panel: <span style={{ color: "#D32F2F" }}>{codigo}</span>
                  </label>
                  <input
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    placeholder={`Escribe "${codigo}"`}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "14px",
                      border: "1px solid #D9D9D9",
                      borderRadius: "2px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                {error && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px",
                      backgroundColor: "#FFE5E5",
                      color: "#D32F2F",
                      borderRadius: "2px",
                      fontSize: "13px",
                    }}
                  >
                    {error}
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      setShowDeletePanelModal(false);
                      setError(null);
                      setConfirmCode("");
                    }}
                    disabled={loading}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      color: "#595959",
                      backgroundColor: "#FFF",
                      border: "1px solid #D9D9D9",
                      borderRadius: "2px",
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeletePanel}
                    disabled={loading || !confirmCode}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      color: "#FFF",
                      backgroundColor: loading || !confirmCode ? "#ccc" : "#D32F2F",
                      border: "none",
                      borderRadius: "2px",
                      cursor: loading || !confirmCode ? "not-allowed" : "pointer",
                      fontWeight: "600",
                    }}
                  >
                    {loading ? "Eliminando..." : "🗑️ Eliminar Panel"}
                  </button>
                </div>
              </>
            )}
            {actionCompleted && (
              <button
                onClick={() => {
                  setActionCompleted(false);
                  setShowDeletePanelModal(false);
                  setConfirmCode("");
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  color: "#FFF",
                  backgroundColor: "#4CAF50",
                  border: "none",
                  borderRadius: "2px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                ✅ Panel eliminado correctamente
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
