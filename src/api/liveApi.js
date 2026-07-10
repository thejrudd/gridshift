async function parseLiveResponse(response, fallbackMessage) {
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

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function getLiveStatus() {
  const response = await fetch('/api/live/status', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not load GridShift Live status.');
}

export async function startLiveSession({ leagueId, provider = 'sleeper', accessCode = '' } = {}) {
  const response = await fetch('/api/live/session', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ leagueId, provider, accessCode }),
  });
  return parseLiveResponse(response, 'Could not enable GridShift Live.');
}

export async function clearLiveSession() {
  const response = await fetch('/api/live/session', {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not clear GridShift Live.');
}

export async function getLiveGames({ season, week, date } = {}) {
  const response = await fetch(`/api/live/games${buildQueryString({ season, week, date })}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not load live games.');
}

export async function getLiveGamePlays(gameId) {
  const response = await fetch(`/api/live/game/${encodeURIComponent(gameId)}/plays`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not load live plays.');
}

export async function getLivePlayerStatsForGames(gameIds = []) {
  const response = await fetch(`/api/live/player-stats${buildQueryString({ gameIds: gameIds.join(',') })}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not load live player stats.');
}

export async function getLiveGamePlayerStats(gameId) {
  const response = await fetch(`/api/live/game/${encodeURIComponent(gameId)}/player-stats`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not load live player stats.');
}
