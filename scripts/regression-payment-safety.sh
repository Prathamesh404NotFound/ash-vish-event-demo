#!/usr/bin/env bash
# Regression test: payment-safety guarantees (409 root-cause fix).
#
# Verifies against a LOCAL server (npx tsx server.ts, port 3000):
#  1. Hold-keepalive endpoint is RBAC-guarded (anonymous gets 403/401).
#  2. Hold-keepalive rejects unknown reservations with 404.
#  3. verify-payment is RBAC-guarded for unknown orders (403/404).
#  4. verify-payment is idempotent: fulfilled order returns success on repeat.
#  5. verify-payment never 409s an idempotent duplicate (same payment id).
#  6. verify-payment returns the support-contact message when the gateway
#     cannot verify a payment.
#
# Usage: FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... \
#        FIREBASE_PRIVATE_KEY='...' VITE_FIREBASE_API_KEY=... \
#        npm run dev (separate shell) && ./scripts/regression-payment-safety.sh
set -u
BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0; SKIP=0
check() { # name expect_status expect_contains
  local name="$1" expect="$2" contains="$3"
  local code="$4" body="$5"
  local ok=1
  if [ "$code" != "$expect" ]; then ok=0; fi
  if [ -n "$contains" ] && ! printf '%s' "$body" | grep -q "$contains"; then ok=0; fi
  if [ "$ok" = "1" ]; then
    echo "PASS  $name (HTTP $code)"
    PASS=$((PASS+1))
  else
    echo "FAIL  $name (got HTTP $code; expected $expect" "${contains:+containing: $contains})"
    echo "      body: ${body:0:300}"
    FAIL=$((FAIL+1))
  fi
}

ADMIN_TOKEN="$(node -e "
const { getFirebaseAdminIdToken } = require('./dist/lib/identity-admin.js') || {};
" 2>/dev/null || echo "")"

if [ -z "$ADMIN_TOKEN" ]; then
  # Try tsx directly with the identity-admin module (dev-time).
  ADMIN_TOKEN="$(npx --yes tsx -e "
    import { getFirebaseAdminIdToken } from './src/lib/identity-admin';
    console.log(await getFirebaseAdminIdToken());
  " 2>/dev/null || echo "")"
fi
ADMIN_HEADER="Authorization: Bearer $ADMIN_TOKEN"
TOKEN_MISSING=0
if [ -z "$ADMIN_TOKEN" ] || printf '%s' "$ADMIN_TOKEN" | grep -qi "error"; then
  TOKEN_MISSING=1
  echo "NOTE  admin token unavailable — authed-path tests will be SKIPPED (set service-account env vars)."
fi

# ---------------------------------------------------------------
# 1. Keepalive endpoint RBAC guard (anonymous)
R=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/reservations/fake-reservation-id/extend" -H 'Content-Type: application/json' -d '{"keepalive":true}')
CODE="${R##*$'\n'}"; BODY="${R%$'\n'*}"
check "Keepalive guard: anonymous denied" "403" "" "$CODE" "$BODY" || check "Keepalive guard: anonymous denied (401)" "401" "" "$CODE" "$BODY"

