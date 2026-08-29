/**
 * Reliability model (spec §14, §28).
 *
 * The governing rule from the spec: *"Never claim guaranteed delivery when
 * the operating system cannot guarantee it."*
 *
 * On the web that rule bites harder than on Android. There is no
 * `AlarmManager` and no shipping Notification Triggers API, so an alarm can
 * only ring from a running page. Every check below is written to state that
 * plainly rather than to reassure.
 */

import type { AppState } from "../store/app-store";
import type { PermissionState } from "./notifications";
import type { ScheduledAlarm } from "./types";

export type ReliabilityLevel = "green" | "yellow" | "red";

export interface ReliabilityCheck {
  id: string;
  label: string;
  level: ReliabilityLevel;
  /** One line explaining the current state. */
  detail: string;
  /** Present when the user can do something about it. */
  action?: { label: string; kind: ReliabilityAction };
}

export type ReliabilityAction =
  | "requestNotifications"
  | "unlockAudio"
  | "installApp"
  | "setLocation"
  | "enableAlarm"
  | "openNotificationSettings";

export interface ReliabilityReport {
  overall: ReliabilityLevel;
  checks: ReliabilityCheck[];
  /** The honest one-line summary shown at the top of the screen. */
  headline: string;
}

/**
 * Everything the report needs, passed in rather than read from globals so
 * that this module stays a pure function — testable, and safe to call during
 * a React render.
 */
export interface ReliabilityContext {
  state: AppState;
  schedule: ScheduledAlarm[];
  /** Current notification permission. */
  notificationPermission: PermissionState;
  /** Whether a user gesture has unlocked audio playback. */
  audioUnlocked: boolean;
  /** Whether the page is currently visible/running. */
  documentVisible: boolean;
  /** Whether the app is running as an installed PWA. */
  standalone: boolean;
  /** Whether a wake lock is currently held. */
  wakeLockHeld: boolean;
  /** Whether a service worker is registered. */
  serviceWorkerReady: boolean;
  /** Whether persistence is working. */
  storageWorks: boolean;
  now: number;
}

const worst = (levels: ReliabilityLevel[]): ReliabilityLevel => {
  if (levels.includes("red")) return "red";
  if (levels.includes("yellow")) return "yellow";
  return "green";
};

export function buildReliabilityReport(
  ctx: ReliabilityContext,
): ReliabilityReport {
  const checks: ReliabilityCheck[] = [];
  const { state, schedule } = ctx;

  /* 1. Location -------------------------------------------------- */
  checks.push(
    state.location.resolved
      ? {
          id: "location",
          label: "Location set",
          level: "green",
          detail: state.location.label,
        }
      : {
          id: "location",
          label: "Location set",
          level: "red",
          detail: "Prayer times cannot be calculated without a location.",
          action: { label: "Set location", kind: "setLocation" },
        },
  );

  /* 2. At least one alarm on ------------------------------------- */
  const enabled = state.alarms.filter((a) => a.enabled);
  checks.push(
    enabled.length > 0
      ? {
          id: "alarms-enabled",
          label: "Prayer alarms enabled",
          level: "green",
          detail: `${enabled.length} of 5 prayers have an alarm.`,
        }
      : {
          id: "alarms-enabled",
          label: "Prayer alarms enabled",
          level: "red",
          detail: "No prayer currently has an alarm turned on.",
          action: { label: "Turn on alarms", kind: "enableAlarm" },
        },
  );

  /* 3. Schedule built -------------------------------------------- */
  const upcoming = schedule.filter(
    (s) => s.state === "SCHEDULED" && s.triggerTimestamp > ctx.now,
  );
  checks.push(
    upcoming.length > 0
      ? {
          id: "scheduled",
          label: "Alarms scheduled",
          level: "green",
          detail: `${upcoming.length} upcoming over the next 3 days.`,
        }
      : {
          id: "scheduled",
          label: "Alarms scheduled",
          level: enabled.length > 0 ? "yellow" : "red",
          detail: "Nothing is currently scheduled.",
        },
  );

  /* 4. Notifications --------------------------------------------- */
  const perm = ctx.notificationPermission;
  if (perm === "unsupported") {
    checks.push({
      id: "notifications",
      label: "Notifications",
      level: "yellow",
      detail: "This browser does not support notifications.",
    });
  } else if (perm === "granted") {
    checks.push({
      id: "notifications",
      label: "Notifications allowed",
      level: "green",
      detail: "Prayer alerts can be shown outside the app window.",
    });
  } else {
    checks.push({
      id: "notifications",
      label: "Notifications allowed",
      level: perm === "denied" ? "red" : "yellow",
      detail:
        perm === "denied"
          ? "Blocked. Re-allow notifications for this site in your browser settings."
          : "Not yet allowed. Alerts will only appear inside the app.",
      action:
        perm === "denied"
          ? { label: "How to fix", kind: "openNotificationSettings" }
          : { label: "Allow notifications", kind: "requestNotifications" },
    });
  }

  /* 5. Audio unlocked -------------------------------------------- */
  const anyAudible = enabled.some(
    (a) => a.soundType !== "silent" && a.soundType !== "vibrateOnly",
  );
  if (!anyAudible) {
    checks.push({
      id: "audio",
      label: "Alarm sound",
      level: "yellow",
      detail: "Every enabled alarm is silent or vibrate-only.",
    });
  } else if (ctx.audioUnlocked) {
    checks.push({
      id: "audio",
      label: "Alarm sound ready",
      level: "green",
      detail: "Audio is unlocked and will play.",
    });
  } else {
    checks.push({
      id: "audio",
      label: "Alarm sound ready",
      level: "red",
      detail:
        "Browsers block sound until you interact with the page. Run a test alarm to unlock it.",
      action: { label: "Unlock sound", kind: "unlockAudio" },
    });
  }

  /* 6. The honest one: background execution ---------------------- */
  checks.push({
    id: "background",
    label: "Ringing when the app is closed",
    level: ctx.standalone ? "yellow" : "red",
    detail: ctx.standalone
      ? "Installed as an app. Alarms ring reliably while it is open or in the background; a fully closed app or a restarted device cannot ring."
      : "In a browser tab, an alarm can only ring while this tab is open. Install the app and keep it running for the best chance.",
    action: ctx.standalone ? undefined : { label: "How to install", kind: "installApp" },
  });

  /* 7. Screen wake ----------------------------------------------- */
  if (ctx.wakeLockHeld) {
    checks.push({
      id: "wakelock",
      label: "Screen kept awake",
      level: "green",
      detail: "The screen is held on so the next alarm cannot be missed.",
    });
  }

  /* 8. Storage --------------------------------------------------- */
  if (!ctx.storageWorks) {
    checks.push({
      id: "storage",
      label: "Settings saved",
      level: "red",
      detail:
        "This browser is not saving data — private browsing, or storage is full. Your alarms will be lost when you close the app.",
    });
  }

  /* 9. Schedule freshness (spec §37) ----------------------------- */
  if (state.lastReconciledAt) {
    const ageHours = (ctx.now - state.lastReconciledAt) / 3_600_000;
    checks.push({
      id: "freshness",
      label: "Schedule up to date",
      level: ageHours > 36 ? "yellow" : "green",
      detail:
        ageHours < 1
          ? "Recalculated just now."
          : `Last recalculated ${Math.round(ageHours)} hours ago.`,
    });
  }

  const overall = worst(checks.map((c) => c.level));

  return {
    overall,
    checks,
    headline: headlineFor(overall, ctx, upcoming.length),
  };
}

