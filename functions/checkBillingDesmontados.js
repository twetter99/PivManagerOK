/**
 * Script para verificar la facturación de paneles desmontados
 */

const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkBilling() {
  console.log('Verificando facturación de paneles desmontados...\n');
  
  const targetCodes = ['06692B', '8332'];
  
  for (const codigo of targetCodes) {
    // Buscar el panel
    const panelQuery = await db.collection('panels')
      .where('codigo', '==', codigo)
      .limit(1)
      .get();
    
    if (panelQuery.empty) continue;
    
    const panelDoc = panelQuery.docs[0];
    const panelId = panelDoc.id;
    const panelData = panelDoc.data();
    
    console.log(`\n=== Panel ${codigo} (ID: ${panelId}) ===`);
    console.log(`Estado actual: ${panelData.estadoActual}`);
    console.log(`Tarifa base: ${panelData.tarifaBaseMes}€/mes`);
    
    // Buscar facturación de noviembre
    const billingKey = `${panelId}_2025-11`;
    const billingDoc = await db.collection('billingMonthlyPanel').doc(billingKey).get();
    
    if (billingDoc.exists) {
      const billing = billingDoc.data();
      console.log('\nFacturación noviembre 2025:');
      console.log(JSON.stringify(billing, null, 2));
    } else {
      console.log('\nNo hay facturación para noviembre 2025');
    }
    
    // Buscar facturación de octubre (mes anterior)
    const billingKeyOct = `${panelId}_2025-10`;
    const billingDocOct = await db.collection('billingMonthlyPanel').doc(billingKeyOct).get();
    
    if (billingDocOct.exists) {
      const billing = billingDocOct.data();
      console.log('\nFacturación octubre 2025 (mes anterior):');
      console.log(`  - Días facturados: ${billing.diasFacturados}`);
      console.log(`  - Importe mes: ${billing.importeMes}€`);
      console.log(`  - Estado: ${billing.estadoMes}`);
    }
  }
  
  process.exit(0);
}

checkBilling().catch(console.error);
