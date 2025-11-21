/**
 * Script para ver un evento específico completo
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const [panelId, eventId] = process.argv.slice(2);
  
  if (!panelId || !eventId) {
    console.error("❌ Uso: node checkEvent.js <panelId> <eventId>");
    process.exit(1);
  }

  console.log(`\n📄 Evento: panels/${panelId}/panelEvents/${eventId}\n`);

  try {
    const doc = await db.collection("panels")
      .doc(panelId)
      .collection("panelEvents")
      .doc(eventId)
      .get();
    
    if (!doc.exists) {
      console.log("❌ El evento NO existe");
      process.exit(0);
    }

    const data = doc.data();
    console.log("✅ Evento encontrado:\n");
    console.log(JSON.stringify(data, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