function headlineFor(
  level: ReliabilityLevel,
  ctx: ReliabilityContext,
  upcoming: number,
): string {
  if (level === "red") {
    return "Your alarms may not ring. Fix the items marked below.";
  }
  if (level === "yellow") {
    return ctx.standalone
      ? `${upcoming} alarms scheduled. They will ring while the app is open or in the background.`
      : `${upcoming} alarms scheduled — but only while this tab stays open.`;
  }
  return `${upcoming} alarms scheduled and ready.`;
}

export const LEVEL_LABEL: Record<ReliabilityLevel, string> = {
  green: "Ready",
  yellow: "Limited",
  red: "At risk",
};

/* ------------------------------------------------------------------ */
/* "Why didn't my alarm ring?" (spec §28)                              */
/* ------------------------------------------------------------------ */

export interface DiagnosticStep {
  question: string;
  answer: string;
  ok: boolean | null;
}

export function diagnoseMissedAlarm(
  ctx: ReliabilityContext,
  lastMissed: ScheduledAlarm | null,
): DiagnosticStep[] {
  const { state } = ctx;
  const alarm = lastMissed
    ? state.alarms.find((a) => a.id === lastMissed.alarmId)
    : null;

  const steps: DiagnosticStep[] = [];

  steps.push({
    question: "Was the alarm enabled?",
    answer: alarm
      ? alarm.enabled
        ? "Yes."
        : "No — this alarm was turned off."
      : "No recent missed alarm to check.",
    ok: alarm ? alarm.enabled : null,
  });

  steps.push({
    question: "Was a prayer time calculated?",
    answer: state.location.resolved
      ? `Yes, from ${state.location.label}.`
      : "No — no location was set.",
    ok: state.location.resolved,
  });

  steps.push({
    question: "Was the alarm scheduled?",
    answer: lastMissed
      ? `Yes, for ${new Date(lastMissed.triggerTimestamp).toLocaleString()}.`
      : "No missed alarm on record.",
    ok: lastMissed ? true : null,
  });

  const perm = ctx.notificationPermission;
  steps.push({
    question: "Were notifications allowed?",
    answer:
      perm === "granted"
        ? "Yes."
        : perm === "denied"
          ? "No — notifications are blocked for this site."
          : "Not yet requested.",
    ok: perm === "granted",
  });

  steps.push({
    question: "Could the app play sound?",
    answer: ctx.audioUnlocked
      ? "Yes, audio was unlocked."
      : "No — audio had not been unlocked by a tap in this session.",
    ok: ctx.audioUnlocked,
  });

  steps.push({
    question: "Was the app running at the time?",
    answer: ctx.documentVisible
      ? "It is running now, but a web app cannot ring while it is fully closed. If the app was closed at the alarm time, that is the cause."
      : "The app is currently in the background.",
    ok: null,
  });

  steps.push({
    question: "Was the app installed to the home screen?",
    answer: ctx.standalone
      ? "Yes — this gives the best chance of ringing in the background."
      : "No. Running in a browser tab is the least reliable option.",
    ok: ctx.standalone,
  });

  steps.push({
    question: "Did the device restart or the time zone change?",
    answer:
      state.lastKnownTimeZone && state.lastKnownTimeZone !== ctx.state.location.timeZone
        ? `The time zone changed from ${state.lastKnownTimeZone}. Alarms were rescheduled on the next app open.`
        : "No time-zone change recorded.",
    ok: null,
  });

  steps.push({
    question: "Was the alarm dismissed manually?",
    answer: (() => {
      const dismissal = state.events.find(
        (e) =>
          e.eventType === "dismissed" &&
          lastMissed != null &&
          e.alarmId === lastMissed.alarmId &&
          Math.abs(e.timestamp - lastMissed.triggerTimestamp) < 3_600_000,
      );
      return dismissal ? "Yes — it was dismissed from the device." : "No record of a manual dismissal.";
    })(),
    ok: null,
  });

  return steps;
}
