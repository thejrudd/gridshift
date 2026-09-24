import express from 'express';

// ESPN core API team statistics — season totals and per-game values for one
// NFL team (third-down and red-zone rates, time of possession, turnover
// differential, sacks, yardage). Used by the Statistics › Schedule NFL
// matchup drill-in. The payload is flattened to `{ "<category>.<stat>": {...} }`
// and the client picks what it shows, so an ESPN field rename degrades to a
// missing row instead of a server error.
const ESPN_CORE_NFL = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

// ESPN's numeric team ids, keyed by GridShift's team abbreviation.
export const ESPN_NFL_TEAM_IDS = Object.freeze({
  ATL: 1, BUF: 2, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8,
  GB: 9, TEN: 10, IND: 11, KC: 12, LV: 13, LAR: 14, MIA: 15, MIN: 16,
  NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, ARI: 22, PIT: 23, LAC: 24,
  SF: 25, SEA: 26, TB: 27, WAS: 28, CAR: 29, JAX: 30, BAL: 33, HOU: 34,
});
const TEAM_ALIASES = Object.freeze({ WSH: 'WAS', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR', JAC: 'JAX' });

const CURRENT_SEASON_TTL_MS = 10 * 60_000;
const PAST_SEASON_TTL_MS = 24 * 60 * 60_000;
const FAILURE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;

export function normalizeNflTeamStatsTeam(value) {
  const team = String(value ?? '').trim().toUpperCase();
  const resolved = TEAM_ALIASES[team] ?? team;
  return ESPN_NFL_TEAM_IDS[resolved] ? resolved : null;
}

export function normalizeNflTeamStatsSeason(value, now = new Date()) {
  const season = Number.parseInt(String(value ?? ''), 10);
  const latest = now.getFullYear() + 1;
  return Number.isInteger(season) && season >= 2002 && season <= latest ? season : null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Flatten ESPN's `splits.categories[].stats[]` into one keyed map. */
export function flattenEspnTeamStatistics(payload) {
  const stats = {};
  for (const category of payload?.splits?.categories ?? []) {
    const categoryName = String(category?.name ?? '').trim();
    if (!categoryName) continue;
    for (const stat of category?.stats ?? []) {
      const name = String(stat?.name ?? '').trim();
      if (!name) continue;
      stats[`${categoryName}.${name}`] = {
        value: finiteOrNull(stat.value),
        perGameValue: finiteOrNull(stat.perGameValue),
        displayValue: typeof stat.displayValue === 'string' ? stat.displayValue : null,
        rank: finiteOrNull(stat.rank),
      };
    }
  }
  return stats;
}

export function createNflTeamStatsRouter({ fetcher = fetch, now = () => Date.now() } = {}) {
  const router = express.Router();
  const cache = new Map();
  const inFlight = new Map();

  async function load(team, season) {
    const key = `${season}:${team}`;
    const cached = cache.get(key);
    if (cached && now() < cached.expiresAt) return cached.entry;
    if (inFlight.has(key)) return inFlight.get(key);

    const request = (async () => {
      const url = `${ESPN_CORE_NFL}/seasons/${season}/types/2/teams/${ESPN_NFL_TEAM_IDS[team]}/statistics`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetcher(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.status === 404) {
          // No regular-season games yet: an honest empty answer, cached briefly.
          const entry = { ok: true, team, season, stats: {}, fetchedAt: new Date(now()).toISOString() };
          cache.set(key, { entry, expiresAt: now() + FAILURE_TTL_MS });
          return entry;
        }
        if (!response.ok) {
          const error = new Error(`ESPN team statistics returned ${response.status}.`);
          error.statusCode = 502;
          throw error;
        }
        const payload = await response.json();
        const entry = {
          ok: true,
          team,
          season,
          stats: flattenEspnTeamStatistics(payload),
          fetchedAt: new Date(now()).toISOString(),
        };
        const currentSeason = new Date(now()).getFullYear();
        const ttl = season >= currentSeason ? CURRENT_SEASON_TTL_MS : PAST_SEASON_TTL_MS;
        cache.set(key, { entry, expiresAt: now() + ttl });
        return entry;
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return request;
  }

  router.get('/', async (req, res) => {
    const team = normalizeNflTeamStatsTeam(req.query.team);
    const season = normalizeNflTeamStatsSeason(req.query.season, new Date(now()));
    if (!team || !season) {
      return res.status(400).set('Cache-Control', 'no-store').json({
        ok: false,
        error: 'A valid NFL team and season are required.',
      });
    }
    try {
      const entry = await load(team, season);
      return res.set('Cache-Control', 'public, max-age=300').json(entry);
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      return res.status(aborted ? 504 : error?.statusCode ?? 502).set('Cache-Control', 'no-store').json({
        ok: false,
        error: aborted ? 'ESPN team statistics timed out.' : 'ESPN team statistics are unavailable right now.',
      });
    }
  });

  return router;
}
