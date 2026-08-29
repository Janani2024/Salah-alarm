/** Alarm domain model and state machine (spec §8, §30, §31). */

import type { AlarmablePrayer } from "../prayer/types";

/** How the alarm time relates to the calculated prayer time (spec §8.2). */
export type TriggerMode = "exact" | "before" | "after";

export type SoundType =
  | "adhan"
  | "standardAlarm"
  | "gentleAlarm"
  | "shortChime"
  | "vibrateOnly"
  | "silent";

export const SOUND_LABELS: Record<SoundType, string> = {
  adhan: "Adhan",
  standardAlarm: "Standard alarm",
  gentleAlarm: "Gentle alarm",
  shortChime: "Short chime",
  vibrateOnly: "Vibrate only",
  silent: "Silent notification",
};

export const SOUND_DESCRIPTIONS: Record<SoundType, string> = {
  adhan: "A synthesised call to prayer tone sequence.",
  standardAlarm: "An insistent, rising two-tone alarm.",
  gentleAlarm: "A soft repeating chime that fades in.",
  shortChime: "A single brief chime.",
  vibrateOnly: "No sound — vibration only, where the device supports it.",
  silent: "A notification with no sound or vibration.",
};

export type VolumeMode = "system" | "custom";

/** Anti-snooze challenge for Fajr wake-up mode (spec §12). */
export type ChallengeType = "none" | "holdToDismiss" | "math" | "shake";

export const CHALLENGE_LABELS: Record<ChallengeType, string> = {
  none: "None",
  holdToDismiss: "Press and hold",
  math: "Solve a simple sum",
  shake: "Shake the device",
};

/** Per-prayer alarm configuration (spec §8.1, §10). */
export interface PrayerAlarm {
  id: string;
  prayerType: AlarmablePrayer;
  enabled: boolean;
  triggerMode: TriggerMode;
  /** Signed minutes relative to the prayer time; derived from triggerMode. */
  offsetMinutes: number;
  soundType: SoundType;
  volumeMode: VolumeMode;
  /** 0–100, used when volumeMode is "custom". */
  volumeLevel: number;
  /** Ramp the volume up over the first seconds of ringing (spec §18). */
  gradualVolume: boolean;
  vibrationEnabled: boolean;
  snoozeEnabled: boolean;
  snoozeDurationMinutes: number;
  /** `null` means unlimited (spec §9.3). */
  maxSnoozes: number | null;
  /** Stop ringing by itself after this many minutes. */
  autoDismissMinutes: number;
  preAlertEnabled: boolean;
  preAlertMinutes: number;
  challengeType: ChallengeType;
  createdAt: number;
  updatedAt: number;
}

/** Runtime state of a scheduled alarm (spec §31). */
export type AlarmState =
  | "DISABLED"
  | "SCHEDULED"
  | "RINGING"
  | "SNOOZED"
  | "DISMISSED"
  | "MISSED"
  | "SCHEDULE_FAILED"
  | "PERMISSION_BLOCKED"
  | "CANCELLED"
  | "EXPIRED";

/** What kind of event a scheduled entry represents. */
export type ScheduledKind = "alarm" | "preAlert";

/** A concrete future firing (spec §30 `ScheduledAlarm`). */
export interface ScheduledAlarm {
  id: string;
  alarmId: string;
  prayerType: AlarmablePrayer;
  kind: ScheduledKind;
  /** Civil date of the prayer, `YYYY-MM-DD`. */
  prayerDate: string;
  /** The calculated prayer time itself, before any offset. */
  prayerTimestamp: number;
  /** When this entry should fire. */
  triggerTimestamp: number;
  scheduledAt: number;
  state: AlarmState;
  /** How many snoozes have been taken on this firing. */
  snoozeCount: number;
}

/** Diagnostic event log (spec §30 `AlarmEvent`, §31). */
export type AlarmEventType =
  | "scheduled"
  | "fired"
  | "snoozed"
  | "dismissed"
  | "failed"
  | "cancelled"
  | "rescheduled"
  | "missed"
  | "preAlerted"
  | "tested"
  | "autoDismissed";

export interface AlarmEvent {
  id: string;
  alarmId: string | null;
  prayerType: AlarmablePrayer | null;
  eventType: AlarmEventType;
  timestamp: number;
  /** When it was meant to happen. */
  scheduledTimestamp: number | null;
  /** When it actually happened — the gap is the reliability signal (§37). */
  actualTimestamp: number | null;
  detail?: string;
}

/** The live ringing session, if any. */
export interface RingingSession {
  scheduledId: string;
  alarmId: string;
  prayerType: AlarmablePrayer;
  kind: ScheduledKind;
  prayerTimestamp: number;
  /** When this ring started. */
  startedAt: number;
  /** Snoozes already taken in this session. */
  snoozeCount: number;
  /** True for a test ring — never touches the real schedule (spec §5.6). */
  isTest: boolean;
}
