/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// SECURITY: All Firebase config values MUST come from env vars only — no
// hardcoded fallbacks. Hardcoded values (vuln-0001) were removed 2026-08-19;
// the API key was subsequently rotation-scoped (see docs/firebase-security.md).
// The pre-build check (scripts/check-env.js) fails the build if the
// SECURITY-CRITICAL API key is missing. The remaining vars are non-secret
// (public client config) and are derived from well-known project identifiers
// when absent, so production keeps booting on minimal environments — any
// derived value is logged loudly at boot so a misconfigured host is never
// silent.
const PROJECT_ID = (import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ashevents-aa490').trim();

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${PROJECT_ID}.firebaseapp.com`).trim(),
  databaseURL: (import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`).trim(),
  projectId: PROJECT_ID,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`).trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123510874360').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '1:123510874360:web:8123f4bb25d30fa2b55b0d').trim(),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-E8H9VLEJFW').trim()
};

// Loud boot guard: the API key is the ONLY value that can never be derived —
// without it the app cannot authenticate at all, so boot fails hard.
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.trim() === '') {
  throw new Error(
    'Configuration missing: VITE_FIREBASE_API_KEY is empty. ' +
    'Set it before building (e.g. Vercel → Environment Variables). See docs/firebase-security.md.'
  );
}

const DERIVED_KEYS = [
  'authDomain',
  'databaseURL',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
].filter((k) => !import.meta.env[`VITE_FIREBASE_${k.toUpperCase()}` as keyof ImportMetaEnv]);
if (DERIVED_KEYS.length > 0) {
  console.error(
    `[firebase] Non-secret env vars missing, derived from defaults: ${DERIVED_KEYS.join(', ')}. ` +
    `Boot continues, but verify these values against your Firebase project settings.`
  );
}

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
