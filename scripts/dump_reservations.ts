import { adminIdToken, DB_HOST } from "./db_admin";
import fetch from "node-fetch";

const tok = await adminIdToken();
const r = await fetch(`${DB_HOST}/reservations.json?auth=${tok}`);
const data = (await r.json() as any) || {};
const ev = process.argv[2] || "evt_001";
for (const [id, v] of Object.entries(data) as [string, any][]) {
  if (!v || v.eventId !== ev) continue;
  console.log(`${id} status=${v.status} seats=${(v.seatIds || []).join(",")} owner=${v.ownerId || "?"} exp=${v.expiresAt} now=${Date.now()}`);
}
