# 🚀 PIV Manager Pro - Guía de Setup Rápido

## Paso 1: Configurar Firebase Project

### 1.1 Crear proyecto en Firebase Console
1. Ve a https://console.firebase.google.com
2. Clic en "Agregar proyecto"
3. Nombre: `piv-manager-pro` (o el que prefieras)
4. Desactiva Google Analytics (opcional)
5. Clic en "Crear proyecto"

### 1.2 Habilitar Firestore (región europe-west1)
1. En Firebase Console → **Firestore Database**
2. Clic en "Crear base de datos"
3. **Modo:** Native mode (NO Datastore mode)
4. **Región:** `eur3 (europe-west1)` ⚠️ IMPORTANTE
5. Clic en "Habilitar"

### 1.3 Habilitar Authentication
1. En Firebase Console → **Authentication**
2. Clic en "Comenzar"
3. Clic en pestaña "Sign-in method"
4. Habilitar "Correo electrónico/contraseña"
5. Guardar

### 1.4 Obtener credenciales para Frontend
1. En Firebase Console → **Configuración del proyecto** (ícono engranaje)
2. Scroll hasta "Tus apps" → "SDK setup and configuration"
3. Clic en el ícono `</> Web`
4. Registrar app: nombre "PIV Manager Web"
5. **COPIAR** las credenciales que aparecen:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "piv-manager-pro.firebaseapp.com",
  projectId: "piv-manager-pro",
  storageBucket: "piv-manager-pro.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## Paso 2: Configurar Variables de Entorno

### 2.1 Crear archivo .env.local
En la raíz del proyecto `C:\Dev\PIVManager`, crea el archivo `.env.local`:

```bash
# Copiar las credenciales de Firebase Console
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...TU_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=piv-manager-pro.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=piv-manager-pro
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=piv-manager-pro.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

⚠️ **Reemplaza los valores con los de TU proyecto Firebase**

---

## Paso 3: Configurar Firebase CLI

### 3.1 Instalar Firebase CLI (si no lo tienes)
```powershell
npm install -g firebase-tools
```

### 3.2 Login en Firebase
```powershell
firebase login
```
Esto abrirá el navegador para autenticarte con tu cuenta de Google.

### 3.3 Inicializar Firebase en el proyecto
```powershell
cd C:\Dev\PIVManager
firebase init
```

Selecciona:
- [x] Firestore
- [x] Functions
- [x] Storage

Configuración:
- **Project:** Selecciona `piv-manager-pro` (el que creaste)
- **Firestore rules:** `firestore.rules` (ya existe)
- **Firestore indexes:** `firestore.indexes.json` (ya existe)
- **Functions language:** TypeScript (ya existe)
- **Functions source:** `functions` (ya existe)
- **Install dependencies:** NO (ya las instalamos)
- **Storage rules:** usar defaults

---

## Paso 4: Desplegar Backend (Cloud Functions)

### 4.1 Crear infraestructura de Cloud Tasks
```powershell
# Queues para procesamiento asíncrono
gcloud tasks queues create process-panel-event --location=europe-west1
gcloud tasks queues create update-summary --location=europe-west1
```

Si te pide autenticarte: `gcloud auth login`

### 4.2 Crear bucket de Cloud Storage
Reemplaza `YOUR-PROJECT-ID` con tu project ID de Firebase:
```powershell
gsutil mb -l europe-west1 gs://YOUR-PROJECT-ID-reports
```

### 4.3 Desplegar Firestore rules e indexes
```powershell
firebase deploy --only firestore:indexes,firestore:rules
```

### 4.4 Instalar dependencias del backend
```powershell
cd functions
npm install
cd ..
```

### 4.5 Desplegar Cloud Functions
```powershell
firebase deploy --only functions
```

Esto tardará 5-10 minutos. Verás 9 funciones desplegadas:
- ✅ setUserRole
- ✅ importBaseMonth
- ✅ requestPanelChange
- ✅ updatePanelEvent
- ✅ deletePanelEvent
- ✅ processPanelEventTask
- ✅ updateSummaryTask
- ✅ closeMonthJob
- ✅ generateReport

---

## Paso 5: Crear Usuario Admin

### 5.1 Crear usuario en Firebase Console
1. Firebase Console → **Authentication** → **Users**
2. Clic en "Agregar usuario"
3. Email: `admin@pivmanager.com` (o el que prefieras)
4. Password: `Admin123!` (cambiar después)
5. Clic en "Agregar usuario"
6. **COPIAR el UID** del usuario (algo como `xYz123AbC456`)

### 5.2 Asignar rol admin con Cloud Function
```powershell
# Abrir shell de Functions
firebase functions:shell
```

Dentro del shell, ejecuta:
```javascript
setUserRole({ uid: 'PEGA_AQUI_EL_UID', role: 'admin', enabled: true })
```

Deberías ver: `{ success: true, message: 'Custom claims actualizados' }`

Sal del shell con: `Ctrl+C` dos veces

---

## Paso 6: Levantar Dev Server y Probar

### 6.1 Iniciar servidor de desarrollo
```powershell
npm run dev
```

Deberías ver:
```
  ▲ Next.js 14.2.0
  - Local:        http://localhost:3000
  - Ready in 2.5s
