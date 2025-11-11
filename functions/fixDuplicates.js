const admin = require('firebase-admin');

// Inicializar Firebase Admin
const serviceAccount = {
  projectId: "piv-manager",
  // Las credenciales se toman del entorno o del SDK por defecto
};

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "piv-manager"
});

const db = admin.firestore();

async function fixDuplicates() {
  console.log('\n=== Limpiando duplicados de November 2025 ===\n');
  
  try {
    // 1. Obtener TODOS los documentos de noviembre
    const snapshot = await db.collection('billingMonthlyPanel')
      .where('monthKey', '==', '2025-11')
      .get();
    
    console.log(`Total documentos encontrados: ${snapshot.size}`);
    
    if (snapshot.size === 0) {
      console.log('No hay documentos para procesar.');
      process.exit(0);
    }
    
    // 2. Agrupar por panelId (cada panelId debe tener SOLO UN documento por mes)
    const panelIdMap = new Map();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const panelId = data.panelId;
      
      if (!panelIdMap.has(panelId)) {
        panelIdMap.set(panelId, []);
      }
      
      panelIdMap.get(panelId).push({
        docId: doc.id,
        codigo: data.codigo,
        dias: data.totalDiasFacturables,
        importe: data.totalImporte,
        updatedAt: data.updatedAt
      });
    });
    
    console.log(`Paneles únicos encontrados: ${panelIdMap.size}`);
    
    // 3. Identificar duplicados
    const duplicates = [];
    const toDelete = [];
    
    for (const [panelId, docs] of panelIdMap.entries()) {
      if (docs.length > 1) {
        duplicates.push({ panelId, count: docs.length, docs });
        
        // Ordenar por updatedAt (más reciente primero) para mantener el más nuevo
        docs.sort((a, b) => {
          if (!a.updatedAt || !b.updatedAt) return 0;
          return b.updatedAt.seconds - a.updatedAt.seconds;
        });
        
        // Marcar todos excepto el primero (más reciente) para borrar
        for (let i = 1; i < docs.length; i++) {
          toDelete.push(docs[i].docId);
        }
      }
    }
    
    console.log(`\nPanelIds con duplicados: ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('\nPrimeros 10 casos de duplicación:');
      duplicates.slice(0, 10).forEach(({ panelId, count, docs }) => {
        console.log(`\n  PanelId: ${panelId} (${count} docs)`);
        docs.forEach((doc, idx) => {
          const keep = idx === 0 ? ' ← MANTENER' : ' ← BORRAR';
          console.log(`    ${idx + 1}. DocId: ${doc.docId}`);
          console.log(`       Código: ${doc.codigo}, Días: ${doc.dias}, Importe: ${doc.importe}€${keep}`);
        });
      });
      
      console.log(`\n\nTotal documentos a eliminar: ${toDelete.length}`);
      console.log(`Documentos que se mantendrán: ${panelIdMap.size}`);
      
      // 4. Confirmar antes de borrar
      console.log('\n⚠️  ATENCIÓN: Se van a eliminar los documentos duplicados más antiguos.');
      console.log('Presiona Ctrl+C para cancelar o espera 5 segundos para continuar...\n');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 5. Eliminar en lotes de 500 (límite de Firestore)
      console.log('Eliminando duplicados...');
      const BATCH_SIZE = 500;
      
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchDocs = toDelete.slice(i, i + BATCH_SIZE);
        
        batchDocs.forEach(docId => {
          batch.delete(db.collection('billingMonthlyPanel').doc(docId));
        });
        
        await batch.commit();
        console.log(`  Eliminados: ${Math.min(i + BATCH_SIZE, toDelete.length)}/${toDelete.length}`);
      }
      
      console.log('\n✅ Duplicados eliminados correctamente.');
      console.log(`Total documentos restantes: ${panelIdMap.size}`);
      
    } else {
      console.log('\n✅ No se encontraron duplicados.');
    }
    
    // 6. Verificar resultado final
    const finalSnapshot = await db.collection('billingMonthlyPanel')
      .where('monthKey', '==', '2025-11')
      .get();
    
    console.log(`\nVerificación final: ${finalSnapshot.size} documentos en billingMonthlyPanel`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

fixDuplicates();
