/** Default alarm configuration (spec §5.4, §10, §27). */

import { ALARMABLE_PRAYERS, type AlarmablePrayer } from "../prayer/types";
import type { PrayerAlarm, SoundType } from "./types";

/** Defaults applied to newly created alarms (Settings → Alarms, spec §27). */
export interface AlarmDefaults {
  soundType: SoundType;
  snoozeDurationMinutes: number;
  maxSnoozes: number | null;
  vibrationEnabled: boolean;
  volumeLevel: number;
  gradualVolume: boolean;
  preAlertEnabled: boolean;
  preAlertMinutes: number;
  autoDismissMinutes: number;
}

export const ALARM_DEFAULTS: AlarmDefaults = {
  soundType: "adhan",
  snoozeDurationMinutes: 5,
  maxSnoozes: 3,
  vibrationEnabled: true,
  volumeLevel: 80,
  gradualVolume: true,
  preAlertEnabled: false,
  preAlertMinutes: 10,
  autoDismissMinutes: 5,
};

export const SNOOZE_OPTIONS = [1, 5, 10, 15, 20] as const;
export const MAX_SNOOZE_OPTIONS: Array<number | null> = [1, 2, 3, 5, null];
export const PRE_ALERT_OPTIONS = [5, 10, 15, 30] as const;

let idCounter = 0;

/**
 * Stable-ish unique id. `crypto.randomUUID` is used where available; the
 * counter fallback keeps ids unique in non-secure contexts and in tests.
 */
export function newId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function createAlarm(
  prayerType: AlarmablePrayer,
  defaults: AlarmDefaults = ALARM_DEFAULTS,
  enabled = true,
): PrayerAlarm {
  const now = Date.now();
  return {
    id: newId("alarm"),
    prayerType,
    enabled,
    triggerMode: "exact",
    offsetMinutes: 0,
    soundType: defaults.soundType,
    volumeMode: "custom",
    volumeLevel: defaults.volumeLevel,
    gradualVolume: defaults.gradualVolume,
    vibrationEnabled: defaults.vibrationEnabled,
    snoozeEnabled: true,
    snoozeDurationMinutes: defaults.snoozeDurationMinutes,
    maxSnoozes: defaults.maxSnoozes,
    autoDismissMinutes: defaults.autoDismissMinutes,
    preAlertEnabled: defaults.preAlertEnabled,
    preAlertMinutes: defaults.preAlertMinutes,
    challengeType: "none",
    createdAt: now,
    updatedAt: now,
  };
}

/** One alarm per prayer, in canonical order. */
export function createDefaultAlarms(
  enabledPrayers: readonly AlarmablePrayer[] = ALARMABLE_PRAYERS,
  defaults: AlarmDefaults = ALARM_DEFAULTS,
): PrayerAlarm[] {
  return ALARMABLE_PRAYERS.map((p) =>
    createAlarm(p, defaults, enabledPrayers.includes(p)),
  );
}

/** Resolve the signed offset implied by a trigger mode (spec §8.2). */
export function offsetForMode(
  mode: PrayerAlarm["triggerMode"],
  magnitude: number,
): number {
  if (mode === "exact") return 0;
  const abs = Math.abs(magnitude);
  return mode === "before" ? -abs : abs;
}

/** Inverse of {@link offsetForMode}. */
export function modeForOffset(offsetMinutes: number): {
  mode: PrayerAlarm["triggerMode"];
  magnitude: number;
} {
  if (offsetMinutes === 0) return { mode: "exact", magnitude: 0 };
  return offsetMinutes < 0
    ? { mode: "before", magnitude: -offsetMinutes }
    : { mode: "after", magnitude: offsetMinutes };
}
