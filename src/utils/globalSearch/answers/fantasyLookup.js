// ── Fantasy lookup answers ─────────────────────────────────────────────────
// "saquon barkley fantasy ranking", "trade value for jefferson", "best available rb".
//
// These consume existing engines read-only — no scoring or valuation logic is
// defined here. If a lookup ever needs new scoring behaviour, that belongs in
// scoringEngine.js with the call-site audit its documentation requires, not in
// a search resolver.

import { calcPoints } from '../../scoringEngine.js';
import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from '../../ktcApi.js';

const RANK_LIMIT = 200;

function seasonPoints(weeks, scoring, position) {
  if (!Array.isArray(weeks)) return 0;
  return weeks.reduce((total, week) => total + calcPoints(week, scoring, position), 0);
}

// The ranked field per position, cached on the stats and scoring objects it was
// built from. Search re-resolves its answer on every keystroke, and re-scoring a
// whole position each time is the kind of cost that shows up as input lag.
const fieldCache = new WeakMap();

function positionField(position, { weeklyStats, players, scoring }) {
  let byScoring = fieldCache.get(weeklyStats);
  if (!byScoring) {
    byScoring = new WeakMap();
    fieldCache.set(weeklyStats, byScoring);
  }
  const scoringKey = scoring && typeof scoring === 'object' ? scoring : fieldCache;
  let byPosition = byScoring.get(scoringKey);
  if (!byPosition || byPosition.players !== players) {
    byPosition = { players, fields: new Map() };
    byScoring.set(scoringKey, byPosition);
  }
  const cached = byPosition.fields.get(position);
  if (cached) return cached;

  const field = [];
  for (const [id, weeks] of Object.entries(weeklyStats)) {
    const player = players[id];
    if (!player || String(player.position ?? '').toUpperCase() !== position) continue;
    const points = seasonPoints(weeks, scoring, position);
    if (points <= 0) continue;
    field.push({ id, points });
  }
  field.sort((left, right) => right.points - left.points);
  byPosition.fields.set(position, field);
  return field;
}

/**
 * A player's season at their position: rank over everyone at the position with
 * points, total points, and games. Rank is computed over the full field before
 * anything is filtered. Null when the stats are not loaded or the player has no
 * points yet.
 */
export function positionSeason(record, data = {}) {
  const { weeklyStats, players } = data;
  const sleeperId = record?.meta?.sleeperId;
  if (!sleeperId || !weeklyStats || !players) return null;

  const position = String(record.meta?.position ?? '').toUpperCase();
  if (!position) return null;

  const field = positionField(position, data);
  const index = field.findIndex((entry) => entry.id === sleeperId);
  if (index === -1) return null;

  return {
    position,
    rank: index + 1,
    fieldSize: field.length,
    points: field[index].points,
    games: weeklyStats[sleeperId]?.length ?? 0,
  };
}

/**
 * Where a player ranks at their position by fantasy points this season.
 */
function resolveRankingAnswer(record, data) {
  const season = positionSeason(record, data);
  if (!season) return null;
  const { position, rank, fieldSize, points, games } = season;

  return {
    kind: 'fantasyRanking',
    title: record.label,
    subtitle: [record.meta?.position, record.meta?.team].filter(Boolean).join(' · '),
    values: [
      { key: 'rank', label: `${position} rank`, display: `${position}${rank}` },
      { key: 'pts', label: 'Fantasy points', display: points.toFixed(1) },
      {
        key: 'ppg',
        label: 'Per game',
        display: games ? (points / games).toFixed(1) : '—',
      },
    ],
    footnote: `Of ${Math.min(fieldSize, RANK_LIMIT)} ${position}s with points this season`,
  };
}

/**
 * A player's trade value, production-adjusted.
 *
 * productionAdjustedValue returns the unadjusted KTC value when production data
 * is missing rather than treating it as zero, and that null propagation is
 * preserved here: a missing value renders as unavailable, never as 0.
 */
function resolveTradeValueAnswer(record, data) {
  const {
    ktcPlayers, players, weeklyStats, scoring, positionalAvgPPG,
  } = data;
  const sleeperId = record.meta?.sleeperId;
  if (!sleeperId || !ktcPlayers?.length || !players) return null;

  const ktcPlayer = findKtcPlayerFromSleeper(sleeperId, players, ktcPlayers);
  if (!ktcPlayer) return null;

  const ktcVal = getKtcValue(ktcPlayer);
  if (ktcVal == null) return null;

  const position = String(record.meta?.position ?? '').toUpperCase();
  const weeks = weeklyStats?.[sleeperId];
  const games = Array.isArray(weeks) ? weeks.length : 0;
  const avgPPG = games ? seasonPoints(weeks, scoring, position) / games : null;
  const adjusted = productionAdjustedValue(ktcVal, avgPPG, positionalAvgPPG?.[position] ?? null);

  const values = [
    { key: 'value', label: 'Trade value', display: adjusted == null ? '—' : String(adjusted) },
  ];
  if (adjusted != null && adjusted !== ktcVal) {
    values.push({ key: 'base', label: 'Market value', display: String(ktcVal) });
  }

  return {
    kind: 'tradeValue',
    title: record.label,
    subtitle: [record.meta?.position, record.meta?.team].filter(Boolean).join(' · '),
    values,
    footnote: avgPPG == null ? 'Market value only — no games played yet' : null,
  };
}

/**
 * Build a fantasy answer for the top player result, or null.
 */
export function resolveFantasyAnswer(slots, record, data = {}) {
  if (!record || record.kind !== 'player') return null;

  if (slots.intents.includes('ranking')) return resolveRankingAnswer(record, data);
  if (slots.intents.includes('tradeValue')) return resolveTradeValueAnswer(record, data);
  return null;
}
