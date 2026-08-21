import { safeFetch } from './api';
import { authenticatedApiHeaders } from './authHeaders';
import { Ticket } from '../types';

export interface QueuedWalkInSale {
  id: string; // queue entry unique id
  idempotencyKey: string;
  timestamp: number;
  payload: {
    eventId: string;
    tierId: string;
    attendeeName: string;
    attendeePhone: string;
    attendeeEmail?: string;
    selectedSeats?: string[];
    paymentMethod?: string;
    payments?: { method: string; amount: number }[];
    discountOverride?: any;
    shiftId?: string;
    scannedByStaffId?: string;
    counterId?: string;
    subUserId?: string;
    subUserName?: string;
  };
  eventTitle?: string;
  tierName?: string;
  totalAmount?: number;
  status: 'pending' | 'syncing' | 'conflict';
  conflictReason?: string;
  retryCount: number;
  lastAttempt?: number;
}

const DB_NAME = 'ash_vish_counter_db';
const DB_VERSION = 1;
const STORE_NAME = 'walk_in_offline_queue';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Enqueue a failed walk-in transaction safely to IndexedDB */
export async function enqueueOfflineSale(sale: Omit<QueuedWalkInSale, 'id' | 'timestamp' | 'status' | 'retryCount'>): Promise<QueuedWalkInSale> {
  const db = await openDatabase();
  const queueEntry: QueuedWalkInSale = {
    ...sale,
    id: `qsale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(queueEntry);

    request.onsuccess = () => resolve(queueEntry);
    request.onerror = () => reject(request.error);
  });
}

/** Get all queued sales */
export async function getQueuedSales(): Promise<QueuedWalkInSale[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as QueuedWalkInSale[]) || [];
        results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Could not read IndexedDB:', err);
    return [];
  }
}

/** Remove an entry from the queue upon successful completion or manual cancellation */
export async function removeQueuedSale(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Could not delete from IndexedDB:', err);
  }
}

/** Update an entry's status or conflict state */
export async function updateQueuedSale(sale: QueuedWalkInSale): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(sale);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Could not update IndexedDB entry:', err);
  }
}

let isSyncInProgress = false;

/**
 * Background synchronization runner:
 * Iterates over pending sales in FIFO order and posts them to /api/walk-in-bookings
 * using their original stored idempotencyKey.
 */
export async function syncOfflineWalkInQueue(
  onTicketConfirmed?: (ticket: Ticket, queueItem: QueuedWalkInSale) => void
): Promise<{ synced: number; conflicts: number; remaining: number }> {
  if (isSyncInProgress) {
    return { synced: 0, conflicts: 0, remaining: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, conflicts: 0, remaining: 0 };
  }

  isSyncInProgress = true;
  let synced = 0;
  let conflicts = 0;

  try {
    const queue = await getQueuedSales();
    const pendingItems = queue.filter((item) => item.status === 'pending');

    for (const item of pendingItems) {
      // Mark as syncing in database
      await updateQueuedSale({ ...item, status: 'syncing', lastAttempt: Date.now(), retryCount: item.retryCount + 1 });

      try {
        const headers = await authenticatedApiHeaders();
        const res = await safeFetch<any>('/api/walk-in-bookings', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...item.payload,
            idempotencyKey: item.idempotencyKey,
          }),
        });

        if (res.ok && res.data?.success && res.data.ticket) {
          // Successfully completed or idempotently confirmed
          await removeQueuedSale(item.id);
          synced += 1;
          if (onTicketConfirmed) {
            onTicketConfirmed(res.data.ticket, item);
          }
        } else {
          // Check if this is a genuine server conflict (400 / 409 / capacity / invalid seat)
          // vs network drop
          const isNetworkError = res.status === 0 || !res.isJson;
          if (isNetworkError) {
            // Leave as pending for next sync retry
            await updateQueuedSale({ ...item, status: 'pending' });
          } else {
            // Conflict (e.g. seat was booked by someone else) -> requires attention
            const conflictMsg = res.data?.error || res.error || 'The requested seat is no longer available or was booked by another customer.';
            await updateQueuedSale({
              ...item,
              status: 'conflict',
              conflictReason: conflictMsg,
            });
            conflicts += 1;
          }
        }
      } catch (err: any) {
        // Network/unexpected exception -> revert to pending
        await updateQueuedSale({ ...item, status: 'pending' });
      }
    }

    const updatedQueue = await getQueuedSales();
    return { synced, conflicts, remaining: updatedQueue.length };
  } finally {
    isSyncInProgress = false;
  }
}
