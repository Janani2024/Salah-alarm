/**
 * Solar astronomy primitives for prayer-time calculation.
 *
 * Implements the standard low-precision solar position model (Meeus / U.S.
 * Naval Observatory almanac approximation) used by the widely-verified
 * PrayTimes algorithm. Accurate to well under a minute for prayer purposes.
 *
 * All angles in this module are in DEGREES unless a name says otherwise.
 */

const DEG = Math.PI / 180;

export const dsin = (d: number) => Math.sin(d * DEG);
export const dcos = (d: number) => Math.cos(d * DEG);
export const dtan = (d: number) => Math.tan(d * DEG);

export const darcsin = (x: number) => Math.asin(x) / DEG;
export const darccos = (x: number) => Math.acos(x) / DEG;
export const darctan2 = (y: number, x: number) => Math.atan2(y, x) / DEG;
export const darccot = (x: number) => Math.atan2(1, x) / DEG;

/** Wrap a value into [0, range). */
export function fix(a: number, range: number): number {
  const v = a - range * Math.floor(a / range);
  return v < 0 ? v + range : v;
}

export const fixAngle = (a: number) => fix(a, 360);
export const fixHour = (a: number) => fix(a, 24);

/**
 * Julian Day Number for a civil (proleptic Gregorian) date at 00:00 UT.
 */
export function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5
  );
}

export interface SunPosition {
  /** Solar declination, degrees. */
  declination: number;
  /** Equation of time, hours. */
  equation: number;
}

/**
 * Apparent solar declination and equation of time for a Julian Day.
 */
export function sunPosition(jd: number): SunPosition {
  const d = jd - 2451545.0;

  // Mean anomaly, mean longitude, ecliptic longitude of the sun.
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const l = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g));

  // Obliquity of the ecliptic.
  const e = 23.439 - 0.00000036 * d;

  const rightAscension = fixHour(darctan2(dcos(e) * dsin(l), dcos(l)) / 15);

  return {
    declination: darcsin(dsin(e) * dsin(l)),
    equation: q / 15 - rightAscension,
  };
}

/**
 * Local solar noon, as an hour offset from local midnight (mean solar time).
 * `dayFraction` is the current estimate of the time of day, used to evaluate
 * the sun's position at roughly the right instant.
 */
export function midDay(jd: number, dayFraction: number): number {
  const { equation } = sunPosition(jd + dayFraction);
  return fixHour(12 - equation);
}

/**
 * Hour at which the sun sits `angle` degrees below the horizon.
 *
 * @param direction `"ccw"` for morning (before noon), `"cw"` for evening.
 * @returns the hour, or `NaN` when the sun never reaches that angle
 *          (perpetual day/night at high latitude).
 */
export function sunAngleTime(
  jd: number,
  latitude: number,
  angle: number,
  dayFraction: number,
  direction: "ccw" | "cw",
): number {
  const { declination } = sunPosition(jd + dayFraction);
  const noon = midDay(jd, dayFraction);

  const numerator = -dsin(angle) - dsin(declination) * dsin(latitude);
  const denominator = dcos(declination) * dcos(latitude);
  const ratio = numerator / denominator;

  // Outside [-1, 1] the sun never crosses this altitude on this day.
  if (ratio > 1 || ratio < -1) return NaN;

  const hourAngle = darccos(ratio) / 15;
  return noon + (direction === "ccw" ? -hourAngle : hourAngle);
}

/**
 * Hour at which an object's shadow reaches `factor` times its own length
 * plus its noon shadow — i.e. the Asr criterion.
 *
 * @param factor 1 for Shafi'i/Maliki/Hanbali, 2 for Hanafi.
 */
export function asrTime(
  jd: number,
  latitude: number,
  factor: number,
  dayFraction: number,
): number {
  const { declination } = sunPosition(jd + dayFraction);
  const angle = -darccot(factor + dtan(Math.abs(latitude - declination)));
  return sunAngleTime(jd, latitude, angle, dayFraction, "cw");
}

/**
 * Signed difference between two hour values, normalised into [0, 24).
 */
export function timeDiff(from: number, to: number): number {
  return fixHour(to - from);
}
