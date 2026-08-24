/* global process */
import express from 'express';
import {
  buildSetCookieHeader,
  createEspnSessionPayload,
  encryptEspnSession,
  getSessionFromRequest,
} from './sessionCrypto.js';

const ESPN_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
const DEFAULT_LEAGUE_VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mMatchup', 'mMatchupScore', 'mBoxscore', 'kona_player_info'];

function setNoStore(res) {
  if (typeof res.set === 'function') {
    res.set('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
}

function noStore(_req, res, next) {
  setNoStore(res);
  next();
}

function getSessionSecret() {
  const secret = process.env.GRIDSHIFT_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'gridshift-local-development-session-secret';
  throw new Error('GRIDSHIFT_SESSION_SECRET is required.');
}

function getViews(queryView) {
  const values = Array.isArray(queryView) ? queryView : queryView ? [queryView] : DEFAULT_LEAGUE_VIEWS;
  const views = values
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return views.length ? [...new Set(views)] : DEFAULT_LEAGUE_VIEWS;
}

function buildLeagueUrl({ season, leagueId, seasonId = season, views }) {
  const url = new URL(`${ESPN_BASE}/seasons/${encodeURIComponent(season)}/segments/0/leagues/${encodeURIComponent(leagueId)}`);
  if (seasonId) url.searchParams.set('seasonId', String(seasonId));
  return appendLeagueUrlParams(url, { views });
}

function appendLeagueUrlParams(url, { views, scoringPeriodId = null, matchupPeriodId = null }) {
  if (scoringPeriodId != null) url.searchParams.set('scoringPeriodId', String(scoringPeriodId));
  if (matchupPeriodId != null) url.searchParams.set('matchupPeriodId', String(matchupPeriodId));
  for (const view of views) url.searchParams.append('view', view);
  return url;
}

function sessionCookieHeader(session) {
  return `SWID=${session.swid}; espn_s2=${session.espnS2}`;
}

function normalizeOwnerId(value) {
  return String(value ?? '').replace(/^\{|\}$/g, '').toUpperCase();
}

function attachGridShiftMeta(data, session) {
  if (!data || typeof data !== 'object') return data;
  const currentMemberId = normalizeOwnerId(session.memberId ?? session.swid);
  const currentTeam = (data.teams ?? []).find((team) => {
    const owners = [
      team.primaryOwner,
      ...(Array.isArray(team.owners) ? team.owners : []),
    ].map(normalizeOwnerId);
    return owners.includes(currentMemberId);
  });
  return {
    ...data,
    _gridshift: {
      currentTeamId: currentTeam?.id ?? null,
    },
  };
}

async function fetchEspnJson(url, session, fetchImpl, extraHeaders = {}) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'GridShift ESPN Fantasy Proxy',
    ...extraHeaders,
  };
  if (session?.swid && session?.espnS2) {
    headers.Cookie = sessionCookieHeader(session);
  }
  const response = await fetchImpl(url, {
    headers,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const err = new Error(`ESPN Fantasy API error: ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function getFantasyFilterHeader(queryFilter) {
  const raw = Array.isArray(queryFilter) ? queryFilter[0] : queryFilter;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}

function requireSession(req, res, next) {
  try {
    const session = getSessionFromRequest(req, getSessionSecret());
    if (!session?.swid || !session?.espnS2) {
      res.status(401).json({ authenticated: false });
      return;
    }
    req.espnSession = session;
    next();
  } catch {
    res.setHeader('Set-Cookie', buildSetCookieHeader('', { clear: true }));
    res.status(401).json({ authenticated: false });
  }
}

function readOptionalSession(req, res) {
  try {
    return getSessionFromRequest(req, getSessionSecret());
  } catch {
    res.setHeader('Set-Cookie', buildSetCookieHeader('', { clear: true }));
    return null;
  }
}

export function createEspnRouter({ fetchImpl = fetch } = {}) {
  const router = express.Router();
  router.use(noStore);

  router.post('/session', express.json({ limit: '20kb' }), handleSetEspnSession);

  router.get('/session', handleGetEspnSession);

  router.delete('/session', handleClearEspnSession);

  router.get('/leagues', requireSession, async (req, res) => {
    const season = String(req.query.season ?? new Date().getFullYear());
    try {
      const url = new URL(`${ESPN_BASE}/seasons/${encodeURIComponent(season)}/segments/0/leagues`);
      url.searchParams.set('view', 'mTeam');
      const data = await fetchEspnJson(url, req.espnSession, fetchImpl);
      const sourceLeagues = Array.isArray(data) ? data : data?.leagues;
      const leagues = Array.isArray(sourceLeagues)
        ? sourceLeagues.map((league) => ({
          league_id: String(league.id ?? league.leagueId ?? league.league_id),
          name: league.name ?? league.settings?.name ?? 'ESPN League',
          season,
          platform: 'espn',
        })).filter((league) => league.league_id && league.league_id !== 'undefined')
        : [];
      res.json({ leagues, source: leagues.length ? 'espn' : 'manual-fallback' });
    } catch {
      res.json({
        leagues: [],
        source: 'manual-fallback',
        message: 'ESPN does not expose reliable league discovery for every account. Enter the season and league ID manually.',
      });
    }
  });

  router.get('/league/:season/:leagueId', (req, res) => handleGetEspnLeague(req, res, { fetchImpl }));

  return router;
}

export function handleSetEspnSession(req, res) {
  try {
    const payload = createEspnSessionPayload(req.body);
    const encrypted = encryptEspnSession(payload, getSessionSecret());
    res.setHeader('Set-Cookie', buildSetCookieHeader(encrypted));
    res.json({ authenticated: true });
  } catch (err) {
    res.status(400).json({ authenticated: false, error: err.message });
  }
}

export function handleGetEspnSession(req, res) {
  try {
    const session = getSessionFromRequest(req, getSessionSecret());
    res.json({ authenticated: !!session });
  } catch {
    res.setHeader('Set-Cookie', buildSetCookieHeader('', { clear: true }));
    res.json({ authenticated: false });
  }
}

export function handleClearEspnSession(_req, res) {
  res.setHeader('Set-Cookie', buildSetCookieHeader('', { clear: true }));
  res.json({ authenticated: false });
}

export async function handleGetEspnLeague(req, res, { fetchImpl = fetch } = {}) {
  setNoStore(res);
  const session = readOptionalSession(req, res);
  try {
    const url = buildLeagueUrl({
      season: req.params.season,
      leagueId: req.params.leagueId,
      seasonId: req.query?.seasonId ?? req.params.season,
      views: getViews(req.query?.view),
    });
    appendLeagueUrlParams(url, {
      views: [],
      scoringPeriodId: req.query?.scoringPeriodId,
      matchupPeriodId: req.query?.matchupPeriodId,
    });
    const fantasyFilter = getFantasyFilterHeader(req.query?.fantasyFilter);
    const data = await fetchEspnJson(
      url,
      session,
      fetchImpl,
      fantasyFilter ? { 'x-fantasy-filter': fantasyFilter } : {},
    );
    res.json(session ? attachGridShiftMeta(data, session) : data);
  } catch (err) {
    res.status(err.status ?? 502).json({
      error: !session && [401, 403].includes(Number(err.status))
        ? 'ESPN did not allow public access to that league. For private leagues, use secure ESPN session values from the desktop Chrome helper.'
        : err.message || 'Failed to fetch ESPN league data.',
      details: err.data ?? null,
    });
  }
}
