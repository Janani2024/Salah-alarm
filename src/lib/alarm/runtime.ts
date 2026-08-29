/**
 * The alarm runtime (spec §13).
 *
 * Responsibilities:
 *   - keep a rolling 3-day schedule reconciled against live prayer times
 *   - fire alarms at the right instant, correcting for timer drift
 *   - notice device sleep, clock changes, travel and time-zone changes
 *   - own the single "ringing" session and its snooze/dismiss transitions
 *
 * It lives outside React so that timers survive re-renders and so a
 * visibility handler can reconcile without waiting for a commit.
 */

"use client";

import {
  computeDays,
  daysDiffer,
  resolveWindow,
  todayKey,
  type PrayerConfig,
  type PrayerDay,
  type PrayerWindow,
} from "../prayer";
import { deviceTimeZone } from "../time/timezone";
import {
  appStore,
  logEvent,
  setLastKnownTimeZone,
  setSchedule,
  type AppState,
} from "../store/app-store";
import {
  isAudioUnlocked,
  playSound,
  pulse,
  startVibration,
  stopVibration,
  type SoundHandle,
} from "./audio";
import { closeNotifications, showNotification } from "./notifications";
import {
  applySnooze,
  buildSchedule,
  dueFirings,
  nextFiring,
  reconcileSchedule,
  SCHEDULE_HORIZON_DAYS,
  snoozedEntry,
} from "./schedule";
import type { PrayerAlarm, RingingSession, ScheduledAlarm } from "./types";
import { PRAYER_LABELS } from "../prayer/types";

/** Maximum gap between ticks. Short enough to notice sleep and clock jumps. */
const TICK_CEILING_MS = 30_000;

/**
 * A wall-clock jump larger than this between two ticks means the device slept
 * or the clock was changed — both require a full reconcile (spec §13.5).
 */
const CLOCK_JUMP_MS = 90_000;

export interface RuntimeSnapshot {
  days: PrayerDay[];
  window: PrayerWindow;
  schedule: ScheduledAlarm[];
  ringing: RingingSession | null;
  /** Set when the last snooze was refused (spec §9.3). */
  snoozeNotice: string | null;
  /** Remaining snoozes in the live session, null when unlimited. */
  snoozeRemaining: number | null;
  lastReconciledAt: number | null;
  /** Raised when travel or a time-zone change moved the alarms (§13.5, §19.3). */
  scheduleNotice: string | null;
  ready: boolean;
}

type Listener = () => void;

const EMPTY_WINDOW: PrayerWindow = {
  current: null,
  next: null,
  msUntilNext: 0,
};

const EMPTY: RuntimeSnapshot = {
  days: [],
  window: EMPTY_WINDOW,
  schedule: [],
  ringing: null,
  snoozeNotice: null,
  snoozeRemaining: null,
  lastReconciledAt: null,
  scheduleNotice: null,
  ready: false,
};

function configFrom(state: AppState): PrayerConfig {
  return {
    latitude: state.location.latitude,
    longitude: state.location.longitude,
    timeZone: state.location.timeZone,
    elevation: state.location.elevation,
    methodId: state.calculation.methodId,
    asrMethod: state.calculation.asrMethod,
    highLatitudeRule: state.calculation.highLatitudeRule,
    offsets: state.calculation.offsets,
  };
}

class AlarmRuntime {
  private snapshot: RuntimeSnapshot = EMPTY;
  private listeners = new Set<Listener>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTickAt = 0;
  private started = false;

  private sound: SoundHandle | null = null;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  /**
   * Reconciling writes the new schedule back to the store, which notifies
   * every subscriber — including this runtime. Without these two guards that
   * is unbounded recursion: reconcile -> setSchedule -> onStateChanged ->
   * reconcile. `reconciling` blocks re-entry, and `lastInputSignature` means
   * a store change only triggers work when something that actually affects
   * scheduling has changed.
   */
  private reconciling = false;
  private lastInputSignature: string | null = null;

  /** Entries created by snoozes; kept in memory alongside the stored plan. */
  private transient: ScheduledAlarm[] = [];

  /* ---------------------------------------------------------------- */
  /* Subscription                                                      */
  /* ---------------------------------------------------------------- */

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RuntimeSnapshot => this.snapshot;

