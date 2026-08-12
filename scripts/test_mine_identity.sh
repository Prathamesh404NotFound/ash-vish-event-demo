#!/bin/bash
# Reproduce "held seat shown as held by another" on the live server.
BASE=https://ash-vish-event.vercel.app
RTDB=https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app

SESSION="sess_mine_$(date +%s%N | tail -c 12)"
echo "session: $SESSION"

EID="evt_001"
TIER="tier_vip"
SEAT="R3-C3"
IDEM="idem_mine_$SESSION"

echo "-- 1. create reservation"
RES=$(curl -s -X POST "$BASE/api/reservations" -H "Content-Type: application/json" -H "X-Session-Id: $SESSION" -d "{\"eventId\":\"$EID\",\"tierId\":\"$TIER\",\"quantity\":1,\"seatIds\":[\"$SEAT\"],\"idempotencyKey\":\"$IDEM\"}")
echo "$RES"
OWNER=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin).get('ownerId',''))")
RID=$(echo "$RES" | python3 -c "import sys,json;print(json.load(sys.stdin).get('reservationId',''))")
echo "ownerId=$OWNER reservationId=$RID"

echo "-- 2. seat node in RTDB"
curl -s "$RTDB/seats/$EID/$SEAT.json"
echo

echo "-- 3. release"
curl -s -X POST "$BASE/api/reservations/$RID" -H "Content-Type: application/json" -H "X-Session-Id: $SESSION"
echo
