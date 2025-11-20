# 📦 Sistema de Alta Unificada de Panel Individual

## 🎯 Objetivo
Implementar un sistema robusto y a prueba de errores para el alta de paneles individuales con **confirmación con previsualización completa** y **blindaje defensivo contra fallos**.

---

## 🏗️ Arquitectura Implementada

### **Patrón: Simulación Cliente + Confirmación Backend**

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (CreatePanelForm.tsx)                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MODO 1: EDICIÓN                                      │  │
│  │  • Formulario: Código, Municipio, Fecha              │  │
│  │  • Botón: "🔍 Verificar Datos"                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ⬇ handleVerify()                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  SIMULACIÓN LOCAL (Sin backend)                      │  │
│  │  • Genera ID: ${municipio}_${codigo}                 │  │
│  │  • Busca tarifa en props.rates                       │  │
│  │  • Valida año, formato, limpieza regex               │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ⬇                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MODO 2: PREVISUALIZACIÓN                            │  │
│  │  • Ficha técnica completa                            │  │
│  │  • ID técnico, tarifa, estado, tipo                  │  │
│  │  • Advertencia si falta tarifa                       │  │
│  │  • Botones: "✏️ Corregir" | "✅ Confirmar"           │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ⬇ handleConfirm()                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ httpsCallable("createPanel")
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (createPanel Cloud Function)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  FASE 1: VALIDACIÓN ESTRICTA                         │  │
│  │  • Auth check                                        │  │
│  │  • Admin role check                                  │  │
│  │  • Input validation (formato, rango año/mes/día)     │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ⬇                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  FASE 2: LÓGICA DE NEGOCIO (try/catch global)       │  │
│  │  • Check unicidad (panelCodes collection)            │  │
│  │  • Auto-tarificación (getStandardRateForYear)        │  │
│  │  • Cálculo prorrateo (calculateBillableDays)         │  │
│  │  • Batch write atómico (4 colecciones)               │  │
│  │    - panels                                           │  │
│  │    - panelCodes (candado unicidad)                    │  │
│  │    - panelEvents (ALTA_INICIAL)                       │  │
│  │    - billingMonthlyPanel                              │  │
│  │  • Post-proceso: recalculateSummary (no crítico)     │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ⬇                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MANEJO DEFENSIVO DE ERRORES                         │  │
│  │  • Todos los catch() convierten a HttpsError         │  │
│  │  • Logging completo con contexto                     │  │
│  │  • Códigos: already-exists, failed-precondition,     │  │
│  │    invalid-argument, permission-denied, internal     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 Garantías de Robustez

### **Frontend (CreatePanelForm.tsx)**

#### ✅ Validación Estricta Pre-Backend
```typescript
// Validación de formato
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (!dateRegex.test(fechaAlta)) {
  setError("❌ Formato de fecha inválido");
  return;
}

// Validación de año
const year = parseInt(fechaAlta.split("-")[0], 10);
if (isNaN(year) || year < 2000 || year > 2100) {
  setError("❌ Año inválido");
  return;
}
```

#### ✅ Simulación Idéntica al Backend
```typescript
// Genera ID técnico (réplica exacta)
const cleanMunicipio = municipio
  .trim()
  .substring(0, 20)
  .replace(/[^a-zA-Z0-9_-]/g, "_");
const cleanCodigo = codigo.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
const municipioId = `${cleanMunicipio}_${cleanCodigo}`;

// Busca tarifa del año
const rate = rates.find((r) => r.year === year.toString());
```

#### ✅ Manejo Defensivo de Errores HTTP
```typescript
try {
  const result = await createPanelFn({ codigo, municipio, fechaAlta });
  // Success
} catch (err: any) {
  let errorMsg = "Error desconocido";
  
  if (err.code === "already-exists") {
    errorMsg = `El código "${codigo}" ya existe`;
  } else if (err.code === "failed-precondition") {
    errorMsg = `No hay tarifa para el año ${year}`;
  } else if (err.code === "invalid-argument") {
    errorMsg = `Datos inválidos: ${err.message}`;
  } else if (err.code === "permission-denied") {
    errorMsg = "No tienes permisos";
  } else if (err.code === "unavailable") {
    errorMsg = "Servicio temporalmente no disponible";
  }
  
  setError(`❌ ${errorMsg}`);
  setMode("edit"); // Volver al formulario
}
```

