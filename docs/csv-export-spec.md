# Report Panel — Comprehensive CSV Export Specification

**Status:** Draft v1 (PRD)
**Scope:** `src/pages/admin/AdminReports.tsx` reports panel + new server export endpoint.
**Source of truth:** Firebase RTDB nodes `tickets`, `bookings`, `orders`, `pending_orders`, `events`, `counters`, `counter_shifts`, `coupons`, as written by `server.ts` (verified against `finalizeBookingServerSide`, `recordOrder`, walk-in endpoint, refund endpoint, shift start/close endpoints).

---

## 1. Purpose

Replace the current per-event summary-only CSV export with a **complete, row-level export** that captures *every detail* the system stores about:

- event bookings (who booked, contact info, seats, tickets)
- financials (price, amounts paid, discounts, refunds)
- revenue totals and breakdowns
- bookable counters (capacity, sold, remaining slots)
- counter information (IDs, statuses, staff, timestamps)
- counter shifts (cash reconciliation)

No aggregation at row level; totals appear **only** in the summary export (explicitly required by the product brief).

---

## 2. Data model → CSV mapping (verified fields)

| RTDB node | Grain | Key fields (as persisted by server) |
|---|---|---|
| `tickets/<ticketId>` | 1 row per ticket line (a multi-type order produces one row per tier) | `id, ticketNumber, eventId, orderId, bookingId, eventTitle, eventPoster, venue, city, date, time, tierId, tierName, price, quantity, totalPaid, discount, seatNumber, selectedSeats[], attendeeName, attendeeEmail, attendeePhone, qrCodeValue, passSlug, passType, paymentStatus, amountDue, status, purchasedAt, ownerId, paymentMethod, payments[], reservationId, counterId, counterName, shiftId, issuedBySubUserId, issuedBySubUserName, scannedByStaffId, createdByStaffId, scannedBy, scannedAt, refundAmount, refundReason, refundedAt, refundedBy, cancelledReason, statusChangedAt` |
| `bookings/<bookingId>` | 1 row per booking | `bookingId, userId, eventId, seatIds[], totalAmount, discount, status, paymentStatus, amountDue, createdAt, paymentMethod, attendeeName, attendeePhone, attendeeEmail, ticketId, ticketIds[], isWalkIn, issuedBySubUserId, issuedBySubUserName, reservationId` |
| `orders/<orderId>` | 1 row per order | `orderId, eventId, tierId, seatIds[], quantity, items[], customerDetails{name,email,phone}, amount, discount, couponCode, paymentMethod, paymentStatus, amountDue, channel, status, refundReason, refundAmount, refundedAt, refundedBy, ticketId, bookingId, createdAt, createdBy, shiftId, counterId, counterName, issuedBySubUserId, issuedBySubUserName, scannedByStaffId, eventTitle, tierName, ticketNumber, seatLabels` |
| `events/<eventId>` | 1 row per event | `id, title, subtitle, category, date, time, venue, address, city, startingPrice, organizerId, organizerName, status, totalCapacity, ticketTiers[]{id,name,price,description,totalInventory,remainingInventory,perks,popular}, usesSeatMap, cashOnCounterOnly, assignedCounterIds[], counterLocation, counterTimingText, counterContactPhone, scheduledPublishAt, scheduledUnpublishAt, mapsUrl, presentedBy` |
| `counters/<counterId>` | 1 row per counter | `id, name, venue, address, city, mapsUrl, operatingHours, phone, status, merchantUpi{vpa,name}, assignedStaffIds[], subUsers[]{id,name,phone,pinHash,status}, createdAt, createdBy, updatedAt, updatedBy` |
| `counter_shifts/<shiftId>` | 1 row per shift | `shiftId, staffId, staffName, staffRole, counterId, counterName, subUserId, subUserName, startTime, endTime, startingCash, countedCash, expectedCash, discrepancy, cashSalesCount, totalSales, ticketsSold, byMethod{}, autoReconciled, status, closedBy, liveTotals{expectedCash, cashSalesCount, totalSales, ticketsSold, byMethod}` |
| `coupons/<CODE>` | join by code | `code, type, value, validUntil, usageLimit, usedCount, isActive` |

