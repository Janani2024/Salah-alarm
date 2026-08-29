"use client";

import { useMemo } from "react";

import {
  darcsin,
  dcos,
  dsin,
  julianDay,
  sunPosition,
} from "@/lib/prayer/astronomy";
import { PRAYER_LABELS, type PrayerDay } from "@/lib/prayer/types";
import { parseDateKey } from "@/lib/time/timezone";

/**
 * The horizon arc — the app's signature.
 *
 * Every prayer time is defined by where the sun sits relative to the horizon:
 * Fajr at 18° below, sunrise at the horizon itself, Maghrib at sunset, Isha
 * back below. So rather than illustrate the day with a decorative graphic,
 * this plots the sun's *actual altitude* across the 24 hours and marks each
 * prayer at its true position on that curve.
 *
 * It makes the whole product legible at a glance: why the times move through
 * the year, why Fajr and Isha crowd together in a northern summer, and where
 * "now" sits in the day.
 */

const W = 720;
const H = 190;
const PAD_X = 18;

/** Altitudes shown, in degrees. Clamped so polar days stay on-canvas. */
const ALT_MAX = 62;
const ALT_MIN = -34;

/** Solar altitude in degrees at a given hour of the day. */
function altitudeAt(
  jd: number,
  latitude: number,
  longitude: number,
  utcOffsetMinutes: number,
  hourOfDay: number,
): number {
  // Convert wall-clock hour to a UT day fraction for the sun model.
  const utHours = hourOfDay - utcOffsetMinutes / 60;
  const { declination, equation } = sunPosition(jd + utHours / 24);

  // Hour angle: 15° per hour from local apparent noon.
  const solarTime = utHours + longitude / 15 + equation;
  const hourAngle = 15 * (solarTime - 12);

  const sinAlt =
    dsin(latitude) * dsin(declination) +
    dcos(latitude) * dcos(declination) * dcos(hourAngle);
  return darcsin(Math.max(-1, Math.min(1, sinAlt)));
}

const xFor = (hour: number) => PAD_X + (hour / 24) * (W - PAD_X * 2);

const yFor = (altitude: number) => {
  const clamped = Math.max(ALT_MIN, Math.min(ALT_MAX, altitude));
  return H - ((clamped - ALT_MIN) / (ALT_MAX - ALT_MIN)) * H;
};

export interface HorizonArcProps {
  day: PrayerDay;
  /** Current instant, for the "now" marker. */
  now: number;
  /** Which prayer to highlight. */
  activePrayer?: string | null;
  className?: string;
}