# 2. Keepalive with unknown reservation id (authed)
if [ "$TOKEN_MISSING" = "0" ]; then
  R=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/reservations/definitely-not-a-real-reservation-id-xyz/extend" -H 'Content-Type: application/json' -H "$ADMIN_HEADER" -d '{"keepalive":true}')
  CODE="${R##*$'\n'}"; BODY="${R%$'\n'*}"
  check "Keepalive rejects unknown reservation" "404" "Reservation not found" "$CODE" "$BODY"

  # 3. verify-payment anonymous/unknown order
  R=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "$ADMIN_HEADER" -d '{"orderId":"fake-order-id-xyz","paymentId":"pay_fake"}')
  CODE="${R##*$'\n'}"; BODY="${R%$'\n'*}"
  check "verify-payment: unknown order returns 404 (never a crash)" "404" "Order not found" "$CODE" "$BODY"

  # 4. Idempotency: fulfill a pending order, then re-submit the SAME payment
  #    id — the duplicate must return success, never 409.
  #    Create a pending order via the admin endpoint.
  EVENT_ID=$(curl -s "$BASE_URL/api/events" -H "$ADMIN_HEADER" | python3 -c "import sys,json; d=json.load(sys.stdin); ids=[k for k,v in d.items() if isinstance(v,dict) and v.get('status') in ('published','sold_out')]; print(ids[0] if ids else '')" 2>/dev/null)
  if [ -n "$EVENT_ID" ]; then
    PENDING=$(curl -s -X POST "$BASE_URL/api/bookings/walk-in" -H 'Content-Type: application/json' -H "$ADMIN_HEADER" -d "{
      \"eventId\": \"$EVENT_ID\",
      \"customerDetails\": { \"name\": \"regression\", \"phone\": \"9000000000\", \"email\": \"regression@example.com\" },
      \"items\": [{ \"quantity\": 1, \"priceMinor\": 10000 }],
      \"paymentMethod\": \"razorpay\",
      \"razorpayOrderId\": \"order_fake_regression_$(date +%s)\",
      \"razorpayPaymentId\": \"pay_regression_$(date +%s)\"
    }" 2>/dev/null)
    ORDER_ID=$(printf '%s' "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin).get('orderId','') or json.load(sys.stdin).get('booking',{}).get('orderId',''))" 2>/dev/null || echo "")
    if [ -n "$ORDER_ID" ]; then
      FIRST=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "$ADMIN_HEADER" -d "{\"orderId\":\"$ORDER_ID\",\"paymentId\":\"pay_regression_$(date +%s)\"}")
      FCODE="${FIRST##*$'\n'}"; FBODY="${FIRST%$'\n'*}"
      # Second call with the same payment id must be idempotent success.
      DUP=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "$ADMIN_HEADER" -d "{\"orderId\":\"$ORDER_ID\",\"paymentId\":\"pay_regression_$(date +%s)\"}")
      DCODE="${DUP##*$'\n'}"; DBODY="${DUP%$'\n'*}"
      if [ "$DCODE" = "200" ] && printf '%s' "$DBODY" | grep -q "alreadyProcessed"; then
        echo "PASS  Idempotent duplicate verify returns success ($DCODE)"
        PASS=$((PASS+1))
      else
        echo "FAIL  Idempotent duplicate verify (got HTTP $DCODE; expected 200 + alreadyProcessed)"
        echo "      body: ${DBODY:0:300}"
        FAIL=$((FAIL+1))
      fi
    else
      echo "SKIP  Could not create pending order (walk-in endpoint shape changed)"
      SKIP=$((SKIP+1))
    fi
  else
    echo "SKIP  No published event in database"
    SKIP=$((SKIP+1))
  fi

  # 5. Gateway-verification failure message (real payment id, no matching
  #    gateway record → the lib returns an error; expect the contact message).
  R=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "$ADMIN_HEADER" -d "{\"orderId\":\"$ORDER_ID\",\"paymentId\":\"pay_nonexistent_$(date +%s)\"}")
  CODE="${R##*$'\n'}"; BODY="${R%$'\n'*}"
  if [ "$CODE" = "400" ] && printf '%s' "$BODY" | grep -qi "contact support"; then
    echo "PASS  Gateway failure returns support-contact message (HTTP $CODE)"
    PASS=$((PASS+1))
  else
    echo "FAIL  Gateway failure message (got HTTP $CODE; expected 400 + 'contact support')"
    echo "      body: ${BODY:0:300}"
    FAIL=$((FAIL+1))
  fi
else
  echo "SKIP  verify-payment authed tests (no admin token)"
  SKIP=$((SKIP+3))
fi

echo ""
echo "========================================="
echo "  Regression: $PASS passed / $FAIL failed / $SKIP skipped"
echo "========================================="
[ "$FAIL" -eq 0 ]
