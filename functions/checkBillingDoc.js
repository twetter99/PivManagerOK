/**
 * Script para ver el documento completo de billingMonthlyPanel
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
    console.error("❌ Uso: node checkBillingDoc.js <panelId> <year> <month>");
    process.exit(1);
  }

  const [panelId, year, month] = args;
  const monthKey = `${year}-${month.padStart(2, "0")}`;
  const docId = `${panelId}_${monthKey}`;

  console.log(`\n📄 Documento: billingMonthlyPanel/${docId}\n`);

  try {
    const doc = await db.collection("billingMonthlyPanel").doc(docId).get();
    
    if (!doc.exists) {
      console.log("❌ El documento NO existe");
      process.exit(0);
    }

    const data = doc.data();
    console.log("✅ Documento encontrado:\n");
    console.log(JSON.stringify(data, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
