/**
 * API Route: Refresh Token
 * Endpoint para forzar refresh del token Firebase y obtener Custom Claims actualizados
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      message: "Este endpoint debe ser llamado desde el cliente con Firebase Auth",
      instructions: [
        "Abre la consola del navegador en http://localhost:3000",
        "Ejecuta: await fetch('/api/refresh-token').then(r => r.json())",
        "O mejor aún, cierra sesión y vuelve a iniciar sesión para obtener el nuevo token"
      ]
    }
  );
}
