/**
 * Script para verificar si existe el mes 2025-12 en billingSummary
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const monthKey = "2025-12";

  console.log(`\n🔍 Verificando mes: ${monthKey}\n`);

  try {
    // 1. Verificar si existe en billingSummary
    const summaryDoc = await db.collection("billingSummary").doc(monthKey).get();
    
    console.log(`📊 billingSummary/${monthKey}:`);
    if (!summaryDoc.exists) {
      console.log("   ❌ NO existe");
    } else {
      const data = summaryDoc.data();
      console.log("   ✅ SÍ existe");
      console.log(`   - Total importe: ${data.totalImporte || 0}€`);
      console.log(`   - Paneles activos: ${data.activeCount || 0}`);
      console.log(`   - Bloqueado: ${data.isLocked ? "SÍ" : "NO"}`);
      console.log(`   - Creado: ${data.createdAt?.toDate?.() || "N/A"}`);
      console.log(`   - Actualizado: ${data.updatedAt?.toDate?.() || "N/A"}`);
      console.log("\n   Documento completo:");
      console.log(JSON.stringify(data, null, 2));
    }

    // 2. Contar documentos de billingMonthlyPanel para ese mes
    const billingSnapshot = await db.collection("billingMonthlyPanel")
      .where("monthKey", "==", monthKey)
      .get();

    console.log(`\n📄 Documentos en billingMonthlyPanel para ${monthKey}:`);
    console.log(`   Total: ${billingSnapshot.size}`);

    if (billingSnapshot.size > 0) {
      console.log("\n   Primeros 5 paneles:");
      billingSnapshot.docs.slice(0, 5).forEach((doc, i) => {
        const data = doc.data();
        console.log(`   ${i + 1}. ${data.codigo} - ${data.estadoAlCierre} - ${data.totalDiasFacturables} días - ${data.totalImporte}€`);
      });
    }

    // 3. Contar eventos en panelEvents para ese mes
    const panelsSnapshot = await db.collection("panels").get();
    let totalEvents = 0;
    
    for (const panelDoc of panelsSnapshot.docs) {
      const eventsSnapshot = await panelDoc.ref
        .collection("panelEvents")
        .where("monthKey", "==", monthKey)
        .get();
      totalEvents += eventsSnapshot.size;
    }

    console.log(`\n📅 Eventos totales en ${monthKey}: ${totalEvents}`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
