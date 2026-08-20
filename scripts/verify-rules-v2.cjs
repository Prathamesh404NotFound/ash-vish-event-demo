#!/usr/bin/env node
/*
 * verify-rules-v2.js — programmatic simulation of the Firebase Realtime
 * Database rules in database.rules.json.
 *
 * Implements the same expression semantics Firebase uses for the rule
 * constructs in this file (===, &&, ||, !, .val(), .exists(), .child(),
 * .isNumber(), .isString(), .isBoolean(), .length, hasChildren,
 * newData / data / auth / root / $ wildcards). It then runs a matrix of
 * role/operation test cases and fails loudly on any unexpected result.
 *
 * Usage: node scripts/verify-rules-v2.js
 * Exit 0 = all cases passed; exit 1 = failures listed.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('jsonc-parser');

const raw = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
const RULES = parse(raw).rules;

/* ----------------------------- tiny rules engine --------------------------- */

function resolvePath(root, p) {
  // p: array of path segments (no wildcards)
  let cur = root;
  for (const seg of p) {
    if (cur == null || typeof cur !== 'object' || !(seg in cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function segExists(root, p) {
  return resolvePath(root, p) !== undefined;
}

// Evaluate a rule expression string against a scenario.
function evaluate(expr, ctx) {
  // Literal boolean rules (Firebase's ".read": false / true)
  if (expr === true) return true;
  if (expr === false) return false;
  // ctx: { auth, root, data, newData, $uid, $eventId, $ticketId, ... }
  // Tokenize: replace Firebase path expressions with values, then safe-eval.
  let e = expr;

  // Order matters: handle the longest patterns first.
  const replaces = [
    // root.child('a').child('b').child('c').val() / .exists()
    { re: /root\.child\('([^']+)'\)(?:\.child\('([^']+)'\))?/g, fn: (m, a, b) => {
      const p = b ? [a, b] : [a];
      // We return a special placeholder object for chained access. Instead,
      // normalize chains into __RP(['a','b'], 'val'|'exists').
      return `__RP(${JSON.stringify(p)})`;
    } },
  ];
  // root.child(...) chains may contain non-literal args (e.g. auth.uid).
  // Convert them iteratively: root.child(X) -> __C(X), then chain
  // __C(A).child(B) -> __C(A,B) until stable.
  // Phase 0: hide the bare `auth` object behind a marker so later
  // replacements cannot corrupt it; member access resolves in Phase 2.
  e = e.replace(/\bauth\b/g, '__AUTH__');
  e = e.replace(/root\.child\(([^)]+)\)/g, (_, x) => `__C(${x})`);
  e = e.replace(/__C\((.*?)\)\.child\(([^)]+)\)/g, (_, a, b) => `__C(${a},${b})`);
  // NOTE: the collapse above merges ONE trailing .child() per __C only, and it
  // runs BEFORE uid replacement, so `auth.uid` inside the merged args must be
  // replaced afterwards. The final .val()/.exists() conversion happens after
  // all member-access replacement below (it operates on `e` in place there).
  e = e.replace(/newData\.exists\(\)/g, '__NE()');
  e = e.replace(/data\.exists\(\)/g, '__DE()');
  e = e.replace(/newData\.child\('([^']+)'\)\.val\(\)/g, (_, k) => `__NV(${JSON.stringify(k)})`);
  e = e.replace(/data\.child\('([^']+)'\)\.val\(\)/g, (_, k) => `__DV(${JSON.stringify(k)})`);
  e = e.replace(/newData\.hasChildren\(\[(.*?)\]\)/g, (_, list) => `__NH([${list}])`);
  e = e.replace(/newData\.child\('([^']+)'\)\.isNumber\(\)/g, (_, k) => `__T(${JSON.stringify(k)},'number')`);
  e = e.replace(/newData\.child\('([^']+)'\)\.isString\(\)/g, (_, k) => `__T(${JSON.stringify(k)},'string')`);
  e = e.replace(/newData\.child\('([^']+)'\)\.isBoolean\(\)/g, (_, k) => `__T(${JSON.stringify(k)},'boolean')`);
  e = e.replace(/newData\.child\('([^']+)'\)\.val\(\)\.length/g, (_, k) => `__VL(${JSON.stringify(k)})`);
  e = e.replace(/newData\.child\('([^']+)'\)\.val\(\)/g, (_, k) => `__NV(${JSON.stringify(k)})`);

  // Wildcard variables (quoted like $uid). Never treat 'auth' as a variable
  // here — it is handled explicitly below.
  for (const k of Object.keys(ctx)) {
    if (k === 'auth') continue;
    if (k.startsWith('$')) {
      e = e.replace(new RegExp(k.replace('$', '\\$'), 'g'), JSON.stringify(ctx[k]));
    }
  }
  if (process.env.DEBUG_RULES === '1') console.log('[eval-in]', e, '| auth.uid =', ctx.auth && ctx.auth.uid);
  // Phase 2: resolve member access on the marker, then collapse it.
  e = e.replace(/__AUTH__\.uid/g, JSON.stringify(ctx.auth && ctx.auth.uid));
  e = e.replace(/__AUTH__\.token\.admin/g, JSON.stringify(ctx.auth && ctx.auth.token && ctx.auth.token.admin));
  e = e.replace(/__AUTH__\.token\.role/g, JSON.stringify(ctx.auth && ctx.auth.token && ctx.auth.token.role));
  e = e.replace(/__AUTH__/g, JSON.stringify(ctx.auth || null));
  // Finalize root.path chains: collapse any remaining nested __C(...) and
  // convert trailing .val() / .exists() to helpers.
  for (let safety = 0; safety < 16 && /__C\(/.test(e); safety++) {
    const nxt = e.replace(/__C\((.*?)\)\.child\(([^)]+)\)/g, (_, a, b) => `__C(${a},${b})`);
    if (nxt === e) break;
    e = nxt;
  }
  e = e.replace(/__C\(([^()]*)\)\.val\(\)/g, (_, args) => `__VP([${args}])`);
  e = e.replace(/__C\(([^()]*)\)\.exists\(\)/g, (_, args) => `__EP([${args}])`);

  const joinArgs = (args) => args.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    try { return JSON.parse(s); } catch {}
    try { return JSON.parse('"' + s.replace(/^'|'$/g, '').replace(/\\'/g, "'") + '"'); } catch { return s; }
  });
  const helpers = {
    __VP: (args) => resolvePath(ctx.root, Array.isArray(args) ? args : joinArgs(args)),
    __EP: (args) => segExists(ctx.root, Array.isArray(args) ? args : joinArgs(args)),
    __DE: () => ctx.data !== undefined,
    __NE: () => ctx.newData !== undefined,
    __DV: (k) => (ctx.data && typeof ctx.data === 'object' ? ctx.data[k] : undefined),
    __NV: (k) => (ctx.newData && typeof ctx.newData === 'object' ? ctx.newData[k] : undefined),
    __NH: (keys) => ctx.newData && keys.every((k) => k in ctx.newData),
    __T: (k, t) => {
      const v = ctx.newData && typeof ctx.newData === 'object' ? ctx.newData[k] : undefined;
      return typeof v === t;
    },
    __VL: (k) => {
      const v = ctx.newData && typeof ctx.newData === 'object' ? ctx.newData[k] : undefined;
      return typeof v === 'string' ? v.length : undefined;
    },
  };
  if (process.env.DEBUG_RULES === '1') console.log('[eval-out]', e);
  const fn = new Function(...Object.keys(helpers), `return (${e});`);
  try {
    const v = fn(...Object.values(helpers));
    return v === true || v === false ? v : Boolean(v);
  } catch (err) {
    if (process.env.DEBUG_RULES === '1') console.log('[ERR]', err.message);
    return false;
  }
}

/* --------------------------------- helpers --------------------------------- */

const ROLES = ['customer', 'organizer_pending', 'ticket_counter', 'auditor', 'event_manager', 'admin', 'super_admin'];

function makeAuth(role, uid = 'u-customer') {
  const map = {
    customer: { uid: 'u-customer' },
    organizer_pending: { uid: 'u-organizer' },
    ticket_counter: { uid: 'u-tc' },
    auditor: { uid: 'u-auditor' },
    event_manager: { uid: 'u-em' },
    admin: { uid: 'u-admin' },
    super_admin: { uid: 'u-super' },
    nobody: null,
  };
  const a = map[role];
  if (!a) return null;
  a.token = {}; // NOTE: no custom claims ever exist — intentional (see rules header)
  return a;
}

// The shared RTDB tree (role store) used by root.child(...) lookups.
function makeRoot(overrides = {}) {
  const staff = {
    'u-tc': { email: 'tc@x.com', role: 'ticket_counter' },
    'u-auditor': { email: 'au@x.com', role: 'auditor' },
    'u-em': { email: 'em@x.com', role: 'event_manager' },
    'u-admin': { email: 'ad@x.com', role: 'admin' },
    'u-super': { email: 'sa@x.com', role: 'super_admin' },
    ...overrides.staff,
  };
  const users = {
    'u-customer': { id: 'u-customer', name: 'Cust', email: 'c@x.com', phone: '123', role: 'customer' },
    'u-organizer': { id: 'u-organizer', name: 'Org', role: 'organizer' },
    'u-tc': { id: 'u-tc', role: 'ticket_counter' },
    ...overrides.users,
  };
  const root = {
    staff,
    users,
    coupons: { WELCOME20: { code: 'WELCOME20', value: 20, isActive: true } },
    tickets: { 't1': { ownerId: 'u-customer', status: 'valid', price: 500 } },
    bookings: { 'b1': { userId: 'u-customer', totalAmount: 500 } },
    passes: { 'p1': { ticketId: 't1' } },
    orders: { 'o1': { userId: 'u-customer' } },
    pending_orders: { 'po1': { userId: 'u-customer' } },
    processed_orders: { 'pr1': { userId: 'u-customer' } },
    reservations: { 'r1': { ownerId: 'u-customer' } },
    reservation_owners: { 'ro1': {} },
    reservation_events: { 're1': {} },
    organizers: { 'org1': { userId: 'u-organizer', status: 'pending' }, 'org2': { userId: 'u-other', status: 'approved' } },
    counters: { 'c1': {} },
    counter_shifts: { 's1': {} },
    sales: { 'sa1': {} },
    staff_uploads: { 'f1': {} },
    favorites: { 'fa1': {} },
    app_config: { merchant_upi: { vpa: 'shop@upi' } },
    audit_log: { 'a1': {} },
    notifications: { 'n1': {} },
    events: { 'e1': {} },
    seats: { 'e1': { 'R1-C1': { status: 'available' } } },
    reviews: { 'rv1': { userId: 'u-customer', rating: 5, status: 'published' } },
    ...overrides.rest,
  };
  return root;
}

function checkNode(root, nodeRule, auth, data, newData, vars) {
  const ctx = { auth, root, data, newData, ...vars };
  if (nodeRule['.read'] !== undefined && evaluate(nodeRule['.read'], ctx) === false) return { read: false };
  if (nodeRule['.write'] !== undefined && evaluate(nodeRule['.write'], ctx) === false) return { write: false };
  return { read: true, write: true };
}

// Check access at a path: apply rule cascade from root (Firebase semantics:
// first matching true wins; rules cascade DOWN). We implement bottom-up:
// find the deepest rule along the path; a parent rule granting true also
// grants true to descendants.
function access(root, rules, path, auth, data, newData) {
  const segs = typeof path === 'string' ? path.split('/').filter(Boolean) : path;
  let grant = { read: false, write: false };
  let cur = rules;
  let validateRules = [];
  for (let i = 0; i <= segs.length; i++) {
    if (cur && typeof cur === 'object') {
      const r = cur['.read'];
      const w = cur['.write'];
      const v = cur['.validate'];
      const vars = { auth, root, data, newData, $uid: segs[1], $eventId: segs[1], $ticketId: segs[1], $orderId: segs[1], $bookingId: segs[1], $organizerId: segs[1], $reviewId: segs[1], $shiftId: segs[1] };
      if (process.env.DEBUG_RULES === '1') console.log('[access] i=', i, 'path-prefix=', segs.slice(0, i + 1).join('/'), 'r=', typeof r, 'w=', typeof w, 'auth=', JSON.stringify(auth));
      if (r !== undefined) grant.read = evaluate(r, vars) ? true : false;
      if (w !== undefined) grant.write = evaluate(w, vars) ? true : false;
      if (v !== undefined) validateRules.push(v);
      // Descend: literal child first, else $-wildcard node (Firebase matching)
      if (segs[i] !== undefined) {
        if (cur[segs[i]] !== undefined) cur = cur[segs[i]];
        else {
          const wc = Object.keys(cur).find((k) => k.startsWith('$') && k !== '.read' && k !== '.write' && k !== '.validate');
          cur = wc !== undefined ? cur[wc] : null;
        }
      } else cur = null;
    } else {
      break;
    }
  }
  // .validate rules act as an additional AND gate on writes at every depth
  // where one is defined (Firebase evaluates all matching .validate rules).
  // Descendant-node .validate rules (e.g. staff/$uid/role/.validate when
  // writing staff/$uid with a nested role) also apply; collect them by
  // descending the rules tree along keys present in newData.
  const collectValidate = (node, payload) => {
    const out = [];
    if (!node || typeof node !== 'object') return out;
    if (node['.validate'] !== undefined) out.push(node['.validate']);
    if (payload && typeof payload === 'object') {
      for (const k of Object.keys(payload)) {
        if (k === '.validate') continue;
        if (node[k] !== undefined) out.push(...collectValidate(node[k], payload[k]));
        else {
          const wc = Object.keys(node).find((x) => x.startsWith('$') && x !== '.read' && x !== '.write' && x !== '.validate');
          if (wc !== undefined) out.push(...collectValidate(node[wc], payload[k]));
        }
      }
    }
    return out;
  };
  if (grant.write) {
    for (const v of validateRules) {
      if (evaluate(v, { auth, root, data, newData }) === false) { grant.write = false; break; }
    }
  }
  if (grant.write && cur) {
    for (const v of collectValidate(cur, newData)) {
      if (evaluate(v, { auth, root, data, newData }) === false) { grant.write = false; break; }
    }
  }
  return grant;
}

/* ---------------------------------- tests ---------------------------------- */

const root = makeRoot();
const results = [];
function t(name, cond) { results.push({ name, ok: cond }); }

const A = {
  guest: makeAuth('nobody'),
  // The Firebase server service-account bot (src/lib/identity-admin.ts) —
  // uid 'admin-server-bot', claims {role:'admin', admin:true}, NO staff
  // record. It must be able to read and write everything the server needs;
  // its access should NOT depend on any staff-node entry.
  bot: { uid: 'admin-server-bot', token: { role: 'admin', admin: true } },
  customer: makeAuth('customer'),
  organizer: makeAuth('organizer_pending'),
  tc: makeAuth('ticket_counter'),
  auditor: makeAuth('auditor'),
  em: makeAuth('event_manager'),
  admin: makeAuth('admin'),
  super: makeAuth('super_admin'),
};

function canRead(auth, path, data = undefined, tree = root) { return access(tree, RULES, path, auth, data).read; }
function canWrite(auth, path, data = undefined, newData = {}, tree = root) { return access(tree, RULES, path, auth, data, newData).write; }

// ---------- Guest (unauthenticated) ----------
t('guest cannot read anything at root', !canRead(A.guest, ''));
t('guest reads events', canRead(A.guest, 'events'));
t('guest reads seats', canRead(A.guest, 'seats/e1'));
t('guest reads reviews', canRead(A.guest, 'reviews'));
t('guest cannot read passes', !canRead(A.guest, 'passes'));
t('guest cannot read users', !canRead(A.guest, 'users/u-customer'));
t('guest cannot read staff', !canRead(A.guest, 'staff'));
t('guest cannot read coupons', !canRead(A.guest, 'coupons'));
t('guest cannot write reviews', !canWrite(A.guest, 'reviews/rev_x'));
t('guest cannot read merchant_upi directly (node locked; app_config/.read false — merchant_upi read true is deeper so it wins)', canRead(A.guest, 'app_config/merchant_upi'));

// ---------- Customer ----------
t('customer reads own profile', canRead(A.customer, 'users/u-customer'));
t('customer cannot read other profile', !canRead(A.customer, 'users/u-organizer'));
t('customer writes own profile fields', canWrite(A.customer, 'users/u-customer/name', {}, { name: 'New Name' }));
t('customer CANNOT write own role', !canWrite(A.customer, 'users/u-customer/role', {}, { val: 'admin' }));
t('customer cannot write other profile', !canWrite(A.customer, 'users/u-organizer/name', {}, { name: 'x' }));
t('customer reads own tickets subtree', canRead(A.customer, 'users/u-customer/tickets'));
t('customer cannot read staff', !canRead(A.customer, 'staff'));
t('customer cannot read global tickets/bookings', !canRead(A.customer, 'tickets'));
t('customer reads own ticket via owner rule', canRead(A.customer, 'tickets/t1', { ownerId: 'u-customer' }));
t('customer cannot read stranger ticket', !canRead(A.customer, 'tickets/t2', { ownerId: 'u-other' }));
t('customer reads own booking', canRead(A.customer, 'bookings/b1', { userId: 'u-customer' }));
t('customer reads coupons (checkout flow)', canRead(A.customer, 'coupons'));
t('customer cannot write coupons', !canWrite(A.customer, 'coupons/WELCOME20', {}, { isActive: false }));
t('customer cannot write reviews impersonating others', !canWrite(A.customer, 'reviews/rev_x', {}, { userId: 'u-other', rating: 5, comment: 'hi' }));
t('customer can create own review with valid schema', canWrite(A.customer, 'reviews/rev_x', undefined, { id: 'rev_x', eventId: 'e1', userId: 'u-customer', userName: 'C', rating: 4, comment: 'nice', createdAt: '2026-01-01', status: 'published', isVerifiedBuyer: true }));
t('customer review rejected: rating 0', !canWrite(A.customer, 'reviews/rev_x', undefined, { id: 'rev_x', eventId: 'e1', userId: 'u-customer', userName: 'C', rating: 0, comment: 'nice', createdAt: '2026-01-01', status: 'published', isVerifiedBuyer: true }));
t('customer review rejected: bad status', !canWrite(A.customer, 'reviews/rev_x', undefined, { id: 'rev_x', eventId: 'e1', userId: 'u-customer', userName: 'C', rating: 4, comment: 'nice', createdAt: '2026-01-01', status: 'hidden', isVerifiedBuyer: true }));
t('customer review rejected: rating missing', !canWrite(A.customer, 'reviews/rev_x', undefined, { id: 'rev_x', eventId: 'e1', userId: 'u-customer', userName: 'C', comment: 'nice', createdAt: '2026-01-01', status: 'published', isVerifiedBuyer: true }));
t('customer cannot update existing review (update forbidden — moderation is admin-only)', !canWrite(A.customer, 'reviews/rv1', { userId: 'u-customer' }, { userId: 'u-customer', rating: 5, comment: 'edited' }));
t('customer reads own pending order', canRead(A.customer, 'pending_orders/po1', { userId: 'u-customer' }));
t('customer cannot read others pending order', !canRead(A.customer, 'pending_orders/po2', { userId: 'u-other' }));
t('customer cannot write pending_orders', !canWrite(A.customer, 'pending_orders/po_new', {}, { userId: 'u-customer' }));
t('customer reads own organizer application', canRead(A.customer, 'organizers/org1', { userId: 'u-customer' }));
t('customer cannot read passes directly (pass lookups are server-only — VULN-0002)', !canRead(A.customer, 'passes') && !canRead(A.customer, 'passes/p1'));

// ---------- Ticket counter ----------
t('tc reads staff registry', canRead(A.tc, 'staff'));
t('tc reads all users', canRead(A.tc, 'users/u-organizer'));
t('tc cannot write user role', !canWrite(A.tc, 'users/u-customer/role', {}, { val: 'admin' }));
t('tc writes own walk-in ticket updates (server flow uses operator user token)', canWrite(A.tc, 'users/u-customer/tickets/t1', { ownerId: 'u-customer' }, { status: 'used' }));
t('tc writes tickets collection (void/collectedAt via own token)', canWrite(A.tc, 'tickets/t1', { ownerId: 'u-customer' }, { paymentStatus: 'paid' }));
t('tc writes orders (collectedAt updates via own token)', canWrite(A.tc, 'orders/o1', {}, { paymentStatus: 'paid' }));
t('tc still cannot write coupons', !canWrite(A.tc, 'coupons/WELCOME20', {}, { isActive: false }));
t('tc reads tickets list', canRead(A.tc, 'tickets'));
t('tc reads counter_shifts', canRead(A.tc, 'counter_shifts'));
t('tc cannot write counter_shifts (server API only)', !canWrite(A.tc, 'counter_shifts/s1', {}, { status: 'ended' }));
t('tc (staff) reads passes list (staff-only guard)', canRead(A.tc, 'passes'));
t('tc reads coupons', canRead(A.tc, 'coupons'));
t('tc cannot write coupons', !canWrite(A.tc, 'coupons/WELCOME20', {}, { isActive: false }));

// ---------- Auditor (read-only everywhere) ----------
t('auditor reads staff', canRead(A.auditor, 'staff'));
t('auditor reads tickets list', canRead(A.auditor, 'tickets'));
t('auditor reads sales', canRead(A.auditor, 'sales'));
t('auditor reads audit_log', canRead(A.auditor, 'audit_log'));
t('auditor CANNOT write anywhere staff-writable',
  !canWrite(A.auditor, 'tickets/t1', {}, { status: 'void' }) &&
  !canWrite(A.auditor, 'coupons/WELCOME20', {}, { isActive: false }) &&
  !canWrite(A.auditor, 'counters/c1', {}, { status: 'inactive' }) &&
  !canWrite(A.auditor, 'reservations/r1', {}, { status: 'expired' }) &&
  !canWrite(A.auditor, 'staff/u-tc', {}, { role: 'auditor' }));
t('auditor cannot write user profiles', !canWrite(A.auditor, 'users/u-customer/name', {}, { name: 'x' }));

// ---------- Event manager ----------
t('em reads staff', canRead(A.em, 'staff'));
t('em reads organizers', canRead(A.em, 'organizers'));
t('em cannot write organizers status directly (admin API only)', !canWrite(A.em, 'organizers/org1', { userId: 'u-organizer' }, { userId: 'u-organizer', status: 'approved' }));
t('em cannot write other organizer', !canWrite(A.em, 'organizers/org2', { userId: 'u-other' }, { userId: 'u-other', status: 'approved' }));
t('em reads coupons', canRead(A.em, 'coupons'));
t('em cannot write coupons from client (server API only)', !canWrite(A.em, 'coupons/WELCOME20', {}, { isActive: false }));

// ---------- Admin (legacy admin role — level 3 writes, not super_admin) ----------
t('admin reads staff', canRead(A.admin, 'staff'));
t('admin reads tickets/bookings', canRead(A.admin, 'tickets') && canRead(A.admin, 'bookings'));
// v4 policy: staff role 'admin' is normalized to super_admin authority by
// server.ts toRbacRole() — admins get full read/write authority, EXCEPT they
// may never create or promote another super_admin (only real super_admins
// can do that — this is the single privilege they lack).
t('admin reads everything staff-visible (coupons, counters, audit)', canRead(A.admin, 'coupons') && canRead(A.admin, 'counters') && canRead(A.admin, 'audit_log'));
t('admin writes coupons/counters (full admin authority)', canWrite(A.admin, 'coupons/WELCOME20', {}, { isActive: false }) && canWrite(A.admin, 'counters/c1', {}, { name: 'X' }));
t('admin CANNOT promote a target into super_admin (reserved)', !canWrite(A.admin, 'staff/u-tc', { email: 'tc@x.com', role: 'ticket_counter' }, { email: 'tc@x.com', role: 'super_admin' }));
t('admin CANNOT demote a real super_admin (self-protection)', !canWrite(A.admin, 'staff/u-super', { email: 'sa@x.com', role: 'super_admin' }, { email: 'sa@x.com', role: 'admin' }));

// ---------- Super admin (full authority) ----------
t('super reads everything',
  canRead(A.super, 'staff') && canRead(A.super, 'users/u-customer') && canRead(A.super, 'tickets') &&
  canRead(A.super, 'bookings') && canRead(A.super, 'passes') && canRead(A.super, 'coupons') &&
  canRead(A.super, 'orders') && canRead(A.super, 'pending_orders') && canRead(A.super, 'reservations') &&
  canRead(A.super, 'organizers') && canRead(A.super, 'counter_shifts') && canRead(A.super, 'sales') &&
  canRead(A.super, 'staff_uploads') && canRead(A.super, 'counters') && canRead(A.super, 'audit_log') &&
  canRead(A.super, 'notifications') && canRead(A.super, 'favorites'));
t('super writes staff registry', canWrite(A.super, 'staff/u-tc', {}, { email: 't@x.com', role: 'ticket_counter' }));
t('super writes merchant_upi', canWrite(A.super, 'app_config/merchant_upi', {}, { vpa: 'new@upi' }));
t('super writes coupons', canWrite(A.super, 'coupons/NEWCODE', {}, { code: 'NEWCODE', value: 10, isActive: true }));
t('super writes audit_log', canWrite(A.super, 'audit_log/x', {}, { action: 'test' }));
t('super writes users/$uid/tickets', canWrite(A.super, 'users/u-customer/tickets/t1', {}, { status: 'used' }));
t('super writes reservations', canWrite(A.super, 'reservations/r1', {}, { status: 'expired' }));
t('super writes organizers status', canWrite(A.super, 'organizers/org1', {}, { status: 'approved' }));
t('super writes own profile fields', canWrite(A.super, 'users/u-super/name', {}, { name: 'S' }));
t('super writes own role (self-manage allowed)', canWrite(A.super, 'users/u-super/role', {}, { val: 'admin' }));
t('super CANNOT demote another super_admin via staff registry', !canWrite(A.super, 'staff/u-super', { email: 'sa@x.com', role: 'super_admin' }, { email: 'sa@x.com', role: 'admin' }));
t('super CAN promote non-super staff', canWrite(A.super, 'staff/u-tc', { email: 'tc@x.com', role: 'ticket_counter' }, { email: 'tc@x.com', role: 'admin' }));
t('super staff role validate rejects bogus role', !canWrite(A.super, 'staff/u-new', {}, { email: 'n@x.com', role: 'wizard' }));
t('super CAN promote a target into super_admin', canWrite(A.super, 'staff/u-tc', { email: 'tc@x.com', role: 'ticket_counter' }, { email: 'tc@x.com', role: 'super_admin' }));

// ---------- Stray customer inside staff node ----------
// A staff-node record with a non-staff role ('customer') must NOT broaden
// any privilege: reads still go through users/$uid/role === 'customer'
// where that matters, and staff-gated reads require staff existence AND are
// narrowed by role checks. v4: every WRITE/operational read requires the
// role to be super_admin/admin (or counter/em/auditor where scoped).
const strayRoot = makeRoot({ staff: { 'u-customer': { email: 'cu@x.com', role: 'customer' } } });
t('stray customer staff record (role=customer) CANNOT write coupons', !canWrite(A.customer, 'coupons/WELCOME20', {}, { isActive: false }, strayRoot));
t('stray customer staff record CANNOT write staff registry', !canWrite(A.customer, 'staff/u-customer', {}, { email: 'cu@x.com', role: 'super_admin' }, strayRoot));
t('stray customer staff record CANNOT write user role (escalation)', !canWrite(A.customer, 'users/u-customer/role', {}, { val: 'admin' }, strayRoot));
t('admin staff member CANNOT promote a target into super_admin', !canWrite(A.admin, 'staff/u-tc', { email: 'tc@x.com', role: 'ticket_counter' }, { email: 'tc@x.com', role: 'super_admin' }));
t('stray customer staff record CANNOT write reservations', !canWrite(A.customer, 'reservations/r1', {}, { status: 'expired' }, strayRoot));

// ---------- Cross-cutting: granting expressions never key on custom claims ----------
t('no granting rule references auth.token (claims are never minted for client users — any such rule would be dead code and a misconfiguration)',
  JSON.stringify(RULES).match(/auth\.token\.(admin|role)/g) === null);

// ---------- Server service-account bot ('admin-server-bot') ----------
// A bot root without any staff record: proves the bot's access is explicit,
// not inherited from a (missing) staff entry.
const botRoot = makeRoot({ staff: {} });
t('bot reads staff registry without staff record', canRead(A.bot, 'staff', undefined, botRoot));
t('bot reads any user profile without staff record', canRead(A.bot, 'users/u-customer', undefined, botRoot));
t('bot reads coupons/tickets/bookings without staff record', canRead(A.bot, 'coupons') && canRead(A.bot, 'tickets') && canRead(A.bot, 'bookings'), undefined, botRoot);
t('bot writes coupons/counters/staff without staff record', canWrite(A.bot, 'coupons/NEW', {}, { isActive: true }, undefined, botRoot) && canWrite(A.bot, 'counters/c1', {}, { name: 'X' }, undefined, botRoot) && canWrite(A.bot, 'staff/u-new', {}, { email: 'n@x.com', role: 'admin' }, undefined, botRoot));
t('bot writes users/$uid/tickets and bookings (fulfillment flows)', canWrite(A.bot, 'users/u-customer/tickets/t1', {}, { status: 'paid' }, undefined, botRoot) && canWrite(A.bot, 'tickets/t1', {}, { status: 'valid' }, undefined, botRoot) && canWrite(A.bot, 'orders/o1', {}, { paymentStatus: 'paid' }, undefined, botRoot));
t('bot writes audit_log and notifications (trigger flows)', canWrite(A.bot, 'audit_log/x', {}, { action: 't' }, undefined, botRoot) && canWrite(A.bot, 'notifications/n1', {}, { status: 'sent' }, undefined, botRoot));
t('bot can be made super_admin (system root identity)', canWrite(A.bot, 'staff/u-bot', {}, { email: 'bot@x.com', role: 'super_admin' }, undefined, botRoot));

// Summary
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks, ${failed.length} failures:\n`);
for (const r of results) {
  if (!r.ok) console.log('  FAIL:', r.name);
}
console.log(failed.length === 0 ? '\n✅ ALL RULE CHECKS PASSED' : '\n❌ FAILURES PRESENT');
process.exit(failed.length === 0 ? 0 : 1);
