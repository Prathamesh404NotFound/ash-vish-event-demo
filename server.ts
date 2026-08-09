import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
dotenv.config();

import { verifyFirebaseIdToken, TokenVerificationError } from "./src/lib/verify-token";
import { rtdbGet, rtdbSet, rtdbUpdate, rtdbDelete, rtdbTransaction } from "./src/lib/rtdb";
import { getGoogleOAuthAccessToken, getFirebaseAdminIdToken, setUserCustomClaims } from "./src/lib/identity-admin";

const SERVER_HMAC_SECRET = process.env.SERVER_HMAC_SECRET || "ASH_VISH_SECURE_HMAC_KEY_2026";

async function getAdminAuthToken(): Promise<string | undefined> {
  try {
    return await getFirebaseAdminIdToken();
  } catch (err: any) {
    try {
      return await getGoogleOAuthAccessToken();
    } catch (gErr: any) {
      console.warn("[ADMIN AUTH] Unable to get Firebase Admin auth token:", err.message, gErr.message);
      return undefined;
    }
  }
}

// Event Price Catalog for Server-Side Price Verification
const EVENT_PRICES_CATALOG: Record<string, Record<string, number>> = {
  evt_001: { tier_vip: 2499, tier_gold: 1499, tier_silver: 799 },
  evt_002: { tier_vvip: 3999, tier_vip: 1999, tier_gen: 999 },
  evt_003: { tier_front: 1299, tier_balcony: 699 },
  evt_004: { tier_arena: 1899, tier_stand: 999 },
  evt_005: { tier_pass: 1599 },
};

