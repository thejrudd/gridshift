// ── Compare answers ────────────────────────────────────────────────────────
// "jsn vs kupp", "bills vs chiefs", or two fantasy teams in the league.
//
// The parser splits a compare query into two sides and ranking tags each result
// with the side it came from (`compareSide`). This resolver takes the best match
// of the same kind from each side and lines them up.
//
// Read-only over the existing engines like every other resolver: fantasy points
// come from scoringEngine through positionSeason, trade value from
// productionAdjustedValue with its null propagation intact, and team seasons
// from the standings models. It never fetches. With stats not loaded yet, a
// player comparison still answers with who the two players are.

import {
  KIND_FANTASY_TEAM,
  KIND_NFL_TEAM,
  KIND_PLAYER,
} from '../entities/record.js';
import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from '../../ktcApi.js';
import { positionSeason } from './fantasyLookup.js';
import { buildFantasyStandingsModel, buildNflStandingsModel } from './standings.js';
import { fantasyValues, nflValues } from './teamStats.js';

const COMPARABLE_KINDS = [KIND_PLAYER, KIND_NFL_TEAM, KIND_FANTASY_TEAM];

/**
 * The best-scoring record of each comparable kind on one side.
 */
function bestBySide(groups, side) {
  const best = new Map();
  for (const group of groups) {
    for (const entry of group.results ?? []) {
      if (entry.compareSide !== side) continue;
      const kind = entry.record.kind;
      if (!COMPARABLE_KINDS.includes(kind)) continue;
      const current = best.get(kind);
      if (!current || entry.score > current.score) best.set(kind, entry);
    }
  }
  return best;
}

/**
 * One record per side, of the same kind. Each side is read as whatever it most
 * strongly matched: "bills" is a team even though Buffalo's players also match
 * it, so "vane vs bills" is a player against a team — no card — rather than a
 * quiet swap to Buffalo's quarterback.
 */
export function pickComparePair(groups = []) {
  const left = bestBySide(groups, 'left');
  const right = bestBySide(groups, 'right');
  const strongest = (best) => [...best.values()]
    .reduce((top, entry) => (!top || entry.score > top.score ? entry : top), null);

  const leftEntry = strongest(left);
  const rightEntry = strongest(right);
  if (!leftEntry || !rightEntry) return null;
  if (leftEntry.record.kind !== rightEntry.record.kind) return null;
  if (leftEntry.record === rightEntry.record) return null;
  return { kind: leftEntry.record.kind, left: leftEntry.record, right: rightEntry.record };
}

/**
 * Which side a row favours, or null for a tie, a missing value, or a value
 * with no better direction.
 */
function leaderOf(leftValue, rightValue, higherIsBetter = true) {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
  if (leftValue === rightValue) return null;
  const leftWins = higherIsBetter ? leftValue > rightValue : leftValue < rightValue;
  return leftWins ? 'left' : 'right';
}

function row(key, label, left, right, leader = null) {
  return { key, label, left, right, leader };
}

function tradeValueOf(record, season, data) {
  const { ktcPlayers, players, positionalAvgPPG } = data;
  const sleeperId = record.meta?.sleeperId;
  if (!sleeperId || !ktcPlayers?.length || !players) return null;
  const ktcPlayer = findKtcPlayerFromSleeper(sleeperId, players, ktcPlayers);
  if (!ktcPlayer) return null;
  const ktcVal = getKtcValue(ktcPlayer);
  if (ktcVal == null) return null;
  const avgPPG = season?.games ? season.points / season.games : null;
  const position = String(record.meta?.position ?? '').toUpperCase();
  return productionAdjustedValue(ktcVal, avgPPG, positionalAvgPPG?.[position] ?? null);
}

function playerSide(record) {
  return {
    label: record.label,
    sublabel: [record.meta?.position, record.meta?.team].filter(Boolean).join(' · '),
    sleeperId: record.meta?.sleeperId ?? null,
  };
}

