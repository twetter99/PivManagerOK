const admin = require('firebase-admin');
const serviceAccount = require('./piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkDuplicates() {
  console.log('\n=== Verificando duplicados en billingMonthlyPanel ===\n');
  
  // Obtener todos los documentos de noviembre
  const snapshot = await db.collection('billingMonthlyPanel')
    .where('monthKey', '==', '2025-11')
    .get();
  
  console.log(`Total documentos encontrados: ${snapshot.size}`);
  
  // Agrupar por código
  const codigoMap = {};
  const panelIdMap = {};
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const codigo = data.codigo;
    const panelId = data.panelId;
    
    if (!codigoMap[codigo]) {
      codigoMap[codigo] = [];
    }
    codigoMap[codigo].push({
      docId: doc.id,
      panelId: panelId,
      dias: data.totalDiasFacturables,
      importe: data.totalImporte
    });
    
    if (!panelIdMap[panelId]) {
      panelIdMap[panelId] = [];
    }
    panelIdMap[panelId].push({
      docId: doc.id,
      codigo: codigo
    });
  });
  
  // Buscar códigos duplicados
  const duplicatedCodigos = Object.entries(codigoMap).filter(([k, v]) => v.length > 1);
  console.log(`\nCódigos duplicados: ${duplicatedCodigos.length}`);
  
  if (duplicatedCodigos.length > 0) {
    console.log('\nPrimeros 10 códigos duplicados:');
    duplicatedCodigos.slice(0, 10).forEach(([codigo, entries]) => {
      console.log(`\n  ${codigo} (${entries.length} veces):`);
      entries.forEach(entry => {
        console.log(`    - DocId: ${entry.docId}`);
        console.log(`      PanelId: ${entry.panelId}`);
        console.log(`      Días: ${entry.dias}, Importe: ${entry.importe}€`);
      });
    });
  }
  
  // Buscar panelIds duplicados
  const duplicatedPanelIds = Object.entries(panelIdMap).filter(([k, v]) => v.length > 1);
  console.log(`\n\nPanelIds duplicados: ${duplicatedPanelIds.length}`);
  
  if (duplicatedPanelIds.length > 0) {
    console.log('\nPrimeros 5 panelIds duplicados:');
    duplicatedPanelIds.slice(0, 5).forEach(([panelId, entries]) => {
      console.log(`\n  ${panelId} (${entries.length} veces):`);
      entries.forEach(entry => {
        console.log(`    - DocId: ${entry.docId}, Código: ${entry.codigo}`);
      });
    });
  }
  
  // Verificar cuántos paneles hay en la colección panels
  console.log('\n=== Verificando colección panels ===\n');
  const panelsSnapshot = await db.collection('panels').get();
  console.log(`Total paneles en colección: ${panelsSnapshot.size}`);
  
  process.exit(0);
}

checkDuplicates().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
