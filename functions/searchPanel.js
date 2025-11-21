/**
 * Script para buscar un panel por municipio y código parcial
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const searchTerm = process.argv[2] || "Alcobendas";

  console.log(`\n🔍 Buscando paneles que contengan: "${searchTerm}"...\n`);

  try {
    const panelsSnapshot = await db.collection("panels").get();
    
    const matches = [];
    panelsSnapshot.forEach((doc) => {
      const panel = doc.data();
      const searchableText = `${panel.codigo} ${panel.municipio} ${doc.id}`.toLowerCase();
      
      if (searchableText.includes(searchTerm.toLowerCase())) {
        matches.push({
          id: doc.id,
          codigo: panel.codigo,
          municipio: panel.municipio,
          estadoActual: panel.estadoActual || "N/A"
        });
      }
    });

    console.log(`✅ Encontrados ${matches.length} panel(es):\n`);
    
    matches.forEach((match, index) => {
      console.log(`${index + 1}. ID: ${match.id}`);
      console.log(`   Código: ${match.codigo}`);
      console.log(`   Municipio: ${match.municipio}`);
      console.log(`   Estado: ${match.estadoActual}\n`);
    });

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
