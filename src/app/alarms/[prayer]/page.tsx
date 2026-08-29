"use client";

import { notFound, useParams } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  BackLink,
  Section,
  Segmented,
  Select,
  SettingRow,
  Toggle,
} from "@/components/ui";
import { playSound, unlockAudio } from "@/lib/alarm/audio";
import {
  MAX_SNOOZE_OPTIONS,
  PRE_ALERT_OPTIONS,
  SNOOZE_OPTIONS,
  offsetForMode,
  modeForOffset,
} from "@/lib/alarm/defaults";
import { alarmRuntime } from "@/lib/alarm/runtime";
import { describeTrigger } from "@/lib/alarm/schedule";
import {
  CHALLENGE_LABELS,
  SOUND_LABELS,
  type ChallengeType,
  type SoundType,
  type TriggerMode,
} from "@/lib/alarm/types";
import { useRuntime } from "@/lib/alarm/use-runtime";
import { notifyPlatformChanged } from "@/lib/platform";
import {
  ALARMABLE_PRAYERS,
  PRAYER_LABELS,
  type AlarmablePrayer,
} from "@/lib/prayer/types";
import { updateAlarm, useAppState } from "@/lib/store/app-store";
import { formatTime } from "@/lib/time/format";

const SOUND_CHOICES: SoundType[] = [
  "adhan",
  "standardAlarm",
  "gentleAlarm",
  "shortChime",
  "vibrateOnly",
  "silent",
];

export default function AlarmEditorPage() {
  const params = useParams<{ prayer: string }>();
  const prayer = params.prayer as AlarmablePrayer;

  if (!ALARMABLE_PRAYERS.includes(prayer)) notFound();

  return (
    <AppShell>
      <AlarmEditor prayer={prayer} />
    </AppShell>
  );
}

