/**
 * Script de Inicialización: Crear Colección de Tarifas
 * 
 * Ejecutar con: node scripts/init-rates.js
 * 
 * Crea la colección 'rates' en Firestore con las tarifas anuales estándar.
 * DEBE ejecutarse ANTES de desplegar la nueva versión de recalculatePanelMonth.
 */

// Usar firebase-admin desde functions/node_modules
const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Tarifas estándar por año
 * Estas son las tarifas oficiales que se aplicarán automáticamente
 * al calcular la facturación de cada año.
 */
const STANDARD_RATES = [
  { year: '2024', importe: 36.50 },
  { year: '2025', importe: 37.70 },
  { year: '2026', importe: 39.00 },
];

async function initRates() {
  console.log('🚀 Iniciando creación de colección de tarifas...\n');

  try {
    for (const rate of STANDARD_RATES) {
      const rateRef = db.collection('rates').doc(rate.year);
      
      await rateRef.set({
        year: rate.year,
        importe: rate.importe,
        descripcion: `Tarifa estándar para el año ${rate.year}`,
        updatedAt: admin.firestore.Timestamp.now(),
        createdBy: 'init-script',
        schemaVersion: 1,
      });

      console.log(`✅ Tarifa ${rate.year}: ${rate.importe}€`);
    }

    console.log('\n✨ Colección "rates" creada exitosamente en Firestore');
    console.log('\n📋 Resumen:');
    console.log(`   - 2024: 36.50€`);
    console.log(`   - 2025: 37.70€`);
    console.log(`   - 2026: 39.00€`);
    console.log('\n⚠️  IMPORTANTE: Estos son valores de EJEMPLO.');
    console.log('   Ajusta las tarifas reales antes de usar en producción.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al crear tarifas:', error);
    process.exit(1);
  }
}

// Ejecutar
initRates();
