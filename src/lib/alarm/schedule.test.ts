/**
 * Alarm scheduling and reconciliation tests (spec §38 — snooze calculations,
 * maximum snooze logic, alarm offsets, calculation → scheduling,
 * location → recalculation → rescheduling).
 */

import { describe, expect, it } from "vitest";

import { computeDay, type PrayerConfig } from "../prayer";
import { ZERO_OFFSETS } from "../prayer/types";
import { createAlarm, createDefaultAlarms } from "./defaults";
import {
  applySnooze,
  buildSchedule,
  dueFirings,
  nextFiring,
  reconcileSchedule,
  snoozedEntry,
} from "./schedule";
import type { PrayerAlarm, RingingSession } from "./types";

const CONFIG: PrayerConfig = {
  latitude: 21.4225,
  longitude: 39.8262,
  timeZone: "Asia/Riyadh",
  methodId: "UMM_AL_QURA",
  asrMethod: "standard",
  highLatitudeRule: "middleOfNight",
  offsets: ZERO_OFFSETS,
};

const DAYS = ["2024-06-15", "2024-06-16", "2024-06-17"].map((k) =>
  computeDay(CONFIG, k),
);

/** An instant safely before the first Fajr of the window. */
const BEFORE_ALL = DAYS[0].times.fajr.timestamp - 6 * 3600_000;

function session(over: Partial<RingingSession> = {}): RingingSession {
  return {
    scheduledId: "s1",
    alarmId: "a1",
    prayerType: "fajr",
    kind: "alarm",
    prayerTimestamp: DAYS[0].times.fajr.timestamp,
    startedAt: DAYS[0].times.fajr.timestamp,
    snoozeCount: 0,
    isTest: false,
    ...over,
  };
}

describe("buildSchedule", () => {
  it("creates one entry per enabled prayer per day", () => {
    const alarms = createDefaultAlarms();
    const schedule = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    // 5 prayers × 3 days, pre-alerts off by default.
    expect(schedule).toHaveLength(15);
    expect(schedule.every((s) => s.kind === "alarm")).toBe(true);
  });

  it("omits disabled alarms", () => {
    const alarms = createDefaultAlarms(["fajr", "maghrib"]);
    const schedule = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    expect(schedule).toHaveLength(6);
    expect(new Set(schedule.map((s) => s.prayerType))).toEqual(
      new Set(["fajr", "maghrib"]),
    );
  });

  it("never schedules an entry in the past", () => {
    const alarms = createDefaultAlarms();
    const midday = DAYS[0].times.dhuhr.timestamp + 1000;
    const schedule = buildSchedule({ days: DAYS, alarms, now: midday });
    expect(schedule.every((s) => s.triggerTimestamp > midday)).toBe(true);
    // Day 0's Fajr and Dhuhr have gone; Asr, Maghrib, Isha remain.
    expect(schedule.filter((s) => s.prayerDate === "2024-06-15")).toHaveLength(3);
  });

  it("applies a negative offset for 'before prayer'", () => {
    const alarm: PrayerAlarm = {
      ...createAlarm("fajr"),
      triggerMode: "before",
      offsetMinutes: -10,
    };
    const [entry] = buildSchedule({
      days: [DAYS[0]],
      alarms: [alarm],
      now: BEFORE_ALL,
    });
    expect(
      (DAYS[0].times.fajr.timestamp - entry.triggerTimestamp) / 60000,
    ).toBe(10);
  });

  it("applies a positive offset for 'after prayer'", () => {
    const alarm: PrayerAlarm = {
      ...createAlarm("dhuhr"),
      triggerMode: "after",
      offsetMinutes: 15,
    };
    const [entry] = buildSchedule({
      days: [DAYS[0]],
      alarms: [alarm],
      now: BEFORE_ALL,
    });
    expect(
      (entry.triggerTimestamp - DAYS[0].times.dhuhr.timestamp) / 60000,
    ).toBe(15);
  });

  it("adds a pre-alert ahead of the alarm when enabled", () => {
    const alarm: PrayerAlarm = {
      ...createAlarm("dhuhr"),
      preAlertEnabled: true,
      preAlertMinutes: 10,
    };
    const entries = buildSchedule({
      days: [DAYS[0]],
      alarms: [alarm],
      now: BEFORE_ALL,
    });
    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first.kind).toBe("preAlert");
    expect(second.kind).toBe("alarm");
    expect((second.triggerTimestamp - first.triggerTimestamp) / 60000).toBe(10);
  });

  it("keeps the pre-alert relative to the offset alarm, not the prayer", () => {
    const alarm: PrayerAlarm = {
      ...createAlarm("asr"),
      triggerMode: "after",
      offsetMinutes: 20,
      preAlertEnabled: true,
      preAlertMinutes: 5,
    };
    const entries = buildSchedule({
      days: [DAYS[0]],
      alarms: [alarm],
      now: BEFORE_ALL,
    });
    const pre = entries.find((e) => e.kind === "preAlert")!;
    expect((pre.triggerTimestamp - DAYS[0].times.asr.timestamp) / 60000).toBe(15);
  });

  it("returns entries in chronological order", () => {
    const schedule = buildSchedule({
      days: DAYS,
      alarms: createDefaultAlarms(),
      now: BEFORE_ALL,
    });
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i].triggerTimestamp).toBeGreaterThanOrEqual(
        schedule[i - 1].triggerTimestamp,
      );
    }
  });
});