**Known absent fields (do NOT invent):** the system stores **no tax/GST fields** anywhere. The `tax` columns below exist in the schema for forward-compatibility and must always be blank until the data model gains real tax fields. Capacity/remaining slots live on **events & tiers** (`totalCapacity`, `totalInventory`, `remainingInventory`), **not** on counters.

---

## 3. Export design

Four exports, all triggered from the Reports panel toolbar. All values are raw (unaggregated) unless stated.

| Export | Grain | Covers |
|---|---|---|
| **A. Bookings & Revenue (full detail)** | 1 row per **ticket line** | bookings, buyer info, financials, event info, seats, counter attribution, refunds |
| **B. Revenue Summary** | 1 row per event per metric-set + overall row | revenue totals & breakdowns (explicitly required; reuse server `revenueByEvent`, `revenueByDate`, `channels`, `bySubUser` from `/api/admin/reports`) |
| **C. Counters & Bookable Capacity** | 1 row per counter; per-assigned-event columns for capacity | counter registry + bookable availability (capacity / sold / remaining) |
| **D. Counter Shifts** | 1 row per shift | full shift ledger + cash reconciliation |

### CSV conventions (all exports)

- Encoding: UTF-8 **with BOM** (Excel-safe), RFC 4180 quoting (double-quote fields containing `,` `"` `\n`).
- Timestamps: ISO-8601 UTC, as stored.
- Numbers: plain decimal, no currency symbol, no thousand separators (currency is always INR; include `currency` column).
- Empty values: empty string (never `"null"`, `"undefined"`, or `0`).
- Multi-value fields: pipe-joined (`R1-C2|R1-C3`; `cash:200|upi:500`).
- Booleans: `true` / `false`.
- Header row always present; column order fixed as specified.

---

## 4. Export A — Bookings & Revenue (full detail)

**Filename:** `bookings-full_<from||all>_<to||all>_<yyyyMMdd_HHmm>.csv`

### 4.1 Identity & linkage

| Column | Type | Description |
|---|---|---|
| `ticket_id` | string | `tickets/<id>` key |
| `ticket_number` | string | Human ref, e.g. `ASH-1234-SRV` or `ASH-RES-5678` (unpaid reservation pass) |
| `order_id` | string | Parent order |
| `booking_id` | string | Parent booking |
| `reservation_id` | string | Seat reservation; empty for walk-ins |
| `currency` | string | Constant `INR` |

### 4.2 Buyer (who booked)

| Column | Type | Description |
|---|---|---|
| `owner_id` | string | `users/<uid>`; literal `walk_in_guest` for counter sales |
| `attendee_name` | string | Buyer/attendee name |
| `attendee_email` | string | Contact email |
| `attendee_phone` | string | Contact phone |

### 4.3 Event booking information

| Column | Type | Description |
|---|---|---|
| `event_id` | string | Event ID |
| `event_title` | string | Event title |
| `event_category` | string | `concert|comedy|sports|theatre|festival` (joined from event) |
| `event_date` | string | Event date |
| `event_time` | string | Event time |
| `event_venue` | string | Venue name |
| `event_city` | string | City |
| `event_maps_url` | string | Maps URL (joined) |
| `uses_seat_map` | boolean | Seat-based vs general-admission event |
| `cash_on_counter_only` | boolean | Pay-at-counter event |
| `seat_ids` | string | Pipe-joined seat IDs; empty for GA |
| `seat_number` | string | Display label (`R1-C2` or `TierName, General Floor`) |

### 4.4 Financial details

| Column | Type | Description |
|---|---|---|
| `tier_id` | string | Ticket tier ID |
| `tier_name` | string | Ticket tier name (VIP / Kids / Standard…) |
| `price` | number | Unit price of the tier at purchase time |
| `quantity` | integer | Tickets in this line |
| `gross_amount` | number | **Derived:** `price × quantity` |
| `discount` | number | Discount applied to this line (coupon/override share) |
| `total_paid` | number | Amount actually paid for the line |
| `amount_due` | number | Outstanding (0 when fully paid) |
| `payment_status` | enum | `paid` \| `pending` \| `partial` |
| `payment_method` | string | e.g. `walkin_cash`, `walkin_upi`, `walkin_card`, `cash_on_counter`, `phonepe`, `online` |
| `payments_split` | string | Split-payment ledger, pipe-joined `method:amount` pairs; empty when single payment |
| `coupon_code` | string | Applied coupon code |
| `coupon_type` | string | `percentage` \| `fixed` (joined from `coupons` node) |
| `coupon_value` | number | Coupon value |
| `discount_override` | number | Manager-approved override discount amount (walk-in orders) |
| `discount_override_reason` | string | Override reason |
| `discount_override_approved_by` | string | Approver UID |
| `taxes` | number | **Not collected by the system — always empty** (forward-compat column; do not fabricate) |
| `refund_amount` | number | Refunded amount; empty when not refunded |
| `refund_reason` | string | Refund reason (min 5 chars enforced) |
| `refunded_at` | ISO-8601 | Refund timestamp |
| `refunded_by` | string | Refunding admin UID |

