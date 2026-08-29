/**
 * Application state (spec §30 `UserSettings`, §32 "local-first, modular").
 *
 * A ~60-line observable store rather than a state library: the alarm
 * scheduler needs to read and write this from outside React (timers, service
 * worker messages, visibility handlers), which a hook-only store cannot do.
 */

"use client";

import { useSyncExternalStore } from "react";

import {
  ALARM_DEFAULTS,
  createDefaultAlarms,
  newId,
  type AlarmDefaults,
} from "../alarm/defaults";
import type {
  AlarmEvent,
  AlarmEventType,
  PrayerAlarm,
  ScheduledAlarm,
} from "../alarm/types";
import {
  DEFAULT_METHOD_ID,
  suggestMethodForTimeZone,
} from "../prayer/methods";
import {
  ZERO_OFFSETS,
  type AlarmablePrayer,
  type AsrMethod,
  type HighLatitudeRule,
  type PrayerOffsets,
} from "../prayer/types";
import { deviceTimeZone } from "../time/timezone";
import {
  clearState,
  readState,
  STATE_VERSION,
  writeState,
} from "./persist";

export type LocationMode = "auto" | "manual";

export interface LocationState {
  mode: LocationMode;
  latitude: number;
  longitude: number;
  timeZone: string;
  /** Human label, e.g. "Chennai, India" or "Near your location". */
  label: string;
  /** Metres, from the geolocation API where available. */
  accuracyMetres: number | null;
  elevation: number;
  updatedAt: number | null;
  /** True once a real location (GPS or chosen city) has been set. */
  resolved: boolean;
}

export interface CalculationState {
  methodId: string;
  asrMethod: AsrMethod;
  highLatitudeRule: HighLatitudeRule;
  offsets: PrayerOffsets;
}

export interface DisplayState {
  timeFormat: "12" | "24";
  theme: "system" | "light" | "dark";
  showHijri: boolean;
  /** Manual Hijri correction in days, −2…+2. */
  hijriOffset: number;
}

export interface PrivacyState {
  analyticsEnabled: boolean;
}

export interface AppState {
  version: number;
  onboarded: boolean;
  location: LocationState;
  calculation: CalculationState;
  display: DisplayState;
  privacy: PrivacyState;
  alarmDefaults: AlarmDefaults;
  alarms: PrayerAlarm[];
  schedule: ScheduledAlarm[];
  /** Newest first, capped — purely local diagnostics (spec §28, §36). */
  events: AlarmEvent[];
  lastReconciledAt: number | null;
  /** Detects travel and system clock/zone changes (spec §13.5). */
  lastKnownTimeZone: string | null;
  /** Marked-as-prayed records, keyed `YYYY-MM-DD:prayer` (spec §23). */
  prayedMarks: string[];
}

export const MAX_EVENTS = 300;

function defaultLocation(): LocationState {
  return {
    mode: "auto",
    latitude: 21.4225,
    longitude: 39.8262,
    timeZone: deviceTimeZone(),
    label: "Not set",
    accuracyMetres: null,
    elevation: 0,
    updatedAt: null,
    resolved: false,
  };
}

export function defaultState(): AppState {
  const tz = deviceTimeZone();
  return {
    version: STATE_VERSION,
    onboarded: false,
    location: defaultLocation(),
    calculation: {
      methodId: suggestMethodForTimeZone(tz) || DEFAULT_METHOD_ID,
      asrMethod: "standard",
      highLatitudeRule: "middleOfNight",
      offsets: { ...ZERO_OFFSETS },
    },
    display: {
      timeFormat: "12",
      theme: "system",
      showHijri: true,
      hijriOffset: 0,
    },
    privacy: { analyticsEnabled: false },
    alarmDefaults: { ...ALARM_DEFAULTS },
    alarms: createDefaultAlarms(),
    schedule: [],
    events: [],
    lastReconciledAt: null,
    lastKnownTimeZone: null,
    prayedMarks: [],
  };
}

/**
 * Merge a persisted payload onto the current defaults so that a state file
 * written by an older build never leaves a field undefined (spec §39 "app
 * update").
 */
function migrate(stored: Partial<AppState> & { version: number }): AppState {
  const base = defaultState();
  const alarms =
    Array.isArray(stored.alarms) && stored.alarms.length > 0
      ? base.alarms.map((fallback) => {
          const saved = stored.alarms!.find(
            (a) => a?.prayerType === fallback.prayerType,
          );
          return saved ? { ...fallback, ...saved } : fallback;
        })
      : base.alarms;

  return {
    ...base,
    ...stored,
    version: STATE_VERSION,
    location: { ...base.location, ...(stored.location ?? {}) },
    calculation: {
      ...base.calculation,
      ...(stored.calculation ?? {}),
      offsets: { ...ZERO_OFFSETS, ...(stored.calculation?.offsets ?? {}) },
    },
    display: { ...base.display, ...(stored.display ?? {}) },
    privacy: { ...base.privacy, ...(stored.privacy ?? {}) },
    alarmDefaults: { ...base.alarmDefaults, ...(stored.alarmDefaults ?? {}) },
    alarms,
    schedule: Array.isArray(stored.schedule) ? stored.schedule : [],
    events: Array.isArray(stored.events) ? stored.events.slice(0, MAX_EVENTS) : [],
    prayedMarks: Array.isArray(stored.prayedMarks) ? stored.prayedMarks : [],
  };
}

