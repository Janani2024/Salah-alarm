/**
 * Prayer-engine unit tests (spec §38 — prayer calculations, time-zone
 * conversions, date changes, DST, high latitudes).
 *
 * Reference values are cross-checked against the published PrayTimes
 * reference implementation for the same inputs. A one-minute tolerance is
 * used because published tables round to the minute.
 */

import { describe, expect, it } from "vitest";

import { computeDay, resolveWindow, type PrayerConfig } from "./index";
import { ZERO_OFFSETS, type PrayerType } from "./types";
import { utcOffsetMinutes } from "../time/timezone";

function config(over: Partial<PrayerConfig> = {}): PrayerConfig {
  return {
    latitude: 21.4225,
    longitude: 39.8262,
    timeZone: "Asia/Riyadh",
    methodId: "UMM_AL_QURA",
    asrMethod: "standard",
    highLatitudeRule: "middleOfNight",
    offsets: ZERO_OFFSETS,
    ...over,
  };
}

/** Render a computed prayer as HH:MM in its own time zone. */
function hhmm(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

/** Minutes between an actual HH:MM and an expected HH:MM. */
function driftMinutes(actual: string, expected: string): number {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.abs(toMin(actual) - toMin(expected));
}

function expectNear(
  actual: string,
  expected: string,
  tolerance = 1,
  label = "",
) {
  const drift = driftMinutes(actual, expected);
  expect(
    drift,
    `${label}: got ${actual}, expected ~${expected} (drift ${drift}m)`,
  ).toBeLessThanOrEqual(tolerance);
}

describe("astronomical prayer times", () => {
  /**
   * Golden test for Makkah, 15 June 2024, Umm al-Qura (Fajr 18.5°, Isha
   * Maghrib+90m). Every expected value below was derived independently from
   * the closed-form solar equations, not captured from this implementation:
   *
   *   φ = 21.4225°N, λ = 39.8262°E, UTC+3, δ ≈ 23.30°, EoT ≈ −0.3 min
   *   zoneShift    = 3 − 39.8262/15         = +0.3449 h  (+20.7 min)
   *   solar noon   = 12 − EoT               = 12.005 h   → Dhuhr  12:21.0
   *   T(0.833°)    = 6.7144 h               → Sunrise 05:38.1, Maghrib 19:03.9
   *   T(18.5°)     = 8.1800 h               → Fajr    04:10.2
   *   Asr angle    = −arccot(1 + tan|φ−δ|)  = −44.077° → T = 3.3250 h
   *                                                    → Asr     15:40.5
   *   Isha         = Maghrib + 90 min                  → Isha    20:33.9
   *
   * Note: the *printed* Umm al-Qura calendar shows 04:07 for Fajr on this
   * date. It is a published table, not a pure angle calculation — users who
   * follow it should apply a manual offset (spec §20).
   */
  it("matches hand-derived solar values for Makkah", () => {
    const day = computeDay(config(), "2024-06-15");
    const tz = "Asia/Riyadh";

    expectNear(hhmm(day.times.fajr.timestamp, tz), "04:10", 1, "fajr");
    expectNear(hhmm(day.times.sunrise.timestamp, tz), "05:38", 1, "sunrise");
    expectNear(hhmm(day.times.dhuhr.timestamp, tz), "12:21", 1, "dhuhr");
    expectNear(hhmm(day.times.asr.timestamp, tz), "15:41", 1, "asr");
    expectNear(hhmm(day.times.maghrib.timestamp, tz), "19:04", 1, "maghrib");
    expectNear(hhmm(day.times.isha.timestamp, tz), "20:34", 1, "isha");
  });

  it("places Isha exactly 90 minutes after Maghrib for Umm al-Qura", () => {
    const day = computeDay(config(), "2024-06-15");
    const gap =
      (day.times.isha.timestamp - day.times.maghrib.timestamp) / 60000;
    expect(gap).toBeCloseTo(90, 0);
  });

  it("orders the five prayers correctly through the day", () => {
    const day = computeDay(config({ timeZone: "Asia/Kolkata" }), "2024-03-21");
    const seq: PrayerType[] = [
      "fajr",
      "sunrise",
      "dhuhr",
      "asr",
      "maghrib",
      "isha",
    ];
    const stamps = seq.map((p) => day.times[p].timestamp);
    for (let i = 1; i < stamps.length; i += 1) {
      expect(stamps[i], `${seq[i]} after ${seq[i - 1]}`).toBeGreaterThan(
        stamps[i - 1],
      );
    }
  });

  it("puts Hanafi Asr later than standard Asr", () => {
    const key = "2024-09-10";
    const standard = computeDay(config({ asrMethod: "standard" }), key);
    const hanafi = computeDay(config({ asrMethod: "hanafi" }), key);
    expect(hanafi.times.asr.timestamp).toBeGreaterThan(
      standard.times.asr.timestamp,
    );
  });

  it("shifts times by the configured manual offset", () => {
    const key = "2024-09-10";
    const base = computeDay(config(), key);
    const shifted = computeDay(
      config({ offsets: { ...ZERO_OFFSETS, fajr: -7 } }),
      key,
    );
    const delta =
      (shifted.times.fajr.timestamp - base.times.fajr.timestamp) / 60000;
    expect(delta).toBeCloseTo(-7, 0);
  });

  it("produces different Fajr angles for different methods", () => {
    const key = "2024-09-10";
    const isna = computeDay(config({ methodId: "ISNA" }), key);
    const egypt = computeDay(config({ methodId: "EGYPT" }), key);
    // Egypt uses 19.5°, ISNA 15° — Egypt's Fajr must be earlier.
    expect(egypt.times.fajr.timestamp).toBeLessThan(isna.times.fajr.timestamp);
  });
});

describe("time zones, DST and travel", () => {
  it("computes London times in London wall-clock, not device time", () => {
    const day = computeDay(
      config({
        latitude: 51.5074,
        longitude: -0.1278,
        timeZone: "Europe/London",
        methodId: "MWL",
      }),
      "2024-06-21",
    );
    const noon = hhmm(day.times.dhuhr.timestamp, "Europe/London");
    // Midsummer solar noon in London under BST lands close to 13:00.
    expectNear(noon, "13:02", 3, "london dhuhr");
  });

  it("survives the spring-forward DST transition", () => {
    // Europe/London springs forward at 01:00 UTC on 2024-03-31.
    const cfg = config({
      latitude: 51.5074,
      longitude: -0.1278,
      timeZone: "Europe/London",
      methodId: "MWL",
    });
    const before = computeDay(cfg, "2024-03-30");
    const after = computeDay(cfg, "2024-03-31");

    // Wall-clock Dhuhr must jump roughly an hour forward across the change.
    const beforeH = Number(hhmm(before.times.dhuhr.timestamp, "Europe/London").split(":")[0]);
    const afterH = Number(hhmm(after.times.dhuhr.timestamp, "Europe/London").split(":")[0]);
    expect(afterH - beforeH).toBe(1);

    // ...while the absolute instant only moves by minutes.
    const instantDrift =
      (after.times.dhuhr.timestamp - before.times.dhuhr.timestamp) / 60000;
    expect(Math.abs(instantDrift - 24 * 60)).toBeLessThan(5);
  });

  it("reports the correct UTC offset for the location, not the device", () => {
    const day = computeDay(
      config({ timeZone: "Asia/Kolkata", methodId: "KARACHI" }),
      "2024-01-15",
    );
    expect(day.meta.utcOffsetMinutes).toBe(330);
  });

  it("derives negative offsets west of Greenwich", () => {
    const winter = Date.UTC(2024, 0, 15, 12);
    expect(utcOffsetMinutes(winter, "America/New_York")).toBe(-300);
  });
});

describe("high latitudes", () => {
  it("supplies an estimated Fajr where the sun never dips far enough", () => {
    // Tromsø in midsummer: no astronomical twilight at all.
    const day = computeDay(
      config({
        latitude: 69.6492,
        longitude: 18.9553,
        timeZone: "Europe/Oslo",
        methodId: "MWL",
        highLatitudeRule: "seventhOfNight",
      }),
      "2024-06-21",
    );
    expect(day.times.fajr.estimated).toBe(true);
    expect(Number.isFinite(day.times.fajr.timestamp)).toBe(true);
    expect(day.times.fajr.timestamp).toBeLessThan(day.times.sunrise.timestamp);
  });

  it("falls back to a nearest-locality latitude under midnight sun", () => {
    const day = computeDay(
      config({
        latitude: 78.2232, // Longyearbyen, Svalbard
        longitude: 15.6267,
        timeZone: "Europe/Oslo",
        methodId: "MWL",
      }),
      "2024-06-21",
    );
    expect(day.meta.fallbackLatitude).toBe(45);
    for (const t of day.ordered) {
      expect(Number.isFinite(t.timestamp), `${t.prayerType} finite`).toBe(true);
    }
    // Dhuhr is longitude-only, so it stays exact even under the fallback.
    expect(day.times.dhuhr.estimated).toBe(false);
    expect(day.times.fajr.estimated).toBe(true);
  });

  it("handles polar night in the southern hemisphere", () => {
    const day = computeDay(
      config({
        latitude: -70.0,
        longitude: 20.0,
        timeZone: "Antarctica/Troll",
        methodId: "MWL",
      }),
      "2024-06-21",
    );
    expect(day.meta.fallbackLatitude).toBe(-45);
    for (const t of day.ordered) {
      expect(Number.isFinite(t.timestamp), `${t.prayerType} finite`).toBe(true);
    }
  });

  it("never emits a non-finite time for any method at any latitude", () => {
    // Sweeps the whole registry against the solstices at extreme latitudes:
    // this is the guard that keeps NaN out of the alarm scheduler.
    const methodIds = [
      "MWL", "ISNA", "EGYPT", "KARACHI", "UMM_AL_QURA", "DUBAI", "QATAR",
      "KUWAIT", "SINGAPORE", "TURKEY", "TEHRAN", "JAFARI", "FRANCE", "RUSSIA",
    ];
    const lats = [-89, -70, -60, -45, 0, 45, 60, 70, 89];
    const keys = ["2024-06-21", "2024-12-21", "2024-03-20"];

    for (const methodId of methodIds) {
      for (const latitude of lats) {
        for (const key of keys) {
          const day = computeDay(
            config({ latitude, longitude: 0, timeZone: "UTC", methodId }),
            key,
          );
          for (const t of day.ordered) {
            expect(
              Number.isFinite(t.timestamp),
              `${methodId} lat=${latitude} ${key} ${t.prayerType}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("keeps Isha after Maghrib at high latitude", () => {
    const day = computeDay(
      config({
        latitude: 60.1699,
        longitude: 24.9384,
        timeZone: "Europe/Helsinki",
        methodId: "MWL",
        highLatitudeRule: "middleOfNight",
      }),
      "2024-06-21",
    );
    expect(day.times.isha.timestamp).toBeGreaterThan(
      day.times.maghrib.timestamp,
    );
  });
});

describe("current/next prayer resolution", () => {
  const cfg = config({ timeZone: "Asia/Kolkata", methodId: "KARACHI" });

  it("returns the upcoming prayer mid-afternoon", () => {
    const today = computeDay(cfg, "2024-05-10");
    const tomorrow = computeDay(cfg, "2024-05-11");
    const justAfterDhuhr = today.times.dhuhr.timestamp + 60_000;

    const w = resolveWindow([today, tomorrow], justAfterDhuhr);
    expect(w.current?.prayerType).toBe("dhuhr");
    expect(w.next?.prayerType).toBe("asr");
    expect(w.msUntilNext).toBeGreaterThan(0);
  });

  it("crosses midnight to tomorrow's Fajr after Isha", () => {
    const today = computeDay(cfg, "2024-05-10");
    const tomorrow = computeDay(cfg, "2024-05-11");
    const afterIsha = today.times.isha.timestamp + 60_000;

    const w = resolveWindow([today, tomorrow], afterIsha);
    expect(w.current?.prayerType).toBe("isha");
    expect(w.next?.prayerType).toBe("fajr");
    expect(w.next?.timestamp).toBe(tomorrow.times.fajr.timestamp);
  });

  it("handles leap day without gaps", () => {
    const feb28 = computeDay(cfg, "2024-02-28");
    const feb29 = computeDay(cfg, "2024-02-29");
    const mar01 = computeDay(cfg, "2024-03-01");
    expect(feb29.times.fajr.timestamp).toBeGreaterThan(
      feb28.times.isha.timestamp,
    );
    expect(mar01.times.fajr.timestamp).toBeGreaterThan(
      feb29.times.isha.timestamp,
    );
  });
});
