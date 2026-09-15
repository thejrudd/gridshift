// ── IDP, D/ST & Kicker Trade Value Engine ──────────────────────────────────────
//
// Computes production-based trade values for IDP, D/ST (DEF), and kickers (K)
// players in leagues that roster them.  Values are anchored to the same
// PPG → value conversion used for skill positions via `positionalValuePerPPG`,
// so a LB averaging 12 PPG is worth the same as a WR averaging 12 PPG.
// If a league's scoring brings IDP into parity with offensive players, the
// computed values will reflect that automatically.
//
// Integration: values flow into `valueSide()` / `buildCandidatePool()` in
// tradeEngine.js after KTC + dynasty fallback. Missing values remain null.

import { calcPointsFromTotals } from './scoringEngine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const IDP_POS_GROUPS = {
  DL: new Set(['DL', 'DE', 'DT', 'EDG', 'EDGE']),
  LB: new Set(['LB', 'ILB', 'OLB']),
  DB: new Set(['DB', 'CB', 'S', 'SS', 'FS']),
};

const IDP_FLEX_SLOTS = new Set(['IDP_FLEX', 'FLEX_IDP', 'DP']);

/** Minimum games played to include a player in value computation. */
const MIN_GAMES = 3;

const IDP_VALUE_CACHE = new WeakMap();
const POSITION_VALUE_CACHE = new WeakMap();

/**
 * Fallback value-per-PPG when `positionalValuePerPPG` is not yet available
 * (e.g., before KTC data finishes loading).
 *
 * Calibrated to mid-PPR skill player league averages:
 *   ~10 PPG player ≈ 3,200 value  |  ~20 PPG player ≈ 6,400 value
 */
const DEFAULT_VAL_PER_PPG = 320;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize a Sleeper position string to its IDP group.
 * @param {string} pos
 * @returns {'DL'|'LB'|'DB'|null}
 */
export function normalizeIDPPos(pos) {
  for (const [group, set] of Object.entries(IDP_POS_GROUPS)) {
    if (set.has(pos)) return group;
  }
  return null;
}

/**
 * Detect whether a league uses IDP or D/ST roster slots.
 * @param {string[]} rosterPositions  - league.roster_positions
 * @returns {{ hasIDP: boolean, hasDST: boolean }}
 */
export function detectLeagueDefensiveType(rosterPositions) {
  const positions = rosterPositions ?? [];
  return {
    hasIDP: positions.some(p => normalizeIDPPos(p) !== null || IDP_FLEX_SLOTS.has(p)),
    hasDST: positions.includes('DEF'),
  };
}

/**
 * Whether a league has any position whose Trade value may be generated from
 * league-scored production rather than a direct KTC market entry.
 */
export function hasGeneratedProductionTradeValues(rosterPositions) {
  const { hasIDP, hasDST } = detectLeagueDefensiveType(rosterPositions);
  return hasIDP || hasDST || (rosterPositions ?? []).includes('K');
}

/**
 * Derive a league-calibrated value-per-PPG ratio from the skill position map.
 *
 * Uses RB / WR / TE averages (excludes QB — passing TDs inflate QB PPG
 * relative to roster contribution and would skew the baseline too high).
 * Falls back to DEFAULT_VAL_PER_PPG if the map is unavailable.
 *
 * @param {{ QB: number|null, RB: number|null, WR: number|null, TE: number|null }|null} positionalValuePerPPG
 * @returns {number}
 */
function getBaseValPerPPG(positionalValuePerPPG) {
  if (!positionalValuePerPPG) return DEFAULT_VAL_PER_PPG;
  const vals = ['RB', 'WR', 'TE']
    .map(pos => positionalValuePerPPG[pos])
    .filter(v => v != null && v > 0);
  return vals.length
    ? vals.reduce((s, v) => s + v, 0) / vals.length
    : DEFAULT_VAL_PER_PPG;
}

function isCacheKeyable(value) {
  return value != null && (typeof value === 'object' || typeof value === 'function');
}

function getWeakCacheNode(cache, key) {
  let next = cache.get(key);
  if (!next) {
    next = new WeakMap();
    cache.set(key, next);
  }
  return next;
}

function getMapCacheNode(cache, key) {
  let next = cache.get(key);
  if (!next) {
    next = new Map();
    cache.set(key, next);
  }
  return next;
}

