"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { AppShell } from "@/components/app-shell";
import { HorizonArc } from "@/components/horizon-arc";
import { Notice, StatusDot, Toggle, cx } from "@/components/ui";
import { unlockAudio } from "@/lib/alarm/audio";
import { buildReliabilityReport } from "@/lib/alarm/reliability";
import { alarmRuntime } from "@/lib/alarm/runtime";
import { useRuntime } from "@/lib/alarm/use-runtime";
import {
  notifyPlatformChanged,
  useAudioUnlocked,
  useNotificationPermission,
  useNow,
  useStandalone,
} from "@/lib/platform";
import { PRAYER_LABELS, type PrayerType } from "@/lib/prayer/types";
import { storageAvailable } from "@/lib/store/persist";
import {
  toggleAlarm,
  useAppState,
  useHydrated,
} from "@/lib/store/app-store";
import { formatCountdown, formatFullDate, formatTime } from "@/lib/time/format";
import { toHijri } from "@/lib/time/hijri";

export default function HomePage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const router = useRouter();
  const runtime = useRuntime();
  const now = useNow(1000);

  // First run goes to onboarding (spec §41).
  useEffect(() => {
    if (hydrated && !state.onboarded) router.replace("/onboarding");
  }, [hydrated, state.onboarded, router]);

  if (!state.onboarded) return null;

  return (
    <AppShell>
      <DashboardBody now={now} runtime={runtime} state={state} />
    </AppShell>
  );
}

