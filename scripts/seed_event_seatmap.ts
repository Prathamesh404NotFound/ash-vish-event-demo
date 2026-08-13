/**
 * Seeds evt_001 (and any event missing a seatMap) with the seat map from
 * mockEvents. Run once to align the RTDB primary source of truth with what
 * the frontend seeded. Usage: npx tsx scripts/seed_event_seatmap.ts
 */
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';
import { MOCK_EVENTS } from '../src/data/mockEvents';

const app = initializeApp({
  databaseURL:
    process.env.FIREBASE_DATABASE_URL ||
    'https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app',
});
const db = getDatabase(app);

async function main() {
  const snap = await get(ref(db, 'events'));
  if (!snap.exists()) {
    console.error('No events found in RTDB');
    process.exit(1);
  }
  const events = snap.val();
  const updates: Record<string, any> = {};
  for (const id of Object.keys(events)) {
    const evt = events[id];
    if (!evt || evt.seatMap) continue;
    const mock = MOCK_EVENTS.find((m) => m.id === id);
    if (!mock || !mock.seatMap) {
      console.warn(`No seat map available for ${id}, skipping`);
      continue;
    }
    updates[`events/${id}/seatMap`] = mock.seatMap;
    console.log(`Seeding seatMap for ${id}: ${mock.seatMap.rows}x${mock.seatMap.cols}`);
  }
  if (Object.keys(updates).length === 0) {
    console.log('Nothing to seed');
    return;
  }
  await update(ref(db), updates);
  console.log('Done');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
