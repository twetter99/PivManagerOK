/**
 * Script para eliminar de forma segura los datos de noviembre 2025
 * SOLO elimina documentos con monthKey = "2025-11"
 * 
 * Uso: cd functions && node ../scripts/deleteNovemberData.js
 */

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'piv-manager'
});

const db = admin.firestore();
const MONTH_KEY = '2025-11';

async function deleteNovemberData() {
  console.log(`\n🗑️  INICIANDO ELIMINACIÓN DE DATOS PARA: ${MONTH_KEY}\n`);
  
  try {
    // 1. Eliminar billingSummary para noviembre
    console.log('📊 Verificando billingSummary...');
    const summaryRef = db.collection('billingSummary').doc(MONTH_KEY);
    const summaryDoc = await summaryRef.get();
    
    if (summaryDoc.exists) {
      await summaryRef.delete();
      console.log(`✅ billingSummary/${MONTH_KEY} eliminado`);
    } else {
      console.log(`ℹ️  billingSummary/${MONTH_KEY} no existe`);
    }
    
    // 2. Eliminar todos los billingMonthlyPanel de noviembre
    console.log('\n📋 Buscando documentos en billingMonthlyPanel...');
    const billingQuery = db.collection('billingMonthlyPanel')
      .where('monthKey', '==', MONTH_KEY);
    
    const billingSnapshot = await billingQuery.get();
    const totalDocs = billingSnapshot.size;
    
    if (totalDocs === 0) {
      console.log(`ℹ️  No hay documentos en billingMonthlyPanel con monthKey="${MONTH_KEY}"`);
    } else {
      console.log(`📦 Encontrados ${totalDocs} documentos para eliminar`);
      
      // Eliminar en lotes de 500 (límite de Firestore)
      const batchSize = 500;
      let deletedCount = 0;
      
      while (true) {
        const snapshot = await db.collection('billingMonthlyPanel')
          .where('monthKey', '==', MONTH_KEY)
          .limit(batchSize)
          .get();
        
        if (snapshot.empty) {
          break;
        }
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        deletedCount += snapshot.size;
        console.log(`   ⏳ Eliminados ${deletedCount}/${totalDocs} documentos...`);
      }
      
      console.log(`✅ ${deletedCount} documentos de billingMonthlyPanel eliminados`);
    }
    
    // 3. Verificar que no queden documentos
    console.log('\n🔍 Verificando eliminación...');
    const verifySnapshot = await db.collection('billingMonthlyPanel')
      .where('monthKey', '==', MONTH_KEY)
      .limit(1)
      .get();
    
    if (verifySnapshot.empty) {
      console.log('✅ Verificación exitosa: No quedan documentos de noviembre');
    } else {
      console.log('⚠️  ADVERTENCIA: Aún quedan documentos. Ejecutar el script nuevamente.');
    }
    
    console.log('\n✅ ELIMINACIÓN COMPLETADA\n');
    console.log('📝 Próximos pasos:');
    console.log('   1. Levantar el dashboard: npm run dev');
    console.log('   2. Navegar a noviembre 2025');
    console.log('   3. Usar el menú de acciones para recalcular cada panel');
    console.log('   4. Verificar TFT Getafe: 30 días × 37.70€ = 37.70€\n');
    
  } catch (error) {
    console.error('❌ ERROR durante la eliminación:', error);
    process.exit(1);
  } finally {
    // Cerrar la conexión
    await admin.app().delete();
    process.exit(0);
  }
}

// Confirmación de seguridad
console.log('⚠️  ADVERTENCIA: Este script eliminará TODOS los datos de facturación de noviembre 2025');
console.log(`   - Collection: billingSummary, Doc: ${MONTH_KEY}`);
console.log(`   - Collection: billingMonthlyPanel, monthKey: ${MONTH_KEY}\n`);

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('¿Deseas continuar? (escribe "SI" para confirmar): ', (answer) => {
  rl.close();
  
  if (answer.trim().toUpperCase() === 'SI') {
    deleteNovemberData();
  } else {
    console.log('\n❌ Operación cancelada por el usuario\n');
    process.exit(0);
  }
});
