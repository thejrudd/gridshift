// Statistics team dashboard data — see server/teamSeasonHandlers.js.

export async function getTeamSeason({ season, team, signal } = {}) {
  const params = new URLSearchParams({ season: String(season), team: String(team) });
  const response = await fetch(`/api/statistics/teams/season?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Team season data is unavailable right now.');
  }
  return payload;
}
