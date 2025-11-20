# Modal de Confirmación: Actualización de Tarifa Anual

## 📋 Respuesta del Backend (updateYearlyRate)

```typescript
interface UpdateYearlyRateResponse {
  success: boolean;
  message: string;
  year: string;
  amount: number;
  updatedAt: string;
  updatedBy: string;
  propagation: {
    panelsUpdated: number;        // Ej: 245
    monthsAffected: string[];     // Ej: ["2025-11", "2025-12"]
    monthsSkipped: string[];      // Ej: ["2025-10"]
    skippedReason: "locked" | "none";
  };
}
```

## 🎨 Implementación del Modal (Frontend)

### Paso 1: Llamar a la Cloud Function

```typescript
// src/lib/api.ts
export async function updateYearlyRate(year: string, amount: number) {
  const updateYearlyRateFunc = httpsCallable<
    { year: string; amount: number },
    UpdateYearlyRateResponse
  >(functions, "updateYearlyRate");

  const result = await updateYearlyRateFunc({ year, amount });
  return result.data;
}
```

### Paso 2: Mostrar Modal con Resultados

```tsx
// src/components/UpdateRateResultModal.tsx
import React from "react";

interface UpdateRateResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: UpdateYearlyRateResponse;
}

export default function UpdateRateResultModal({
  isOpen,
  onClose,
  result,
}: UpdateRateResultModalProps) {
  if (!isOpen) return null;

  const { propagation, year, amount } = result;
  const hasSkipped = propagation.monthsSkipped.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            ✅
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Tarifa Actualizada
            </h2>
            <p className="text-sm text-gray-600">
              {year}: {amount.toFixed(2)}€
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">
              Paneles Actualizados:
            </span>
            <span className="text-2xl font-bold text-green-600">
              {propagation.panelsUpdated}
            </span>
          </div>

          {/* Meses Afectados */}
          {propagation.monthsAffected.length > 0 && (
            <div>
              <span className="text-gray-700 font-medium block mb-2">
                Meses Actualizados:
              </span>
              <div className="flex flex-wrap gap-2">
                {propagation.monthsAffected.map((month) => (
                  <span
                    key={month}
                    className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium"
                  >
                    {month}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Meses Omitidos (Cerrados) */}
          {hasSkipped && (
            <div className="border-t border-gray-200 pt-3 mt-3">
              <div className="flex items-start gap-2">
                <span className="text-2xl">🔒</span>
                <div>
                  <span className="text-gray-700 font-medium block mb-2">
                    Meses Cerrados (No Modificados):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {propagation.monthsSkipped.map((month) => (
                      <span
                        key={month}
                        className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium"
                      >
                        {month}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Los meses cerrados no se modifican para preservar la
                    integridad histórica de las facturas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        <p className="text-sm text-gray-600 mb-4">{result.message}</p>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Paso 3: Integrar en el Flujo de Actualización

```tsx
// src/components/AdminSection.tsx (ejemplo)
import { useState } from "react";
import { updateYearlyRate } from "@/lib/api";
import UpdateRateResultModal from "./UpdateRateResultModal";

