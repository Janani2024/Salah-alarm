"use client";

import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PageHeader, Toggle, cx } from "@/components/ui";
import { describeTrigger } from "@/lib/alarm/schedule";
import { SOUND_LABELS } from "@/lib/alarm/types";
import { useRuntime } from "@/lib/alarm/use-runtime";
import { ALARMABLE_PRAYERS, PRAYER_LABELS } from "@/lib/prayer/types";
import { toggleAlarm, useAppState } from "@/lib/store/app-store";
import { formatTime } from "@/lib/time/format";

export default function AlarmsPage() {
  const state = useAppState();
  const runtime = useRuntime();
  const today = runtime.days[0] ?? null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Alarms"
        title="One alarm per prayer"
        lede="Each prayer keeps its own sound, snooze and timing. Nothing here needs changing again once it is set."
      />

      <div className="card px-4 sm:px-5">
        {ALARMABLE_PRAYERS.map((prayer) => {
          const alarm = state.alarms.find((a) => a.prayerType === prayer)!;
          const time = today?.times[prayer];

          return (
            <div key={prayer} className="row">
              <Link
                href={`/alarms/${prayer}`}
                className="group flex min-w-0 flex-1 items-center gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <span
                      className={cx(
                        "display text-[1.35rem] transition-colors",
                        alarm.enabled
                          ? "text-[var(--ink)]"
                          : "text-[var(--faint)]",
                      )}
                    >
                      {PRAYER_LABELS[prayer]}
                    </span>
                    {time && (
                      <span
                        className={cx(
                          "tnum text-[0.95rem]",
                          alarm.enabled
                            ? "text-[var(--dawn)]"
                            : "text-[var(--faint)]",
                        )}
                      >
                        {formatTime(
                          time.timestamp + alarm.offsetMinutes * 60_000,
                          state.location.timeZone,
                          state.display.timeFormat,
                        )}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate text-[0.78rem] text-[var(--muted)]">
                    {describeTrigger(alarm)} · {SOUND_LABELS[alarm.soundType]}
                    {alarm.snoozeEnabled
                      ? ` · snooze ${alarm.snoozeDurationMinutes} min`
                      : " · no snooze"}
                    {alarm.preAlertEnabled &&
                      ` · ${alarm.preAlertMinutes} min reminder`}
                  </p>
                </div>

                <span
                  aria-hidden
                  className="text-[var(--faint)] transition-transform group-hover:translate-x-0.5"
                >
                  ›
                </span>
              </Link>

              <Toggle
                checked={alarm.enabled}
                onChange={(enabled) => toggleAlarm(prayer, enabled)}
                label={`${PRAYER_LABELS[prayer]} alarm`}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[0.78rem] leading-relaxed text-[var(--faint)]">
        Sunrise is shown on the dashboard for reference but never carries an
        alarm — it marks the end of Fajr, not a prayer.
      </p>
    </AppShell>
  );
}