function AlarmEditor({ prayer }: { prayer: AlarmablePrayer }) {
  const state = useAppState();
  const runtime = useRuntime();
  const alarm = state.alarms.find((a) => a.prayerType === prayer)!;
  const [previewing, setPreviewing] = useState(false);

  const today = runtime.days[0];
  const prayerTime = today?.times[prayer];
  const firesAt = prayerTime
    ? prayerTime.timestamp + alarm.offsetMinutes * 60_000
    : null;

  const { mode, magnitude } = modeForOffset(alarm.offsetMinutes);
  const label = PRAYER_LABELS[prayer];

  const patch = (next: Parameters<typeof updateAlarm>[1]) =>
    updateAlarm(prayer, next);

  const previewSound = async () => {
    await unlockAudio();
    notifyPlatformChanged();
    const handle = playSound(alarm.soundType, {
      volume: alarm.volumeMode === "system" ? 100 : alarm.volumeLevel,
      gradual: false,
      loop: false,
    });
    setPreviewing(true);
    setTimeout(() => {
      handle.stop();
      setPreviewing(false);
    }, 3500);
  };

  return (
    <>
      <div className="mb-6">
        <BackLink href="/alarms">All alarms</BackLink>
      </div>

      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Prayer alarm</p>
          <h1 className="display mt-1.5 text-[2.6rem] leading-none">{label}</h1>
          {firesAt !== null && (
            <p className="tnum mt-3 text-lg text-[var(--dawn)]">
              Rings today at{" "}
              {formatTime(firesAt, state.location.timeZone, state.display.timeFormat)}
            </p>
          )}
          <p className="mt-1 text-[0.82rem] text-[var(--muted)]">
            {describeTrigger(alarm)}
            {alarm.enabled ? "" : " · currently off"}
          </p>
        </div>
        <Toggle
          checked={alarm.enabled}
          onChange={(enabled) => patch({ enabled })}
          label={`${label} alarm`}
        />
      </header>

      {/* --- Timing ------------------------------------------------- */}
      <Section
        title="When it rings"
        description="Relative to the calculated prayer time, which moves each day."
      >
        <SettingRow label="Trigger">
          <Segmented<TriggerMode>
            label="Trigger mode"
            value={mode}
            onChange={(nextMode) =>
              patch({
                triggerMode: nextMode,
                offsetMinutes: offsetForMode(
                  nextMode,
                  magnitude === 0 ? 10 : magnitude,
                ),
              })
            }
            options={[
              { value: "before", label: "Before" },
              { value: "exact", label: "At time" },
              { value: "after", label: "After" },
            ]}
          />
        </SettingRow>

        {mode !== "exact" && (
          <SettingRow label="By how much" hint="Minutes from the prayer time.">
            <Select<number>
              label="Offset minutes"
              value={magnitude}
              onChange={(m) => patch({ offsetMinutes: offsetForMode(mode, m) })}
              options={[1, 2, 5, 10, 15, 20, 30, 45, 60].map((m) => ({
                value: m,
                label: `${m} min`,
              }))}
            />
          </SettingRow>
        )}
      </Section>

      {/* --- Sound -------------------------------------------------- */}
      <Section title="Sound and vibration">
        <SettingRow label="Alarm sound">
          <div className="flex items-center gap-2">
            <Select<SoundType>
              label="Alarm sound"
              value={alarm.soundType}
              onChange={(soundType) => patch({ soundType })}
              options={SOUND_CHOICES.map((s) => ({
                value: s,
                label: SOUND_LABELS[s],
              }))}
            />
            {alarm.soundType !== "silent" && alarm.soundType !== "vibrateOnly" && (
              <button type="button" className="btn px-3 py-2 text-[0.8rem]" onClick={previewSound}>
                {previewing ? "Playing…" : "Preview"}
              </button>
            )}
          </div>
        </SettingRow>

        <SettingRow
          label="Volume"
          hint={
            alarm.volumeMode === "system"
              ? "Follows your device volume. The app cannot raise it above the system setting."
              : `${alarm.volumeLevel}% of your device volume.`
          }
        >
          <div className="flex items-center gap-3">
            <Segmented<"system" | "custom">
              label="Volume mode"
              value={alarm.volumeMode}
              onChange={(volumeMode) => patch({ volumeMode })}
              options={[
                { value: "system", label: "Device" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </div>
        </SettingRow>

        {alarm.volumeMode === "custom" && (
          <SettingRow label="Level">
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={alarm.volumeLevel}
              onChange={(e) => patch({ volumeLevel: Number(e.target.value) })}
              aria-label="Alarm volume"
              className="w-40 accent-[var(--dawn)]"
            />
          </SettingRow>
        )}

        <SettingRow
          label="Fade in"
          hint="Start quiet and rise to full over about 20 seconds."
        >
          <Toggle
            checked={alarm.gradualVolume}
            onChange={(gradualVolume) => patch({ gradualVolume })}
            label="Gradual volume"
          />
        </SettingRow>

        <SettingRow
          label="Vibrate"
          hint="Only some browsers and devices support vibration."
        >
          <Toggle
            checked={alarm.vibrationEnabled}
            onChange={(vibrationEnabled) => patch({ vibrationEnabled })}
            label="Vibration"
          />
        </SettingRow>
      </Section>

      {/* --- Snooze ------------------------------------------------- */}
      <Section title="Snooze">
        <SettingRow label="Allow snooze">
          <Toggle
            checked={alarm.snoozeEnabled}
            onChange={(snoozeEnabled) => patch({ snoozeEnabled })}
            label="Allow snooze"
          />
        </SettingRow>

        {alarm.snoozeEnabled && (
          <>
            <SettingRow label="Snooze length">
              <Select<number>
                label="Snooze length"
                value={alarm.snoozeDurationMinutes}
                onChange={(snoozeDurationMinutes) =>
                  patch({ snoozeDurationMinutes })
                }
                options={SNOOZE_OPTIONS.map((m) => ({
                  value: m,
                  label: `${m} min`,
                }))}
              />
            </SettingRow>

            <SettingRow
              label="Maximum snoozes"
              hint="After the last one the alarm dismisses itself."
            >
              <Select<string>
                label="Maximum snoozes"
                value={alarm.maxSnoozes === null ? "unlimited" : String(alarm.maxSnoozes)}
                onChange={(v) =>
                  patch({ maxSnoozes: v === "unlimited" ? null : Number(v) })
                }
                options={MAX_SNOOZE_OPTIONS.map((m) => ({
                  value: m === null ? "unlimited" : String(m),
                  label: m === null ? "Unlimited" : `${m}`,
                }))}
              />
            </SettingRow>
          </>
        )}

        <SettingRow
          label="Stop ringing after"
          hint="If nobody responds, the alarm gives up rather than ringing forever."
        >
          <Select<number>
            label="Auto dismiss"
            value={alarm.autoDismissMinutes}
            onChange={(autoDismissMinutes) => patch({ autoDismissMinutes })}
            options={[1, 2, 5, 10, 15].map((m) => ({
              value: m,
              label: `${m} min`,
            }))}
          />
        </SettingRow>
      </Section>

      {/* --- Pre-alert ---------------------------------------------- */}
      <Section
        title="Reminder before the prayer"
        description="A quiet notification ahead of the alarm. It is not the alarm itself."
      >
        <SettingRow label="Send a reminder">
          <Toggle
            checked={alarm.preAlertEnabled}
            onChange={(preAlertEnabled) => patch({ preAlertEnabled })}
            label="Pre-prayer reminder"
          />
        </SettingRow>

        {alarm.preAlertEnabled && (
          <SettingRow label="How far ahead">
            <Select<number>
              label="Reminder lead time"
              value={alarm.preAlertMinutes}
              onChange={(preAlertMinutes) => patch({ preAlertMinutes })}
              options={PRE_ALERT_OPTIONS.map((m) => ({
                value: m,
                label: `${m} min before`,
              }))}
            />
          </SettingRow>
        )}
      </Section>

      {/* --- Wake-up mode ------------------------------------------- */}
      <Section
        title="Wake-up mode"
        description={
          prayer === "fajr"
            ? "For Fajr, an optional challenge makes it harder to dismiss half-asleep."
            : "Optional. Most people only want this on Fajr."
        }
      >
        <SettingRow
          label="Challenge to dismiss"
          hint={
            alarm.challengeType === "shake"
              ? "Needs a device with a motion sensor. Falls back to a normal dismiss if none is present."
              : undefined
          }
        >
          <Select<ChallengeType>
            label="Dismiss challenge"
            value={alarm.challengeType}
            onChange={(challengeType) => patch({ challengeType })}
            options={(
              ["none", "holdToDismiss", "math", "shake"] as ChallengeType[]
            ).map((c) => ({ value: c, label: CHALLENGE_LABELS[c] }))}
          />
        </SettingRow>
      </Section>

      <div className="mb-10 flex gap-3">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={async () => {
            await unlockAudio();
            notifyPlatformChanged();
            alarmRuntime.startTestAlarm(alarm);
          }}
        >
          Test this alarm
        </button>
      </div>
    </>
  );
}
