export const LEGACY_ACTIVE_SHIFT_STORAGE_KEY = 'ashvish_active_shift';
export const ACTIVE_COUNTER_STORAGE_KEY = 'ashvish_active_counter_id';

export interface StoredCounterShift {
  shiftId?: string;
  counterId?: string;
  subUserId?: string;
  subUserName?: string;
  staffId?: string;
  status?: string;
}

export const activeShiftStorageKey = (counterId?: string | null): string =>
  counterId ? `ashvish_active_shift_${counterId}` : LEGACY_ACTIVE_SHIFT_STORAGE_KEY;

export const readStoredActiveShift = (counterId?: string | null): StoredCounterShift | null => {
  try {
    const key = activeShiftStorageKey(counterId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredCounterShift;
      if (!counterId || parsed?.counterId === counterId) return parsed;
    }

    // Migrate a legacy session only when it belongs to the requested counter.
    if (counterId) {
      const legacyRaw = localStorage.getItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as StoredCounterShift;
        if (legacy?.counterId === counterId) return legacy;
      }
    }
  } catch {
    // Storage may be unavailable or contain stale JSON.
  }
  return null;
};

export const writeStoredActiveShift = (shift: StoredCounterShift): void => {
  try {
    if (!shift.counterId) return;
    localStorage.setItem(activeShiftStorageKey(shift.counterId), JSON.stringify(shift));
    localStorage.setItem(ACTIVE_COUNTER_STORAGE_KEY, String(shift.counterId));
    // Remove the old global key after migrating a matching session.
    const legacyRaw = localStorage.getItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as StoredCounterShift;
      if (legacy?.shiftId === shift.shiftId) localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    }
  } catch {
    // Storage is best-effort; the server remains the source of truth.
  }
};

export const clearStoredActiveShift = (shiftOrCounterId?: StoredCounterShift | string | null): void => {
  try {
    const counterId = typeof shiftOrCounterId === 'string' ? shiftOrCounterId : shiftOrCounterId?.counterId;
    const shiftId = typeof shiftOrCounterId === 'object' ? shiftOrCounterId?.shiftId : undefined;
    if (counterId) localStorage.removeItem(activeShiftStorageKey(counterId));

    const legacyRaw = localStorage.getItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as StoredCounterShift;
      if (!shiftId || legacy?.shiftId === shiftId || legacy?.counterId === counterId) {
        localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
      }
    }
    if (counterId && localStorage.getItem(ACTIVE_COUNTER_STORAGE_KEY) === counterId) {
      localStorage.removeItem(ACTIVE_COUNTER_STORAGE_KEY);
    }
  } catch {
    // Storage is best-effort.
  }
};

export const readActiveCounterId = (): string => {
  try {
    return localStorage.getItem(ACTIVE_COUNTER_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};
export const isShiftForCounter = (shift: StoredCounterShift | null | undefined, counterId?: string | null): boolean =>
  Boolean(shift && shift.status === 'open' && counterId && shift.counterId === counterId);
export const listStoredCounterShifts = (): StoredCounterShift[] => {
  try {
    const shifts: StoredCounterShift[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith('ashvish_active_shift_')) continue;
      const raw = localStorage.getItem(key);
      if (raw) shifts.push(JSON.parse(raw) as StoredCounterShift);
    }
    return shifts;
  } catch {
    return [];
  }
};

export const readPreferredStoredActiveShift = (): StoredCounterShift | null => {
  const counterId = readActiveCounterId();
  if (counterId) return readStoredActiveShift(counterId);
  return listStoredCounterShifts().find((shift) => shift.status === 'open') || null;
};

export const clearAllStoredActiveShifts = (): void => {
  try {
    localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_COUNTER_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (key.startsWith('ashvish_active_shift_')) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage is best-effort.
  }
};

export const clearStoredActiveShiftForShift = (shiftId: string): void => {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith('ashvish_active_shift_')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const shift = JSON.parse(raw) as StoredCounterShift;
      if (shift.shiftId === shiftId) localStorage.removeItem(key);
    }
    const legacyRaw = localStorage.getItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    if (legacyRaw && (JSON.parse(legacyRaw) as StoredCounterShift)?.shiftId === shiftId) {
      localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    }
  } catch {
    // Storage is best-effort.
  }
};
