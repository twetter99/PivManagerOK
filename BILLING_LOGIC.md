# Validación de Lógica de Facturación

## Cambios Implementados (20 nov 2025)

### 1. Corrección de campos en `createPanel.ts`
- ✅ **Bug 1**: Campo `estado` → `estadoActual` (línea 207)
- ✅ **Bug 2**: Campo `municipio` → `municipioId` (línea 203)
- ✅ Migración ejecutada: 1 panel actualizado

### 2. Corrección de lógica de facturación en `recalculatePanelMonth.ts`

#### Cambio Principal: BAJA no incluye el día de la baja

**ANTES (incorrecto):**
```typescript
if (estadoActual === "ACTIVO" && ultimoCambio <= dayOfMonth) {
  periodos.push({ inicio: ultimoCambio, fin: dayOfMonth }); // ❌ Incluía el día de BAJA
}
```

**AHORA (correcto):**
```typescript
if (estadoActual === "ACTIVO" && ultimoCambio < dayOfMonth) {
  periodos.push({ inicio: ultimoCambio, fin: dayOfMonth - 1 }); // ✅ NO incluye el día de BAJA
}
```

#### Cambio Secundario: ALTA_INICIAL resetea estado a BAJA

**Problema:** Cuando no había mes anterior, el estado inicial era `ACTIVO` por defecto, lo que causaba que paneles con `ALTA_INICIAL` en día 10 facturaran desde el día 1.

**Solución:**
```typescript
// Si hay un evento ALTA_INICIAL, el panel NO estaba activo antes
const hasAltaInicial = validEvents.some(doc => doc.data().action === "ALTA_INICIAL");
if (hasAltaInicial) {
  estadoActual = "BAJA"; // El panel NO existía antes del ALTA_INICIAL
}
```

---

## Casos de Prueba Validados

### Caso 1: ALTA_INICIAL día 10 (sin más eventos)
- **Entrada:** ALTA_INICIAL día 10 de noviembre
- **Esperado:** 21 días (días 10-30)
- **Resultado:** ✅ 21 días, 26.39€

### Caso 2: ALTA día 10, BAJA día 10 (mismo día)
- **Entrada:** ALTA día 10, BAJA día 10
- **Esperado:** 0 días (sin facturación)
- **Resultado:** ✅ 0 días, 0.00€

### Caso 3: ALTA día 10, BAJA día 11
- **Entrada:** ALTA día 10, BAJA día 11
- **Esperado:** 1 día (solo el día 10)
- **Resultado:** ✅ 1 día, 1.26€ (37.70€ / 30 * 1)

### Caso 4: ALTA día 10, BAJA día 12
- **Entrada:** ALTA día 10, BAJA día 12
- **Esperado:** 2 días (días 10-11)
- **Resultado:** ✅ 2 días, 2.51€ (37.70€ / 30 * 2)

### Caso 5: Panel heredado ACTIVO (sin eventos)
- **Entrada:** Panel ACTIVO en mes anterior, sin eventos en mes actual
- **Esperado:** 30 días (mes completo)
- **Resultado:** ✅ 30 días, 37.70€

### Caso 6: BAJA antes de ALTA (orden inválido)
- **Entrada:** BAJA día 1, ALTA día 10
- **Esperado:** Ignorar BAJA día 1 (no tiene sentido lógico)
- **Resultado:** ✅ Factura solo desde el ALTA (días 10-30 = 21 días)

---

## Reglas de Negocio Confirmadas

1. **ALTA/REINSTALACION:** Factura desde el día del evento hasta fin de mes (inclusive)
   - Fórmula: `30 - día + 1`
   - Ejemplo: ALTA día 20 → 30 - 20 + 1 = 11 días

2. **BAJA/DESMONTAJE:** NO factura el día del evento
   - Factura desde inicio del período hasta el día ANTERIOR a la baja
   - ALTA día 10, BAJA día 10 → 0 días ✅
   - ALTA día 10, BAJA día 11 → 1 día (solo el día 10) ✅

3. **ALTA_INICIAL:** Primer evento del panel, NO factura días anteriores al evento
   - El estado inicial se ajusta a BAJA automáticamente
   - Solo factura desde el día del ALTA_INICIAL

4. **Eventos inválidos:** BAJA antes de ALTA se ignora lógicamente
   - El sistema procesa eventos cronológicamente
   - Solo factura períodos donde el panel está ACTIVO

---

## Estado Final del Sistema

- ✅ Panel `Leganés_09080A` creado correctamente
- ✅ Noviembre 2025: 21 días, 26.39€, ACTIVO
- ✅ Diciembre 2025: 30 días, 37.70€, ACTIVO
- ✅ Total paneles en sistema: 448
- ✅ Funciones desplegadas en producción

---

## Notas Técnicas

### Precisión Contable (Céntimos)
Todos los cálculos internos usan céntimos (enteros) para evitar errores de redondeo:
```typescript
const tarifaCents = eurosToCents(37.70);  // 3770 céntimos
const importeCents = calculateImporteCents(21, 3770); // 2639 céntimos
const importe = centsToEuros(2639); // 26.39€
```

### Orden de Procesamiento
1. Leer estado del mes anterior (si existe)
2. Detectar `ALTA_INICIAL` → ajustar estado inicial a BAJA
3. Procesar eventos cronológicamente
4. Calcular períodos activos
5. Sumar días facturables (máximo 30)
6. Calcular importe total en céntimos

### Campos Consistentes
- `estadoActual` (no `estado`)
- `municipioId` (no `municipio`)
- Ambos validados por schema y migraciones ejecutadas
