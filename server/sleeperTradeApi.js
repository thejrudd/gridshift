const DEFAULT_BASE_URL = 'https://api.sleeper.app/v1';

function normalizeBaseUrl(value) {
  return String(value ?? DEFAULT_BASE_URL).replace(/\/$/, '');
}

function encodeId(value) {
  return encodeURIComponent(String(value));
}

export function createSleeperTradeApi({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for the Sleeper Trade API.');
  const base = normalizeBaseUrl(baseUrl);

  async function get(path) {
    const response = await fetchImpl(`${base}${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) {
      const error = new Error(`Sleeper API error: ${response?.status ?? 'network'} ${path}`);
      error.statusCode = response?.status === 404 ? 404 : 502;
      throw error;
    }
    return response.json();
  }

  const api = {
    getLeague: (leagueId) => get(`/league/${encodeId(leagueId)}`),
    getLeagueUsers: (leagueId) => get(`/league/${encodeId(leagueId)}/users`),
    getLeagueRosters: (leagueId) => get(`/league/${encodeId(leagueId)}/rosters`),
    getTradedPicks: (leagueId) => get(`/league/${encodeId(leagueId)}/traded_picks`),
    getTransactions: (leagueId, round) => get(`/league/${encodeId(leagueId)}/transactions/${encodeId(round)}`),
    getNflState: () => get('/state/nfl'),
    async getLeagueBoundary(leagueId) {
      const [league, users, rosters, tradedPicks] = await Promise.all([
        api.getLeague(leagueId),
        api.getLeagueUsers(leagueId),
        api.getLeagueRosters(leagueId),
        api.getTradedPicks(leagueId),
      ]);
      return { league, users: users ?? [], rosters: rosters ?? [], tradedPicks: tradedPicks ?? [] };
    },
  };
  return Object.freeze(api);
}
