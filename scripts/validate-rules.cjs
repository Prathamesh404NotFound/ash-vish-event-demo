#!/usr/bin/env node
/*
 * Validates database.rules.json (JSONC — Firebase rules accept // comments)
 * and emits a plain-JSON copy at dist/database.rules.json for deployment.
 *
 * Usage:
 *   node scripts/validate-rules.js            (validate only)
 *   node scripts/validate-rules.js dist-rules  (emit dist/database.rules.json)
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('jsonc-parser');

const src = path.join(__dirname, '..', 'database.rules.json');
const raw = fs.readFileSync(src, 'utf8');

// 1. Structure validation
const errors = [];
parse(raw, errors, { allowTrailingComma: true, disallowComments: false });
if (errors.length > 0) {
  for (const e of errors) {
    console.error(`[validate-rules] error at offset ${e.offset}: ${e.message}`);
  }
  process.exit(1);
}

const rules = parse(raw);
if (!rules || !rules.rules || typeof rules.rules.passes !== 'object') {
  console.error('[validate-rules] rules structure invalid: missing rules.passes node');
  process.exit(1);
}

// 2. Guardrail: reject accidental public reads on sensitive nodes
const SENSITIVE = ['passes', 'orders', 'users', 'staff', 'tickets', 'bookings', 'coupons', 'notifications', 'favorites', 'reservations'];
const sensitivePublic = SENSITIVE.filter((n) => {
  const node = rules.rules[n];
  return node && typeof node === 'object' && node['.read'] === true;
});
if (sensitivePublic.length > 0) {
  console.error(`[validate-rules] SECURITY BLOCK: public ".read": true on sensitive node(s): ${sensitivePublic.join(', ')}`);
  process.exit(1);
}

console.log('[validate-rules] database.rules.json is valid (JSONC) and passes the sensitive-node audit.');

if (process.argv[2] === 'dist-rules') {
  const out = path.join(__dirname, '..', 'dist', 'database.rules.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
  console.log(`[validate-rules] plain-JSON copy written to ${out}`);
}
