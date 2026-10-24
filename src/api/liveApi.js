import { traceLiveRequest } from '../utils/liveLoadTrace.js';

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
  if (!payload || typeof payload !== 'object') {
    throw new Error(fallbackMessage);
  }
  return payload;
}

// One path for every live data request, so the live-load trace
// (companionDebug.liveReport) times each the same way.
async function requestLive(route, url, init, fallbackMessage) {
  const startedAt = performance.now();
  let response = null;
  try {
    response = await fetch(url, init);
    const payload = await parseLiveResponse(response, fallbackMessage);
    traceLiveRequest({ route, startedAt, response, payload });
    return payload;
  } catch (error) {
    traceLiveRequest({ route, startedAt, response, error });
    throw error;
  }
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

export async function getLiveStatus({ leagueId } = {}) {
  return requestLive('status', `/api/live/status${buildQueryString({ leagueId })}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }, 'Could not load GridShift Live status.');
}

export async function startLiveSession({ leagueId, provider = 'sleeper', accessCode = '' } = {}) {
  return requestLive('session', '/api/live/session', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ leagueId, provider, accessCode }),
  }, 'Could not enable GridShift Live.');
}

export async function clearLiveSession() {
  const response = await fetch('/api/live/session', {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return parseLiveResponse(response, 'Could not clear GridShift Live.');
}

export async function getLiveGames({ season, week, date, seasonType, signal } = {}) {
  return requestLive(`games week ${week ?? '?'}`, `/api/live/games${buildQueryString({ season, week, date, seasonType })}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  }, 'Could not load live games.');
}

export async function getLiveGamePlays(gameId, { signal, seasonType } = {}) {
  return requestLive(`plays game ${gameId}`, `/api/live/game/${encodeURIComponent(gameId)}/plays${buildQueryString({ seasonType })}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  }, 'Could not load live plays.');
}

export async function getLivePlayerStatsForGames(gameIds = []) {
  return requestLive(`player stats (${gameIds.length} games)`, `/api/live/player-stats${buildQueryString({ gameIds: gameIds.join(',') })}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }, 'Could not load live player stats.');
}

export async function getLiveGamePlayerStats(gameId) {
  return requestLive(`player stats game ${gameId}`, `/api/live/game/${encodeURIComponent(gameId)}/player-stats`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }, 'Could not load live player stats.');
}
