/** Domain types for the prayer-time engine (spec §7, §30). */

/** The five daily prayers plus the informational solar events. */
export const PRAYER_TYPES = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
] as const;

export type PrayerType = (typeof PRAYER_TYPES)[number];

/** Only these can carry an alarm — sunrise is informational (spec §6.2). */
export const ALARMABLE_PRAYERS = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
] as const;

export type AlarmablePrayer = (typeof ALARMABLE_PRAYERS)[number];

export const PRAYER_LABELS: Record<PrayerType, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export function isAlarmable(p: PrayerType): p is AlarmablePrayer {
  return p !== "sunrise";
}

/** Asr juristic method (spec §20). */
export type AsrMethod = "standard" | "hanafi";

/** High-latitude adjustment rule (spec §20). */
export type HighLatitudeRule =
  | "none"
  | "middleOfNight"
  | "seventhOfNight"
  | "angleBased";

export const HIGH_LATITUDE_LABELS: Record<HighLatitudeRule, string> = {
  none: "None",
  middleOfNight: "Middle of the night",
  seventhOfNight: "One-seventh of the night",
  angleBased: "Angle-based",
};

export const ASR_METHOD_LABELS: Record<AsrMethod, string> = {
  standard: "Standard (Shafi'i, Maliki, Hanbali)",
  hanafi: "Hanafi",
};

/**
 * A twilight parameter is either an angle below the horizon, or a fixed
 * number of minutes after the adjacent solar event (used by Umm al-Qura
 * and Qatar for Isha, and by most methods for Maghrib).
 */
export type TwilightParam =
  | { kind: "angle"; degrees: number }
  | { kind: "minutes"; minutes: number };

/** Per-prayer manual correction in minutes (spec §20). */
export type PrayerOffsets = Record<PrayerType, number>;

export const ZERO_OFFSETS: PrayerOffsets = {
  fajr: 0,
  sunrise: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
};

/** Everything the engine needs to produce a day of times (spec §7.1). */
export interface PrayerCalculationInput {
  /** Civil date in the target time zone. */
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  latitude: number;
  longitude: number;
  /** IANA time zone the civil date belongs to, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** Metres above sea level; refines sunrise/sunset. */
  elevation?: number;
  methodId: string;
  asrMethod: AsrMethod;
  highLatitudeRule: HighLatitudeRule;
  offsets: PrayerOffsets;
}

/** A single computed prayer time (spec §30 `PrayerTime`). */
export interface PrayerTime {
  prayerType: PrayerType;
  /** Absolute instant. This is what the alarm engine schedules against. */
  timestamp: number;
  /** Hour-of-day in the target time zone, for display and diagnostics. */
  hours: number;
  /**
   * True when the sun never reached the required angle and a high-latitude
   * rule supplied the value instead (spec §39).
   */
  estimated: boolean;
}

/** One full day of prayer times. */
export interface PrayerDay {
  /** Civil date key, `YYYY-MM-DD`, in the target time zone. */
  dateKey: string;
  times: Record<PrayerType, PrayerTime>;
  /** Ordered list, earliest first. */
  ordered: PrayerTime[];
  /** Echoed inputs, for the diagnostics screen (spec §7.4). */
  meta: {
    methodId: string;
    methodName: string;
    asrMethod: AsrMethod;
    highLatitudeRule: HighLatitudeRule;
    latitude: number;
    longitude: number;
    timeZone: string;
    utcOffsetMinutes: number;
    source: string;
    /**
     * Set during polar day/night, when times were derived at a substitute
     * latitude (*aqrab al-bilad*). Surfaced in Diagnostics (spec §7.4).
     */
    fallbackLatitude?: number;
  };
}
