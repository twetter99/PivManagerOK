/**
 * Script para ver TODOS los eventos de un panel (sin filtrar por mes)
 */

const admin = require("firebase-admin");
const serviceAccount = require("../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const panelId = process.argv[2];
  
  if (!panelId) {
    console.error("❌ Uso: node checkAllPanelEvents.js <panelId>");
    process.exit(1);
  }

  console.log(`\n🔍 Buscando TODOS los eventos del panel ${panelId}...\n`);

  try {
    // Los eventos están en una subcolección: panels/{panelId}/panelEvents
    const eventsQuery = db.collection("panels")
      .doc(panelId)
      .collection("panelEvents");

    const eventsSnapshot = await eventsQuery.get();
    
    console.log(`📅 Total de eventos: ${eventsSnapshot.size}\n`);
    
    const events = [];
    eventsSnapshot.forEach((doc) => {
      const event = doc.data();
      events.push({
        id: doc.id,
        monthKey: event.monthKey,
        effectiveDateLocal: event.effectiveDateLocal,
        action: event.action,
        isDeleted: event.isDeleted,
        createdAt: event.createdAt
      });
    });

    // Ordenar por monthKey y effectiveDateLocal
    events.sort((a, b) => {
      if (a.monthKey !== b.monthKey) return a.monthKey.localeCompare(b.monthKey);
      return a.effectiveDateLocal.localeCompare(b.effectiveDateLocal);
    });

    events.forEach((event, index) => {
      console.log(`${index + 1}. ${event.monthKey} - ${event.effectiveDateLocal} - ${event.action}`);
      console.log(`   ID: ${event.id}`);
      console.log(`   Eliminado: ${event.isDeleted ? "SÍ" : "NO"}`);
      console.log(`   Creado: ${event.createdAt?.toDate?.() || event.createdAt}\n`);
    });

    // Verificar específicamente noviembre
    const novemberEvents = events.filter(e => e.monthKey === "2025-11" && !e.isDeleted);
    console.log(`\n🔍 Eventos activos en noviembre 2025: ${novemberEvents.length}`);
    if (novemberEvents.length > 0) {
      novemberEvents.forEach(e => {
        console.log(`   - ${e.effectiveDateLocal}: ${e.action}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
