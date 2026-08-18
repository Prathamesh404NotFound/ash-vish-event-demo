#!/usr/bin/env bash
# RBAC isolation test (Item 4).
# Verifies that:
#   1. An unauthenticated request to an admin endpoint is rejected (403/401).
#   2. A request carrying a role claim of counter_staff to an event_manager-only
#      endpoint is rejected with 403 by the server-side RBAC guard.
#
# The server never trusts the client-provided role. verifyRole() validates the
# Firebase ID token first; only after token verification does it look up the
# role from Realtime Database (staff/$uid then users/$uid). A forged token is
# rejected at the token-verification stage; a real token with a low role is
# rejected by the role check. Both paths return 403.
set -u
BASE="${TEST_BASE_URL:-http://localhost:3000}"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
pass=0; fail=0

check() {
  local label="$1"; local code="$2"; local expect="$3"
  if [[ "$code" == "$expect" ]]; then
    echo -e "${GREEN}PASS${NC} $label (HTTP $code)"
    pass=$((pass+1))
  else
    echo -e "${RED}FAIL${NC} $label (HTTP $code, expected $expect)"
    fail=$((fail+1))
  fi
}

# 1. No token at all -> guarded admin endpoint rejects
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/coupons/create" \
  -H "Content-Type: application/json" -d '{"code":"RBAC_T","type":"percentage","value":10}')
check "Admin endpoint (coupons/create) without token" "$CODE" "403"

# 2. Forged Bearer token (invalid Firebase ID token) -> token verification fails -> 403
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/coupons/create" \
  -H "Authorization: Bearer eyJhbGciOiJub25lIn0.eyJmYWtlIjoidG9rZW4ifQ." \
  -H "Content-Type: application/json" -d '{"code":"RBAC_T","type":"percentage","value":10}')
check "Admin endpoint with forged token" "$CODE" "403"

# 3. Legacy demo header X-User-Role=counter_staff (non-production override path)
#    attempting an event_manager-only mutation -> must be rejected 403, never honored
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/events" \
  -H "X-User-Role: counter_staff" \
  -H "Content-Type: application/json" \
  -d '{"title":"RBAC Test","venue":"Demo Hall","date":"2099-01-01","time":"08:00 PM"}')
check "Event create (event_manager-only) with X-User-Role header only" "$CODE" "403"

echo
if [[ "$fail" -eq 0 ]]; then
  echo "RBAC isolation tests PASSED ($pass/$(($pass+$fail)))"
  exit 0
else
  echo "RBAC isolation tests FAILED ($fail failure(s))"
  exit 1
fi