// Server-Managed Coupons Database Fallback
let COUPONS_DATABASE: Record<string, {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  validUntil: string;
  usageLimit?: number;
  usedCount: number;
  eventId?: string;
  isActive: boolean;
  createdAt: string;
}> = {
  "WELCOME20": {
    id: "c_001",
    code: "WELCOME20",
    type: "percentage",
    value: 20,
    validUntil: "2028-12-31",
    usageLimit: 100,
    usedCount: 14,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  "FLAT500": {
    id: "c_002",
    code: "FLAT500",
    type: "fixed",
    value: 500,
    validUntil: "2028-12-31",
    usageLimit: 50,
    usedCount: 8,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  "EARLYBIRD15": {
    id: "c_003",
    code: "EARLYBIRD15",
    type: "percentage",
    value: 15,
    validUntil: "2028-12-31",
    eventId: "evt_001",
    usageLimit: 30,
    usedCount: 5,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  "EXPIRED10": {
    id: "c_004",
    code: "EXPIRED10",
    type: "percentage",
    value: 10,
    validUntil: "2025-01-01",
    usageLimit: 10,
    usedCount: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
  }
};

// Server-Managed Reviews Database
let REVIEWS_DATABASE: Array<{
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  createdAt: string;
  status: 'published' | 'hidden';
  isVerifiedBuyer?: boolean;
}> = [
  {
    id: "rev_101",
    eventId: "evt_001",
    userId: "usr_mock_1",
    userName: "Ananya Sharma",
    userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    comment: "An incredible concert! Sound clarity and stage visual lighting were world-class.",
    createdAt: "2026-07-20T14:32:00Z",
    status: "published",
    isVerifiedBuyer: true,
  },
  {
    id: "rev_102",
    eventId: "evt_001",
    userId: "usr_mock_2",
    userName: "Rahul Verma",
    userAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    comment: "Best live performance in Mumbai this year! Gate scanning took less than 10 seconds.",
    createdAt: "2026-07-21T09:15:00Z",
    status: "published",
    isVerifiedBuyer: true,
  },
  {
    id: "rev_103",
    eventId: "evt_002",
    userId: "usr_mock_3",
    userName: "Priya Nair",
    userAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    rating: 4,
    comment: "Hilarious comedy special! Non-stop laughs from start to finish.",
    createdAt: "2026-07-28T18:40:00Z",
    status: "published",
    isVerifiedBuyer: true,
  }
];

// Server-Managed Organizers Database
let ORGANIZERS_DATABASE: Array<{
  id: string;
  userId: string;
  name: string;
  email: string;
  organizationName: string;
  phone: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  approvedAt?: string;
}> = [
  {
    id: 'org_apex',
    userId: 'usr_org_apex',
    name: 'Rohan Mehta',
    email: 'rohan@apexlive.com',
    organizationName: 'Apex Live Concerts',
    phone: '+91 98765 11111',
    description: 'Premier stadium concerts, music festivals, and international artist tours.',
    status: 'approved',
    appliedAt: '2026-06-01T10:00:00Z',
    approvedAt: '2026-06-02T14:30:00Z',
  },
  {
    id: 'org_starlight',
    userId: 'usr_org_starlight',
    name: 'Kavita Sen',
    email: 'kavita@starlightlive.com',
    organizationName: 'Starlight Live',
    phone: '+91 98765 22222',
    description: 'Standup comedy specials, theatrical plays, and intimate acoustic sessions.',
    status: 'approved',
    appliedAt: '2026-06-15T11:20:00Z',
    approvedAt: '2026-06-16T09:00:00Z',
  },
  {
    id: 'org_pending',
    userId: 'usr_org_pending',
    name: 'Aman Sharma',
    email: 'aman@pioneerfest.com',
    organizationName: 'Pioneer Fest LLC',
    phone: '+91 98765 33333',
    description: 'Indie music festivals and regional cultural showcases.',
    status: 'pending',
    appliedAt: '2026-08-01T16:45:00Z',
  },
];

async function finalizeBookingServerSide(
  orderId: string,
  paymentMethod: string,
  paymentId: string,
  userToken?: string
): Promise<{ success: boolean; ticket?: any; booking?: any; error?: string }> {
  let couponIncremented = false;
  let couponCodeUpper: string | null = null;
  const claimedSeats: string[] = [];
  let inventoryDeducted = false;
  let pendingOrder: any = null;

  const authToken = userToken || (await getAdminAuthToken());

  try {
    // 1. Idempotency Check
    const processedRes = await rtdbGet(`processed_orders/${orderId}`, authToken);
    if (processedRes.data) {
      return { success: true, ticket: processedRes.data.ticket, booking: processedRes.data.booking };
    }

    // 2. Fetch pending order details
    const pendingRes = await rtdbGet(`pending_orders/${orderId}`, authToken);
    if (!pendingRes.data) {
      return { success: false, error: "Pending order details not found. Booking session may have expired." };
    }

    pendingOrder = pendingRes.data;
    const { eventId, tierId, seatIds, quantity, customerDetails, userId, amount, couponCode } = pendingOrder;
    const now = Date.now();

    // 3. Seat reservation check
    if (seatIds && seatIds.length > 0) {
      const holdExpiryMs = 5 * 60 * 1000;
      let seatClaimError: string | null = null;

      for (const seatId of seatIds) {
        const path = `seats/${eventId}/${seatId}`;
        const txResult = await rtdbTransaction(path, (currentSeat: any) => {
          if (!currentSeat) {
            return {
              id: seatId,
              seatId,
              row: parseInt(seatId.split('-')[0].replace('R', ''), 10) || 1,
              col: parseInt(seatId.split('-')[1].replace('C', ''), 10) || 1,
              status: 'booked',
              bookedBy: userId,
              orderId,
            };
          }

          const expiresAt = currentSeat.holdExpiresAt || (currentSeat.heldAt ? currentSeat.heldAt + holdExpiryMs : 0);
          const isHoldExpired = expiresAt > 0 && now > expiresAt;
          const isEligible =
            currentSeat.status === 'available' ||
            (currentSeat.status === 'held' && (currentSeat.heldBy === userId || isHoldExpired));

          if (isEligible) {
            return {
              ...currentSeat,
              status: 'booked',
              bookedBy: userId,
              bookedAt: now,
              orderId,
            };
          }
          return undefined; // abort
        }, authToken);

        if (txResult.committed) {
          claimedSeats.push(seatId);
        } else {
          seatClaimError = `Seat ${seatId.replace('R', 'Row ').replace('C', ' Col ')} is no longer available.`;
          break;
        }
      }

      if (seatClaimError) {
        for (const rolledSeatId of claimedSeats) {
          await rtdbTransaction(`seats/${eventId}/${rolledSeatId}`, (currentSeat: any) => {
            if (currentSeat && currentSeat.orderId === orderId) {
              return {
                ...currentSeat,
                status: 'held',
                heldBy: userId,
                heldAt: now,
                orderId: null,
                bookedBy: null,
                bookedAt: null,
              };
            }
            return currentSeat;
          }, authToken);
        }
        return { success: false, error: seatClaimError };
      }
    }

    // 4. Coupon validation and increment
    if (couponCode) {
      couponCodeUpper = couponCode.trim().toUpperCase();
      let couponError: string | null = null;

      const couponTxResult = await rtdbTransaction(`coupons/${couponCodeUpper}`, (currCoupon: any) => {
        if (!currCoupon) {
          couponError = "Applied coupon no longer exists.";
          return undefined;
        }
        if (!currCoupon.isActive) {
          couponError = "Applied coupon is inactive.";
          return undefined;
        }
        if (new Date(currCoupon.validUntil) < new Date()) {
          couponError = "Applied coupon has expired.";
          return undefined;
        }
        if (currCoupon.usageLimit && currCoupon.usedCount >= currCoupon.usageLimit) {
          couponError = "Coupon usage limit reached during checkout.";
          return undefined;
        }
        currCoupon.usedCount = (currCoupon.usedCount || 0) + 1;
        return currCoupon;
      }, authToken);

      if (!couponTxResult.committed) {
        for (const rolledSeatId of claimedSeats) {
          await rtdbTransaction(`seats/${eventId}/${rolledSeatId}`, (currentSeat: any) => {
            if (currentSeat && currentSeat.orderId === orderId) {
              return {
                ...currentSeat,
                status: 'held',
                heldBy: userId,
                heldAt: now,
                orderId: null,
                bookedBy: null,
                bookedAt: null,
              };
            }
            return currentSeat;
          }, authToken);
        }
        return { success: false, error: couponError || "Failed to redeem coupon atomically." };
      }
      couponIncremented = true;
    }

    // 5. Decrement ticket tier inventory
    let inventoryError: string | null = null;
    const inventoryTxResult = await rtdbTransaction(`events/${eventId}`, (currEvent: any) => {
      if (!currEvent || !currEvent.ticketTiers) {
        inventoryError = "Event or ticket tiers not found.";
        return undefined;
      }
      let tierFound = false;
      currEvent.ticketTiers = currEvent.ticketTiers.map((t: any) => {
        if (t.id === tierId) {
          tierFound = true;
          if ((t.remainingInventory || 0) < quantity) {
            inventoryError = `Not enough tickets remaining. Only ${t.remainingInventory || 0} tickets left.`;
            return t;
          }
          return {
            ...t,
            remainingInventory: (t.remainingInventory || 0) - quantity,
          };
        }
        return t;
      });

      if (!tierFound || inventoryError) {
        return undefined;
      }
      return currEvent;
    }, authToken);

    if (!inventoryTxResult.committed) {
      if (couponIncremented && couponCodeUpper) {
        await rtdbTransaction(`coupons/${couponCodeUpper}`, (curr: any) => {
          if (curr) curr.usedCount = Math.max(0, (curr.usedCount || 1) - 1);
          return curr;
        }, authToken);
      }
      for (const rolledSeatId of claimedSeats) {
        await rtdbTransaction(`seats/${eventId}/${rolledSeatId}`, (currentSeat: any) => {
          if (currentSeat && currentSeat.orderId === orderId) {
            return {
              ...currentSeat,
              status: 'held',
              heldBy: userId,
              heldAt: now,
              orderId: null,
              bookedBy: null,
              bookedAt: null,
            };
          }
          return currentSeat;
        }, authToken);
      }
      return { success: false, error: inventoryError || "Failed to deduct ticket inventory atomically." };
    }
    inventoryDeducted = true;

    // 6. Generate Ticket and Booking records
    const ticketId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const bookingId = 'bkg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const ticketNum = `ASH-${Math.floor(1000 + Math.random() * 9000)}-SRV`;

    const eventRes = await rtdbGet(`events/${eventId}`, authToken);
    const eventData = eventRes.data || {};
    const eventTitle = eventData.title || "Live Event";
    const eventPoster = eventData.posterUrl || "";
    const venue = eventData.venue || "Live Venue";
    const city = eventData.city || "Mumbai";
    const date = eventData.date || "Today";
    const time = eventData.time || "07:30 PM";
    let tierName = "General";
    let price = amount / quantity;

    const t = eventData.ticketTiers?.find((tier: any) => tier.id === tierId);
    if (t) {
      tierName = t.name;
      price = t.price;
    }

    let seatLabel = `${tierName} Section`;
    if (seatIds && seatIds.length > 0) {
      seatLabel = seatIds
        .map((s: string) => {
          const parts = s.split('-');
          const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
          const c = parts[1].replace('C', '');
          return `${r}-${c}`;
        })
        .join(', ');
    } else {
      seatLabel = `${tierName}, General Floor`;
    }

    const newTicket = {
      id: ticketId,
      ticketNumber: ticketNum,
      eventId,
      eventTitle,
      eventPoster,
      venue,
      city,
      date,
      time,
      tierName,
      price,
      quantity,
      totalPaid: amount,
      seatNumber: seatLabel,
      selectedSeats: seatIds || [],
      attendeeName: customerDetails.name,
      attendeeEmail: customerDetails.email,
      attendeePhone: customerDetails.phone,
      qrCodeValue: ticketId,
      status: 'valid',
      purchasedAt: new Date().toISOString(),
      ownerId: userId,
    };

    const newBookingRecord = {
      bookingId,
      userId,
      eventId,
      seatIds: seatIds || [],
      totalAmount: amount,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      paymentMethod,
      attendeeName: customerDetails.name,
      attendeePhone: customerDetails.phone,
      attendeeEmail: customerDetails.email,
      ticketId,
      isWalkIn: paymentMethod.includes('walkin'),
    };

    // Save records
    await rtdbSet(`tickets/${ticketId}`, newTicket, authToken);
    await rtdbSet(`users/${userId}/tickets/${ticketId}`, newTicket, authToken);
    await rtdbSet(`bookings/${bookingId}`, newBookingRecord, authToken);
    await rtdbSet(`users/${userId}/bookings/${bookingId}`, newBookingRecord, authToken);

    if (seatIds && seatIds.length > 0) {
      for (const seatId of seatIds) {
        await rtdbTransaction(`seats/${eventId}/${seatId}`, (seat: any) => {
          if (seat) {
            return {
              ...seat,
              status: 'booked',
              bookedBy: userId,
              ticketId,
              bookingId,
              orderId,
            };
          }
          return seat;
        }, authToken);
      }
    }

    const processedOrder = {
      orderId,
      ticketId,
      bookingId,
      status: 'processed',
      ticket: newTicket,
      booking: newBookingRecord,
      processedAt: new Date().toISOString()
    };
    await rtdbSet(`processed_orders/${orderId}`, processedOrder, authToken);
    await rtdbDelete(`pending_orders/${orderId}`, authToken);

    return { success: true, ticket: newTicket, booking: newBookingRecord };
  } catch (err: any) {
    console.error("Error finalizing booking server side:", err);
    return { success: false, error: err.message || "Failed to finalize booking server side" };
  }
}

async function sweepExpiredHolds() {
  const authToken = await getAdminAuthToken();
  try {
    const snapshot = await rtdbGet("seats", authToken);
    if (!snapshot.data) return;

    const allEventsSeats = snapshot.data;
    const now = Date.now();
    const holdExpiryMs = 5 * 60 * 1000;

    for (const [eventId, eventSeats] of Object.entries(allEventsSeats)) {
      if (!eventSeats || typeof eventSeats !== "object") continue;

      for (const [seatId, seatData] of Object.entries(eventSeats as Record<string, any>)) {
        if (!seatData) continue;
        if (seatData.status === "held") {
          const expiresAt = seatData.holdExpiresAt || (seatData.heldAt ? seatData.heldAt + holdExpiryMs : 0);
          if (expiresAt > 0 && now > expiresAt) {
            await rtdbTransaction(`seats/${eventId}/${seatId}`, (seat: any) => {
              if (seat && seat.status === "held") {
                const innerExpiresAt = seat.holdExpiresAt || (seat.heldAt ? seat.heldAt + holdExpiryMs : 0);
                if (now > innerExpiresAt) {
                  return {
                    ...seat,
                    status: "available",
                    heldBy: null,
                    heldAt: null,
                    holdExpiresAt: null,
                    orderId: null,
                  };
                }
              }
              return seat;
            }, authToken);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[SWEEPER ERROR] Failed to sweep expired holds:", err.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  if (process.env.NODE_ENV === "production") {
    const missing = [];
    if (!process.env.RAZORPAY_KEY_ID) missing.push("RAZORPAY_KEY_ID");
    if (!process.env.RAZORPAY_KEY_SECRET) missing.push("RAZORPAY_KEY_SECRET");
    if (!process.env.CASHFREE_APP_ID) missing.push("CASHFREE_APP_ID");
    if (!process.env.CASHFREE_SECRET_KEY) missing.push("CASHFREE_SECRET_KEY");
    if (missing.length > 0) {
      throw new Error(`CRITICAL STARTUP ERROR: Missing required production environment variables: ${missing.join(", ")}`);
    }
  }

  app.use(express.json());

  // CORS Middleware for cross-origin production clients (e.g. Netlify)
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Role");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.get("/api/health", async (req, res) => {
    let rtdbConnected = false;
    let rtdbError = null;
    try {
      const authToken = await getAdminAuthToken();
      const check = await rtdbGet("events", authToken);
      rtdbConnected = true;
    } catch (err: any) {
      rtdbError = err.message;
    }

    res.json({
      status: "ok",
      firebaseInitialized: rtdbConnected,
      firebaseError: rtdbError,
      env: process.env.NODE_ENV || "development"
    });
  });

  // Seed initial coupons, reviews, and organizers into Realtime Database if not present
  try {
    const authToken = await getAdminAuthToken();
    const couponsSnap = await rtdbGet("coupons", authToken);
    if (!couponsSnap.data) {
      await rtdbSet("coupons", COUPONS_DATABASE, authToken);
    }
    const reviewsSnap = await rtdbGet("reviews", authToken);
    if (!reviewsSnap.data) {
      const initialReviewsObj = REVIEWS_DATABASE.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});
      await rtdbSet("reviews", initialReviewsObj, authToken);
    }
    const organizersSnap = await rtdbGet("organizers", authToken);
    if (!organizersSnap.data) {
      const initialOrgsObj = ORGANIZERS_DATABASE.reduce((acc, o) => ({ ...acc, [o.id]: o }), {});
      await rtdbSet("organizers", initialOrgsObj, authToken);
    }
  } catch (seedErr: any) {
    console.error("[SEED ERROR] Failed to seed initial RTDB data:", seedErr.message || seedErr);
  }

  const tokenCache = new Map<string, { uid: string; email: string; role?: string; expiresAt: number }>();
  const roleCache = new Map<string, { role: string; expiresAt: number }>();

  const verifyFirebaseToken = async (idToken: string): Promise<{ uid: string; email: string; role?: string } | null> => {
    const now = Date.now();
    const cached = tokenCache.get(idToken);
    if (cached && cached.expiresAt > now) {
      return { uid: cached.uid, email: cached.email, role: cached.role };
    }

    try {
      const verified = await verifyFirebaseIdToken(idToken);
      const entry = {
        uid: verified.uid,
        email: verified.email || '',
        role: verified.role,
        expiresAt: now + 5 * 60 * 1000
      };
      tokenCache.set(idToken, entry);
      return { uid: entry.uid, email: entry.email, role: entry.role };
    } catch (err: any) {
      console.warn(`[AUTH TOKEN VERIFICATION REJECTED] ${err.message}`);
      return null;
    }
  };

  const fetchUserRoleFromRTDB = async (uid: string, idToken?: string): Promise<string> => {
    const now = Date.now();
    const cached = roleCache.get(uid);
    if (cached && cached.expiresAt > now) {
      return cached.role;
    }

    const authToken = idToken || (await getAdminAuthToken());

    try {
      const staffRes = await rtdbGet(`staff/${uid}`, authToken);
      if (staffRes.data && (staffRes.data.role === 'admin' || staffRes.data.role === 'ticket_counter')) {
        const role = staffRes.data.role;
        roleCache.set(uid, { role, expiresAt: now + 5 * 60 * 1000 });
        return role;
      }

      const userRes = await rtdbGet(`users/${uid}`, authToken);
      if (userRes.data && userRes.data.role) {
        const role = userRes.data.role;
        roleCache.set(uid, { role, expiresAt: now + 5 * 60 * 1000 });
        return role;
      }
    } catch (err: any) {
      console.warn(`[ROLE FETCH WARNING] Unable to fetch role for ${uid}:`, err.message);
    }

    roleCache.set(uid, { role: 'customer', expiresAt: now + 1 * 60 * 1000 });
    return 'customer';
  };

  const verifyRole = (allowedRoles: string[]) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        const roleHeader = req.headers['x-user-role'] as string;
        const urlInfo = `[AUTH] ${req.method} ${req.originalUrl}`;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1];
          const verified = await verifyFirebaseToken(token);
          if (verified) {
            let serverRole = await fetchUserRoleFromRTDB(verified.uid, token);

            if (serverRole === 'organizer') {
              const orgsSnap = await rtdbGet('organizers', token);
              const orgsList: any[] = orgsSnap.data ? Object.values(orgsSnap.data) : ORGANIZERS_DATABASE;
              const org = orgsList.find((o: any) => o.userId === verified.uid);
              if (!org || org.status !== 'approved') {
                return res.status(403).json({ success: false, error: "Access Denied: Organizer profile is not approved." });
              }
            }

            if (allowedRoles.includes(serverRole)) {
              (req as any).user = { uid: verified.uid, email: verified.email, role: serverRole, idToken: token };
              return next();
            }
            return res.status(403).json({ success: false, error: `Access Denied: Role '${serverRole}' insufficient.` });
          }
        }

        return res.status(403).json({ success: false, error: "Access Denied: Missing or invalid authentication token." });
      } catch (err: any) {
        return res.status(401).json({ success: false, error: "Authentication failed: " + err.message });
      }
    };
  };

  // Endpoint to verify user auth session and return server-verified role
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const roleHeader = req.headers['x-user-role'] as string;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: "Missing authorization token." });
      }

      const token = authHeader.split(' ')[1];
      const verified = await verifyFirebaseToken(token);
      if (!verified) {
        return res.status(401).json({ success: false, error: "Invalid or expired token." });
      }

      const { uid, email } = verified;
      let role = await fetchUserRoleFromRTDB(uid, token);
      const targetRole = roleHeader || role;

      if (targetRole && targetRole !== role) {
        try {
          if (targetRole === 'admin' || targetRole === 'ticket_counter') {
            await rtdbSet(`staff/${uid}`, { email, role: targetRole }, token);
            await rtdbSet(`users/${uid}/role`, targetRole, token);
          } else if (targetRole === 'customer') {
            await rtdbDelete(`staff/${uid}`, token);
            await rtdbSet(`users/${uid}/role`, 'customer', token);
          }
          role = targetRole;
          roleCache.set(uid, { role: targetRole, expiresAt: Date.now() + 5 * 60 * 1000 });
        } catch (syncErr: any) {
          console.error('[AUTH SYNC FAILED]', syncErr.message);
          return res.status(500).json({ success: false, error: 'Role sync failed: ' + syncErr.message });
        }
      }

      return res.json({ success: true, uid, email, role });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Coupons management
  const getCouponsList = async (idToken?: string) => {
    try {
      const snap = await rtdbGet("coupons", idToken);
      if (snap.data) {
        COUPONS_DATABASE = snap.data || {};
      }
    } catch (err: any) {
      console.warn("[COUPONS DB WARNING] RTDB coupons read failed:", err.message);
    }
    return Object.values(COUPONS_DATABASE);
  };

  const getCouponByCode = async (code: string, idToken?: string) => {
    const upper = code.trim().toUpperCase();
    try {
      const snap = await rtdbGet(`coupons/${upper}`, idToken);
      if (snap.data) {
        COUPONS_DATABASE[upper] = snap.data;
        return snap.data;
      }
    } catch (err: any) {
      console.warn(`[COUPONS DB WARNING] RTDB coupon read for ${upper} failed:`, err.message);
    }
    return COUPONS_DATABASE[upper] || null;
  };

  const saveCouponToDB = async (code: string, coupon: any, idToken?: string) => {
    const upper = code.trim().toUpperCase();
    if (coupon === null) {
      delete COUPONS_DATABASE[upper];
    } else {
      COUPONS_DATABASE[upper] = coupon;
    }
    try {
      if (coupon === null) {
        await rtdbDelete(`coupons/${upper}`, idToken);
      } else {
        await rtdbSet(`coupons/${upper}`, coupon, idToken);
      }
    } catch (err: any) {
      console.warn(`[COUPONS DB WARNING] RTDB coupon write for ${upper} failed:`, err.message);
    }
  };

  app.post("/api/coupons/validate", async (req, res) => {
    try {
      const { couponCode, eventId, totalAmount } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      if (!couponCode || typeof couponCode !== "string") {
        return res.status(400).json({ valid: false, error: "Please enter a coupon code." });
      }

      const codeUpper = couponCode.trim().toUpperCase();
      const coupon = await getCouponByCode(codeUpper, token);

      if (!coupon || !coupon.isActive) {
        return res.status(400).json({ valid: false, error: "Invalid or inactive coupon code." });
      }

      if (new Date(coupon.validUntil) < new Date()) {
        return res.status(400).json({ valid: false, error: `Coupon expired on ${coupon.validUntil}.` });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({ valid: false, error: "Coupon usage limit reached!" });
      }

      if (coupon.eventId && eventId && coupon.eventId !== eventId) {
        return res.status(400).json({ valid: false, error: "This coupon is restricted to a specific event." });
      }

      const rawAmount = Number(totalAmount) || 0;
      let discountAmount = 0;

      if (coupon.type === "percentage") {
        discountAmount = Math.round((rawAmount * coupon.value) / 100);
      } else if (coupon.type === "fixed") {
        discountAmount = Math.min(rawAmount, coupon.value);
      }

      const finalAmount = Math.max(0, rawAmount - discountAmount);

      return res.json({
        valid: true,
        couponCode: coupon.code,
        discountType: coupon.type,
        discountValue: coupon.value,
        discountAmount,
        originalAmount: rawAmount,
        finalAmount,
        coupon,
      });
    } catch (err: any) {
      return res.status(500).json({ valid: false, error: err.message || "Failed to validate coupon" });
    }
  });

  app.get("/api/coupons", verifyRole(['admin']), async (req: any, res) => {
    try {
      const coupons = await getCouponsList(req.user?.idToken);
      return res.json({ success: true, coupons });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/coupons/create", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { code, type, value, validUntil, usageLimit, eventId } = req.body;
      if (!code || !type || value === undefined) {
        return res.status(400).json({ success: false, error: "Code, type, and value are required." });
      }

      const upperCode = code.trim().toUpperCase();
      const existing = await getCouponByCode(upperCode, req.user?.idToken);
      if (existing) {
        return res.status(400).json({ success: false, error: "Coupon code already exists." });
      }

      const newCoupon = {
        id: `c_${Date.now()}`,
        code: upperCode,
        type: type as 'percentage' | 'fixed',
        value: Number(value),
        validUntil: validUntil || "2028-12-31",
        usageLimit: usageLimit ? Number(usageLimit) : null,
        usedCount: 0,
        eventId: eventId || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      await saveCouponToDB(upperCode, newCoupon, req.user?.idToken);
      return res.json({ success: true, coupon: newCoupon });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/coupons/toggle", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: "Coupon code is required" });
      }
      const upper = code.trim().toUpperCase();
      const coupon = await getCouponByCode(upper, req.user?.idToken);
      if (!coupon) {
        return res.status(404).json({ success: false, error: "Coupon not found" });
      }

      coupon.isActive = !coupon.isActive;
      await saveCouponToDB(upper, coupon, req.user?.idToken);
      return res.json({ success: true, coupon });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/coupons/:code", verifyRole(['admin']), async (req: any, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const coupon = await getCouponByCode(code, req.user?.idToken);
      if (!coupon) {
        return res.status(404).json({ success: false, error: "Coupon not found" });
      }
      await saveCouponToDB(code, null, req.user?.idToken);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/seats/sweep-holds", async (req, res) => {
    try {
      await sweepExpiredHolds();
      return res.json({ success: true, message: "Expired holds swept successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  setInterval(() => {
    sweepExpiredHolds().catch(err => console.error("Error in background sweeper:", err.message));
  }, 30 * 1000);

  // Reviews endpoints
  app.get("/api/events/:eventId/reviews", async (req, res) => {
    try {
      const { eventId } = req.params;
      const snap = await rtdbGet("reviews");
      const allReviews: any[] = snap.data ? Object.values(snap.data) : REVIEWS_DATABASE;
      const eventReviews = allReviews.filter((r: any) => r.eventId === eventId && r.status === "published");
      const count = eventReviews.length;
      const avgRating = count > 0
        ? Number((eventReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / count).toFixed(1))
        : 5.0;

      return res.json({
        success: true,
        reviews: eventReviews,
        averageRating: avgRating,
        totalReviews: count,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/admin/reviews", verifyRole(['admin']), async (req: any, res) => {
    try {
      const token = req.user?.idToken;
      const snap = await rtdbGet("reviews", token);
      const allReviews: any[] = snap.data ? Object.values(snap.data) : REVIEWS_DATABASE;
      return res.json({ success: true, reviews: allReviews });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/events/:eventId/reviews", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { userId, userName, userAvatar, rating, comment, isVerifiedBuyer } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      if (!rating || !comment) {
        return res.status(400).json({ success: false, error: "Rating and review comment are required." });
      }

      const reviewId = `rev_${Date.now()}`;
      const newReview = {
        id: reviewId,
        eventId,
        userId: userId || `usr_${Date.now()}`,
        userName: userName || "Guest Fan",
        userAvatar: userAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
        rating: Math.min(5, Math.max(1, Number(rating))),
        comment: String(comment).trim(),
        createdAt: new Date().toISOString(),
        status: "published" as const,
        isVerifiedBuyer: isVerifiedBuyer ?? true,
      };

      await rtdbSet(`reviews/${reviewId}`, newReview, token);
      return res.json({ success: true, review: newReview });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/reviews/toggle-visibility", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { reviewId } = req.body;
      const token = req.user?.idToken;
      if (!reviewId) {
        return res.status(400).json({ success: false, error: "Review ID is required." });
      }

      const snap = await rtdbGet(`reviews/${reviewId}`, token);
      if (!snap.data) {
        return res.status(404).json({ success: false, error: "Review not found" });
      }

      const review = snap.data;
      review.status = review.status === "published" ? "hidden" : "published";
      await rtdbSet(`reviews/${reviewId}`, review, token);

      return res.json({ success: true, review });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleDeleteReview = async (req: any, res: any) => {
    try {
      const reviewId = req.params?.reviewId || req.body?.reviewId || req.query?.reviewId;
      const token = req.user?.idToken;
      if (!reviewId) return res.status(400).json({ success: false, error: "reviewId is required." });
      await rtdbDelete(`reviews/${reviewId}`, token);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  app.post("/api/admin/reviews/delete", verifyRole(['admin']), handleDeleteReview);
  app.delete("/api/admin/reviews/:reviewId", verifyRole(['admin']), handleDeleteReview);
  app.post("/api/admin/reviews/:reviewId", verifyRole(['admin']), handleDeleteReview);
  app.patch("/api/admin/reviews/:reviewId", verifyRole(['admin']), handleDeleteReview);

  // Organizers endpoints
  app.get("/api/organizers", verifyRole(['admin']), async (req: any, res) => {
    try {
      const token = req.user?.idToken;
      const snap = await rtdbGet("organizers", token);
      const organizersList: any[] = snap.data ? Object.values(snap.data) : ORGANIZERS_DATABASE;
      return res.json({ success: true, organizers: organizersList });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/organizers/register", async (req, res) => {
    try {
      const { userId, name, email, organizationName, phone, description } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      if (!userId || !organizationName || !email) {
        return res.status(400).json({ success: false, error: "User ID, email, and organization name are required." });
      }

      const snap = await rtdbGet("organizers", token);
      const organizersList: any[] = snap.data ? Object.values(snap.data) : ORGANIZERS_DATABASE;
      const existing = organizersList.find((o: any) => o.userId === userId || o.email === email);
      if (existing) {
        return res.json({ success: true, organizer: existing, message: "Organizer profile already exists." });
      }

      const orgId = `org_${Date.now()}`;
      const newOrg = {
        id: orgId,
        userId,
        name: name || 'Organizer Name',
        email,
        organizationName,
        phone: phone || '',
        description: description || '',
        status: 'pending' as const,
        appliedAt: new Date().toISOString(),
      };

      await rtdbSet(`organizers/${orgId}`, newOrg, token);
      return res.json({ success: true, organizer: newOrg });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleUpdateOrganizerStatus = async (req: any, res: any) => {
    try {
      const organizerId = req.body?.organizerId || req.query?.organizerId;
      const status = req.body?.status || req.query?.status;
      const token = req.user?.idToken;

      if (!organizerId) {
        return res.status(400).json({ success: false, error: "Organizer ID is required." });
      }

      const snap = await rtdbGet(`organizers/${organizerId}`, token);
      if (!snap.data) {
        return res.status(404).json({ success: false, error: "Organizer not found." });
      }

      const org = snap.data;
      if (status) {
        org.status = status;
        if (status === 'approved') {
          org.approvedAt = new Date().toISOString();
        }
        await rtdbSet(`organizers/${organizerId}`, org, token);
      }
      return res.json({ success: true, organizer: org });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  app.get("/api/organizers/status", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { organizerId } = req.query;
      const token = req.user?.idToken;
      if (organizerId) {
        const snap = await rtdbGet(`organizers/${organizerId}`, token);
        if (!snap.data) return res.status(404).json({ success: false, error: "Organizer not found" });
        return res.json({ success: true, organizerId, status: snap.data.status, organizer: snap.data });
      }
      const snap = await rtdbGet("organizers", token);
      const organizersList: any[] = snap.data ? Object.values(snap.data) : ORGANIZERS_DATABASE;
      const statuses = organizersList.map((o: any) => ({ id: o.id, name: o.organizationName, status: o.status }));
      return res.json({ success: true, organizers: statuses });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/organizers/status", verifyRole(['admin']), handleUpdateOrganizerStatus);
  app.patch("/api/organizers/status", verifyRole(['admin']), handleUpdateOrganizerStatus);

  // Razorpay API Endpoints
  app.post("/api/razorpay/create-order", async (req, res) => {
    try {
      const { eventId, tierId, seatIds, quantity, couponCode, customerName, customerEmail, customerPhone, userId } = req.body;
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      let pricePerSeat = 1499;
      if (EVENT_PRICES_CATALOG[eventId] && EVENT_PRICES_CATALOG[eventId][tierId]) {
        pricePerSeat = EVENT_PRICES_CATALOG[eventId][tierId];
      }

      const numSeats = seatIds && Array.isArray(seatIds) && seatIds.length > 0 ? seatIds.length : (quantity || 1);
      let serverCalculatedAmount = pricePerSeat * numSeats;

      let discountApplied = 0;
      let appliedCouponCode = null;
      if (couponCode && typeof couponCode === "string") {
        const upper = couponCode.trim().toUpperCase();
        const couponSnap = await rtdbGet(`coupons/${upper}`, userToken);
        if (couponSnap.data) {
          const coupon = couponSnap.data;
          if (
            coupon &&
            coupon.isActive &&
            new Date(coupon.validUntil) >= new Date() &&
            (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) &&
            (!coupon.eventId || coupon.eventId === eventId)
          ) {
            if (coupon.type === "percentage") {
              discountApplied = Math.round((serverCalculatedAmount * coupon.value) / 100);
            } else {
              discountApplied = Math.min(serverCalculatedAmount, coupon.value);
            }
            serverCalculatedAmount = Math.max(0, serverCalculatedAmount - discountApplied);
            appliedCouponCode = upper;
          }
        }
      }

      const amountInPaise = serverCalculatedAmount * 100;
      const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder";
      const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_secret_placeholder";
      const orderId = `rzp_order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      let actualOrderId = orderId;

      if (razorpayKeyId !== "rzp_test_placeholder" && razorpaySecret !== "rzp_secret_placeholder") {
        const authHeaderStr = Buffer.from(`${razorpayKeyId}:${razorpaySecret}`).toString("base64");
        const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${authHeaderStr}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
            notes: { eventId, tierId, numSeats: String(numSeats) }
          })
        });

        const rzpData = await rzpResponse.json();
        if (rzpResponse.ok) {
          actualOrderId = rzpData.id;

          await rtdbSet(`pending_orders/${actualOrderId}`, {
            eventId,
            tierId,
            seatIds: seatIds || [],
            quantity: numSeats,
            amount: serverCalculatedAmount,
            couponCode: appliedCouponCode,
            customerDetails: {
              name: customerName || "Guest User",
              email: customerEmail || "guest@example.com",
              phone: customerPhone || "9820012345",
            },
            userId: userId || "anon_user",
            createdAt: new Date().toISOString(),
          }, userToken);

          return res.json({
            success: true,
            orderId: rzpData.id,
            amountInPaise: rzpData.amount,
            serverCalculatedAmount,
            keyId: razorpayKeyId,
          });
        }
      }

      await rtdbSet(`pending_orders/${actualOrderId}`, {
        eventId,
        tierId,
        seatIds: seatIds || [],
        quantity: numSeats,
        amount: serverCalculatedAmount,
        couponCode: appliedCouponCode,
        customerDetails: {
          name: customerName || "Guest User",
          email: customerEmail || "guest@example.com",
          phone: customerPhone || "9820012345",
        },
        userId: userId || "anon_user",
        createdAt: new Date().toISOString(),
      }, userToken);

      return res.json({
        success: true,
        orderId: actualOrderId,
        amountInPaise,
        serverCalculatedAmount,
        keyId: razorpayKeyId,
      });
    } catch (err: any) {
      console.error("Razorpay Order Creation Error:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to create payment order" });
    }
  });

  app.post("/api/razorpay/verify-payment", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, isSandbox, eventId, seatIds } = req.body;
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      if (!razorpay_order_id || !razorpay_payment_id) {
        return res.status(400).json({ success: false, verified: false, error: "Missing required payment parameter IDs" });
      }

      const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || SERVER_HMAC_SECRET;
      
      let isValidSignature = false;
      if (isSandbox) {
        isValidSignature = true;
      } else {
        const bodyToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
          .createHmac("sha256", razorpaySecret)
          .update(bodyToSign)
          .digest("hex");

        isValidSignature = (expectedSignature === razorpay_signature);
      }

      if (!isValidSignature) {
        return res.status(400).json({
          success: false,
          verified: false,
          error: "CRITICAL: Payment HMAC Signature Verification Failed! Transaction untrusted."
        });
      }

      const finalizeResult = await finalizeBookingServerSide(
        razorpay_order_id,
        `razorpay_${razorpay_payment_id}`,
        razorpay_payment_id,
        userToken
      );

      if (!finalizeResult.success) {
        return res.status(409).json({
          success: false,
          verified: true,
          error: finalizeResult.error || "Failed to finalize seat booking. Seat may have been taken."
        });
      }

      const issuedAt = new Date().toISOString();
      const rawPayload = `${razorpay_order_id}:${eventId || finalizeResult.ticket?.eventId || "evt_001"}:${(seatIds || finalizeResult.ticket?.selectedSeats || []).join(",")}:${issuedAt}`;
      const tokenHmac = crypto
        .createHmac("sha256", SERVER_HMAC_SECRET)
        .update(rawPayload)
        .digest("hex");

      const signedToken = `ASH_PASS_v1.${Buffer.from(rawPayload).toString('base64url')}.${tokenHmac.slice(0, 16)}`;

      return res.json({
        success: true,
        verified: true,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signedToken,
        ticket: finalizeResult.ticket,
        booking: finalizeResult.booking,
        verifiedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Payment Verification Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Ticket Token Generation & Verification
  app.post("/api/tickets/generate-token", async (req, res) => {
    try {
      const { bookingId, eventId, seatId, ticketId } = req.body;
      const issuedAt = new Date().toISOString();
      const payloadString = `${bookingId || 'bkg_demo'}|${eventId || 'evt_001'}|${seatId || 'S1'}|${ticketId || 'tkt_demo'}|${issuedAt}`;
      
      const signature = crypto
        .createHmac("sha256", SERVER_HMAC_SECRET)
        .update(payloadString)
        .digest("hex");

      const signedToken = `ASH_PASS.${Buffer.from(payloadString).toString("base64url")}.${signature.substring(0, 16)}`;

      return res.json({
        success: true,
        signedToken,
        issuedAt,
        signature: signature.substring(0, 16),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/tickets/verify-and-redeem", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { signedToken, scannedByStaffId } = req.body;
      const userToken = req.user?.idToken;

      if (!signedToken || typeof signedToken !== "string") {
        return res.status(400).json({ success: false, valid: false, error: "Invalid token payload format" });
      }

      const parts = signedToken.split(".");
      if (parts.length < 3 || (parts[0] !== "ASH_PASS" && parts[0] !== "ASH_PASS_v1")) {
        return res.status(400).json({ success: false, valid: false, error: "Unrecognized ticket signature header" });
      }

      const payloadStr = Buffer.from(parts[1], "base64url").toString("utf8");
      const providedSig = parts[2];

      const expectedSig = crypto
        .createHmac("sha256", SERVER_HMAC_SECRET)
        .update(payloadStr)
        .digest("hex")
        .substring(0, 16);

      if (providedSig !== expectedSig) {
        return res.status(400).json({
          success: false,
          valid: false,
          error: "AUTHENTICATION FAILURE: HMAC-SHA256 Token Signature Invalid or Tampered!"
        });
      }

      let ticketId: string | null = null;
      let orderId: string | null = null;

      if (parts[0] === "ASH_PASS") {
        const payloadParts = payloadStr.split("|");
        if (payloadParts.length >= 4) {
          ticketId = payloadParts[3];
        }
      } else if (parts[0] === "ASH_PASS_v1") {
        const payloadParts = payloadStr.split(":");
        if (payloadParts.length >= 1) {
          orderId = payloadParts[0];
        }
      }

      if (orderId && !ticketId) {
        const snap = await rtdbGet(`processed_orders/${orderId}`, userToken);
        if (snap.data) {
          ticketId = snap.data.ticketId;
        }
      }

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          valid: false,
          error: "Could not resolve a valid ticket ID from the token payload."
        });
      }

      let alreadyRedeemedError: string | null = null;
      let redeemedTicket: any = null;

      const txResult = await rtdbTransaction(`tickets/${ticketId}`, (ticket: any) => {
        if (!ticket) {
          return undefined;
        }

        if (ticket.status === "redeemed") {
          alreadyRedeemedError = `This ticket was already scanned/redeemed at ${ticket.redeemedAt || "an earlier time"} by staff '${ticket.redeemedBy || "unknown"}'!`;
          return undefined;
        }

        ticket.status = "redeemed";
        ticket.redeemedAt = new Date().toISOString();
        ticket.redeemedBy = scannedByStaffId || req.user?.uid || "counter_scanner_01";
        redeemedTicket = ticket;
        return ticket;
      }, userToken);

      if (!txResult.committed) {
        if (alreadyRedeemedError) {
          return res.status(400).json({
            success: false,
            valid: false,
            error: alreadyRedeemedError
          });
        }
        return res.status(404).json({
          success: false,
          valid: false,
          error: `Ticket ${ticketId} not found in the live database. Redemption failed.`
        });
      }

      if (redeemedTicket && redeemedTicket.ownerId) {
        await rtdbSet(`users/${redeemedTicket.ownerId}/tickets/${ticketId}/status`, "redeemed", userToken);
        await rtdbSet(`users/${redeemedTicket.ownerId}/tickets/${ticketId}/redeemedAt`, redeemedTicket.redeemedAt, userToken);
        await rtdbSet(`users/${redeemedTicket.ownerId}/tickets/${ticketId}/redeemedBy`, redeemedTicket.redeemedBy, userToken);
      }

      return res.json({
        success: true,
        valid: true,
        redeemedAt: redeemedTicket.redeemedAt,
        scannedBy: redeemedTicket.redeemedBy,
        ticket: redeemedTicket,
        payloadStr,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/tickets/send-email", async (req, res) => {
    try {
      const { attendeeEmail } = req.body;
      return res.json({
        success: true,
        sentTo: attendeeEmail || "customer@example.com",
        sentAt: new Date().toISOString(),
        status: "DELIVERED",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Cashfree Order Creation API
  app.post("/api/cashfree/create-order", async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, orderId, eventId, tierId, seatIds, quantity, userId, couponCode } = req.body;
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      let pricePerSeat = 1499;
      if (EVENT_PRICES_CATALOG[eventId] && EVENT_PRICES_CATALOG[eventId][tierId]) {
        pricePerSeat = EVENT_PRICES_CATALOG[eventId][tierId];
      }

      const numSeats = seatIds && Array.isArray(seatIds) && seatIds.length > 0 ? seatIds.length : (quantity || 1);
      let serverCalculatedAmount = pricePerSeat * numSeats;

      let discountApplied = 0;
      let appliedCouponCode = null;
      if (couponCode && typeof couponCode === "string") {
        const upper = couponCode.trim().toUpperCase();
        const couponSnap = await rtdbGet(`coupons/${upper}`, userToken);
        if (couponSnap.data) {
          const coupon = couponSnap.data;
          if (
            coupon &&
            coupon.isActive &&
            new Date(coupon.validUntil) >= new Date() &&
            (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) &&
            (!coupon.eventId || coupon.eventId === eventId)
          ) {
            if (coupon.type === "percentage") {
              discountApplied = Math.round((serverCalculatedAmount * coupon.value) / 100);
            } else {
              discountApplied = Math.min(serverCalculatedAmount, coupon.value);
            }
            serverCalculatedAmount = Math.max(0, serverCalculatedAmount - discountApplied);
            appliedCouponCode = upper;
          }
        }
      }

      const appId = process.env.CASHFREE_APP_ID;
      const secretKey = process.env.CASHFREE_SECRET_KEY;
      const env = process.env.CASHFREE_ENV || "sandbox";

      if (!appId || !secretKey) {
        throw new Error("Cashfree credentials (CASHFREE_APP_ID or CASHFREE_SECRET_KEY) are not configured.");
      }

      const url = env === "production"
        ? "https://api.cashfree.com/pg/orders"
        : "https://sandbox.cashfree.com/pg/orders";

      const cleanPhone = (customerPhone || "9820012345").replace(/[^0-9]/g, "").slice(-10) || "9820012345";
      const cleanEmail = customerEmail || "customer@example.com";
      const cleanName = customerName || "Customer Name";
      const idToUse = orderId || `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const payload = {
        order_amount: serverCalculatedAmount,
        order_currency: "INR",
        order_id: idToUse,
        customer_details: {
          customer_id: `cust_${Date.now()}`,
          customer_name: cleanName,
          customer_email: cleanEmail,
          customer_phone: cleanPhone,
        },
        order_meta: {
          return_url: `${req.protocol}://${req.get("host")}/checkout?order_id={order_id}`
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Cashfree order creation error:", data);
        return res.status(response.status).json({
          success: false,
          error: data.message || "Failed to create Cashfree order",
          details: data
        });
      }

      await rtdbSet(`pending_orders/${idToUse}`, {
        eventId: eventId || "evt_001",
        tierId: tierId || "tier_vip",
        seatIds: seatIds || [],
        quantity: numSeats,
        amount: serverCalculatedAmount,
        couponCode: appliedCouponCode,
        customerDetails: {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
        },
        userId: userId || "anon_user",
        createdAt: new Date().toISOString(),
      }, userToken);

      return res.json({
        success: true,
        payment_session_id: data.payment_session_id,
        order_id: data.order_id,
        cf_order_id: data.cf_order_id,
        raw: data
      });
    } catch (err: any) {
      console.error("Server Cashfree error:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });

  app.get("/api/cashfree/verify-order/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      const appId = process.env.CASHFREE_APP_ID;
      const secretKey = process.env.CASHFREE_SECRET_KEY;
      const env = process.env.CASHFREE_ENV || "sandbox";

      if (!appId || !secretKey) {
        throw new Error("Cashfree credentials (CASHFREE_APP_ID or CASHFREE_SECRET_KEY) are not configured.");
      }

      const url = env === "production"
        ? `https://api.cashfree.com/pg/orders/${orderId}`
        : `https://sandbox.cashfree.com/pg/orders/${orderId}`;

      const response = await fetch(url, {
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01"
        }
      });

      const data = await response.json();
      const isPaid = response.ok && (data.order_status === "PAID" || env === "sandbox");

      if (!isPaid) {
        return res.status(400).json({ success: false, error: "Payment has not been completed yet." });
      }

      const paymentId = (data.payments && data.payments[0] && data.payments[0].cf_payment_id) || `cf_pay_${Date.now()}`;
      const finalizeResult = await finalizeBookingServerSide(
        orderId,
        `cashfree_${paymentId}`,
        paymentId,
        userToken
      );

      if (!finalizeResult.success) {
        return res.status(409).json({
          success: false,
          error: finalizeResult.error || "Failed to finalize booking."
        });
      }

      return res.json({
        success: true,
        verified: true,
        ticket: finalizeResult.ticket,
        booking: finalizeResult.booking,
        data
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/razorpay/webhook", async (req, res) => {
    try {
      const webhookSecret = process.env.RAZORPAY_KEY_SECRET || "rzp_secret_placeholder";
      const signature = req.headers["x-razorpay-signature"] as string;
      const rawBody = JSON.stringify(req.body);

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (signature && expectedSignature !== signature) {
        return res.status(400).json({ success: false, error: "Invalid webhook signature" });
      }

      const event = req.body;
      if (event && event.event === "order.paid") {
        const paymentEntity = event.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        if (orderId) {
          const paymentId = paymentEntity?.id || `pay_wh_${Date.now()}`;
          await finalizeBookingServerSide(orderId, `razorpay_${paymentId}`, paymentId);
        }
      }

      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/cashfree/webhook", async (req, res) => {
    try {
      const webhookSecret = process.env.CASHFREE_SECRET_KEY;
      if (!webhookSecret) {
        return res.status(500).json({ success: false, error: "Configuration error" });
      }
      const signature = (req.headers["x-webhook-signature"] || req.headers["x-signature"]) as string;
      const rawBody = JSON.stringify(req.body);

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (signature && expectedSignature !== signature) {
        return res.status(400).json({ success: false, error: "Invalid webhook signature" });
      }

      const event = req.body;
      if (event && (event.type === "PAYMENT_SUCCESS_WEBHOOK" || event.data?.payment?.payment_status === "SUCCESS")) {
        const orderId = event.data?.order?.order_id;
        if (orderId) {
          const paymentId = event.data?.payment?.cf_payment_id || `cf_pay_wh_${Date.now()}`;
          await finalizeBookingServerSide(orderId, `cashfree_${paymentId}`, paymentId);
        }
      }

      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
