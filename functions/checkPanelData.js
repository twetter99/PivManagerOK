/**
 * Script para verificar los datos de los paneles problemáticos
 */

const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkPanels() {
  console.log('Inspeccionando estructura completa del panel 06692B...\n');
  
  const querySnapshot = await db.collection('panels')
    .where('codigo', '==', '06692B')
    .limit(1)
    .get();
  
  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    console.log(`Panel Document ID: ${doc.id}`);
    console.log('\nTodos los campos:');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n\nVerificación de tipos:');
    console.log(`typeof data.municipio: ${typeof data.municipio}`);
    console.log(`data.municipio === undefined: ${data.municipio === undefined}`);
    console.log(`data.municipio === "undefined": ${data.municipio === "undefined"}`);
    console.log(`data.hasOwnProperty('municipio'): ${data.hasOwnProperty('municipio')}`);
  } else {
    console.log('Panel no encontrado');
  }
  
  process.exit(0);
}

checkPanels().catch(console.error);
