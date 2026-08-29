"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { alarmRuntime } from "@/lib/alarm/runtime";
import { describeTrigger } from "@/lib/alarm/schedule";
import { useRuntime } from "@/lib/alarm/use-runtime";
import { CHALLENGE_LABELS, type ChallengeType } from "@/lib/alarm/types";
import { useDeviceMotionSupported, useNow } from "@/lib/platform";
import { PRAYER_LABELS } from "@/lib/prayer/types";
import { useAppState } from "@/lib/store/app-store";
import { formatTime } from "@/lib/time/format";
import { cx } from "./ui";

/**
 * The ringing screen (spec §9.1).
 *
 * Takes the whole viewport, shows only what a half-asleep person needs —
 * which prayer, what time, and two unmissable controls — and refuses to
 * decorate. The dawn glow behind it is the one flourish, and it is the same
 * amber that means "alarm" everywhere else in the app.
 */
export function AlarmRingScreen() {
  const { ringing, snoozeNotice, snoozeRemaining } = useRuntime();
  const state = useAppState();
  const clock = useNow(1000);

  const alarm = useMemo(
    () => state.alarms.find((a) => a.id === ringing?.alarmId) ?? null,
    [state.alarms, ringing?.alarmId],
  );

  // Escape is not a dismiss — an alarm should never be closed by accident.
  useEffect(() => {
    if (!ringing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [ringing]);

  if (!ringing || !alarm) return null;

  const label = PRAYER_LABELS[ringing.prayerType];
  const tz = state.location.timeZone;
  const fmt = state.display.timeFormat;
  const canSnooze =
    alarm.snoozeEnabled && (alarm.maxSnoozes === null || snoozeRemaining !== 0);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`${label} alarm`}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{
        background:
          "radial-gradient(90% 55% at 50% 8%, color-mix(in oklab, var(--dawn) 20%, transparent) 0%, transparent 70%), var(--night)",
      }}
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <p className="eyebrow">
            {ringing.isTest ? "Test alarm" : "Prayer alarm"}
          </p>
          <p className="tnum text-sm text-[var(--muted)]">
            {formatTime(clock, tz, fmt)}
          </p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div
            className="mb-8 h-24 w-24 rounded-full breathe"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--dawn) 70%, transparent) 0%, transparent 68%)",
            }}
            aria-hidden
          />

          <h1 className="display text-[3.4rem] leading-none sm:text-[4.2rem]">
            {label}
          </h1>

          <p className="tnum mt-4 text-[2rem] text-[var(--dawn)] sm:text-[2.4rem]">
            {formatTime(ringing.prayerTimestamp, tz, fmt)}
          </p>

          <p className="mt-3 text-sm text-[var(--muted)]">
            {ringing.isTest
              ? "This is a test. Your real schedule has not changed."
              : describeTrigger(alarm)}
          </p>

          {ringing.snoozeCount > 0 && (
            <p className="tnum mt-5 text-xs tracking-widest text-[var(--faint)] uppercase">
              Snoozed {ringing.snoozeCount}
              {alarm.maxSnoozes !== null && ` of ${alarm.maxSnoozes}`}
            </p>
          )}

          {snoozeNotice && (
            <p className="mt-5 max-w-xs text-sm text-[var(--warn)]">
              {snoozeNotice}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {canSnooze && (
            <button
              type="button"
              className="btn btn-lg w-full"
              onClick={() => alarmRuntime.snooze()}
            >
              Snooze {alarm.snoozeDurationMinutes} min
              {snoozeRemaining !== null && snoozeRemaining > 0 && (
                <span className="tnum text-[var(--muted)]">
                  · {snoozeRemaining} left
                </span>
              )}
            </button>
          )}

          <DismissControl
            challengeType={alarm.challengeType}
            onDismiss={() => alarmRuntime.dismiss("user")}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fajr wake-up challenges (spec §12)                                  */
/* ------------------------------------------------------------------ */

function DismissControl({
  challengeType,
  onDismiss,
}: {
  challengeType: ChallengeType;
  onDismiss: () => void;
}) {
  if (challengeType === "none") {
    return (
      <button type="button" className="btn btn-primary btn-lg w-full" onClick={onDismiss}>
        Dismiss
      </button>
    );
  }
  if (challengeType === "holdToDismiss") {
    return <HoldToDismiss onDismiss={onDismiss} />;
  }
  if (challengeType === "math") {
    return <MathChallenge onDismiss={onDismiss} />;
  }
  return <ShakeChallenge onDismiss={onDismiss} />;
}

const HOLD_MS = 2500;

function HoldToDismiss({ onDismiss }: { onDismiss: () => void }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const startedAt = useRef(0);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  }, []);

  const start = useCallback(() => {
    startedAt.current = Date.now();

    // Declared as a plain recursive function rather than a `useCallback` that
    // refers to itself, which would read the binding before initialisation.
    const step = () => {
      const p = Math.min(1, (Date.now() - startedAt.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stop();
        onDismiss();
        return;
      }
      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
  }, [onDismiss, stop]);

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className="btn btn-primary btn-lg relative w-full overflow-hidden"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      aria-label="Press and hold to dismiss"
    >
      <span
        className="absolute inset-y-0 left-0 bg-[#1a120633]"
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <span className="relative">
        {progress > 0 ? "Keep holding…" : "Press and hold to dismiss"}
      </span>
    </button>
  );
}

function MathChallenge({ onDismiss }: { onDismiss: () => void }) {
  const [problem, setProblem] = useState(() => makeProblem());
  const [entry, setEntry] = useState("");
  const [wrong, setWrong] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(entry) === problem.answer) {
      onDismiss();
      return;
    }
    setWrong(true);
    setEntry("");
    setProblem(makeProblem());
    setTimeout(() => setWrong(false), 1200);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-center text-sm text-[var(--muted)]" htmlFor="challenge">
        Solve to dismiss
      </label>
      <div className="tnum text-center text-3xl">{problem.text}</div>
      <input
        id="challenge"
        type="number"
        inputMode="numeric"
        autoFocus
        value={entry}
        onChange={(e) => setEntry(e.target.value)}
        className={cx("field tnum text-center text-xl", wrong && "border-[var(--risk)]")}
        placeholder="?"
      />
      {wrong && (
        <p className="text-center text-sm text-[var(--risk)]">
          Not quite. Here is another one.
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={entry === ""}>
        Dismiss
      </button>
    </form>
  );
}

function makeProblem() {
  const a = 3 + Math.floor(Math.random() * 20);
  const b = 3 + Math.floor(Math.random() * 20);
  const multiply = Math.random() > 0.5;
  return multiply
    ? { text: `${a} × ${b}`, answer: a * b }
    : { text: `${a * 3} + ${b}`, answer: a * 3 + b };
}

const SHAKE_TARGET = 12;

function ShakeChallenge({ onDismiss }: { onDismiss: () => void }) {
  const [count, setCount] = useState(0);
  const supported = useDeviceMotionSupported();
  const lastPeak = useRef(0);

  useEffect(() => {
    if (!supported) return;

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = Date.now();
      // Threshold well above 1g so ordinary handling does not count.
      if (magnitude > 22 && now - lastPeak.current > 180) {
        lastPeak.current = now;
        setCount((c) => c + 1);
      }
    };

    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [supported]);

  useEffect(() => {
    if (count >= SHAKE_TARGET) onDismiss();
  }, [count, onDismiss]);

  if (!supported) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-sm text-[var(--muted)]">
          This device has no motion sensor, so shake to dismiss is unavailable.
        </p>
        <button type="button" className="btn btn-primary btn-lg w-full" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-[var(--muted)]">
        {CHALLENGE_LABELS.shake} — {SHAKE_TARGET - count} to go
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--night-2)]">
        <div
          className="h-full bg-[var(--dawn)] transition-[width] duration-150"
          style={{ width: `${(count / SHAKE_TARGET) * 100}%` }}
        />
      </div>
    </div>
  );
}