export default function AdminSection() {
  const [showResultModal, setShowResultModal] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateYearlyRateResponse | null>(null);

  const handleUpdateRate = async (year: string, amount: number) => {
    try {
      const result = await updateYearlyRate(year, amount);
      setUpdateResult(result);
      setShowResultModal(true);
    } catch (error) {
      console.error("Error al actualizar tarifa:", error);
      alert("Error al actualizar la tarifa");
    }
  };

  return (
    <div>
      {/* Tu formulario de actualización de tarifas */}
      {/* ... */}

      {/* Modal de Resultados */}
      {updateResult && (
        <UpdateRateResultModal
          isOpen={showResultModal}
          onClose={() => setShowResultModal(false)}
          result={updateResult}
        />
      )}
    </div>
  );
}
```

## 🎯 Ejemplo de Resultados

### Escenario 1: Actualización en Noviembre (meses futuros)
```json
{
  "success": true,
  "message": "Tarifa 2025 actualizada y propagada a 456 paneles en 2 mes(es)",
  "year": "2025",
  "amount": 235.00,
  "propagation": {
    "panelsUpdated": 456,
    "monthsAffected": ["2025-11", "2025-12"],
    "monthsSkipped": [],
    "skippedReason": "none"
  }
}
```

### Escenario 2: Actualización con meses cerrados
```json
{
  "success": true,
  "message": "Tarifa 2025 actualizada y propagada a 234 paneles en 2 mes(es). 2 mes(es) cerrado(s) omitido(s)",
  "year": "2025",
  "amount": 235.00,
  "propagation": {
    "panelsUpdated": 234,
    "monthsAffected": ["2025-11", "2025-12"],
    "monthsSkipped": ["2025-09", "2025-10"],
    "skippedReason": "locked"
  }
}
```

### Escenario 3: Año futuro sin paneles creados
```json
{
  "success": true,
  "message": "Tarifa 2026 guardada correctamente",
  "year": "2026",
  "amount": 250.00,
  "propagation": {
    "panelsUpdated": 0,
    "monthsAffected": [],
    "monthsSkipped": [],
    "skippedReason": "none"
  }
}
```

## 📊 Vista Visual del Modal

```
┌─────────────────────────────────────────────────┐
│ ✅  Tarifa Actualizada                          │
│     2025: 235.00€                               │
├─────────────────────────────────────────────────┤
│                                                 │
│ ╔═══════════════════════════════════════════╗  │
│ ║ Paneles Actualizados:            456      ║  │
│ ║                                           ║  │
│ ║ Meses Actualizados:                       ║  │
│ ║ [2025-11] [2025-12]                       ║  │
│ ║                                           ║  │
│ ║ ─────────────────────────────────────────  ║  │
│ ║                                           ║  │
│ ║ 🔒 Meses Cerrados (No Modificados):       ║  │
│ ║    [2025-09] [2025-10]                    ║  │
│ ║                                           ║  │
│ ║    Los meses cerrados no se modifican     ║  │
│ ║    para preservar la integridad           ║  │
│ ║    histórica de las facturas.             ║  │
│ ╚═══════════════════════════════════════════╝  │
│                                                 │
│ Tarifa 2025 actualizada y propagada a 456      │
│ paneles en 2 mes(es). 2 mes(es) cerrado(s)     │
│ omitido(s)                                      │
│                                                 │
│                          [Entendido]            │
└─────────────────────────────────────────────────┘
```

## 🔒 Lógica de Protección Implementada

### Backend (updateYearlyRate.ts):
1. ✅ **Rango Inteligente**: Busca desde mes actual hasta fin del año
2. ✅ **Verificación de Cierre**: Consulta `billingSummary.isLocked`
3. ✅ **Omisión Segura**: Salta meses cerrados sin modificarlos
4. ✅ **Batch Seguro**: Procesa hasta 500 paneles por lote (evita timeouts)
5. ✅ **Normalización Decimal**: `Math.round(x * 100) / 100` para datos limpios
6. ✅ **Auditoría Completa**: Logs detallados de qué se actualizó y qué se omitió

### Frontend (Modal):
1. ✅ **Feedback Visual**: Muestra meses actualizados vs. omitidos
2. ✅ **Explicación Clara**: Informa por qué se omitieron meses cerrados
3. ✅ **Estados Diferenciados**: Verde (actualizados), Amarillo (cerrados)
4. ✅ **Información Cuantitativa**: Número exacto de paneles afectados

## 🚀 Ventajas de esta Solución

- ✅ **Integridad Histórica**: No reescribe facturas cerradas
- ✅ **Cumplimiento Fiscal**: Respeta auditoría de facturas emitidas
- ✅ **Transparencia**: Usuario sabe exactamente qué se actualizó
- ✅ **Flexibilidad**: Funciona con años pasados, actuales y futuros
- ✅ **Performance**: Optimizado con batch processing
- ✅ **Precisión Contable**: Cálculos con céntimos + normalización final