describe("reconcileSchedule", () => {
  const alarms = createDefaultAlarms();

  it("reports no change when nothing moved", () => {
    const a = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const b = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const r = reconcileSchedule(a, b, BEFORE_ALL);
    expect(r.changed).toBe(false);
    expect(r.added).toHaveLength(0);
    expect(r.cancelled).toHaveLength(0);
    expect(r.rescheduled).toHaveLength(0);
  });

  it("reschedules every alarm when the location changes", () => {
    const before = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });

    // Travel from Makkah to Istanbul.
    const travelled = ["2024-06-15", "2024-06-16", "2024-06-17"].map((k) =>
      computeDay(
        {
          ...CONFIG,
          latitude: 41.0082,
          longitude: 28.9784,
          timeZone: "Europe/Istanbul",
          methodId: "TURKEY",
        },
        k,
      ),
    );
    const after = buildSchedule({
      days: travelled,
      alarms,
      now: BEFORE_ALL,
    });

    const r = reconcileSchedule(before, after, BEFORE_ALL);
    expect(r.changed).toBe(true);
    expect(r.rescheduled.length).toBeGreaterThan(0);
    expect(r.next.every((s) => s.state === "SCHEDULED")).toBe(true);
  });

  it("cancels entries for an alarm that was turned off", () => {
    const before = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const reduced = alarms.map((a) =>
      a.prayerType === "asr" ? { ...a, enabled: false } : a,
    );
    const after = buildSchedule({ days: DAYS, alarms: reduced, now: BEFORE_ALL });

    const r = reconcileSchedule(before, after, BEFORE_ALL);
    expect(r.cancelled).toHaveLength(3);
    expect(r.cancelled.every((c) => c.prayerType === "asr")).toBe(true);
    expect(r.cancelled.every((c) => c.state === "CANCELLED")).toBe(true);
  });

  it("marks a long-overdue firing as missed, not expired", () => {
    const before = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const fajr = before.find((s) => s.prayerType === "fajr")!;

    // Reopen the app an hour after Fajr should have rung.
    const later = fajr.triggerTimestamp + 60 * 60_000;
    const after = buildSchedule({ days: DAYS, alarms, now: later });

    const r = reconcileSchedule(before, after, later);
    expect(r.missed.some((m) => m.id === fajr.id)).toBe(true);
    expect(r.missed.every((m) => m.state === "MISSED")).toBe(true);
  });

  it("treats a just-passed firing as expired rather than missed", () => {
    const before = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const fajr = before.find((s) => s.prayerType === "fajr")!;

    const barelyLate = fajr.triggerTimestamp + 60_000;
    const after = buildSchedule({ days: DAYS, alarms, now: barelyLate });

    const r = reconcileSchedule(before, after, barelyLate);
    expect(r.missed).toHaveLength(0);
    expect(r.cancelled.some((c) => c.id === fajr.id && c.state === "EXPIRED")).toBe(
      true,
    );
  });

  it("carries a live snooze count across a reschedule", () => {
    const before = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL }).map(
      (s) => (s.prayerType === "fajr" ? { ...s, snoozeCount: 2 } : s),
    );
    const shifted = DAYS.map((d) => ({
      ...d,
      times: {
        ...d.times,
        fajr: { ...d.times.fajr, timestamp: d.times.fajr.timestamp + 120_000 },
      },
    }));
    const after = buildSchedule({ days: shifted, alarms, now: BEFORE_ALL });

    const r = reconcileSchedule(before, after, BEFORE_ALL);
    const movedFajr = r.next.find((s) => s.prayerType === "fajr")!;
    expect(movedFajr.snoozeCount).toBe(2);
  });
});

describe("dueFirings", () => {
  const alarms = createDefaultAlarms();

  it("rings a firing that is only slightly overdue", () => {
    const schedule = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const fajr = schedule.find((s) => s.prayerType === "fajr")!;
    const { ring, missed } = dueFirings(
      schedule,
      fajr.triggerTimestamp + 2 * 60_000,
    );
    expect(ring.map((r) => r.id)).toContain(fajr.id);
    expect(missed).toHaveLength(0);
  });

  it("marks a badly overdue firing as missed instead of ringing it", () => {
    const schedule = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const fajr = schedule.find((s) => s.prayerType === "fajr")!;
    const { ring, missed } = dueFirings(
      schedule,
      fajr.triggerTimestamp + 45 * 60_000,
    );
    expect(ring.map((r) => r.id)).not.toContain(fajr.id);
    expect(missed.map((m) => m.id)).toContain(fajr.id);
  });

  it("silently drops a late pre-alert", () => {
    const alarm: PrayerAlarm = {
      ...createAlarm("dhuhr"),
      preAlertEnabled: true,
      preAlertMinutes: 10,
    };
    const schedule = buildSchedule({
      days: [DAYS[0]],
      alarms: [alarm],
      now: BEFORE_ALL,
    });
    const pre = schedule.find((s) => s.kind === "preAlert")!;
    const { ring, missed } = dueFirings(schedule, pre.triggerTimestamp + 60_000);
    expect(ring.some((r) => r.kind === "preAlert")).toBe(false);
    expect(missed.some((m) => m.kind === "preAlert")).toBe(false);
  });
});

