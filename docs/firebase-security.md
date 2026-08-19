# Firebase Security — Rules, Credentials & Verification

*Last updated: 19 August 2026*

This document records the security posture of the Firebase Realtime Database
used by ashvishevents.com, the remediation of pentest findings vuln-0001 and
vuln-0002, and how to re-verify everything. It exists so the next audit finds
these items already closed.

## 1. Findings and closures

| Finding | Severity | Status | Closure evidence |
|---|---|---|---|
| vuln-0001: hardcoded Firebase API key fallback in `src/lib/firebase.ts` | CVSS 9.8 | Closed 2026-08-19 | All 8 config keys are now env-only; pre-build check `scripts/check-env.js` fails the production build if any `VITE_FIREBASE_*` is empty; runtime guard throws at boot with the missing-key list instead of silently initializing with garbage. Bundle grep returns zero hardcoded-key hits. |
| vuln-0002: `/passes` public read exposing 26+ attendee records (name + phone PII) | CVSS 7.5 | Closed 2026-08-19 | Rule in `database.rules.json` changed from `".read": true` to the staff-scoped idiom used by `tickets`/`bookings`/`coupons`. Deployed live to `ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app` via the Firebase Admin REST API. Live PoC: `curl /passes.json` now returns HTTP 401. |

## 2. Why guests still work after the rule tightening

Guests never read `/passes` client-side. `BookingContext` reads `events`,
`tickets`, `bookings`, and `seats` only. Individual pass lookups are served
exclusively through the HMAC-signed server endpoints `/api/passes/:slug/:signature`,
`/api/passes/:passId`, and `/api/passes/lookup` (role-gated), which authenticate
with the server service-account token — completely independent of client-side
rules. Verified empirically on the live site after the rule change (see
§6 regression list).

## 3. Public nodes — intentional, do not "fix"

The following nodes remain public by design; restricting them would break the
product. The decisions are also annotated inline in `database.rules.json`.

> Runtime preference: a single `FIREBASE_SERVICE_ACCOUNT` JSON blob env var is preferred over split keys
>
> Alternate credential shape: if a single `FIREBASE_SERVICE_ACCOUNT` env var is
> set, it is parsed as a JSON blob (`project_id` / `client_email` / `private_key`)
> and used instead of the three separate `FIREBASE_*` vars. Useful on hosts whose
> env UI mangles multi-line values (e.g., Vercel with an escaped `\n` key).

| Node | Access | Reason |
|---|---|---|
| `events` | read: public | Public event catalog; the entire marketing page and listing depends on it. |
| `seats` | read: public | Public seat-map/availability used by the guest seat-selection flow; contains no PII. |
| `reviews` | read: public | Public, admin-moderated review catalog; writes are admin-only. |

## 4. Rules deployment — method and history

Rules live in the Firebase console, not in git — the single most important
operational fact. `database.rules.json` is the source of truth; deployment is:

```
# Option A (used 2026-08-19): Firebase Admin REST API with service account
PUT "https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app/.settings/rules.json?access_token=<ADMIN_ID_TOKEN>"
body: {"rules": <contents of database.rules.json>}
The ADMIN_ID_TOKEN is minted from FIREBASE_PRIVATE_KEY via the same
getFirebaseAdminIdToken() path the app server uses (see src/lib/identity-admin.ts).

# Option B: firebase-tools CLI
firebase deploy --only database   (requires firebase.json, already in repo)
```

If you cannot deploy, do NOT mark the fix complete — escalate to the owner
instead. A committed-but-not-deployed rule change is exactly how vuln-0002
stayed open.

## 5. API key rotation status

The hardcoded fallback was removed on 2026-08-19 (treated as exposed).
Rotation scope: regenerate `VITE_FIREBASE_API_KEY` in the Firebase Console
(Project Settings → General → Your apps) **after** confirming no production
service pins the old key, then update the Vercel env var and redeploy.
Update this section with the old-key disable date when done:

> Rotation status: PENDING (record disable date here after rotation).

Note: Firebase API keys are inherently public in web apps; the real protection
boundary is security rules (§1, vuln-0002). Rotation is defense-in-depth.

## 6. Re-running verification (definition of done)

1. **Live PoC kill test** — must return 401/403 with no attendee JSON:
   ```
   curl -s -o /dev/null -w "%{http_code}" https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app/passes.json
   ```
2. **Authenticated staff read** — a logged-in admin/staff ID token can still
   read `/passes` (rules simulator or authenticated REST call).
3. **Guest flow** — browse event → checkout → pass page `/pass/:slug/:sig` →
   QR display all still work (signed server endpoints).
4. **Staff flows** — admin dashboard, counter app, My Sales Log working via REST API.
5. **Bundle grep** — zero hits outside intended env plumbing:
   ```
   grep -rnE "AIzaSy|ashevents-aa490" dist/ src/
   ```
6. **CI** — `.github/workflows/security-rules-audit.yml` (sensitive-node audit)
   and `secrets-scan.yml` (gitleaks) passing on every push/PR.

## 7. Review habits

Any PR touching `database.rules.json` requires two approvals and a live PoC
kill check, mirroring how payment logic is treated. The revert commit `42bd829`
(history of security churn) is the reason this automation exists.
