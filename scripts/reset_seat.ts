// Reset a seat to available in RTDB via admin ID token.
import { adminIdToken, DB_HOST } from "./db_admin";

const [ev, seatId] = process.argv.slice(2);
if (!ev || !seatId) {
  console.log("usage: tsx reset_seat.ts <eventId> <seatId>");
  process.exit(1);
}
const tok = await adminIdToken();
const rowMatch = seatId.match(/R(\d+)-C(\d+)/);
const body = JSON.stringify({
  id: seatId,
  seatId,
  row: rowMatch ? parseInt(rowMatch[1], 10) : seatId,
  col: rowMatch ? parseInt(rowMatch[2], 10) : 1,
  status: "available",
  price: 999,
  section: "Main Auditorium",
  heldBy: null,
  reservationId: null,
  heldAt: null,
  holdExpiresAt: null,
  bookedBy: null,
  orderId: null,
});
const r = await fetch(`${DB_HOST}/seats/${ev}/${seatId}.json?auth=${encodeURIComponent(tok)}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body,
});
console.log("reset", `${ev}/${seatId}`, "->", r.status);
process.exit(0);
