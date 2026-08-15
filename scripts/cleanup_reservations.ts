// Delete all active reservations for an event via RTDB admin ID token, releasing held seats.
import { adminIdToken, DB_HOST } from "./db_admin";

const ev = process.argv[2] || "evt_001";
const keep = new Set((process.argv.slice(3) || []));
const tok = await adminIdToken();

const recs: Record<string, any> =
  (await (
    await fetch(`${DB_HOST}/reservations.json?auth=${encodeURIComponent(tok)}`)
  ).json()) || {};
let deleted = 0;
for (const [id, rec] of Object.entries<any>(recs)) {
  if (!rec || rec.status !== "active") continue;
  if (rec.eventId !== ev) continue;
  if (keep.has(id)) continue;
  for (const seatId of rec.seatIds || []) {
    await fetch(`${DB_HOST}/seats/${ev}/${seatId}.json?auth=${encodeURIComponent(tok)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "available", heldBy: null, reservationId: null, heldAt: null, holdExpiresAt: null }),
    });
  }
  await fetch(`${DB_HOST}/reservations/${id}.json?auth=${encodeURIComponent(tok)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "released" }),
  });
  deleted++;
}
console.log(`deleted ${deleted} active reservations for ${ev}`);
process.exit(0);
