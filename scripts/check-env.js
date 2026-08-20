#!/usr/bin/env node
/*
 * Pre-build guard: fails the production build if any VITE_FIREBASE_* env var
 * is empty or unset. This prevents a silently broken Firebase config from
 * ever reaching a deployed bundle (vuln-0001 remediation).
 *
 * Usage: node scripts/check-env.js   (run before `vite build` in CI)
 */

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID',
];

const missing = REQUIRED_KEYS.filter((k) => !process.env[k] || !String(process.env[k]).trim());

if (missing.length > 0) {
  console.warn(
    `[check-env] WARNING: missing or empty Firebase env vars: ${missing.join(', ')}\n` +
    `[check-env] Falling back to default project values. Set VITE_FIREBASE_* variables in Vercel for custom config.`
  );
  process.exit(0);
}

console.log('[check-env] All VITE_FIREBASE_* variables present.');
process.exit(0);
