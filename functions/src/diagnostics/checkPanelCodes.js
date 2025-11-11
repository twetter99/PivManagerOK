/**
 * Script para verificar la integridad de panelCodes
 * 
 * Comprueba:
 * 1. ¿panelCodes tiene 447 o 894 documentos?
 * 2. ¿Los panelIds en panelCodes apuntan a paneles válidos?
 * 3. ¿Hay códigos que apuntan a múltiples panelIds?
 */

async function checkPanelCodesIntegrity(db) {
  console.log('\n=== VERIFICACIÓN DE panelCodes ===\n');
  
  // 1. Contar documentos en panelCodes
  const panelCodesSnapshot = await db.collection('panelCodes').get();
  console.log(`Total documentos en panelCodes: ${panelCodesSnapshot.size}`);
  
  // 2. Verificar que cada código apunta a UN SOLO panel
  const codigoToPanelIds = {};
  panelCodesSnapshot.forEach(doc => {
    const codigo = doc.id;
    const panelId = doc.data().panelId;
    
    if (!codigoToPanelIds[codigo]) {
      codigoToPanelIds[codigo] = [];
    }
    codigoToPanelIds[codigo].push(panelId);
  });
  
  // 3. Buscar códigos con múltiples panelIds
  const duplicatedCodigos = Object.entries(codigoToPanelIds)
    .filter(([_, panelIds]) => panelIds.length > 1);
  
  console.log(`\nCódigos con múltiples panelIds: ${duplicatedCodigos.length}`);
  
  if (duplicatedCodigos.length > 0) {
    console.log('❌ PROBLEMA: panelCodes tiene códigos que apuntan a múltiples paneles');
    console.log('Primeros 5 casos:');
    duplicatedCodigos.slice(0, 5).forEach(([codigo, panelIds]) => {
      console.log(`  ${codigo}: ${panelIds.join(', ')}`);
    });
  }
  
  // 4. Comparar con colección panels
  const panelsSnapshot = await db.collection('panels').get();
  console.log(`\nTotal documentos en panels: ${panelsSnapshot.size}`);
  
  // 5. Verificar consistencia: cada panel debe tener su código en panelCodes
  let inconsistencies = 0;
  for (const panelDoc of panelsSnapshot.docs) {
    const panelId = panelDoc.id;
    const codigo = panelDoc.data().codigo;
    
    const panelCodeDoc = await db.collection('panelCodes').doc(codigo).get();
    
    if (!panelCodeDoc.exists) {
      console.log(`⚠️ Panel ${panelId} (código ${codigo}) NO tiene entrada en panelCodes`);
      inconsistencies++;
    } else if (panelCodeDoc.data().panelId !== panelId) {
      console.log(`⚠️ panelCodes[${codigo}] apunta a ${panelCodeDoc.data().panelId} pero esperábamos ${panelId}`);
      inconsistencies++;
    }
  }
  
  console.log(`\nInconsistencias encontradas: ${inconsistencies}`);
  
  return {
    totalPanelCodes: panelCodesSnapshot.size,
    totalPanels: panelsSnapshot.size,
    duplicatedCodigos: duplicatedCodigos.length,
    inconsistencies
  };
}

module.exports = { checkPanelCodesIntegrity };
