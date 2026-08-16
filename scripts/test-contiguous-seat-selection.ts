import assert from 'node:assert/strict';
import {
  chooseSeatSelection,
  findContiguousSeatBlock,
  makeSeatId,
} from '../src/lib/contiguousSeatSelection';

const available = (row: number, columns: number[]) => {
  const seats = new Set(columns.map((column) => makeSeatId(row, column)));
  return (seatId: string) => seats.has(seatId);
};

// Exact fit run.
assert.deepEqual(findContiguousSeatBlock({ row: 1, anchorColumn: 3, quantity: 3, columns: 8, isSeatAvailable: available(1, [2, 3, 4]) }), ['R1-C2', 'R1-C3', 'R1-C4']);

// A larger run on both sides chooses a full group with no singleton pocket.
const bothSides = findContiguousSeatBlock({ row: 1, anchorColumn: 4, quantity: 3, columns: 8, isSeatAvailable: available(1, [1, 2, 3, 4, 5, 6, 7]) });
assert.ok(bothSides?.includes('R1-C4'));
assert.equal(bothSides?.length, 3);
assert.notDeepEqual(bothSides, ['R1-C2', 'R1-C3', 'R1-C4']);

// A larger run only on one side remains contiguous and includes the anchor.
assert.deepEqual(findContiguousSeatBlock({ row: 2, anchorColumn: 1, quantity: 4, columns: 8, isSeatAvailable: available(2, [1, 2, 3, 4, 5, 6]) }), ['R2-C1', 'R2-C2', 'R2-C3', 'R2-C4']);

// Too-small runs reject an anchor; aisles are also hard boundaries.
assert.equal(findContiguousSeatBlock({ row: 3, anchorColumn: 2, quantity: 3, columns: 8, isSeatAvailable: available(3, [1, 2]) }), null);
assert.equal(findContiguousSeatBlock({ row: 4, anchorColumn: 4, quantity: 3, columns: 8, aisleAfterCols: [4], isSeatAvailable: available(4, [3, 4, 5, 6]) }), null);

// Single-seat behavior remains free-form; an existing one toggles off.
assert.deepEqual(chooseSeatSelection({ anchorSeatId: 'R5-C2', currentSeatIds: [], row: 5, anchorColumn: 2, quantity: 1, columns: 8, isSeatAvailable: available(5, [2, 3]) }).seatIds, ['R5-C2']);
assert.deepEqual(chooseSeatSelection({ anchorSeatId: 'R5-C2', currentSeatIds: ['R5-C2'], row: 5, anchorColumn: 2, quantity: 1, columns: 8, isSeatAvailable: available(5, [2, 3]) }).seatIds, []);

// Clicking inside an auto-selected multi-seat block clears the full block.
assert.deepEqual(chooseSeatSelection({ anchorSeatId: 'R6-C3', currentSeatIds: ['R6-C2', 'R6-C3', 'R6-C4'], row: 6, anchorColumn: 3, quantity: 3, columns: 8, isSeatAvailable: available(6, [1, 2, 3, 4, 5]) }).seatIds, []);

console.log('Contiguous seat selection tests passed.');
