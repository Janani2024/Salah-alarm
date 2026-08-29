/**
 * Offline city database for manual location selection (spec §19.2).
 *
 * Bundled rather than fetched so that manual selection works with no network
 * and no request that would leak the user's search (spec §19.4, §34).
 * Covers the beta target regions in spec §46 Phase 3 — India, Middle East,
 * UK, US, Southeast Asia — plus major Muslim population centres elsewhere.
 */

export interface City {
  name: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  /** Alternative spellings people actually type. */
  aliases?: string[];
}

export const CITIES: City[] = [
  // --- India -------------------------------------------------------
  { name: "Chennai", country: "India", countryCode: "IN", latitude: 13.0827, longitude: 80.2707, timeZone: "Asia/Kolkata", aliases: ["madras"] },
  { name: "Mumbai", country: "India", countryCode: "IN", latitude: 19.076, longitude: 72.8777, timeZone: "Asia/Kolkata", aliases: ["bombay"] },
  { name: "Delhi", country: "India", countryCode: "IN", latitude: 28.6139, longitude: 77.209, timeZone: "Asia/Kolkata", aliases: ["new delhi"] },
  { name: "Hyderabad", country: "India", countryCode: "IN", latitude: 17.385, longitude: 78.4867, timeZone: "Asia/Kolkata" },
  { name: "Bengaluru", country: "India", countryCode: "IN", latitude: 12.9716, longitude: 77.5946, timeZone: "Asia/Kolkata", aliases: ["bangalore"] },
  { name: "Kolkata", country: "India", countryCode: "IN", latitude: 22.5726, longitude: 88.3639, timeZone: "Asia/Kolkata", aliases: ["calcutta"] },
  { name: "Lucknow", country: "India", countryCode: "IN", latitude: 26.8467, longitude: 80.9462, timeZone: "Asia/Kolkata" },
  { name: "Ahmedabad", country: "India", countryCode: "IN", latitude: 23.0225, longitude: 72.5714, timeZone: "Asia/Kolkata" },
  { name: "Coimbatore", country: "India", countryCode: "IN", latitude: 11.0168, longitude: 76.9558, timeZone: "Asia/Kolkata" },
  { name: "Madurai", country: "India", countryCode: "IN", latitude: 9.9252, longitude: 78.1198, timeZone: "Asia/Kolkata" },
  { name: "Salem", country: "India", countryCode: "IN", latitude: 11.6643, longitude: 78.146, timeZone: "Asia/Kolkata" },
  { name: "Erode", country: "India", countryCode: "IN", latitude: 11.341, longitude: 77.7172, timeZone: "Asia/Kolkata" },
  { name: "Tiruchirappalli", country: "India", countryCode: "IN", latitude: 10.7905, longitude: 78.7047, timeZone: "Asia/Kolkata", aliases: ["trichy"] },
  { name: "Kochi", country: "India", countryCode: "IN", latitude: 9.9312, longitude: 76.2673, timeZone: "Asia/Kolkata", aliases: ["cochin"] },
  { name: "Srinagar", country: "India", countryCode: "IN", latitude: 34.0837, longitude: 74.7973, timeZone: "Asia/Kolkata" },

  // --- Pakistan / Bangladesh / Afghanistan / Sri Lanka -------------
  { name: "Karachi", country: "Pakistan", countryCode: "PK", latitude: 24.8607, longitude: 67.0011, timeZone: "Asia/Karachi" },
  { name: "Lahore", country: "Pakistan", countryCode: "PK", latitude: 31.5204, longitude: 74.3587, timeZone: "Asia/Karachi" },
  { name: "Islamabad", country: "Pakistan", countryCode: "PK", latitude: 33.6844, longitude: 73.0479, timeZone: "Asia/Karachi" },
  { name: "Peshawar", country: "Pakistan", countryCode: "PK", latitude: 34.0151, longitude: 71.5249, timeZone: "Asia/Karachi" },
  { name: "Dhaka", country: "Bangladesh", countryCode: "BD", latitude: 23.8103, longitude: 90.4125, timeZone: "Asia/Dhaka" },
  { name: "Chittagong", country: "Bangladesh", countryCode: "BD", latitude: 22.3569, longitude: 91.7832, timeZone: "Asia/Dhaka" },
  { name: "Kabul", country: "Afghanistan", countryCode: "AF", latitude: 34.5553, longitude: 69.2075, timeZone: "Asia/Kabul" },
  { name: "Colombo", country: "Sri Lanka", countryCode: "LK", latitude: 6.9271, longitude: 79.8612, timeZone: "Asia/Colombo" },

  // --- Middle East -------------------------------------------------
  { name: "Makkah", country: "Saudi Arabia", countryCode: "SA", latitude: 21.4225, longitude: 39.8262, timeZone: "Asia/Riyadh", aliases: ["mecca", "makkah al mukarramah"] },
  { name: "Madinah", country: "Saudi Arabia", countryCode: "SA", latitude: 24.5247, longitude: 39.5692, timeZone: "Asia/Riyadh", aliases: ["medina"] },
  { name: "Riyadh", country: "Saudi Arabia", countryCode: "SA", latitude: 24.7136, longitude: 46.6753, timeZone: "Asia/Riyadh" },
  { name: "Jeddah", country: "Saudi Arabia", countryCode: "SA", latitude: 21.4858, longitude: 39.1925, timeZone: "Asia/Riyadh" },
  { name: "Dubai", country: "United Arab Emirates", countryCode: "AE", latitude: 25.2048, longitude: 55.2708, timeZone: "Asia/Dubai" },
  { name: "Abu Dhabi", country: "United Arab Emirates", countryCode: "AE", latitude: 24.4539, longitude: 54.3773, timeZone: "Asia/Dubai" },
  { name: "Sharjah", country: "United Arab Emirates", countryCode: "AE", latitude: 25.3463, longitude: 55.4209, timeZone: "Asia/Dubai" },
  { name: "Doha", country: "Qatar", countryCode: "QA", latitude: 25.2854, longitude: 51.531, timeZone: "Asia/Qatar" },
  { name: "Kuwait City", country: "Kuwait", countryCode: "KW", latitude: 29.3759, longitude: 47.9774, timeZone: "Asia/Kuwait" },
  { name: "Manama", country: "Bahrain", countryCode: "BH", latitude: 26.2285, longitude: 50.586, timeZone: "Asia/Bahrain" },
  { name: "Muscat", country: "Oman", countryCode: "OM", latitude: 23.588, longitude: 58.3829, timeZone: "Asia/Muscat" },
  { name: "Amman", country: "Jordan", countryCode: "JO", latitude: 31.9454, longitude: 35.9284, timeZone: "Asia/Amman" },
  { name: "Jerusalem", country: "Palestine", countryCode: "PS", latitude: 31.7683, longitude: 35.2137, timeZone: "Asia/Hebron", aliases: ["al quds"] },
  { name: "Baghdad", country: "Iraq", countryCode: "IQ", latitude: 33.3152, longitude: 44.3661, timeZone: "Asia/Baghdad" },
  { name: "Damascus", country: "Syria", countryCode: "SY", latitude: 33.5138, longitude: 36.2765, timeZone: "Asia/Damascus" },
  { name: "Beirut", country: "Lebanon", countryCode: "LB", latitude: 33.8938, longitude: 35.5018, timeZone: "Asia/Beirut" },
  { name: "Tehran", country: "Iran", countryCode: "IR", latitude: 35.6892, longitude: 51.389, timeZone: "Asia/Tehran" },
  { name: "Istanbul", country: "Türkiye", countryCode: "TR", latitude: 41.0082, longitude: 28.9784, timeZone: "Europe/Istanbul" },
  { name: "Ankara", country: "Türkiye", countryCode: "TR", latitude: 39.9334, longitude: 32.8597, timeZone: "Europe/Istanbul" },

  // --- Southeast Asia ---------------------------------------------
  { name: "Kuala Lumpur", country: "Malaysia", countryCode: "MY", latitude: 3.139, longitude: 101.6869, timeZone: "Asia/Kuala_Lumpur" },
  { name: "Singapore", country: "Singapore", countryCode: "SG", latitude: 1.3521, longitude: 103.8198, timeZone: "Asia/Singapore" },
  { name: "Jakarta", country: "Indonesia", countryCode: "ID", latitude: -6.2088, longitude: 106.8456, timeZone: "Asia/Jakarta" },
  { name: "Surabaya", country: "Indonesia", countryCode: "ID", latitude: -7.2575, longitude: 112.7521, timeZone: "Asia/Jakarta" },
  { name: "Bandung", country: "Indonesia", countryCode: "ID", latitude: -6.9175, longitude: 107.6191, timeZone: "Asia/Jakarta" },
  { name: "Medan", country: "Indonesia", countryCode: "ID", latitude: 3.5952, longitude: 98.6722, timeZone: "Asia/Jakarta" },
  { name: "Bandar Seri Begawan", country: "Brunei", countryCode: "BN", latitude: 4.9031, longitude: 114.9398, timeZone: "Asia/Brunei" },
  { name: "Manila", country: "Philippines", countryCode: "PH", latitude: 14.5995, longitude: 120.9842, timeZone: "Asia/Manila" },

  // --- United Kingdom & Ireland ------------------------------------
  { name: "London", country: "United Kingdom", countryCode: "GB", latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
  { name: "Birmingham", country: "United Kingdom", countryCode: "GB", latitude: 52.4862, longitude: -1.8904, timeZone: "Europe/London" },
  { name: "Manchester", country: "United Kingdom", countryCode: "GB", latitude: 53.4808, longitude: -2.2426, timeZone: "Europe/London" },
  { name: "Bradford", country: "United Kingdom", countryCode: "GB", latitude: 53.795, longitude: -1.7594, timeZone: "Europe/London" },
  { name: "Leicester", country: "United Kingdom", countryCode: "GB", latitude: 52.6369, longitude: -1.1398, timeZone: "Europe/London" },
  { name: "Glasgow", country: "United Kingdom", countryCode: "GB", latitude: 55.8642, longitude: -4.2518, timeZone: "Europe/London" },
  { name: "Dublin", country: "Ireland", countryCode: "IE", latitude: 53.3498, longitude: -6.2603, timeZone: "Europe/Dublin" },

  // --- United States & Canada --------------------------------------
  { name: "New York", country: "United States", countryCode: "US", latitude: 40.7128, longitude: -74.006, timeZone: "America/New_York" },
  { name: "Chicago", country: "United States", countryCode: "US", latitude: 41.8781, longitude: -87.6298, timeZone: "America/Chicago" },
  { name: "Detroit", country: "United States", countryCode: "US", latitude: 42.3314, longitude: -83.0458, timeZone: "America/Detroit" },
  { name: "Houston", country: "United States", countryCode: "US", latitude: 29.7604, longitude: -95.3698, timeZone: "America/Chicago" },
  { name: "Los Angeles", country: "United States", countryCode: "US", latitude: 34.0522, longitude: -118.2437, timeZone: "America/Los_Angeles" },
  { name: "Minneapolis", country: "United States", countryCode: "US", latitude: 44.9778, longitude: -93.265, timeZone: "America/Chicago" },
  { name: "Atlanta", country: "United States", countryCode: "US", latitude: 33.749, longitude: -84.388, timeZone: "America/New_York" },
  { name: "Toronto", country: "Canada", countryCode: "CA", latitude: 43.6532, longitude: -79.3832, timeZone: "America/Toronto" },
  { name: "Montreal", country: "Canada", countryCode: "CA", latitude: 45.5019, longitude: -73.5674, timeZone: "America/Toronto" },

  // --- Europe -------------------------------------------------------
  { name: "Paris", country: "France", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, timeZone: "Europe/Paris" },
  { name: "Marseille", country: "France", countryCode: "FR", latitude: 43.2965, longitude: 5.3698, timeZone: "Europe/Paris" },
  { name: "Berlin", country: "Germany", countryCode: "DE", latitude: 52.52, longitude: 13.405, timeZone: "Europe/Berlin" },
  { name: "Cologne", country: "Germany", countryCode: "DE", latitude: 50.9375, longitude: 6.9603, timeZone: "Europe/Berlin" },
  { name: "Amsterdam", country: "Netherlands", countryCode: "NL", latitude: 52.3676, longitude: 4.9041, timeZone: "Europe/Amsterdam" },
  { name: "Brussels", country: "Belgium", countryCode: "BE", latitude: 50.8503, longitude: 4.3517, timeZone: "Europe/Brussels" },
  { name: "Stockholm", country: "Sweden", countryCode: "SE", latitude: 59.3293, longitude: 18.0686, timeZone: "Europe/Stockholm" },
  { name: "Oslo", country: "Norway", countryCode: "NO", latitude: 59.9139, longitude: 10.7522, timeZone: "Europe/Oslo" },
  { name: "Moscow", country: "Russia", countryCode: "RU", latitude: 55.7558, longitude: 37.6173, timeZone: "Europe/Moscow" },
  { name: "Sarajevo", country: "Bosnia and Herzegovina", countryCode: "BA", latitude: 43.8563, longitude: 18.4131, timeZone: "Europe/Sarajevo" },

  // --- Africa -------------------------------------------------------
  { name: "Cairo", country: "Egypt", countryCode: "EG", latitude: 30.0444, longitude: 31.2357, timeZone: "Africa/Cairo" },
  { name: "Alexandria", country: "Egypt", countryCode: "EG", latitude: 31.2001, longitude: 29.9187, timeZone: "Africa/Cairo" },
  { name: "Casablanca", country: "Morocco", countryCode: "MA", latitude: 33.5731, longitude: -7.5898, timeZone: "Africa/Casablanca" },
  { name: "Algiers", country: "Algeria", countryCode: "DZ", latitude: 36.7538, longitude: 3.0588, timeZone: "Africa/Algiers" },
  { name: "Tunis", country: "Tunisia", countryCode: "TN", latitude: 36.8065, longitude: 10.1815, timeZone: "Africa/Tunis" },
  { name: "Khartoum", country: "Sudan", countryCode: "SD", latitude: 15.5007, longitude: 32.5599, timeZone: "Africa/Khartoum" },
  { name: "Lagos", country: "Nigeria", countryCode: "NG", latitude: 6.5244, longitude: 3.3792, timeZone: "Africa/Lagos" },
  { name: "Kano", country: "Nigeria", countryCode: "NG", latitude: 12.0022, longitude: 8.592, timeZone: "Africa/Lagos" },
  { name: "Nairobi", country: "Kenya", countryCode: "KE", latitude: -1.2921, longitude: 36.8219, timeZone: "Africa/Nairobi" },
  { name: "Cape Town", country: "South Africa", countryCode: "ZA", latitude: -33.9249, longitude: 18.4241, timeZone: "Africa/Johannesburg" },

  // --- Central Asia & Oceania ---------------------------------------
  { name: "Tashkent", country: "Uzbekistan", countryCode: "UZ", latitude: 41.2995, longitude: 69.2401, timeZone: "Asia/Tashkent" },
  { name: "Almaty", country: "Kazakhstan", countryCode: "KZ", latitude: 43.222, longitude: 76.8512, timeZone: "Asia/Almaty" },
  { name: "Baku", country: "Azerbaijan", countryCode: "AZ", latitude: 40.4093, longitude: 49.8671, timeZone: "Asia/Baku" },
  { name: "Sydney", country: "Australia", countryCode: "AU", latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" },
  { name: "Melbourne", country: "Australia", countryCode: "AU", latitude: -37.8136, longitude: 144.9631, timeZone: "Australia/Melbourne" },
];

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

/** Rank cities against a free-text query. Prefix matches beat substring. */
export function searchCities(query: string, limit = 8): City[] {
  const q = normalise(query);
  if (q.length === 0) return [];

  const scored: Array<{ city: City; score: number }> = [];

  for (const city of CITIES) {
    const name = normalise(city.name);
    const country = normalise(city.country);
    const aliases = (city.aliases ?? []).map(normalise);

    let score = -1;
    if (name === q || aliases.includes(q)) score = 0;
    else if (name.startsWith(q) || aliases.some((a) => a.startsWith(q))) score = 1;
    else if (name.includes(q) || aliases.some((a) => a.includes(q))) score = 2;
    else if (country.startsWith(q)) score = 3;
    else if (country.includes(q)) score = 4;

    if (score >= 0) scored.push({ city, score });
  }

  scored.sort((a, b) => a.score - b.score || a.city.name.localeCompare(b.city.name));
  return scored.slice(0, limit).map((s) => s.city);
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest known city, used to label a GPS fix without a network lookup. */
export function nearestCity(latitude: number, longitude: number): City | null {
  let best: City | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const city of CITIES) {
    const d = distanceKm(latitude, longitude, city.latitude, city.longitude);
    if (d < bestDistance) {
      bestDistance = d;
      best = city;
    }
  }
  // Beyond ~150km the label would be misleading.
  return bestDistance <= 150 ? best : null;
}
