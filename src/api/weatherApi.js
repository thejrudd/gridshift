// ── Weather API (Open-Meteo, no key required) ─────────────────────────────────
// For past games: archive-api.open-meteo.com
// Returns hourly data; we pick the 1pm local time slot (typical Sunday kickoff).

const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';

// In-memory cache: `${lat},${lng},${date}` → weather object
const weatherCache = {};

/**
 * Fetch historical weather for a specific date and location.
 * Returns { temp_c, wind_kph, precipitation_mm } for the 1pm hour,
 * or null on failure.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} date - ISO date string 'YYYY-MM-DD'
 */
export async function fetchGameWeather(lat, lng, date) {
  const key = `${lat},${lng},${date}`;
  if (weatherCache[key]) return weatherCache[key];

  try {
    const url = new URL(ARCHIVE_BASE);
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lng);
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', date);
    url.searchParams.set('hourly', 'temperature_2m,precipitation,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('wind_speed_unit', 'kph');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Pick hour 13 (1pm local) as a representative kickoff time
    const hourIndex = data.hourly?.time?.findIndex(t => t.endsWith('T13:00')) ?? 13;
    const idx = hourIndex >= 0 ? hourIndex : 13;

    const weather = {
      temp_c:          data.hourly.temperature_2m?.[idx]   ?? null,
      wind_kph:        data.hourly.wind_speed_10m?.[idx]   ?? null,
      precipitation_mm: data.hourly.precipitation?.[idx]   ?? null,
    };

    weatherCache[key] = weather;
    return weather;
  } catch {
    return null;
  }
}

/**
 * Format weather for display.
 * Returns a short string like "28°F · 12 mph · Rain" or "Indoor".
 */
export function formatWeather(weather, indoor) {
  if (indoor) return 'Indoor';
  if (!weather) return 'Outdoor';

  const parts = [];
  if (weather.temp_c !== null) {
    const f = Math.round(weather.temp_c * 9 / 5 + 32);
    parts.push(`${f}°F`);
  }
  if (weather.wind_kph !== null && weather.wind_kph > 8) {
    parts.push(`${Math.round(weather.wind_kph)} km/h wind`);
  }
  if (weather.precipitation_mm !== null && weather.precipitation_mm > 0.5) {
    parts.push(weather.precipitation_mm > 5 ? 'Heavy precip' : 'Light precip');
  }
  return parts.length ? parts.join(' · ') : 'Outdoor';
}
