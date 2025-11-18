const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
  console.log(`Panel ID: ${panelId}`);
  console.log('Código: 06692A\n');
  
  // Leer eventos de octubre
  const eventsSnap = await db.collection('panels')
    .doc(panelId)
    .collection('panelEvents')
    .where('monthKey', '==', '2025-10')
    .get();
  
  console.log(`=== EVENTOS DE OCTUBRE (${eventsSnap.size} total) ===\n`);
  
  const events = [];
  eventsSnap.forEach(doc => {
    const data = doc.data();
    events.push({
      id: doc.id,
      action: data.action,
      date: data.effectiveDateLocal,
      isDeleted: data.isDeleted || false,
      motivo: data.motivo || ''
    });
  });
  
  // Ordenar por fecha
  events.sort((a, b) => a.date.localeCompare(b.date));
  
  events.forEach(e => {
    console.log(`${e.isDeleted ? '[ELIMINADO]' : '[ACTIVO]   '} ${e.date} - ${e.action} ${e.motivo ? `(${e.motivo})` : ''}`);
  });
  
  // Leer facturación de octubre
  console.log('\n=== FACTURACIÓN OCTUBRE ===\n');
  const billingDoc = await db.collection('billingMonthlyPanel')
    .doc(`${panelId}_2025-10`)
    .get();
  
  if (billingDoc.exists) {
    const data = billingDoc.data();
    console.log('Días:', data.totalDiasFacturables);
    console.log('Importe:', data.totalImporte, '€');
    console.log('Estado:', data.estadoAlCierre);
  } else {
    console.log('No existe facturación para octubre');
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
