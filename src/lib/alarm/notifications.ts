/**
 * Notification delivery (spec §22, §29).
 *
 * Notifications are a *supplement* to the in-page alarm, never the mechanism
 * the app relies on: the Notification Triggers API (which would allow a
 * genuinely scheduled, app-closed notification) is not available in any
 * shipping browser, so everything here fires from the running page.
 */

export type NotificationCategory =
  | "prayerAlarm"
  | "preAlert"
  | "scheduleUpdate"
  | "locationChange"
  | "reliability";

export type PermissionState = "granted" | "denied" | "default" | "unsupported";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): PermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission as PermissionState;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return (await Notification.requestPermission()) as PermissionState;
  } catch {
    return "denied";
  }
}

interface ShowOptions {
  title: string;
  body: string;
  category: NotificationCategory;
  /** Replaces any earlier notification with the same tag. */
  tag?: string;
  /** Keep on screen until dismissed — used for the ringing alarm. */
  requireInteraction?: boolean;
  /** Suppress the OS notification sound; the page plays the real alarm. */
  silent?: boolean;
}

/**
 * Show a notification, preferring the service-worker registration so that
 * the notification survives the page being backgrounded on Android.
 */
export async function showNotification(options: ShowOptions): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;

  const init: NotificationOptions = {
    body: options.body,
    tag: options.tag ?? options.category,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    requireInteraction: options.requireInteraction ?? false,
    silent: options.silent ?? true,
    data: { category: options.category, url: "/" },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(options.title, init);
        return true;
      }
    }
    new Notification(options.title, init);
    return true;
  } catch {
    return false;
  }
}

export async function closeNotifications(tag: string): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const open = await reg.getNotifications({ tag });
    for (const n of open) n.close();
  } catch {
    /* nothing useful to do */
  }
}
