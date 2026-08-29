/**
 * Alarm audio (spec §17, §18).
 *
 * LICENSING (spec §17.2): every built-in sound here is **synthesised at
 * runtime** with the Web Audio API. No recording is bundled, so nothing can
 * infringe a muadhdhin's or publisher's rights. The "Adhan" option is a
 * respectful maqam-flavoured tone sequence, presented in the UI as a
 * synthesised tone rather than a real call to prayer. Users who want an
 * actual recitation import their own file (§17.3).
 *
 * Browsers block audio until a user gesture, so {@link unlockAudio} must be
 * called from a click before any alarm can be heard — the reliability check
 * in §14 surfaces this to the user rather than letting it fail silently.
 */

import type { SoundType } from "./types";

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let unlocked = false;

function audioContext(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** True once audio has been unlocked by a user gesture. */
export function isAudioUnlocked(): boolean {
  return unlocked && ctx?.state === "running";
}

/**
 * Resume the audio context from within a user gesture. Returns whether audio
 * can now be played.
 */
export async function unlockAudio(): Promise<boolean> {
  const c = audioContext();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    // A zero-length silent buffer satisfies iOS's stricter unlock rule.
    const buffer = c.createBuffer(1, 1, c.sampleRate);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(0);
    unlocked = c.state === "running";
    return unlocked;
  } catch {
    return false;
  }
}

/** A playing sound that can be stopped. */
export interface SoundHandle {
  stop(): void;
  readonly soundType: SoundType;
}

const NOOP_HANDLE = (soundType: SoundType): SoundHandle => ({
  stop() {},
  soundType,
});

interface PlayOptions {
  /** 0–100. */
  volume: number;
  /** Ramp from silence to full over the first seconds (spec §18). */
  gradual: boolean;
  /** Keep repeating until stopped. */
  loop: boolean;
  /** Custom sound as an object URL, when the user imported one (§17.3). */
  customUrl?: string | null;
}

/* ------------------------------------------------------------------ */
/* Tone sequences                                                      */
/* ------------------------------------------------------------------ */

interface Note {
  /** Hz. */
  freq: number;
  /** Seconds from the start of the phrase. */
  at: number;
  /** Seconds. */
  duration: number;
  /** Relative loudness, 0–1. */
  gain?: number;
  type?: OscillatorType;
}

/**
 * A maqam-Hijaz-flavoured ascending phrase. Hijaz is the mode most associated
 * with the adhan; using its interval pattern makes the tone feel appropriate
 * without reproducing any recording.
 *
 * Degrees (from D4): D  E♭  F#  G  A  B♭  C  D
 */
const HIJAZ = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33];

const ADHAN_PHRASE: Note[] = [
  { freq: HIJAZ[0], at: 0.0, duration: 0.9, gain: 0.9 },
  { freq: HIJAZ[3], at: 0.85, duration: 0.7 },
  { freq: HIJAZ[4], at: 1.5, duration: 1.1, gain: 1 },
  { freq: HIJAZ[3], at: 2.5, duration: 0.5 },
  { freq: HIJAZ[2], at: 2.95, duration: 0.5 },
  { freq: HIJAZ[1], at: 3.4, duration: 0.6 },
  { freq: HIJAZ[0], at: 3.95, duration: 1.4, gain: 0.85 },
];
const ADHAN_LENGTH = 6.0;

const STANDARD_PHRASE: Note[] = [
  { freq: 880, at: 0.0, duration: 0.18, type: "square", gain: 0.5 },
  { freq: 660, at: 0.22, duration: 0.18, type: "square", gain: 0.5 },
  { freq: 880, at: 0.44, duration: 0.18, type: "square", gain: 0.5 },
  { freq: 660, at: 0.66, duration: 0.18, type: "square", gain: 0.5 },
];
const STANDARD_LENGTH = 1.3;

const GENTLE_PHRASE: Note[] = [
  { freq: 523.25, at: 0.0, duration: 1.2, gain: 0.55 },
  { freq: 659.25, at: 0.5, duration: 1.2, gain: 0.45 },
  { freq: 783.99, at: 1.0, duration: 1.6, gain: 0.4 },
];
const GENTLE_LENGTH = 3.4;

const CHIME_PHRASE: Note[] = [
  { freq: 987.77, at: 0.0, duration: 0.5, gain: 0.6 },
  { freq: 1318.51, at: 0.12, duration: 0.7, gain: 0.35 },
];
const CHIME_LENGTH = 1.0;

interface Voice {
  phrase: Note[];
  length: number;
  loop: boolean;
}

