/*
 * Masthead "where the points come from" card (Fantasy Matchups).
 *
 * Pregame: groups one side's starter outlooks — buildMatchupWinProbability()'s
 * `mine/opponent.outlook.outlooks` — by position. Each starter contributes
 * current + remainingProj, the same per-starter value the side's projected
 * total (`expectedA/B`) sums, so the groups add up to the header number. Any
 * gap (league adjustments) stays visible as its own amount.
 */

import { getWinProbabilityPositionGroup } from './liveWinProbability.js';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'IDP', 'FLEX'];
const POSITION_LABELS = { DEF: 'D/ST', FLEX: 'Other' };
const EPSILON = 0.05;

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

function lastName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '');
}

export function buildMatchupPointSources(sideOutlook, total) {
  const outlooks = (sideOutlook?.outlooks ?? []).filter(Boolean);
  if (!outlooks.length) return null;

  const groups = new Map();
  outlooks.forEach((outlook) => {
    const position = outlook.positionGroup ?? 'FLEX';
    const points = (Number(outlook.current) || 0) + (Number(outlook.remainingProj) || 0);
    const group = groups.get(position) ?? { position, label: POSITION_LABELS[position] ?? position, points: 0, players: [] };
    group.points += points;
    group.players.push({
      id: outlook.playerId,
      name: lastName(outlook.playerName),
      points: round1(points),
      estimated: outlook.source !== 'projection',
    });
    groups.set(position, group);
  });

  const starterTotal = [...groups.values()].reduce((sum, group) => sum + group.points, 0);
  const resolvedTotal = Number.isFinite(Number(total)) ? Number(total) : starterTotal;
  const rows = [...groups.values()]
    .sort((left, right) => POSITION_ORDER.indexOf(left.position) - POSITION_ORDER.indexOf(right.position))
    .map((group) => ({
      ...group,
      points: round1(group.points),
      share: resolvedTotal > 0 ? Math.max(0, group.points) / resolvedTotal : 0,
      players: group.players.sort((left, right) => right.points - left.points),
    }));
  const adjustment = round1(resolvedTotal - starterTotal);

  return {
    phase: 'pregame',
    total: round1(resolvedTotal),
    rows,
    adjustment: Math.abs(adjustment) >= EPSILON ? adjustment : 0,
    estimatedCount: outlooks.filter((outlook) => outlook.source !== 'projection').length,
  };
}

/*
 * Live and final variant of the same card. Groups one side's lineup by
 * position from the points the matchup rows show (the live feed's totals, or
 * a replay moment's), so the rows add up to the header score; any gap (league
 * adjustments) stays visible. `stateFor(player)` returns 'pre' | 'live' |
 * 'final'. Final cards compare each position with its projection when every
 * starter in it has one (`projectionFor(player)`), and name the top bench
 * scorer.
 */
export function buildMatchupScoredSources(players, total, {
  phase = 'live',
  stateFor = () => 'final',
  projectionFor = () => null,
  projectedFinal = null,
  bench = [],
} = {}) {
  const starters = (players ?? []).filter((player) => player?.id && player?.name !== 'Empty');
  if (!starters.length) return null;

  const counts = { pre: 0, live: 0, final: 0 };
  const groups = new Map();
  starters.forEach((player) => {
    const state = player.isBye ? 'final' : (stateFor(player) ?? 'pre');
    counts[state] = (counts[state] ?? 0) + 1;
    const points = state === 'pre' ? 0 : Number(player.weekPts) || 0;
    const rawProjection = projectionFor(player);
    const projection = rawProjection == null || rawProjection === '' ? NaN : Number(rawProjection);
    const position = getWinProbabilityPositionGroup(player.position);
    const group = groups.get(position) ?? { position, label: POSITION_LABELS[position] ?? position, points: 0, projected: 0, projectionComplete: true, players: [] };
    group.points += points;
    if (Number.isFinite(projection)) group.projected += projection;
    else group.projectionComplete = false;
    group.players.push({ id: player.id, name: lastName(player.name), points: round1(points), state });
    groups.set(position, group);
  });

  const starterTotal = [...groups.values()].reduce((sum, group) => sum + group.points, 0);
  const resolvedTotal = Number.isFinite(Number(total)) ? Number(total) : starterTotal;
  const stateRank = { live: 0, final: 1, pre: 2 };
  const rows = [...groups.values()]
    .sort((left, right) => POSITION_ORDER.indexOf(left.position) - POSITION_ORDER.indexOf(right.position))
    .map(({ projected, projectionComplete, ...group }) => ({
      ...group,
      points: round1(group.points),
      share: resolvedTotal > 0 ? Math.max(0, group.points) / resolvedTotal : 0,
      delta: phase === 'final' && projectionComplete ? round1(group.points - projected) : null,
      players: group.players.sort((left, right) => (
        phase === 'live' && stateRank[left.state] !== stateRank[right.state]
          ? stateRank[left.state] - stateRank[right.state]
          : right.points - left.points
      )),
    }));
  const adjustment = round1(resolvedTotal - starterTotal);
  const numericProjectedFinal = projectedFinal == null ? NaN : Number(projectedFinal);
  const topBench = phase === 'final'
    ? (bench ?? [])
      .filter((player) => player?.id && player?.name !== 'Empty' && Number.isFinite(Number(player.weekPts)))
      .reduce((best, player) => (!best || Number(player.weekPts) > best.points
        ? { name: lastName(player.name), points: round1(player.weekPts) }
        : best), null)
    : null;

  return {
    phase,
    total: round1(resolvedTotal),
    rows,
    adjustment: Math.abs(adjustment) >= EPSILON ? adjustment : 0,
    estimatedCount: 0,
    counts,
    projectedFinal: phase === 'live' && Number.isFinite(numericProjectedFinal) ? round1(numericProjectedFinal) : null,
    toGo: phase === 'live' && Number.isFinite(numericProjectedFinal) ? round1(Math.max(0, numericProjectedFinal - resolvedTotal)) : null,
    topBench: topBench && topBench.points > 0 ? topBench : null,
  };
}
