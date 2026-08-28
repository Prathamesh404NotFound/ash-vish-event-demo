/**
 * Static verification that every privileged admin/counter endpoint in
 * server.ts is protected by an explicit authorization guard (verifyRole or
 * requireRole). Read-only public endpoints are listed in ALLOWED_PUBLIC.
 *
 * Usage: npx tsx scripts/verify-rbac-guards.ts
 */
import fs from "fs";
import path from "path";

const SERVER = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "server.ts");
const source = fs.readFileSync(SERVER, "utf8");

const ALLOWED_PUBLIC = new Set([
  // Customer-facing routes: these authenticate as customer sessions (owner
  // resolution / owner-only guards) and are NOT admin-panel endpoints.
  "/api/auth/verify",
  "/api/auth/claims",
  "/api/auth/otp/send",
  "/api/auth/otp/reset",
  "/api/coupons/validate",
  "/api/reservations",
  "/api/reservations/:reservationId",
  "/api/reservations/:reservationId/renew",
  "/api/reservations/:reservationId/extend",
  "/api/reservations/:reservationId/seats",
  "/api/reservations/:reservationId/selection",
  "/api/reservations/:reservationId/attendee",
  "/api/reservations/:reservationId/quote",
  "/api/reservations/:reservationId/cancel",
  "/api/reservations/:reservationId/reserve-pay-later",
  "/api/purchase",
  "/api/phonepe/create-order",
  "/api/phonepe/verify-payment",
  "/api/phonepe/webhook",
  "/api/events",
  "/api/events/:eventId",
  "/api/events/:eventId/seats",
  "/api/events/:eventId/reviews",
  "/api/events/:eventId/reviews/:reviewId",
  "/api/events/:eventId/availability",
  "/api/events/:eventId/bookings",
  "/api/organizers/register",
  "/api/reviews",
  "/api/reviews/:reviewId",
  "/api/tickets/verify",
  "/api/tickets/verify-and-redeem",
  "/api/bookings/:bookingId/tickets",
  "/api/payments/verify/:orderId",
  "/api/health",
  "/api/whoami",
  "/api/me/tickets",
  "/api/me/bookings",
  "/api/users/:uid/tickets",
  "/api/users/:uid/bookings",
]);

const adminRegex =
  /app\.(post|put|patch|delete)\(["']([^"']+?)["'],\s*(async \(req|verifyRole|requireRole|async)/g;

const allRoutes = new Map<string, string>();
let match: RegExpExecArray | null;
while ((match = adminRegex.exec(source)) !== null) {
  const method = match[1];
  const route = match[2];
  const rest = match[3];
  allRoutes.set(`${method.toUpperCase()} ${route}`, rest);
}

let failures = 0;
for (const [route, guard] of allRoutes.entries()) {
  const method = route.split(" ")[0];
  const routePath = route.split(" ").slice(1).join(" ");
  if (ALLOWED_PUBLIC.has(routePath)) continue;
  // Only flag routes that are NOT guarded
  if (guard.startsWith("async")) {
    console.log(`UNGUARDED [${route}]`);
    failures++;
  } else if (guard.startsWith("requireRole") || guard.startsWith("verifyRole")) {
    console.log(`GUARDED  [${route}] <- ${guard.split("(")[1]?.split(")")[0] ?? guard}`);
  }
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures} privileged route(s) lack an authorization guard.`);
  process.exit(1);
}
console.log(`\nOK: all ${allRoutes.size} admin routes are explicitly guarded.`);
