/**
 * Time-zone arithmetic (spec §13.5, §39).
 *
 * Prayer times are computed as an hour-of-day in the *location's* time zone,
 * but alarms must fire against an absolute instant. These helpers convert
 * between the two correctly across DST transitions and travel.
 *
 * Everything is built on `Intl` — no time-zone database is bundled.
 */

const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = OFFSET_FORMATTERS.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    OFFSET_FORMATTERS.set(timeZone, fmt);
  }
  return fmt;
}

/** The device's current IANA time zone. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True when `timeZone` is a zone this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(instant: number, timeZone: string): ZonedParts {
  const parts = offsetFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Intl can render midnight as hour 24 in some engines.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * UTC offset of `timeZone` at a given instant, in minutes east of UTC.
 * (Asia/Kolkata → 330, America/New_York in winter → -300.)
 */
export function utcOffsetMinutes(instant: number, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to the nearest minute: the source instant may carry milliseconds.
  return Math.round((asUtc - instant) / 60000);
}

/**
 * Convert a wall-clock time in `timeZone` to an absolute instant.
 *
 * Resolved iteratively because the offset itself depends on the instant.
 * Two passes settle every real-world zone, including DST boundaries; for a
 * wall-clock time that does not exist (spring-forward gap) the result lands
 * just after the transition, which is the behaviour users expect from an
 * alarm.
 */
export function zonedTimeToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes = 0,
  seconds = 0,
  ms = 0,
): number {
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds, ms);

  let offset = utcOffsetMinutes(asUtc, timeZone);
  let instant = asUtc - offset * 60000;

  // Re-evaluate: the first guess may have straddled a DST change.
  const corrected = utcOffsetMinutes(instant, timeZone);
  if (corrected !== offset) {
    offset = corrected;
    instant = asUtc - offset * 60000;
  }
  return instant;
}

/**
 * Convert a fractional hour-of-day (e.g. 4.8667 = 04:52) in `timeZone` on a
 * given civil date to an absolute instant, rounded to the whole minute.
 *
 * Hours may fall outside [0, 24) — the engine can return e.g. 25.2 for an
 * Isha that lands after midnight — and the date rolls over correctly.
 */
export function hoursToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hours: number,
): number {
  const totalMinutes = Math.round(hours * 60);
  return zonedTimeToInstant(timeZone, year, month, day, 0, totalMinutes, 0, 0);
}

/** Civil date key `YYYY-MM-DD` for an instant in a given zone. */
export function dateKeyInZone(instant: number, timeZone: string): string {
  const p = partsInZone(instant, timeZone);
  return `${p.year.toString().padStart(4, "0")}-${p.month
    .toString()
    .padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

/** Calendar fields for an instant in a given zone. */
export function civilDateInZone(
  instant: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const p = partsInZone(instant, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

/** Parse a `YYYY-MM-DD` key. */
export function parseDateKey(key: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Build a `YYYY-MM-DD` key from calendar fields. */
export function toDateKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/** Add whole days to a date key, staying in the civil calendar. */
export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  // UTC arithmetic is safe here: these are calendar fields, not instants.
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Human-friendly zone label, e.g. "Asia/Kolkata (GMT+05:30)". */
export function describeTimeZone(timeZone: string, instant = Date.now()): string {
  const offset = utcOffsetMinutes(instant, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const hh = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const mm = (abs % 60).toString().padStart(2, "0");
  return `${timeZone} (GMT${sign}${hh}:${mm})`;
}
