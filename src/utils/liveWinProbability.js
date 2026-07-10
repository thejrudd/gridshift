// liveWinProbability.js — fantasy matchup win-probability engine for the
// Companion Live tab, plus localStorage persistence for the win-prob-over-time
// chart. Pure functions; the component supplies projections (via the shared
// starterProjections module) and NFL game state (via liveScoringFeed helpers).

import { isFinalGame, isLiveGame } from './liveScoringFeed.js';

const OT_REMAINING_FRACTION = 0.04;
const SIGMA_FLOOR = 3.0;
const HISTORY_VERSION = 2;
const HISTORY_PREFIX = 'gs_live_winprob_v2:';
const HISTORY_MAX_KEYS = 8;

export const POSITION_DEFAULT_PROJECTION = {
  QB: 17, RB: 12, WR: 12, TE: 8, K: 8, DEF: 7,
  DL: 8, LB: 8, DB: 8, DE: 8, DT: 8, ILB: 8, OLB: 8, CB: 8, S: 8, SS: 8, FS: 8,
  FLEX: 10,
};

export function parseClockToSeconds(timeStr) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr ?? '').trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(seconds) ? Math.min(seconds, 900) : null;
}

/**
 * Fraction of a player's game still to be played.
 * `hasGameThisWeek=false` (bye) counts as nothing left to play.
 */
export function getRemainingGameFraction(game, { hasGameThisWeek = true } = {}) {
  if (!hasGameThisWeek) return 0;
  if (!game) return 1;
  if (isFinalGame(game)) return 0;
  if (!isLiveGame(game)) return 1;

  const status = String(game.status ?? '').toLowerCase();
  const period = Number(game.period);
  if (Number.isFinite(period) && period >= 5) return OT_REMAINING_FRACTION;
  if (status.includes('half')) return 0.5;
  if (!Number.isFinite(period) || period < 1) return 1;

  const clockSeconds = parseClockToSeconds(game.time) ?? 450; // mid-quarter default
  return Math.min(1, Math.max(0, (4 - period + clockSeconds / 900) / 4));
}

/**
 * Per-starter outlook. `projection` is the shared projectStarter() result
 * (or null); `fallbackAvg` a season-average PPG (or null).
 */
export function getStarterOutlook({ current = 0, position, projection, fallbackAvg, fraction }) {
  let projected;
  let sigma;
  let source;
  if (projection && Number.isFinite(Number(projection.projected))) {
    projected = Math.max(0, Number(projection.projected));
    const spread = Number(projection.max) - Number(projection.min);
    sigma = Number.isFinite(spread) && spread > 0 ? spread / 1.349 : projected * 0.45;
    source = 'projection';
  } else if (Number.isFinite(Number(fallbackAvg)) && Number(fallbackAvg) > 0) {
    projected = Number(fallbackAvg);
    sigma = projected * 0.5;
    source = 'seasonAvg';
  } else {
    projected = POSITION_DEFAULT_PROJECTION[String(position ?? '').toUpperCase()] ?? POSITION_DEFAULT_PROJECTION.FLEX;
    sigma = projected * 0.6;
    source = 'posDefault';
  }

  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  return {
    current: Number(current) || 0,
    remainingProj: projected * f,
    remainingVar: (sigma * sigma) * f,
    fraction: f,
    source,
  };
}

export function computeSideOutlook(outlooks) {
  return (outlooks ?? []).reduce((acc, outlook) => ({
    current: acc.current + outlook.current,
    remainingProj: acc.remainingProj + outlook.remainingProj,
    remainingVar: acc.remainingVar + outlook.remainingVar,
    playersRemaining: acc.playersRemaining + (outlook.fraction > 0 ? 1 : 0),
  }), { current: 0, remainingProj: 0, remainingVar: 0, playersRemaining: 0 });
}

/** Abramowitz–Stegun approximation of the standard normal CDF. */
export function normalCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

/**
 * Win probability for side A given both side outlooks.
 * Settled (all games final/bye on both sides) snaps to 100/0/50.
 */
export function computeWinProbability(sideA, sideB) {
  const expectedA = sideA.current + sideA.remainingProj;
  const expectedB = sideB.current + sideB.remainingProj;
  const margin = expectedA - expectedB;
  const settled = sideA.playersRemaining === 0 && sideB.playersRemaining === 0;

  if (settled) {
    const probA = margin > 0 ? 100 : margin < 0 ? 0 : 50;
    return { probA, expectedA, expectedB, expectedMarginA: margin, sigma: 0, settled: true };
  }

  const sigma = Math.max(SIGMA_FLOOR, Math.sqrt(sideA.remainingVar + sideB.remainingVar));
  const probA = Math.round(normalCdf(margin / sigma) * 1000) / 10;
  return { probA, expectedA, expectedB, expectedMarginA: margin, sigma, settled: false };
}

// ── History persistence ──────────────────────────────────────────────────

export function buildWinProbHistoryKey({ leagueId, season, week, matchupId }) {
  return `${HISTORY_PREFIX}${leagueId}:${season}:${week}:${matchupId}`;
}

export function loadWinProbHistory(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.v !== HISTORY_VERSION || !Array.isArray(parsed.points)) return [];
    return parsed.points.filter((point) => (
      point && Number.isFinite(point.t) && Number.isFinite(point.p)
    ));
  } catch {
    return [];
  }
}

export function appendWinProbPoint(history, point, { cap = 240, minDeltaPct = 0.1 } = {}) {
  const points = Array.isArray(history) ? history : [];
  const last = points[points.length - 1];
  // Unchanged odds add no information — keep the curve to real movement.
  if (last && Math.abs(point.p - last.p) < minDeltaPct) return points;
  const next = [...points, point];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function saveWinProbHistory(key, points) {
  try {
    window.localStorage.setItem(key, JSON.stringify({
      v: HISTORY_VERSION,
      updatedAt: Date.now(),
      points,
    }));
    pruneWinProbHistory(key);
  } catch {
    // Storage full or unavailable — the chart still works from memory.
  }
}

function pruneWinProbHistory(keepKey) {
  const entries = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(HISTORY_PREFIX)) continue;
    let updatedAt = 0;
    try {
      updatedAt = JSON.parse(window.localStorage.getItem(key))?.updatedAt ?? 0;
    } catch {
      updatedAt = 0;
    }
    entries.push({ key, updatedAt });
  }
  if (entries.length <= HISTORY_MAX_KEYS) return;
  entries
    .filter((entry) => entry.key !== keepKey)
    .sort((left, right) => left.updatedAt - right.updatedAt)
    .slice(0, entries.length - HISTORY_MAX_KEYS)
    .forEach((entry) => window.localStorage.removeItem(entry.key));
}
