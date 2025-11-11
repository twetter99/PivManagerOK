/**
 * Script para crear usuario juan@winfin.es y asignarle rol admin
 * Ejecutar con: node create-admin-user.js
 */

const admin = require('firebase-admin');

// Inicializar Firebase Admin
admin.initializeApp({
  projectId: 'piv-manager'
});

async function createAdminUser() {
  try {
    console.log('🔧 Creando usuario juan@winfin.es...');
    
    // Crear usuario
    const userRecord = await admin.auth().createUser({
      email: 'juan@winfin.es',
      password: 'Admin123!',
      displayName: 'Juan Admin',
      emailVerified: true
    });

    console.log('✅ Usuario creado con UID:', userRecord.uid);
    
    // Asignar Custom Claims (admin)
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      admin: true,
      editor: true
    });

    console.log('✅ Custom Claims asignados: admin=true, editor=true');
    console.log('\n📋 Credenciales:');
    console.log('   Email: juan@winfin.es');
    console.log('   Password: Admin123!');
    console.log('   UID:', userRecord.uid);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdminUser();