function getRosterPositionsCacheKey(rosterPositions) {
  return (rosterPositions ?? []).join('|');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute production-based trade values for all IDP (DL / LB / DB) players.
 *
 * Value formula: round(ppg × avgSkillValPerPPG).
 *
 * KTC-backed offensive players are allowed to exceed 10,000. Generated IDP
 * values must be able to do the same so one scoring format is not silently
 * capped while another is not.
 *
 * Players with fewer than MIN_GAMES (3) games played are excluded and remain
 * unavailable ("—") unless they have a market value.
 *
 * @param {object}       sleeperPlayers         - Full Sleeper player map { [id]: playerObj }
 * @param {object}       seasonStats            - { [playerId]: { gp: number, ...totals } }
 * @param {object}       scoringSettings        - League scoring settings (merged with DEFAULT_SCORING)
 * @param {string[]}     rosterPositions        - league.roster_positions
 * @param {object|null}  positionalValuePerPPG  - From computePositionalValuePerPPG(); null → fallback
 * @returns {Map<string, number>}
 */
export function computeIDPValues(
  sleeperPlayers,
  seasonStats,
  scoringSettings,
  rosterPositions,
  positionalValuePerPPG = null,
) {
  const result = new Map();
  if (!sleeperPlayers || !seasonStats || !scoringSettings) return result;

  const rosterSlots = rosterPositions ?? [];
  const usedGroups = new Set(
    rosterSlots.map(normalizeIDPPos).filter(Boolean),
  );
  // A flex-only IDP league still allows every defensive player group. The
  // league detector treats these slots as IDP, so the value engine must do the
  // same instead of returning an empty map until an explicit DL/LB/DB slot is
  // present.
  if (rosterSlots.some((slot) => IDP_FLEX_SLOTS.has(slot))) {
    for (const group of Object.keys(IDP_POS_GROUPS)) usedGroups.add(group);
  }
  if (!usedGroups.size) return result;

  const canCache = isCacheKeyable(sleeperPlayers)
    && isCacheKeyable(seasonStats)
    && isCacheKeyable(scoringSettings);
  const rosterPositionsKey = getRosterPositionsCacheKey(rosterPositions);
  const valPerPPG = getBaseValPerPPG(positionalValuePerPPG);
  const cacheKey = `${rosterPositionsKey}|${valPerPPG.toFixed(4)}`;
  if (canCache) {
    const byStats = getWeakCacheNode(IDP_VALUE_CACHE, sleeperPlayers);
    const byScoring = getWeakCacheNode(byStats, seasonStats);
    const byKey = getMapCacheNode(byScoring, scoringSettings);
    const cached = byKey.get(cacheKey);
    if (cached) return cached;
  }

  for (const group of usedGroups) {
    for (const [id, p] of Object.entries(sleeperPlayers)) {
      if (normalizeIDPPos(p.position) !== group) continue;
      const stats = seasonStats[id];
      if (!stats?.gp || stats.gp < MIN_GAMES) continue;
      const pts = calcPointsFromTotals(stats, scoringSettings, p.position);
      if (!pts || pts <= 0) continue;
      const ppg = pts / stats.gp;
      result.set(id, Math.round(ppg * valPerPPG));
    }
  }

  if (canCache) {
    const byStats = getWeakCacheNode(IDP_VALUE_CACHE, sleeperPlayers);
    const byScoring = getWeakCacheNode(byStats, seasonStats);
    const byKey = getMapCacheNode(byScoring, scoringSettings);
    byKey.set(cacheKey, result);
  }

  return result;
}

/**
 * Compute production-based trade values for all D/ST (DEF) units.
 * Identical PPG → value conversion as IDP / skill positions.
 *
 * @param {object}       sleeperPlayers
 * @param {object}       seasonStats
 * @param {object}       scoringSettings
 * @param {object|null}  positionalValuePerPPG
 * @returns {Map<string, number>}
 */
export function computeDSTValues(
  sleeperPlayers,
  seasonStats,
  scoringSettings,
  positionalValuePerPPG = null,
) {
  return computePositionValues(sleeperPlayers, seasonStats, scoringSettings, positionalValuePerPPG, 'DEF');
}

/** Kickers use the same league-scored production scale and game minimum. */
export function computeKickerValues(sleeperPlayers, seasonStats, scoringSettings, positionalValuePerPPG = null) {
  return computePositionValues(sleeperPlayers, seasonStats, scoringSettings, positionalValuePerPPG, 'K');
}

function computePositionValues(sleeperPlayers, seasonStats, scoringSettings, positionalValuePerPPG, position) {
  const result = new Map();
  if (!sleeperPlayers || !seasonStats || !scoringSettings) return result;

  const canCache = isCacheKeyable(sleeperPlayers)
    && isCacheKeyable(seasonStats)
    && isCacheKeyable(scoringSettings);
  const valPerPPG = getBaseValPerPPG(positionalValuePerPPG);
  const cacheKey = `${position}|${valPerPPG.toFixed(4)}`;
  if (canCache) {
    const byStats = getWeakCacheNode(POSITION_VALUE_CACHE, sleeperPlayers);
    const byScoring = getWeakCacheNode(byStats, seasonStats);
    const byKey = getMapCacheNode(byScoring, scoringSettings);
    const cached = byKey.get(cacheKey);
    if (cached) return cached;
  }

  for (const [id, p] of Object.entries(sleeperPlayers)) {
    if (p.position !== position) continue;
    const stats = seasonStats[id];
    if (!stats?.gp || stats.gp < MIN_GAMES) continue;
    const pts = calcPointsFromTotals(stats, scoringSettings, position);
    if (!pts || pts <= 0) continue;
    const ppg = pts / stats.gp;
    result.set(id, Math.round(ppg * valPerPPG));
  }

  if (canCache) {
    const byStats = getWeakCacheNode(POSITION_VALUE_CACHE, sleeperPlayers);
    const byScoring = getWeakCacheNode(byStats, seasonStats);
    const byKey = getMapCacheNode(byScoring, scoringSettings);
    byKey.set(cacheKey, result);
  }

  return result;
}