function voiceFor(soundType: SoundType, loop: boolean): Voice | null {
  switch (soundType) {
    case "adhan":
      return { phrase: ADHAN_PHRASE, length: ADHAN_LENGTH, loop };
    case "standardAlarm":
      return { phrase: STANDARD_PHRASE, length: STANDARD_LENGTH, loop };
    case "gentleAlarm":
      return { phrase: GENTLE_PHRASE, length: GENTLE_LENGTH, loop };
    case "shortChime":
      return { phrase: CHIME_PHRASE, length: CHIME_LENGTH, loop: false };
    case "vibrateOnly":
    case "silent":
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

/** How long the gradual ramp takes to reach full volume (spec §18). */
const RAMP_SECONDS = 20;

export function playSound(
  soundType: SoundType,
  options: PlayOptions,
): SoundHandle {
  if (soundType === "silent" || soundType === "vibrateOnly") {
    return NOOP_HANDLE(soundType);
  }

  if (options.customUrl) {
    return playCustom(options);
  }

  const c = audioContext();
  const voice = voiceFor(soundType, options.loop);
  if (!c || !voice) return NOOP_HANDLE(soundType);

  const target = Math.max(0, Math.min(1, options.volume / 100));

  const master = c.createGain();
  master.connect(c.destination);

  const now = c.currentTime;
  if (options.gradual) {
    // Start audible but quiet — an alarm that begins at true silence reads as
    // broken. 15% of target, rising to full.
    master.gain.setValueAtTime(target * 0.15, now);
    master.gain.linearRampToValueAtTime(target, now + RAMP_SECONDS);
  } else {
    master.gain.setValueAtTime(target, now);
  }

  const scheduled: OscillatorNode[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const emitPhrase = (startAt: number) => {
    if (stopped) return;
    for (const note of voice.phrase) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = note.type ?? "sine";
      osc.frequency.setValueAtTime(note.freq, startAt + note.at);

      const peak = note.gain ?? 0.7;
      const t0 = startAt + note.at;
      const t1 = t0 + note.duration;
      // Short attack / long decay avoids the click of a hard gate.
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.04);
      gain.gain.setValueAtTime(peak, Math.max(t0 + 0.04, t1 - 0.25));
      gain.gain.linearRampToValueAtTime(0, t1);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.05);
      scheduled.push(osc);
    }
  };

  emitPhrase(now);

  if (voice.loop) {
    // Re-arm slightly ahead of each repeat so there is no audible seam.
    timer = setInterval(() => {
      if (stopped) return;
      emitPhrase(c.currentTime + 0.05);
    }, voice.length * 1000);
  }

  return {
    soundType,
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      const t = c.currentTime;
      try {
        // Fade out over 120ms rather than cutting, which clicks.
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.12);
      } catch {
        /* context may already be closed */
      }
      for (const osc of scheduled) {
        try {
          osc.stop(t + 0.13);
        } catch {
          /* already stopped */
        }
      }
      setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          /* already disconnected */
        }
      }, 200);
    },
  };
}

function playCustom(options: PlayOptions): SoundHandle {
  const el = new Audio(options.customUrl!);
  el.loop = options.loop;
  const target = Math.max(0, Math.min(1, options.volume / 100));
  el.volume = options.gradual ? target * 0.15 : target;

  let ramp: ReturnType<typeof setInterval> | null = null;
  if (options.gradual) {
    const steps = RAMP_SECONDS * 4;
    let i = 0;
    ramp = setInterval(() => {
      i += 1;
      el.volume = Math.min(target, target * (0.15 + (0.85 * i) / steps));
      if (i >= steps && ramp) clearInterval(ramp);
    }, 250);
  }

  void el.play().catch(() => {
    /* blocked by autoplay policy; reliability check reports this */
  });

  return {
    soundType: "adhan",
    stop() {
      if (ramp) clearInterval(ramp);
      el.pause();
      el.currentTime = 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Vibration                                                           */
/* ------------------------------------------------------------------ */

export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

const ALARM_VIBRATION: number[] = [500, 300, 500, 300, 500, 1200];

let vibrationTimer: ReturnType<typeof setInterval> | null = null;

export function startVibration(): void {
  if (!vibrationSupported()) return;
  const total = ALARM_VIBRATION.reduce((a, b) => a + b, 0);
  const fire = () => navigator.vibrate(ALARM_VIBRATION);
  fire();
  vibrationTimer = setInterval(fire, total);
}

export function stopVibration(): void {
  if (vibrationTimer) {
    clearInterval(vibrationTimer);
    vibrationTimer = null;
  }
  if (vibrationSupported()) navigator.vibrate(0);
}

/** Short confirmation buzz, e.g. on snooze. */
export function pulse(pattern: number | number[] = 40): void {
  if (vibrationSupported()) navigator.vibrate(pattern);
}