function DashboardBody({
  now,
  runtime,
  state,
}: {
  now: number;
  runtime: ReturnType<typeof useRuntime>;
  state: ReturnType<typeof useAppState>;
}) {
  const tz = state.location.timeZone;
  const fmt = state.display.timeFormat;
  const today = runtime.days[0] ?? null;
  const { next, current } = runtime.window;
  const standalone = useStandalone();
  const permission = useNotificationPermission();
  const audioUnlocked = useAudioUnlocked();

  // The countdown ticks every second; the reliability report only changes by
  // the minute, so it is recomputed on the coarser value.
  const minute = Math.floor(now / 60_000);

  const report = useMemo(
    () =>
      buildReliabilityReport({
        state,
        schedule: runtime.schedule,
        notificationPermission: permission,
        audioUnlocked,
        documentVisible: true,
        standalone,
        wakeLockHeld: alarmRuntime.isWakeLockHeld(),
        serviceWorkerReady: true,
        storageWorks: storageAvailable(),
        now: minute * 60_000,
      }),
    [state, runtime.schedule, standalone, minute, permission, audioUnlocked],
  );

  const hijri = state.display.showHijri
    ? toHijri(now, tz, state.display.hijriOffset)
    : null;

  if (!state.location.resolved) {
    return (
      <div className="card px-6 py-10 text-center">
        <h1 className="display mb-2 text-2xl">No location set</h1>
        <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          Prayer times depend on where you are. Set a location and your alarms
          will follow it every day.
        </p>
        <Link href="/settings/location" className="btn btn-primary">
          Set location
        </Link>
      </div>
    );
  }

  if (!today || !next) {
    return (
      <div className="card px-6 py-10 text-center text-sm text-[var(--muted)]">
        Calculating prayer times…
      </div>
    );
  }

  return (
    <>
      {runtime.scheduleNotice && (
        <Notice tone="info" onDismiss={() => alarmRuntime.dismissScheduleNotice()}>
          {runtime.scheduleNotice}
        </Notice>
      )}

      {/* --- Next prayer + the horizon arc --------------------------- */}
      <section className="card rise mb-8 overflow-hidden">
        <div className="px-6 pt-6 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Next prayer</p>
              <h1 className="display mt-1.5 text-[3rem] leading-none sm:text-[3.6rem]">
                {PRAYER_LABELS[next.prayerType]}
              </h1>
              <p className="tnum mt-2 text-xl text-[var(--dawn)]">
                {formatTime(next.timestamp, tz, fmt)}
              </p>
            </div>

            <div className="text-right">
              <p className="eyebrow">In</p>
              <p className="tnum mt-1.5 text-[1.75rem] leading-none tracking-tight sm:text-[2.1rem]">
                {formatCountdown(next.timestamp - now)}
              </p>
              {current && (
                <p className="mt-2 text-xs text-[var(--faint)]">
                  {PRAYER_LABELS[current.prayerType]} was{" "}
                  <span className="tnum">
                    {formatTime(current.timestamp, tz, fmt)}
                  </span>
                </p>
              )}
            </div>
          </div>

          <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--faint)]">
            <span>{formatFullDate(now, tz)}</span>
            {hijri && (
              <>
                <span aria-hidden>·</span>
                <span>{hijri.formatted}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <Link
              href="/settings/location"
              className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink-2)]"
            >
              {state.location.label}
            </Link>
          </p>
        </div>

        <HorizonArc
          day={today}
          now={now}
          activePrayer={next.prayerType}
          className="mt-4 h-[190px] w-full"
        />

        <p className="border-t border-[var(--line-soft)] px-6 py-2.5 text-[0.7rem] leading-relaxed text-[var(--faint)] sm:px-7">
          The sun&apos;s height through today. Each prayer sits at the sun
          position that defines it — which is why the times shift a little each
          day.
        </p>
      </section>

      {/* --- Today's prayers ---------------------------------------- */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="eyebrow">Today</h2>
          <Link
            href="/alarms"
            className="text-[0.82rem] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Edit alarms
          </Link>
        </div>

        <div className="card px-4 sm:px-5">
          {today.ordered.map((time) => (
            <PrayerRow
              key={time.prayerType}
              prayerType={time.prayerType}
              timestamp={time.timestamp}
              estimated={time.estimated}
              isNext={time.prayerType === next.prayerType}
              isPast={time.timestamp <= now}
              timeZone={tz}
              timeFormat={fmt}
              state={state}
            />
          ))}
        </div>
      </section>

      {/* --- Reliability + quick actions ----------------------------- */}
      <section className="mb-2">
        <h2 className="eyebrow mb-3">Alarm status</h2>
        <div className="card flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-start gap-3">
            <span className="mt-1">
              <StatusDot level={report.overall} pulse={report.overall !== "green"} />
            </span>
            <p className="text-sm leading-relaxed text-[var(--ink-2)]">
              {report.headline}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await unlockAudio();
                notifyPlatformChanged();
                alarmRuntime.startTestAlarm();
              }}
            >
              Test alarm
            </button>
            <Link href="/reliability" className="btn btn-ghost">
              Details
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function PrayerRow({
  prayerType,
  timestamp,
  estimated,
  isNext,
  isPast,
  timeZone,
  timeFormat,
  state,
}: {
  prayerType: PrayerType;
  timestamp: number;
  estimated: boolean;
  isNext: boolean;
  isPast: boolean;
  timeZone: string;
  timeFormat: "12" | "24";
  state: ReturnType<typeof useAppState>;
}) {
  const alarm =
    prayerType === "sunrise"
      ? null
      : state.alarms.find((a) => a.prayerType === prayerType);

  return (
    <div
      className={cx(
        "row",
        isPast && !isNext && "opacity-55",
        prayerType === "sunrise" && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        {isNext && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dawn)]"
            aria-label="Next"
          />
        )}
        <span
          className={cx(
            "display text-[1.35rem]",
            isNext ? "text-[var(--ink)]" : "text-[var(--ink-2)]",
          )}
        >
          {PRAYER_LABELS[prayerType]}
        </span>
        {prayerType === "sunrise" && (
          <span className="text-[0.7rem] text-[var(--faint)]">
            not a prayer
          </span>
        )}
        {estimated && (
          <span
            className="text-[0.7rem] text-[var(--warn)]"
            title="The sun does not reach the required angle here today, so this time is estimated."
          >
            estimated
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span
          className={cx(
            "tnum text-[1.05rem]",
            isNext ? "text-[var(--dawn)]" : "text-[var(--ink-2)]",
          )}
        >
          {formatTime(timestamp, timeZone, timeFormat)}
        </span>

        {alarm ? (
          <Toggle
            checked={alarm.enabled}
            onChange={(next) => toggleAlarm(alarm.prayerType, next)}
            label={`${PRAYER_LABELS[prayerType]} alarm`}
          />
        ) : (
          <span className="w-12 text-center text-[var(--faint)]" aria-hidden>
            ·
          </span>
        )}
      </div>
    </div>
  );
}
