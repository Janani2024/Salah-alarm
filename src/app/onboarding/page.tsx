"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LocationPicker } from "@/components/location-picker";
import { Segmented, Toggle, cx } from "@/components/ui";
import { unlockAudio, playSound } from "@/lib/alarm/audio";
import { requestNotificationPermission } from "@/lib/alarm/notifications";
import { alarmRuntime } from "@/lib/alarm/runtime";
import { SOUND_DESCRIPTIONS, SOUND_LABELS, type SoundType } from "@/lib/alarm/types";
import {
  notifyPlatformChanged,
  useAudioUnlocked,
  useNotificationPermission,
  useStandalone,
} from "@/lib/platform";
import { CALCULATION_METHODS, getMethod } from "@/lib/prayer/methods";
import {
  ALARMABLE_PRAYERS,
  ASR_METHOD_LABELS,
  PRAYER_LABELS,
  type AlarmablePrayer,
  type AsrMethod,
} from "@/lib/prayer/types";
import {
  completeOnboarding,
  setAlarmDefaults,
  setCalculation,
  setDisplay,
  updateAlarm,
  useAppState,
  useHydrated,
} from "@/lib/store/app-store";

type Step = "welcome" | "location" | "method" | "prayers" | "sound" | "ready";

const STEPS: Step[] = ["welcome", "location", "method", "prayers", "sound", "ready"];