```

### 6.2 Abrir Dashboard
1. Ve a http://localhost:3000
2. Serás redirigido a `/dashboard`
3. Por ahora verás el dashboard vacío (sin datos)

---

## Paso 7: Importar Base de Prueba

### 7.1 Crear archivo CSV de prueba
Crea `test-panels.csv` con este contenido:

```csv
codigo,municipio,tarifa
PIV001,Madrid,41.15
PIV002,Barcelona,41.15
PIV003,Valencia,41.15
PIV004,Sevilla,41.15
PIV005,Zaragoza,41.15
PIV006,Málaga,41.15
PIV007,Murcia,41.15
PIV008,Palma,41.15
PIV009,Bilbao,41.15
PIV010,Alicante,41.15
```

### 7.2 Login en la aplicación
1. En http://localhost:3000/dashboard
2. Si no hay componente de login, usa Firebase UI o crea un login simple
3. **ALTERNATIVA RÁPIDA:** Usa Firebase Console para generar el token

### 7.3 Importar la base desde la UI
1. En Dashboard, ve a la sección **Administración** (solo visible si eres admin)
2. Clic en "Seleccionar archivo"
3. Selecciona `test-panels.csv`
4. Debería mostrar "Importación completada con éxito"

---

## Paso 8: Capturas Finales

### Captura 1: Dashboard Normal
- Dashboard con datos reales (10 paneles)
- KPIs con valores calculados
- Tabla con paginación
- Botones PDF/Excel habilitados
- Filtros y ordenación funcionando

### Captura 2: Modo Bloqueado
Para simular un mes bloqueado, ejecuta en Firestore:

```javascript
// Desde Firebase Console > Firestore > billingSummary
// Editar el documento "2025-11" (mes actual)
// Cambiar campo: isLocked = true
```

Luego refresca el dashboard y verás:
- Aviso: "Este mes está cerrado..."
- Botones PDF/Excel **ACTIVOS** ✅
- Input import **DESHABILITADO** ✅

---

## ❓ Solución de Problemas Comunes

### Error: "Cannot find module 'react'"
```powershell
npm install
```

### Error: "process is not defined"
Verifica que `.env.local` existe y tiene las variables `NEXT_PUBLIC_*`

### Error: "PERMISSION_DENIED"
El usuario no tiene Custom Claims. Ejecuta `setUserRole` de nuevo.

### Error: "Cloud Tasks queue not found"
```powershell
gcloud tasks queues create process-panel-event --location=europe-west1
gcloud tasks queues create update-summary --location=europe-west1
```

### Error: "Bucket does not exist"
```powershell
gsutil mb -l europe-west1 gs://YOUR-PROJECT-ID-reports
```

---

## 📋 Checklist Pre-Capturas

- [ ] Firebase project creado
- [ ] Firestore habilitado (europe-west1)
- [ ] Authentication habilitado
- [ ] `.env.local` creado con credenciales
- [ ] Firebase CLI instalado y logueado
- [ ] Cloud Tasks queues creadas
- [ ] Cloud Storage bucket creado
- [ ] Functions desplegadas (9/9)
- [ ] Usuario admin creado con Custom Claims
- [ ] `npm run dev` corriendo sin errores
- [ ] Base de prueba importada
- [ ] Dashboard muestra datos

---

**¿En qué paso necesitas ayuda específica?**
1. Crear proyecto Firebase
2. Configurar .env.local
3. Desplegar backend
4. Crear usuario admin
5. Importar datos de prueba
6. Otro problema específico
