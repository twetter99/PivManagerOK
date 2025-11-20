/**
 * Login Page
 * Autenticación con Google para PIV Manager Pro
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, functions } from "@/lib/firebase";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  useEffect(() => {
    // Si ya está autenticado, redirigir al dashboard
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // TEMPORALMENTE COMENTADO: No redirigir automáticamente para poder usar el botón bootstrap
        // router.push("/dashboard");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      console.log("✅ Login exitoso:", result.user.email);
      // La redirección se manejará automáticamente por el useEffect (actualmente comentada)
      setLoading(false);
    } catch (err: any) {
      console.error("Error al iniciar sesión:", err);
      setError(err.message || "Error al iniciar sesión con Google");
      setLoading(false);
    }
  };

  const handleBootstrapAdmin = async () => {
    setBootstrapLoading(true);
    setError(null);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError("No hay usuario autenticado. Inicia sesión primero.");
        setBootstrapLoading(false);
        return;
      }

      const bootstrapAdminFunc = httpsCallable(functions, "bootstrapAdmin");
      const result = await bootstrapAdminFunc({
        targetUid: currentUser.uid,
        targetEmail: currentUser.email || "unknown",
      });

      // @ts-ignore
      alert(`✅ ÉXITO: ${result.data.message}\n\nYa eres administrador. Recarga la página para acceder al dashboard.`);
      
      // Opcional: Redirigir automáticamente después del bootstrap
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err: any) {
      console.error("Error al activar modo admin:", err);
      setError(err.message || "Error al activar modo admin");
    } finally {
      setBootstrapLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F7F7F7",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          padding: "48px",
          borderRadius: "12px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          width: "100%",
          maxWidth: "400px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 600,
            color: "#000",
            marginBottom: "8px",
          }}
        >
          PIV Manager Pro
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#595959",
            marginBottom: "32px",
          }}
        >
          Gestión y análisis de paneles PIV
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 24px",
            backgroundColor: loading ? "#ccc" : "#007AFF",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background-color 0.2s",
          }}
        >
          {loading ? "Iniciando sesión..." : "Iniciar sesión con Google"}
        </button>

        {/* BOTÓN DE RESCATE: Bootstrap Admin */}
        {auth.currentUser && (
          <div style={{ marginTop: "24px" }}>
            <div
              style={{
                padding: "12px",
                backgroundColor: "#FEF3C7",
                border: "2px solid #F59E0B",
                borderRadius: "8px",
                marginBottom: "12px",
                fontSize: "13px",
                color: "#92400E",
              }}
            >
              <strong>✅ Autenticado como:</strong> {auth.currentUser.email}
              <br />
              <span style={{ fontSize: "11px" }}>
                UID: {auth.currentUser.uid.substring(0, 20)}...
              </span>
            </div>
            <button
              onClick={handleBootstrapAdmin}
              disabled={bootstrapLoading}
              style={{
                width: "100%",
                padding: "14px 24px",
                backgroundColor: bootstrapLoading ? "#ccc" : "#DC2626",
                color: "#fff",
                border: "2px solid #B91C1C",
                borderRadius: "8px",
                fontSize: "15px",
                fontWeight: 700,
                cursor: bootstrapLoading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {bootstrapLoading ? "Activando..." : "🚨 ACTIVAR MODO ADMIN"}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              backgroundColor: "#FFE5E5",
              color: "#D32F2F",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        <p
          style={{
            fontSize: "12px",
            color: "#999",
            marginTop: "24px",
          }}
        >
          Solo usuarios autorizados pueden acceder
        </p>
      </div>
    </div>
  );
}