### 4.5 Ticket status & lifecycle

| Column | Type | Description |
|---|---|---|
| `pass_type` | enum | `entry` \| `reservation` (unpaid pay-at-counter pass) |
| `status` | enum | `valid` \| `used` \| `redeemed` \| `cancelled` \| `void` \| `refunded` \| `deleted` |
| `cancelled_reason` | string | e.g. `refunded` |
| `purchased_at` | ISO-8601 | Purchase timestamp (used for date-range filtering) |
| `status_changed_at` | ISO-8601 | Last status transition |
| `scanned_by` | string | Gate redeemer identity |
| `scanned_at` | ISO-8601 | Gate check-in timestamp |

### 4.6 Channel, counter & operator attribution

| Column | Type | Description |
|---|---|---|
| `channel` | enum | `counter` \| `online` |
| `is_walk_in` | boolean | Counter walk-in sale |
| `counter_id` | string | Selling counter ID |
| `counter_name` | string | Selling counter name |
| `shift_id` | string | Shift during which the sale was made |
| `issued_by_sub_user_id` | string | Counter sub-user ID |
| `issued_by_sub_user_name` | string | Counter sub-user name (operator performance dimension) |
| `scanned_by_staff_id` | string | Staff UID who processed the sale |
| `created_by_staff_id` | string | Record creator staff UID |

### 4.7 Excluded on purpose (privacy conflict resolution)

| Field | Reason |
|---|---|
| `qrCodeValue` | Full signed QR payload; exporting enables gate-entry forgery |
| `passSlug.id` / `passSig` | Signed pass URLs; same forgery risk |
| `counters.subUsers[].pinHash` | Password hash — never leaves the database |
| `eventPoster`, `gallery`, `artists`, `faqs`, `description`, `perks` | Marketing content, not booking data |

---

## 5. Export B — Revenue Summary (only aggregation in the spec)

**Filename:** `revenue-summary_<from>_<to>_<yyyyMMdd_HHmm>.csv`
One file, six `section` values (one block per breakdown); mirrors `/api/admin/reports` server logic (tickets-based, soft-deleted excluded, `cancelled/refunded/void` excluded from active revenue).

| Column | Type | Description |
|---|---|---|
| `section` | enum | `overall` \| `by_event` \| `by_date` \| `by_channel` \| `by_operator` \| `by_counter` |
| `key` | string | EventId / yyyy-MM-dd / channel / operator name / counter name |
| `title` | string | Display label (event title, etc.) |
| `revenue` | number | Paid revenue (`totalPaid` of active+paid tickets) |
| `pending_collection` | number | Sum of `amountDue` for pending tickets |
| `refunded` | number | Sum of `refundAmount` for refunded/void tickets |
| `net_revenue` | number | `revenue − refunded` |
| `orders` | number | Distinct order count |
| `tickets` | number | Ticket quantity sold |
| `capacity` | number | Event `totalCapacity` (by_event rows) |
| `sold` | number | Quantity sold vs capacity (by_event rows) |
| `checked_in` | number | Tickets with `scannedAt` (by_event rows) |

`overall` rows repeat the panel summary: `totalRevenue, pendingCollection, totalRefunded, totalOrders, totalTickets`.

---

## 6. Export C — Counters & Bookable Capacity

**Filename:** `counters_<yyyyMMdd_HHmm>.csv` — 1 row per counter.

