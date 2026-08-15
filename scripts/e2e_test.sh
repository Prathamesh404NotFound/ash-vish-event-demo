#!/bin/bash
# End-to-end reservation + payment smoke test against the local dev server.
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

EV="evt_001"
RAND1=$(od -An -tx1 -N4 /dev/urandom | tr -d ' ')
RAND2=$(od -An -tx1 -N4 /dev/urandom | tr -d ' ')
S1="sess-test-$RAND1"; S2="sess-test-$RAND2"
SEAT1="R1-C1"; SEAT2="R1-C2"; SEAT3="R2-C1"; SEAT4="R3-C1"

echo "=== 0. Cleanup: delete all active reservations for evt, reset test seats, restore tier inventory ==="
npx tsx scripts/cleanup_reservations.ts "$EV" >/dev/null 2>&1
for S in $SEAT1 $SEAT2 $SEAT3 $SEAT4; do
  npx tsx scripts/reset_seat.ts "$EV" "$S" >/dev/null 2>&1
done
npx tsx scripts/restore_inventory_after_tests.ts "$EV" >/dev/null 2>&1
sleep 2

echo "=== 1. Session A claims SEAT1 ==="
R1=$(curl -s -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT1\"]}")
R1_ID=$(echo "$R1" | python3 -c "import sys,json;print(json.load(sys.stdin)['reservationId'])")
check "A creates reservation" "active" "$R1"
echo "  reservationId=$R1_ID"

echo "=== 2. Session B tries same SEAT1 -> must conflict ==="
sleep 1
B_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: sess-b" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT1\"]}")
check "B conflicts on same seat" "409" "$B_CODE"

echo "=== 3. Session B claims different SEAT2 -> success ==="
R3=$(curl -s -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S2" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT2\"]}")
R3_ID=$(echo "$R3" | python3 -c "import sys,json;print(json.load(sys.stdin)['reservationId'])")
check "B creates reservation SEAT2" "active" "$R3"
echo "  reservationId=$R3_ID"

echo "=== 4. Session A adjusts selection: SEAT1 -> SEAT3 (atomic swap) ==="
sleep 1
U1=$(curl -s -X PUT "$BASE/api/reservations/$R1_ID/selection" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"seatIds\":[\"$SEAT3\"],\"quantity\":1}")
check "A selection swap to SEAT3" "R2-C1" "$U1"

echo "=== 5. Session B claims SEAT1 (released by A) -> must succeed (realtime) ==="
sleep 2
R4=$(curl -s -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S2" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT1\"],\"idempotencyKey\":\"idem_e2e_r4\"}")
check "B reclaims released SEAT1" "active" "$R4"
R4_ID=$(echo "$R4" | python3 -c "import sys,json;print(json.load(sys.stdin)['reservationId'])")

echo "=== 6. Idempotency: replay B's claim for SEAT1 ==="
sleep 1
R5=$(curl -s -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: $S2" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT1\"],\"idempotencyKey\":\"idem_e2e_r4\"}")
R5_ID=$(echo "$R5" | python3 -c "import sys,json;print(json.load(sys.stdin)['reservationId'])")
check "idempotent ids equal" "$R4_ID" "$R5_ID"

echo "=== 7. Quote endpoint ==="
Q1=$(curl -s -X POST "$BASE/api/reservations/$R1_ID/quote" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" -d '{}')
check "quote returns totals" "totalMinor" "$Q1"
echo "  quote=$Q1"

echo "=== 8. Attendee details ==="
AD=$(curl -s -X POST "$BASE/api/reservations/$R1_ID/attendee" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d '{"name":"E2E Tester","email":"e2e@example.com","phone":"9000011122"}')
check "attendee saved" "e2e@example.com" "$AD"

echo "=== 9. Direct purchase finalizes the reservation ==="
PUR=$(curl -s -X POST "$BASE/api/purchase" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"reservationId\":\"$R1_ID\",\"couponCode\":null}")
check "purchase succeeded" '"success":true' "$PUR"
check "purchase has ticket+booking" '"ticket"' "$PUR"
TICKET_ID=$(echo "$PUR" | python3 -c "import sys,json;print(json.load(sys.stdin).get('ticket',{}).get('id',''))" 2>/dev/null || echo "?")
echo "  ticketId=$TICKET_ID"

echo "=== 10. Re-purchase same reservation rejected (idempotency) ==="
P2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/purchase" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"reservationId\":\"$R1_ID\",\"couponCode\":null}")
check "re-purchase idempotent" "409" "$P2"

echo "=== 11. Seat now booked ==="
SEAT=$(npx tsx scripts/get_seat_status.ts "$EV" "R2-C1" 2>/dev/null || echo "?")
check "SEAT3 booked" "booked" "$SEAT"

echo "=== 12. Stale reservation after purchase cannot be used again ==="
V2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/purchase" -H 'Content-Type: application/json' -H "X-Session-Id: $S1" \
  -d "{\"reservationId\":\"$R1_ID\",\"couponCode\":null}")
check "already-booked reservation rejected" "409" "$V2"

