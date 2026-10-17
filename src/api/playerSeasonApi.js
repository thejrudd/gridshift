// Statistics player dashboard data — see server/playerSeasonHandlers.js.

async function parsePlayerSeasonResponse(response, fallbackMessage) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || fallbackMessage);
  }
  return payload;
}

export async function getPlayerSeasonPools({ season, group, signal } = {}) {
  const params = new URLSearchParams({ season: String(season), group: String(group) });
  const response = await fetch(`/api/statistics/players/pools?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parsePlayerSeasonResponse(response, 'League rankings are unavailable right now.');
}

export async function getPlayerSeason({ season, team, name, position, sleeperId, signal } = {}) {
  const params = new URLSearchParams({
    season: String(season),
    team: String(team),
    name: String(name),
    position: String(position),
  });
  if (sleeperId) params.set('sleeperId', String(sleeperId));
  const response = await fetch(`/api/statistics/players/season?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parsePlayerSeasonResponse(response, 'Play-by-play for this season is unavailable right now.');
}