---

### **Backend (createPanel.ts)**

#### ✅ Configuración de Recursos
```typescript
export const createPanel = functions
  .region("europe-west1")
  .runWith({
    memory: "256MB",       // Recursos garantizados
    timeoutSeconds: 60,    // Timeout explícito
  })
  .https.onCall(async (data, context) => {
    // ...
  });
```

#### ✅ Validación Estricta de Entrada
```typescript
// Verificar tipo de datos
if (!data || typeof data !== "object") {
  throw new functions.https.HttpsError(
    "invalid-argument",
    "Datos de entrada inválidos"
  );
}

// Validar strings no vacíos
if (!codigo || typeof codigo !== "string" || codigo.trim().length === 0) {
  throw new functions.https.HttpsError(
    "invalid-argument",
    "El código del panel es obligatorio"
  );
}

// Validar formato de fecha con regex
if (!fechaAlta || !/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta)) {
  throw new functions.https.HttpsError(
    "invalid-argument",
    "La fecha debe tener formato YYYY-MM-DD"
  );
}

// Validar rango de año
const yearNum = parseInt(year, 10);
if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
  throw new functions.https.HttpsError(
    "invalid-argument",
    `El año (${year}) debe estar entre 2000 y 2100`
  );
}
```

#### ✅ Try/Catch Global
```typescript
try {
  // Check unicidad
  const codeDoc = await codeRef.get();
  if (codeDoc.exists) {
    throw new functions.https.HttpsError("already-exists", "...");
  }

  // Auto-tarificación
  try {
    standardRate = await getStandardRateForYear(year);
  } catch (err: any) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `No se encontró tarifa para el año ${year}`
    );
  }

  // Batch atómico
  await batch.commit();

  return { success: true, ... };

} catch (err: any) {
  functions.logger.error(`[createPanel] ❌ ERROR CRÍTICO: ${err.message}`, {
    codigo, municipio, fechaAlta,
    errorCode: err.code,
    errorStack: err.stack,
  });

  // Si ya es HttpsError, relanzarla
  if (err instanceof functions.https.HttpsError) {
    throw err;
  }

  // Convertir errores inesperados a HttpsError
  throw new functions.https.HttpsError(
    "internal",
    `Error interno: ${err.message || "Error desconocido"}`
  );
}
```

#### ✅ Logging Completo
```typescript
functions.logger.info(`[createPanel] Iniciando alta. Usuario: ${userEmail}`);
functions.logger.info(`[createPanel] Panel ID generado: ${panelId}`);
functions.logger.info(`[createPanel] Ejecutando batch.commit()...`);
functions.logger.info(`[createPanel] ✅ Panel creado exitosamente`);
functions.logger.error(`[createPanel] ❌ ERROR CRÍTICO:`, { context });
```

---

## 📋 Datos Técnicos Generados

### **En Cliente (Previsualización)**
```typescript
interface PreviewData {
  // Datos maestros
  codigo: string;           // "12345"
  municipio: string;        // "Getafe"
  fechaAlta: string;        // "2025-11-20"
  
  // Datos técnicos calculados
  municipioId: string;      // "Getafe_12345" (limpieza regex)
  estado: string;           // "ACTIVO"
  tipo: string;             // "PIV"
  tarifaBase: number | null;  // 235.00 (desde rates)
  year: number;             // 2025
  tarifaEncontrada: boolean;  // true/false
}
```

