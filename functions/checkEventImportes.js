/**
 * Script para verificar los importes en los eventos
 */

const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkEvents() {
  console.log('Verificando eventos de noviembre 2025...\n');
  
  const targetCodes = ['06692B', '20001', '8332'];
  
  for (const codigo of targetCodes) {
    // Buscar el panel
    const panelQuery = await db.collection('panels')
      .where('codigo', '==', codigo)
      .limit(1)
      .get();
    
    if (panelQuery.empty) {
      console.log(`Panel ${codigo}: NO ENCONTRADO\n`);
      continue;
    }
    
    const panelDoc = panelQuery.docs[0];
    const panelId = panelDoc.id;
    
    console.log(`\n=== Panel ${codigo} (ID: ${panelId}) ===`);
    
    // Buscar eventos de noviembre
    const eventsSnapshot = await db
      .collection('panels')
      .doc(panelId)
      .collection('panelEvents')
      .where('monthKey', '==', '2025-11')
      .get();
    
    if (eventsSnapshot.empty) {
      console.log('  No hay eventos en noviembre 2025\n');
      continue;
    }
    
    console.log(`  Total eventos: ${eventsSnapshot.size}\n`);
    
    eventsSnapshot.forEach(eventDoc => {
      const event = eventDoc.data();
      console.log(`  Evento: ${event.action}`);
      console.log(`    - Fecha: ${event.effectiveDateLocal}`);
      console.log(`    - Importe: ${event.importe}`);
      console.log(`    - isDeleted: ${event.isDeleted}`);
      console.log('');
    });
  }
  
  process.exit(0);
}

checkEvents().catch(console.error);