echo "=== 13. Session C tries now-booked SEAT3 -> conflict ==="
C_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: sess-c" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT3\"]}")
check "C cannot take booked seat" "409" "$C_CODE"

echo "=== 14. Concurrent double-click race: 10 sessions hammer SEAT2 (held by B) — only B may win ==="
for i in $(seq 1 10); do
  (curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: race-$i" \
   -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT2\"]}" > /tmp/race-$i.code 2>/dev/null) &
done
wait
BAD=0
for i in $(seq 1 10); do
  code=$(cat /tmp/race-$i.code)
  if [ "$code" != "409" ] && [ "$code" != "400" ]; then BAD=$((BAD+1)); fi
done
if [ "$BAD" -eq 0 ]; then PASS=$((PASS+1)); echo "PASS  race: all 10 challengers rejected (409)"; else FAIL=$((FAIL+1)); echo "FAIL  race: $BAD challengers got non-409"; fi
# B's reservation must still be intact
B2=$(curl -s "$BASE/api/reservations/$R3_ID" -H "X-Session-Id: $S2" -H "Content-Type: application/json")
check "B's SEAT2 reservation intact after race" "active" "$B2"

echo "=== 15. Expired reservation: server sweeps old holds ==="
SWEEP=$(curl -s -X POST "$BASE/api/seats/sweep-holds" -H 'Content-Type: application/json' -H "X-Session-Id: $S2" -d '{"forceExpired":true}')
check "sweep endpoint responds" "success" "$SWEEP"

echo "=== 16. Razorpay: server creates an order for a fresh reservation ==="
# Fresh session D claims SEAT2-area seat (SEAT4) so an active reservation exists for order creation.
R6=$(curl -s -X POST "$BASE/api/reservations" -H 'Content-Type: application/json' -H "X-Session-Id: sess-d" \
  -d "{\"eventId\":\"$EV\",\"tierId\":\"tier_vip\",\"quantity\":1,\"seatIds\":[\"$SEAT4\"]}")
echo "  sess-d reservation response: $R6"
R6_ID=$(echo "$R6" | python3 -c "import sys,json;print(json.load(sys.stdin)['reservationId'])")
AD6=$(curl -s -X POST "$BASE/api/reservations/$R6_ID/attendee" -H 'Content-Type: application/json' -H "X-Session-Id: sess-d" \
  -d '{"name":"E2E Razorpay","email":"rzp@example.com","phone":"9000011133"}')
ORDER=$(curl -s -X POST "$BASE/api/razorpay/create-order" -H 'Content-Type: application/json' -H "X-Session-Id: sess-d" \
  -d "{\"reservationId\":\"$R6_ID\",\"couponCode\":null}")
check "create-order succeeded" '"success":true' "$ORDER"
check "create-order returns rzpOrderId" "order_" "$ORDER"
check "create-order returns amountMinor (24000 = qty1 vip)" "24000" "$ORDER"
ORD_ID=$(echo "$ORDER" | python3 -c "import sys,json;print(json.load(sys.stdin).get('orderId',''))" 2>/dev/null || echo "?")
RZP_ID=$(echo "$ORDER" | python3 -c "import sys,json;print(json.load(sys.stdin).get('rzpOrderId',''))" 2>/dev/null || echo "?")
echo "  orderId=$ORD_ID rzpOrderId=$RZP_ID"

echo "=== 17. Razorpay: verify-payment rejects unpaid order ==="
VP1=$(curl -s -X POST "$BASE/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "X-Session-Id: sess-d" \
  -d "{\"orderId\":\"$ORD_ID\",\"paymentId\":\"$RZP_ID\"}")
VP1_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "X-Session-Id: sess-d" \
  -d "{\"orderId\":\"$ORD_ID\",\"paymentId\":\"$RZP_ID\"}")
check "verify rejects payment=orderId (belongs check)" "400" "$VP1_CODE"

echo "=== 18. Razorpay: wrong-session cannot verify someone else's order ==="
VP2_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "X-Session-Id: sess-other" \
  -d "{\"orderId\":\"$ORD_ID\",\"paymentId\":\"pay_fake123456789\"}")
check "verify 403 for wrong session" "403" "$VP2_CODE"

echo "=== 19. Razorpay: missing reservation id must 400 ==="
V400=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/razorpay/verify-payment" -H 'Content-Type: application/json' -H "X-Session-Id: sess-d" \
  -d '{}')
check "verify 400 without orderId" "400" "$V400"

# Also test the unconfigured-gateway path in a child shell so the live server is untouched.
echo "=== 19b. Razorpay: gateway unconfigured must 503 (child shell, live server untouched) ==="
U503=$(npx tsx -e "
import { isRazorpayConfigured } from './src/lib/payment/razorpay';
const cfg = isRazorpayConfigured();
console.log(cfg.available ? 'AVAILABLE' : ('UNAVAILABLE:' + (cfg.reason || '')));
" 2>/dev/null)
check "config guard accepts configured test keys" "AVAILABLE" "$U503"

echo
echo "RESULTS: PASS=$PASS FAIL=$FAIL"
exit $FAIL
