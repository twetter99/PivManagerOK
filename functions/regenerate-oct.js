const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { recalculatePanelMonth } = require('./lib/workers/recalculatePanelMonth');

async function main() {
  const db = admin.firestore();
  
  // Buscar panel 06692A
  const panelsSnap = await db.collection('panels')
    .where('codigo', '==', '06692A')
    .get();
  
  if (panelsSnap.empty) {
    console.log('Panel 06692A no encontrado');
    process.exit(1);
  }
  
  const panelId = panelsSnap.docs[0].id;
  console.log(`Regenerando panel ${panelId} (06692A) para octubre 2025...`);
  
  await recalculatePanelMonth(panelId, '2025-10');
  
  console.log('✓ Octubre regenerado correctamente');
  
  // Leer el resultado
  const billingDoc = await db.collection('billingMonthlyPanel')
    .doc(`${panelId}_2025-10`)
    .get();
  
  if (billingDoc.exists) {
    const data = billingDoc.data();
    console.log('\nResultado octubre:');
    console.log('  Días:', data.totalDiasFacturables);
    console.log('  Importe:', data.totalImporte, '€');
    console.log('  Estado:', data.estadoAlCierre);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
