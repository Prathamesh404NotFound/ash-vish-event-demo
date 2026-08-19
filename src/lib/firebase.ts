/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// SECURITY: All Firebase config values MUST come from env vars only — no
// hardcoded fallbacks. Hardcoded values (vuln-0001) were removed 2026-08-19;
// the API key was subsequently rotation-scoped (see docs/firebase-security.md).
// A pre-build check (scripts/check-env.js) fails the production build if any
// VITE_FIREBASE_* is empty, and the runtime guard below fails loudly at boot
// instead of silently initializing Firebase with garbage.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const MISSING_KEYS = Object.entries(firebaseConfig)
  .filter(([, v]) => !v || v.trim() === '')
  .map(([k]) => k);
if (MISSING_KEYS.length > 0) {
  throw new Error(
    `Configuration missing: Firebase env vars ${MISSING_KEYS.join(', ')} are empty. ` +
    `Set all VITE_FIREBASE_* variables before building. See docs/firebase-security.md.`
  );
}

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
