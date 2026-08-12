// Restore each tier's remainingInventory to totalInventory minus the number of
// confirmed (paid) reservations for that tier. Run after test runs that finalize payments.
import { adminIdToken, DB_HOST } from "./db_admin";
const ev = process.argv[2] || "evt_001";
const auth = encodeURIComponent(await adminIdToken());

const res: Record<string, any> =
  (await (await fetch(`${DB_HOST}/reservations.json?auth=${auth}`)).json()) || {};
// Count confirmed quantities per tier for this event.
const confirmed: Record<string, number> = {};
for (const rec of Object.values<any>(res)) {
  if (rec && rec.eventId === ev && rec.status === "confirmed") {
    const tierId = rec.tierId || null;
    if (tierId) confirmed[tierId] = (confirmed[tierId] || 0) + (rec.quantity || 1);
  }
}
console.log("confirmed counts:", confirmed);

const data = await (await fetch(`${DB_HOST}/events/${ev}.json?auth=${auth}`)).json();
const tiers = data.ticketTiers;
if (!Array.isArray(tiers)) {
  console.error("ticketTiers is not an array; shape unexpected:", typeof tiers);
  process.exit(1);
}
for (const t of tiers) {
  const total = t.totalInventory ?? 0;
  const restored = Math.max(0, total - (confirmed[t.id] || 0));
  if (t.remainingInventory !== restored) {
    const r = await fetch(`${DB_HOST}/events/${ev}/ticketTiers/${tiers.indexOf(t)}/remainingInventory.json?auth=${auth}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: String(restored),
    });
    console.log(t.id, "remainingInventory ->", restored, "HTTP", r.status);
  } else {
    console.log(t.id, "already", restored);
  }
}
process.exit(0);