  getServerSnapshot = (): RuntimeSnapshot => EMPTY;

  private emit(patch: Partial<RuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    this.lastTickAt = Date.now();
    appStore.subscribe(this.onStateChanged);

    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("focus", this.onVisibility);
    window.addEventListener("online", this.onVisibility);

    this.reconcile("startup");
    this.scheduleTick();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("focus", this.onVisibility);
    window.removeEventListener("online", this.onVisibility);
    void this.releaseWakeLock();
  }

  private onVisibility = (): void => {
    if (typeof document !== "undefined" && document.hidden) return;
    // Spec §13.2: every time the app comes forward, recalculate and compare.
    this.reconcile("resume");
    this.tick();
  };

  private onStateChanged = (): void => {
    if (this.reconciling) return;
    const signature = scheduleInputSignature(appStore.getState());
    if (signature === this.lastInputSignature) return;
    // Settings, location or alarm toggles changed — rebuild the plan.
    this.reconcile("settings");
  };

  /* ---------------------------------------------------------------- */
  /* Reconciliation (spec §13.2)                                       */
  /* ---------------------------------------------------------------- */

  reconcile(reason: "startup" | "resume" | "settings" | "clock"): void {
    const state = appStore.getState();
    if (!appStore.isHydrated()) return;
    if (this.reconciling) return;

    this.reconciling = true;
    try {
      this.runReconcile(state, reason);
    } finally {
      this.reconciling = false;
      this.lastInputSignature = scheduleInputSignature(appStore.getState());
    }
  }

  private runReconcile(
    state: AppState,
    reason: "startup" | "resume" | "settings" | "clock",
  ): void {
    const now = Date.now();
    let notice: string | null = null;

    // 1. Detect a device time-zone change (travel, DST, manual clock change).
    const tz = deviceTimeZone();
    if (state.lastKnownTimeZone && state.lastKnownTimeZone !== tz) {
      notice = `Your time zone changed to ${tz}. Prayer alarms were updated.`;
      logEvent("rescheduled", {
        detail: `Time zone ${state.lastKnownTimeZone} → ${tz}`,
      });
      // When following the device automatically, adopt the new zone.
      if (state.location.mode === "auto") {
        appStore.set((s) => ({
          ...s,
          location: { ...s.location, timeZone: tz, updatedAt: now },
        }));
      }
    }
    if (state.lastKnownTimeZone !== tz) setLastKnownTimeZone(tz);

    const fresh = appStore.getState();
    if (!fresh.location.resolved) {
      this.emit({ ready: true, days: [], window: EMPTY_WINDOW, schedule: [] });
      return;
    }

    // 2. Recalculate prayer times for the horizon.
    const config = configFrom(fresh);
    const startKey = todayKey(config, now);
    const days = computeDays(config, startKey, SCHEDULE_HORIZON_DAYS);

    const timesChanged = days.some((d, i) => daysDiffer(this.snapshot.days[i], d));

    // 3-5. Compare, cancel obsolete, schedule updated.
    const previous = [...fresh.schedule, ...this.transient];
    const rebuilt = buildSchedule({ days, alarms: fresh.alarms, now });
    const result = reconcileSchedule(previous, rebuilt, now);

    if (result.missed.length > 0) {
      for (const m of result.missed) {
        logEvent("missed", {
          alarmId: m.alarmId,
          prayerType: m.prayerType,
          scheduledTimestamp: m.triggerTimestamp,
          actualTimestamp: now,
          detail: "App was not running when this alarm was due.",
        });
      }
    }

    if (result.changed) {
      if (result.added.length > 0) {
        logEvent("scheduled", {
          detail: `${result.added.length} alarm(s) scheduled (${reason}).`,
        });
      }
      if (result.rescheduled.length > 0 && reason !== "startup") {
        logEvent("rescheduled", {
          detail: `${result.rescheduled.length} alarm(s) moved (${reason}).`,
        });
      }
      if (result.cancelled.length > 0) {
        logEvent("cancelled", {
          detail: `${result.cancelled.length} alarm(s) cancelled (${reason}).`,
        });
      }
    }

    // Keep any live snooze entries that are still in the future.
    this.transient = this.transient.filter(
      (t) => t.triggerTimestamp > now && t.state === "SCHEDULED",
    );

    setSchedule(result.next, now);

    if (timesChanged && reason === "settings" && !notice) {
      notice = "Prayer times changed. Your alarms were updated.";
    }

    this.emit({
      days,
      window: resolveWindow(days, now),
      schedule: [...result.next, ...this.transient],
      lastReconciledAt: now,
      scheduleNotice: notice ?? this.snapshot.scheduleNotice,
      ready: true,
    });

    this.scheduleTick();
  }

