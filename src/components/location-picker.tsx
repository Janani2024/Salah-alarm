"use client";

import { useMemo, useState } from "react";

import {
  isMeaningfulMove,
  requestLocation,
  type GeoError,
} from "@/lib/location/geolocation";
import { searchCities, type City } from "@/lib/location/cities";
import { suggestMethodForTimeZone } from "@/lib/prayer/methods";
import { setCalculation, setLocation, useAppState } from "@/lib/store/app-store";
import { describeTimeZone } from "@/lib/time/timezone";
import { Notice, Segmented, cx } from "./ui";

/**
 * Location selection (spec §19.1, §19.2).
 *
 * Manual city search runs entirely against the bundled list — no request is
 * made, so a search never reveals where the user is looking (spec §19.4).
 */
export function LocationPicker({ compact }: { compact?: boolean } = {}) {
  const state = useAppState();
  // Which panel is showing. Seeded from the saved mode, then owned by the
  // user — switching panels is a view change, not a settings change, and it
  // must not be yanked back when the store updates.
  const [mode, setMode] = useState<"auto" | "manual">(state.location.mode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GeoError | null>(null);
  const [query, setQuery] = useState("");
  const [moved, setMoved] = useState<string | null>(null);

  const results = useMemo(() => searchCities(query), [query]);

  const useDeviceLocation = async () => {
    setBusy(true);
    setError(null);
    const result = await requestLocation();
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      // Falling back to manual is the useful next move (spec §29).
      setMode("manual");
      return;
    }

    const { fix } = result;
    // Spec §19.3: tell the user when travel actually moved their times.
    if (
      state.location.resolved &&
      isMeaningfulMove(
        state.location.latitude,
        state.location.longitude,
        fix.latitude,
        fix.longitude,
      )
    ) {
      setMoved(`Location changed to ${fix.label}. Your prayer alarms were updated.`);
    }

    setLocation({
      mode: "auto",
      latitude: fix.latitude,
      longitude: fix.longitude,
      timeZone: fix.timeZone,
      label: fix.label,
      accuracyMetres: fix.accuracyMetres,
      resolved: true,
    });
    setMode("auto");
  };

  const chooseCity = (city: City) => {
    setLocation({
      mode: "manual",
      latitude: city.latitude,
      longitude: city.longitude,
      timeZone: city.timeZone,
      label: `${city.name}, ${city.country}`,
      accuracyMetres: null,
      resolved: true,
    });
    // Adopt the method conventional for that region, unless already chosen.
    if (!state.onboarded) {
      setCalculation({ methodId: suggestMethodForTimeZone(city.timeZone) });
    }
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-4">
      {moved && (
        <Notice tone="info" onDismiss={() => setMoved(null)}>
          {moved}
        </Notice>
      )}

      {state.location.resolved && (
        <div className="rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--night-2)] px-4 py-3">
          <p className="eyebrow">Current location</p>
          <p className="mt-1.5 text-[1.05rem]">{state.location.label}</p>
          <p className="tnum mt-1 text-[0.75rem] text-[var(--faint)]">
            {state.location.latitude.toFixed(3)}, {state.location.longitude.toFixed(3)}
            {" · "}
            {describeTimeZone(state.location.timeZone)}
          </p>
        </div>
      )}

      <Segmented<"auto" | "manual">
        label="How to set location"
        value={mode}
        onChange={setMode}
        options={[
          { value: "auto", label: "Use my device" },
          { value: "manual", label: "Choose a city" },
        ]}
      />

      {mode === "auto" ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={useDeviceLocation}
            disabled={busy}
          >
            {busy ? "Finding you…" : "Use my current location"}
          </button>
          {error && (
            <Notice tone="warn">
              {error.message}
              {error.kind === "denied" && (
                <>
                  {" "}
                  Choose a city below instead — prayer times will be just as
                  accurate.
                </>
              )}
            </Notice>
          )}
          {!compact && (
            <p className="text-[0.78rem] leading-relaxed text-[var(--faint)]">
              Your position is rounded to about 100 metres before it is saved,
              and it never leaves this device.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="search"
            className="field"
            placeholder="Search for a city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search for a city"
            autoComplete="off"
          />

          {query.length > 0 && results.length === 0 && (
            <p className="px-1 py-3 text-sm text-[var(--muted)]">
              No city matches “{query}”. Try a nearby larger city — prayer times
              change by about a minute every 25 km.
            </p>
          )}

          {results.length > 0 && (
            <ul className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--line-soft)]">
              {results.map((city) => {
                const active =
                  state.location.label === `${city.name}, ${city.country}`;
                return (
                  <li key={`${city.name}-${city.countryCode}`}>
                    <button
                      type="button"
                      onClick={() => chooseCity(city)}
                      className={cx(
                        "flex w-full items-baseline justify-between gap-3 border-b border-[var(--line-soft)] px-4 py-3 text-left transition-colors last:border-b-0",
                        active
                          ? "bg-[color-mix(in_oklab,var(--dawn)_10%,transparent)]"
                          : "bg-[var(--night-2)] hover:bg-[var(--night-3)]",
                      )}
                    >
                      <span className="text-[0.95rem]">{city.name}</span>
                      <span className="text-[0.78rem] text-[var(--muted)]">
                        {city.country}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
