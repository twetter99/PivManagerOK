/**
 * PanelActionsMenu Component
 * Menú de acciones mejorado para cada panel con diseño profesional y UX optimizada
 * 
 * MEJORAS IMPLEMENTADAS:
 * - Iconos de Lucide React para mejor identificación visual
 * - Agrupación de acciones normales vs críticas
 * - Confirmación en 2 pasos para "Dar de baja"
 * - Animaciones sutiles en apertura y hover
 * - Mayor espaciado y padding para mejor usabilidad
 * - Estilos diferenciados para acciones peligrosas
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { requestPanelChange, deleteAllPanelEvents, waitForBillingUpdate, deletePanel } from "@/lib/api";
import { 
  Calendar, 
  Package, 
  RotateCcw, 
  DollarSign, 
  AlertTriangle, 
  Trash2,
  MoreVertical,
  Wrench
} from "lucide-react";
import IntervencionModal from "./IntervencionModal";

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
  const [showBajaConfirmModal, setShowBajaConfirmModal] = useState(false); // NUEVO: confirmación paso 1
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [showDesmontadoModal, setShowDesmontadoModal] = useState(false);
  const [showReinstalacionModal, setShowReinstalacionModal] = useState(false);
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [showIntervencionModal, setShowIntervencionModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showDeletePanelConfirmModal, setShowDeletePanelConfirmModal] = useState(false); // NUEVO: confirmación paso 1
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
      {/* Botón de acciones mejorado con icono */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          padding: "6px 10px",
          fontSize: "12px",
          color: "#595959",
          backgroundColor: "transparent",
          border: "1px solid #D9D9D9",
          borderRadius: "4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#F5F5F5";
          e.currentTarget.style.borderColor = "#BFBFBF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.borderColor = "#D9D9D9";
        }}
      >
        <MoreVertical size={14} />
      </button>

      {/* Menú desplegable mejorado con animación */}
      {showMenu && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "4px",
            backgroundColor: "#FFF",
            border: "1px solid #E0E0E0",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            minWidth: "260px",
            animation: "slideDown 0.2s ease-out",
          }}
        >
          <style>{`
            @keyframes slideDown {
              from {
                opacity: 0;
                transform: translateY(-8px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
          {/* Sección: Acciones normales */}
          <div style={{ padding: "8px 0" }}>
            <button
              onClick={() => {
                setShowDeleteAllModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#262626",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Calendar size={16} style={{ flexShrink: 0 }} />
              <span>Eliminar eventos del mes</span>
            </button>
            <button
              onClick={() => {
                setShowDesmontadoModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#262626",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Package size={16} style={{ flexShrink: 0 }} />
              <span>Desmontar panel</span>
            </button>
            <button
              onClick={() => {
                setShowReinstalacionModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#262626",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <RotateCcw size={16} style={{ flexShrink: 0 }} />
              <span>Reinstalar panel</span>
            </button>
            <button
              onClick={() => {
                setShowAjusteModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#262626",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <DollarSign size={16} style={{ flexShrink: 0 }} />
              <span>Ajuste manual</span>
            </button>
            <button
              onClick={() => {
                setShowIntervencionModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#262626",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Wrench size={16} style={{ flexShrink: 0 }} />
              <span>Registrar intervención</span>
            </button>
          </div>

          {/* Divisor y título de acciones críticas */}
          <div style={{ 
            borderTop: "2px solid #E0E0E0", 
            margin: "8px 0",
            padding: "8px 16px 4px",
          }}>
            <div style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "#8C8C8C",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              ⚠️ Acciones Críticas
            </div>
          </div>

          {/* Sección: Acciones críticas */}
          <div style={{ padding: "4px 0 8px" }}>
            <button
              onClick={() => {
                setShowBajaConfirmModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#C62828",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
                fontWeight: "500",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#FFEBEE";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>Dar de baja</span>
            </button>
            <button
              onClick={() => {
                setShowDeletePanelConfirmModal(true);
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "14px",
                color: "#C62828",
                backgroundColor: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s ease",
                fontWeight: "600",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#FFEBEE";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Trash2 size={16} style={{ flexShrink: 0 }} />
              <span>Eliminar panel completo</span>
            </button>
          </div>
        </div>
      )}

      {/* NUEVO: Modal de confirmación para "Dar de baja" (Paso 1) */}
      {showBajaConfirmModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setShowBajaConfirmModal(false)}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "28px",
              borderRadius: "8px",
              maxWidth: "440px",
              width: "90%",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
              <div style={{ 
                backgroundColor: "#FFF3E0", 
                borderRadius: "50%", 
                padding: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <AlertTriangle size={24} color="#F57C00" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 600, color: "#262626" }}>
                  ¿Dar de baja este panel?
                </h3>
                <p style={{ margin: "0", fontSize: "14px", color: "#595959", lineHeight: "1.5" }}>
                  Esta acción marcará el panel como <strong>BAJA</strong> permanentemente a partir de la fecha que selecciones.
                </p>
              </div>
            </div>
            
            <div style={{
              backgroundColor: "#FAFAFA",
              border: "1px solid #E8E8E8",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "24px",
            }}>
              <div style={{ fontSize: "13px", color: "#8C8C8C", marginBottom: "4px" }}>Panel:</div>
              <div style={{ fontSize: "15px", fontWeight: 500, color: "#262626" }}>
                {codigo} - {municipio}
              </div>
            </div>

            {error && (
              <div style={{
                backgroundColor: "#FFF1F0",
                border: "1px solid #FFCCC7",
                borderRadius: "4px",
                padding: "12px",
                marginBottom: "16px",
                color: "#CF1322",
                fontSize: "13px",
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setError(null);
                  setShowBajaConfirmModal(false);
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#595959",
                  backgroundColor: "#FFF",
                  border: "1px solid #D9D9D9",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#FAFAFA";
                    e.currentTarget.style.borderColor = "#BFBFBF";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#FFF";
                    e.currentTarget.style.borderColor = "#D9D9D9";
                  }
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowBajaConfirmModal(false);
                  setShowBajaModal(true);
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#FFF",
                  backgroundColor: "#D32F2F",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#B71C1C";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#D32F2F";
                  }
                }}
              >
                <AlertTriangle size={16} />
                <span>Continuar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NUEVO: Modal de confirmación para "Eliminar panel completo" (Paso 1) */}
      {showDeletePanelConfirmModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setShowDeletePanelConfirmModal(false)}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "28px",
              borderRadius: "8px",
              maxWidth: "440px",
              width: "90%",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
              <div style={{ 
                backgroundColor: "#FFEBEE", 
                borderRadius: "50%", 
                padding: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Trash2 size={24} color="#D32F2F" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 600, color: "#262626" }}>
                  ¿Eliminar panel completo?
                </h3>
                <p style={{ margin: "0", fontSize: "14px", color: "#595959", lineHeight: "1.5" }}>
                  Esta acción es <strong>irreversible</strong>. Se eliminarán permanentemente:
                </p>
              </div>
            </div>
            
            <ul style={{ 
              margin: "0 0 20px 0", 
              padding: "0 0 0 20px",
              fontSize: "14px", 
              color: "#595959",
              lineHeight: "1.8",
            }}>
              <li>El panel y todos sus datos</li>
              <li>Todos los eventos históricos</li>
              <li>Todos los documentos de facturación</li>
            </ul>

            <div style={{
              backgroundColor: "#FFF9E6",
              border: "1px solid #FFE58F",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "24px",
            }}>
              <div style={{ fontSize: "13px", color: "#8C8C8C", marginBottom: "4px" }}>Panel a eliminar:</div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#C62828" }}>
                {codigo} - {municipio}
              </div>
            </div>

            {error && (
              <div style={{
                backgroundColor: "#FFF1F0",
                border: "1px solid #FFCCC7",
                borderRadius: "4px",
                padding: "12px",
                marginBottom: "16px",
                color: "#CF1322",
                fontSize: "13px",
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setError(null);
                  setShowDeletePanelConfirmModal(false);
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#595959",
                  backgroundColor: "#FFF",
                  border: "1px solid #D9D9D9",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#FAFAFA";
                    e.currentTarget.style.borderColor = "#BFBFBF";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#FFF";
                    e.currentTarget.style.borderColor = "#D9D9D9";
                  }
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowDeletePanelConfirmModal(false);
                  setShowDeletePanelModal(true);
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#FFF",
                  backgroundColor: "#D32F2F",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#B71C1C";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#D32F2F";
                  }
                }}
              >
                <Trash2 size={16} />
                <span>Continuar</span>
              </button>
            </div>
          </div>
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

      {/* Modal: Intervención */}
      <IntervencionModal
        isOpen={showIntervencionModal}
        onClose={() => setShowIntervencionModal(false)}
        panelId={panelId}
        codigo={codigo}
        municipio={municipio}
        monthKey={monthKey}
        onSuccess={() => {
          setShowIntervencionModal(false);
          onSuccess?.();
        }}
      />
    </div>
  );
}
