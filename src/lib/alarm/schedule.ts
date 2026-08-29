/**
 * Pure scheduling and reconciliation logic (spec §13.1, §13.2, §9).
 *
 * Deliberately free of timers, storage and DOM so it can be unit-tested
 * exhaustively — this is the module that decides whether a user's alarm
 * rings at the right moment.
 */

import type { PrayerDay } from "../prayer/types";
import { newId } from "./defaults";
import type {
  PrayerAlarm,
  RingingSession,
  ScheduledAlarm,
  ScheduledKind,
} from "./types";

/** How many days ahead to materialise (spec §13.1 — today + 2). */
export const SCHEDULE_HORIZON_DAYS = 3;

/**
 * A firing more than this far in the past is treated as missed rather than
 * fired late — waking the user 40 minutes after Fajr is worse than silence.
 */
export const MISSED_THRESHOLD_MS = 15 * 60 * 1000;

export interface BuildScheduleOptions {
  days: PrayerDay[];
  alarms: PrayerAlarm[];
  now: number;
}

/**
 * Materialise every future firing implied by the enabled alarms across the
 * supplied days. Entries already in the past are omitted — the caller
 * reconciles those separately.
 */
export function buildSchedule({
  days,
  alarms,
  now,
}: BuildScheduleOptions): ScheduledAlarm[] {
  const out: ScheduledAlarm[] = [];

  for (const day of days) {
    for (const alarm of alarms) {
      if (!alarm.enabled) continue;

      const prayer = day.times[alarm.prayerType];
      if (!prayer || !Number.isFinite(prayer.timestamp)) continue;

      const triggerTimestamp =
        prayer.timestamp + alarm.offsetMinutes * 60_000;

      const push = (kind: ScheduledKind, at: number) => {
        if (at <= now) return;
        out.push({
          id: `${day.dateKey}:${alarm.id}:${kind}`,
          alarmId: alarm.id,
          prayerType: alarm.prayerType,
          kind,
          prayerDate: day.dateKey,
          prayerTimestamp: prayer.timestamp,
          triggerTimestamp: at,
          scheduledAt: now,
          state: "SCHEDULED",
          snoozeCount: 0,
        });
      };

      push("alarm", triggerTimestamp);

      if (alarm.preAlertEnabled && alarm.preAlertMinutes > 0) {
        // A pre-alert that would land after the alarm itself is pointless.
        const preAt = triggerTimestamp - alarm.preAlertMinutes * 60_000;
        if (preAt < triggerTimestamp) push("preAlert", preAt);
      }
    }
  }

  return out.sort((a, b) => a.triggerTimestamp - b.triggerTimestamp);
}

export interface ReconcileResult {
  /** The schedule that should now be in force. */
  next: ScheduledAlarm[];
  /** Entries that existed before but are no longer valid (spec §13.2). */
  cancelled: ScheduledAlarm[];
  /** Entries whose trigger time moved. */
  rescheduled: Array<{ from: ScheduledAlarm; to: ScheduledAlarm }>;
  /** Newly created entries. */
  added: ScheduledAlarm[];
  /** Firings whose moment passed while the app was not running (§13.2). */
  missed: ScheduledAlarm[];
  /** True when anything at all changed. */
  changed: boolean;
}

/**
 * Compare the stored schedule with a freshly computed one and produce the
 * cancel/add/reschedule deltas (spec §13.2 steps 2–5).
 */
export function reconcileSchedule(
  previous: ScheduledAlarm[],
  fresh: ScheduledAlarm[],
  now: number,
): ReconcileResult {
  const prevById = new Map(previous.map((s) => [s.id, s]));
  const freshById = new Map(fresh.map((s) => [s.id, s]));

  const added: ScheduledAlarm[] = [];
  const rescheduled: Array<{ from: ScheduledAlarm; to: ScheduledAlarm }> = [];
  const cancelled: ScheduledAlarm[] = [];
  const missed: ScheduledAlarm[] = [];

  for (const [id, next] of freshById) {
    const prev = prevById.get(id);
    if (!prev) {
      added.push(next);
    } else if (prev.triggerTimestamp !== next.triggerTimestamp) {
      // Carry the live snooze count across a time change so a user who has
      // already snoozed twice does not get a fresh allowance.
      rescheduled.push({ from: prev, to: { ...next, snoozeCount: prev.snoozeCount } });
    }
  }

  for (const [id, prev] of prevById) {
    if (freshById.has(id)) continue;
    // It vanished from the fresh set. Either its moment passed, or the alarm
    // was turned off / its day fell out of the horizon.
    if (prev.state === "SCHEDULED" && prev.triggerTimestamp <= now) {
      const overdueBy = now - prev.triggerTimestamp;
      if (overdueBy > MISSED_THRESHOLD_MS && prev.kind === "alarm") {
        missed.push({ ...prev, state: "MISSED" });
      } else {
        cancelled.push({ ...prev, state: "EXPIRED" });
      }
    } else {
      cancelled.push({ ...prev, state: "CANCELLED" });
    }
  }

  const rescheduledIds = new Set(rescheduled.map((r) => r.to.id));
  const next = fresh.map(
    (s) => rescheduled.find((r) => r.to.id === s.id)?.to ?? s,
  );

  return {
    next,
    cancelled,
    rescheduled,
    added,
    missed,
    changed:
      added.length > 0 ||
      cancelled.length > 0 ||
      rescheduledIds.size > 0 ||
      missed.length > 0,
  };
}

