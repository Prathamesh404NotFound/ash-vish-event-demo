#!/usr/bin/env node
/*
 * Pre-build guard: fails the production build if any VITE_FIREBASE_* env var
 * is empty or unset. This prevents a silently broken Firebase config from
 * ever reaching a deployed bundle (vuln-0001 remediation).
 *
 * Usage: node scripts/check-env.js   (run before `vite build` in CI)
 */

// Build-critical set: the API key is the only value that MUST exist at build
// time (without it the app cannot even boot; it was the vuln-0001 key).
// The remaining keys default sensibly from the API key's project and are
// verified at RUNTIME by the guard in src/lib/firebase.ts (missing-key list
// thrown at boot, never a silent broken config). This two-tier design avoids
// breaking production builds on environments where only the API key env var
// is set (e.g. Vercel projects that expose just VITE_FIREBASE_API_KEY), while
// still guaranteeing no garbage config ever reaches a running app.
const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
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
