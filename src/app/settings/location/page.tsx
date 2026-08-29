"use client";

import { AppShell } from "@/components/app-shell";
import { HorizonArc } from "@/components/horizon-arc";
import { LocationPicker } from "@/components/location-picker";
import { BackLink, PageHeader } from "@/components/ui";
import { useRuntime } from "@/lib/alarm/use-runtime";
import { useNow } from "@/lib/platform";
import { PRAYER_LABELS } from "@/lib/prayer/types";
import { useAppState } from "@/lib/store/app-store";
import { formatTime } from "@/lib/time/format";

export default function LocationSettingsPage() {
  const state = useAppState();
  const runtime = useRuntime();
  const now = useNow(30_000);
  const today = runtime.days[0] ?? null;

  return (
    <AppShell>
      <div className="mb-6">
        <BackLink href="/settings">Settings</BackLink>
      </div>

      <PageHeader
        eyebrow="Prayer times"
        title="Location"
        lede="Prayer times depend on latitude, longitude and time zone. Change any of these and every alarm is rescheduled automatically."
      />

      <div className="card mb-8 px-5 py-5">
        <LocationPicker />
      </div>

      {today && (
        <section className="mb-8">
          <h2 className="eyebrow mb-3">Times here today</h2>
          <div className="card overflow-hidden">
            <div className="px-5 pt-4">
              {today.ordered.map((t) => (
                <div key={t.prayerType} className="row py-2.5">
                  <span className="text-[0.95rem] text-[var(--ink-2)]">
                    {PRAYER_LABELS[t.prayerType]}
                  </span>
                  <span className="tnum text-[0.95rem] text-[var(--muted)]">
                    {formatTime(
                      t.timestamp,
                      state.location.timeZone,
                      state.display.timeFormat,
                    )}
                  </span>
                </div>
              ))}
            </div>
            <HorizonArc day={today} now={now} className="mt-3 h-[160px] w-full" />
          </div>
        </section>
      )}

      <p className="mb-10 text-[0.78rem] leading-relaxed text-[var(--faint)]">
        When you travel with device location on, the app notices a move of more
        than 25 km, recalculates and tells you that your alarms changed.
      </p>
    </AppShell>
  );
}
