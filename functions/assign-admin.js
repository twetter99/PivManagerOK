/**
 * Script para asignar rol admin a twetter@gmail.com
 * Ejecutar con: node assign-admin.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../piv-manager-firebase-adminsdk-fbsvc-b472322903.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const UID = 'SHUeQjtG1kRSW4MbiHEcmQGF3wk2'; // twetter@gmail.com

async function assignAdmin() {
  try {
    console.log('🔧 Asignando rol admin a UID:', UID);
    
    await admin.auth().setCustomUserClaims(UID, {
      admin: true,
      editor: true
    });

    console.log('✅ Custom Claims asignados correctamente');
    console.log('\nUsuario: twetter@gmail.com');
    console.log('Roles: admin=true, editor=true');
    console.log('UID:', UID);
    
    // Verificar
    const user = await admin.auth().getUser(UID);
    console.log('\n✓ Verificación - Custom Claims:', user.customClaims);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

assignAdmin();
