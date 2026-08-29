/**
 * Web app manifest. Installing to the home screen is the single biggest
 * reliability improvement available to a web alarm (spec §14), so the app
 * is installable from the first load.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    name: "Salah Alarm",
    short_name: "Salah",
    description:
      "Prayer times that automatically become alarms, with snooze, dismiss and per-prayer settings.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    categories: ["lifestyle", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      { name: "Alarms", url: "/alarms" },
      { name: "Reliability", url: "/reliability" },
    ],
  });
}