describe("nextFiring", () => {
  it("picks the soonest scheduled entry", () => {
    const schedule = buildSchedule({
      days: DAYS,
      alarms: createDefaultAlarms(),
      now: BEFORE_ALL,
    });
    const next = nextFiring(schedule, BEFORE_ALL)!;
    expect(next.prayerType).toBe("fajr");
    expect(next.prayerDate).toBe("2024-06-15");
  });

  it("returns null when everything has fired", () => {
    const schedule = buildSchedule({
      days: DAYS,
      alarms: createDefaultAlarms(),
      now: BEFORE_ALL,
    });
    const afterAll = DAYS[2].times.isha.timestamp + 3600_000;
    expect(nextFiring(schedule, afterAll)).toBeNull();
  });
});

describe("snooze", () => {
  it("schedules the next ring at the configured interval", () => {
    const alarm = { ...createAlarm("fajr"), snoozeDurationMinutes: 5 };
    const now = 1_700_000_000_000;
    const out = applySnooze(alarm, session(), now);
    expect(out.kind).toBe("snoozed");
    if (out.kind !== "snoozed") return;
    expect((out.resumeAt - now) / 60000).toBe(5);
    expect(out.snoozeCount).toBe(1);
  });

  it("counts down the remaining allowance", () => {
    const alarm = { ...createAlarm("fajr"), maxSnoozes: 3 };
    const out = applySnooze(alarm, session({ snoozeCount: 1 }), Date.now());
    expect(out.kind).toBe("snoozed");
    if (out.kind !== "snoozed") return;
    expect(out.snoozeCount).toBe(2);
    expect(out.remaining).toBe(1);
  });

  it("refuses once the maximum is reached", () => {
    const alarm = { ...createAlarm("fajr"), maxSnoozes: 2 };
    const out = applySnooze(alarm, session({ snoozeCount: 2 }), Date.now());
    expect(out.kind).toBe("exhausted");
    if (out.kind !== "exhausted") return;
    expect(out.reason).toMatch(/All 2 snoozes used/);
  });

  it("never exhausts when snoozes are unlimited", () => {
    const alarm = { ...createAlarm("fajr"), maxSnoozes: null };
    const out = applySnooze(alarm, session({ snoozeCount: 99 }), Date.now());
    expect(out.kind).toBe("snoozed");
    if (out.kind !== "snoozed") return;
    expect(out.remaining).toBeNull();
  });

  it("refuses when snooze is turned off for the alarm", () => {
    const alarm = { ...createAlarm("fajr"), snoozeEnabled: false };
    const out = applySnooze(alarm, session(), Date.now());
    expect(out.kind).toBe("exhausted");
  });

  it("produces a distinct follow-up entry per snooze", () => {
    const alarms = createDefaultAlarms();
    const schedule = buildSchedule({ days: DAYS, alarms, now: BEFORE_ALL });
    const fajr = schedule.find((s) => s.prayerType === "fajr")!;
    const now = fajr.triggerTimestamp;

    const first = snoozedEntry(fajr, now + 300_000, 1, now);
    const second = snoozedEntry(fajr, now + 600_000, 2, now);

    expect(first.id).not.toBe(fajr.id);
    expect(first.id).not.toBe(second.id);
    expect(first.snoozeCount).toBe(1);
    expect(second.snoozeCount).toBe(2);
    expect(first.prayerTimestamp).toBe(fajr.prayerTimestamp);
  });

  it("walks the full snooze sequence to automatic dismissal", () => {
    const alarm = { ...createAlarm("fajr"), maxSnoozes: 2, snoozeDurationMinutes: 5 };
    let s = session();
    let now = s.startedAt;

    for (let i = 1; i <= 2; i += 1) {
      const out = applySnooze(alarm, s, now);
      expect(out.kind, `snooze ${i}`).toBe("snoozed");
      if (out.kind !== "snoozed") return;
      now = out.resumeAt;
      s = { ...s, snoozeCount: out.snoozeCount };
    }

    const final = applySnooze(alarm, s, now);
    expect(final.kind).toBe("exhausted");
    // Two 5-minute snoozes: the alarm gives up 10 minutes after it began.
    expect((now - s.startedAt) / 60000).toBe(10);
  });
});
