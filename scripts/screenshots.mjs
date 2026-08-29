import { chromium } from "playwright";

const BASE = "http://localhost:3123";
const OUT = "screenshots";

// Seed a fully-configured app so screens show real data, not empty states.
const SEED = {
  version: 1,
  onboarded: true,
  location: {
    mode: "manual",
    latitude: 13.083,
    longitude: 80.271,
    timeZone: "Asia/Kolkata",
    label: "Chennai, India",
    accuracyMetres: null,
    elevation: 0,
    updatedAt: Date.now(),
    resolved: true,
  },
  calculation: {
    methodId: "KARACHI",
    asrMethod: "standard",
    highLatitudeRule: "middleOfNight",
    offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  },
  display: { timeFormat: "12", theme: "system", showHijri: true, hijriOffset: 0 },
  privacy: { analyticsEnabled: true },
};

// Uses the Edge/Chrome already installed on the machine, so no browser
// download is needed. Requires `npm start` running on port 3123.
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge" });

async function shoot(name, path, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: opts.colorScheme ?? "dark",
    timezoneId: "Asia/Kolkata",
    locale: "en-GB",
  });
  await ctx.addInitScript((seed) => {
    localStorage.setItem("salah-alarm.state.v1", JSON.stringify(seed));
  }, opts.seed === null ? {} : SEED);

  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  if (opts.act) await opts.act(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false });
  console.log(`${name.padEnd(22)} ${errors.length ? "ERRORS: " + errors.join(" | ") : "clean"}`);
  await ctx.close();
}

await shoot("01-dashboard", "/");
await shoot("02-onboarding", "/onboarding", { seed: null });
await shoot("03-alarms", "/alarms");
await shoot("04-alarm-editor", "/alarms/fajr", { full: true });
await shoot("05-reliability", "/reliability", { full: true });
await shoot("06-settings", "/settings", { full: true });
await shoot("07-dashboard-light", "/", { colorScheme: "light" });
await shoot("08-mobile", "/", { viewport: { width: 390, height: 844 } });
await shoot("09-ring", "/", {
  viewport: { width: 390, height: 844 },
  act: async (page) => {
    // The dashboard's status card and the header both expose a test action;
    // take the first that is actually visible at this viewport.
    const button = page.getByRole("button", { name: /test alarm/i }).first();
    await button.waitFor({ state: "visible", timeout: 15000 });
    await button.click();
    await page.waitForTimeout(1500);
  },
});
await shoot("10-diagnostics", "/diagnostics", { full: true });

await browser.close();
