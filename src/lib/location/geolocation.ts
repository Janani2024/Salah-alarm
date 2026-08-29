/**
 * Device location (spec §19).
 *
 * Privacy (§19.4, §34): the fix never leaves the device. It is used locally
 * to compute prayer times, labelled from the bundled city list rather than a
 * reverse-geocoding request, and stored rounded to ~100 m.
 */

import { deviceTimeZone } from "../time/timezone";
import { distanceKm, nearestCity } from "./cities";

export type GeoErrorKind =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "insecure";

export interface GeoError {
  kind: GeoErrorKind;
  message: string;
}

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  timeZone: string;
  label: string;
}

export type GeoResult =
  | { ok: true; fix: GeoFix }
  | { ok: false; error: GeoError };

export function geolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/**
 * Geolocation requires a secure context. Surfacing this explicitly avoids the
 * silent failure the spec forbids in §29.
 */
export function secureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || window.location.hostname === "localhost";
}

/** Round to ~3 decimal places — about 100 m — before storing (spec §19.4). */
function coarsen(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export async function requestLocation(
  { timeoutMs = 15_000, highAccuracy = false } = {},
): Promise<GeoResult> {
  if (!geolocationSupported()) {
    return {
      ok: false,
      error: {
        kind: "unsupported",
        message: "This browser cannot provide your location. Choose a city instead.",
      },
    };
  }
  if (!secureContext()) {
    return {
      ok: false,
      error: {
        kind: "insecure",
        message:
          "Location needs a secure (HTTPS) connection. Choose a city instead.",
      },
    };
  }

  return new Promise<GeoResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = coarsen(position.coords.latitude);
        const longitude = coarsen(position.coords.longitude);
        const city = nearestCity(latitude, longitude);
        resolve({
          ok: true,
          fix: {
            latitude,
            longitude,
            accuracyMetres: Math.round(position.coords.accuracy ?? 0),
            timeZone: deviceTimeZone(),
            label: city ? `${city.name}, ${city.country}` : "Your location",
          },
        });
      },
      (error) => {
        const kind: GeoErrorKind =
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.TIMEOUT
              ? "timeout"
              : "unavailable";
        resolve({
          ok: false,
          error: { kind, message: messageFor(kind) },
        });
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        // A fix from the last 10 minutes is plenty precise for prayer times
        // and avoids waking the GPS radio (spec §34 low battery usage).
        maximumAge: 10 * 60_000,
      },
    );
  });
}

function messageFor(kind: GeoErrorKind): string {
  switch (kind) {
    case "denied":
      return "Location permission was denied. You can choose your city manually instead.";
    case "timeout":
      return "Finding your location took too long. Try again or choose a city.";
    case "unavailable":
      return "We couldn't access your location.";
    case "insecure":
      return "Location needs a secure (HTTPS) connection.";
    case "unsupported":
      return "This browser cannot provide your location.";
  }
}

/**
 * Distance beyond which prayer times shift enough to matter (spec §19.3).
 * ~25 km is roughly a one-minute change in Fajr at mid latitudes.
 */
export const MEANINGFUL_MOVE_KM = 25;

export function isMeaningfulMove(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): boolean {
  return distanceKm(fromLat, fromLon, toLat, toLon) >= MEANINGFUL_MOVE_KM;
}

/** Current permission state without triggering a prompt, where supported. */
export async function locationPermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions) return "unknown";
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}
