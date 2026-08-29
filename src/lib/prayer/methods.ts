/**
 * Calculation-method registry (spec §7.3, §20).
 *
 * The engine never hard-codes a method — callers reference one by id and the
 * active method is always surfaced in Settings and Diagnostics.
 */

import type { HighLatitudeRule, TwilightParam } from "./types";

export interface CalculationMethod {
  id: string;
  name: string;
  /** Short note on who publishes/uses it, shown under the picker. */
  description: string;
  fajr: TwilightParam;
  isha: TwilightParam;
  /** Most methods take Maghrib at sunset (0 min). Shia methods use an angle. */
  maghrib: TwilightParam;
  /** Minutes added to solar noon for Dhuhr. */
  dhuhrMinutes: number;
  /** Suggested high-latitude rule when this method is chosen. */
  defaultHighLatitudeRule: HighLatitudeRule;
  /** Rough ISO-3166 regions this method is conventionally used in. */
  regions: string[];
}

const angle = (degrees: number): TwilightParam => ({ kind: "angle", degrees });
const minutes = (m: number): TwilightParam => ({ kind: "minutes", minutes: m });

export const CALCULATION_METHODS: CalculationMethod[] = [
  {
    id: "MWL",
    name: "Muslim World League",
    description: "Widely used across Europe, the Far East and parts of the US.",
    fajr: angle(18),
    isha: angle(17),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["GB", "FR", "DE", "NL", "BE", "SE", "NO", "DK", "IT", "ES"],
  },
  {
    id: "ISNA",
    name: "Islamic Society of North America",
    description: "Standard across North America.",
    fajr: angle(15),
    isha: angle(15),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["US", "CA", "MX"],
  },
  {
    id: "EGYPT",
    name: "Egyptian General Authority of Survey",
    description: "Used in Egypt, Syria, Iraq, Lebanon, Malaysia and Africa.",
    fajr: angle(19.5),
    isha: angle(17.5),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["EG", "SY", "IQ", "LB", "MY", "SD", "LY", "DZ", "TN", "MA"],
  },
  {
    id: "KARACHI",
    name: "University of Islamic Sciences, Karachi",
    description: "Common in Pakistan, India, Bangladesh and Afghanistan.",
    fajr: angle(18),
    isha: angle(18),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["PK", "IN", "BD", "AF"],
  },
  {
    id: "UMM_AL_QURA",
    name: "Umm al-Qura University, Makkah",
    description:
      "Used in Saudi Arabia. Isha is a fixed 90 minutes after Maghrib.",
    fajr: angle(18.5),
    isha: minutes(90),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["SA"],
  },
  {
    id: "DUBAI",
    name: "Dubai (UAE)",
    description: "Official method of the United Arab Emirates.",
    fajr: angle(18.2),
    isha: angle(18.2),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["AE"],
  },
  {
    id: "QATAR",
    name: "Qatar",
    description: "Umm al-Qura variant with an 18° Fajr angle.",
    fajr: angle(18),
    isha: minutes(90),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["QA"],
  },
  {
    id: "KUWAIT",
    name: "Kuwait",
    description: "Official method of the State of Kuwait.",
    fajr: angle(18),
    isha: angle(17.5),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["KW"],
  },
  {
    id: "SINGAPORE",
    name: "Majlis Ugama Islam Singapura",
    description: "Used in Singapore and parts of Southeast Asia.",
    fajr: angle(20),
    isha: angle(18),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["SG", "ID", "BN"],
  },
  {
    id: "TURKEY",
    name: "Diyanet İşleri Başkanlığı",
    description: "Official method of Turkey.",
    fajr: angle(18),
    isha: angle(17),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["TR"],
  },
  {
    id: "TEHRAN",
    name: "Institute of Geophysics, University of Tehran",
    description: "Maghrib is taken at 4.5° below the horizon.",
    fajr: angle(17.7),
    isha: angle(14),
    maghrib: angle(4.5),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "angleBased",
    regions: ["IR"],
  },
  {
    id: "JAFARI",
    name: "Shia Ithna-Ashari (Ja'fari)",
    description: "Ja'fari jurisprudence, Maghrib at 4° below the horizon.",
    fajr: angle(16),
    isha: angle(14),
    maghrib: angle(4),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "angleBased",
    regions: [],
  },
  {
    id: "FRANCE",
    name: "Union des Organisations Islamiques de France",
    description: "12° angles, used by many mosques in France.",
    fajr: angle(12),
    isha: angle(12),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "middleOfNight",
    regions: ["FR"],
  },
  {
    id: "RUSSIA",
    name: "Spiritual Administration of Muslims of Russia",
    description: "Used across Russia and neighbouring regions.",
    fajr: angle(16),
    isha: angle(15),
    maghrib: minutes(0),
    dhuhrMinutes: 0,
    defaultHighLatitudeRule: "angleBased",
    regions: ["RU", "KZ", "UZ", "AZ"],
  },
];

export const DEFAULT_METHOD_ID = "MWL";

const METHOD_BY_ID = new Map(CALCULATION_METHODS.map((m) => [m.id, m]));

export function getMethod(id: string): CalculationMethod {
  return METHOD_BY_ID.get(id) ?? METHOD_BY_ID.get(DEFAULT_METHOD_ID)!;
}

/**
 * Suggest a method from an IANA time zone (spec §5.3 — "recommended default
 * based on region, but let the user change it").
 *
 * Time zone is used rather than IP or precise location so that no network
 * call and no extra location precision is required.
 */
export function suggestMethodForTimeZone(timeZone: string): string {
  const tz = timeZone.toLowerCase();

  const byZone: Array<[string, string]> = [
    ["asia/riyadh", "UMM_AL_QURA"],
    ["asia/mecca", "UMM_AL_QURA"],
    ["asia/dubai", "DUBAI"],
    ["asia/qatar", "QATAR"],
    ["asia/kuwait", "KUWAIT"],
    ["asia/bahrain", "KUWAIT"],
    ["asia/tehran", "TEHRAN"],
    ["asia/karachi", "KARACHI"],
    ["asia/kolkata", "KARACHI"],
    ["asia/calcutta", "KARACHI"],
    ["asia/dhaka", "KARACHI"],
    ["asia/kabul", "KARACHI"],
    ["asia/colombo", "KARACHI"],
    ["asia/kathmandu", "KARACHI"],
    ["asia/singapore", "SINGAPORE"],
    ["asia/kuala_lumpur", "EGYPT"],
    ["asia/jakarta", "SINGAPORE"],
    ["asia/brunei", "SINGAPORE"],
    ["asia/istanbul", "TURKEY"],
    ["europe/istanbul", "TURKEY"],
    ["africa/cairo", "EGYPT"],
    ["africa/khartoum", "EGYPT"],
    ["africa/tripoli", "EGYPT"],
    ["africa/algiers", "EGYPT"],
    ["africa/tunis", "EGYPT"],
    ["africa/casablanca", "EGYPT"],
    ["europe/paris", "FRANCE"],
    ["europe/moscow", "RUSSIA"],
    ["asia/almaty", "RUSSIA"],
    ["asia/tashkent", "RUSSIA"],
    ["asia/baku", "RUSSIA"],
    ["america/", "ISNA"],
    ["us/", "ISNA"],
    ["canada/", "ISNA"],
  ];

  for (const [prefix, id] of byZone) {
    if (tz === prefix || tz.startsWith(prefix)) return id;
  }
  return DEFAULT_METHOD_ID;
}
