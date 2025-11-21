/**
 * Script para eliminar completamente el mes 2025-12
 * Incluye billingSummary que quedó huérfano
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const monthKey = "2025-12";

  console.log(`\n🗑️  Eliminando mes ${monthKey} completamente...\n`);

  try {
    let deletedPanels = 0;
    let deletedEvents = 0;

    // 1. Eliminar billingMonthlyPanel
    const billingSnapshot = await db.collection("billingMonthlyPanel")
      .where("monthKey", "==", monthKey)
      .get();

    console.log(`📄 Eliminando ${billingSnapshot.size} documentos de billingMonthlyPanel...`);
    
    const BATCH_SIZE = 450;
    let batch = db.batch();
    let opsInBatch = 0;

    for (const doc of billingSnapshot.docs) {
      batch.delete(doc.ref);
      deletedPanels++;
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        await batch.commit();
        console.log(`   ✓ Lote completado: ${deletedPanels} eliminados`);
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      console.log(`   ✓ Total eliminados: ${deletedPanels}`);
    }

    // 2. Eliminar eventos de las subcolecciones panels/{panelId}/panelEvents
    console.log(`\n📅 Buscando eventos en subcolecciones...`);
    
    const panelsSnapshot = await db.collection("panels").get();
    
    for (const panelDoc of panelsSnapshot.docs) {
      const eventsSnapshot = await panelDoc.ref
        .collection("panelEvents")
        .where("monthKey", "==", monthKey)
        .get();

      if (eventsSnapshot.size > 0) {
        console.log(`   Panel ${panelDoc.id}: ${eventsSnapshot.size} eventos`);
        
        batch = db.batch();
        for (const eventDoc of eventsSnapshot.docs) {
          batch.delete(eventDoc.ref);
          deletedEvents++;
        }
        await batch.commit();
      }
    }

    console.log(`   ✓ Total eventos eliminados: ${deletedEvents}`);

    // 3. Eliminar billingSummary
    console.log(`\n📊 Eliminando billingSummary/${monthKey}...`);
    await db.collection("billingSummary").doc(monthKey).delete();
    console.log(`   ✓ billingSummary eliminado`);

    console.log(`\n✅ Mes ${monthKey} eliminado completamente:`);
    console.log(`   - Paneles: ${deletedPanels}`);
    console.log(`   - Eventos: ${deletedEvents}`);
    console.log(`   - Summary: 1`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
