/**
 * YearlyRatesManager Component
 * Gestión de tarifas anuales desde Firestore
 * Permite editar tarifas de años futuros
 */

"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

interface Rate {
  year: string;
  importe: number;
  updatedAt?: string;
  updatedBy?: string;
}

export default function YearlyRatesManager() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingYear, setEditingYear] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Estados para creación de nuevo año
  const [isCreating, setIsCreating] = useState(false);
  const [newYear, setNewYear] = useState<string>("");
  const [newAmount, setNewAmount] = useState<string>("");

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    loadRates();
  }, []);

  const loadRates = async () => {
    setLoading(true);
    try {
      const ratesRef = collection(db, "rates");
      const q = query(ratesRef, orderBy("year", "asc"));
      const snapshot = await getDocs(q);

      const loadedRates: Rate[] = snapshot.docs.map((doc) => ({
        year: doc.id,
        ...(doc.data() as Omit<Rate, "year">),
      }));

      setRates(loadedRates);
    } catch (err: any) {
      console.error("Error cargando tarifas:", err);
      setError("Error al cargar tarifas");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rate: Rate) => {
    setEditingYear(rate.year);
    setEditAmount(rate.importe.toString());
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditingYear(null);
    setEditAmount("");
    setError(null);
    setSuccess(null);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setNewYear("");
    setNewAmount("");
    setError(null);
    setSuccess(null);
    setEditingYear(null); // Cancelar edición si está activa
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewYear("");
    setNewAmount("");
    setError(null);
    setSuccess(null);
  };

  const handleCreateSave = async () => {
    // Validaciones
    if (!newYear || !/^\d{4}$/.test(newYear)) {
      setError("El año debe ser un valor de 4 dígitos (ej: 2027)");
      return;
    }

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("El importe debe ser un número positivo");
      return;
    }

    // Verificar que el año no exista ya
    if (rates.some((r) => r.year === newYear)) {
      setError(`El año ${newYear} ya existe. Usa el botón Editar para modificarlo.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updateRateFn = httpsCallable<
        { year: string; amount: number },
        { success: boolean; message: string }
      >(functions, "updateYearlyRate");

      const result = await updateRateFn({ year: newYear, amount });

      if (result.data.success) {
        setSuccess(`Tarifa ${newYear} creada con ${amount.toFixed(2)}€`);
        await loadRates();
        setIsCreating(false);
        setNewYear("");
        setNewAmount("");

        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error("Error creando tarifa:", err);
      setError(err.message || "Error al crear tarifa");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (year: string) => {
    const amount = parseFloat(editAmount);

    if (isNaN(amount) || amount <= 0) {
      setError("El importe debe ser un número positivo");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updateRateFn = httpsCallable<
        { year: string; amount: number },
        { success: boolean; message: string }
      >(functions, "updateYearlyRate");

      const result = await updateRateFn({ year, amount });

      if (result.data.success) {
        setSuccess(`Tarifa ${year} actualizada a ${amount}€`);
        await loadRates();
        setEditingYear(null);
        setEditAmount("");

        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error("Error actualizando tarifa:", err);
      setError(err.message || "Error al actualizar tarifa");
    } finally {
      setSaving(false);
    }
  };

  const getRowStyle = (year: string): React.CSSProperties => {
    const yearNum = parseInt(year);
    if (yearNum < currentYear) {
      // Año pasado
      return {
        backgroundColor: "#F5F5F5",
        color: "#A3A3A3",
      };
    } else if (yearNum === currentYear) {
      // Año actual
      return {
        backgroundColor: "#E6F7FF",
        fontWeight: 600,
      };
    } else {
      // Año futuro
      return {
        backgroundColor: "#FFF",
      };
    }
  };

  const canEdit = (year: string): boolean => {
    const yearNum = parseInt(year);
    return yearNum >= currentYear;
  };

  if (loading) {
    return (
      <div style={{ padding: "16px", fontSize: "14px", color: "#595959" }}>
        Cargando tarifas...
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#000",
            margin: 0,
          }}
        >
          💰 Tarifas Anuales
        </h3>

        {!isCreating && (
          <button
            onClick={handleStartCreate}
            disabled={saving || editingYear !== null}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#FFF",
              backgroundColor: saving || editingYear ? "#CCC" : "#52C41A",
              border: "none",
              borderRadius: "2px",
              cursor: saving || editingYear ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span style={{ fontSize: "14px" }}>+</span>
            <span>Añadir Año</span>
          </button>
        )}
      </div>

      <p
        style={{
          fontSize: "13px",
          color: "#595959",
          marginBottom: "16px",
          lineHeight: "1.6",
        }}
      >
        Gestiona las tarifas estándar por año. Los paneles nuevos usarán estas
        tarifas. Los paneles existentes heredan su tarifa del mes anterior
        (respetando precios personalizados).
      </p>

      {error && (
        <div
          style={{
            padding: "12px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#CF1322",
            backgroundColor: "#FFF1F0",
            border: "1px solid #FFCCC7",
            borderRadius: "2px",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "12px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#52C41A",
            backgroundColor: "#F6FFED",
            border: "1px solid #B7EB8F",
            borderRadius: "2px",
          }}
        >
          ✓ {success}
        </div>
      )}

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: "#FAFAFA",
              borderBottom: "2px solid #EAEAEA",
            }}
          >
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                fontWeight: 600,
                color: "#000",
              }}
            >
              Año
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "right",
                fontWeight: 600,
                color: "#000",
              }}
            >
              Tarifa (€)
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                fontWeight: 600,
                color: "#000",
              }}
            >
              Estado
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "center",
                fontWeight: 600,
                color: "#000",
              }}
            >
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Fila de creación */}
          {isCreating && (
            <tr
              style={{
                backgroundColor: "#F6FFED",
                borderBottom: "2px solid #52C41A",
              }}
            >
              <td style={{ padding: "12px" }}>
                <input
                  type="text"
                  placeholder="Ej: 2027"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  disabled={saving}
                  maxLength={4}
                  style={{
                    width: "80px",
                    padding: "6px 8px",
                    fontSize: "13px",
                    border: "1px solid #52C41A",
                    borderRadius: "2px",
                  }}
                  autoFocus
                />
              </td>
              <td style={{ padding: "12px", textAlign: "right" }}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej: 39.50"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  disabled={saving}
                  style={{
                    width: "100px",
                    padding: "6px 8px",
                    fontSize: "13px",
                    border: "1px solid #52C41A",
                    borderRadius: "2px",
                    textAlign: "right",
                  }}
                />
              </td>
              <td style={{ padding: "12px", fontSize: "12px", color: "#52C41A", fontWeight: 500 }}>
                🆕 Nuevo
              </td>
              <td style={{ padding: "12px", textAlign: "center" }}>
                <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                  <button
                    onClick={handleCreateSave}
                    disabled={saving}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#FFF",
                      backgroundColor: saving ? "#CCC" : "#52C41A",
                      border: "none",
                      borderRadius: "2px",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? "..." : "Crear"}
                  </button>
                  <button
                    onClick={handleCancelCreate}
                    disabled={saving}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#595959",
                      backgroundColor: "#FFF",
                      border: "1px solid #D9D9D9",
                      borderRadius: "2px",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </td>
            </tr>
          )}

          {/* Filas de tarifas existentes */}
          {rates.map((rate) => {
            const yearNum = parseInt(rate.year);
            const isEditing = editingYear === rate.year;
            const editable = canEdit(rate.year);

            let status = "";
            if (yearNum < currentYear) status = "🔒 Cerrado";
            else if (yearNum === currentYear) status = "📍 Actual";
            else status = "📅 Futuro";

            return (
              <tr
                key={rate.year}
                style={{
                  ...getRowStyle(rate.year),
                  borderBottom: "1px solid #EAEAEA",
                }}
              >
                <td style={{ padding: "12px" }}>{rate.year}</td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      disabled={saving}
                      style={{
                        width: "100px",
                        padding: "6px 8px",
                        fontSize: "13px",
                        border: "1px solid #D9D9D9",
                        borderRadius: "2px",
                        textAlign: "right",
                      }}
                      autoFocus
                    />
                  ) : (
                    `${rate.importe.toFixed(2)}€`
                  )}
                </td>
                <td style={{ padding: "12px", fontSize: "12px" }}>
                  {status}
                </td>
                <td
                  style={{
                    padding: "12px",
                    textAlign: "center",
                  }}
                >
                  {isEditing ? (
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                      <button
                        onClick={() => handleSave(rate.year)}
                        disabled={saving}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#FFF",
                          backgroundColor: saving ? "#CCC" : "#52C41A",
                          border: "none",
                          borderRadius: "2px",
                          cursor: saving ? "not-allowed" : "pointer",
                        }}
                      >
                        {saving ? "..." : "Guardar"}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={saving}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#595959",
                          backgroundColor: "#FFF",
                          border: "1px solid #D9D9D9",
                          borderRadius: "2px",
                          cursor: saving ? "not-allowed" : "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : editable ? (
                    <button
                      onClick={() => handleEdit(rate)}
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "#1890FF",
                        backgroundColor: "#FFF",
                        border: "1px solid #1890FF",
                        borderRadius: "2px",
                        cursor: "pointer",
                      }}
                    >
                      Editar
                    </button>
                  ) : (
                    <span style={{ fontSize: "11px", color: "#A3A3A3" }}>
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          marginTop: "16px",
          padding: "12px",
          fontSize: "11px",
          color: "#8C8C8C",
          backgroundColor: "#FAFAFA",
          border: "1px solid #EAEAEA",
          borderRadius: "2px",
        }}
      >
        <strong>ℹ️ Notas:</strong>
        <ul style={{ marginTop: "8px", marginLeft: "20px", lineHeight: "1.6" }}>
          <li>Los años pasados no se pueden editar (histórico cerrado)</li>
          <li>
            Los paneles heredan su tarifa del mes anterior (respetando precios
            personalizados)
          </li>
          <li>
            Para cambiar la tarifa de un panel específico, usa la acción
            "Cambio de Tarifa" desde el dashboard
          </li>
        </ul>
      </div>
    </div>
  );
}
