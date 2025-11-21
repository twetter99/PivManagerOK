/**
 * Script CLI para regenerar un panel específico
 * Uso: node scripts/regeneratePanel.js <panelId> <year> <month>
 * Ejemplo: node scripts/regeneratePanel.js 06692B 2025 11
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Importar la función worker (ya compilada)
const { recalculatePanelMonth } = require("../functions/lib/workers/recalculatePanelMonth");

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 3) {
    console.error("❌ Uso: node scripts/regeneratePanel.js <panelId> <year> <month>");
    console.error("   Ejemplo: node scripts/regeneratePanel.js 06692B 2025 11");
    process.exit(1);
  }

  const [panelId, year, month] = args;
  const monthKey = `${year}-${month.padStart(2, "0")}`;

  console.log(`\n🔄 Regenerando panel ${panelId} para el mes ${monthKey}...\n`);

  try {
    // Ejecutar recalculatePanelMonth (solo necesita panelId y monthKey)
    const result = await recalculatePanelMonth(panelId, monthKey);

    console.log("\n✅ Panel regenerado exitosamente:");
    console.log(`   📊 Días facturables: ${result.totalDiasFacturables}`);
    console.log(`   💰 Importe total: ${result.totalImporte.toFixed(2)} €`);
    console.log(`   📍 Estado al cierre: ${result.estadoAlCierre}`);
    console.log(`   💵 Tarifa aplicada: ${result.tarifaAplicada.toFixed(2)} €`);
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error al regenerar panel:", error);
    process.exit(1);
  }
}

main();
