/**
 * `PrayerCalculationProvider` — the abstraction demanded by spec §7.3.
 *
 * The astronomical provider is the only implementation shipped in the MVP,
 * but mosque timetables (§21) and a future API provider plug in here without
 * touching the alarm engine: everything downstream consumes `PrayerDay`.
 */

import {
  asrTime,
  julianDay,
  midDay,
  sunAngleTime,
  timeDiff,
} from "./astronomy";
import { getMethod, type CalculationMethod } from "./methods";
import {
  PRAYER_TYPES,
  type PrayerCalculationInput,
  type PrayerDay,
  type PrayerTime,
  type PrayerType,
  type TwilightParam,
} from "./types";
import { hoursToInstant, toDateKey, utcOffsetMinutes } from "../time/timezone";

export interface PrayerCalculationProvider {
  readonly id: string;
  readonly name: string;
  calculate(input: PrayerCalculationInput): PrayerDay;
}

/** Working set of hour-of-day values during iteration. */
type Portions = Record<PrayerType, number>;

/** Initial guesses, in hours, refined by the iteration below. */
const INITIAL: Portions = {
  fajr: 5,
  sunrise: 6,
  dhuhr: 12,
  asr: 13,
  maghrib: 18,
  isha: 18,
};

const asFraction = (p: Portions): Portions => ({
  fajr: p.fajr / 24,
  sunrise: p.sunrise / 24,
  dhuhr: p.dhuhr / 24,
  asr: p.asr / 24,
  maghrib: p.maghrib / 24,
  isha: p.isha / 24,
});

/**
 * Latitude used by the *aqrab al-bilad* fallback during polar day/night.
 *
 * 45° is the highest round latitude at which every twilight angle in the
 * method registry — up to Singapore's 20° Fajr — still resolves on the
 * solstice. Above roughly 48° a 19.5° Fajr already fails in midsummer.
 */
const POLAR_FALLBACK_LATITUDE = 45;

/**
 * Horizon dip caused by observer elevation, in degrees. 0.833° accounts for
 * atmospheric refraction and the sun's semi-diameter at sea level.
 */
function riseSetAngle(elevation: number): number {
  return 0.833 + 0.0347 * Math.sign(elevation) * Math.sqrt(Math.abs(elevation));
}

export class AstronomicalProvider implements PrayerCalculationProvider {
  readonly id = "astronomical";
  readonly name = "Astronomical calculation";

  calculate(input: PrayerCalculationInput): PrayerDay {
    const method = getMethod(input.methodId);
    const {
      year,
      month,
      day,
      latitude,
      longitude,
      timeZone,
      elevation = 0,
      asrMethod,
      highLatitudeRule,
      offsets,
    } = input;

    const jd = julianDay(year, month, day) - longitude / 360;

    const runRounds = (lat: number): Portions => {
      let p = INITIAL;
      // Two refinement passes converge to well under a second.
      for (let i = 0; i < 2; i += 1) {
        p = this.computeRound(jd, lat, elevation, method, asrMethod, p);
      }
      return p;
    };

    let portions = runRounds(latitude);

    // Polar day / polar night: the sun never crosses the horizon, so there is
    // no sunrise or sunset to anchor the night against and every twilight
    // rule below is undefined (spec §39).
    //
    // Fall back to *aqrab al-bilad* — "the nearest locality" — recomputing at
    // the highest latitude where all supported twilight angles still resolve.
    // Every affected time is flagged `estimated` so the UI can say so.
    let fallbackLatitude: number | undefined;
    if (
      !Number.isFinite(portions.sunrise) ||
      !Number.isFinite(portions.maghrib)
    ) {
      const nearest =
        latitude < 0 ? -POLAR_FALLBACK_LATITUDE : POLAR_FALLBACK_LATITUDE;
      fallbackLatitude = nearest;
      portions = runRounds(nearest);
    }

    const estimated: Partial<Record<PrayerType, boolean>> = {};
    for (const p of PRAYER_TYPES) {
      // Dhuhr depends only on longitude, so it stays exact even under the
      // nearest-locality fallback.
      if (!Number.isFinite(portions[p])) estimated[p] = true;
      else if (fallbackLatitude !== undefined && p !== "dhuhr") {
        estimated[p] = true;
      }
    }

    portions = adjustHighLatitudes(portions, method, highLatitudeRule);
    portions = fillUnresolved(portions, estimated);

    // Isha defined as "N minutes after Maghrib" is applied after the
    // high-latitude pass so it tracks the adjusted Maghrib.
    if (method.isha.kind === "minutes") {
      portions = {
        ...portions,
        isha: portions.maghrib + method.isha.minutes / 60,
      };
    }
    if (method.maghrib.kind === "minutes" && method.maghrib.minutes !== 0) {
      portions = {
        ...portions,
        maghrib: portions.maghrib + method.maghrib.minutes / 60,
      };
    }

    portions = { ...portions, dhuhr: portions.dhuhr + method.dhuhrMinutes / 60 };

    // Shift from mean solar time at this longitude to the zone's wall clock.
    // The offset is sampled at local noon so a DST change during the night
    // cannot skew the whole day.
    const noonInstant = Date.UTC(year, month - 1, day, 12, 0, 0);
    const offsetMinutes = utcOffsetMinutes(noonInstant, timeZone);
    const zoneShift = offsetMinutes / 60 - longitude / 15;

    const times = {} as Record<PrayerType, PrayerTime>;
    for (const prayerType of PRAYER_TYPES) {
      const hours = portions[prayerType] + zoneShift + offsets[prayerType] / 60;
      times[prayerType] = {
        prayerType,
        hours,
        timestamp: hoursToInstant(timeZone, year, month, day, hours),
        estimated: estimated[prayerType] ?? false,
      };
    }

    const ordered = PRAYER_TYPES.map((p) => times[p]).sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    return {
      dateKey: toDateKey(year, month, day),
      times,
      ordered,
      meta: {
        methodId: method.id,
        methodName: method.name,
        asrMethod,
        highLatitudeRule,
        latitude,
        longitude,
        timeZone,
        utcOffsetMinutes: offsetMinutes,
        source: this.name,
        fallbackLatitude,
      },
    };
  }

