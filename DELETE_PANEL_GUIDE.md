# Guía: Eliminar Paneles de Prueba

## Resumen
La función `deletePanel` permite eliminar completamente un panel y todos sus datos relacionados de Firestore. Esta operación es **IRREVERSIBLE**.

## ⚠️ ADVERTENCIAS CRÍTICAS

1. **Operación irreversible**: Una vez eliminado, el panel no se puede recuperar
2. **Solo para paneles de prueba**: NO usar con datos de producción
3. **Solo admins**: Requiere rol de administrador
4. **Meses bloqueados**: No se puede eliminar si hay meses con `isLocked: true`
5. **Confirmación obligatoria**: Hay que escribir el código del panel para confirmar

## ¿Qué elimina?

La función elimina **TODO rastro** del panel en Firestore:

### 1. Colección `panels`
- Documento del panel (ej: `Leganés_09080A`)

### 2. Colección `panelCodes`
- Candado de unicidad del código (ej: `09080A`)
- Permite reutilizar el código en el futuro

### 3. Subcolección `panelEvents`
- **TODOS** los eventos del panel en **TODOS** los meses
- Eventos de tipo: ALTA_INICIAL, BAJA, DESMONTAJE, REINSTALACION, etc.

### 4. Colección `billingMonthlyPanel`
- Todos los documentos de facturación mensual del panel
- Formato: `{panelId}_{monthKey}` (ej: `Leganés_09080A_2025-11`)

### 5. Colección `billingSummary`
- **Recalcula automáticamente** los resúmenes de los meses afectados
- Actualiza totales, contadores y estados

### 6. Colección `auditLogs`
- **Registra** la eliminación con detalles completos
- Incluye: quién eliminó, cuándo, qué se eliminó

## Uso desde Frontend

### Paso 1: Abrir el menú de acciones del panel
- En la tabla de paneles, click en el botón `⋯` del panel a eliminar

### Paso 2: Seleccionar "🗑️ Eliminar panel completo"
- Está al final del menú, separado con una línea
- Texto en rojo con emoji de papelera

### Paso 3: Confirmar escribiendo el código del panel
- Modal de confirmación con advertencias
- Escribir exactamente el código del panel (ej: `09080A`)
- Si el código no coincide, la operación se cancela

### Paso 4: Click en "🗑️ Eliminar Panel"
- Muestra un spinner mientras procesa
- Si hay error, muestra mensaje en rojo
- Si tiene éxito, muestra alert con detalles:
  - Eventos eliminados
  - Documentos de facturación eliminados
  - Meses afectados

### Ejemplo Visual:

```
┌─────────────────────────────────────────┐
│ ⚠️  Eliminar Panel Completo             │
├─────────────────────────────────────────┤
│ Esta acción es IRREVERSIBLE y eliminará:│
│                                         │
│ • El panel 09080A (Leganés)             │
│ • Todos los eventos del panel           │
│ • Todos los registros de facturación    │
│ • El candado de unicidad del código     │
│                                         │
│ Para confirmar, escribe: 09080A         │
│ ┌─────────────────────────────────────┐ │
│ │ [Escribe "09080A"]                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│         [Cancelar]  [🗑️ Eliminar Panel] │
└─────────────────────────────────────────┘
```

## Uso desde Cloud Function (Script)

### Script de verificación (testDeletePanel.js)

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { deletePanel } = require('./lib/admin/deletePanel');

