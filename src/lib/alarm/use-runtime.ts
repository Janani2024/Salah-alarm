"use client";

import { useSyncExternalStore } from "react";

import { alarmRuntime, type RuntimeSnapshot } from "./runtime";

/** Subscribe a component to the live alarm runtime. */
export function useRuntime(): RuntimeSnapshot {
  return useSyncExternalStore(
    alarmRuntime.subscribe,
    alarmRuntime.getSnapshot,
    alarmRuntime.getServerSnapshot,
  );
}
