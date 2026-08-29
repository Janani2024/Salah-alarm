# Salah Alarm

A prayer alarm clock. It calculates local prayer times on the device and turns
them into real alarms — snooze, dismiss, per-prayer sound and volume — that
follow the times as they shift each day.

Built from `muslim_prayer_alarm_end_to_end_functional_spec.md`. The spec
targets native Android first; this is the **Next.js implementation** of that
same MVP scope (§40).

## The honest limitation, up front

Spec §14 says: *"Never claim guaranteed delivery when the operating system
cannot guarantee it."* On the web that rule bites hard.

There is no web equivalent of Android's `AlarmManager`, and the Notification
Triggers API has not shipped in any browser. **An alarm can therefore only ring
from a running page.** Concretely:

| Situation | Will it ring? |
|---|---|
| App open, screen on | Yes, to the second |
| App open, screen off / phone locked | Usually — a wake lock is held while ringing |
| Installed to home screen, backgrounded | Usually, but the OS may suspend it |
| Browser tab closed | **No** |
| Device restarted | **No** |

The Reliability Center says exactly this to the user rather than reassuring
them, and the report is capped at "Limited" even when every other check passes
— there is a test asserting it can never show green.

If ringing-while-closed is a hard requirement, the native Android build the
spec originally describes is the only way to get it.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build && npm start
npm test             # 56 unit tests
npm run typecheck
npm run lint
```

`npm run screenshots` captures every screen for design review. It drives the
Edge/Chrome already installed on the machine (no browser download) against a
server running on port 3123: `npm start -- -p 3123`.

## What's implemented

**Prayer engine** (§7) — Solar position from the standard low-precision
almanac model. 14 calculation methods, Shafi'i/Hanafi Asr, four high-latitude
rules, per-prayer manual offsets. Everything goes through a
`PrayerCalculationProvider` interface so mosque timetables (§21) can be added
without touching the alarm engine.

**Alarm engine** (§8–§13) — Rolling 3-day schedule, reconciled on every app
open, settings change, clock jump and time-zone change. Trigger modes
(at/before/after prayer), snooze with a maximum, auto-dismiss, pre-prayer
reminders, Fajr wake-up challenges (§12).

**Reliability** (§14, §28) — A checklist with green/yellow/red status, a test
alarm that never touches the real schedule, and a "Why didn't my alarm ring?"
diagnostic walkthrough.

**Privacy** (§34) — No account, no backend, no network calls. Prayer times are
computed locally; the city search runs against a bundled list; GPS coordinates
are rounded to ~100 m before being stored; everything is deletable.

**Audio** (§17.2) — Every built-in sound is *synthesised at runtime* with the
Web Audio API, so no recording is bundled and nothing can infringe a
muadhdhin's or publisher's rights. The "Adhan" option is a maqam-Hijaz-flavoured
tone sequence, presented as a synthesised tone rather than a real call to
prayer.

## Not built

Deliberately out of MVP scope per §40: mosque timetables (§21), home widgets
(§24), monthly calendar export (§26), custom audio import (§17.3), backend and
remote config (§33, §45), and any analytics that leaves the device (§36 — the
event log is local-only).

## Layout

```
src/lib/prayer/      solar astronomy, method registry, provider abstraction
src/lib/alarm/       schedule maths, runtime, audio, reliability, notifications
src/lib/time/        time-zone arithmetic, formatting, Hijri dates
src/lib/location/    geolocation, bundled city list
src/lib/store/       local-first persisted state
src/components/      UI, including the horizon arc and the ringing screen
src/app/             routes
```

The scheduling maths in `src/lib/alarm/schedule.ts` is deliberately free of
timers, storage and DOM so it can be tested exhaustively — it is the code that
decides whether someone wakes up for Fajr.

## Design

The interface is built around the sun, because every time in the app *is* a
solar altitude: Fajr is the sun 18° below the horizon, Maghrib is sunset, Asr
is a shadow ratio. The dashboard leads with a **horizon arc** — the real
altitude curve for the day, with each prayer marked at the sun position that
defines it. It makes the daily drift in the times self-explanatory.

Palette is the pre-dawn sky (`#0B1020` night through to `#E8A33D` dawn amber,
the single accent and the colour of a ringing alarm). Instrument Serif carries
the prayer names; IBM Plex Mono carries every time and countdown so the digits
never jitter as seconds tick.
