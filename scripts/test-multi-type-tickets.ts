/**
 * Unit tests for multi-type ticket processing — the shared client-side data
 * model used by EventDetail (mix VIP + VVIP + Kids into one booking), the
 * CheckoutWizard line breakdown, and the reservation payload builder in
 * BookingContext. The server re-derives every price from the live event
 * tiers (see server.ts#computeReservationQuote); these tests pin the client
 * rules that mirror it.
 *
 * Run: tsx scripts/test-multi-type-tickets.ts
 */
import assert from 'node:assert/strict';
import {
  getTierKind,
  getTierBadgeStyle,
  sumItemQuantities,
  validateTicketItems,
  TIER_BADGE_STYLES,
} from '../src/lib/ticketItems';

// ---------------------------------------------------------------- sums
assert.equal(sumItemQuantities(undefined), 0);
assert.equal(sumItemQuantities(null), 0);
assert.equal(sumItemQuantities([]), 0);
assert.equal(
  sumItemQuantities([
    { tierId: 'vip', quantity: 2 },
    { tierId: 'kids', quantity: 3 },
  ]),
  5,
  '2 VIP + 3 Kids totals 5 tickets'
);
assert.equal(
  sumItemQuantities([
    { tierId: 'a', quantity: 2 },
    { tierId: 'b', quantity: 0 },
    { tierId: 'c', quantity: -1 },
  ]),
  2,
  'invalid quantities are ignored, never counted as tickets'
);

// ---------------------------------------------------------------- validation (mirrors server rules)
// Valid mixed selection: 2 VIP + 3 Kids in one transaction.
assert.deepEqual(
  validateTicketItems([
    { tierId: 't_vip', quantity: 2 },
    { tierId: 't_kids', quantity: 3 },
  ]),
  { ok: true, items: [{ tierId: 't_vip', quantity: 2 }, { tierId: 't_kids', quantity: 3 }] }
);

// Empty / missing selections are rejected.
assert.equal(validateTicketItems(undefined).ok, false);
assert.equal(validateTicketItems([]).ok, false);

// At most 5 distinct ticket types per booking.
assert.equal(
  validateTicketItems([1, 2, 3, 4, 5, 6].map((i) => ({ tierId: `t${i}`, quantity: 1 }))).ok,
  false,
  'more than 5 distinct types is rejected'
);

// Duplicate tier lines are rejected (a line must be unique per type).
assert.equal(
  validateTicketItems([
    { tierId: 't_vip', quantity: 1 },
    { tierId: 't_vip', quantity: 1 },
  ]).ok,
  false,
  'duplicate ticket types are rejected'
);

// Zero/negative quantities are rejected; at least 1 per line.
assert.equal(validateTicketItems([{ tierId: 't_vip', quantity: 0 }]).ok, false);
assert.equal(validateTicketItems([{ tierId: 't_vip', quantity: -2 }]).ok, false);
assert.equal(validateTicketItems([{ tierId: 't_vip', quantity: 1.5 }]).ok, false);

// Booking-wide cap (10 tickets total).
const nearCap = [
  { tierId: 't_vip', quantity: 6 },
  { tierId: 't_kids', quantity: 4 },
];
assert.equal(validateTicketItems(nearCap).ok, true, 'exactly 10 tickets is allowed');
assert.equal(
  validateTicketItems([
    { tierId: 't_vip', quantity: 6 },
    { tierId: 't_kids', quantity: 5 },
  ]).ok,
  false,
  'more than 10 tickets in one booking is rejected'
);

// Missing tierId lines are rejected.
assert.equal(validateTicketItems([{ quantity: 2 }]).ok, false);

// ---------------------------------------------------------------- badge classification
// VVIP must classify before VIP (so "VVIP Lounge" never renders a VIP badge).
assert.equal(getTierKind('VVIP Lounge'), 'vvip');
assert.equal(getTierKind('vvip'), 'vvip');
assert.equal(getTierKind('VIP'), 'vip');
assert.equal(getTierKind('VIP Lounge'), 'vip');
assert.equal(getTierKind('Kids'), 'kids');
assert.equal(getTierKind('Child Pass'), 'kids');
assert.equal(getTierKind('General Admission'), 'standard');
assert.equal(getTierKind(''), 'standard');
assert.equal(getTierKind(null), 'standard');

// Every classified badge has a real, styled definition (no silent fallback).
assert.ok(TIER_BADGE_STYLES.vvip.badgeClass.length > 0, 'VVIP badge has a style');
assert.ok(TIER_BADGE_STYLES.kids.badgeClass.length > 0, 'Kids badge has a style');
assert.equal(getTierBadgeStyle('VVIP').label, 'VVIP');
assert.equal(getTierBadgeStyle('VIP').label, 'VIP');
assert.equal(getTierBadgeStyle('Kids').label, 'Kids');

// The VIP badge style is preserved verbatim (constraint: do not break VIP).
assert.match(TIER_BADGE_STYLES.vip.badgeClass, /#D4AF37/, 'VIP badge keeps the gold crown palette');

// ---------------------------------------------------------------- pricing math used by EventDetail/quote
// The mixed subtotal is the sum of each line (price x quantity) — the same
// aggregation the server quote performs against live DB tier prices.
const lineItems = [
  { tierId: 't_vip', tierName: 'VIP', price: 1000, quantity: 2 },
  { tierId: 't_kids', tierName: 'Kids', price: 500, quantity: 3 },
];
assert.equal(
  lineItems.reduce((s, l) => s + (l.price ?? 0) * l.quantity, 0),
  3500,
  '2 × ₹1,000 + 3 × ₹500 = ₹3,500'
);
assert.equal(sumItemQuantities(lineItems), 5);

console.log('Multi-type ticket tests passed.');
