"use client";

import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { BackLink, PageHeader, Section, SettingRow } from "@/components/ui";
import type { AlarmEventType } from "@/lib/alarm/types";
import { useRuntime } from "@/lib/alarm/use-runtime";
import { getMethod } from "@/lib/prayer/methods";
import {
  ASR_METHOD_LABELS,
  HIGH_LATITUDE_LABELS,
  PRAYER_LABELS,
  PRAYER_TYPES,
} from "@/lib/prayer/types";
import { clearEvents, useAppState } from "@/lib/store/app-store";
import { formatDateTime, formatOffset } from "@/lib/time/format";
import { describeTimeZone } from "@/lib/time/timezone";

/**
 * Diagnostics (spec §7.4, §28, §36, §37).
 *
 * Everything here is computed from local state. Nothing is transmitted — the
 * screen exists so a user can answer "why is my time wrong?" themselves, and
 * so a support conversation has facts in it.
 */
export default function DiagnosticsPage() {
  const state = useAppState();
  const runtime = useRuntime();
  const [copied, setCopied] = useState(false);

  const method = getMethod(state.calculation.methodId);
  const today = runtime.days[0] ?? null;

  const metrics = useMemo(() => {
    const events = state.events;
    const count = (type: AlarmEventType) =>
      events.filter((e) => e.eventType === type).length;

    const scheduled = count("scheduled");
    const fired = count("fired");
    const missed = count("missed");

    return {
      fired,
      snoozed: count("snoozed"),
      dismissed: count("dismissed"),
      missed,
      // Spec §37 — alarm interaction rate.
      interactionRate:
        fired + missed > 0
          ? `${Math.round((fired / (fired + missed)) * 100)}%`
          : "—",
      scheduleEvents: scheduled,
    };
  }, [state.events]);

  const report = useMemo(() => {
    const lines = [
      "Salah Alarm — diagnostics",
      `Generated: ${new Date().toISOString()}`,
      "",
      "Location",
      `  Mode: ${state.location.mode}`,
      `  Label: ${state.location.label}`,
      `  Lat/Lon: ${state.location.latitude.toFixed(3)}, ${state.location.longitude.toFixed(3)}`,
      `  Time zone: ${describeTimeZone(state.location.timeZone)}`,
      "",
      "Calculation",
      `  Method: ${method.name} (${method.id})`,
      `  Asr: ${ASR_METHOD_LABELS[state.calculation.asrMethod]}`,
      `  High latitude: ${HIGH_LATITUDE_LABELS[state.calculation.highLatitudeRule]}`,
      `  Offsets: ${PRAYER_TYPES.map(
        (p) => `${p} ${formatOffset(state.calculation.offsets[p])}`,
      ).join(", ")}`,
      "",
      "Today",
      ...(today
        ? today.ordered.map(
            (t) =>
              `  ${PRAYER_LABELS[t.prayerType].padEnd(8)} ${formatDateTime(
                t.timestamp,
                state.location.timeZone,
                "24",
              )}${t.estimated ? "  (estimated)" : ""}`,
          )
        : ["  not calculated"]),
      ...(today?.meta.fallbackLatitude !== undefined
        ? [
            `  Polar fallback latitude: ${today?.meta.fallbackLatitude}° (aqrab al-bilad)`,
          ]
        : []),
      "",
      "Alarms",
      ...state.alarms.map(
        (a) =>
          `  ${PRAYER_LABELS[a.prayerType].padEnd(8)} ${
            a.enabled ? "on " : "off"
          } offset ${formatOffset(a.offsetMinutes)} sound ${a.soundType} snooze ${
            a.snoozeEnabled ? `${a.snoozeDurationMinutes}m x${a.maxSnoozes ?? "∞"}` : "off"
          }`,
      ),
      "",
      "Counters",
      `  Fired: ${metrics.fired}  Snoozed: ${metrics.snoozed}  Dismissed: ${metrics.dismissed}  Missed: ${metrics.missed}`,
      `  Interaction rate: ${metrics.interactionRate}`,
      "",
      "Environment",
      `  User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
      `  Device time zone: ${describeTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )}`,
    ];
    return lines.join("\n");
  }, [state, method, today, metrics]);

  return (
    <AppShell>
      <div className="mb-6">
        <BackLink href="/settings">Settings</BackLink>
      </div>

      <PageHeader
        eyebrow="Diagnostics"
        title="What the app is actually doing"
        lede="All of this is computed and stored on this device. Nothing here is sent anywhere."
      />

      <Section title="Calculation inputs">
        <SettingRow label="Location">
          <span className="text-[0.85rem] text-[var(--muted)]">
            {state.location.label}
          </span>
        </SettingRow>
        <SettingRow label="Coordinates">
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            {state.location.latitude.toFixed(3)},{" "}
            {state.location.longitude.toFixed(3)}
          </span>
        </SettingRow>
        <SettingRow label="Time zone">
          <span className="text-[0.85rem] text-[var(--muted)]">
            {describeTimeZone(state.location.timeZone)}
          </span>
        </SettingRow>
        <SettingRow label="Method">
          <span className="text-[0.85rem] text-[var(--muted)]">{method.name}</span>
        </SettingRow>
        <SettingRow label="Asr">
          <span className="text-[0.85rem] text-[var(--muted)]">
            {ASR_METHOD_LABELS[state.calculation.asrMethod]}
          </span>
        </SettingRow>
        <SettingRow label="High latitude rule">
          <span className="text-[0.85rem] text-[var(--muted)]">
            {HIGH_LATITUDE_LABELS[state.calculation.highLatitudeRule]}
          </span>
        </SettingRow>
        <SettingRow label="Source">
          <span className="text-[0.85rem] text-[var(--muted)]">
            {today?.meta.source ?? "—"}
          </span>
        </SettingRow>
        {today?.meta.fallbackLatitude !== undefined && (
          <SettingRow
            label="Polar fallback"
            hint="The sun does not cross the horizon here today, so times were derived at a substitute latitude (aqrab al-bilad)."
          >
            <span className="tnum text-[0.85rem] text-[var(--warn)]">
              {today.meta.fallbackLatitude}°
            </span>
          </SettingRow>
        )}
      </Section>

      <Section title="Reliability counters" description="Spec §37 metrics, local only.">
        <SettingRow label="Alarms fired">
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            {metrics.fired}
          </span>
        </SettingRow>
        <SettingRow label="Snoozed">
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            {metrics.snoozed}
          </span>
        </SettingRow>
        <SettingRow label="Dismissed">
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            {metrics.dismissed}
          </span>
        </SettingRow>
        <SettingRow
          label="Missed"
          hint="The app was not running when the alarm was due."
        >
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            {metrics.missed}
          </span>
        </SettingRow>
        <SettingRow
          label="Interaction rate"
          hint="Alarms that reached you, out of those that came due."
        >
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            {metrics.interactionRate}
          </span>
        </SettingRow>
      </Section>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="eyebrow">Event log</h2>
          {state.events.length > 0 && (
            <button
              type="button"
              className="text-[0.78rem] text-[var(--muted)] hover:text-[var(--ink)]"
              onClick={clearEvents}
            >
              Clear log
            </button>
          )}
        </div>

        <div className="card max-h-[26rem] overflow-y-auto px-4 sm:px-5">
          {state.events.length === 0 ? (
            <p className="py-5 text-sm text-[var(--muted)]">
              No events yet. Scheduling, firing, snoozing and dismissing all
              appear here.
            </p>
          ) : (
            state.events.map((event) => (
              <div key={event.id} className="row items-start py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="tnum text-[0.7rem] tracking-wider text-[var(--dawn)] uppercase">
                      {event.eventType}
                    </span>
                    {event.prayerType && (
                      <span className="text-[0.82rem] text-[var(--ink-2)]">
                        {PRAYER_LABELS[event.prayerType]}
                      </span>
                    )}
                  </div>
                  {event.detail && (
                    <p className="mt-0.5 text-[0.78rem] leading-relaxed text-[var(--muted)]">
                      {event.detail}
                    </p>
                  )}
                </div>
                <span className="tnum shrink-0 text-[0.72rem] text-[var(--faint)]">
                  {formatDateTime(
                    event.timestamp,
                    state.location.timeZone,
                    state.display.timeFormat,
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="eyebrow mb-3">Support report</h2>
        <div className="card px-5 py-4">
          <p className="mb-3 text-[0.85rem] leading-relaxed text-[var(--muted)]">
            Copies the settings above as plain text so you can paste it into a
            support message. It contains your city and coordinates — review it
            before sending.
          </p>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy report"}
          </button>
          <pre className="tnum mt-4 max-h-64 overflow-auto rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--night-2)] p-3 text-[0.7rem] leading-relaxed text-[var(--muted)]">
            {report}
          </pre>
        </div>
      </section>
    </AppShell>
  );
}
