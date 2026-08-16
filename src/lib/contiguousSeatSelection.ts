export interface ContiguousSeatBlockOptions {
  row: number;
  anchorColumn: number;
  quantity: number;
  columns: number;
  aisleAfterCols?: number[];
  isSeatAvailable: (seatId: string) => boolean;
}

export interface ContiguousSeatSelectionOptions extends ContiguousSeatBlockOptions {
  anchorSeatId: string;
  currentSeatIds: string[];
}

export interface SeatSelectionResult {
  seatIds: string[];
  error?: string;
}

export const makeSeatId = (row: number, column: number) => `R${row}-C${column}`;

export function parseSeatId(seatId: string): { row: number; column: number } | null {
  const match = /^R(\d+)-C(\d+)$/.exec(seatId);
  if (!match) return null;
  return { row: Number(match[1]), column: Number(match[2]) };
}

function sectionBounds(anchorColumn: number, columns: number, aisleAfterCols: number[]) {
  const boundaries = new Set(aisleAfterCols.filter((column) => column >= 1 && column < columns));
  let start = 1;
  let end = columns;

  for (let column = anchorColumn - 1; column >= 1; column -= 1) {
    if (boundaries.has(column)) {
      start = column + 1;
      break;
    }
  }
  for (let column = anchorColumn; column < columns; column += 1) {
    if (boundaries.has(column)) {
      end = column;
      break;
    }
  }
  return { start, end };
}

/**
 * Finds a same-row, aisle-safe contiguous block containing the anchor. The
 * ordering protects sellability first (no one-seat pockets), then keeps the
 * group natural around the buyer's click, then favours the row centre.
 */
export function findContiguousSeatBlock(options: ContiguousSeatBlockOptions): string[] | null {
  const {
    row,
    anchorColumn,
    quantity,
    columns,
    aisleAfterCols = [],
    isSeatAvailable,
  } = options;

  if (!Number.isInteger(quantity) || quantity < 1 || anchorColumn < 1 || anchorColumn > columns) return null;
  if (!isSeatAvailable(makeSeatId(row, anchorColumn))) return null;

  const section = sectionBounds(anchorColumn, columns, aisleAfterCols);
  let runStart = anchorColumn;
  let runEnd = anchorColumn;

  while (runStart > section.start && isSeatAvailable(makeSeatId(row, runStart - 1))) runStart -= 1;
  while (runEnd < section.end && isSeatAvailable(makeSeatId(row, runEnd + 1))) runEnd += 1;
  if (runEnd - runStart + 1 < quantity) return null;

  const firstWindowStart = Math.max(runStart, anchorColumn - quantity + 1);
  const lastWindowStart = Math.min(anchorColumn, runEnd - quantity + 1);
  const rowCentre = (columns + 1) / 2;
  let best: { start: number; orphanPockets: number; anchorDistance: number; centreDistance: number } | null = null;

  for (let start = firstWindowStart; start <= lastWindowStart; start += 1) {
    const end = start + quantity - 1;
    const leftRemaining = start - runStart;
    const rightRemaining = runEnd - end;
    const orphanPockets = Number(leftRemaining === 1) + Number(rightRemaining === 1);
    const blockCentre = (start + end) / 2;
    const candidate = {
      start,
      orphanPockets,
      anchorDistance: Math.abs(blockCentre - anchorColumn),
      centreDistance: Math.abs(blockCentre - rowCentre),
    };

    if (!best ||
      candidate.orphanPockets < best.orphanPockets ||
      (candidate.orphanPockets === best.orphanPockets && candidate.anchorDistance < best.anchorDistance) ||
      (candidate.orphanPockets === best.orphanPockets && candidate.anchorDistance === best.anchorDistance && candidate.centreDistance < best.centreDistance) ||
      (candidate.orphanPockets === best.orphanPockets && candidate.anchorDistance === best.anchorDistance && candidate.centreDistance === best.centreDistance && candidate.start < best.start)) {
      best = candidate;
    }
  }

  return best
    ? Array.from({ length: quantity }, (_, index) => makeSeatId(row, best!.start + index))
    : null;
}

/** Applies the documented click behavior without coupling tests to React state. */
export function chooseSeatSelection(options: ContiguousSeatSelectionOptions): SeatSelectionResult {
  const { anchorSeatId, currentSeatIds, quantity, ...blockOptions } = options;
  const anchor = parseSeatId(anchorSeatId);
  if (!anchor) return { seatIds: currentSeatIds, error: 'This seat is not available.' };

  if (quantity === 1) {
    if (currentSeatIds.includes(anchorSeatId)) return { seatIds: [] };
    if (currentSeatIds.length >= 1) return { seatIds: currentSeatIds, error: 'Unselect your current seat before choosing another.' };
    return { seatIds: [anchorSeatId] };
  }

  if (currentSeatIds.includes(anchorSeatId)) return { seatIds: [] };
  const block = findContiguousSeatBlock({ ...blockOptions, row: anchor.row, anchorColumn: anchor.column, quantity });
  if (!block) {
    return {
      seatIds: currentSeatIds,
      error: `Not enough seats together here for a group of ${quantity}. Try another seat or reduce your quantity.`,
    };
  }
  return { seatIds: block };
}
