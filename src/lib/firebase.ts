/**
 * Firebase Client Configuration for Next.js
 * PIV Manager Pro
 */

"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore } from "firebase/firestore";
import { useState, useEffect } from "react";

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth = getAuth(app);
export const functions = getFunctions(app, "europe-west1");
export const db = getFirestore(app);

// Type-safe callable functions
export const callableFunction = <T = any, R = any>(name: string) => {
  return httpsCallable<T, R>(functions, name);
};

/**
 * Hook useAuth: expone user con Custom Claims (admin/editor)
 * Estados: loading → authenticated/unauthenticated
 * CORREGIDO: evita recursión, usa onAuthStateChanged correctamente
 */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  token: {
    admin: boolean;
    editor: boolean;
  };
}

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listener de cambios en autenticación
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Recuperar Custom Claims del token
          const tokenResult = await firebaseUser.getIdTokenResult();
          
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            token: {
              admin: tokenResult.claims.admin === true,
              editor: tokenResult.claims.editor === true,
            },
          });
        } catch (error) {
          console.error("Error al obtener Custom Claims:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
}
