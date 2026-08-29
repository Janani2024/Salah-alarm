/**
 * Hijri date display (spec §6.1, §40 "nice to have").
 *
 * Uses the runtime's own Umm al-Qura calendar data via `Intl` rather than
 * bundling a conversion table. A manual ±2 day correction is offered because
 * local moon-sighting authorities differ from the tabular calendar.
 */

const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qi'dah",
  "Dhu al-Hijjah",
];

export interface HijriDate {
  day: number;
  month: number; // 1-12
  monthName: string;
  year: number;
  formatted: string;
}

let supported: boolean | null = null;

export function hijriSupported(): boolean {
  if (supported !== null) return supported;
  try {
    new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
    }).format(new Date());
    supported = true;
  } catch {
    supported = false;
  }
  return supported;
}

/**
 * Convert an instant to a Hijri date.
 *
 * @param offsetDays manual correction, typically −2…+2.
 */
export function toHijri(
  timestamp: number,
  timeZone: string,
  offsetDays = 0,
): HijriDate | null {
  if (!hijriSupported()) return null;
  try {
    const adjusted = new Date(timestamp + offsetDays * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      timeZone,
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).formatToParts(adjusted);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value.replace(/\D/g, "") ?? "0");

    const day = get("day");
    const month = get("month");
    const year = get("year");
    if (!day || !month || !year) return null;

    const monthName = HIJRI_MONTHS[month - 1] ?? "";
    return {
      day,
      month,
      year,
      monthName,
      formatted: `${day} ${monthName} ${year} AH`,
    };
  } catch {
    return null;
  }
}

/** True during Ramadan — used to surface Suhoor guidance (spec §39). */
export function isRamadan(hijri: HijriDate | null): boolean {
  return hijri?.month === 9;
}
