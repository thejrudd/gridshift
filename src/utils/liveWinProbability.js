// liveWinProbability.js — fantasy matchup win-probability engine for the
// Companion Live tab, plus localStorage persistence for the win-prob-over-time
// chart. Pure functions; the component supplies projections (via the shared
// starterProjections module) and NFL game state (via liveScoringFeed helpers).

import { isFinalGame, isLiveGame } from './liveScoringFeed.js';
import { LIVE_WIN_PROBABILITY_MODEL } from '../data/liveWinProbabilityModel.js';

const OT_REMAINING_FRACTION = 0.04;
const HISTORY_VERSION = 3;
const HISTORY_PREFIX = 'gs_live_winprob_v3:';
const HISTORY_MAX_KEYS = 8;

export const POSITION_DEFAULT_PROJECTION = {
  QB: 17, RB: 12, WR: 12, TE: 8, K: 8, DEF: 7,
  DL: 8, LB: 8, DB: 8, DE: 8, DT: 8, ILB: 8, OLB: 8, CB: 8, S: 8, SS: 8, FS: 8,
  FLEX: 10,
};

const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function getWinProbabilityPositionGroup(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (IDP_POSITIONS.has(normalized)) return 'IDP';
  if (normalized === 'DST' || normalized === 'D/ST') return 'DEF';
  return LIVE_WIN_PROBABILITY_MODEL.variance.positionScale[normalized] != null
    ? normalized
    : 'FLEX';
}

export function calibrateWinProbability(rawProbability, model = LIVE_WIN_PROBABILITY_MODEL) {
  const raw = clamp(Number(rawProbability) || 0, 0, 1);
  const knots = [...(model?.calibration?.knots ?? [])]
    .filter((knot) => Number.isFinite(Number(knot?.raw)) && Number.isFinite(Number(knot?.calibrated)))
    .map((knot) => ({ raw: Number(knot.raw), calibrated: Number(knot.calibrated) }))
    .sort((left, right) => left.raw - right.raw);
  if (!knots.length) return raw;
  if (raw <= knots[0].raw) return clamp(knots[0].calibrated, 0, 1);
  if (raw >= knots[knots.length - 1].raw) return clamp(knots[knots.length - 1].calibrated, 0, 1);
  for (let index = 1; index < knots.length; index += 1) {
    const right = knots[index];
    const left = knots[index - 1];
    if (raw > right.raw) continue;
    const span = Math.max(Number.EPSILON, right.raw - left.raw);
    const ratio = (raw - left.raw) / span;
    return clamp(left.calibrated + ((right.calibrated - left.calibrated) * ratio), 0, 1);
  }
  return raw;
}

