/**
 * Script de diagnóstico para identificar la causa raíz de los duplicados
 * 
 * Verificaciones:
 * 1. ¿Hay paneles duplicados en la colección 'panels'? (mismo código pero diferentes IDs)
 * 2. ¿Hay documentos duplicados en billingMonthlyPanel con el mismo panelId?
 * 3. ¿Los documentos duplicados tienen diferentes panelIds pero mismo código?
 */

// Este script debe ejecutarse con Firebase Admin SDK inicializado
// Usar desde Firebase Console o con credenciales apropiadas

async function diagnosticDuplicates(db, monthKey) {
  console.log('\n=== DIAGNÓSTICO DE DUPLICADOS ===\n');
  
  // 1. Verificar colección PANELS
  console.log('1. Analizando colección PANELS...');
  const panelsSnapshot = await db.collection('panels').get();
  console.log(`   Total paneles: ${panelsSnapshot.size}`);
  
  const codigoToPanelIds = {};
  panelsSnapshot.forEach(doc => {
    const codigo = doc.data().codigo;
    if (!codigoToPanelIds[codigo]) {
      codigoToPanelIds[codigo] = [];
    }
    codigoToPanelIds[codigo].push({
      id: doc.id,
      estadoActual: doc.data().estadoActual,
      municipioId: doc.data().municipioId
    });
  });
  
  const duplicatedCodigosInPanels = Object.entries(codigoToPanelIds)
    .filter(([_, panels]) => panels.length > 1);
  
  console.log(`   Códigos duplicados en PANELS: ${duplicatedCodigosInPanels.length}`);
  
  if (duplicatedCodigosInPanels.length > 0) {
    console.log('\n   ⚠️  PROBLEMA DETECTADO: Hay códigos duplicados en la colección PANELS');
    console.log('   Primeros 5 casos:');
    duplicatedCodigosInPanels.slice(0, 5).forEach(([codigo, panels]) => {
      console.log(`     - Código: ${codigo} (${panels.length} paneles)`);
      panels.forEach(p => console.log(`       PanelId: ${p.id}, Estado: ${p.estadoActual}`));
    });
  }
  
  // 2. Verificar colección BILLING
  console.log(`\n2. Analizando billingMonthlyPanel para ${monthKey}...`);
  const billingSnapshot = await db.collection('billingMonthlyPanel')
    .where('monthKey', '==', monthKey)
    .get();
  console.log(`   Total documentos: ${billingSnapshot.size}`);
  
  const panelIdToDocs = {};
  const codigoToDocs = {};
  
  billingSnapshot.forEach(doc => {
    const data = doc.data();
    const panelId = data.panelId;
    const codigo = data.codigo;
    
    // Agrupar por panelId
    if (!panelIdToDocs[panelId]) {
      panelIdToDocs[panelId] = [];
    }
    panelIdToDocs[panelId].push({
      docId: doc.id,
      codigo: codigo,
      dias: data.totalDiasFacturables,
      importe: data.totalImporte
    });
    
    // Agrupar por código
    if (!codigoToDocs[codigo]) {
      codigoToDocs[codigo] = [];
    }
    codigoToDocs[codigo].push({
      docId: doc.id,
      panelId: panelId,
      dias: data.totalDiasFacturables,
      importe: data.totalImporte
    });
  });
  
  const duplicatedPanelIds = Object.entries(panelIdToDocs)
    .filter(([_, docs]) => docs.length > 1);
  
  const duplicatedCodigosInBilling = Object.entries(codigoToDocs)
    .filter(([_, docs]) => docs.length > 1);
  
  console.log(`   PanelIds duplicados: ${duplicatedPanelIds.length}`);
  console.log(`   Códigos duplicados: ${duplicatedCodigosInBilling.length}`);
  
  if (duplicatedPanelIds.length > 0) {
    console.log('\n   ⚠️  ANOMALÍA: Mismo panelId con múltiples documentos de billing');
    console.log('   Primeros 3 casos:');
    duplicatedPanelIds.slice(0, 3).forEach(([panelId, docs]) => {
      console.log(`     - PanelId: ${panelId}`);
      docs.forEach(d => console.log(`       DocId: ${d.docId}, Código: ${d.codigo}, ${d.dias}d, ${d.importe}€`));
    });
  }
  
  if (duplicatedCodigosInBilling.length > 0) {
    console.log('\n   ⚠️  PROBLEMA: Mismo código con múltiples documentos de billing');
    console.log('   Primeros 5 casos:');
    duplicatedCodigosInBilling.slice(0, 5).forEach(([codigo, docs]) => {
      console.log(`     - Código: ${codigo} (${docs.length} documentos)`);
      docs.forEach(d => console.log(`       PanelId: ${d.panelId}, DocId: ${d.docId}, ${d.dias}d, ${d.importe}€`));
    });
  }
  
  // 3. CONCLUSIÓN
  console.log('\n=== CONCLUSIÓN ===\n');
  
  if (duplicatedCodigosInPanels.length > 0) {
    console.log('❌ CAUSA RAÍZ IDENTIFICADA:');
    console.log('   La colección PANELS tiene códigos duplicados con diferentes IDs.');
    console.log('   Cuando regenerateMonthBilling recorre todos los paneles, procesa');
    console.log(`   cada uno individualmente (${panelsSnapshot.size} veces), creando`);
    console.log('   múltiples documentos de billing para el mismo código físico.');
    console.log('\n   SOLUCIÓN:');
    console.log('   1. Limpiar duplicados en la colección PANELS');
    console.log('   2. Eliminar todos los documentos de billing del mes');
    console.log('   3. Regenerar facturación con colección PANELS limpia');
  } else if (duplicatedCodigosInBilling.length > 0 && duplicatedPanelIds.length === 0) {
    console.log('⚠️  SITUACIÓN ANÓMALA:');
    console.log('   Hay códigos duplicados en billing pero NO en panels.');
    console.log('   Posibles causas:');
    console.log('   - Se ejecutó regeneración múltiples veces sin limpiar');
    console.log('   - Hubo paneles duplicados que luego se limpiaron');
    console.log('   - Error en el ID del documento de billing');
  } else if (duplicatedPanelIds.length > 0) {
    console.log('⚠️  ERROR CRÍTICO:');
    console.log('   El mismo panelId tiene múltiples documentos de billing.');
    console.log('   Esto indica que recalculatePanelMonth NO está usando transaction.set()');
    console.log('   correctamente, o está generando IDs diferentes para el mismo panel.');
  } else {
    console.log('✅ No se detectaron duplicados en las colecciones.');
  }
}

// Para usar desde Firebase Functions:
// const db = admin.firestore();
// await diagnosticDuplicates(db, '2025-11');

module.exports = { diagnosticDuplicates };
