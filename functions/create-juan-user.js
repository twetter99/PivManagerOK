const admin = require('firebase-admin');

admin.initializeApp();

async function createUser() {
  try {
    // Crear usuario juan@winfin.es
    const userRecord = await admin.auth().createUser({
      email: 'juan@winfin.es',
      password: 'Consorcio25*',
      displayName: 'Juan Admin',
      emailVerified: true
    });

    console.log('✅ Usuario creado:', userRecord.uid);

    // Asignar Custom Claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      admin: true,
      editor: true
    });

    console.log('✅ Rol admin asignado correctamente');
    console.log('\nCredenciales:');
    console.log('Email: juan@winfin.es');
    console.log('Password: Consorcio25*');
    console.log('UID:', userRecord.uid);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createUser();
