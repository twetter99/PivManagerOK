# PIV Manager Pro - Changelog

## 2025-11-09 - Setup Inicial

### Usuario Admin Configurado
- **Fecha:** 9 de noviembre de 2025
- **Proyecto Firebase:** piv-manager (Project ID: 984787325363)
- **Usuario:** twetter@gmail.com
- **UID:** SHUeQjtG1kRSW4MbiHEcmQGF3wk2
- **Custom Claims Asignados:**
  - `admin: true`
  - `editor: true`
- **Resultado:** ✅ Exitoso
- **Método:** Script Node.js con Firebase Admin SDK (assign-admin.js)

### Correcciones Aplicadas
1. **useAuth Hook:** Corregida recursión, ahora usa `onAuthStateChanged` correctamente
2. **isLocked Logic:** Reportes (PDF/Excel) siempre habilitados, solo import/edit bloqueados
3. **Región Unificada:** Todas las resources configuradas para europe-west1
4. **TypeScript:** Compilación exitosa después de ajustar timeout en closeMonthJob (540s)

### Próximos Pasos
- [ ] Configurar `.env.local` con credenciales Firebase
- [ ] Levantar dev server (`npm run dev`)
- [ ] Captura 1: Dashboard normal con datos
- [ ] Captura 2: Modo bloqueado (isLocked=true)
