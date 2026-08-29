"use client";

import { useSyncExternalStore } from "react";

import { isAudioUnlocked } from "./alarm/audio";
import {
  notificationPermission,
  type PermissionState,
} from "./alarm/notifications";

/**
 * Hooks that read platform state.
 *
 * Each one goes through `useSyncExternalStore` so the value is read outside
 * render, stays hydration-safe (the server snapshot is always the
 * conservative answer), and updates when the platform changes.
 */

const noopSubscribe = () => () => {};

/** True when running as an installed PWA rather than in a browser tab. */
export function useStandalone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(display-mode: standalone)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari predates the display-mode media query.
        (window.navigator as { standalone?: boolean }).standalone === true),
    () => false,
  );
}

/** Whether the document is currently visible. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => (typeof document === "undefined" ? true : !document.hidden),
    () => true,
  );
}

/**
 * Notification permission and audio-unlock state.
 *
 * Neither fires an event when it changes, so both are versioned manually:
 * call {@link notifyPlatformChanged} after requesting a permission or
 * unlocking audio and every subscriber re-reads.
 */
const platformListeners = new Set<() => void>();

function subscribePlatform(listener: () => void): () => void {
  platformListeners.add(listener);
  return () => {
    platformListeners.delete(listener);
  };
}

export function notifyPlatformChanged(): void {
  for (const l of platformListeners) l();
}

export function useNotificationPermission(): PermissionState {
  return useSyncExternalStore(
    subscribePlatform,
    notificationPermission,
    () => "default" as PermissionState,
  );
}

export function useAudioUnlocked(): boolean {
  return useSyncExternalStore(subscribePlatform, isAudioUnlocked, () => false);
}

/** Whether this device can report motion, for the shake challenge. */
export function useDeviceMotionSupported(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "DeviceMotionEvent" in window,
    () => false,
  );
}

/**
 * A shared ticking clock.
 *
 * `getSnapshot` must return a cached value — returning `Date.now()` directly
 * would change on every call and send React into an endless re-render — so
 * the value is stored and refreshed only on each tick. One interval is shared
 * by every component using the same period.
 */
class Clock {
  private snapshot = Date.now();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly intervalMs: number) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.timer) {
      // Refresh immediately: the cached value may be stale if every
      // subscriber unmounted for a while.
      this.snapshot = Date.now();
      this.timer = setInterval(() => {
        this.snapshot = Date.now();
        for (const l of this.listeners) l();
      }, this.intervalMs);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): number => this.snapshot;
}

const CLOCKS = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = CLOCKS.get(intervalMs);
  if (!clock) {
    clock = new Clock(intervalMs);
    CLOCKS.set(intervalMs, clock);
  }
  return clock;
}

/** The current time, re-rendering the caller every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, serverNow);
}

// Server and hydration render both see 0; the real value lands right after.
// Callers are only mounted once the store has hydrated, so this is never
// user-visible.
const serverNow = () => 0;