async function eliminarPanelPrueba() {
  try {
    const result = await deletePanel.call(
      { auth: { uid: 'admin-uid', token: { email: 'admin@example.com' } } },
      {
        panelId: 'TestMunicipio_TEST001',
        confirmCode: 'TEST001'
      }
    );
    
    console.log('✅ Panel eliminado:', result);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
```

### Verificar panel antes de eliminar

```bash
cd functions
node testDeletePanel.js
```

Este script muestra:
- Datos del panel
- Eventos que se eliminarán
- Documentos de facturación
- Meses afectados
- Si hay meses bloqueados

## Casos de Error

### 1. Usuario no autenticado
```
Error: unauthenticated
Debes estar autenticado para eliminar un panel
```
**Solución:** Iniciar sesión como administrador

### 2. Usuario no es admin
```
Error: permission-denied
Solo administradores pueden eliminar paneles
```
**Solución:** Verificar que `users/{uid}.role === "admin"`

### 3. Panel no encontrado
```
Error: not-found
Panel TestMunicipio_TEST001 no encontrado
```
**Solución:** Verificar que el `panelId` es correcto

### 4. Código de confirmación incorrecto
```
Error: invalid-argument
Código de confirmación incorrecto. Debes escribir "TEST001" para confirmar
```
**Solución:** Escribir exactamente el código del panel (case-sensitive)

### 5. Mes bloqueado
```
Error: failed-precondition
No se puede eliminar: el mes 2025-11 está bloqueado. Desbloquea el mes primero.
```
**Solución:** Usar `toggleMonthLock` para desbloquear los meses afectados

## Flujo Interno de la Función

```
1. Validar autenticación y rol admin
2. Verificar que el panel existe
3. Validar código de confirmación
4. Verificar meses bloqueados
5. Iniciar transacción con batch:
   ├─ Eliminar panels/{panelId}
   ├─ Eliminar panelCodes/{codigo}
   └─ Eliminar billingMonthlyPanel (todos los meses)
6. Commit del batch
7. Eliminar subcolección panelEvents (batch separado)
8. Recalcular billingSummary de meses afectados
9. Registrar audit log
10. Retornar resultado
```

## Logs de Auditoría

Cada eliminación se registra en `auditLogs`:

```json
{
  "action": "DELETE_PANEL",
  "panelId": "Leganés_09080A",
  "codigo": "09080A",
  "municipio": "Leganés",
  "deletedBy": "admin@example.com",
  "deletedAt": "2025-11-20T10:30:00Z",
  "affectedMonths": ["2025-11", "2025-12"],
  "eventsDeleted": 1,
  "billingDocsDeleted": 2
}
```

## Recomendaciones

### Para desarrollo/pruebas:
1. Crear paneles con código reconocible: `TEST001`, `PRUEBA_001`, etc.
2. Usar municipios de prueba: `TestMunicipio`, `PruebaLocation`
3. Verificar con `testDeletePanel.js` antes de eliminar
4. Documentar qué paneles son de prueba

### Para producción:
1. **NUNCA** eliminar paneles reales
2. Usar BAJA en lugar de eliminar
3. Si hay error en facturación, usar `regenerateMonthBilling`
4. Solo eliminar si el panel fue creado por error y no tiene facturación real

## Alternativas a la Eliminación

### 1. Dar de BAJA (recomendado)
- Marca el panel como inactivo
- Mantiene el historial
- Reversible

```typescript
await requestPanelChange({
  panelId: 'Leganés_09080A',
  monthKey: '2025-11',
  action: 'BAJA',
  effectiveDateLocal: '2025-11-20',
  diasFacturables: 0,
  importeAFacturar: 0,
  snapshotBefore: {},
  snapshotAfter: {}
});
```

### 2. Eliminar eventos del mes
- Solo elimina eventos de un mes específico
- Mantiene el panel y otros meses
- Reversible (se pueden recrear eventos)

```typescript
await deleteAllPanelEvents({
  panelId: 'Leganés_09080A',
  monthKey: '2025-11'
});
```

### 3. Regenerar facturación del mes
- Recalcula la facturación sin eliminar
- Corrige errores de cálculo
- No destructivo

```typescript
await regenerateMonthBilling('2025-11');
```

## Conclusión

La función `deletePanel` es una herramienta poderosa para **limpiar paneles de prueba** durante el desarrollo. Sin embargo, para datos de producción, **siempre usa BAJA** en lugar de eliminar completamente.

**Regla de oro:** Si tienes dudas, NO elimines. Usa BAJA.
