"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusDot, cx } from "@/components/ui";
import { unlockAudio } from "@/lib/alarm/audio";
import { requestNotificationPermission } from "@/lib/alarm/notifications";
import {
  buildReliabilityReport,
  diagnoseMissedAlarm,
  LEVEL_LABEL,
  type ReliabilityAction,
  type ReliabilityContext,
} from "@/lib/alarm/reliability";
import { alarmRuntime } from "@/lib/alarm/runtime";
import { useRuntime } from "@/lib/alarm/use-runtime";
import {
  notifyPlatformChanged,
  useAudioUnlocked,
  useDocumentVisible,
  useNotificationPermission,
  useNow,
  useStandalone,
} from "@/lib/platform";
import { PRAYER_LABELS } from "@/lib/prayer/types";
import { storageAvailable } from "@/lib/store/persist";
import { useAppState } from "@/lib/store/app-store";
import { formatAgo, formatDateTime } from "@/lib/time/format";

export default function ReliabilityPage() {
  const state = useAppState();
  const runtime = useRuntime();
  const now = useNow(30_000);
  const standalone = useStandalone();
  const documentVisible = useDocumentVisible();
  const permission = useNotificationPermission();
  const audioUnlocked = useAudioUnlocked();

  const ctx: ReliabilityContext = useMemo(
    () => ({
      state,
      schedule: runtime.schedule,
      notificationPermission: permission,
      audioUnlocked,
      documentVisible,
      standalone,
      wakeLockHeld: alarmRuntime.isWakeLockHeld(),
      serviceWorkerReady:
        typeof navigator !== "undefined" && "serviceWorker" in navigator,
      storageWorks: storageAvailable(),
      now,
    }),
    [
      state,
      runtime.schedule,
      now,
      standalone,
      documentVisible,
      permission,
      audioUnlocked,
    ],
  );

  const report = useMemo(() => buildReliabilityReport(ctx), [ctx]);

  const upcoming = useMemo(
    () =>
      runtime.schedule
        .filter((s) => s.state === "SCHEDULED" && s.triggerTimestamp > now)
        .sort((a, b) => a.triggerTimestamp - b.triggerTimestamp)
        .slice(0, 8),
    [runtime.schedule, now],
  );

  const runAction = async (kind: ReliabilityAction) => {
    if (kind === "requestNotifications") await requestNotificationPermission();
    if (kind === "unlockAudio") await unlockAudio();
    // Neither API emits a change event, so tell the subscribers directly.
    notifyPlatformChanged();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Reliability"
        title="Will your alarms ring?"
        lede="This screen never claims more than the platform can deliver."
      />

      <div
        className="card mb-8 flex items-start gap-4 px-5 py-5"
        style={{
          borderColor: `color-mix(in oklab, ${
            report.overall === "green"
              ? "var(--ok)"
              : report.overall === "yellow"
                ? "var(--warn)"
                : "var(--risk)"
          } 35%, transparent)`,
        }}
      >
        <span className="mt-1.5">
          <StatusDot level={report.overall} pulse={report.overall !== "green"} />
        </span>
        <div>
          <p className="text-[0.7rem] tracking-[0.16em] text-[var(--faint)] uppercase">
            {LEVEL_LABEL[report.overall]}
          </p>
          <p className="mt-1.5 leading-relaxed text-[var(--ink)]">
            {report.headline}
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="eyebrow mb-3">Checks</h2>
        <div className="card px-4 sm:px-5">
          {report.checks.map((check) => (
            <div key={check.id} className="row items-start">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-1.5">
                  <StatusDot level={check.level} />
                </span>
                <div className="min-w-0">
                  <div className="text-[0.95rem]">{check.label}</div>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-[var(--muted)]">
                    {check.detail}
                  </p>
                </div>
              </div>
              {check.action && (
                <ActionButton
                  action={check.action}
                  onRun={() => runAction(check.action!.kind)}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="eyebrow">Next scheduled</h2>
          {state.lastReconciledAt && (
            <span className="text-[0.75rem] text-[var(--faint)]">
              Recalculated {formatAgo(state.lastReconciledAt, now)}
            </span>
          )}
        </div>

        <div className="card px-4 sm:px-5">
          {upcoming.length === 0 ? (
            <p className="py-5 text-sm text-[var(--muted)]">
              Nothing scheduled. Turn on an alarm to see it here.
            </p>
          ) : (
            upcoming.map((s) => (
              <div key={s.id} className="row">
                <div className="flex items-baseline gap-3">
                  <span className="display text-[1.15rem] text-[var(--ink-2)]">
                    {PRAYER_LABELS[s.prayerType]}
                  </span>
                  {s.kind === "preAlert" && (
                    <span className="text-[0.7rem] text-[var(--faint)]">
                      reminder
                    </span>
                  )}
                  {s.snoozeCount > 0 && (
                    <span className="text-[0.7rem] text-[var(--warn)]">
                      snoozed {s.snoozeCount}×
                    </span>
                  )}
                </div>
                <span className="tnum text-[0.9rem] text-[var(--muted)]">
                  {formatDateTime(
                    s.triggerTimestamp,
                    state.location.timeZone,
                    state.display.timeFormat,
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="eyebrow mb-3">Test</h2>
        <div className="card flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm leading-relaxed text-[var(--muted)]">
            Rings a sample alarm now. Your real schedule is untouched.
          </p>
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={async () => {
              await unlockAudio();
              notifyPlatformChanged();
              alarmRuntime.startTestAlarm();
            }}
          >
            Test alarm
          </button>
        </div>
      </section>

      <MissedAlarmDiagnostics ctx={ctx} />

      <div className="mb-10">
        <Link href="/diagnostics" className="btn btn-ghost w-full">
          Open full diagnostics
        </Link>
      </div>
    </AppShell>
  );
}

function ActionButton({
  action,
  onRun,
}: {
  action: { label: string; kind: ReliabilityAction };
  onRun: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);

  if (action.kind === "setLocation") {
    return (
      <Link href="/settings/location" className="btn shrink-0 px-3 py-1.5 text-[0.78rem]">
        {action.label}
      </Link>
    );
  }
  if (action.kind === "enableAlarm") {
    return (
      <Link href="/alarms" className="btn shrink-0 px-3 py-1.5 text-[0.78rem]">
        {action.label}
      </Link>
    );
  }
  if (action.kind === "installApp" || action.kind === "openNotificationSettings") {
    return (
      <div className="shrink-0">
        <button
          type="button"
          className="btn px-3 py-1.5 text-[0.78rem]"
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
        >
          {action.label}
        </button>
        {showHelp && (
          <p className="mt-2 max-w-[16rem] text-[0.75rem] leading-relaxed text-[var(--muted)]">
            {action.kind === "installApp"
              ? "In Chrome or Edge, open the browser menu and choose Install app or Add to Home screen. On iPhone, use Share, then Add to Home Screen."
              : "Open your browser's site settings for this page — usually the icon to the left of the address bar — and set Notifications to Allow."}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn shrink-0 px-3 py-1.5 text-[0.78rem]"
      onClick={onRun}
    >
      {action.label}
    </button>
  );
}

/** Spec §28 — "Why did my alarm not ring?" */
function MissedAlarmDiagnostics({ ctx }: { ctx: ReliabilityContext }) {
  const [open, setOpen] = useState(false);

  const lastMissed = useMemo(() => {
    const missed = ctx.schedule
      .filter((s) => s.state === "MISSED")
      .sort((a, b) => b.triggerTimestamp - a.triggerTimestamp);
    return missed[0] ?? null;
  }, [ctx.schedule]);

  const steps = useMemo(
    () => (open ? diagnoseMissedAlarm(ctx, lastMissed) : []),
    [open, ctx, lastMissed],
  );

  return (
    <section className="mb-8">
      <h2 className="eyebrow mb-3">Troubleshooting</h2>
      <div className="card px-5 py-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="text-[0.95rem]">Why didn&apos;t my alarm ring?</span>
          <span aria-hidden className="text-[var(--faint)]">
            {open ? "−" : "+"}
          </span>
        </button>

        {open && (
          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-4">
            {lastMissed && (
              <p className="text-[0.82rem] text-[var(--warn)]">
                Most recent missed alarm:{" "}
                {PRAYER_LABELS[lastMissed.prayerType]} at{" "}
                {formatDateTime(
                  lastMissed.triggerTimestamp,
                  ctx.state.location.timeZone,
                  ctx.state.display.timeFormat,
                )}
                .
              </p>
            )}
            {steps.map((step) => (
              <div key={step.question} className="flex gap-3">
                <span
                  aria-hidden
                  className={cx(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    step.ok === true
                      ? "bg-[var(--ok)]"
                      : step.ok === false
                        ? "bg-[var(--risk)]"
                        : "bg-[var(--faint)]",
                  )}
                />
                <div>
                  <p className="text-[0.85rem] text-[var(--ink-2)]">
                    {step.question}
                  </p>
                  <p className="mt-0.5 text-[0.8rem] leading-relaxed text-[var(--muted)]">
                    {step.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
