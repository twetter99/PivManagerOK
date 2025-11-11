/**
 * RefreshTokenButton Component
 * Botón temporal para forzar refresh de Custom Claims sin logout
 */

"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";

export default function RefreshTokenButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleRefresh = async () => {
    setLoading(true);
    setMessage("");

    try {
      const user = auth.currentUser;
      if (!user) {
        setMessage("❌ No hay usuario autenticado");
        return;
      }

      // Forzar refresh del token
      await user.getIdToken(true);
      const result = await user.getIdTokenResult();

      console.log("✅ Token refrescado!");
      console.log("Custom Claims:", result.claims);

      setMessage(`✅ Token refrescado! Admin: ${result.claims.admin === true ? 'Sí' : 'No'}`);
      
      // Recargar la página después de 1 segundo
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1000 }}>
      <button
        onClick={handleRefresh}
        disabled={loading}
        style={{
          padding: "12px 24px",
          backgroundColor: loading ? "#ccc" : "#007AFF",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        {loading ? "Refrescando..." : "🔄 Refrescar Token"}
      </button>
      {message && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px 12px",
            backgroundColor: "#fff",
            borderRadius: "4px",
            fontSize: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
