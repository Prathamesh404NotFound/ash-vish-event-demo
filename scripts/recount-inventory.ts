
import { getFirebaseAdminIdToken } from "../src/lib/identity-admin.js";
import { rtdbGet, rtdbSet } from "../src/lib/rtdb.js";
import dotenv from "dotenv";
dotenv.config();

async function recount() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  
  console.log("--- Starting Production-Safe Inventory Recount ---");
  if (!apply) {
    console.log("[DRY RUN] No changes will be written to RTDB. Use --apply to save fixes.");
  }

  const authToken = await getFirebaseAdminIdToken();
  if (!authToken) {
    console.error("Auth failed - ensure FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY is set.");
    return;
  }

  // 1. Fetch data
  console.log("Fetching tickets, orders, and events...");
  const [ticketsSnap, ordersSnap, eventsSnap] = await Promise.all([
    rtdbGet("tickets", authToken),
    rtdbGet("orders", authToken),
    rtdbGet("events", authToken)
  ]);

  const allTickets = Object.values(ticketsSnap.data || {}) as any[];
  const allOrders = (ordersSnap.data || {}) as Record<string, any>;
  const allEvents = (eventsSnap.data || {}) as Record<string, any>;

  // 2. Filter valid tickets
  // Statuses considered 'sold': 'valid', 'redeemed'
  // Statuses considered 'not sold': 'cancelled', 'void', 'refunded' (linked order status)
  const validTickets = allTickets.filter(t => {
    if (t.status === 'cancelled' || t.status === 'void') return false;
    const linkedOrder = allOrders[t.orderId];
    if (linkedOrder && (linkedOrder.status === 'refunded' || linkedOrder.status === 'cancelled')) return false;
    return true;
  });

  console.log(`Found ${allTickets.length} total tickets, ${validTickets.length} are active.`);

  let totalFixes = 0;

  for (const [eventId, eventData] of Object.entries(allEvents)) {
    const event = eventData as any;
    if (!event.ticketTiers) continue;

    console.log(`\nEvent: ${event.title} (${eventId})`);
    const eventTickets = validTickets.filter(t => t.eventId === eventId);
    
    const isArray = Array.isArray(event.ticketTiers);
    const updatedTiers = isArray ? [...event.ticketTiers] : {...event.ticketTiers};
    let eventChanged = false;

    const processTier = (tier: any, keyOrIndex: string | number) => {
      if (!tier) return;
      
      // Derive sold count by matching tierId
      // Fallback: join with orders if ticket lacks tierId
      const sold = eventTickets.filter(t => {
        const tTierId = t.tierId || allOrders[t.orderId]?.tierId;
        const tierMatch = (tier.id && tTierId === tier.id) || (!tier.id && String(keyOrIndex) === String(tTierId));
        return tierMatch;
      }).reduce((sum, t) => sum + (Number(t.quantity) || 1), 0);

      const total = Number(tier.totalInventory || tier.capacity || 0);
      const correctRem = Math.max(0, total - sold);
      const currentRem = typeof tier.remainingInventory === 'number' ? tier.remainingInventory : total;

      if (currentRem !== correctRem) {
        console.log(`  [FIX] Tier: ${tier.name || keyOrIndex} | Sold: ${sold} | Total: ${total} | Current: ${currentRem} -> Correct: ${correctRem}`);
        if (isArray) {
          updatedTiers[keyOrIndex as number] = { ...tier, remainingInventory: correctRem };
        } else {
          updatedTiers[keyOrIndex as string] = { ...tier, remainingInventory: correctRem };
        }
        eventChanged = true;
        totalFixes++;
      } else {
        console.log(`  [OK]  Tier: ${tier.name || keyOrIndex} | Sold: ${sold} | Total: ${total} | Rem: ${correctRem}`);
      }
    };

    if (isArray) {
      event.ticketTiers.forEach((t: any, i: number) => processTier(t, i));
    } else {
      Object.entries(event.ticketTiers).forEach(([k, t]) => processTier(t, k));
    }

    if (eventChanged && apply) {
      console.log(`  Writing fixes for ${eventId} to RTDB...`);
      await rtdbSet(`events/${eventId}/ticketTiers`, updatedTiers, authToken);
    }
  }

  console.log(`\n--- Recount Complete. Total tiers needing fix: ${totalFixes} ---`);
  if (!apply && totalFixes > 0) {
    console.log("Run with --apply to commit these changes.");
  }
}

recount().catch(err => {
  console.error("Recount failed:", err);
  process.exit(1);
});