/** The soonest entry that has not yet fired. */
export function nextFiring(
  schedule: ScheduledAlarm[],
  now: number,
): ScheduledAlarm | null {
  let best: ScheduledAlarm | null = null;
  for (const s of schedule) {
    if (s.state !== "SCHEDULED") continue;
    if (s.triggerTimestamp <= now) continue;
    if (!best || s.triggerTimestamp < best.triggerTimestamp) best = s;
  }
  return best;
}

/**
 * Entries that should have fired by `now` and still haven't — used on app
 * open and on wake from sleep to decide between ringing late and marking
 * missed (spec §13.2).
 */
export function dueFirings(
  schedule: ScheduledAlarm[],
  now: number,
): { ring: ScheduledAlarm[]; missed: ScheduledAlarm[] } {
  const ring: ScheduledAlarm[] = [];
  const missed: ScheduledAlarm[] = [];

  for (const s of schedule) {
    if (s.state !== "SCHEDULED") continue;
    if (s.triggerTimestamp > now) continue;

    const overdueBy = now - s.triggerTimestamp;
    if (s.kind === "preAlert") {
      // A late pre-alert is noise; drop it silently.
      continue;
    }
    if (overdueBy <= MISSED_THRESHOLD_MS) ring.push(s);
    else missed.push(s);
  }

  ring.sort((a, b) => a.triggerTimestamp - b.triggerTimestamp);
  return { ring, missed };
}

export type SnoozeOutcome =
  | { kind: "snoozed"; resumeAt: number; snoozeCount: number; remaining: number | null }
  | { kind: "exhausted"; reason: string };

/**
 * Apply a snooze to a live session (spec §9.2, §9.3, §9.5).
 *
 * Returns `exhausted` when the alarm has used its allowance, in which case
 * the caller dismisses automatically.
 */
export function applySnooze(
  alarm: PrayerAlarm,
  session: RingingSession,
  now: number,
): SnoozeOutcome {
  if (!alarm.snoozeEnabled) {
    return { kind: "exhausted", reason: "Snooze is turned off for this alarm." };
  }

  const used = session.snoozeCount;
  if (alarm.maxSnoozes !== null && used >= alarm.maxSnoozes) {
    return {
      kind: "exhausted",
      reason:
        alarm.maxSnoozes === 1
          ? "Snooze already used. Alarm dismissed automatically."
          : `All ${alarm.maxSnoozes} snoozes used. Alarm dismissed automatically.`,
    };
  }

  const snoozeCount = used + 1;
  return {
    kind: "snoozed",
    resumeAt: now + alarm.snoozeDurationMinutes * 60_000,
    snoozeCount,
    remaining:
      alarm.maxSnoozes === null ? null : Math.max(0, alarm.maxSnoozes - snoozeCount),
  };
}

/** Create the follow-up entry produced by a snooze. */
export function snoozedEntry(
  original: ScheduledAlarm,
  resumeAt: number,
  snoozeCount: number,
  now: number,
): ScheduledAlarm {
  return {
    ...original,
    id: `${original.id}:snooze:${snoozeCount}`,
    triggerTimestamp: resumeAt,
    scheduledAt: now,
    state: "SCHEDULED",
    snoozeCount,
  };
}

/** Human-readable summary of an alarm's timing rule (spec §8.2). */
export function describeTrigger(alarm: PrayerAlarm): string {
  if (alarm.offsetMinutes === 0) return "At prayer time";
  const abs = Math.abs(alarm.offsetMinutes);
  const unit = abs === 1 ? "minute" : "minutes";
  return alarm.offsetMinutes < 0
    ? `${abs} ${unit} before`
    : `${abs} ${unit} after`;
}

export { newId };
