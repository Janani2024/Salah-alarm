/**
 * Reliability report tests (spec §14).
 *
 * The rule under test is the spec's own: "Never claim guaranteed delivery
 * when the operating system cannot guarantee it." These assertions exist to
 * stop a future change from quietly making the app more reassuring than the
 * platform justifies.
 */

import { describe, expect, it } from "vitest";

import { buildReliabilityReport, type ReliabilityContext } from "./reliability";
import { buildSchedule } from "./schedule";
import { createDefaultAlarms } from "./defaults";
import { computeDay } from "../prayer";
import { ZERO_OFFSETS } from "../prayer/types";
import { defaultState, type AppState } from "../store/app-store";

const CONFIG = {
  latitude: 13.0827,
  longitude: 80.2707,
  timeZone: "Asia/Kolkata",
  methodId: "KARACHI",
  asrMethod: "standard" as const,
  highLatitudeRule: "middleOfNight" as const,
  offsets: ZERO_OFFSETS,
};

const DAY = computeDay(CONFIG, "2024-06-15");
const NOW = DAY.times.fajr.timestamp - 3 * 3600_000;

function state(over: Partial<AppState> = {}): AppState {
  const base = defaultState();
  return {
    ...base,
    onboarded: true,
    location: {
      ...base.location,
      resolved: true,
      label: "Chennai, India",
      latitude: CONFIG.latitude,
      longitude: CONFIG.longitude,
      timeZone: CONFIG.timeZone,
    },
    alarms: createDefaultAlarms(),
    lastReconciledAt: NOW,
    ...over,
  };
}

function ctx(over: Partial<ReliabilityContext> = {}): ReliabilityContext {
  const s = over.state ?? state();
  return {
    state: s,
    schedule: buildSchedule({ days: [DAY], alarms: s.alarms, now: NOW }),
    notificationPermission: "granted",
    audioUnlocked: true,
    documentVisible: true,
    standalone: true,
    wakeLockHeld: false,
    serviceWorkerReady: true,
    storageWorks: true,
    now: NOW,
    ...over,
  };
}

const find = (r: ReturnType<typeof buildReliabilityReport>, id: string) =>
  r.checks.find((c) => c.id === id)!;

describe("reliability report", () => {
  it("never reports green, even when everything else is perfect", () => {
    // A web app cannot ring while closed, so the background check caps the
    // overall level. Green here would be a lie.
    const report = buildReliabilityReport(ctx());
    expect(report.overall).not.toBe("green");
    expect(find(report, "background").level).toBe("yellow");
  });

  it("is worse in a browser tab than as an installed app", () => {
    const installed = buildReliabilityReport(ctx({ standalone: true }));
    const tab = buildReliabilityReport(ctx({ standalone: false }));
    expect(find(installed, "background").level).toBe("yellow");
    expect(find(tab, "background").level).toBe("red");
    expect(tab.overall).toBe("red");
  });

  it("says only-while-this-tab-is-open when not installed", () => {
    const report = buildReliabilityReport(ctx({ standalone: false }));
    expect(find(report, "background").detail).toMatch(/only ring while this tab is open/i);
  });

  it("goes red without a location", () => {
    const s = state();
    const report = buildReliabilityReport(
      ctx({ state: { ...s, location: { ...s.location, resolved: false } } }),
    );
    expect(find(report, "location").level).toBe("red");
    expect(report.overall).toBe("red");
    expect(find(report, "location").action?.kind).toBe("setLocation");
  });

  it("goes red when no alarm is enabled", () => {
    const s = state({ alarms: createDefaultAlarms([]) });
    const report = buildReliabilityReport(ctx({ state: s }));
    expect(find(report, "alarms-enabled").level).toBe("red");
  });

  it("goes red when audio has not been unlocked", () => {
    const report = buildReliabilityReport(ctx({ audioUnlocked: false }));
    const audio = find(report, "audio");
    expect(audio.level).toBe("red");
    expect(audio.action?.kind).toBe("unlockAudio");
  });

  it("does not demand audio when every alarm is silent", () => {
    const s = state();
    const silent = s.alarms.map((a) => ({ ...a, soundType: "silent" as const }));
    const report = buildReliabilityReport(
      ctx({ state: { ...s, alarms: silent }, audioUnlocked: false }),
    );
    expect(find(report, "audio").level).toBe("yellow");
  });

  it("distinguishes blocked notifications from not-yet-asked", () => {
    const denied = buildReliabilityReport(ctx({ notificationPermission: "denied" }));
    const unasked = buildReliabilityReport(ctx({ notificationPermission: "default" }));
    expect(find(denied, "notifications").level).toBe("red");
    expect(find(unasked, "notifications").level).toBe("yellow");
    expect(find(unasked, "notifications").action?.kind).toBe("requestNotifications");
  });

  it("warns loudly when the device is not persisting settings", () => {
    const report = buildReliabilityReport(ctx({ storageWorks: false }));
    const storage = find(report, "storage");
    expect(storage.level).toBe("red");
    expect(storage.detail).toMatch(/alarms will be lost/i);
  });

  it("flags a stale schedule", () => {
    const s = state({ lastReconciledAt: NOW - 48 * 3600_000 });
    const report = buildReliabilityReport(ctx({ state: s }));
    expect(find(report, "freshness").level).toBe("yellow");
  });

  it("counts the upcoming firings in its headline", () => {
    const report = buildReliabilityReport(ctx());
    expect(find(report, "scheduled").level).toBe("green");
    expect(report.headline).toMatch(/\d+ alarms scheduled/);
  });

  it("tells the user to fix things when anything is red", () => {
    const report = buildReliabilityReport(ctx({ standalone: false }));
    expect(report.headline).toMatch(/may not ring/i);
  });
});
