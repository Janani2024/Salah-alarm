"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  PageHeader,
  Section,
  Segmented,
  Select,
  SettingRow,
  Toggle,
} from "@/components/ui";
import {
  MAX_SNOOZE_OPTIONS,
  PRE_ALERT_OPTIONS,
  SNOOZE_OPTIONS,
} from "@/lib/alarm/defaults";
import { SOUND_LABELS, type SoundType } from "@/lib/alarm/types";
import { CALCULATION_METHODS, getMethod } from "@/lib/prayer/methods";
import {
  ALARMABLE_PRAYERS,
  ASR_METHOD_LABELS,
  HIGH_LATITUDE_LABELS,
  PRAYER_LABELS,
  PRAYER_TYPES,
  type AsrMethod,
  type HighLatitudeRule,
} from "@/lib/prayer/types";
import {
  deleteAllData,
  setAlarmDefaults,
  setCalculation,
  setDisplay,
  setOffset,
  setPrivacy,
  updateAlarm,
  useAppState,
} from "@/lib/store/app-store";
import { describeTimeZone } from "@/lib/time/timezone";
import { hijriSupported } from "@/lib/time/hijri";

const SOUND_CHOICES: SoundType[] = [
  "adhan",
  "standardAlarm",
  "gentleAlarm",
  "shortChime",
  "vibrateOnly",
  "silent",
];

