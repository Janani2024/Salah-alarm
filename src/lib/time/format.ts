/** Display formatting (spec §5.3, §6.1, §27 General → 12/24-hour format). */

export type TimeFormat = "12" | "24";

const CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, opts: Intl.DateTimeFormatOptions) {
  let f = CACHE.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, opts);
    CACHE.set(key, f);
  }
  return f;
}

/** e.g. "4:52 AM" or "04:52". */
export function formatTime(
  timestamp: number,
  timeZone: string,
  format: TimeFormat,
): string {
  if (!Number.isFinite(timestamp)) return "--:--";
  return formatter(`t:${timeZone}:${format}`, {
    timeZone,
    hour: format === "12" ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12: format === "12",
  }).format(new Date(timestamp));
}

/** e.g. "Friday, 15 June 2024". */
export function formatFullDate(timestamp: number, timeZone: string): string {
  return formatter(`d:${timeZone}`, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

/** e.g. "Sat 15 Jun". */
export function formatShortDate(timestamp: number, timeZone: string): string {
  return formatter(`sd:${timeZone}`, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}

/** e.g. "15 Jun, 4:52 AM". */
export function formatDateTime(
  timestamp: number,
  timeZone: string,
  format: TimeFormat,
): string {
  return `${formatShortDate(timestamp, timeZone)}, ${formatTime(
    timestamp,
    timeZone,
    format,
  )}`;
}

/** Zero-padded countdown, `HH:MM:SS`, clamped at zero. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}

/** Loose phrasing for a duration, e.g. "in 1 hr 27 min". */
export function formatRelative(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "in less than a minute";
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h} hr` : `in ${h} hr ${m} min`;
}

/** "3 minutes ago" / "just now". */
export function formatAgo(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 60_000) return "just now";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Signed minutes, e.g. "+3 min" / "−2 min" / "0". */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return "0 min";
  const sign = minutes > 0 ? "+" : "−";
  return `${sign}${Math.abs(minutes)} min`;
}