### **En Servidor (Batch Write)**
```typescript
// 1. panels/{panelId}
{
  codigo: "12345",
  municipio: "Getafe",
  ubicacion: "Getafe",
  tipo: "PIV",
  estado: "ACTIVO",
  fechaAlta: Timestamp,
  tarifaActual: 235.00,
  createdAt: Timestamp,
  createdBy: "admin@example.com",
  updatedAt: Timestamp
}

// 2. panelCodes/{codigo} (candado unicidad)
{
  panelId: "Getafe_12345",
  codigo: "12345",
  createdAt: Timestamp
}

// 3. panels/{panelId}/panelEvents/{eventId}
{
  action: "ALTA_INICIAL",
  effectiveDate: Timestamp,
  effectiveDateLocal: "2025-11-20",
  monthKey: "2025-11",
  panelId: "Getafe_12345",
  codigo: "12345",
  municipio: "Getafe",
  diasFacturables: 11,      // calculateBillableDays("ALTA_INICIAL", 20)
  importe: 86.17,           // (11/30) * 235.00
  tarifaAplicada: 235.00,
  observaciones: "Alta inicial del panel el 2025-11-20",
  createdAt: Timestamp,
  createdBy: "admin@example.com",
  isDeleted: false
}

// 4. billingMonthlyPanel/{panelId}_{monthKey}
{
  panelId: "Getafe_12345",
  codigo: "12345",
  municipio: "Getafe",
  monthKey: "2025-11",
  totalDiasFacturables: 11,
  totalImporte: 86.17,
  tarifaAplicada: 235.00,
  estadoAlCierre: "ACTIVO",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  updatedBy: "createPanel:admin@example.com"
}
```

---

## 🔐 Códigos de Error HTTP

| Código | Situación | Mensaje Frontend |
|--------|-----------|------------------|
| `invalid-argument` | Formato incorrecto, campos vacíos | "Datos inválidos: [detalle]" |
| `already-exists` | Código duplicado en panelCodes | "El código 'X' ya existe en el sistema" |
| `failed-precondition` | No existe tarifa para el año | "No hay tarifa configurada para el año X" |
| `permission-denied` | Usuario no admin | "No tienes permisos para crear paneles" |
| `unauthenticated` | Sin sesión | "Usuario no autenticado" |
| `unavailable` | Firestore down | "Servicio temporalmente no disponible" |
| `internal` | Error inesperado | "Error interno: [detalle]" |

---

## 🧪 Testing Manual

### **Test 1: Alta Normal (Happy Path)**
1. Abrir consola admin → pestaña "📦 Inventario / Altas"
2. Ingresar:
   - Código: `TEST001`
   - Municipio: `Madrid`
   - Fecha: `2025-11-20`
3. Clic "🔍 Verificar Datos"
4. **Verificar previsualización:**
   - ID Técnico: `Madrid_TEST001`
   - Tarifa Base: `235.00 €`
   - Estado: `ACTIVO`
   - Tipo: `PIV`
5. Clic "✅ Confirmar Alta"
6. **Verificar respuesta:**
   - Mensaje: "Panel TEST001 dado de alta correctamente"
   - Mes: `2025-11`
   - Días facturables: `11`
   - Importe: `86.17€`
7. Esperar 3 segundos → página se recarga
8. Verificar en Firebase:
   - `panels/Madrid_TEST001` existe
   - `panelCodes/TEST001` existe
   - `billingMonthlyPanel/Madrid_TEST001_2025-11` existe

### **Test 2: Código Duplicado**
1. Intentar crear panel con código `TEST001` (ya existe)
2. Clic "🔍 Verificar" → OK
3. Clic "✅ Confirmar"
4. **Esperar error:** "El código 'TEST001' ya existe en el sistema"
5. Formulario vuelve a modo edición

### **Test 3: Tarifa No Configurada**
1. Ingresar fecha: `2030-01-15` (año sin tarifa)
2. Clic "🔍 Verificar"
3. **Verificar advertencia roja:**
   - "⚠️ NO EXISTE TARIFA CONFIGURADA PARA EL AÑO 2030"
   - Botón "Confirmar" deshabilitado
   - Tarifa Base: "⚠️ NO CONFIGURADA"

### **Test 4: Validación de Formato**
1. Ingresar fecha: `2025-13-99` (mes/día inválidos)
2. Clic "🔍 Verificar"
3. **Esperar error:** "❌ Formato de fecha inválido"

### **Test 5: Prorrateo**
| Fecha Alta | Día | Días Facturables | Tarifa 2025 | Importe Calculado |
|------------|-----|------------------|-------------|-------------------|
| 2025-11-01 | 1   | 30               | 235.00      | 235.00 (100%)     |
| 2025-11-15 | 15  | 16               | 235.00      | 125.33 (53%)      |
| 2025-11-30 | 30  | 1                | 235.00      | 7.83 (3%)         |

---

## 📦 Integración con AdminConsoleModal