  dismissScheduleNotice(): void {
    this.emit({ scheduleNotice: null });
  }

  /* ---------------------------------------------------------------- */
  /* Ticking                                                           */
  /* ---------------------------------------------------------------- */

  private scheduleTick(): void {
    if (this.timer) clearTimeout(this.timer);
    if (typeof window === "undefined") return;

    const now = Date.now();
    const next = nextFiring(this.snapshot.schedule, now);
    const untilNext = next ? next.triggerTimestamp - now : Number.POSITIVE_INFINITY;

    // Land exactly on the firing when it is close, otherwise wake regularly
    // so a sleeping device or a changed clock is noticed quickly.
    const delay = Math.max(0, Math.min(untilNext, TICK_CEILING_MS));
    this.timer = setTimeout(this.tick, delay);
  }

  private tick = (): void => {
    const now = Date.now();
    const drift = now - this.lastTickAt;
    this.lastTickAt = now;

    // Spec §13.5: a big jump means sleep, travel, or a manual clock change.
    if (drift > CLOCK_JUMP_MS + TICK_CEILING_MS) {
      logEvent("rescheduled", {
        detail: `Clock jumped ${Math.round(drift / 1000)}s — schedule revalidated.`,
      });
      this.reconcile("clock");
      return;
    }

    if (!this.snapshot.ringing) {
      const { ring, missed } = dueFirings(this.snapshot.schedule, now);

      for (const m of missed) {
        logEvent("missed", {
          alarmId: m.alarmId,
          prayerType: m.prayerType,
          scheduledTimestamp: m.triggerTimestamp,
          actualTimestamp: now,
        });
      }
      if (missed.length > 0) this.markFired(missed.map((m) => m.id), "MISSED");

      const first = ring[0];
      if (first) {
        if (first.kind === "preAlert") this.firePreAlert(first, now);
        else this.fireAlarm(first, now);
      }
    }

    // Keep the countdown live.
    this.emit({ window: resolveWindow(this.snapshot.days, now) });

    // Roll the horizon forward at midnight.
    const state = appStore.getState();
    if (state.location.resolved && this.snapshot.days.length > 0) {
      const config = configFrom(state);
      if (todayKey(config, now) !== this.snapshot.days[0].dateKey) {
        this.reconcile("clock");
        return;
      }
    }

    this.scheduleTick();
  };

  /** Remove fired/missed entries from the live plan. */
  private markFired(ids: string[], state: ScheduledAlarm["state"]): void {
    const idSet = new Set(ids);
    this.transient = this.transient.filter((t) => !idSet.has(t.id));
    appStore.set((s) => ({
      ...s,
      schedule: s.schedule.map((x) =>
        idSet.has(x.id) ? { ...x, state } : x,
      ),
    }));
    this.emit({
      schedule: this.snapshot.schedule.map((x) =>
        idSet.has(x.id) ? { ...x, state } : x,
      ),
    });
  }

  /* ---------------------------------------------------------------- */
  /* Firing                                                            */
  /* ---------------------------------------------------------------- */

  private alarmFor(alarmId: string): PrayerAlarm | undefined {
    return appStore.getState().alarms.find((a) => a.id === alarmId);
  }

  private firePreAlert(entry: ScheduledAlarm, now: number): void {
    const label = PRAYER_LABELS[entry.prayerType];
    const alarm = this.alarmFor(entry.alarmId);
    const minutes = alarm?.preAlertMinutes ?? 10;

    void showNotification({
      title: `${label} is in ${minutes} minutes`,
      body: "This is a reminder, not the alarm itself.",
      category: "preAlert",
      tag: `prealert-${entry.id}`,
      silent: true,
    });

    logEvent("preAlerted", {
      alarmId: entry.alarmId,
      prayerType: entry.prayerType,
      scheduledTimestamp: entry.triggerTimestamp,
      actualTimestamp: now,
    });

    this.markFired([entry.id], "DISMISSED");
  }

