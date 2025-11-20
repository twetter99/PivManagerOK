/**
 * Script de diagnóstico: Verificar propagación de panel entre meses
 * 
 * Uso: node -r ts-node/register functions/src/diagnostics/checkPanelPropagation.ts
 */

import * as admin from "firebase-admin";

// Inicializar Firebase Admin
const serviceAccount = require("../../piv-manager-firebase-adminsdk-fbsvc-b472322903.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "piv-manager",
});

const db = admin.firestore();

async function checkPanelPropagation(codigo: string) {
  console.log(`\n🔍 Diagnóstico de propagación del panel: ${codigo}\n`);
  console.log("=".repeat(80));

  try {
    // 1. Buscar el panel por código
    console.log("\n1️⃣ Buscando panel en colección 'panels'...");
    const panelsSnapshot = await db.collection("panels").where("codigo", "==", codigo).get();

    if (panelsSnapshot.empty) {
      console.error(`❌ ERROR: No se encontró ningún panel con código "${codigo}"`);
      return;
    }

    const panelDoc = panelsSnapshot.docs[0];
    const panelId = panelDoc.id;
    const panelData = panelDoc.data();

    console.log(`✅ Panel encontrado: ${panelId}`);
    console.log(`   - Código: ${panelData.codigo}`);
    console.log(`   - Municipio: ${panelData.municipio || panelData.municipioId}`);
    console.log(`   - Estado actual: ${panelData.estadoActual || "N/A"}`);
    console.log(`   - Fecha alta: ${panelData.fechaAlta?.toDate?.() || "N/A"}`);

    // 2. Buscar eventos del panel
    console.log("\n2️⃣ Buscando eventos en panelEvents...");
    const eventsSnapshot = await db
      .collection("panels")
      .doc(panelId)
      .collection("panelEvents")
      .orderBy("effectiveDate", "asc")
      .get();

    console.log(`   Total eventos: ${eventsSnapshot.size}`);
    eventsSnapshot.docs.forEach((doc) => {
      const event = doc.data();
      const date = event.effectiveDateLocal || event.effectiveDate?.toDate?.();
      const deleted = event.isDeleted ? " [ELIMINADO]" : "";
      console.log(
        `   - ${event.monthKey}: ${event.action} (día ${date})${deleted}`
      );
    });

    // 3. Buscar facturación mensual
    console.log("\n3️⃣ Buscando documentos en billingMonthlyPanel...");
    const billingSnapshot = await db
      .collection("billingMonthlyPanel")
      .where("panelId", "==", panelId)
      .orderBy("monthKey", "asc")
      .get();

    console.log(`   Total meses: ${billingSnapshot.size}`);
    if (billingSnapshot.empty) {
      console.warn(`⚠️ No se encontraron documentos de facturación para este panel`);
    } else {
      billingSnapshot.docs.forEach((doc) => {
        const billing = doc.data();
        console.log(
          `   - ${billing.monthKey}: ${billing.totalDiasFacturables} días, ` +
          `${billing.totalImporte.toFixed(2)}€, ` +
          `estado: ${billing.estadoAlCierre}`
        );
      });
    }

    // 4. Verificar si existe en Noviembre y Diciembre específicamente
    console.log("\n4️⃣ Verificando meses específicos...");
    
    const nov2025 = await db.collection("billingMonthlyPanel").doc(`${panelId}_2025-11`).get();
    console.log(`   - 2025-11 (Noviembre): ${nov2025.exists ? "✅ EXISTE" : "❌ NO EXISTE"}`);
    if (nov2025.exists) {
      const data = nov2025.data()!;
      console.log(`     └─ ${data.totalDiasFacturables} días, ${data.totalImporte.toFixed(2)}€, ${data.estadoAlCierre}`);
    }

    const dic2025 = await db.collection("billingMonthlyPanel").doc(`${panelId}_2025-12`).get();
    console.log(`   - 2025-12 (Diciembre): ${dic2025.exists ? "✅ EXISTE" : "❌ NO EXISTE"}`);
    if (dic2025.exists) {
      const data = dic2025.data()!;
      console.log(`     └─ ${data.totalDiasFacturables} días, ${data.totalImporte.toFixed(2)}€, ${data.estadoAlCierre}`);
    }

    // 5. Diagnóstico
    console.log("\n5️⃣ DIAGNÓSTICO:");
    console.log("=".repeat(80));

    if (!nov2025.exists) {
      console.error("❌ PROBLEMA: El panel no tiene facturación en Noviembre 2025");
      console.error("   Solución: Ejecutar regenerateMonthBilling para 2025-11");
    } else if (!dic2025.exists) {
      console.error("❌ PROBLEMA: El panel existe en Noviembre pero NO en Diciembre");
      console.error("   Causas posibles:");
      console.error("   1. createNextMonth no procesó este panel");
      console.error("   2. Hubo un error durante recalculatePanelMonth");
      console.error("   3. El panel fue filtrado por alguna condición");
      console.error("\n   Solución: Ejecutar recalculatePanelMonth manualmente:");
      console.error(`   firebase functions:shell`);
      console.error(`   recalculatePanelMonth("${panelId}", "2025-12")`);
    } else {
      console.log("✅ El panel existe en ambos meses correctamente");
    }

  } catch (error: any) {
    console.error("\n❌ ERROR durante el diagnóstico:", error.message);
    console.error(error);
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

// Ejecutar diagnóstico
const panelCodigo = process.argv[2] || "09080A";
checkPanelPropagation(panelCodigo)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