export function formatWinProbability(value, { settled = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const probability = clamp(numeric, 0, 100);
  if (!settled && probability < 1) return '<1%';
  if (!settled && probability > 99) return '>99%';
  const rounded = probability <= 10 || probability >= 90
    ? Math.round(probability * 10) / 10
    : Math.round(probability);
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

export function formatWinProbabilityPair(probA, { settled = false } = {}) {
  const raw = Number(probA);
  if (!Number.isFinite(raw)) return { a: '—', b: '—' };
  const numeric = clamp(raw, 0, 100);
  return {
    a: formatWinProbability(numeric, { settled }),
    b: formatWinProbability(100 - numeric, { settled }),
  };
}

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
 * Resolves the full-game projection for a starter, with its uncertainty and
 * where the number came from. Shared by the win-probability model and the
 * Live pace model so both read the same projection for every starter.
 */
export function resolveStarterProjection({ position, projection, fallbackAvg }) {
  if (projection && Number.isFinite(Number(projection.projected))) {
    const projected = Math.max(0, Number(projection.projected));
    const spread = Number(projection.max) - Number(projection.min);
    return {
      projected,
      sigma: Number.isFinite(spread) && spread > 0 ? spread / 1.349 : projected * 0.45,
      source: 'projection',
    };
  }
  if (Number.isFinite(Number(fallbackAvg)) && Number(fallbackAvg) > 0) {
    const projected = Number(fallbackAvg);
    return { projected, sigma: projected * 0.5, source: 'seasonAvg' };
  }
  const projected = POSITION_DEFAULT_PROJECTION[String(position ?? '').toUpperCase()]
    ?? POSITION_DEFAULT_PROJECTION.FLEX;
  return { projected, sigma: projected * 0.6, source: 'posDefault' };
}

/**
 * Per-starter outlook. `projection` is the shared projectStarter() result
 * (or null); `fallbackAvg` a season-average PPG (or null).
 */
export function getStarterOutlook({
  current = 0,
  position,
  projection,
  fallbackAvg,
  fraction,
  playerId = null,
  playerName = null,
  state = null,
  model = LIVE_WIN_PROBABILITY_MODEL,
}) {
  const { projected, sigma, source } = resolveStarterProjection({ position, projection, fallbackAvg });

  const numericFraction = Number(fraction);
  // Missing progress is uncertainty, not evidence that a game is over.
  const f = Number.isFinite(numericFraction) ? clamp(numericFraction, 0, 1) : 1;
  const progress = 1 - f;
  const points = Number(current) || 0;
  const expectedAtNow = projected * progress;
  const paceDelta = points - expectedAtNow;
  const baseRemaining = projected * f;
  const carryoverLimit = Math.max(0, baseRemaining * (Number(model?.mean?.carryoverClamp) || 0));
  const rawCarryover = (Number(model?.mean?.paceCarryover) || 0) * paceDelta * f;
  const paceCarryover = clamp(rawCarryover, -carryoverLimit, carryoverLimit);
  const remainingProj = Math.max(0, baseRemaining + paceCarryover);
  const positionGroup = getWinProbabilityPositionGroup(position);
  const positionScale = Number(model?.variance?.positionScale?.[positionGroup]) || 1;
  const sourceScale = Number(model?.variance?.sourceScale?.[source]) || 1;
  const remainingExponent = Number(model?.variance?.remainingExponent) || 1;
  const fullVariance = (sigma * positionScale * sourceScale) ** 2;
  return {
    playerId,
    playerName,
    positionGroup,
    current: points,
    projected,
    expectedAtNow,
    paceDelta,
    baseRemaining,
    paceCarryover,
    remainingProj,
    fullVariance,
    remainingVar: fullVariance * (f ** remainingExponent),
    fraction: f,
    source,
    state,
  };
}

export function computeSideOutlook(outlooks) {
  const entries = (outlooks ?? []).filter(Boolean);
  const aggregate = entries.reduce((acc, outlook) => ({
    current: acc.current + outlook.current,
    remainingProj: acc.remainingProj + outlook.remainingProj,
    remainingVar: acc.remainingVar + outlook.remainingVar,
    fullVariance: acc.fullVariance + outlook.fullVariance,
    playersRemaining: acc.playersRemaining + (outlook.fraction > 0 ? 1 : 0),
    unresolvedPlayers: acc.unresolvedPlayers + (outlook.state === 'unresolved' ? 1 : 0),
  }), {
    current: 0,
    remainingProj: 0,
    remainingVar: 0,
    fullVariance: 0,
    playersRemaining: 0,
    unresolvedPlayers: 0,
  });
  return {
    ...aggregate,
    outlooks: entries,
    keyMovers: [...entries]
      .filter((outlook) => Math.abs(outlook.paceCarryover) > 0.05 || Math.abs(outlook.paceDelta) > 0.05)
      .sort((left, right) => Math.abs(right.paceDelta) - Math.abs(left.paceDelta))
      .slice(0, 3),
  };
}

function projectStarterOutlookAtMoment(
  outlook,
  {
    current = 0,
    fraction = 1,
    model = LIVE_WIN_PROBABILITY_MODEL,
  } = {},
) {
  const numericFraction = Number(fraction);
  const remaining = Number.isFinite(numericFraction) ? clamp(numericFraction, 0, 1) : 1;
  const points = Number(current) || 0;
  const projected = Number(outlook?.projected) || 0;
  const expectedAtNow = projected * (1 - remaining);
  const paceDelta = points - expectedAtNow;
  const baseRemaining = projected * remaining;
  const carryoverLimit = Math.max(0, baseRemaining * (Number(model?.mean?.carryoverClamp) || 0));
  const paceCarryover = clamp(
    (Number(model?.mean?.paceCarryover) || 0) * paceDelta * remaining,
    -carryoverLimit,
    carryoverLimit,
  );
  const remainingExponent = Number(model?.variance?.remainingExponent) || 1;
  return {
    ...outlook,
    current: points,
    expectedAtNow,
    paceDelta,
    baseRemaining,
    paceCarryover,
    remainingProj: Math.max(0, baseRemaining + paceCarryover),
    remainingVar: (Number(outlook?.fullVariance) || 0) * (remaining ** remainingExponent),
    fraction: remaining,
    state: remaining > 0 ? outlook?.state : 'officialFinal',
  };
}

function valueForPlayer(values, playerId, fallback) {
  if (values instanceof Map) return values.has(playerId) ? values.get(playerId) : fallback;
  if (values && Object.prototype.hasOwnProperty.call(values, playerId)) return values[playerId];
  return fallback;
}

/**
 * Reconstructs a side from player-specific scores and remaining-game
 * fractions at one historical moment. Endpoint starter outlooks supply only
 * the immutable pregame projection and variance inputs.
 */
export function projectSideOutlookAtMoment(
  side,
  {
    currentByPlayer = null,
    fractionByPlayer = null,
    model = LIVE_WIN_PROBABILITY_MODEL,
  } = {},
) {
  const endpointOutlooks = side?.outlooks ?? [];
  const replayOutlooks = endpointOutlooks.map((outlook) => projectStarterOutlookAtMoment(outlook, {
    current: valueForPlayer(currentByPlayer, outlook.playerId, 0),
    fraction: valueForPlayer(fractionByPlayer, outlook.playerId, 1),
    model,
  }));
  const replay = computeSideOutlook(replayOutlooks);
  // Custom matchup adjustments are not starter performance. Preserve them
  // without borrowing any starter's later endpoint score.
  const endpointStarterTotal = endpointOutlooks.reduce(
    (sum, outlook) => sum + (Number(outlook?.current) || 0),
    0,
  );
  const sideAdjustment = (Number(side?.current) || 0) - endpointStarterTotal;
  return sideAdjustment ? { ...replay, current: replay.current + sideAdjustment } : replay;
}

/**
 * Reconstructs a side-level outlook for a historical chart moment. The live
 * result itself is always built starter by starter; this helper exists only
 * for older callers that have no player/game timeline. New replay code should
 * use `projectSideOutlookAtMoment()` so every starter gets its own fraction.
 */
export function projectSideOutlookAtProgress(
  side,
  {
    current = 0,
    progress = 0,
    model = LIVE_WIN_PROBABILITY_MODEL,
  } = {},
) {
  const played = clamp(Number(progress) || 0, 0, 1);
  const remaining = 1 - played;
  const projected = (side?.outlooks ?? []).reduce((sum, outlook) => sum + (Number(outlook.projected) || 0), 0);
  const expectedAtNow = projected * played;
  const paceDelta = (Number(current) || 0) - expectedAtNow;
  const baseRemaining = projected * remaining;
  const carryoverLimit = Math.max(0, baseRemaining * (Number(model?.mean?.carryoverClamp) || 0));
  const paceCarryover = clamp(
    (Number(model?.mean?.paceCarryover) || 0) * paceDelta * remaining,
    -carryoverLimit,
    carryoverLimit,
  );
  const remainingExponent = Number(model?.variance?.remainingExponent) || 1;
  return {
    ...side,
    current: Number(current) || 0,
    remainingProj: Math.max(0, baseRemaining + paceCarryover),
    remainingVar: (Number(side?.fullVariance) || 0) * (remaining ** remainingExponent),
    playersRemaining: remaining > 0 ? (side?.outlooks?.length ?? 0) : 0,
    unresolvedPlayers: 0,
    keyMovers: [],
  };
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
export function computeWinProbability(
  sideA,
  sideB,
  {
    settledConfirmed = false,
    model = LIVE_WIN_PROBABILITY_MODEL,
  } = {},
) {
  const expectedA = sideA.current + sideA.remainingProj;
  const expectedB = sideB.current + sideB.remainingProj;
  const margin = expectedA - expectedB;
  const noRemainingPlayers = sideA.playersRemaining === 0 && sideB.playersRemaining === 0;
  const settled = Boolean(settledConfirmed) && noRemainingPlayers;

  if (settled) {
    const probA = margin > 0 ? 100 : margin < 0 ? 0 : 50;
    return {
      probA,
      rawProbA: probA,
      expectedA,
      expectedB,
      expectedMarginA: margin,
      sigma: 0,
      settled: true,
      modelId: model.modelId,
    };
  }

  const sigmaFloor = Number(model?.variance?.matchupSigmaFloor) || 3;
  const sigma = Math.max(sigmaFloor, Math.sqrt(sideA.remainingVar + sideB.remainingVar));
  const rawProbability = normalCdf(margin / sigma);
  const calibratedProbability = calibrateWinProbability(rawProbability, model);
  const minimum = clamp(Number(model?.guardrails?.unsettledMinimum) || 0.001, 0, 0.499);
  const maximum = clamp(Number(model?.guardrails?.unsettledMaximum) || 0.999, 0.501, 1);
  const guardedProbability = clamp(calibratedProbability, minimum, maximum);
  const probA = Math.round(guardedProbability * 1000) / 10;
  return {
    probA,
    rawProbA: rawProbability * 100,
    expectedA,
    expectedB,
    expectedMarginA: margin,
    sigma,
    settled: false,
    settlementPending: noRemainingPlayers,
    modelId: model.modelId,
  };
}

/**
 * Plain-language ingredients behind a win probability, for the hero's
 * explainer. Everything here is already computed by the model — this just
 * names the parts a reader needs to follow the number:
 *
 *   each side's live points, what its unplayed starters are still projected to
 *   add, the resulting projected final, the margin between them, and how much
 *   that margin could still swing (one standard deviation of the outcome).
 *
 * The probability is then the chance the margin is still positive once the
 * remaining games play out.
 */
export function explainWinProbability(result, sideA, sideB) {
  if (!result || !sideA || !sideB) return null;
  const describe = (outlook, expected) => ({
    current: round1(outlook.current),
    remaining: round1(outlook.remainingProj),
    expected: round1(expected),
    playersRemaining: outlook.playersRemaining,
    keyMovers: (outlook.keyMovers ?? []).map((mover) => ({
      playerId: mover.playerId,
      playerName: mover.playerName,
      paceDelta: round1(mover.paceDelta),
      adjustment: round1(mover.paceCarryover),
      source: mover.source,
    })),
  });
  return {
    settled: result.settled,
    settlementPending: result.settlementPending,
    modelId: result.modelId,
    a: describe(sideA, result.expectedA),
    b: describe(sideB, result.expectedB),
    margin: round1(Math.abs(result.expectedMarginA)),
    marginLeaderKey: result.expectedMarginA >= 0 ? 'a' : 'b',
    // One standard deviation of the final margin: the swing still available.
    swing: round1(result.sigma),
    playersRemaining: sideA.playersRemaining + sideB.playersRemaining,
  };
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
  // Unchanged odds add no information unless score/finality/model state moved.
  const unchangedProbability = last && Math.abs(point.p - last.p) < minDeltaPct;
  const unchangedState = last
    && Number(last.a) === Number(point.a)
    && Number(last.b) === Number(point.b)
    && Boolean(last.settled) === Boolean(point.settled)
    && Boolean(last.settlementPending) === Boolean(point.settlementPending)
    && String(last.modelId ?? '') === String(point.modelId ?? '');
  if (unchangedProbability && unchangedState) return points;
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