| Column | Type | Description |
|---|---|---|
| `counter_id` | string | `counters/<id>` key |
| `counter_name` | string | Counter name |
| `counter_venue` | string | Venue |
| `counter_address` | string | Address |
| `counter_city` | string | City |
| `counter_maps_url` | string | Location link |
| `counter_operating_hours` | string | Operating hours text |
| `counter_phone` | string | Contact phone |
| `counter_status` | enum | `active` \| `inactive` |
| `counter_merchant_upi_vpa` | string | Merchant UPI VPA shown on counter QR (internal) |
| `counter_merchant_upi_name` | string | Payee name |
| `assigned_staff_ids` | string | Pipe-joined staff UIDs |
| `sub_users` | string | Pipe-joined `name(STATUS)`; **PIN hashes never exported** |
| `sub_users_phone` | string | Pipe-joined sub-user phones |
| `created_at` / `created_by` / `updated_at` / `updated_by` | string | Audit fields |
| `assigned_event_ids` | string | Pipe-joined events listing this counter (`events.assignedCounterIds`) |
| `assigned_event_count` | integer | Derived count |

**Bookable capacity block — one pipe-joined triplet per assigned event** (the data model has no per-counter capacity; capacity lives on events/tiers):

| Column | Type | Description |
|---|---|---|
| `event_id` | string | Event ID |
| `event_title` | string | Event title |
| `event_status` | enum | `draft|published|sold_out|cancelled|completed` |
| `event_date` / `event_time` | string | When |
| `total_capacity` | integer | `events.totalCapacity` |
| `sold` | integer | Derived from active tickets for the event |
| `remaining_slots` | integer | `totalCapacity − sold` |
| `tier_total_inventory` | integer | Sum of `ticketTiers[].totalInventory` |
| `tier_remaining_inventory` | integer | Sum of `ticketTiers[].remainingInventory` |
| `counter_location` / `counter_timing_text` / `counter_contact_phone` | string | Event-facing counter info fields |

---

## 7. Export D — Counter Shifts

**Filename:** `counter-shifts_<yyyyMMdd_HHmm>.csv` — 1 row per shift.

| Column | Type | Description |
|---|---|---|
| `shift_id` | string | `counter_shifts/<id>` key |
| `staff_id` | string | Staff UID |
| `staff_name` | string | Primary staff name (sub-user for sub-shifts) |
| `staff_role` | string | RBAC role |
| `counter_id` / `counter_name` | string | Counter context |
| `sub_user_id` / `sub_user_name` | string | Sub-user identity |
| `start_time` / `end_time` | ISO-8601 | Shift window; `end_time` empty while open |
| `shift_status` | enum | `open` \| `closed` |
| `starting_cash` | number | Opening float |
| `counted_cash` | number | Closing count |
| `expected_cash` | number | System expectation |
| `discrepancy` | number | `counted − expected` |
| `cash_sales_count` | integer | Cash transactions |
| `total_sales` | number | Shift sales total |
| `tickets_sold` | integer | Shift ticket quantity |
| `by_method` | string | Pipe-joined `method:amount` |
| `auto_reconciled` | boolean | Auto-close reconciliation flag |
| `closed_by` | string | Who closed |
| `live_expected_cash` / `live_cash_sales_count` / `live_total_sales` / `live_tickets_sold` / `live_by_method` | mixed | `liveTotals` snapshot at export time (open shifts) |

---

## 8. Example rows

### Export A (walk-in multi-type sale: 2 VIP + 2 Kids at Counter 1, plus one online order)

