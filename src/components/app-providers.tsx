"use client";

import { useEffect } from "react";

import { alarmRuntime } from "@/lib/alarm/runtime";
import { appStore, useAppState, useHydrated } from "@/lib/store/app-store";
import { AlarmRingScreen } from "./alarm-ring-screen";

/**
 * Boots the app: loads persisted state, starts the alarm runtime, applies the
 * theme, and registers the service worker.
 *
 * The ringing screen is mounted here rather than inside a route so that an
 * alarm can take over the display from anywhere in the app (spec §9.1).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();

  useEffect(() => {
    appStore.hydrate();
    alarmRuntime.start();
    return () => alarmRuntime.stop();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registration failure is not fatal — the app still runs, and the
    // Reliability Center reports the reduced capability.
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <>
      <ThemeSync />
      {hydrated ? children : <BootScreen />}
      <AlarmRingScreen />
    </>
  );
}

function ThemeSync() {
  const { display } = useAppState();

  useEffect(() => {
    const root = document.documentElement;
    if (display.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", display.theme);
  }, [display.theme]);

  return null;
}

/**
 * Shown for the moment between first paint and reading local storage. Kept
 * visually identical to the real header so nothing jumps.
 */
function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-[var(--dawn)] breathe" />
        <p className="eyebrow">Salah Alarm</p>
      </div>
    </div>
  );
}