function comparePlayers(left, right, data) {
  const leftSeason = positionSeason(left, data);
  const rightSeason = positionSeason(right, data);
  const rows = [];

  if (leftSeason || rightSeason) {
    const samePosition = leftSeason && rightSeason && leftSeason.position === rightSeason.position;
    rows.push(row(
      'rank',
      'Position rank',
      leftSeason ? `${leftSeason.position}${leftSeason.rank}` : '—',
      rightSeason ? `${rightSeason.position}${rightSeason.rank}` : '—',
      // Ranks at different positions are not the same scale.
      samePosition ? leaderOf(leftSeason.rank, rightSeason.rank, false) : null,
    ));
    rows.push(row(
      'pts',
      'Fantasy points',
      leftSeason ? leftSeason.points.toFixed(1) : '—',
      rightSeason ? rightSeason.points.toFixed(1) : '—',
      leaderOf(leftSeason?.points, rightSeason?.points),
    ));
    const ppg = (season) => (season?.games ? season.points / season.games : null);
    rows.push(row(
      'ppg',
      'Per game',
      ppg(leftSeason) == null ? '—' : ppg(leftSeason).toFixed(1),
      ppg(rightSeason) == null ? '—' : ppg(rightSeason).toFixed(1),
      leaderOf(ppg(leftSeason), ppg(rightSeason)),
    ));
    rows.push(row(
      'games',
      'Games',
      leftSeason ? String(leftSeason.games) : '—',
      rightSeason ? String(rightSeason.games) : '—',
    ));
  }

  const leftValue = tradeValueOf(left, leftSeason, data);
  const rightValue = tradeValueOf(right, rightSeason, data);
  if (leftValue != null || rightValue != null) {
    rows.push(row(
      'value',
      'Trade value',
      leftValue == null ? '—' : String(leftValue),
      rightValue == null ? '—' : String(rightValue),
      leaderOf(leftValue, rightValue),
    ));
  }

  return {
    kind: 'compare',
    title: `${left.label} vs ${right.label}`,
    subtitle: rows.length ? 'This season' : null,
    sides: [playerSide(left), playerSide(right)],
    rows,
  };
}

// Team rows: which way is better for each comparable value. Strength of
// schedule has no better direction — it describes the schedule, not the team.
const TEAM_ROW_DIRECTIONS = {
  record: (row_) => row_.winPct,
  pf: (row_) => row_.pointsFor,
  pa: (row_) => (row_.pointsAgainst == null ? null : -row_.pointsAgainst),
  diff: (row_) => row_.pointDifferential,
  pts_per_game: (row_) => row_.pointsPerGame,
};

function teamRows(leftRow, rightRow, valuesOf, keys) {
  const leftValues = valuesOf(leftRow);
  const rightValues = valuesOf(rightRow);
  return keys.map((key) => {
    const direction = TEAM_ROW_DIRECTIONS[key];
    return row(
      key,
      leftValues[key].label,
      leftValues[key].display,
      rightValues[key].display,
      direction ? leaderOf(direction(leftRow), direction(rightRow)) : null,
    );
  });
}

function compareNflTeams(left, right, data) {
  const leftId = String(left.meta?.teamId ?? left.id).toUpperCase();
  const rightId = String(right.meta?.teamId ?? right.id).toUpperCase();
  const side = (record, teamId) => ({
    label: record.label,
    sublabel: record.sublabel ?? '',
    route: { activeTab: 'statistics', statisticsView: 'team', statisticsTeamId: teamId },
  });

  const model = buildNflStandingsModel(data);
  const leftRow = model?.hasResults ? model.byId.get(leftId) : null;
  const rightRow = model?.hasResults ? model.byId.get(rightId) : null;

  return {
    kind: 'compare',
    title: `${left.label} vs ${right.label}`,
    subtitle: leftRow && rightRow ? 'This season' : null,
    sides: [side(left, leftId), side(right, rightId)],
    rows: leftRow && rightRow
      ? teamRows(leftRow, rightRow, nflValues, ['record', 'pf', 'pa', 'diff', 'pts_per_game', 'sos'])
      : [],
    footnote: leftRow && rightRow
      ? 'Strength of schedule is opponents’ average win percentage'
      : null,
  };
}

function compareFantasyTeams(left, right, data) {
  const model = buildFantasyStandingsModel(data.fantasyLeague ?? {});
  const rowFor = (record) => model?.rows.find(
    (entry) => String(entry.rosterId) === String(record.meta?.rosterId ?? record.id),
  ) ?? null;
  const leftRow = rowFor(left);
  const rightRow = rowFor(right);
  const side = (record) => ({
    label: record.label,
    sublabel: record.sublabel ?? '',
    route: record.route ?? null,
  });

  return {
    kind: 'compare',
    title: `${left.label} vs ${right.label}`,
    subtitle: leftRow && rightRow ? 'This season' : null,
    sides: [side(left), side(right)],
    rows: leftRow && rightRow
      ? teamRows(leftRow, rightRow, fantasyValues, ['record', 'pf', 'pa', 'diff', 'pts_per_game'])
      : [],
  };
}

/**
 * Build a comparison card for a "X vs Y" query, or null when the query is not a
 * comparison or its two sides are not the same kind of thing.
 */
export function resolveCompareAnswer(slots, groups = [], data = {}) {
  if (!slots?.compare) return null;
  const pair = pickComparePair(groups);
  if (!pair) return null;

  if (pair.kind === KIND_PLAYER) return comparePlayers(pair.left, pair.right, data);
  if (pair.kind === KIND_NFL_TEAM) return compareNflTeams(pair.left, pair.right, data);
  return compareFantasyTeams(pair.left, pair.right, data);
}