  private computeRound(
    jd: number,
    latitude: number,
    elevation: number,
    method: CalculationMethod,
    asrMethod: "standard" | "hanafi",
    previous: Portions,
  ): Portions {
    const f = asFraction(previous);
    const horizon = riseSetAngle(elevation);
    const shadowFactor = asrMethod === "hanafi" ? 2 : 1;

    const sunrise = sunAngleTime(jd, latitude, horizon, f.sunrise, "ccw");
    const sunset = sunAngleTime(jd, latitude, horizon, f.maghrib, "cw");

    return {
      fajr: twilightTime(jd, latitude, method.fajr, f.fajr, "ccw", sunrise),
      sunrise,
      dhuhr: midDay(jd, f.dhuhr),
      asr: asrTime(jd, latitude, shadowFactor, f.asr),
      maghrib:
        method.maghrib.kind === "angle"
          ? sunAngleTime(jd, latitude, method.maghrib.degrees, f.maghrib, "cw")
          : sunset,
      isha:
        method.isha.kind === "angle"
          ? sunAngleTime(jd, latitude, method.isha.degrees, f.isha, "cw")
          : sunset,
    };
  }
}

function twilightTime(
  jd: number,
  latitude: number,
  param: TwilightParam,
  fraction: number,
  direction: "ccw" | "cw",
  base: number,
): number {
  if (param.kind === "minutes") {
    return base + (direction === "ccw" ? -1 : 1) * (param.minutes / 60);
  }
  return sunAngleTime(jd, latitude, param.degrees, fraction, direction);
}

/**
 * Last-resort guard: no non-finite value may ever reach the scheduler or the
 * UI, because a `NaN` timestamp becomes an unschedulable alarm and an
 * "Invalid Date" on screen. Spec §29 — never silently fail.
 *
 * Anything still unresolved is anchored to solar noon using the conventional
 * fixed spacing, and is already flagged `estimated`.
 */
const NOON_OFFSET_HOURS: Record<PrayerType, number> = {
  fajr: -7,
  sunrise: -6,
  dhuhr: 0,
  asr: 3.5,
  maghrib: 6,
  isha: 7.5,
};

function fillUnresolved(
  portions: Portions,
  estimated: Partial<Record<PrayerType, boolean>>,
): Portions {
  const anchor = Number.isFinite(portions.dhuhr) ? portions.dhuhr : 12;
  const out = { ...portions };
  for (const p of PRAYER_TYPES) {
    if (!Number.isFinite(out[p])) {
      out[p] = anchor + NOON_OFFSET_HOURS[p];
      estimated[p] = true;
    }
  }
  return out;
}

/**
 * High-latitude adjustment (spec §20, §39).
 *
 * Where the sun never dips far enough below the horizon, Fajr and Isha are
 * undefined. Each rule caps their distance from sunrise/sunset at a portion
 * of the night.
 */
function adjustHighLatitudes(
  portions: Portions,
  method: CalculationMethod,
  rule: PrayerCalculationInput["highLatitudeRule"],
): Portions {
  if (rule === "none") return portions;
  if (Number.isNaN(portions.sunrise) || Number.isNaN(portions.maghrib)) {
    // Polar day or night: nothing sane to anchor to.
    return portions;
  }

  const night = timeDiff(portions.maghrib, portions.sunrise);

  const portionFor = (param: TwilightParam): number => {
    if (rule === "seventhOfNight") return night / 7;
    if (rule === "angleBased" && param.kind === "angle") {
      return (param.degrees / 60) * night;
    }
    return night / 2; // middleOfNight, and the fallback for minute-based params
  };

  const capped = (
    value: number,
    base: number,
    param: TwilightParam,
    direction: "ccw" | "cw",
  ): number => {
    const limit = portionFor(param);
    const diff =
      direction === "ccw" ? timeDiff(value, base) : timeDiff(base, value);
    if (Number.isNaN(value) || diff > limit) {
      return base + (direction === "ccw" ? -limit : limit);
    }
    return value;
  };

  return {
    ...portions,
    fajr: capped(portions.fajr, portions.sunrise, method.fajr, "ccw"),
    isha: capped(portions.isha, portions.maghrib, method.isha, "cw"),
  };
}

export const astronomicalProvider = new AstronomicalProvider();

/**
 * Active provider registry. Mosque timetables (§21) register here later.
 */
const PROVIDERS = new Map<string, PrayerCalculationProvider>([
  [astronomicalProvider.id, astronomicalProvider],
]);

export function getProvider(id = "astronomical"): PrayerCalculationProvider {
  return PROVIDERS.get(id) ?? astronomicalProvider;
}

export function registerProvider(provider: PrayerCalculationProvider): void {
  PROVIDERS.set(provider.id, provider);
}
