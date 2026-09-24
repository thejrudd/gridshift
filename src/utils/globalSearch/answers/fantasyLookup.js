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

/**
 * Where a player ranks at their position by fantasy points this season.
 */
function resolveRankingAnswer(record, data) {
  const { weeklyStats, players, scoring } = data;
  const sleeperId = record.meta?.sleeperId;
  if (!sleeperId || !weeklyStats || !players) return null;

  const position = String(record.meta?.position ?? '').toUpperCase();
  if (!position) return null;

  const field = [];
  for (const [id, weeks] of Object.entries(weeklyStats)) {
    const player = players[id];
    if (!player || String(player.position ?? '').toUpperCase() !== position) continue;
    const points = seasonPoints(weeks, scoring, position);
    if (points <= 0) continue;
    field.push({ id, points });
  }
  if (!field.length) return null;

  field.sort((left, right) => right.points - left.points);
  const index = field.findIndex((entry) => entry.id === sleeperId);
  if (index === -1) return null;

  const games = weeklyStats[sleeperId]?.length ?? 0;
  const points = field[index].points;

  return {
    kind: 'fantasyRanking',
    title: record.label,
    subtitle: [record.meta?.position, record.meta?.team].filter(Boolean).join(' · '),
    values: [
      { key: 'rank', label: `${position} rank`, display: `${position}${index + 1}` },
      { key: 'pts', label: 'Fantasy points', display: points.toFixed(1) },
      {
        key: 'ppg',
        label: 'Per game',
        display: games ? (points / games).toFixed(1) : '—',
      },
    ],
    footnote: `Of ${Math.min(field.length, RANK_LIMIT)} ${position}s with points this season`,
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
