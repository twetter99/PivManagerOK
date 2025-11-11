# PIV Manager Pro - README

## 📋 Arquitectura del Sistema

PIV Manager Pro es un sistema empresarial de facturación con arquitectura asíncrona basada en eventos.

### Principios de Diseño Implementados

1. **Eficiencia de Costes**: Cachés L1 (billingMonthlyPanel) y L2 (billingSummary)
2. **Robustez**: Fuente de la verdad inmutable (panelEvents)
3. **UX Instantánea**: Patrón Command-Query con Cloud Tasks
4. **Resiliencia**: Reintentos automáticos y Dead-Letter Queues
5. **Seguridad**: Lógica de negocio en backend, cliente solo lectura

---

## 🏗️ Estructura del Proyecto

```
PIVManager/
├── functions/                    # Firebase Cloud Functions (Backend)
│   ├── src/
│   │   ├── admin/               # Funciones de administración
│   │   │   ├── setUserRole.ts
│   │   │   └── importBaseMonth.ts
│   │   ├── commands/            # Comandos (Callable Functions)
│   │   │   ├── requestPanelChange.ts
│   │   │   ├── updatePanelEvent.ts
│   │   │   └── deletePanelEvent.ts
│   │   ├── workers/             # Workers (HTTP Functions para Cloud Tasks)
│   │   │   ├── processPanelEventTask.ts
│   │   │   ├── recalculatePanelMonth.ts
│   │   │   └── updateSummaryTask.ts
│   │   ├── scheduled/           # Jobs programados
│   │   │   └── closeMonthJob.ts
│   │   ├── reports/             # Generación de reportes
│   │   │   └── generateReport.ts
│   │   ├── lib/                 # Utilidades compartidas
│   │   │   ├── schemas.ts       # Esquemas Zod (6 colecciones)
│   │   │   ├── utils.ts         # Helpers de autenticación
│   │   │   └── billingRules.ts  # Reglas de prorrateo
│   │   └── index.ts             # Punto de entrada
│   ├── package.json
│   └── tsconfig.json
├── src/                         # Frontend Next.js
│   └── lib/
│       ├── firebase.ts          # Configuración Firebase Client
│       └── api.ts               # API functions (getSummary, getMonthlyBilling)
├── firestore.rules              # Reglas de seguridad
├── firestore.indexes.json       # Índices compuestos
└── .env.local.example           # Variables de entorno

```

---

## 🔧 Configuración Inicial

### 1. Instalar Dependencias

**Backend (Functions):**
```powershell
cd functions
npm install
```

**Frontend (Next.js):**
```powershell
npm install firebase
```

### 2. Configurar Variables de Entorno

Copiar `.env.local.example` a `.env.local` y completar con las credenciales de Firebase:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
```

### 3. Configurar Firebase (Región: europe-west1)

**IMPORTANTE:** Todos los servicios deben usar **europe-west1** para latencia óptima.

```powershell
firebase login
firebase init
```

Seleccionar:
- Functions (TypeScript)
- Firestore
- Storage

### 4. Crear Colas de Cloud Tasks

```bash
# Cola para procesar eventos
gcloud tasks queues create process-panel-event \
  --location=europe-west1 \
  --max-attempts=5 \
  --max-retry-duration=7200s

# Cola para actualizar resúmenes
gcloud tasks queues create update-summary \
  --location=europe-west1 \
  --max-attempts=3 \
  --max-retry-duration=3600s
