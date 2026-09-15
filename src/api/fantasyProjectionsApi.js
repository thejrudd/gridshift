function parseFantasyProjectionsResponse(response, fallbackMessage) {
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
    throw new Error('A valid NFL season is required to load fantasy projections.');
  }
  return parsed;
}

function normalizeWeek(week) {
  const parsed = Number.parseInt(String(week ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 18) {
    throw new Error('A valid NFL week is required to load fantasy projections.');
  }
  return parsed;
}

/**
 * Fetches the optional server-proxied BALLDONTLIE weekly projection snapshot.
 * The API key and upstream cache policy remain entirely on the Node sidecar.
 */
export async function getFantasyProjections({ season, week, signal } = {}) {
  const normalizedSeason = normalizeSeason(season);
  const normalizedWeek = normalizeWeek(week);
  const response = await fetch(
    `/api/fantasy/projections?season=${encodeURIComponent(normalizedSeason)}&week=${encodeURIComponent(normalizedWeek)}`,
    {
      signal,
      headers: { Accept: 'application/json' },
    },
  );
  return parseFantasyProjectionsResponse(response, 'Could not load BALLDONTLIE fantasy projections.');
}