  private fireAlarm(entry: ScheduledAlarm, now: number): void {
    const alarm = this.alarmFor(entry.alarmId);
    if (!alarm) return;

    const session: RingingSession = {
      scheduledId: entry.id,
      alarmId: entry.alarmId,
      prayerType: entry.prayerType,
      kind: "alarm",
      prayerTimestamp: entry.prayerTimestamp,
      startedAt: now,
      snoozeCount: entry.snoozeCount,
      isTest: false,
    };

    logEvent("fired", {
      alarmId: alarm.id,
      prayerType: entry.prayerType,
      scheduledTimestamp: entry.triggerTimestamp,
      actualTimestamp: now,
      detail:
        Math.abs(now - entry.triggerTimestamp) > 5000
          ? `Late by ${Math.round((now - entry.triggerTimestamp) / 1000)}s`
          : undefined,
    });

    this.markFired([entry.id], "RINGING");
    this.beginRinging(session, alarm);
  }

  /** Start a test ring without touching the real schedule (spec §5.6). */
  startTestAlarm(prayerTypeOrAlarm?: PrayerAlarm): void {
    const state = appStore.getState();
    const alarm =
      prayerTypeOrAlarm ??
      state.alarms.find((a) => a.enabled) ??
      state.alarms[0];
    if (!alarm) return;

    const now = Date.now();
    logEvent("tested", { alarmId: alarm.id, prayerType: alarm.prayerType });

    this.beginRinging(
      {
        scheduledId: `test-${now}`,
        alarmId: alarm.id,
        prayerType: alarm.prayerType,
        kind: "alarm",
        prayerTimestamp: now,
        startedAt: now,
        snoozeCount: 0,
        isTest: true,
      },
      alarm,
    );
  }

  private beginRinging(session: RingingSession, alarm: PrayerAlarm): void {
    this.stopOutput();

    const label = PRAYER_LABELS[session.prayerType];

    if (alarm.soundType !== "silent" && alarm.soundType !== "vibrateOnly") {
      this.sound = playSound(alarm.soundType, {
        volume: alarm.volumeMode === "system" ? 100 : alarm.volumeLevel,
        gradual: alarm.gradualVolume,
        loop: true,
      });
    }
    if (alarm.vibrationEnabled && alarm.soundType !== "silent") {
      startVibration();
    }

    void showNotification({
      title: session.isTest ? `Test alarm — ${label}` : label,
      body: session.isTest
        ? "This is a test. Your real schedule is unchanged."
        : "Time for prayer. Open the app to snooze or dismiss.",
      category: "prayerAlarm",
      tag: "prayer-alarm",
      requireInteraction: true,
      silent: true,
    });

    void this.acquireWakeLock();

    // Auto-dismiss so a ringing alarm cannot run forever (spec §8.1).
    if (alarm.autoDismissMinutes > 0) {
      this.autoDismissTimer = setTimeout(
        () => this.dismiss("auto"),
        alarm.autoDismissMinutes * 60_000,
      );
    }

    this.emit({
      ringing: session,
      snoozeNotice: null,
      snoozeRemaining:
        alarm.maxSnoozes === null
          ? null
          : Math.max(0, alarm.maxSnoozes - session.snoozeCount),
    });
  }

  /* ---------------------------------------------------------------- */
  /* Snooze / dismiss (spec §9.4, §9.5)                                */
  /* ---------------------------------------------------------------- */

