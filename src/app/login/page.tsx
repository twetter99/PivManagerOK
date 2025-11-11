/**
 * Login Page
 * Autenticación con Google para PIV Manager Pro
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Si ya está autenticado, redirigir al dashboard
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/dashboard");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // La redirección se manejará automáticamente por el useEffect
    } catch (err: any) {
      console.error("Error al iniciar sesión:", err);
      setError(err.message || "Error al iniciar sesión con Google");
      setLoading(false);
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
