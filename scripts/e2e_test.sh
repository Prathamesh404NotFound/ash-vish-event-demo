#!/usr/bin/env bash
# Security-aware reservation + Razorpay smoke test against the local dev server.
set -u

BASE="http://localhost:3000"
PASS=0; FAIL=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [ -n "$actual" ] && echo "$actual" | grep -qi "$expected"; then
    PASS=$((PASS+1)); echo "PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $name (expected containing '$expected', got '$actual')"
  fi
}
json_field() {
  local field="$1"
  python3 -c "import sys,json; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null || true
}

EV="evt_001"
RAND=$(od -An -tx1 -N4 /dev/urandom | tr -d ' ')
S1="sess-e2e-a-$RAND"; S2="sess-e2e-b-$RAND"; S3="sess-e2e-c-$RAND"; S4="sess-e2e-d-$RAND"
SEAT1="R1-C1"; SEAT2="R1-C2"; SEAT3="R2-C1"; SEAT4="R3-C1"

echo "=== 0. Cleanup and reset test inventory ==="
npx tsx scripts/cleanup_reservations.ts "$EV" >/dev/null 2>&1
for S in "$SEAT1" "$SEAT2" "$SEAT3" "$SEAT4"; do
  npx tsx scripts/reset_seat.ts "$EV" "$S" >/dev/null 2>&1
done
npx tsx scripts/restore_inventory_after_tests.ts "$EV" >/dev/null 2>&1
sleep 2

echo "=== 1. Session A claims SEAT1 ==="
R1=$(curl -sS -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT1\"]}")
R1_ID=$(echo "$R1" | json_field reservationId)
check "A creates reservation" "active" "$R1"

echo "=== 2. Session B cannot claim A's seat ==="
B_CONFLICT=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S2" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT1\"]}")
check "same-seat conflict" "409" "$B_CONFLICT"

echo "=== 3. Session B claims SEAT2 (second anonymous hold) ==="
R2=$(curl -sS -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S2" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT2\"]}")
R2_ID=$(echo "$R2" | json_field reservationId)
check "B creates second active hold" "active" "$R2"

echo "=== 4. Third anonymous hold from this source is capped ==="
CAP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S3" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT3\"]}")
check "per-IP active hold cap" "429" "$CAP_CODE"

echo "=== 5. Release B, then allow C to claim SEAT3 ==="
REL2=$(curl -sS -X DELETE "$BASE/api/reservations/$R2_ID" -H "X-Session-Id: $S2")
check "B release succeeds" "success" "$REL2"
R3=$(curl -sS -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S3" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT3\"]}")
R3_ID=$(echo "$R3" | json_field reservationId)
check "hold slot returns after release" "active" "$R3"

echo "=== 6. Quote and attendee data remain server-authoritative ==="
Q1=$(curl -sS -X POST "$BASE/api/reservations/$R1_ID/quote" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" -d '{}')
check "quote returns server totals" "totalMinor" "$Q1"
AD=$(curl -sS -X POST "$BASE/api/reservations/$R1_ID/attendee" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d '{"name":"E2E Tester","email":"e2e@example.com","phone":"9000011122"}')
check "attendee data saved" "e2e@example.com" "$AD"

echo "=== 7. Direct purchase is permanently retired ==="
PUR_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/purchase" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"reservationId\":\"$R1_ID\"}")
check "direct-purchase bypass retired" "410" "$PUR_CODE"

echo "=== 8. Ticket and scanner APIs reject anonymous callers ==="
TOKEN_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tickets/generate-token" -H 'Content-Type: application/json' \
  -d '{"ticketId":"tkt_demo","eventId":"evt_001","seatId":"R1-C1"}')
check "unauthenticated token mint denied" "401" "$TOKEN_CODE"
REDEEM_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tickets/verify-and-redeem" -H 'Content-Type: application/json' \
  -d '{"token":"ASH_PASS_v1.fake.hmac_sec_2026"}')
check "unauthenticated scanner redemption denied" "403" "$REDEEM_CODE"

echo "=== 9. Razorpay creates an order only for an active reservation ==="
REL3=$(curl -sS -X DELETE "$BASE/api/reservations/$R3_ID" -H "X-Session-Id: $S3")
check "C release succeeds" "success" "$REL3"
R4=$(curl -sS -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S4" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT4\"]}")
R4_ID=$(echo "$R4" | json_field reservationId)
check "Razorpay reservation created" "active" "$R4"
AD4=$(curl -sS -X POST "$BASE/api/reservations/$R4_ID/attendee" -H 'Content-Type: application/json' -H "X-Session-Id: $S4" \
  -d '{"name":"E2E Razorpay","email":"rzp@example.com","phone":"9000011133"}')
ORDER=$(curl -sS -X POST "$BASE/api/razorpay/create-order" -H 'Content-Type: application/json' -H "X-Session-Id: $S4" \
  -d "{\"reservationId\":\"$R4_ID\",\"couponCode\":null}")
check "Razorpay order created" '"success":true' "$ORDER"
check "Razorpay order has provider id" "order_" "$ORDER"
ORD_ID=$(echo "$ORDER" | json_field orderId)
RZP_ID=$(echo "$ORDER" | json_field rzpOrderId)

echo "=== 10. Razorpay verification rejects an unpaid or stolen order ==="
UNPAID_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "X-Session-Id: $S4" \
  -d "{\"orderId\":\"$ORD_ID\",\"paymentId\":\"$RZP_ID\"}")
check "unpaid order rejected" "400" "$UNPAID_CODE"
STOLEN_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "X-Session-Id: sess-e2e-other-$RAND" \
  -d "{\"orderId\":\"$ORD_ID\",\"paymentId\":\"pay_fake123456789\"}")
check "cross-session order verification denied" "403" "$STOLEN_CODE"

echo "=== 11. Honest optional-service and health reporting ==="
EMAIL_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tickets/send-email" -H 'Content-Type: application/json' -d '{}')
check "unconfigured email reports unavailable" "501" "$EMAIL_CODE"
HEALTH=$(curl -sS "$BASE/api/health")
check "health reports Razorpay test mode" '"mode":"test"' "$HEALTH"

echo "=== 12. Cleanup active test holds ==="
for item in "$R1_ID:$S1" "$R4_ID:$S4"; do
  ID="${item%%:*}"; SESSION="${item#*:}"
  [ -n "$ID" ] && curl -sS -X DELETE "$BASE/api/reservations/$ID" -H "X-Session-Id: $SESSION" >/dev/null || true
done

echo
echo "RESULTS: PASS=$PASS FAIL=$FAIL"
exit $FAIL
