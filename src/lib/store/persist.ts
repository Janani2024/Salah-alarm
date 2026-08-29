/**
 * Local-first persistence (spec §34 — settings stay on the device, no
 * account, everything deletable).
 *
 * Deliberately synchronous `localStorage` rather than IndexedDB: the state is
 * small, and the alarm scheduler must be able to read it during a
 * `visibilitychange` handler without awaiting a transaction.
 */

export const STORAGE_KEY = "salah-alarm.state.v1";
export const STATE_VERSION = 1;

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Whether persistent storage is usable at all (private mode, quota, policy). */
export function storageAvailable(): boolean {
  if (!isBrowser()) return false;
  try {
    const probe = "__salah_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readState<T>(): (T & { version: number }) | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T & { version?: number };
    if (typeof parsed !== "object" || parsed === null) return null;
    return { ...parsed, version: parsed.version ?? 0 };
  } catch {
    // Corrupt payload: better to start clean than to crash on boot.
    return null;
  }
}

export function writeState(state: unknown): boolean {
  if (!isBrowser()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Spec §27 Privacy → "Data deletion". */
export function clearState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do */
  }
}
