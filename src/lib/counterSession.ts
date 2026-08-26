export const LEGACY_ACTIVE_SHIFT_STORAGE_KEY = 'ashvish_active_shift';
export const ACTIVE_COUNTER_STORAGE_KEY = 'ashvish_active_counter_id';
export const ACTIVE_SUB_USER_STORAGE_KEY = 'ashvish_active_sub_user_id';
const ACTIVE_SHIFT_STORAGE_PREFIX = 'ashvish_active_shift_';

export interface StoredCounterShift {
  shiftId?: string;
  counterId?: string;
  subUserId?: string;
  subUserName?: string;
  staffId?: string;
  status?: string;
}

const scopedActiveShiftStorageKey = (counterId: string, subUserId: string): string =>
  `${ACTIVE_SHIFT_STORAGE_PREFIX}${encodeURIComponent(counterId)}_${encodeURIComponent(subUserId)}`;

const legacyCounterStorageKey = (counterId: string): string =>
  `${ACTIVE_SHIFT_STORAGE_PREFIX}${encodeURIComponent(counterId)}`;

export const activeShiftStorageKey = (counterId?: string | null, subUserId?: string | null): string =>
  counterId && subUserId
    ? scopedActiveShiftStorageKey(counterId, subUserId)
    : counterId
      ? legacyCounterStorageKey(counterId)
      : LEGACY_ACTIVE_SHIFT_STORAGE_KEY;

const readJson = (key: string): StoredCounterShift | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as StoredCounterShift : null;
  } catch {
    return null;
  }
};

export const readStoredActiveShift = (counterId?: string | null, subUserId?: string | null): StoredCounterShift | null => {
  try {
    if (!counterId) return readJson(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);

    const rememberedSubUserId = subUserId || (
      localStorage.getItem(ACTIVE_COUNTER_STORAGE_KEY) === counterId
        ? localStorage.getItem(ACTIVE_SUB_USER_STORAGE_KEY) || ''
        : ''
    );
    if (rememberedSubUserId) {
      const scoped = readJson(scopedActiveShiftStorageKey(counterId, rememberedSubUserId));
      if (scoped?.counterId === counterId && scoped.subUserId === rememberedSubUserId) return scoped;
    }

    // Migrate a legacy per-counter record only when it matches the requested counter.
    const legacy = readJson(legacyCounterStorageKey(counterId));
    if (legacy?.counterId === counterId && (!subUserId || legacy.subUserId === subUserId)) return legacy;

    // Migrate the oldest global record only when it matches the requested counter.
    const global = readJson(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    if (global?.counterId === counterId && (!subUserId || global.subUserId === subUserId)) return global;
  } catch {
    // Storage may be unavailable or contain stale JSON.
  }
  return null;
};

export const writeStoredActiveShift = (shift: StoredCounterShift): void => {
  try {
    if (!shift.counterId || !shift.subUserId) return;
    localStorage.setItem(
      scopedActiveShiftStorageKey(shift.counterId, shift.subUserId),
      JSON.stringify(shift)
    );
    localStorage.setItem(ACTIVE_COUNTER_STORAGE_KEY, shift.counterId);
    localStorage.setItem(ACTIVE_SUB_USER_STORAGE_KEY, shift.subUserId);

    // Remove old keys after a matching session has been migrated.
    const legacyKeys = [legacyCounterStorageKey(shift.counterId), LEGACY_ACTIVE_SHIFT_STORAGE_KEY];
    legacyKeys.forEach((key) => {
      const legacy = readJson(key);
      if (legacy?.shiftId === shift.shiftId) localStorage.removeItem(key);
    });
  } catch {
    // Storage is best-effort; the server remains the source of truth.
  }
};

export const clearStoredActiveShift = (shiftOrCounterId?: StoredCounterShift | string | null): void => {
  try {
    const counterId = typeof shiftOrCounterId === 'string' ? shiftOrCounterId : shiftOrCounterId?.counterId;
    const shiftId = typeof shiftOrCounterId === 'object' ? shiftOrCounterId?.shiftId : undefined;
    const subUserId = typeof shiftOrCounterId === 'object' ? shiftOrCounterId?.subUserId : undefined;
    const rememberedSubUserId = subUserId || (
      counterId && localStorage.getItem(ACTIVE_COUNTER_STORAGE_KEY) === counterId
        ? localStorage.getItem(ACTIVE_SUB_USER_STORAGE_KEY) || ''
        : ''
    );

    if (counterId && rememberedSubUserId) {
      const key = scopedActiveShiftStorageKey(counterId, rememberedSubUserId);
      const stored = readJson(key);
      if (!shiftId || stored?.shiftId === shiftId) localStorage.removeItem(key);
    }
    if (counterId) {
      const legacy = readJson(legacyCounterStorageKey(counterId));
      if (!shiftId || legacy?.shiftId === shiftId || legacy?.counterId === counterId) {
        localStorage.removeItem(legacyCounterStorageKey(counterId));
      }
    }

    const global = readJson(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    if (!shiftId || global?.shiftId === shiftId || global?.counterId === counterId) {
      localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    }

    if (counterId && localStorage.getItem(ACTIVE_COUNTER_STORAGE_KEY) === counterId &&
      (!subUserId || localStorage.getItem(ACTIVE_SUB_USER_STORAGE_KEY) === subUserId)) {
      localStorage.removeItem(ACTIVE_COUNTER_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_SUB_USER_STORAGE_KEY);
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
      if (!key.startsWith(ACTIVE_SHIFT_STORAGE_PREFIX)) continue;
      const shift = readJson(key);
      if (shift) shifts.push(shift);
    }
    return shifts;
  } catch {
    return [];
  }
};

export const readPreferredStoredActiveShift = (counterId?: string | null): StoredCounterShift | null => {
  const preferredCounterId = counterId || readActiveCounterId();
  if (preferredCounterId) return readStoredActiveShift(preferredCounterId);
  return readJson(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
};

export const clearAllStoredActiveShifts = (): void => {
  try {
    localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_COUNTER_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_SUB_USER_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (key.startsWith(ACTIVE_SHIFT_STORAGE_PREFIX)) keysToRemove.push(key);
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
      if (!key.startsWith(ACTIVE_SHIFT_STORAGE_PREFIX)) continue;
      const shift = readJson(key);
      if (shift?.shiftId === shiftId) localStorage.removeItem(key);
    }
    const global = readJson(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
    if (global?.shiftId === shiftId) localStorage.removeItem(LEGACY_ACTIVE_SHIFT_STORAGE_KEY);
  } catch {
    // Storage is best-effort.
  }
};

export const activeShiftKeyForSubUser = activeShiftStorageKey;
export const isStoredShiftForSubUser = (
  shift: StoredCounterShift | null | undefined,
  counterId?: string | null,
  subUserId?: string | null,
): boolean => Boolean(shift && isShiftForCounter(shift, counterId) && (!subUserId || shift.subUserId === subUserId));
