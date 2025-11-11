# PIV Manager Pro - Deployment Instructions

## 📦 Setup Completado

### 1. Instalación de Dependencias ✅
```bash
npm install
```

**Dependencias instaladas:**
- Next.js 14.2.0 (App Router)
- React 18.3.0
- TypeScript 5.4.0
- Firebase SDK 10.12.0

---

## 🔥 Configuración de Firebase

### 2. Variables de Entorno (BLOQUEANTE)

Copia `.env.example` a `.env.local` y rellena con tus credenciales:

```bash
cp .env.example .env.local
```

**Valores requeridos** (desde Firebase Console):
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=piv-manager-pro.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=piv-manager-pro
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=piv-manager-pro.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

## 🚀 Despliegue Backend (Cloud Functions)

### 3. Infraestructura requerida (REGIÓN: europe-west1)

**IMPORTANTE:** Todos los servicios deben estar en **europe-west1** para latencia mínima.

Antes de desplegar funciones, crea la infraestructura:

```bash
# 1. Cloud Tasks queues (europe-west1)
gcloud tasks queues create process-panel-event --location=europe-west1
gcloud tasks queues create update-summary --location=europe-west1

# 2. Cloud Storage bucket (europe-west1)
gsutil mb -l europe-west1 gs://YOUR-PROJECT-ID-reports

# 3. Firestore Native Mode (europe-west1)
# Desde Firebase Console > Firestore Database > Create Database
# Seleccionar: Native Mode, Location: eur3 (europe-west1)

# 4. Deploy Firestore indexes
firebase deploy --only firestore:indexes

# 5. Deploy Firestore rules
firebase deploy --only firestore:rules

# 6. Deploy Cloud Functions (europe-west1)
cd functions
npm install
firebase deploy --only functions

# 7. Cloud Scheduler (europe-west1)
# Se crea automáticamente al desplegar closeMonthJob
# Verificar región: Firebase Console > Functions > closeMonthJob
```

### 4. Crear usuario admin inicial

Desde Firebase Console > Authentication > Users:
1. Crea un usuario con email/password
2. Copia el UID
3. Ejecuta desde Cloud Shell:

```bash
firebase functions:shell
> setUserRole({ uid: 'USER_UID', role: 'admin', enabled: true })
```

---

## 💻 Desarrollo Local

### 5. Levantar dev server

```bash
npm run dev
```

Dashboard disponible en: http://localhost:3000/dashboard

### 6. Testing de funcionalidad

**Sin datos reales** (pendiente autenticación):
- ✅ UI renderiza sin errores
- ✅ Componentes con skeleton loading
- ✅ Formato es-ES (moneda con €)
- ✅ CSV export con separador ;

**Con autenticación** (después de login):
- Dashboard carga resumen del mes
- Tabla muestra paneles con paginación
- Filtros de búsqueda y estado funcionan
- Generación de reportes PDF/Excel
- Sección Admin visible solo para admins

---

## 📋 Checklist de Validación

### Diseño Neutral ✅
- [x] Paleta: #F7F7F7, #EAEAEA, #D9D9D9, #A3A3A3, #595959, #000
- [x] Sin iconos, sin sombras
- [x] Bordes 1px sutiles
- [x] Hover con #F7F7F7
- [x] Spacing 8pt (8px, 16px, 24px)

### Formato es-ES ✅
- [x] Moneda: 1.234,56 € (Intl.NumberFormat)
- [x] CSV: separador ; con UTF-8 BOM
- [x] Nombre archivo: billing_{monthKey}.csv

### Reglas de negocio ✅
- [x] isLocked bloquea edición/importación
- [x] Aviso discreto en header si mes cerrado
- [x] ActionsBar deshabilitado si isLocked
- [x] AdminSection solo visible si isAdmin

### Estados ✅
- [x] Loading con skeletons grises
- [x] Empty state "No se encontraron paneles"
- [x] Error state con mensaje en #F7F7F7

---

## 🎯 Próximos Pasos

1. **Completar .env.local** con credenciales Firebase
2. **Deploy backend** (functions + infrastructure)
3. **Crear usuario admin** inicial
4. **Login en /dashboard** para probar flujo completo
5. **Importar base de prueba** (CSV con 5-10 paneles)
6. **Validar cálculos** (prorating, agregación L2)

---

## 📸 Capturas Pendientes

Para revisión visual final:

1. **Dashboard con datos** (después de login + importar base)
   - KPIs con valores reales
   - Tabla con paginación
   - Formato es-ES correcto

2. **Modo mes bloqueado** (isLocked=true)
   - Aviso en header
   - ActionsBar deshabilitado
   - AdminSection con indicador

---

## 🐛 Debugging

Si encuentras errores:

```bash
# Ver logs de Functions
firebase functions:log --only setUserRole

# Verificar índices Firestore
firebase firestore:indexes

# Revisar reglas de seguridad
firebase firestore:rules
```

**Errores comunes:**
- "Cannot find module 'react'": `npm install` (ya resuelto ✅)
- "process is not defined": Falta NEXT_PUBLIC_* en .env.local
- "PERMISSION_DENIED": Usuario sin Custom Claims (ejecutar setUserRole)
- "Cloud Tasks queue not found": Crear queues con gcloud (ver paso 3)
- "Bucket not found": Crear bucket con `gsutil mb -l europe-west1 gs://PROJECT-ID-reports`
- "Region mismatch": Verificar que Firestore, Functions, Tasks, Storage estén en europe-west1

**Validar región de servicios:**
```bash
# Verificar queues
gcloud tasks queues list --location=europe-west1

# Verificar bucket
gsutil ls -L gs://PROJECT-ID-reports | grep Location

# Verificar Firestore
# Firebase Console > Firestore > (ver región en la cabecera)
```

---

## 📦 Estructura Final

```
c:\Dev\PIVManager\
├── functions/                  # Cloud Functions (backend)
│   ├── src/
│   │   ├── admin/             # setUserRole, importBaseMonth
│   │   ├── commands/          # requestPanelChange, update, delete
│   │   ├── workers/           # recalculate, processPanelEventTask
│   │   ├── scheduled/         # closeMonthJob
│   │   ├── reports/           # generateReport (PDF/Excel)
│   │   └── lib/               # schemas, utils, billingRules
│   └── package.json
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Redirect to /dashboard
│   │   └── dashboard/
│   │       └── page.tsx       # Main dashboard
│   ├── components/            # 7 componentes React
│   │   ├── SummaryHeader.tsx
│   │   ├── KPICard.tsx
│   │   ├── KPIGrid.tsx
│   │   ├── FiltersBar.tsx
│   │   ├── MonthlyBillingTable.tsx
│   │   ├── ActionsBar.tsx
│   │   └── AdminSection.tsx
│   └── lib/
│       ├── firebase.ts        # Auth, Firestore, Functions client
│       └── api.ts             # Type-safe API functions
├── firestore.rules            # Security rules
├── firestore.indexes.json     # Composite indexes
├── next.config.js
├── tsconfig.json
├── package.json
└── .env.local                 # ⚠️ CREAR CON TUS CREDENCIALES
```

---

**Estado actual:** ✅ Frontend compilado sin errores  
**Bloqueante:** `.env.local` con credenciales Firebase  
**Próximo paso:** Deploy backend + autenticación  
