// ── Live scoreboard for search ─────────────────────────────────────────────
// The one place global search goes to the network, and only for a question
// about a game in progress ("bills score", "live scores").
//
// Live answers exist only where the server has live data enabled — the same
// gate and session Fantasy Live uses (getLiveStatus → live.enabled, a league on
// the allowlist, and a live session). Every request goes to GridShift's own
// `/api/live`, never to a third party from the browser. Without the gate this
// module reports 'off' and the palette shows no live card at all; the live
// words still reach the Scores and Live replay destinations.
//
// Results are cached for a short window, so typing "bills score" then "chiefs
// score" reads one week's games once.

import { getLiveGames, getLiveStatus, startLiveSession } from '../../../api/liveApi.js';
import { getStatisticsScoresGameDetail } from '../../../api/statisticsScoresApi.js';
import { normalizeBdlScoreboardGame } from '../../balldontlieNflScoreboard.js';

export const LIVE_STATE_OFF = 'off';
export const LIVE_STATE_OK = 'ok';
export const LIVE_STATE_ERROR = 'error';

const GAMES_TTL_MS = 30 * 1000;
const STATUS_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

const gamesCache = new Map();
const detailCache = new Map();
const statusCache = new Map();
const autoSessionAttempted = new Set();

function withTimeout(promise, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Whether live answers are available for this league: the server has live data
 * enabled and this browser holds a live session for the league. Starts the
 * session under exactly the condition Fantasy Live starts one itself — league
 * on the allowlist and no access code configured — and never otherwise.
 */
async function ensureLiveSession(leagueId, signal) {
  const key = String(leagueId);
  const cached = statusCache.get(key);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.enabled;

  let status = await withTimeout(getLiveStatus({ leagueId }), signal);
  const canAutoStart = status?.live?.enabled
    && status.live?.leagueAllowed === true
    && !status.live?.accessCodeRequired
    && !status.session?.enabled
    && !autoSessionAttempted.has(key);
  if (canAutoStart) {
    autoSessionAttempted.add(key);
    await withTimeout(startLiveSession({ leagueId, provider: 'sleeper' }), signal);
    status = await withTimeout(getLiveStatus({ leagueId }), signal);
  }

  const enabled = Boolean(status?.live?.enabled && status?.session?.enabled);
  statusCache.set(key, { enabled, at: Date.now() });
  return enabled;
}

/**
 * One week's games as normalized scoreboard games, or why there are none.
 *
 * @returns {Promise<{ state: 'off' } | { state: 'ok', games: object[] } | { state: 'error' }>}
 */
export async function loadLiveWeek({ leagueId, season, week, signal } = {}) {
  if (!leagueId || !season || !week) return { state: LIVE_STATE_OFF };

  const key = `${leagueId}:${season}:${week}`;
  const cached = gamesCache.get(key);
  if (cached && Date.now() - cached.at < GAMES_TTL_MS) return cached.result;

  try {
    const enabled = await ensureLiveSession(leagueId, signal);
    if (!enabled) return { state: LIVE_STATE_OFF };

    const payload = await withTimeout(getLiveGames({ season, week, seasonType: 2, signal }), signal);
    const raw = Array.isArray(payload) ? payload : (payload?.data ?? payload?.games ?? []);
    const games = raw.map((game) => normalizeBdlScoreboardGame(game)).filter(Boolean);
    const result = { state: LIVE_STATE_OK, games };
    gamesCache.set(key, { at: Date.now(), result });
    return result;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { state: LIVE_STATE_ERROR };
  }
}

/**
 * One game's box score — team and player totals, no play-by-play — from the
 * Scores detail endpoint on GridShift's own server. Only called once
 * loadLiveWeek has confirmed live data is on. Null when it cannot be read; the
 * card then shows the score without highlights.
 */
export async function loadLiveGameDetail({ gameId, signal } = {}) {
  if (!gameId) return null;
  const key = String(gameId);
  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.at < GAMES_TTL_MS) return cached.detail;
  try {
    const detail = await withTimeout(
      getStatisticsScoresGameDetail(gameId, { phase: 'regular', signal, includePlays: false }),
      signal,
    );
    detailCache.set(key, { at: Date.now(), detail });
    return detail;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

// Test seam: the caches are module state.
export function resetLiveSourceCache() {
  gamesCache.clear();
  detailCache.clear();
  statusCache.clear();
  autoSessionAttempted.clear();
}