```csv
ticket_id,ticket_number,order_id,booking_id,reservation_id,currency,owner_id,attendee_name,attendee_email,attendee_phone,event_id,event_title,event_category,event_date,event_time,event_venue,event_city,event_maps_url,uses_seat_map,cash_on_counter_only,seat_ids,seat_number,tier_id,tier_name,price,quantity,gross_amount,discount,total_paid,amount_due,payment_status,payment_method,payments_split,coupon_code,coupon_type,coupon_value,discount_override,discount_override_reason,discount_override_approved_by,taxes,refund_amount,refund_reason,refunded_at,refunded_by,pass_type,status,cancelled_reason,purchased_at,status_changed_at,scanned_by,scanned_at,channel,is_walk_in,counter_id,counter_name,shift_id,issued_by_sub_user_id,issued_by_sub_user_name,scanned_by_staff_id,created_by_staff_id
tkt_1717000000_ab12cd34,ASH-4821-SRV,ord_1717000000_x1,bkg_1717000000_y1,,INR,walk_in_guest,Rahul Patil,rahul@example.com,+919812345678,evt_001,Sufiyana Shaam,concert,2026-09-20,19:00,Shahu Smarak Bhavan,Kolhapur,https://maps.example/xyz,false,false,,"VIP, General Floor",tier_vip,VIP,1500,2,3000,0,3000,0,paid,walkin_cash,cash:2000|upi:1000,,,,,,,,,,,,entry,valid,,2026-09-07T10:00:00.000Z,,,,counter,true,ctr_001,Counter 1,shf_1716999000_a1,sub_2,Suresh (Sub),staff_9,staff_9
tkt_1717000001_ef56gh78,ASH-4822-SRV,ord_1717000000_x1,bkg_1717000000_y1,,INR,walk_in_guest,Rahul Patil,rahul@example.com,+919812345678,evt_001,Sufiyana Shaam,concert,2026-09-20,19:00,Shahu Smarak Bhavan,Kolhapur,https://maps.example/xyz,false,false,,"Kids, General Floor",tier_kids,Kids,500,2,1000,0,1000,0,paid,walkin_cash,cash:2000|upi:1000,,,,,,,,,,,,entry,valid,,2026-09-07T10:00:00.000Z,,,,counter,true,ctr_001,Counter 1,shf_1716999000_a1,sub_2,Suresh (Sub),staff_9,staff_9
tkt_1717000002_ij90kl12,ASH-1337-SRV,ord_1717000002_z3,bkg_1717000002_z3,res_res123,INR,uid_anita,Anita Desai,anita@example.com,+919876543210,evt_001,Sufiyana Shaam,concert,2026-09-20,19:00,Shahu Smarak Bhavan,Kolhapur,https://maps.example/xyz,true,false,R1-C2|R1-C3,R1-C2,tier_vip,VIP,1500,2,3000,500,2500,0,paid,phonepe,,,,,,,,,350,Duplicate charge,2026-09-07T12:00:00.000Z,uid_admin1,entry,cancelled,refunded,2026-09-07T11:30:00.000Z,2026-09-07T12:00:00.000Z,,,online,false,,,,,,staff_9,staff_9
```

### Export B

```csv
section,key,title,revenue,pending_collection,refunded,net_revenue,orders,tickets,capacity,sold,checked_in
overall,ALL,All events,300000,2000,350,299650,148,302,500,302,141
by_event,evt_001,Sufiyana Shaam,300000,2000,350,299650,148,302,500,302,141
by_date,2026-09-07,,82500,0,0,82500,41,84,,,
by_channel,counter,Counter sales,120000,,,120000,63,66,,,
by_operator,"Suresh (Sub)",,45000,,,45000,21,24,,,
by_counter,"Counter 1",,120000,,,120000,63,66,,,
```

### Export C

```csv
counter_id,counter_name,counter_venue,counter_address,counter_city,counter_maps_url,counter_operating_hours,counter_phone,counter_status,counter_merchant_upi_vpa,counter_merchant_upi_name,assigned_staff_ids,sub_users,sub_users_phone,created_at,created_by,updated_at,updated_by,assigned_event_ids,assigned_event_count,event_id,event_title,event_status,event_date,event_time,total_capacity,sold,remaining_slots,tier_total_inventory,tier_remaining_inventory
ctr_001,Counter 1,Shahu Smarak Bhavan,Station Rd,Kolhapur,https://maps.example/c1,10:00-20:00,+917745998497,active,merchant@upi,Ash-vish Events,staff_9,Suresh(active)|Ganesh(active),+919800000001|+919800000002,2026-08-01T09:00:00.000Z,uid_admin1,2026-09-01T09:00:00.000Z,uid_admin1,evt_001,1,evt_001,Sufiyana Shaam,published,2026-09-20,19:00,500,302,198,500,198
```

### Export D

```csv
shift_id,staff_id,staff_name,staff_role,counter_id,counter_name,sub_user_id,sub_user_name,start_time,end_time,shift_status,starting_cash,counted_cash,expected_cash,discrepancy,cash_sales_count,total_sales,tickets_sold,by_method,auto_reconciled,closed_by,live_expected_cash,live_cash_sales_count,live_total_sales,live_tickets_sold,live_by_method
shf_1716999000_a1,staff_9,Suresh,counter_staff,ctr_001,"Counter 1",sub_2,"Suresh (Sub)",2026-09-07T09:00:00.000Z,2026-09-07T18:00:00.000Z,closed,1000,8450,8450,0,12,114500,64,"cash:8450|upi:106050",true,staff_1,,,,,
shf_1717000000_b2,staff_9,Suresh,counter_staff,ctr_001,"Counter 1",sub_2,"Suresh (Sub)",2026-09-08T09:00:00.000Z,,open,1000,,,,,,,false,,,,,,"cash:500|upi:2500"
```

