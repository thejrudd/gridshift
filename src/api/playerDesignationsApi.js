function parseDesignationResponse(response, fallbackMessage) {
  return response.json()
    .catch(() => null)
    .then((payload) => {
      if (!response.ok || payload?.ok === false) {
        const error = new Error(payload?.error || fallbackMessage);
        error.status = response.status;
        throw error;
      }
      return payload;
    });
}

function normalizeSeason(season) {
  const parsed = Number.parseInt(String(season ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 2002 || parsed > 2100) {
    throw new Error('A valid NFL season is required to load player designations.');
  }
  return parsed;
}

function normalizeWeek(week) {
  const parsed = Number.parseInt(String(week ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 18) {
    throw new Error('A valid NFL week is required to load player designations.');
  }
  return parsed;
}

function normalizeTeams(teams) {
  const values = Array.isArray(teams) ? teams : [teams];
  const normalized = [...new Set(values
    .map((team) => String(team ?? '').trim().toUpperCase())
    .filter((team) => /^[A-Z]{2,3}$/.test(team)))].sort();
  if (normalized.length === 0) {
    throw new Error('At least one Sleeper concern team is required to load player designations.');
  }
  return normalized;
}

/**
 * Reads the optional, server-proxied BALLDONTLIE designation snapshot.
 * Credentials, pagination, cache policy, and request priority stay server-side.
 */
export async function getPlayerDesignations({ season, week, teams, signal } = {}) {
  const normalizedSeason = normalizeSeason(season);
  const normalizedWeek = normalizeWeek(week);
  const normalizedTeams = normalizeTeams(teams);
  const params = new URLSearchParams({
    season: String(normalizedSeason),
    week: String(normalizedWeek),
    teams: normalizedTeams.join(','),
  });
  const response = await fetch(
    `/api/fantasy/player-designations?${params.toString()}`,
    {
      signal,
      headers: { Accept: 'application/json' },
    },
  );
  return parseDesignationResponse(response, 'Could not load BALLDONTLIE player designations.');
}