  snooze(): void {
    const session = this.snapshot.ringing;
    if (!session) return;
    const alarm = this.alarmFor(session.alarmId);
    if (!alarm) return;

    const now = Date.now();
    const outcome = applySnooze(alarm, session, now);

    if (outcome.kind === "exhausted") {
      // Spec §9.3: after the maximum, dismiss automatically and say so.
      this.emit({ snoozeNotice: outcome.reason });
      this.dismiss("exhausted");
      return;
    }

    // 1. Stop the current alarm.
    this.stopOutput();
    void closeNotifications("prayer-alarm");
    pulse(40);

    // 2. Record it.
    logEvent("snoozed", {
      alarmId: alarm.id,
      prayerType: session.prayerType,
      scheduledTimestamp: now,
      actualTimestamp: outcome.resumeAt,
      detail: `Snooze ${outcome.snoozeCount} of ${alarm.maxSnoozes ?? "∞"}`,
    });

    // 3. Schedule the next ring.
    if (!session.isTest) {
      const original = [...appStore.getState().schedule, ...this.transient].find(
        (s) => s.id === session.scheduledId,
      );
      const base: ScheduledAlarm = original ?? {
        id: session.scheduledId,
        alarmId: session.alarmId,
        prayerType: session.prayerType,
        kind: "alarm",
        prayerDate: "",
        prayerTimestamp: session.prayerTimestamp,
        triggerTimestamp: session.startedAt,
        scheduledAt: now,
        state: "SCHEDULED",
        snoozeCount: session.snoozeCount,
      };
      this.transient.push(
        snoozedEntry(base, outcome.resumeAt, outcome.snoozeCount, now),
      );
    } else {
      this.transient.push({
        id: `${session.scheduledId}:snooze:${outcome.snoozeCount}`,
        alarmId: session.alarmId,
        prayerType: session.prayerType,
        kind: "alarm",
        prayerDate: "",
        prayerTimestamp: session.prayerTimestamp,
        triggerTimestamp: outcome.resumeAt,
        scheduledAt: now,
        state: "SCHEDULED",
        snoozeCount: outcome.snoozeCount,
      });
    }

    // 4/5. Clear the UI and let the tick fire it again at the interval.
    this.emit({
      ringing: null,
      schedule: [...appStore.getState().schedule, ...this.transient],
      snoozeNotice: null,
      snoozeRemaining: outcome.remaining,
    });
    this.scheduleTick();
  }

  dismiss(reason: "user" | "auto" | "exhausted" = "user"): void {
    const session = this.snapshot.ringing;
    if (!session) return;

    // 1-3. Stop sound, vibration and the alarm UI.
    this.stopOutput();
    void closeNotifications("prayer-alarm");

    // 4. Record the interaction.
    logEvent(reason === "auto" ? "autoDismissed" : "dismissed", {
      alarmId: session.alarmId,
      prayerType: session.prayerType,
      scheduledTimestamp: session.startedAt,
      actualTimestamp: Date.now(),
      detail:
        reason === "exhausted"
          ? "Snooze limit reached."
          : reason === "auto"
            ? "Auto-dismissed after the configured timeout."
            : undefined,
    });

    // 5. Drop any pending snooze for this session; tomorrow's alarm stands.
    this.transient = this.transient.filter(
      (t) => !t.id.startsWith(session.scheduledId),
    );

    this.emit({
      ringing: null,
      schedule: [...appStore.getState().schedule, ...this.transient],
      snoozeRemaining: null,
    });
    this.scheduleTick();
  }

  private stopOutput(): void {
    this.sound?.stop();
    this.sound = null;
    stopVibration();
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
    void this.releaseWakeLock();
  }

  /* ---------------------------------------------------------------- */
  /* Wake lock                                                         */
  /* ---------------------------------------------------------------- */

  async acquireWakeLock(): Promise<boolean> {
    try {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
        return false;
      }
      if (this.wakeLock) return true;
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
      });
      return true;
    } catch {
      return false;
    }
  }

  async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* already released */
    }
    this.wakeLock = null;
  }

  isWakeLockHeld(): boolean {
    return this.wakeLock !== null;
  }

  isAudioReady(): boolean {
    return isAudioUnlocked();
  }
}


/**
 * A fingerprint of everything that determines the alarm schedule. Storing the
 * computed schedule or appending an event must not look like a change, or the
 * runtime would reconcile itself in a loop.
 */
function scheduleInputSignature(state: AppState): string {
  const { location, calculation } = state;
  return JSON.stringify([
    location.resolved,
    location.latitude,
    location.longitude,
    location.timeZone,
    location.elevation,
    calculation.methodId,
    calculation.asrMethod,
    calculation.highLatitudeRule,
    calculation.offsets,
    state.alarms.map((a) => [
      a.prayerType,
      a.enabled,
      a.offsetMinutes,
      a.preAlertEnabled,
      a.preAlertMinutes,
    ]),
  ]);
}

export const alarmRuntime = new AlarmRuntime();
