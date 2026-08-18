#!/bin/bash
# End-to-end smoke test for Prompt B admin endpoints against local server.
# Uses a fake admin token (token replacement rewrites to real creds where applicable;
# locally with placeholder env, we mint a fake ID token is not possible, so we test
# both unauthorized paths (expect 403/401) and unauthenticated responses.)
set -u
BASE="${TEST_BASE_URL:-http://localhost:3000}"
FAKE='eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vdGVzdCIsInN1YiI6InRlc3RfdWlkIn0.placeholder'
PASS=0; FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $label (expected $expected)"
    PASS=$((PASS+1))
  else
    echo "FAIL: $label (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

# 1. Public events still reachable
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/events")
check "GET /api/events public" "200" "$C"

# 2. Admin endpoints reject unauthenticated
for ep in "GET /api/admin/orders" "GET /api/admin/reports" "GET /api/admin/events"; do
  m="${ep%% *}"; p="${ep#* }"
  C=$(curl -s -o /dev/null -w "%{http_code}" -X "$m" "$BASE$p")
  check "$ep rejects anonymous" "403" "$C"
done

# 3. Fake (but structurally valid-ish) token as a non-admin actor: 403 not 200
fake_req() {
  local m="$1" p="$2"
  curl -s -o /dev/null -w "%{http_code}" -X "$m" "$BASE$p" -H "Authorization: Bearer $FAKE"
}
check "GET /api/admin/orders rejects fake admin token" "403" "$(fake_req GET /api/admin/orders)"
check "GET /api/admin/reports rejects fake admin token" "403" "$(fake_req GET /api/admin/reports)"
check "POST /api/admin/orders rejects fake admin token" "403" "$(fake_req POST /api/admin/orders)"
check "POST /api/admin/events/apply-lifecycle rejects fake admin token" "403" "$(fake_req POST /api/admin/events/apply-lifecycle)"
check "GET /api/admin/notify/count-holders rejects fake admin token" "403" "$(fake_req GET '/api/admin/notify/count-holders?eventId=e1')"

# 4. Create manual order rejects invalid body without auth (400/403 path validation first)
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $FAKE" -d '{"eventId":"x"}')
check "POST /api/admin/orders rejects fake token" "403" "$C"

echo ""
echo "SUMMARY: $PASS passed, $FAIL failed"
exit $((FAIL == 0 ? 0 : 1))