---

## 9. Existing exports (verbatim, superseded by this spec)

Current panel exports, for reference:

1. **AdminReports → "Export CSV"** (per-event summary only — to be replaced by Export B):
   `event,title,revenue,netRevenue,orders,tickets,capacity,sold,checkedIn`
2. **AdminBookings fallback CSV** (table snapshot):
   `Order ID,Event,Customer,Email,Phone,Amount,Status,Channel,Created`
3. **MySalesPage export**:
   `Ticket Number, Event, Tier, Seats, Attendee, Phone, Email, Total Paid, Issued By, Status, Date`

---

## 10. Generation instructions (UI + API)

### UI — Reports panel (`AdminReports.tsx`)

1. Keep the existing date-range pickers; they filter all exports (`purchasedAt` for A/B, unrestricted for C, `startTime` for D).
2. Replace the single **Export CSV** button with an **Export Data ▾** dropdown:
   - *Bookings & Revenue (full detail)* → Export A
   - *Revenue Summary* → Export B
   - *Counters & Bookable Capacity* → Export C
   - *Counter Shifts* → Export D
   - *Everything (ZIP)* → all four, one zip file
3. Button shows a spinner while the download is in flight; on failure show a toast (existing `ToastContext` pattern).

### API — one new endpoint

```
GET /api/admin/reports/export?type=bookings|summary|counters|shifts
    &from=<ISO|date>&to=<ISO|date>
Authorization: Firebase ID token; requireRole(["super_admin","event_manager","auditor"])
Response: 200, Content-Type: text/csv; charset=utf-8
          Content-Disposition: attachment; filename="<name>.csv"
```

Server-side generation (do **not** build in the browser — the full export exceeds practical client memory):

```pseudo
GET /admin/reports/export:
  verifyRole super_admin|event_manager|auditor
  read nodes (admin token): tickets, bookings, orders, events, counters, counter_shifts, coupons
  apply from/to on purchasedAt (A, B), startTime (D)
  switch type:
    bookings -> for each ticket (status != "deleted"):
      join order, booking, event, counter by stored IDs
      derive gross_amount, channel, is_walk_in; leave tax columns empty
      emit CSV row (RFC4180-escape; pipe-join seatIds & payments)
    summary  -> reuse exact aggregation logic from GET /admin/reports
    counters -> row per counter; derive assigned events + capacity/sold/remaining
    shifts   -> row per counter_shifts record incl. liveTotals
  writeAuditEntry(action: "report.exported", meta: { type, from, to, rows })
```

Notes:
- Never include `qrCodeValue`, `passSlug`, or `pinHash` in any response.
- ZIP variant uses `application/zip` with the four CSVs inside.
- Date-range defaults: `from`/`to` empty = all time.

---

## 11. Execution checklist mapping

| Checklist item | Where satisfied |
|---|---|
| All user‑booking fields | §4.2 (`owner_id`, `attendee_name/email/phone`) + §4.1 linkage |
| All financial fields | §4.4 — price, quantity, gross, discount (+override), coupon, paid, due, splits, refunds; `taxes` documented as not-collected |
| All event‑booking fields | §4.3 + §6 event/capacity block |
| All revenue fields | §5 summary export (only allowed aggregation) |
| All bookable‑counter fields | §6 capacity block (`total_capacity`, `sold`, `remaining_slots`, tier inventories) |
| All counter‑information fields | §6 registry block + §7 shift ledger |
| Header/type/description per field | Tables §4–§7 |
| Do not assume fields beyond the model | §2 mapping lists verified server-written fields only; absent fields flagged (taxes) |
| Do not summarize unless required | Row-level grains §4/§6/§7; aggregation confined to §5 (explicitly required revenue totals) |
| Do not export prohibited data | §4.7 exclusion list (QR tokens, pass signatures, PIN hashes) |
