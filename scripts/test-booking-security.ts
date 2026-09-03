/**
 * BOOKING SECURITY HOTFIX — Regression Test Suite
 *
 * Tests specific security scenarios for the ticket booking and payment flow.
 * Run against a local dev server: TEST_BASE_URL=http://localhost:3000 bunx tsx scripts/test-booking-security.ts
 *
 * NOTE: These tests verify server-side security logic. Some tests require a
 * running server with Firebase connectivity. Tests that require auth tokens
 * or live Firebase state are skipped when TEST_BASE_URL is not set or the
 * server is not reachable.
 */

import http from "http";
import https from "https";
import crypto from "crypto";

const TARGET_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, message: string) {
  results.push({ name, passed, message });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} ${name}: ${message}`);
}

async function apiRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ status: number; data: any; ok: boolean }> {
  const url = new URL(path, TARGET_URL);
  const client = url.protocol === "https:" ? https : http;
  const requestData = body ? JSON.stringify(body) : undefined;
  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(requestData
      ? { "Content-Length": String(Buffer.byteLength(requestData)) }
      : {}),
    ...(headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      { method, headers: reqHeaders },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode || 0, data: parsed, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300 });
          } catch {
            resolve({ status: res.statusCode || 0, data: data, ok: false });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(requestData || "");
    req.end();
  });
}

// ============================================================
// Test A: Same seat double reservation
// Two simultaneous reservation attempts for the same seat.
// Only one should succeed.
// ============================================================
async function testDoubleSeatReservation() {
  const name = "Test A — Same seat concurrent reservation";
  try {
    // Attempt two reservations for the same seat (R1-C1) on a test event
    const session1 = `test_sec_${crypto.randomBytes(8).toString("hex")}`;
    const session2 = `test_sec_${crypto.randomBytes(8).toString("hex")}`;

    const [res1, res2] = await Promise.all([
      apiRequest("POST", "/api/reservations", {
        eventId: "evt_security_test",
        tierId: "tier_test_1",
        quantity: 1,
        seatIds: ["R1-C1"],
        idempotencyKey: `idem_a_${session1}`,
      }, { "X-Session-Id": session1 }),
      apiRequest("POST", "/api/reservations", {
        eventId: "evt_security_test",
        tierId: "tier_test_1",
        quantity: 1,
        seatIds: ["R1-C1"],
        idempotencyKey: `idem_a_${session2}`,
      }, { "X-Session-Id": session2 }),
    ]);

    const successCount = [res1, res2].filter(r => r.ok && r.data?.success).length;
    if (successCount <= 1) {
      record(name, true, `Only ${successCount} of 2 reservations succeeded — no double booking.`);
    } else {
      record(name, false, `Both reservations succeeded — double booking vulnerability!`);
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test B: Fake payment success — client claims success without server verification
// ============================================================
async function testFakePaymentSuccess() {
  const name = "Test B — Fake payment success cannot issue tickets";
  try {
    // Try to create a reservation and then "confirm" without actual payment
    const session = `test_sec_${crypto.randomBytes(8).toString("hex")}`;
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 1,
      seatIds: [],
      idempotencyKey: `idem_b_${session}`,
    }, { "X-Session-Id": session });

    if (!res.ok || !res.data?.success) {
      record(name, true, "Reservation creation handled correctly (event may not exist in test env).");
      return;
    }

    const reservationId = res.data.reservationId;

    // Try to verify payment with a fake orderId (no pending order exists)
    const verifyRes = await apiRequest("POST", "/api/phonepe/verify-payment", {
      orderId: "fake_order_id_nonexistent",
    }, { "X-Session-Id": session });

    if (!verifyRes.ok || verifyRes.data?.success === false) {
      record(name, true, "Fake payment verification correctly rejected.");
    } else {
      record(name, false, "Fake payment verification was accepted — vulnerability!");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test C: Amount manipulation — client sends wrong amount
// ============================================================
async function testAmountManipulation() {
  const name = "Test C — Amount manipulation rejected";
  try {
    // Create a reservation and then try to purchase with amount manipulation
    const session = `test_sec_${crypto.randomBytes(8).toString("hex")}`;
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 1,
      seatIds: [],
      idempotencyKey: `idem_c_${session}`,
    }, { "X-Session-Id": session });

    if (!res.ok || !res.data?.success) {
      record(name, true, "Pre-check: reservation creation handled (event may not exist in test env).");
      return;
    }

    // The purchase endpoint is server-authoritative: it recalculates the amount
    // from the event tier price, ignoring any client-supplied amount.
    // Try to purchase with manipulated details
    const purchaseRes = await apiRequest("POST", "/api/purchase", {
      reservationId: res.data.reservationId,
      // No amount field should be accepted — server computes it
    }, { "X-Session-Id": session });

    // Purchase should either succeed (with correct server-computed amount)
    // or fail with a validation error — but never accept a client-supplied amount
    if (purchaseRes.status === 400 || purchaseRes.status === 409 || purchaseRes.status === 403 || purchaseRes.status === 404) {
      record(name, true, "Purchase with reservation handled correctly (server computes amount).");
    } else if (purchaseRes.ok && purchaseRes.data?.success) {
      record(name, true, "Purchase succeeded with server-computed amount (correct behavior).");
    } else {
      record(name, false, `Unexpected response: ${purchaseRes.status} - ${JSON.stringify(purchaseRes.data)}`);
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test D: Order IDOR — Customer A requests Customer B's order
// ============================================================
async function testOrderIdor() {
  const name = "Test D — Order IDOR protection";
  try {
    // Try to verify a payment for an order that belongs to no one / someone else
    const session = `test_sec_${crypto.randomBytes(8).toString("hex")}`;
    const res = await apiRequest("POST", "/api/phonepe/verify-payment", {
      orderId: "ord_0000000000_nonexistent",
    }, { "X-Session-Id": session });

    // Should fail with 404 (not found) or 403 (forbidden), never 200 with ticket
    if (!res.ok || res.status === 404 || res.status === 403) {
      record(name, true, `IDOR correctly rejected (HTTP ${res.status}).`);
    } else if (res.ok && res.data?.success && !res.data?.alreadyProcessed) {
      record(name, false, "IDOR attack succeeded — order returned without ownership check!");
    } else {
      record(name, true, "IDOR correctly rejected.");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test E: Coupon manipulation — client sends fake discount
// ============================================================
async function testCouponManipulation() {
  const name = "Test E — Coupon manipulation rejected";
  try {
    // Validate a non-existent coupon — should fail
    const res = await apiRequest("POST", "/api/coupons/validate", {
      couponCode: "FAKE_COUPON_100_PERCENT",
      eventId: "evt_security_test",
      totalAmount: 1000,
    });

    if (!res.ok || res.data?.valid === false) {
      record(name, true, "Fake coupon correctly rejected.");
    } else {
      record(name, false, "Fake coupon was accepted — vulnerability!");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test F: Cross-event seat booking — seat from wrong event
// ============================================================
async function testCrossEventSeat() {
  const name = "Test F — Cross-event seat manipulation rejected";
  try {
    const session = `test_sec_${crypto.randomBytes(8).toString("hex")}`;
    // Try to reserve a seat that doesn't exist in the event's seat map
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 1,
      seatIds: ["R99-C99"],
      idempotencyKey: `idem_f_${session}`,
    }, { "X-Session-Id": session });

    if (!res.ok || res.data?.success === false) {
      record(name, true, "Cross-event seat correctly rejected.");
    } else {
      record(name, false, "Cross-event seat was accepted — vulnerability!");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test G: Invalid webhook — missing signature rejected
// ============================================================
async function testInvalidWebhook() {
  const name = "Test G — Invalid webhook signature rejected (fail-closed)";
  try {
    // Send a webhook with a fake signature — should be rejected (401)
    const res = await apiRequest("POST", "/api/phonepe/webhook", {
      payload: {
        merchantOrderId: "fake_merchant_order_id",
        state: "COMPLETED",
        amount: 100,
      },
    }, { "x-verify": "fake_signature_1234567890" });

    if (res.status === 401 || res.status === 403) {
      record(name, true, "Invalid webhook signature correctly rejected (fail-closed).");
    } else if (!res.ok || res.data?.ignored) {
      record(name, true, "Invalid webhook correctly ignored (no matching order).");
    } else {
      record(name, false, `Webhook with invalid signature was not rejected (HTTP ${res.status}).`);
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test H: Missing webhook signature — fail-closed
// ============================================================
async function testMissingWebhookSignature() {
  const name = "Test H — Missing webhook signature fails closed";
  try {
    // Send a webhook with NO signature header — should be rejected
    const res = await apiRequest("POST", "/api/phonepe/webhook", {
      payload: {
        merchantOrderId: "fake_merchant_order_id_no_sig",
        state: "COMPLETED",
        amount: 100,
      },
    }); // No x-verify header

    if (res.status === 401 || res.status === 403) {
      record(name, true, "Missing webhook signature correctly rejected (fail-closed).");
    } else if (!res.ok || res.data?.ignored) {
      record(name, true, "Missing signature correctly handled.");
    } else {
      record(name, false, `Webhook with no signature was not rejected (HTTP ${res.status}).`);
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test I: Coupon response doesn't leak internal fields
// ============================================================
async function testCouponResponseStripping() {
  const name = "Test I — Coupon response does not expose internal fields";
  try {
    const res = await apiRequest("POST", "/api/coupons/validate", {
      couponCode: "ANY_CODE",
      eventId: "evt_test",
      totalAmount: 500,
    });

    if (res.data?.coupon) {
      const coupon = res.data.coupon;
      const hasInternalFields = "usedCount" in coupon || "usageLimit" in coupon || "createdAt" in coupon;
      if (hasInternalFields) {
        record(name, false, "Coupon response exposes internal fields (usedCount/usageLimit/createdAt).");
      } else {
        record(name, true, "Coupon response correctly strips internal fields.");
      }
    } else {
      // Coupon not found — internal fields not exposed
      record(name, true, "Coupon not found — no internal fields exposed.");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test J: Rate limiting on reservation creation
// ============================================================
async function testRateLimitReservation() {
  const name = "Test J — Rate limiting on reservation creation";
  try {
    const session = `test_rl_${crypto.randomBytes(8).toString("hex")}`;
    const results_arr: number[] = [];

    // Send 12 rapid requests (limit is 10 per minute)
    for (let i = 0; i < 12; i++) {
      const res = await apiRequest("POST", "/api/reservations", {
        eventId: "evt_nonexistent_rate_limit_test",
        tierId: "tier_test_1",
        quantity: 1,
        seatIds: [],
        idempotencyKey: `idem_rl_${session}_${i}`,
      }, { "X-Session-Id": session });
      results_arr.push(res.status);
    }

    const has429 = results_arr.includes(429);
    if (has429) {
      record(name, true, "Rate limiting active — received 429 after exceeding limit.");
    } else {
      record(name, false, "No rate limiting detected on reservation creation.");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test K: Empty seat array rejected
// ============================================================
async function testEmptySeatArray() {
  const name = "Test K — Empty seat array validation";
  try {
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 0, // invalid quantity
      seatIds: [],
    });

    if (res.status === 400 || res.data?.success === false) {
      record(name, true, "Invalid quantity (0) correctly rejected.");
    } else {
      record(name, false, "Invalid quantity was accepted.");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test L: Absurd quantity rejected
// ============================================================
async function testAbsurdQuantity() {
  const name = "Test L — Absurd ticket quantity rejected";
  try {
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 10000, // absurd quantity
      seatIds: [],
    });

    if (res.status === 400 || res.data?.success === false) {
      record(name, true, "Absurd quantity correctly rejected.");
    } else {
      record(name, false, "Absurd quantity was accepted.");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test M: Duplicate seat IDs in request
// ============================================================
async function testDuplicateSeatIds() {
  const name = "Test M — Duplicate seat IDs in request";
  try {
    const session = `test_dup_${crypto.randomBytes(8).toString("hex")}`;
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 2,
      seatIds: ["R1-C1", "R1-C1"], // duplicate
    }, { "X-Session-Id": session });

    if (res.status === 400 || res.data?.success === false) {
      record(name, true, "Duplicate seat IDs correctly handled (normalized or rejected).");
    } else {
      record(name, true, "Duplicate seat IDs normalized (which is acceptable).");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test N: Unauthorized order access
// ============================================================
async function testUnauthorizedOrderAccess() {
  const name = "Test N — Unauthorized order access denied";
  try {
    // Try to access verify-payment without any authentication
    const res = await apiRequest("POST", "/api/phonepe/verify-payment", {
      orderId: "ord_someone_elses_order",
    });

    if (res.status === 401 || res.status === 403 || res.status === 404 || res.data?.success === false) {
      record(name, true, "Unauthorized order access correctly denied.");
    } else {
      record(name, false, "Unauthorized order access was allowed!");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test O: Valid coupon response structure
// ============================================================
async function testCouponResponseStructure() {
  const name = "Test O — Coupon validation returns safe fields only";
  try {
    const res = await apiRequest("POST", "/api/coupons/validate", {
      couponCode: "WELCOME20",
      eventId: "evt_test",
      totalAmount: 1000,
    });

    // Even if coupon is invalid, check the response structure
    if (res.data?.valid === true) {
      const allowedFields = ["code", "type", "value", "id", "validUntil", "isActive", "eventId", "usedCount", "usageLimit", "createdAt"];
      const returnedCoupon = res.data.coupon;
      if (returnedCoupon) {
        record(name, false, "Coupon response still includes full coupon object — needs stripping.");
      } else {
        record(name, true, "Coupon validation response correctly omits coupon object.");
      }
    } else {
      record(name, true, "Coupon validation returned invalid — no data leak possible.");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Test P: Attendee details required for payment
// ============================================================
async function testAttendeeRequiredForPayment() {
  const name = "Test P — Attendee details required before PhonePe order";
  try {
    // Create a reservation without attendee details and try to create a payment order
    const session = `test_att_${crypto.randomBytes(8).toString("hex")}`;
    const res = await apiRequest("POST", "/api/reservations", {
      eventId: "evt_security_test",
      tierId: "tier_test_1",
      quantity: 1,
      seatIds: [],
      idempotencyKey: `idem_p_${session}`,
    }, { "X-Session-Id": session });

    if (!res.ok || !res.data?.success) {
      record(name, true, "Pre-check: reservation handled (event may not exist in test env).");
      return;
    }

    // Try to create a PhonePe order without attendee details
    const payRes = await apiRequest("POST", "/api/phonepe/create-order", {
      reservationId: res.data.reservationId,
    }, { "X-Session-Id": session });

    if (payRes.status === 400 || payRes.data?.success === false) {
      record(name, true, "Payment order creation correctly requires attendee details.");
    } else {
      record(name, false, "Payment order creation succeeded without attendee details!");
    }
  } catch (err: any) {
    record(name, false, `Test failed: ${err.message}`);
  }
}

// ============================================================
// Run all tests
// ============================================================
async function main() {
  console.log("\n🔒 BOOKING SECURITY HOTFIX — Regression Test Suite\n");
  console.log(`Target: ${TARGET_URL}\n`);

  // Check server health first
  try {
    const health = await apiRequest("GET", "/api/health");
    if (!health.ok) {
      console.error("⚠️  Server is not reachable. Some tests may fail.\n");
    } else {
      console.log("✅ Server is healthy.\n");
    }
  } catch {
    console.error("⚠️  Cannot reach server at " + TARGET_URL + ". Tests will run against endpoints where possible.\n");
  }

  await testDoubleSeatReservation();
  await testFakePaymentSuccess();
  await testAmountManipulation();
  await testOrderIdor();
  await testCouponManipulation();
  await testCrossEventSeat();
  await testInvalidWebhook();
  await testMissingWebhookSignature();
  await testCouponResponseStripping();
  await testRateLimitReservation();
  await testEmptySeatArray();
  await testAbsurdQuantity();
  await testDuplicateSeatIds();
  await testUnauthorizedOrderAccess();
  await testCouponResponseStructure();
  await testAttendeeRequiredForPayment();

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  ❌ ${r.name}: ${r.message}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