export default function SettingsPage() {
  const state = useAppState();
  const method = getMethod(state.calculation.methodId);

  return (
    <AppShell>
      <PageHeader eyebrow="Settings" title="Settings" />

      {/* --- Prayer times ------------------------------------------- */}
      <Section
        title="Prayer times"
        description={`Currently using ${method.name}.`}
      >
        <SettingRow label="Location" hint={state.location.label}>
          <Link href="/settings/location" className="btn px-3 py-2 text-[0.82rem]">
            Change
          </Link>
        </SettingRow>

        <SettingRow label="Time zone" hint="Follows the location above.">
          <span className="text-[0.82rem] text-[var(--muted)]">
            {describeTimeZone(state.location.timeZone)}
          </span>
        </SettingRow>

        <SettingRow label="Calculation method" hint={method.description}>
          <Select<string>
            label="Calculation method"
            value={state.calculation.methodId}
            onChange={(methodId) => setCalculation({ methodId })}
            options={CALCULATION_METHODS.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
        </SettingRow>

        <SettingRow
          label="Asr method"
          hint={ASR_METHOD_LABELS[state.calculation.asrMethod]}
        >
          <Segmented<AsrMethod>
            label="Asr method"
            value={state.calculation.asrMethod}
            onChange={(asrMethod) => setCalculation({ asrMethod })}
            options={[
              { value: "standard", label: "Standard" },
              { value: "hanafi", label: "Hanafi" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="High latitude rule"
          hint="Used where the sun does not fall far enough below the horizon for Fajr and Isha."
        >
          <Select<HighLatitudeRule>
            label="High latitude rule"
            value={state.calculation.highLatitudeRule}
            onChange={(highLatitudeRule) => setCalculation({ highLatitudeRule })}
            options={(
              [
                "middleOfNight",
                "seventhOfNight",
                "angleBased",
                "none",
              ] as HighLatitudeRule[]
            ).map((r) => ({ value: r, label: HIGH_LATITUDE_LABELS[r] }))}
          />
        </SettingRow>
      </Section>

      {/* --- Manual offsets ----------------------------------------- */}
      <Section
        title="Manual offsets"
        description="Manual offsets change calculated prayer times. Use them only if you follow a local timetable or authority."
      >
        {PRAYER_TYPES.map((prayer) => (
          <SettingRow key={prayer} label={PRAYER_LABELS[prayer]}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-30}
                max={30}
                step={1}
                value={state.calculation.offsets[prayer]}
                onChange={(e) => setOffset(prayer, Number(e.target.value))}
                aria-label={`${PRAYER_LABELS[prayer]} offset in minutes`}
                className="w-32 accent-[var(--dawn)]"
              />
              <span className="tnum w-16 text-right text-[0.85rem] text-[var(--muted)]">
                {state.calculation.offsets[prayer] > 0 ? "+" : ""}
                {state.calculation.offsets[prayer]} min
              </span>
            </div>
          </SettingRow>
        ))}
      </Section>

      {/* --- Alarm defaults ----------------------------------------- */}
      <Section
        title="Alarm defaults"
        description="Applied to new alarms. Existing prayers keep their own settings."
      >
        <SettingRow label="Default sound">
          <Select<SoundType>
            label="Default sound"
            value={state.alarmDefaults.soundType}
            onChange={(soundType) => setAlarmDefaults({ soundType })}
            options={SOUND_CHOICES.map((s) => ({
              value: s,
              label: SOUND_LABELS[s],
            }))}
          />
        </SettingRow>

        <SettingRow label="Default snooze">
          <Select<number>
            label="Default snooze"
            value={state.alarmDefaults.snoozeDurationMinutes}
            onChange={(snoozeDurationMinutes) =>
              setAlarmDefaults({ snoozeDurationMinutes })
            }
            options={SNOOZE_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
          />
        </SettingRow>

        <SettingRow label="Default maximum snoozes">
          <Select<string>
            label="Default maximum snoozes"
            value={
              state.alarmDefaults.maxSnoozes === null
                ? "unlimited"
                : String(state.alarmDefaults.maxSnoozes)
            }
            onChange={(v) =>
              setAlarmDefaults({
                maxSnoozes: v === "unlimited" ? null : Number(v),
              })
            }
            options={MAX_SNOOZE_OPTIONS.map((m) => ({
              value: m === null ? "unlimited" : String(m),
              label: m === null ? "Unlimited" : `${m}`,
            }))}
          />
        </SettingRow>

        <SettingRow label="Default vibration">
          <Toggle
            checked={state.alarmDefaults.vibrationEnabled}
            onChange={(vibrationEnabled) =>
              setAlarmDefaults({ vibrationEnabled })
            }
            label="Default vibration"
          />
        </SettingRow>

        <SettingRow label="Default reminder">
          <Select<number>
            label="Default reminder"
            value={state.alarmDefaults.preAlertMinutes}
            onChange={(preAlertMinutes) => setAlarmDefaults({ preAlertMinutes })}
            options={PRE_ALERT_OPTIONS.map((m) => ({
              value: m,
              label: `${m} min before`,
            }))}
          />
        </SettingRow>

        <SettingRow
          label="Apply sound to all prayers"
          hint="Overwrites the sound on each of the five alarms."
        >
          <ApplyToAllButton />
        </SettingRow>
      </Section>

      {/* --- Individual prayers ------------------------------------- */}
      <Section title="Individual prayers">
        {ALARMABLE_PRAYERS.map((prayer) => {
          const alarm = state.alarms.find((a) => a.prayerType === prayer)!;
          return (
            <SettingRow
              key={prayer}
              label={PRAYER_LABELS[prayer]}
              hint={`${SOUND_LABELS[alarm.soundType]}${
                alarm.enabled ? "" : " · off"
              }`}
            >
              <Link
                href={`/alarms/${prayer}`}
                className="btn px-3 py-2 text-[0.82rem]"
              >
                Edit
              </Link>
            </SettingRow>
          );
        })}
      </Section>

      {/* --- General ------------------------------------------------- */}
      <Section title="General">
        <SettingRow label="Time format">
          <Segmented<"12" | "24">
            label="Time format"
            value={state.display.timeFormat}
            onChange={(timeFormat) => setDisplay({ timeFormat })}
            options={[
              { value: "12", label: "12-hour" },
              { value: "24", label: "24-hour" },
            ]}
          />
        </SettingRow>

        <SettingRow label="Theme">
          <Segmented<"system" | "light" | "dark">
            label="Theme"
            value={state.display.theme}
            onChange={(theme) => setDisplay({ theme })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Show Hijri date"
          hint={
            hijriSupported()
              ? "Uses the Umm al-Qura calendar."
              : "This browser has no Hijri calendar data."
          }
        >
          <Toggle
            checked={state.display.showHijri}
            onChange={(showHijri) => setDisplay({ showHijri })}
            label="Show Hijri date"
            disabled={!hijriSupported()}
          />
        </SettingRow>

        {state.display.showHijri && (
          <SettingRow
            label="Hijri correction"
            hint="Shift the Hijri date if your local moon sighting differs."
          >
            <Select<number>
              label="Hijri correction"
              value={state.display.hijriOffset}
              onChange={(hijriOffset) => setDisplay({ hijriOffset })}
              options={[-2, -1, 0, 1, 2].map((d) => ({
                value: d,
                label: d === 0 ? "None" : `${d > 0 ? "+" : ""}${d} day`,
              }))}
            />
          </SettingRow>
        )}
      </Section>

      {/* --- Privacy ------------------------------------------------- */}
      <Section
        title="Privacy"
        description="Core prayer alarms work without an account, and nothing is uploaded."
      >
        <SettingRow
          label="Local usage log"
          hint="Records alarm events on this device only, so the diagnostics screen can explain a missed alarm. Never sent anywhere."
        >
          <Toggle
            checked={state.privacy.analyticsEnabled}
            onChange={(analyticsEnabled) => setPrivacy({ analyticsEnabled })}
            label="Local usage log"
          />
        </SettingRow>

        <SettingRow label="Diagnostics">
          <Link href="/diagnostics" className="btn px-3 py-2 text-[0.82rem]">
            Open
          </Link>
        </SettingRow>

        <SettingRow
          label="Delete all data"
          hint="Removes every setting, alarm and log from this device. Cannot be undone."
        >
          <DeleteDataButton />
        </SettingRow>
      </Section>

      {/* --- About --------------------------------------------------- */}
      <Section title="About">
        <SettingRow label="Version">
          <span className="tnum text-[0.85rem] text-[var(--muted)]">
            1.0.0 MVP
          </span>
        </SettingRow>
        <SettingRow
          label="Audio"
          hint="Every built-in sound is generated by the app itself. No recording is bundled or licensed."
        >
          <span className="text-[0.82rem] text-[var(--muted)]">Synthesised</span>
        </SettingRow>
        <SettingRow
          label="Prayer times"
          hint="Calculated on this device from published astronomical formulae. No prayer-time service is contacted."
        >
          <span className="text-[0.82rem] text-[var(--muted)]">On-device</span>
        </SettingRow>
      </Section>

      <div className="h-6" />
    </AppShell>
  );
}

function ApplyToAllButton() {
  const state = useAppState();
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className="btn px-3 py-2 text-[0.82rem]"
      onClick={() => {
        const soundType = state.alarmDefaults.soundType;
        for (const p of ALARMABLE_PRAYERS) updateAlarm(p, { soundType });
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "Applied" : "Apply"}
    </button>
  );
}

function DeleteDataButton() {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn px-3 py-2 text-[0.82rem]"
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn px-3 py-2 text-[0.82rem]"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
      <button
        type="button"
        className="btn px-3 py-2 text-[0.82rem]"
        style={{ background: "var(--risk)", borderColor: "transparent", color: "#170807" }}
        onClick={() => {
          deleteAllData();
          // State resets to "not onboarded", so home sends the user back
          // through setup.
          router.replace("/");
        }}
      >
        Delete everything
      </button>
    </div>
  );
}
