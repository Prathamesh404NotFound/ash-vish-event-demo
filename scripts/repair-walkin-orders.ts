/**
 * repair-walkin-orders.ts
 *
 * Scans for walk-in orders that have tickets/bookings but are missing their
 * canonical orders/<orderId> record. Reconstructs them using the same logic
 * as the server's reconstructOrderFromTickets helper.
 *
 * Usage:
 *   npx tsx scripts/repair-walkin-orders.ts --dry-run
 *   npx tsx scripts/repair-walkin-orders.ts --execute
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const DRY_RUN = process.argv.includes("--dry-run");
const EXECUTE = process.argv.includes("--execute");

if (!DRY_RUN && !EXECUTE) {
  console.error("Usage: npx tsx scripts/repair-walkin-orders.ts --dry-run | --execute");
  process.exit(1);
}

// Initialize Firebase Admin
if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY");
    process.exit(1);
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL,
  });
}

const db = getDatabase();

interface RepairResult {
  orderId: string;
  ticketId: string | null;
  bookingId: string | null;
  status: "repaired" | "skipped" | "failed" | "already_ok";
  error?: string;
}

async function repairWalkInOrders(): Promise<RepairResult[]> {
  const results: RepairResult[] = [];

  console.log("Fetching tickets, bookings, and existing orders...");

  const [ticketsSnap, bookingsSnap, ordersSnap] = await Promise.all([
    db.ref("tickets").once("value"),
    db.ref("bookings").once("value"),
    db.ref("orders").once("value"),
  ]);

  const allTickets = ticketsSnap.val() || {};
  const allBookings = bookingsSnap.val() || {};
  const allOrders = ordersSnap.val() || {};

  console.log(`Found ${Object.keys(allTickets).length} tickets, ${Object.keys(allBookings).length} bookings, ${Object.keys(allOrders).length} orders`);

  // Find walk-in tickets (paymentMethod starts with "walkin")
  const walkInTickets = Object.entries(allTickets).filter(
    ([, t]: [string, any]) => String(t.paymentMethod || "").startsWith("walkin") && t.status !== "deleted"
  );

  console.log(`Found ${walkInTickets.length} active walk-in tickets`);

  // Check each walk-in ticket for a missing orders/ record
  for (const [ticketKey, ticket] of walkInTickets) {
    const orderId = (ticket as any).orderId;
    if (!orderId) {
      results.push({
        orderId: "unknown",
        ticketId: ticketKey,
        bookingId: (ticket as any).bookingId || null,
        status: "failed",
        error: "Ticket has no orderId",
      });
      continue;
    }

    // Check if orders/<orderId> exists
    if (allOrders[orderId]) {
      results.push({
        orderId,
        ticketId: ticketKey,
        bookingId: (ticket as any).bookingId || null,
        status: "already_ok",
      });
      continue;
    }

    // Order record is missing — attempt reconstruction
    const t = ticket as any;
    const linkedBooking = Object.values(allBookings).find(
      (b: any) => b.orderId === orderId || b.bookingId === t.bookingId
    ) as any;

    const isWalkIn = String(t.paymentMethod || "").startsWith("walkin");
    const quantity = Number(t.quantity || 1) || 1;

    const order = {
      orderId,
      eventId: t.eventId || linkedBooking?.eventId || null,
      tierId: t.tierId || "",
      seatIds: t.selectedSeats || [],
      quantity,
      customerDetails: {
        name: t.attendeeName || linkedBooking?.attendeeName || "",
        email: t.attendeeEmail || linkedBooking?.attendeeEmail || "",
        phone: t.attendeePhone || linkedBooking?.attendeePhone || "",
      },
      amount: Number(t.totalPaid || 0) || Number(linkedBooking?.totalAmount || 0) || 0,
      discount: Number(t.discount || 0) || Number(linkedBooking?.discount || 0) || 0,
      couponCode: null,
      paymentMethod: t.paymentMethod || linkedBooking?.paymentMethod || "",
      paymentStatus: "paid",
      amountDue: 0,
      channel: isWalkIn ? "counter" : "online",
      status: "confirmed",
      refundReason: null,
      refundAmount: null,
      ticketId: t.id || ticketKey,
      bookingId: linkedBooking?.bookingId || t.bookingId || null,
      eventTitle: t.eventTitle || null,
      tierName: t.tierName || null,
      ticketNumber: t.ticketNumber || null,
      seatLabels: t.selectedSeats || (t.seatNumber ? [t.seatNumber] : []),
      counterName: t.counterName || linkedBooking?.counterName || null,
      issuedBySubUserName: t.issuedBySubUserName || linkedBooking?.issuedBySubUserName || null,
      shiftId: t.shiftId || linkedBooking?.shiftId || null,
      counterId: t.counterId || linkedBooking?.counterId || null,
      createdBy: t.scannedByStaffId || t.createdByStaffId || "system",
      createdAt: t.purchasedAt || linkedBooking?.createdAt || new Date().toISOString(),
      _reconstructed: true,
    };

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would repair: ${orderId} (ticket: ${ticketKey}, amount: ₹${order.amount})`);
      results.push({
        orderId,
        ticketId: ticketKey,
        bookingId: order.bookingId,
        status: "repaired",
      });
    } else {
      try {
        await db.ref(`orders/${orderId}`).set(order);
        console.log(`[REPAIRED] ${orderId} (ticket: ${ticketKey}, amount: ₹${order.amount})`);
        results.push({
          orderId,
          ticketId: ticketKey,
          bookingId: order.bookingId,
          status: "repaired",
        });
      } catch (err: any) {
        console.error(`[FAILED] ${orderId}: ${err.message}`);
        results.push({
          orderId,
          ticketId: ticketKey,
          bookingId: order.bookingId,
          status: "failed",
          error: err.message,
        });
      }
    }
  }

  return results;
}

async function main() {
  console.log("=== Walk-in Order Repair Script ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "EXECUTE (will write)"}`);
  console.log("");

  const results = await repairWalkInOrders();

  const repaired = results.filter((r) => r.status === "repaired");
  const alreadyOk = results.filter((r) => r.status === "already_ok");
  const failed = results.filter((r) => r.status === "failed");

  console.log("\n=== Summary ===");
  console.log(`Total walk-in tickets scanned: ${results.length}`);
  console.log(`Already OK (order record exists): ${alreadyOk.length}`);
  console.log(`${DRY_RUN ? "Would repair" : "Repaired"}: ${repaired.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed items:");
    failed.forEach((f) => console.log(`  - ${f.orderId} (ticket: ${f.ticketId}): ${f.error}`));
  }

  if (DRY_RUN && repaired.length > 0) {
    console.log(`\nTo execute, run: npx tsx scripts/repair-walkin-orders.ts --execute`);
  }
}

main().catch((err) => {
  console.error("Repair script failed:", err);
  process.exit(1);
});