```

### 5. Crear Bucket de Cloud Storage (para reportes)

```bash
gsutil mb -l europe-west1 gs://[PROJECT_ID]-reports
```

### 6. Desplegar Índices de Firestore

```bash
firebase deploy --only firestore:indexes
```

### 7. Desplegar Reglas de Firestore

```bash
firebase deploy --only firestore:rules
```

### 8. Desplegar Cloud Functions

```bash
firebase deploy --only functions
```

---

## 📊 Modelo de Datos (6 Colecciones)

### 1. `panels` (Colección Maestra)
```typescript
{
  codigo: string,              // "6948" o "TFT Hosp.Getafe"
  municipioId: string,
  estadoActual: "ACTIVO" | "DESMONTADO" | "BAJA",
  tarifaBaseMes: number,       // 37.70
  ubicacion?: string,
  tipo?: string,
  createdAt: Timestamp,
  createdBy: string,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

### 2. `panelCodes` (Candado de Unicidad)
```typescript
{
  panelId: string              // Referencia a panels/{panelId}
}
```

### 3. `panels/{panelId}/panelEvents` (Fuente de la Verdad)
```typescript
{
  action: "ALTA" | "BAJA" | "DESMONTADO" | "REINSTALACION" | "CAMBIO_TARIFA" | "AJUSTE_MANUAL" | "ALTA_INICIAL",
  effectiveDate: Timestamp,
  effectiveDateLocal: string,  // "YYYY-MM-DD"
  monthKey: string,            // "YYYY-MM"
  diasFacturables: number,
  importeAFacturar: number,
  motivo?: string,
  snapshotBefore: object,
  snapshotAfter: object,
  idempotencyKey: string,      // UUID v4
  isDeleted: boolean,
  deletedAt?: Timestamp,
  deletedBy?: string,
  createdAt: Timestamp,
  createdBy: string,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

### 4. `billingMonthlyPanel` (Caché L1)
```typescript
{
  panelId: string,
  monthKey: string,            // "YYYY-MM"
  codigo: string,
  municipio: string,
  totalDiasFacturables: number,
  totalImporte: number,
  estadoAlCierre: "ACTIVO" | "DESMONTADO" | "BAJA",
  tarifaAplicada: number,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

### 5. `billingSummary` (Caché L2)
```typescript
{
  monthKey: string,            // "YYYY-MM"
  totalImporteMes: number,
  totalPanelesFacturables: number,
  panelesActivos: number,      // días >= 30
  panelesParciales: number,    // días > 0 y < 30
  totalEventos: number,
  isLocked: boolean,           // Mes cerrado
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

### 6. `rates` (Catálogo de Tarifas)
```typescript
{
  nombre: string,
  importe: number,
  validFrom: Timestamp,
  validTo: Timestamp | null,
  createdAt: Timestamp,
  createdBy: string,
  updatedAt: Timestamp,
  schemaVersion: 1
}
```

---

## 🔐 Seguridad (firestore.rules)

**Cliente puede LEER:**
- `billingMonthlyPanel` (lista de facturación)
- `billingSummary` (KPIs del dashboard)

**Cliente NO puede acceder:**
- `panels` (solo backend)
- `panelEvents` (solo backend)
- `panelCodes` (solo backend)
- `rates` (solo backend)

**Todas las escrituras:** Solo backend (Firebase Functions con Admin SDK)

---

## 🚀 Flujo de Operaciones

### Crear Evento de Panel (requestPanelChange)

```
Frontend → requestPanelChange (Callable)
    ↓
Firestore: panels/{panelId}/panelEvents/{eventId}
    ↓
Cloud Tasks: process-panel-event
    ↓
processPanelEventTask → recalculatePanelMonth
    ↓
Firestore: billingMonthlyPanel/{panelId}_{monthKey}
    ↓
Cloud Tasks: update-summary
    ↓
updateSummaryTask → recalculateSummary
    ↓
Firestore: billingSummary/{monthKey}
    ↓
Frontend lee billingSummary (Dashboard)
```

### Cierre Automático de Mes (closeMonthJob)

```
Cloud Scheduler (día 1 de cada mes, 02:00 AM)
    ↓
closeMonthJob
    ↓
Encola updateSummaryTask (recálculo final)
    ↓
Espera 5 minutos
    ↓
Marca billingSummary.isLocked = true
    ↓
Bloquea requestPanelChange, updatePanelEvent, deletePanelEvent
```

---

## 📝 Reglas de Prorrateo

**Base:** 30 días/mes (independiente de los días reales del mes)

| Evento | Día del Evento | Días Facturables | Fórmula |
|--------|----------------|------------------|---------|
| ALTA | 20 | 11 días | 30 - 20 + 1 |
| DESMONTAJE | 20 | 20 días | 20 |
| REINSTALACION | 15 | 16 días | 30 - 15 + 1 |
| BAJA | 10 | 10 días | 10 |

**Importe:** `(tarifaMensual / 30) * diasFacturables`

---

## 🔧 Comandos Útiles

**Desplegar todo:**
```bash
firebase deploy
```

**Desplegar solo functions:**
```bash
firebase deploy --only functions
```

**Ver logs en tiempo real:**
```bash
firebase functions:log --only closeMonthJob
```

**Ejecutar closeMonthJob manualmente:**
```bash
gcloud scheduler jobs run closeMonthJob --location=europe-west1
```

**Ver estado de las colas:**
```bash
gcloud tasks queues list --location=europe-west1
```

---

## 📦 Funciones Implementadas (Backend)

| Función | Tipo | Descripción |
|---------|------|-------------|
| `setUserRole` | Callable | Asignar roles (admin/editor) |
| `importBaseMonth` | Callable | Importación masiva CSV (9 min timeout) |
| `requestPanelChange` | Callable | Crear evento de panel |
| `deletePanelEvent` | Callable | Soft-delete de evento |
| `updatePanelEvent` | Callable | Actualizar evento existente |
| `generateReport` | Callable | Generar PDF/Excel + Signed URL |
| `processPanelEventTask` | HTTP | Worker: Procesar evento |
| `updateSummaryTask` | HTTP | Worker: Actualizar totales |
| `closeMonthJob` | Scheduled | Cierre automático de mes |

**Total: 9 Cloud Functions**

---

## 🌐 API Functions (Frontend)

```typescript
// Dashboard KPIs
const summary = await getSummary("2025-11");

// Tabla de paneles
const panels = await getMonthlyBilling("2025-11");

// Crear evento
await requestPanelChange({ ... });

// Generar reporte
const { url } = await generateReport({
  monthKey: "2025-11",
  type: "pdf"
});
```

---

## 🎯 Próximos Pasos

1. Crear componentes React para el Dashboard
2. Implementar formularios de creación/edición de eventos
3. Añadir autenticación con Firebase Auth
4. Implementar sistema de roles (admin/editor/viewer)
5. Crear página de reportes con descarga directa

---

## 📄 Licencia

Privado - PIV Manager Pro © 2025