export default function OnboardingPage() {
  const state = useAppState();
  const hydrated = useHydrated();
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    if (hydrated && state.onboarded) router.replace("/");
  }, [hydrated, state.onboarded, router]);

  const index = STEPS.indexOf(step);
  const go = (next: Step) => setStep(next);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-8">
      <ProgressRail index={index} total={STEPS.length} />

      <div key={step} className="rise flex flex-1 flex-col">
        {step === "welcome" && <Welcome onNext={() => go("location")} />}
        {step === "location" && (
          <LocationStep onNext={() => go("method")} onBack={() => go("welcome")} />
        )}
        {step === "method" && (
          <MethodStep onNext={() => go("prayers")} onBack={() => go("location")} />
        )}
        {step === "prayers" && (
          <PrayersStep onNext={() => go("sound")} onBack={() => go("method")} />
        )}
        {step === "sound" && (
          <SoundStep onNext={() => go("ready")} onBack={() => go("prayers")} />
        )}
        {step === "ready" && (
          <ReadyStep
            onBack={() => go("sound")}
            onFinish={() => {
              completeOnboarding();
              router.replace("/");
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A horizon that fills as setup proceeds — the same sun-and-horizon idea as
 * the dashboard, used here to show progress without a generic step counter.
 */
function ProgressRail({ index, total }: { index: number; total: number }) {
  const progress = index / (total - 1);
  return (
    <div className="mb-10 pt-2">
      <div className="relative h-px w-full bg-[var(--line)]">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--dawn)] transition-[width] duration-500"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--dawn)] transition-[left] duration-500"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

function StepFrame({
  eyebrow,
  title,
  lede,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-2 text-[2.2rem] leading-tight">{title}</h1>
      {lede && (
        <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--muted)]">
          {lede}
        </p>
      )}
      <div className="mt-7 flex-1">{children}</div>
      <div className="mt-8 flex gap-3">{footer}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <StepFrame
      eyebrow="Salah Alarm"
      title="Prayer times that become alarms."
      lede="Set your prayer alarms once. The app follows your local prayer times every day — you never edit an alarm again."
      footer={
        <button type="button" className="btn btn-primary btn-lg flex-1" onClick={onNext}>
          Get started
        </button>
      }
    >
      <ul className="flex flex-col gap-3 text-sm text-[var(--ink-2)]">
        {[
          "Alarms move with the prayer times, every day.",
          "Snooze and dismiss, like the alarm clock you already use.",
          "Each prayer has its own sound, snooze and volume.",
          "Everything is calculated on this device. No account.",
        ].map((line) => (
          <li key={line} className="flex gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--dawn)]" />
            <span className="leading-relaxed">{line}</span>
          </li>
        ))}
      </ul>
    </StepFrame>
  );
}

/* ---------------------------------------------------------------- */

function LocationStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const state = useAppState();
  return (
    <StepFrame
      eyebrow="Step 1"
      title="Where are you?"
      lede="Your location is used to calculate local prayer times and automatically adjust your prayer alarms. It stays on this device."
      footer={
        <>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={onNext}
            disabled={!state.location.resolved}
          >
            Continue
          </button>
        </>
      }
    >
      <LocationPicker />
    </StepFrame>
  );
}

/* ---------------------------------------------------------------- */

function MethodStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const state = useAppState();
  const method = getMethod(state.calculation.methodId);

  return (
    <StepFrame
      eyebrow="Step 2"
      title="How should times be calculated?"
      lede="Mosques and authorities differ slightly. We have suggested the method most common for your region — change it if you follow another."
      footer={
        <>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="eyebrow">Calculation method</span>
          <select
            className="field cursor-pointer"
            value={state.calculation.methodId}
            onChange={(e) => setCalculation({ methodId: e.target.value })}
          >
            {CALCULATION_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-[0.8rem] leading-relaxed text-[var(--muted)]">
            {method.description}
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="eyebrow">Asr</span>
          <Segmented<AsrMethod>
            label="Asr juristic method"
            value={state.calculation.asrMethod}
            onChange={(asrMethod) => setCalculation({ asrMethod })}
            options={[
              { value: "standard", label: "Standard" },
              { value: "hanafi", label: "Hanafi" },
            ]}
          />
          <span className="text-[0.8rem] leading-relaxed text-[var(--muted)]">
            {ASR_METHOD_LABELS[state.calculation.asrMethod]}. Hanafi Asr falls
            later in the afternoon.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="eyebrow">Time format</span>
          <Segmented<"12" | "24">
            label="Time format"
            value={state.display.timeFormat}
            onChange={(timeFormat) => setDisplay({ timeFormat })}
            options={[
              { value: "12", label: "12-hour" },
              { value: "24", label: "24-hour" },
            ]}
          />
        </div>
      </div>
    </StepFrame>
  );
}

/* ---------------------------------------------------------------- */

function PrayersStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const state = useAppState();
  const allOn = state.alarms.every((a) => a.enabled);

  return (
    <StepFrame
      eyebrow="Step 3"
      title="Which prayers should have alarms?"
      lede="You can change any of these later, and give each prayer its own sound and snooze."
      footer={
        <>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="card px-4 sm:px-5">
        {ALARMABLE_PRAYERS.map((prayer: AlarmablePrayer) => {
          const alarm = state.alarms.find((a) => a.prayerType === prayer)!;
          return (
            <div key={prayer} className="row">
              <span className="display text-[1.3rem] text-[var(--ink-2)]">
                {PRAYER_LABELS[prayer]}
              </span>
              <Toggle
                checked={alarm.enabled}
                onChange={(enabled) => updateAlarm(prayer, { enabled })}
                label={`${PRAYER_LABELS[prayer]} alarm`}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-ghost mt-3 w-full"
        onClick={() => {
          for (const p of ALARMABLE_PRAYERS) updateAlarm(p, { enabled: !allOn });
        }}
      >
        {allOn ? "Turn all off" : "Select all five"}
      </button>
    </StepFrame>
  );
}

/* ---------------------------------------------------------------- */

const SOUND_CHOICES: SoundType[] = [
  "adhan",
  "standardAlarm",
  "gentleAlarm",
  "shortChime",
  "vibrateOnly",
  "silent",
];

function SoundStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const state = useAppState();
  const [previewing, setPreviewing] = useState<SoundType | null>(null);

  const preview = async (sound: SoundType) => {
    await unlockAudio();
    notifyPlatformChanged();
    const handle = playSound(sound, {
      volume: state.alarmDefaults.volumeLevel,
      gradual: false,
      loop: false,
    });
    setPreviewing(sound);
    setTimeout(() => {
      handle.stop();
      setPreviewing(null);
    }, 3500);
  };

  return (
    <StepFrame
      eyebrow="Step 4"
      title="Choose your alarm sound"
      lede="This becomes the default for every prayer. You can give any prayer a different sound later."
      footer={
        <>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {SOUND_CHOICES.map((sound) => {
          const active = state.alarmDefaults.soundType === sound;
          return (
            <div
              key={sound}
              className={cx(
                "flex items-center gap-3 rounded-[var(--radius)] border px-4 py-3 transition-colors",
                active
                  ? "border-[var(--dawn)] bg-[color-mix(in_oklab,var(--dawn)_8%,transparent)]"
                  : "border-[var(--line-soft)] bg-[var(--night-2)]",
              )}
            >
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => {
                  setAlarmDefaults({ soundType: sound });
                  for (const p of ALARMABLE_PRAYERS) {
                    updateAlarm(p, { soundType: sound });
                  }
                }}
              >
                <div className="text-[0.95rem]">{SOUND_LABELS[sound]}</div>
                <div className="mt-0.5 text-[0.78rem] leading-relaxed text-[var(--muted)]">
                  {SOUND_DESCRIPTIONS[sound]}
                </div>
              </button>

              {sound !== "silent" && sound !== "vibrateOnly" && (
                <button
                  type="button"
                  className="btn shrink-0 px-3 py-1.5 text-[0.78rem]"
                  onClick={() => preview(sound)}
                >
                  {previewing === sound ? "Playing…" : "Preview"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[0.78rem] leading-relaxed text-[var(--faint)]">
        These tones are generated by the app itself, so no recording is
        licensed or shipped. To use a real adhan recitation, add your own audio
        file in Settings.
      </p>
    </StepFrame>
  );
}

/* ---------------------------------------------------------------- */

function ReadyStep({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  const perm = useNotificationPermission();
  const audioReady = useAudioUnlocked();
  const [tested, setTested] = useState(false);
  const standalone = useStandalone();

  return (
    <StepFrame
      eyebrow="Step 5"
      title="Make sure it will ring"
      lede="An alarm is only worth setting if it actually goes off. Two permissions and one test."
      footer={
        <>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={onFinish}>
            Finish setup
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <CheckCard
          done={perm === "granted"}
          title="Allow notifications"
          body={
            perm === "granted"
              ? "Allowed. Prayer alerts can appear outside the app."
              : perm === "denied"
                ? "Blocked. Re-allow notifications for this site in your browser settings."
                : "Lets an alert appear when the app is in the background."
          }
          action={
            perm === "granted" || perm === "denied"
              ? null
              : {
                  label: "Allow",
                  onClick: async () => {
                    await requestNotificationPermission();
                    notifyPlatformChanged();
                  },
                }
          }
        />

        <CheckCard
          done={audioReady}
          title="Turn on sound"
          body={
            audioReady
              ? "Sound is unlocked and will play."
              : "Browsers keep audio muted until you tap once. This does it."
          }
          action={
            audioReady
              ? null
              : {
                  label: "Unlock",
                  onClick: async () => {
                    await unlockAudio();
                    notifyPlatformChanged();
                  },
                }
          }
        />

        <CheckCard
          done={tested}
          title="Test the alarm"
          body={
            tested
              ? "Test fired. Your real schedule was not changed."
              : "Rings a short sample now, without touching your schedule."
          }
          action={{
            label: tested ? "Test again" : "Test alarm",
            onClick: async () => {
              await unlockAudio();
              notifyPlatformChanged();
              alarmRuntime.startTestAlarm();
              setTested(true);
            },
          }}
        />
      </div>

      <div className="mt-5 rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--night-2)] px-4 py-3">
        <p className="text-[0.82rem] font-medium text-[var(--ink-2)]">
          One honest limitation
        </p>
        <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[var(--muted)]">
          {standalone
            ? "This is running as an installed app, which is the most reliable setup a web app can offer. It cannot ring after the device restarts or once the app is fully closed."
            : "In a browser tab, an alarm can only ring while the tab is open. Install this to your home screen and keep it running for the best chance — the Reliability screen shows how."}
        </p>
      </div>
    </StepFrame>
  );
}

function CheckCard({
  done,
  title,
  body,
  action,
}: {
  done: boolean;
  title: string;
  body: string;
  action: { label: string; onClick: () => void } | null;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3.5",
        done
          ? "border-[color-mix(in_oklab,var(--ok)_40%,transparent)] bg-[color-mix(in_oklab,var(--ok)_7%,transparent)]"
          : "border-[var(--line-soft)] bg-[var(--night-2)]",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem]",
          done
            ? "bg-[var(--ok)] text-[#06120d]"
            : "border border-[var(--line)] text-[var(--faint)]",
        )}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.92rem]">{title}</div>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-[var(--muted)]">
          {body}
        </p>
      </div>
      {action && (
        <button
          type="button"
          className="btn shrink-0 px-3 py-1.5 text-[0.78rem]"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
