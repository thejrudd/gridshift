function parseFantasyAdpResponse(response, fallbackMessage) {
  return response.json()
    .catch(() => null)
    .then((payload) => {
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || fallbackMessage);
      }
      return payload;
    });
}

function normalizeSeason(season) {
  const parsed = Number.parseInt(String(season ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 2002 || parsed > 2100) {
    throw new Error('A valid NFL season is required to load fantasy ADP.');
  }
  return parsed;
}

/**
 * Fetches the server-proxied BALLDONTLIE ADP snapshot. The API key and
 * upstream cache policy remain entirely on the Node sidecar.
 */
export async function getFantasyAdp({ season, signal } = {}) {
  const normalizedSeason = normalizeSeason(season);
  const response = await fetch(`/api/fantasy/adp?season=${encodeURIComponent(normalizedSeason)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parseFantasyAdpResponse(response, 'Could not load BALLDONTLIE fantasy ADP.');
}
