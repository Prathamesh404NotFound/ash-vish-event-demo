import { adminIdToken, DB_HOST } from "./db_admin";
import crypto from "crypto";

const tok = await adminIdToken();
const EV = "evt_001";

async function get(path: string) {
  const r = await fetch(`${DB_HOST}/${path}.json?auth=${encodeURIComponent(tok)}`);
  return r.json();
}

// Inspect R2-C1 (SEAT3) after a real e2e-style run
const seat = await get(`seats/${EV}/R2-C1`);
console.log("SEAT3 raw:", JSON.stringify(seat, null, 2));

// Inspect all reservations
const reservations = await get(`reservations`);
console.log("reservations:", JSON.stringify(reservations, null, 2));

// Guest identity hash like server does
function guestId(session: string) {
  const raw = `unknown|unknown|${session}`;
  return "guest_" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// Check pending_orders if any
const pending = await get(`pending_orders`);
console.log("pending_orders:", JSON.stringify(pending, null, 2));
