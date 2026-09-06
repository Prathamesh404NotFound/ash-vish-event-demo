import { ref, push, onValue, remove, get } from 'firebase/database';
import { rtdb } from './firebase';

/**
 * Phone ↔ Laptop scanner link.
 *
 * Protocol (all payloads live under `scanner_links/<CODE>` in RTDB, both
 * devices are authenticated staff — rules restrict the node to staff):
 *
 *  1. Laptop: POST / pair → generates a 6-digit CODE, writes
 *     `scanner_links/<CODE> = { laptopUid, laptopName, createdAt, status: 'open' }`.
 *  2. Phone:  joins with the CODE → sets `joinedAt`/`phoneUid`.
 *  3. Phone scans a QR → pushes `scans/<id> = { signedToken, phoneUid, at }`.
 *  4. Laptop (onValue listener) verifies the token via the standard
 *     server-verified scanTicketQR path and writes the verdict back:
 *     `scans/<id>/result = { ok, verdict, attendee, ticketNumber }`.
 *  5. Phone (onValue listener on its own scan entries) shows the overlay.
 *
 * Sessions expire after 2 hours and are cleaned up on unpair.
 */

export const SCANNER_LINK_TTL_MS = 2 * 60 * 60 * 1000;

export interface ScanLinkRecord {
  laptopUid: string;
  laptopName: string;
  createdAt: number;
  status: 'open' | 'active' | 'closed';
  phoneUid?: string;
  phoneName?: string;
  joinedAt?: number;
}

export interface ScanLinkEntry {
  signedToken: string;
  phoneUid: string;
  at: number;
  result?: { ok: boolean; verdict: string; attendee?: string; ticketNumber?: string };
}

export function generateLinkCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function scanLinkRef(code: string) {
  return ref(rtdb, `scanner_links/${code}`);
}

export function scanLinkScansRef(code: string) {
  return ref(rtdb, `scanner_links/${code}/scans`);
}

/** Laptop: create a pairing code. Returns null if the code is somehow taken. */
export async function createScanLink(code: string, laptopUid: string, laptopName: string): Promise<boolean> {
  const existing = await get(scanLinkRef(code));
  if (existing.exists()) return false;
  await remove(scanLinkRef(code));
  const rec: ScanLinkRecord = {
    laptopUid,
    laptopName: laptopName.slice(0, 64),
    createdAt: Date.now(),
    status: 'open',
  };
  // set via update-style PUT on the node
  const { set } = await import('firebase/database');
  await set(scanLinkRef(code), rec);
  return true;
}

/** Phone: join an open session. */
export async function joinScanLink(code: string, phoneUid: string, phoneName: string): Promise<ScanLinkRecord | null> {
  const snap = await get(scanLinkRef(code));
  if (!snap.exists()) return null;
  const rec = snap.val() as ScanLinkRecord;
  if (Date.now() - (rec.createdAt || 0) > SCANNER_LINK_TTL_MS) return null;
  const { update } = await import('firebase/database');
  await update(scanLinkRef(code), {
    status: 'active',
    phoneUid,
    phoneName: String(phoneName || 'Phone').slice(0, 64),
    joinedAt: Date.now(),
  });
  return rec;
}

/** Phone: submit a scanned token for the laptop to verify. */
export async function submitRemoteScan(code: string, signedToken: string, phoneUid: string): Promise<void> {
  const entry: Omit<ScanLinkEntry, 'result'> = {
    signedToken: String(signedToken).slice(0, 512),
    phoneUid,
    at: Date.now(),
  };
  await push(scanLinkScansRef(code), entry);
}

/** Laptop: write the verification verdict back to the phone. */
export async function reportScanResult(code: string, scanId: string, result: ScanLinkEntry['result']): Promise<void> {
  const { update } = await import('firebase/database');
  await update(ref(rtdb, `scanner_links/${code}/scans/${scanId}`), { result });
}

/** Both: subscribe to the session (laptop watches scans; phone watches state). */
export function watchScanLink(code: string, cb: (rec: ScanLinkRecord | null) => void): () => void {
  return onValue(scanLinkRef(code), (snap) => cb(snap.exists() ? (snap.val() as ScanLinkRecord) : null));
}

export function watchScanEntries(code: string, cb: (entries: Record<string, ScanLinkEntry>) => void): () => void {
  return onValue(scanLinkScansRef(code), (snap) => cb(snap.exists() ? snap.val() : {}));
}

/** Both: tear down the session. */
export async function closeScanLink(code: string): Promise<void> {
  await remove(scanLinkRef(code)).catch(() => {});
}
