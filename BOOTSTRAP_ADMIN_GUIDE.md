# 🔐 Guía: Crear el Primer Administrador

## 📋 Problema Resuelto

Tu aplicación requiere que los usuarios tengan el rol `admin` en la colección `users` de Firestore, pero **no existe ningún admin todavía** para crear esa colección.

La función `bootstrapAdmin` permite crear el primer usuario administrador **sin necesidad de verificaciones de rol previas**.

---

## 🚀 Pasos para Crear tu Primer Admin

### **Paso 1: Obtener tu UID de Google Auth**

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Navega a tu proyecto: `piv-manager`
3. Ve a **Authentication** > **Users**
4. Busca tu cuenta de Google (email con el que haces login)
5. **Copia tu UID** (columna "User UID") - Ejemplo: `k8xN3mP9q4VZrT2wL6sA1bC7eY5f`

### **Paso 2: Llamar a la función desde la consola del navegador**

1. **Abre tu aplicación web** (localhost o producción)
2. **Haz login** con tu cuenta de Google
3. Abre la **Consola de Desarrollador** (F12)
4. Pega y ejecuta este código (reemplaza `TU_UID` y `TU_EMAIL`):

```javascript
// Importar Firebase Functions (si no lo tienes ya)
import { httpsCallable } from 'firebase/functions';
import { functions } from './lib/firebase'; // Ajusta la ruta según tu proyecto

// Llamar a bootstrapAdmin
const bootstrapAdminFunc = httpsCallable(functions, 'bootstrapAdmin');

bootstrapAdminFunc({
  targetUid: 'TU_UID_AQUI',        // ⬅️ Reemplazar con tu UID de Firebase Auth
  targetEmail: 'tu@email.com'      // ⬅️ Reemplazar con tu email
})
  .then((result) => {
    console.log('✅ Admin creado:', result.data);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
  });
```

### **Paso 3: Verificar en Firestore**

1. Ve a **Firestore Database** en Firebase Console
2. Deberías ver una nueva colección llamada `users`
3. Dentro, un documento con tu UID
4. El documento debe contener:
   ```json
   {
     "role": "admin",
     "email": "tu@email.com",
     "createdAt": "2025-11-20T...",
     "createdBy": "tu-uid",
     "bootstrapped": true
   }
   ```

---

## ✅ Verificar que Funciona

Intenta llamar a una función protegida (por ejemplo, `createPanel`):

```javascript
const createPanelFunc = httpsCallable(functions, 'createPanel');

createPanelFunc({
  codigo: 'TEST001',
  municipio: 'Madrid',
  fechaAlta: '2025-11-20'
})
  .then((result) => {
    console.log('✅ Tienes permisos de admin:', result.data);
  })
  .catch((error) => {
    console.error('❌ Error de permisos:', error);
  });
```

Si la función se ejecuta sin error de `permission-denied`, **ya eres admin** ✅

---

## 🔒 Seguridad Post-Bootstrap

### **Opción 1: Dejar la función activa** (menos seguro, pero conveniente)
- Cualquier usuario autenticado podría llamar a `bootstrapAdmin`
- Útil si necesitas crear más admins en el futuro
- **Riesgo**: Un usuario malicioso podría autopromoverse a admin

### **Opción 2: Deshabilitar la función** (más seguro)

Después de crear tu admin, puedes eliminar o comentar la exportación:

```typescript
// functions/src/index.ts

// ============================================================================
// FUNCIONES DE ADMINISTRACIÓN (Paso 2)
// ============================================================================
// export { bootstrapAdmin } from "./admin/bootstrapAdmin"; // ⚠️ DESHABILITADO después del bootstrap
export { setUserRole } from "./admin/setUserRole";
// ... resto de funciones
```

Luego redesplegar:
```bash
firebase deploy --only functions
```

### **Opción 3: Proteger con regla de seguridad adicional**

Modifica `bootstrapAdmin.ts` para permitir solo ciertos emails:

```typescript
// Al inicio de la función, después de verificar autenticación:
const allowedBootstrapEmails = [
  "tu@email.com",
  "admin@tudominio.com"
];

if (!allowedBootstrapEmails.includes(context.auth.token.email || "")) {
  throw new functions.https.HttpsError(
    "permission-denied",
    "No tienes permiso para usar esta función de bootstrap"
  );
}
```

---

## 🛠️ Alternativa: Usar Firebase CLI

Si prefieres no usar la consola del navegador:

```bash
# Instalar Firebase CLI si no la tienes
npm install -g firebase-tools

# Login
firebase login

# Llamar a la función
firebase functions:shell

# Dentro del shell:
bootstrapAdmin({ targetUid: 'TU_UID', targetEmail: 'tu@email.com' })
```

---

## 📊 Crear más Admins en el Futuro

Una vez que tengas tu primer admin, **NO necesitas `bootstrapAdmin`** para crear más.

Usa la función `setUserRole` (protegida por permisos de admin):

```javascript
const setUserRoleFunc = httpsCallable(functions, 'setUserRole');

setUserRoleFunc({
  userId: 'UID_DEL_NUEVO_ADMIN',
  role: 'admin'
})
  .then((result) => {
    console.log('✅ Nuevo admin creado:', result.data);
  });
```

---

## ❓ Solución de Problemas

### **Error: "unauthenticated"**
- No estás logueado. Haz login con Google Auth primero.

### **Error: "invalid-argument"**
- Verifica que `targetUid` y `targetEmail` sean strings válidos.

### **Error: "internal"**
- Revisa los logs en Firebase Console > Functions > Logs.
- Puede ser un problema de permisos de Firestore (debería tener permisos de escritura).

### **La función no aparece en Firebase Console**
- Ejecuta `firebase deploy --only functions` para desplegar todas las funciones.
- Verifica que `bootstrapAdmin` esté exportada en `functions/src/index.ts`.

---

## 🎯 Resumen

1. ✅ Función `bootstrapAdmin` creada y desplegada
2. ✅ Exportada en `index.ts`
3. ✅ Sin verificaciones de rol (por diseño)
4. ✅ Crea documento en `users/{uid}` con `role: "admin"`
5. ✅ Desbloquea acceso a todas las funciones protegidas

**Próximo paso**: Obtén tu UID y llama a la función desde la consola del navegador.
