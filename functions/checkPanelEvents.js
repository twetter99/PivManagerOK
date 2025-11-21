/**
 * Script para verificar eventos de un panel en un mes específico
 * Uso: node checkPanelEvents.js <panelId> <year> <month>
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 3) {
    console.error("❌ Uso: node checkPanelEvents.js <panelId> <year> <month>");
    console.error("   Ejemplo: node checkPanelEvents.js 06692B 2025 11");
    process.exit(1);
  }

  const [panelId, year, month] = args;
  const monthKey = `${year}-${month.padStart(2, "0")}`;

  console.log(`\n🔍 Verificando eventos del panel ${panelId} en ${monthKey}...\n`);

  try {
    // 1. Verificar si el panel existe
    const panelDoc = await db.collection("panels").doc(panelId).get();
    if (!panelDoc.exists) {
      console.log(`❌ El panel ${panelId} NO existe en la colección 'panels'`);
    } else {
      const panelData = panelDoc.data();
      console.log(`✅ Panel encontrado:`);
      console.log(`   Código: ${panelData.codigo}`);
      console.log(`   Municipio: ${panelData.municipio}`);
      console.log(`   Estado actual: ${panelData.estadoActual || "N/A"}`);
    }

    // 2. Buscar eventos del mes (sin orderBy para evitar error de índice)
    const eventsQuery = db.collection("panelEvents")
      .where("panelId", "==", panelId)
      .where("monthKey", "==", monthKey);

    const eventsSnapshot = await eventsQuery.get();
    
    // Filtrar manualmente los eventos no eliminados y ordenar por día
    const events = eventsSnapshot.docs
      .filter(doc => doc.data().deletedAt === null)
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
    
    console.log(`\n📅 Eventos en ${monthKey}: ${events.length} (${eventsSnapshot.size} total, ${eventsSnapshot.size - events.length} eliminados)`);
    
    if (events.length === 0) {
      console.log("   (No hay eventos activos para este mes)");
    } else {
      events.forEach((event) => {
        console.log(`\n   📌 Evento: ${event.id}`);
        console.log(`      Acción: ${event.action}`);
        console.log(`      Día: ${event.dayOfMonth}`);
        console.log(`      Fecha evento: ${event.eventDate}`);
      });
    }

    // 3. Buscar documento de facturación mensual
    const billingDocId = `${panelId}_${monthKey}`;
    const billingDoc = await db.collection("billingMonthlyPanel").doc(billingDocId).get();
    
    console.log(`\n💰 Documento de facturación (${billingDocId}):`);
    if (!billingDoc.exists) {
      console.log("   ❌ No existe");
    } else {
      const billing = billingDoc.data();
      console.log(`   ✅ Existe`);
      console.log(`      Días facturables: ${billing.totalDiasFacturables}`);
      console.log(`      Importe: ${billing.totalImporte?.toFixed(2)} €`);
      console.log(`      Estado al cierre: ${billing.estadoAlCierre}`);
      console.log(`      Tarifa aplicada: ${billing.tarifaAplicada?.toFixed(2)} €`);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
