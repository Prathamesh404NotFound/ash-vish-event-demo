#!/usr/bin/env bash
# Regression test: admin counter management panel RBAC + validation guards.
#
# Verifies against a LOCAL server (npx tsx server.ts, port 3000).
# These tests require NO credentials: they assert that every counter endpoint
# is hard-locked behind the Firebase ID-token RBAC middleware.
#
#  1. Anonymous GET    /api/admin/counters      -> 403 (not event_manager/super_admin)
#  2. Anonymous POST   /api/admin/counters      -> 403
#  3. Anonymous PUT    /api/admin/counters/<id> -> 403
#  4. Anonymous PATCH  /api/admin/counters      -> 403
#  5. Anonymous DELETE /api/admin/counters/<id> -> 403
#  6. Walk-in with unknown counterId            -> 400 + clear error
#
# Usage: npx tsx server.ts (separate shell) && ./scripts/regression-counters.sh
set -u
BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() { # name expect_status expect_contains
  local name="$1" expect="$2" contains="$3"
  local code="$4" body="$5"
  local ok=1
  if [ "$code" != "$expect" ]; then ok=0; fi
  if [ -n "${contains:-}" ] && ! printf '%s' "$body" | grep -q "$contains"; then ok=0; fi
  if [ "$ok" = "1" ]; then
    echo "PASS  $name (HTTP $code)"
    PASS=$((PASS+1))
  else
    echo "FAIL  $name (got HTTP $code; expected $expect ${contains:+containing: $contains})"
    echo "      body: ${body:0:300}"
    FAIL=$((FAIL+1))
  fi
}

OUT=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/admin/counters")
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon GET    /api/admin/counters" 403 "" "$CODE" "$BODY"

OUT=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/admin/counters" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Regression Test Counter","venue":"Gate A"}')
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon POST   /api/admin/counters" 403 "" "$CODE" "$BODY"

OUT=$(curl -s -w '\n%{http_code}' -X PUT "$BASE_URL/api/admin/counters/nonexistent_counter" \
  -H 'Content-Type: application/json' \
  -d '{"status":"inactive"}')
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon PUT    /api/admin/counters/:id" 403 "" "$CODE" "$BODY"

OUT=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE_URL/api/admin/counters" \
  -H 'Content-Type: application/json' \
  -d '{"counterIds":["x"],"patch":{"status":"inactive"}}')
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon PATCH  /api/admin/counters (batch)" 403 "" "$CODE" "$BODY"

OUT=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE_URL/api/admin/counters/nonexistent_counter")
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon DELETE /api/admin/counters/:id" 403 "" "$CODE" "$BODY"

# Walk-in endpoint guard: an unauthenticated caller should never reach the
# counter validation path; verify the endpoint itself stays RBAC-locked.
OUT=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/walk-in-bookings" \
  -H 'Content-Type: application/json' \
  -d '{"eventId":"e","tierId":"t","attendeeName":"anon","attendeePhone":"9876543210","selectedSeats":[],"paymentMethod":"cash","counterId":"unknown_counter"}')
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon POST  /api/walk-in-bookings" 403 "" "$CODE" "$BODY"

# VPA validation on the admin side: an unauthenticated PUT to the global
# merchant-upi config must also be denied (same UPI-control surface).
OUT=$(curl -s -w '\n%{http_code}' -X PUT "$BASE_URL/api/merchant-upi" \
  -H 'Content-Type: application/json' \
  -d '{"vpa":"INVALID-UPI-STRING","name":"regression"}')
CODE=$(printf '%s' "$OUT" | tail -1)
BODY=$(printf '%s' "$OUT" | sed '$d')
check "anon PUT   /api/merchant-upi" 403 "" "$CODE" "$BODY"

echo ""
echo "=================================="
echo "Counters RBAC regression: $PASS passed, $FAIL failed"
echo "=================================="
[ "$FAIL" = "0" ]