export function HorizonArc({
  day,
  now,
  activePrayer,
  className,
}: HorizonArcProps) {
  const { curve, horizonY, twilightY, marks, nowX, nowY, nowAbove } =
    useMemo(() => {
      const { year, month, day: d } = parseDateKey(day.dateKey);
      const jd = julianDay(year, month, d);
      const { latitude, longitude, utcOffsetMinutes } = day.meta;

      const points: string[] = [];
      const STEPS = 144; // every 10 minutes
      for (let i = 0; i <= STEPS; i += 1) {
        const hour = (i / STEPS) * 24;
        const alt = altitudeAt(jd, latitude, longitude, utcOffsetMinutes, hour);
        points.push(`${xFor(hour).toFixed(1)},${yFor(alt).toFixed(1)}`);
      }

      // Where each prayer sits on the curve.
      const dayStart = day.times.dhuhr.timestamp - day.times.dhuhr.hours * 3600_000;
      const marks = day.ordered.map((t) => {
        const hour = (t.timestamp - dayStart) / 3600_000;
        const alt = altitudeAt(jd, latitude, longitude, utcOffsetMinutes, hour);
        return {
          prayerType: t.prayerType,
          label: PRAYER_LABELS[t.prayerType],
          x: xFor(Math.max(0, Math.min(24, hour))),
          y: yFor(alt),
          estimated: t.estimated,
        };
      });

      const nowHour = (now - dayStart) / 3600_000;
      const inRange = nowHour >= 0 && nowHour <= 24;
      const nowAlt = inRange
        ? altitudeAt(jd, latitude, longitude, utcOffsetMinutes, nowHour)
        : 0;

      return {
        curve: `M ${points.join(" L ")}`,
        horizonY: yFor(0),
        twilightY: yFor(-18),
        marks,
        nowX: inRange ? xFor(nowHour) : null,
        nowY: inRange ? yFor(nowAlt) : null,
        nowAbove: nowAlt > 0,
      };
    }, [day, now]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`The sun's height through ${day.dateKey}, with each prayer marked at the sun position that defines it.`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="ha-day" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--dawn)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--dawn)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="ha-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sky)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--sky)" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id="ha-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--sky)" />
          <stop offset="26%" stopColor="var(--dawn)" />
          <stop offset="74%" stopColor="var(--dawn)" />
          <stop offset="100%" stopColor="var(--sky)" />
        </linearGradient>
        <clipPath id="ha-above">
          <rect x="0" y="0" width={W} height={horizonY} />
        </clipPath>
        <clipPath id="ha-below">
          <rect x="0" y={horizonY} width={W} height={H - horizonY} />
        </clipPath>
      </defs>

      {/* Astronomical-twilight band: the zone Fajr and Isha live in. */}
      <rect
        x="0"
        y={horizonY}
        width={W}
        height={Math.max(0, twilightY - horizonY)}
        fill="url(#ha-night)"
      />

      {/* Daylight fill above the horizon. */}
      <path
        d={`${curve} L ${xFor(24)},${horizonY} L ${xFor(0)},${horizonY} Z`}
        fill="url(#ha-day)"
        clipPath="url(#ha-above)"
      />

      {/* The horizon itself. */}
      <line
        x1="0"
        y1={horizonY}
        x2={W}
        y2={horizonY}
        stroke="var(--horizon)"
        strokeWidth="1.25"
      />
      <line
        x1="0"
        y1={twilightY}
        x2={W}
        y2={twilightY}
        stroke="var(--line)"
        strokeWidth="1"
        strokeDasharray="3 6"
      />

      {/* The sun's path. */}
      <path
        d={curve}
        fill="none"
        stroke="url(#ha-stroke)"
        strokeWidth="2"
        strokeLinecap="round"
        clipPath="url(#ha-above)"
      />
      <path
        d={curve}
        fill="none"
        stroke="var(--faint)"
        strokeWidth="1.5"
        strokeLinecap="round"
        clipPath="url(#ha-below)"
      />

      {/* Prayer markers. */}
      {marks.map((m) => {
        const active = m.prayerType === activePrayer;
        const isSunrise = m.prayerType === "sunrise";
        return (
          <g key={m.prayerType}>
            <line
              x1={m.x}
              y1={m.y}
              x2={m.x}
              y2={H}
              stroke={active ? "var(--dawn)" : "var(--line)"}
              strokeWidth={active ? 1.5 : 1}
              strokeOpacity={active ? 0.6 : 0.45}
            />
            <circle
              cx={m.x}
              cy={m.y}
              r={active ? 6 : 4}
              fill={
                isSunrise
                  ? "var(--bg)"
                  : active
                    ? "var(--dawn)"
                    : "var(--surface-solid)"
              }
              stroke={active ? "var(--dawn)" : "var(--muted)"}
              strokeWidth="1.5"
            />
            <text
              x={m.x}
              y={H - 6}
              textAnchor="middle"
              fill={active ? "var(--dawn)" : "var(--faint)"}
              fontSize="15"
              fontFamily="var(--font-mono)"
              letterSpacing="0.06em"
            >
              {m.label.slice(0, 3).toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Now. */}
      {nowX !== null && nowY !== null && (
        <g>
          <line
            x1={nowX}
            y1="0"
            x2={nowX}
            y2={H}
            stroke="var(--ink)"
            strokeWidth="1"
            strokeOpacity="0.25"
          />
          <circle
            cx={nowX}
            cy={nowY}
            r="7"
            fill={nowAbove ? "var(--dawn)" : "var(--sky)"}
            fillOpacity="0.25"
          />
          <circle
            cx={nowX}
            cy={nowY}
            r="3.5"
            fill={nowAbove ? "var(--dawn)" : "var(--sky)"}
          />
        </g>
      )}
    </svg>
  );
}
