export const DEFAULT_ESPN_VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mMatchup', 'mMatchupScore', 'mBoxscore', 'kona_player_info'];

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `ESPN API error: ${response.status}`);
  }
  return data;
}

export async function setEspnSession({ swid, espnS2 }) {
  const response = await fetch('/api/espn/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ SWID: swid, espn_s2: espnS2 }),
  });
  return readJsonResponse(response);
}

export async function getEspnSessionStatus() {
  const response = await fetch('/api/espn/session', {
    credentials: 'include',
    cache: 'no-store',
  });
  return readJsonResponse(response);
}

export async function clearEspnSession() {
  const response = await fetch('/api/espn/session', {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
  });
  return readJsonResponse(response);
}

export async function getEspnLeagues(season) {
  const params = new URLSearchParams();
  if (season) params.set('season', String(season));
  const response = await fetch(`/api/espn/leagues?${params.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return readJsonResponse(response);
}

export async function getEspnLeague(season, leagueId, views = DEFAULT_ESPN_VIEWS, options = {}) {
  const params = new URLSearchParams();
  if (season) params.set('seasonId', String(season));
  if (options.scoringPeriodId != null) params.set('scoringPeriodId', String(options.scoringPeriodId));
  if (options.matchupPeriodId != null) params.set('matchupPeriodId', String(options.matchupPeriodId));
  if (options.fantasyFilter != null) params.set('fantasyFilter', JSON.stringify(options.fantasyFilter));
  for (const view of views) params.append('view', view);
  const response = await fetch(`/api/espn/league/${encodeURIComponent(season)}/${encodeURIComponent(leagueId)}?${params.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return readJsonResponse(response);
}