type Listener = () => void;

class AppStore {
  private state: AppState = defaultState();
  private listeners = new Set<Listener>();
  private hydrated = false;
  /** Set when the device refuses to persist (private browsing, quota). */
  private persistFailed = false;

  getState = (): AppState => this.state;

  isHydrated = (): boolean => this.hydrated;

  didPersistFail = (): boolean => this.persistFailed;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Load from disk. Called once on mount rather than at module scope so that
   * server and first client render agree (no hydration mismatch).
   */
  hydrate = (): void => {
    if (this.hydrated) return;
    const stored = readState<AppState>();
    this.state = stored ? migrate(stored) : defaultState();
    this.hydrated = true;
    this.emit();
  };

  set = (updater: (state: AppState) => AppState): void => {
    const next = updater(this.state);
    if (next === this.state) return;
    this.state = next;
    if (this.hydrated) {
      const ok = writeState(next);
      this.persistFailed = !ok;
    }
    this.emit();
  };

  reset = (): void => {
    clearState();
    this.state = defaultState();
    this.emit();
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const appStore = new AppStore();

/** Subscribe a component to the whole state. */
export function useAppState(): AppState {
  return useSyncExternalStore(
    appStore.subscribe,
    appStore.getState,
    // Server and hydration render both see pristine defaults.
    defaultStateSingleton,
  );
}

const SERVER_STATE = defaultState();
function defaultStateSingleton(): AppState {
  return SERVER_STATE;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    appStore.subscribe,
    appStore.isHydrated,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export function setLocation(patch: Partial<LocationState>): void {
  appStore.set((s) => ({
    ...s,
    location: { ...s.location, ...patch, updatedAt: Date.now() },
  }));
}

export function setCalculation(patch: Partial<CalculationState>): void {
  appStore.set((s) => ({ ...s, calculation: { ...s.calculation, ...patch } }));
}

export function setOffset(prayer: keyof PrayerOffsets, minutes: number): void {
  appStore.set((s) => ({
    ...s,
    calculation: {
      ...s.calculation,
      offsets: { ...s.calculation.offsets, [prayer]: minutes },
    },
  }));
}

export function setDisplay(patch: Partial<DisplayState>): void {
  appStore.set((s) => ({ ...s, display: { ...s.display, ...patch } }));
}

export function setPrivacy(patch: Partial<PrivacyState>): void {
  appStore.set((s) => ({ ...s, privacy: { ...s.privacy, ...patch } }));
}

export function setAlarmDefaults(patch: Partial<AlarmDefaults>): void {
  appStore.set((s) => ({
    ...s,
    alarmDefaults: { ...s.alarmDefaults, ...patch },
  }));
}

export function updateAlarm(
  prayerType: AlarmablePrayer,
  patch: Partial<PrayerAlarm>,
): void {
  appStore.set((s) => ({
    ...s,
    alarms: s.alarms.map((a) =>
      a.prayerType === prayerType ? { ...a, ...patch, updatedAt: Date.now() } : a,
    ),
  }));
}

export function toggleAlarm(prayerType: AlarmablePrayer, enabled: boolean): void {
  updateAlarm(prayerType, { enabled });
}

export function setSchedule(schedule: ScheduledAlarm[], at: number): void {
  appStore.set((s) => ({ ...s, schedule, lastReconciledAt: at }));
}

export function setLastKnownTimeZone(timeZone: string): void {
  appStore.set((s) => ({ ...s, lastKnownTimeZone: timeZone }));
}

export function completeOnboarding(): void {
  appStore.set((s) => ({ ...s, onboarded: true }));
}

export function logEvent(
  eventType: AlarmEventType,
  detail?: {
    alarmId?: string | null;
    prayerType?: AlarmablePrayer | null;
    scheduledTimestamp?: number | null;
    actualTimestamp?: number | null;
    detail?: string;
  },
): void {
  const event: AlarmEvent = {
    id: newId("evt"),
    alarmId: detail?.alarmId ?? null,
    prayerType: detail?.prayerType ?? null,
    eventType,
    timestamp: Date.now(),
    scheduledTimestamp: detail?.scheduledTimestamp ?? null,
    actualTimestamp: detail?.actualTimestamp ?? null,
    detail: detail?.detail,
  };
  appStore.set((s) => ({
    ...s,
    events: [event, ...s.events].slice(0, MAX_EVENTS),
  }));
}

export function togglePrayed(dateKey: string, prayer: AlarmablePrayer): void {
  const mark = `${dateKey}:${prayer}`;
  appStore.set((s) => ({
    ...s,
    prayedMarks: s.prayedMarks.includes(mark)
      ? s.prayedMarks.filter((m) => m !== mark)
      : [...s.prayedMarks, mark],
  }));
}

export function clearEvents(): void {
  appStore.set((s) => ({ ...s, events: [] }));
}

/** Spec §27 Privacy → "Data deletion". */
export function deleteAllData(): void {
  appStore.reset();
}
