#!/usr/bin/env node

import { getAllPlayers, getAllWeeklyStats } from '../src/api/sleeperApi.js';
import { fetchSeasonSchedule } from '../src/utils/playerApi.js';
import {
  buildDefenseTable,
  computeLeagueAvgPPGByPositionFromDefenseTable,
  getDefenseStrength,
  projectPlayer,
} from '../src/utils/projectionEngine.js';
import { calcPoints, DEFAULT_SCORING, importLeagueScoring } from '../src/utils/scoringEngine.js';

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const DEFAULT_SEASON = '2025';
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);
const POSITION_GROUPS = {
  DE: 'DL',
  DT: 'DL',
  ILB: 'LB',
  OLB: 'LB',
  CB: 'DB',
  S: 'DB',
  SS: 'DB',
  FS: 'DB',
};

function parseArgs(argv) {
  const args = { season: DEFAULT_SEASON, leagueId: null, minActual: 0, minPriorGames: 2 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--league' || arg === '--league-id') args.leagueId = argv[++i];
    else if (arg === '--season') args.season = argv[++i];
    else if (arg === '--min-actual') args.minActual = Number(argv[++i]);
    else if (arg === '--min-prior-games') args.minPriorGames = Number(argv[++i]);
    else if (arg === '--help') {
      console.log('Usage: node scripts/projection-backtest.mjs --league <sleeperLeagueId> [--season 2025]');
      process.exit(0);
    }
  }
  return args;
}

async function sleeper(path) {
  const res = await fetch(`${SLEEPER_BASE}${path}`);
  if (!res.ok) throw new Error(`Sleeper ${res.status}: ${path}`);
  return res.json();
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function rmse(rows) {
  return Math.sqrt(mean(rows.map((row) => row.error ** 2)));
}

function mae(rows) {
  return mean(rows.map((row) => Math.abs(row.error)));
}

function bias(rows) {
  return mean(rows.map((row) => row.error));
}

function weightedScore(rows) {
  const absErrors = rows.map((row) => Math.abs(row.error));
  return (mae(rows) * 0.50) + (rmse(rows) * 0.30) + (quantile(absErrors, 0.90) * 0.20);
}

function summarize(rows) {
  if (!rows.length) {
    return { n: 0, mae: 0, rmse: 0, bias: 0, p90AbsError: 0, weightedScore: 0 };
  }
  const absErrors = rows.map((row) => Math.abs(row.error));
  return {
    n: rows.length,
    mae: Number(mae(rows).toFixed(2)),
    rmse: Number(rmse(rows).toFixed(2)),
    bias: Number(bias(rows).toFixed(2)),
    p90AbsError: Number(quantile(absErrors, 0.90).toFixed(2)),
    weightedScore: Number(weightedScore(rows).toFixed(2)),
  };
}

function positionGroup(pos) {
  return POSITION_GROUPS[pos] ?? pos;
}

function flattenRosters(rosters) {
  const ids = new Set();
  for (const roster of rosters ?? []) {
    for (const id of roster.players ?? []) ids.add(id);
    for (const id of roster.reserve ?? []) ids.add(id);
    for (const id of roster.taxi ?? []) ids.add(id);
  }
  return ids;
}

function inferPlayerTeamForWeek(player, playerWeeks, scheduleMap, week) {
  const prior = [...(playerWeeks ?? [])]
    .filter((entry) => entry.week < week && entry.team)
    .sort((a, b) => b.week - a.week)[0];
  const team = prior?.team?.toUpperCase() ?? player?.team?.toUpperCase() ?? null;
  const schedule = team ? scheduleMap?.[week]?.[team] : null;
  return { team, schedule };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.leagueId) throw new Error('Missing --league <sleeperLeagueId>');

  const league = await sleeper(`/league/${args.leagueId}`);
  if (!league?.league_id) {
    throw new Error(`Sleeper returned no league for ${args.leagueId}. Check that this is the 2025 league ID.`);
  }

  const [rosters, players, weeklyStats, scheduleMap] = await Promise.all([
    sleeper(`/league/${args.leagueId}/rosters`),
    getAllPlayers(),
    getAllWeeklyStats(args.season, 18),
    fetchSeasonSchedule(args.season),
  ]);

  const scoringSettings = { ...DEFAULT_SCORING, ...importLeagueScoring(league.scoring_settings ?? {}) };
  const rosteredIds = flattenRosters(rosters);
  const rows = [];

  for (let week = 1; week <= 18; week += 1) {
    const defenseTable = buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings, undefined, false, week);
    const leagueAvgByPos = computeLeagueAvgPPGByPositionFromDefenseTable(defenseTable, week);

    for (const playerId of Object.keys(weeklyStats)) {
      const player = players[playerId];
      if (!player || !POSITIONS.has(player.position)) continue;
      if (rosteredIds.size && !rosteredIds.has(playerId)) continue;

      const weeklyArr = weeklyStats[playerId] ?? [];
      const actualEntry = weeklyArr.find((entry) => entry.week === week);
      if (!actualEntry) continue;

      const priorScoredGames = weeklyArr
        .filter((entry) => entry.week < week)
        .map((entry) => calcPoints(entry, scoringSettings, player.position))
        .filter((points) => points > 0).length;
      if (priorScoredGames < args.minPriorGames) continue;

      const actual = calcPoints(actualEntry, scoringSettings, player.position);
      if (actual <= args.minActual) continue;

      const { team, schedule } = inferPlayerTeamForWeek(player, weeklyArr, scheduleMap, week);
      const oppTeam = actualEntry.opp?.toUpperCase() ?? schedule?.opp ?? null;
      const isHome = typeof schedule?.home === 'boolean' ? schedule.home : (actualEntry.home ?? null);
      const defStrength = oppTeam ? getDefenseStrength(defenseTable, oppTeam, player.position, week) : null;
      const normPos = positionGroup(player.position);

      const projection = projectPlayer({
        weeklyArr,
        pos: player.position,
        oppTeam,
        isHome,
        isIndoor: false,
        weather: null,
        allWeeklyStats: weeklyStats,
        players,
        scoringSettings,
        scheduleMap,
        week,
        defStrength,
        leagueAvg: leagueAvgByPos[normPos] ?? leagueAvgByPos[player.position] ?? 0,
        skipOpponentLookup: true,
      });

      if (!projection) continue;

      rows.push({
        week,
        playerId,
        name: player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
        pos: normPos,
        team,
        oppTeam,
        projected: projection.projected,
        actual: Number(actual.toFixed(2)),
        error: Number((projection.projected - actual).toFixed(2)),
        factors: projection.factors,
      });
    }
  }

  const byPosition = {};
  for (const row of rows) {
    byPosition[row.pos] ??= [];
    byPosition[row.pos].push(row);
  }

  const report = {
    league: { id: league.league_id, name: league.name, season: args.season },
    sample: { rows: rows.length, minActual: args.minActual, minPriorGames: args.minPriorGames },
    overall: summarize(rows),
    byPosition: Object.fromEntries(
      Object.entries(byPosition)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pos, posRows]) => [pos, summarize(posRows)]),
    ),
    worstMisses: [...rows]
      .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
      .slice(0, 25)
      .map(({ factors, ...row }) => ({ ...row, factors })),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
