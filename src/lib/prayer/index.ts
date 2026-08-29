/** Public surface of the prayer engine (spec §7). */

export * from "./types";
export * from "./methods";
export {
  astronomicalProvider,
  getProvider,
  registerProvider,
  type PrayerCalculationProvider,
} from "./provider";

import { getProvider } from "./provider";
import {
  PRAYER_TYPES,
  type PrayerCalculationInput,
  type PrayerDay,
  type PrayerTime,
  type PrayerType,
} from "./types";
import {
  addDaysToKey,
  civilDateInZone,
  parseDateKey,
  toDateKey,
} from "../time/timezone";

/** Inputs that do not change day to day. */
export type PrayerConfig = Omit<
  PrayerCalculationInput,
  "year" | "month" | "day"
>;

/** Compute one civil day. */
export function computeDay(config: PrayerConfig, dateKey: string): PrayerDay {
  const { year, month, day } = parseDateKey(dateKey);
  return getProvider().calculate({ ...config, year, month, day });
}

/** Compute `count` consecutive days starting at `startKey`. */
export function computeDays(
  config: PrayerConfig,
  startKey: string,
  count: number,
): PrayerDay[] {
  const days: PrayerDay[] = [];
  let key = startKey;
  for (let i = 0; i < count; i += 1) {
    days.push(computeDay(config, key));
    key = addDaysToKey(key, 1);
  }
  return days;
}

/** Today's civil date key in the configured zone. */
export function todayKey(config: PrayerConfig, now = Date.now()): string {
  const { year, month, day } = civilDateInZone(now, config.timeZone);
  return toDateKey(year, month, day);
}

export interface PrayerWindow {
  /** The prayer whose time has most recently passed. */
  current: PrayerTime | null;
  /** The next prayer to arrive. */
  next: PrayerTime | null;
  /** Milliseconds until `next`. */
  msUntilNext: number;
}

/**
 * Resolve the current and next prayer across a day boundary (spec §6.1, §39
 * "midnight crossing"): after Isha, "next" is tomorrow's Fajr.
 */
export function resolveWindow(
  days: PrayerDay[],
  now = Date.now(),
): PrayerWindow {
  const all = days
    .flatMap((d) => d.ordered)
    .sort((a, b) => a.timestamp - b.timestamp);

  let current: PrayerTime | null = null;
  let next: PrayerTime | null = null;

  for (const t of all) {
    if (t.timestamp <= now) current = t;
    else {
      next = t;
      break;
    }
  }

  return {
    current,
    next,
    msUntilNext: next ? next.timestamp - now : 0,
  };
}

/**
 * Whether two days of computed times differ — the trigger for rescheduling
 * during reconciliation (spec §13.2).
 */
export function daysDiffer(a: PrayerDay | undefined, b: PrayerDay): boolean {
  if (!a) return true;
  if (a.dateKey !== b.dateKey) return true;
  if (a.meta.methodId !== b.meta.methodId) return true;
  if (a.meta.asrMethod !== b.meta.asrMethod) return true;
  if (a.meta.highLatitudeRule !== b.meta.highLatitudeRule) return true;
  if (a.meta.timeZone !== b.meta.timeZone) return true;
  return PRAYER_TYPES.some(
    (p) => a.times[p].timestamp !== b.times[p].timestamp,
  );
}

/** Convenience: the five alarmable prayers of a day, in order. */
export function alarmablePrayers(day: PrayerDay): PrayerTime[] {
  return day.ordered.filter((t) => t.prayerType !== "sunrise");
}

export type { PrayerDay, PrayerTime, PrayerType };