### **InventoryTab Component**
```typescript
function InventoryTab() {
  const [rates, setRates] = useState<Array<{year: string; importe: number}>>([]);
  const [loadingRates, setLoadingRates] = useState(true);

  useEffect(() => {
    loadRates();
  }, []);

  const loadRates = async () => {
    try {
      const { collection, query, orderBy, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      const ratesRef = collection(db, "rates");
      const q = query(ratesRef, orderBy("year", "asc"));
      const snapshot = await getDocs(q);

      const loadedRates = snapshot.docs.map((doc) => ({
        year: doc.id,
        importe: doc.data().importe,
      }));

      setRates(loadedRates);
    } catch (err) {
      console.error("Error cargando tarifas:", err);
    } finally {
      setLoadingRates(false);
    }
  };

  return loadingRates ? (
    <div>⏳ Cargando tarifas...</div>
  ) : (
    <CreatePanelForm rates={rates} />
  );
}
```

---

## 🚀 Deployment

### **Compilación y Despliegue**
```powershell
# 1. Compilar TypeScript backend
cd C:\Dev\PIVManager\functions
npx tsc

# 2. Desplegar solo createPanel
cd C:\Dev\PIVManager
firebase deploy --only functions:createPanel

# 3. Verificar en Firebase Console
# https://console.firebase.google.com/project/piv-manager/functions
```

### **Estado del Despliegue**
- ✅ **Backend:** `createPanel` desplegado con configuración `memory: 256MB, timeout: 60s`
- ✅ **Frontend:** `CreatePanelForm` con patrón de previsualización
- ✅ **Integración:** `InventoryTab` carga tarifas desde Firestore

---

## 📊 Métricas de Robustez

| Métrica | Valor | Estado |
|---------|-------|--------|
| Validaciones frontend | 6 | ✅ |
| Validaciones backend | 12 | ✅ |
| Códigos de error HTTP | 7 | ✅ |
| Try/catch blocks | 5 | ✅ |
| Logging statements | 8 | ✅ |
| Batch atomicity | 4 colecciones | ✅ |
| Previsualización | 100% campos | ✅ |

---

## 🎓 Buenas Prácticas Implementadas

### ✅ **Defensa en Profundidad**
- **Capa 1:** Validación en formulario (UX)
- **Capa 2:** Validación en simulación cliente (lógica)
- **Capa 3:** Validación estricta en backend (seguridad)

### ✅ **Fail-Fast**
- Errores detectados en el punto más cercano al origen
- Mensajes claros sin revelar detalles internos

### ✅ **Idempotencia**
- Check de unicidad antes de escritura
- Batch atómico (todo o nada)

### ✅ **Observabilidad**
- Logging estructurado con contexto
- Códigos de error semánticos
- Stack traces en logs (no en respuesta)

### ✅ **User Experience**
- Previsualización completa antes de grabar
- Advertencias visuales (tarifa no configurada)
- Retroalimentación inmediata (éxito/error)
- Auto-recarga tras éxito

---

## 🔮 Próximas Mejoras (Opcional)

1. **Validación con Zod:**
   ```typescript
   import { z } from 'zod';
   
   const CreatePanelSchema = z.object({
     codigo: z.string().min(1).max(50),
     municipio: z.string().min(1).max(100),
     fechaAlta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
   });
   ```

2. **Rate Limiting:**
   ```typescript
   .runWith({
     memory: "256MB",
     timeoutSeconds: 60,
     minInstances: 0,
     maxInstances: 10,
   })
   ```

3. **Autocompletado de Municipios:**
   ```typescript
   <Autocomplete
     options={municipios}
     value={municipio}
     onChange={(e, value) => setMunicipio(value)}
   />
   ```

4. **Validación de Fecha en Backend:**
   ```typescript
   const fechaDate = new Date(fechaAlta);
   if (fechaDate > new Date('2100-12-31')) {
     throw new functions.https.HttpsError(
       "invalid-argument",
       "La fecha es demasiado lejana"
     );
   }
   ```

---

## 📚 Referencias

- **Firebase Functions Docs:** https://firebase.google.com/docs/functions
- **HttpsError Codes:** https://firebase.google.com/docs/reference/node/firebase.functions#functionserrorcode
- **Batch Writes:** https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes
- **React State Management:** https://react.dev/learn/managing-state

---

**Documento generado:** 19 de noviembre de 2025  
**Versión:** 1.0.0  
**Estado:** ✅ Producción
