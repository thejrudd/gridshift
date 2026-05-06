#!/usr/bin/env node

import { getAllPlayers, getAllWeeklyStats } from '../src/api/sleeperApi.js';
import { fetchGameWeather } from '../src/api/weatherApi.js';
import { NFL_ODDS } from '../src/data/odds.js';
import { STADIUMS, WEEK_DATES_2025 } from '../src/data/stadiums.js';
import { fetchSeasonSchedule } from '../src/utils/playerApi.js';
import {
  buildDefenseTable,
  computeLeagueAvgPPGByPositionFromDefenseTable,
  getDefenseStrength,
  projectPlayer,
} from '../src/utils/projectionEngine.js';
import { calcPoints, DEFAULT_SCORING, importLeagueScoring } from '../src/utils/scoringEngine.js';

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
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

const FIRST_MATRIX = {
  QB: { recentWeight: 0.45, zeroMode: 'active-qb', locationMinEach: 3, locationClamp: [0.92, 1.08], matchupClamp: [0.86, 1.14], usageClamp: [0.92, 1.08], minSnapShare: 0.70 },
  RB: { recentWeight: 0.55, zeroMode: 'active-rb', locationMinEach: 3, locationClamp: [0.90, 1.10], matchupClamp: [0.82, 1.18], usageClamp: [0.82, 1.18], minSnapShare: 0.15 },
  WR: { recentWeight: 0.50, zeroMode: 'active-target', locationMinEach: 3, locationClamp: [0.91, 1.09], matchupClamp: [0.84, 1.16], usageClamp: [0.84, 1.16], minSnapShare: 0.25 },
  TE: { recentWeight: 0.50, zeroMode: 'active-target', locationMinEach: 3, locationClamp: [0.91, 1.09], matchupClamp: [0.84, 1.16], usageClamp: [0.84, 1.16], minSnapShare: 0.30 },
  K:  { recentWeight: 0.30, zeroMode: 'active-gp', locationMinEach: Infinity, locationClamp: [1, 1], matchupClamp: [0.90, 1.10], usageClamp: [1, 1], minSnapShare: 0 },
  DL: { recentWeight: 0.35, zeroMode: 'active-idp', locationMinEach: Infinity, locationClamp: [1, 1], matchupClamp: [0.92, 1.08], usageClamp: [0.88, 1.12], minSnapShare: 0.30 },
  LB: { recentWeight: 0.40, zeroMode: 'active-idp', locationMinEach: Infinity, locationClamp: [1, 1], matchupClamp: [0.90, 1.10], usageClamp: [0.86, 1.14], minSnapShare: 0.45 },
  DB: { recentWeight: 0.35, zeroMode: 'active-idp', locationMinEach: Infinity, locationClamp: [1, 1], matchupClamp: [0.92, 1.08], usageClamp: [0.88, 1.12], minSnapShare: 0.45 },
};

const FIRST_MATRIX_NO_MATCHUP = Object.fromEntries(
  Object.entries(FIRST_MATRIX).map(([pos, cfg]) => [pos, { ...cfg, matchupClamp: [1, 1] }]),
);

const POSITION_LIST = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

const BASE_ONLY_NO_MATCHUP = Object.fromEntries(
  POSITION_LIST.map((pos) => [pos, {
    recentWeight: 0.60,
    zeroMode: 'scored-only',
    locationMinEach: Infinity,
    locationClamp: [1, 1],
    matchupClamp: [1, 1],
    usageClamp: [1, 1],
    minSnapShare: 0,
  }]),
);

const PRODUCTION_IDP_USAGE_MATRIX = Object.fromEntries(
  POSITION_LIST.map((pos) => {
    const base = { ...BASE_ONLY_NO_MATCHUP[pos] };
    if (pos === 'DL') {
      return [pos, {
        ...base,
        zeroMode: 'active-idp',
        usageClamp: [0.88, 1.12],
        minSnapShare: 0.30,
      }];
    }
    if (pos === 'LB') {
      return [pos, {
        ...base,
        zeroMode: 'active-idp',
        usageClamp: [0.86, 1.14],
        minSnapShare: 0.45,
      }];
    }
    if (pos === 'DB') {
      return [pos, {
        ...base,
        zeroMode: 'active-idp',
        usageClamp: [0.88, 1.12],
        minSnapShare: 0.45,
      }];
    }
    return [pos, base];
  }),
);

const GATED_LOCATION_NO_MATCHUP = Object.fromEntries(
  POSITION_LIST.map((pos) => [pos, {
    ...BASE_ONLY_NO_MATCHUP[pos],
    locationMinEach: ['QB', 'RB', 'WR', 'TE'].includes(pos) ? 3 : Infinity,
    locationClamp: ['QB', 'RB', 'WR', 'TE'].includes(pos) ? [0.92, 1.08] : [1, 1],
  }]),
);

const CURRENT_WEIGHTS_LOCATION_ONLY_NO_MATCHUP = Object.fromEntries(
  POSITION_LIST.map((pos) => [pos, {
    ...BASE_ONLY_NO_MATCHUP[pos],
    locationMinEach: 1,
    locationClamp: [0.01, 100],
  }]),
);

const CURRENT_WEIGHTS_USAGE_ONLY_NO_MATCHUP = Object.fromEntries(
  POSITION_LIST.map((pos) => [pos, {
    ...BASE_ONLY_NO_MATCHUP[pos],
    usageClamp: ['QB', 'RB', 'WR', 'TE'].includes(pos) ? [0.75, 1.25] : [1, 1],
  }]),
);

const CURRENT_WEIGHTS_GATED_LOCATION_USAGE_NO_MATCHUP = Object.fromEntries(
  POSITION_LIST.map((pos) => [pos, {
    ...BASE_ONLY_NO_MATCHUP[pos],
    locationMinEach: ['QB', 'RB', 'WR', 'TE'].includes(pos) ? 3 : Infinity,
    locationClamp: ['QB', 'RB', 'WR', 'TE'].includes(pos) ? [0.92, 1.08] : [1, 1],
    usageClamp: ['QB', 'RB', 'WR', 'TE'].includes(pos) ? [0.75, 1.25] : [1, 1],
  }]),
);

function withRecentWeights(baseMatrix, weights) {
  return Object.fromEntries(
    POSITION_LIST.map((pos) => [pos, { ...baseMatrix[pos], recentWeight: weights[pos] ?? baseMatrix[pos].recentWeight }]),
  );
}

const CONSERVATIVE_SKILL_NO_MATCHUP = withRecentWeights(FIRST_MATRIX_NO_MATCHUP, {
  QB: 0.40,
  RB: 0.50,
  WR: 0.45,
  TE: 0.45,
  K: 0.25,
});

const MODEST_RECENT_SKILL_NO_MATCHUP = withRecentWeights(FIRST_MATRIX_NO_MATCHUP, {
  QB: 0.50,
  RB: 0.60,
  WR: 0.55,
  TE: 0.55,
});

const CONSERVATIVE_IDP_NO_MATCHUP = withRecentWeights(FIRST_MATRIX_NO_MATCHUP, {
  DL: 0.30,
  LB: 0.35,
  DB: 0.30,
});

const MODEST_RECENT_IDP_NO_MATCHUP = withRecentWeights(FIRST_MATRIX_NO_MATCHUP, {
  DL: 0.40,
  LB: 0.45,
  DB: 0.40,
});

const QB_RB_RECENT_ONLY_NO_MATCHUP = withRecentWeights(FIRST_MATRIX_NO_MATCHUP, {
  QB: 0.50,
  RB: 0.60,
});

const RECEIVERS_CONSERVATIVE_ONLY_NO_MATCHUP = withRecentWeights(FIRST_MATRIX_NO_MATCHUP, {
  WR: 0.45,
  TE: 0.45,
});

const IDP_WEIGHT_VARIANTS = Object.fromEntries([
  ['idpWeightDl30', { DL: 0.30 }],
  ['idpWeightDl35', { DL: 0.35 }],
  ['idpWeightDl40', { DL: 0.40 }],
  ['idpWeightDl45', { DL: 0.45 }],
  ['idpWeightLb30', { LB: 0.30 }],
  ['idpWeightLb35', { LB: 0.35 }],
  ['idpWeightLb40', { LB: 0.40 }],
  ['idpWeightLb45', { LB: 0.45 }],
  ['idpWeightDb30', { DB: 0.30 }],
  ['idpWeightDb35', { DB: 0.35 }],
  ['idpWeightDb40', { DB: 0.40 }],
  ['idpWeightDb45', { DB: 0.45 }],
  ['idpWeightLow', { DL: 0.30, LB: 0.35, DB: 0.30 }],
  ['idpWeightAll30', { DL: 0.30, LB: 0.30, DB: 0.30 }],
  ['idpWeightMid', { DL: 0.35, LB: 0.40, DB: 0.35 }],
  ['idpWeightHigh', { DL: 0.40, LB: 0.45, DB: 0.40 }],
].map(([key, weights]) => [key, withRecentWeights(BASE_ONLY_NO_MATCHUP, weights)]));

const OFFENSE_WEIGHT_VARIANTS = Object.fromEntries([
  ['offenseBaseAnchor', { QB: 0.60, RB: 0.60, WR: 0.60, TE: 0.60, K: 0.60 }],
  ['offenseConservativeQbK', { QB: 0.45, RB: 0.60, WR: 0.60, TE: 0.60, K: 0.35 }],
  ['offenseVolumeRecent', { QB: 0.50, RB: 0.65, WR: 0.60, TE: 0.60, K: 0.35 }],
  ['offenseReceiverDamped', { QB: 0.50, RB: 0.65, WR: 0.50, TE: 0.50, K: 0.30 }],
  ['offenseBalancedDamped', { QB: 0.50, RB: 0.60, WR: 0.55, TE: 0.55, K: 0.30 }],
  ['offenseAggressiveRbOnly', { QB: 0.50, RB: 0.70, WR: 0.55, TE: 0.55, K: 0.30 }],
].map(([key, weights]) => [key, withRecentWeights(BASE_ONLY_NO_MATCHUP, weights)]));

const COMBINED_WEIGHT_VARIANTS = Object.fromEntries([
  ['combinedIdpLowReceivers', { QB: 0.50, RB: 0.60, WR: 0.50, TE: 0.50, K: 0.35, DL: 0.30, LB: 0.35, DB: 0.30 }],
  ['combinedIdpAll30Receivers', { QB: 0.50, RB: 0.60, WR: 0.50, TE: 0.50, K: 0.35, DL: 0.30, LB: 0.30, DB: 0.30 }],
  ['combinedIdpAll30Balanced', { QB: 0.50, RB: 0.60, WR: 0.55, TE: 0.55, K: 0.30, DL: 0.30, LB: 0.30, DB: 0.30 }],
  ['combinedConservativeQbIdpAll30', { QB: 0.45, RB: 0.60, WR: 0.50, TE: 0.50, K: 0.35, DL: 0.30, LB: 0.30, DB: 0.30 }],
].map(([key, weights]) => [key, withRecentWeights(BASE_ONLY_NO_MATCHUP, weights)]));

const DAMPENED_MATCHUP_RULES = {
  QB: { mode: 'power', minGames: 6, power: 0.35, clamp: [0.94, 1.06] },
  DL: { mode: 'power', minGames: 6, power: 0.40, clamp: [0.93, 1.08] },
  RB: { mode: 'disabled' },
  WR: { mode: 'disabled' },
  TE: { mode: 'disabled' },
  K: { mode: 'disabled' },
  LB: { mode: 'disabled' },
  DB: { mode: 'disabled' },
};

const NO_MATCHUP_RULES = Object.fromEntries(POSITION_LIST.map((pos) => [pos, { mode: 'disabled' }]));

function matchupRulesWith(overrides) {
  return {
    ...NO_MATCHUP_RULES,
    ...overrides,
  };
}

const TUNED_BASE_MATRIX = COMBINED_WEIGHT_VARIANTS.combinedIdpLowReceivers;
const MATCHUP_TEST_VARIANTS = {
  tunedNoMatchup: {
    matrix: TUNED_BASE_MATRIX,
    matchupRules: NO_MATCHUP_RULES,
  },
  tunedCurrentQbDl: {
    matrix: TUNED_BASE_MATRIX,
    matchupRules: DAMPENED_MATCHUP_RULES,
  },
  tunedTightQbDl: {
    matrix: TUNED_BASE_MATRIX,
    matchupRules: matchupRulesWith({
      QB: { mode: 'power', minGames: 8, power: 0.25, clamp: [0.96, 1.04] },
      DL: { mode: 'power', minGames: 8, power: 0.25, clamp: [0.96, 1.05] },
    }),
  },
  tunedQbOnly: {
    matrix: TUNED_BASE_MATRIX,
    matchupRules: matchupRulesWith({
      QB: { mode: 'power', minGames: 6, power: 0.35, clamp: [0.94, 1.06] },
    }),
  },
  tunedDlOnly: {
    matrix: TUNED_BASE_MATRIX,
    matchupRules: matchupRulesWith({
      DL: { mode: 'power', minGames: 6, power: 0.40, clamp: [0.93, 1.08] },
    }),
  },
  tunedWideQbDl: {
    matrix: TUNED_BASE_MATRIX,
    matchupRules: matchupRulesWith({
      QB: { mode: 'power', minGames: 6, power: 0.45, clamp: [0.92, 1.08] },
      DL: { mode: 'power', minGames: 6, power: 0.50, clamp: [0.90, 1.10] },
    }),
  },
};

const VARIANT_KEYS = [
  'baseline',
  'currentNoMatchup',
  'currentDampenedQbDl',
  'productionIdpUsage',
  ...Object.keys(IDP_WEIGHT_VARIANTS),
  ...Object.keys(OFFENSE_WEIGHT_VARIANTS),
  ...Object.keys(COMBINED_WEIGHT_VARIANTS),
  ...Object.keys(MATCHUP_TEST_VARIANTS),
  'baseOnlyNoMatchup',
  'locationOnlyNoMatchup',
  'usageOnlyNoMatchup',
  'gatedLocationUsageNoMatchup',
  'gatedLocationNoMatchup',
  'firstMatrix',
  'firstMatrixNoMatchup',
  'conservativeSkillNoMatchup',
  'modestRecentSkillNoMatchup',
  'conservativeIdpNoMatchup',
  'modestRecentIdpNoMatchup',
  'qbRbRecentOnlyNoMatchup',
  'receiversConservativeOnlyNoMatchup',
  'firstMatrixDampenedMatchup',
  'iteration1Hybrid',
  'iteration2Hybrid',
];
const CONTEXT_VARIANT_KEYS = [
  'weatherCurrent',
  'weatherNoMatchup',
  'teamTotalTiny',
  'teamTotalModerate',
  'weatherTeamTotalTiny',
  'weatherNoMatchupTeamTotalTiny',
];

const SPLITS = [
  { label: 'test_11_14', trainWeeks: [5, 10], testWeeks: [11, 14] },
  { label: 'test_13_16', trainWeeks: [5, 12], testWeeks: [13, 16] },
  { label: 'holdout_15_18', trainWeeks: [5, 14], testWeeks: [15, 18] },
];

function parseArgs(argv) {
  const args = { season: DEFAULT_SEASON, leagueId: null, minActual: 0, minPriorGames: 2, compact: false, context: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--league' || arg === '--league-id') args.leagueId = argv[++i];
    else if (arg === '--season') args.season = argv[++i];
    else if (arg === '--min-actual') args.minActual = Number(argv[++i]);
    else if (arg === '--min-prior-games') args.minPriorGames = Number(argv[++i]);
    else if (arg === '--compact') args.compact = true;
    else if (arg === '--context') args.context = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/projection-variant-backtest.mjs --league <sleeperLeagueId> [--season 2025] [--compact] [--context]');
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

const ESPN_ABBR_TO_SLEEPER = { WSH: 'WAS', JAC: 'JAX' };
function normalizeEspnAbbr(abbr) {
  const upper = abbr?.toUpperCase?.() ?? '';
  return ESPN_ABBR_TO_SLEEPER[upper] ?? upper;
}

async function fetchDetailedWeekSchedule(season, week) {
  const url = `${ESPN_SCOREBOARD}?seasontype=2&week=${week}&dates=${season}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  const data = await res.json();
  const map = {};
  for (const event of data?.events ?? []) {
    const competition = event?.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const homeC = competitors.find((competitor) => competitor.homeAway === 'home');
    const awayC = competitors.find((competitor) => competitor.homeAway === 'away');
    if (!homeC || !awayC) continue;
    const homeAbbr = normalizeEspnAbbr(homeC.team?.abbreviation);
    const awayAbbr = normalizeEspnAbbr(awayC.team?.abbreviation);
    if (!homeAbbr || !awayAbbr) continue;
    const base = {
      date: event.date?.slice(0, 10) ?? WEEK_DATES_2025[week] ?? null,
      eventId: event.id ?? null,
      homeTeam: homeAbbr,
      awayTeam: awayAbbr,
      neutralSite: competition?.neutralSite === true,
    };
    map[homeAbbr] = { ...base, opp: awayAbbr, home: true };
    map[awayAbbr] = { ...base, opp: homeAbbr, home: false };
  }
  return map;
}

async function fetchDetailedSeasonSchedule(season) {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const entries = await Promise.all(weeks.map(async (week) => [week, await fetchDetailedWeekSchedule(season, week).catch(() => ({}))]));
  return Object.fromEntries(entries);
}

function oddsEntriesForSeason(season) {
  const values = [];
  for (const weekData of Object.values(NFL_ODDS?.[season] ?? {})) {
    for (const odds of Object.values(weekData ?? {})) {
      if (Number.isFinite(odds?.total) && Number.isFinite(odds?.spread)) {
        values.push((odds.total / 2) - (odds.spread / 2));
      }
    }
  }
  return values;
}

function getTeamTotalFactor(pos, odds, avgTeamTotal, mode = 'tiny') {
  const posGroup = positionGroup(pos);
  if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(posGroup)) return 1;
  if (!odds || !avgTeamTotal || avgTeamTotal <= 0) return 1;

  const impliedTeamTotal = (odds.total / 2) - (odds.spread / 2);
  if (!Number.isFinite(impliedTeamTotal) || impliedTeamTotal <= 0) return 1;

  const config = {
    tiny: {
      QB: { power: 0.25, clamp: [0.96, 1.04] },
      RB: { power: 0.20, clamp: [0.97, 1.03] },
      WR: { power: 0.25, clamp: [0.96, 1.04] },
      TE: { power: 0.20, clamp: [0.97, 1.03] },
      K: { power: 0.35, clamp: [0.94, 1.06] },
    },
    moderate: {
      QB: { power: 0.40, clamp: [0.94, 1.06] },
      RB: { power: 0.30, clamp: [0.95, 1.05] },
      WR: { power: 0.40, clamp: [0.94, 1.06] },
      TE: { power: 0.30, clamp: [0.95, 1.05] },
      K: { power: 0.50, clamp: [0.92, 1.08] },
    },
  }[mode]?.[posGroup];
  if (!config) return 1;
  const factor = (impliedTeamTotal / avgTeamTotal) ** config.power;
  return clamp(factor, config.clamp[0], config.clamp[1]);
}

async function getGameContext({ season, week, team, detailedSchedule, weatherCache }) {
  const schedule = team ? detailedSchedule?.[week]?.[team] : null;
  if (!schedule) return { schedule: null, isIndoor: false, weather: null, weatherKnown: false, odds: null };
  const homeTeam = schedule.homeTeam ?? (schedule.home ? team : schedule.opp);
  const stadium = homeTeam ? STADIUMS[homeTeam] : null;
  const isIndoor = stadium?.indoor === true;
  let weather = null;
  let weatherKnown = isIndoor;
  if (!isIndoor && stadium?.lat != null && stadium?.lng != null && schedule.date) {
    const key = `${homeTeam}_${schedule.date}`;
    if (!weatherCache.has(key)) {
      weatherCache.set(key, await fetchGameWeather(stadium.lat, stadium.lng, schedule.date));
    }
    weather = weatherCache.get(key);
    weatherKnown = weather != null;
  }
  return {
    schedule,
    isIndoor,
    weather,
    weatherKnown,
    odds: NFL_ODDS?.[season]?.[week]?.[team] ?? null,
  };
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

function summarize(rows, projectionKey) {
  if (!rows.length) return { n: 0, mae: 0, rmse: 0, bias: 0, p90AbsError: 0, weightedScore: 0 };
  const errors = rows.map((row) => row[projectionKey] - row.actual);
  const absErrors = errors.map(Math.abs);
  const mae = mean(absErrors);
  const rmse = Math.sqrt(mean(errors.map((error) => error ** 2)));
  const bias = mean(errors);
  const p90AbsError = quantile(absErrors, 0.90);
  return {
    n: rows.length,
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    bias: Number(bias.toFixed(2)),
    p90AbsError: Number(p90AbsError.toFixed(2)),
    weightedScore: Number(((mae * 0.50) + (rmse * 0.30) + (p90AbsError * 0.20)).toFixed(2)),
  };
}

function summarizeByPosition(rows, projectionKey) {
  const byPosition = {};
  for (const row of rows) {
    byPosition[row.pos] ??= [];
    byPosition[row.pos].push(row);
  }
  return Object.fromEntries(
    Object.entries(byPosition)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pos, posRows]) => [pos, summarize(posRows, projectionKey)]),
  );
}

function deltaSummary(variant, baseline) {
  return {
    weightedScore: Number((variant.weightedScore - baseline.weightedScore).toFixed(2)),
    mae: Number((variant.mae - baseline.mae).toFixed(2)),
    rmse: Number((variant.rmse - baseline.rmse).toFixed(2)),
    p90AbsError: Number((variant.p90AbsError - baseline.p90AbsError).toFixed(2)),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function statSum(entry, keys) {
  return keys.reduce((sum, key) => sum + Number(entry?.[key] ?? 0), 0);
}

function snapShare(entry, side) {
  const playerSnaps = side === 'def'
    ? Number(entry?.def_snp ?? entry?.idp_snp ?? entry?.snap_def ?? 0)
    : Number(entry?.off_snp ?? 0);
  const teamSnaps = side === 'def'
    ? Number(entry?.tm_def_snp ?? entry?.team_def_snp ?? entry?.tm_snp_def ?? 0)
    : Number(entry?.tm_off_snp ?? 0);
  return teamSnaps > 0 ? playerSnaps / teamSnaps : null;
}

function isActiveZero(entry, pos, cfg) {
  if (Number(entry?.gp ?? 0) <= 0) return false;
  if (cfg.zeroMode === 'scored-only') return false;
  if (cfg.zeroMode === 'active-gp') return true;
  if (cfg.zeroMode === 'active-qb') return statSum(entry, ['pass_att', 'rush_att']) >= 5;
  if (cfg.zeroMode === 'active-rb') {
    const share = snapShare(entry, 'off');
    return (share != null && share >= cfg.minSnapShare) || statSum(entry, ['rush_att', 'rec_tgt', 'rec']) > 0;
  }
  if (cfg.zeroMode === 'active-target') {
    const share = snapShare(entry, 'off');
    return (share != null && share >= cfg.minSnapShare) || statSum(entry, ['rec_tgt', 'rec']) > 0;
  }
  if (cfg.zeroMode === 'active-idp') {
    const share = snapShare(entry, 'def');
    return (share != null && share >= cfg.minSnapShare);
  }
  return false;
}

function pointsSamples(priorWeekly, scoringSettings, pos, cfg) {
  return priorWeekly
    .map((entry) => {
      const points = calcPoints(entry, scoringSettings, pos);
      if (points > 0 || isActiveZero(entry, pos, cfg)) return { entry, points };
      return null;
    })
    .filter(Boolean);
}

function ratioTrend(samples, valueFn, recentWeeks = 4) {
  const values = samples
    .map(({ entry }) => ({ week: entry.week, value: valueFn(entry) }))
    .filter((item) => item.value != null && Number.isFinite(item.value));
  if (values.length < 3) return null;
  const seasonAvg = mean(values.map((item) => item.value));
  if (seasonAvg <= 0) return null;
  const recent = [...values].sort((a, b) => a.week - b.week).slice(-recentWeeks);
  if (recent.length < 2) return null;
  return mean(recent.map((item) => item.value)) / seasonAvg;
}

function usageFactor(samples, posGroup, cfg) {
  if (cfg.usageClamp[0] === 1 && cfg.usageClamp[1] === 1) return 1;

  const ratios = [];
  if (['QB', 'RB', 'WR', 'TE'].includes(posGroup)) {
    const snapRatio = ratioTrend(samples, (entry) => snapShare(entry, 'off'));
    if (snapRatio != null) ratios.push(snapRatio);
  }
  if (['DL', 'LB', 'DB'].includes(posGroup)) {
    const snapRatio = ratioTrend(samples, (entry) => snapShare(entry, 'def'));
    if (snapRatio != null) ratios.push(snapRatio);
  }

  const opportunityKeys = {
    RB: ['rush_att', 'rec_tgt', 'rec'],
    WR: ['rec_tgt', 'rec'],
    TE: ['rec_tgt', 'rec'],
    DL: ['idp_sack', 'idp_qbhit', 'idp_qb_hit', 'idp_tkl_loss', 'idp_tkl'],
    LB: ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss'],
    DB: ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_pd', 'idp_pass_def', 'idp_int'],
  }[posGroup];
  if (opportunityKeys) {
    const opportunityRatio = ratioTrend(samples, (entry) => statSum(entry, opportunityKeys));
    if (opportunityRatio != null) ratios.push(opportunityRatio);
  }

  if (!ratios.length) return 1;
  return clamp(mean(ratios), cfg.usageClamp[0], cfg.usageClamp[1]);
}

function matchupFactor(posGroup, defStrength, leagueAvg, cfg, matchupRules = null) {
  if (matchupRules) {
    const rule = matchupRules[posGroup] ?? { mode: 'disabled' };
    if (rule.mode === 'disabled') return 1;
    if (!defStrength || leagueAvg <= 0) return 1;
    if ((defStrength.gamesAnalyzed ?? 0) < rule.minGames) return 1;
    const rawFactor = defStrength.ptsAllowedPerGame / leagueAvg;
    if (!Number.isFinite(rawFactor) || rawFactor <= 0) return 1;
    if (rule.mode === 'power') {
      return clamp(rawFactor ** rule.power, rule.clamp[0], rule.clamp[1]);
    }
    return 1;
  }

  if (!defStrength || leagueAvg <= 0) return 1;
  return clamp(defStrength.ptsAllowedPerGame / leagueAvg, cfg.matchupClamp[0], cfg.matchupClamp[1]);
}

function projectVariantPlayer({
  weeklyArr,
  pos,
  isHome,
  defStrength,
  leagueAvg,
  scoringSettings,
  week,
  matrix = FIRST_MATRIX,
  matchupRules = null,
}) {
  const posGroup = positionGroup(pos);
  const cfg = matrix[posGroup];
  if (!cfg) return null;

  const priorWeekly = (week != null ? weeklyArr.filter((entry) => entry.week < week) : weeklyArr)
    .slice()
    .sort((a, b) => a.week - b.week);
  const samples = pointsSamples(priorWeekly, scoringSettings, pos, cfg);
  if (samples.length < 2) return null;

  const seasonAvg = mean(samples.map((sample) => sample.points));
  if (seasonAvg <= 0) return null;
  const recentSamples = samples.slice(-4);
  const recentAvg = recentSamples.length >= 2 ? mean(recentSamples.map((sample) => sample.points)) : seasonAvg;
  const blendedBase = recentSamples.length >= 2
    ? (recentAvg * cfg.recentWeight) + (seasonAvg * (1 - cfg.recentWeight))
    : seasonAvg;

  let locationFactor = 1;
  if (Number.isFinite(cfg.locationMinEach) && typeof isHome === 'boolean') {
    const homeSamples = samples.filter((sample) => sample.entry.home === true || sample.entry.home === 1);
    const awaySamples = samples.filter((sample) => sample.entry.home === false || sample.entry.home === 0);
    if (homeSamples.length >= cfg.locationMinEach && awaySamples.length >= cfg.locationMinEach) {
      const locationAvg = mean((isHome ? homeSamples : awaySamples).map((sample) => sample.points));
      locationFactor = clamp(locationAvg / seasonAvg, cfg.locationClamp[0], cfg.locationClamp[1]);
    }
  }

  const oppFactor = matchupFactor(posGroup, defStrength, leagueAvg, cfg, matchupRules);

  const usage = usageFactor(samples, posGroup, cfg);
  return Number((blendedBase * locationFactor * oppFactor * usage).toFixed(1));
}

function inferPlayerTeamForWeek(player, playerWeeks, scheduleMap, week) {
  const prior = [...(playerWeeks ?? [])]
    .filter((entry) => entry.week < week && entry.team)
    .sort((a, b) => b.week - a.week)[0];
  const team = prior?.team?.toUpperCase() ?? player?.team?.toUpperCase() ?? null;
  const schedule = team ? scheduleMap?.[week]?.[team] : null;
  return { team, schedule };
}

function inWeekRange(row, [start, end]) {
  return row.week >= start && row.week <= end;
}

function buildRecommendation(rows, variantKeys = VARIANT_KEYS) {
  const byPosition = {};
  for (const row of rows) {
    byPosition[row.pos] ??= [];
    byPosition[row.pos].push(row);
  }

  const ship = [];
  const hold = [];
  const reason = {};
  for (const [pos, posRows] of Object.entries(byPosition).sort(([a], [b]) => a.localeCompare(b))) {
    const candidates = Object.fromEntries(
      variantKeys.map((key) => [key, summarize(posRows, `${key}Projected`)]),
    );
    const baseline = candidates.baseline;
    const [bestName, best] = Object.entries(candidates)
      .sort(([, left], [, right]) => left.weightedScore - right.weightedScore)[0];
    const delta = baseline.weightedScore - best.weightedScore;
    const pct = baseline.weightedScore > 0 ? delta / baseline.weightedScore : 0;
    const enoughRows = posRows.length >= 100 || pos === 'K';
    const shouldShip = enoughRows && bestName !== 'baseline' && (delta >= 0.15 || pct >= 0.015);
    (shouldShip ? ship : hold).push(pos);
    reason[pos] = {
      baseline: baseline.weightedScore,
      bestVariant: bestName,
      bestWeightedScore: best.weightedScore,
      improvement: Number(delta.toFixed(2)),
      improvementPct: Number((pct * 100).toFixed(1)),
      rows: posRows.length,
    };
  }
  return { ship, hold, reason };
}

async function main() {
  const args = parseArgs(process.argv);
  const variantKeys = args.context ? [...VARIANT_KEYS, ...CONTEXT_VARIANT_KEYS] : VARIANT_KEYS;
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
  const detailedSchedule = args.context ? await fetchDetailedSeasonSchedule(args.season) : null;
  const weatherCache = new Map();
  const avgTeamTotal = mean(oddsEntriesForSeason(args.season));
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
      const leagueAvg = leagueAvgByPos[normPos] ?? leagueAvgByPos[player.position] ?? 0;

      const baseline = projectPlayer({
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
        leagueAvg,
        skipOpponentLookup: true,
      });
      if (!baseline) continue;

      const currentNoMatchup = projectPlayer({
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
        defStrength: null,
        leagueAvg: 0,
        skipOpponentLookup: true,
      });
      if (!currentNoMatchup) continue;

      const currentDampenedQbDlProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: BASE_ONLY_NO_MATCHUP,
        matchupRules: DAMPENED_MATCHUP_RULES,
      });
      if (currentDampenedQbDlProjected == null) continue;

      const idpWeightProjected = {};
      for (const [key, matrix] of Object.entries(IDP_WEIGHT_VARIANTS)) {
        const projected = projectVariantPlayer({
          weeklyArr,
          pos: player.position,
          isHome,
          defStrength,
          leagueAvg,
          scoringSettings,
          week,
          matrix,
          matchupRules: DAMPENED_MATCHUP_RULES,
        });
        if (projected == null) continue;
        idpWeightProjected[`${key}Projected`] = projected;
      }
      if (Object.keys(idpWeightProjected).length !== Object.keys(IDP_WEIGHT_VARIANTS).length) continue;

      const offenseWeightProjected = {};
      for (const [key, matrix] of Object.entries(OFFENSE_WEIGHT_VARIANTS)) {
        const projected = projectVariantPlayer({
          weeklyArr,
          pos: player.position,
          isHome,
          defStrength,
          leagueAvg,
          scoringSettings,
          week,
          matrix,
          matchupRules: DAMPENED_MATCHUP_RULES,
        });
        if (projected == null) continue;
        offenseWeightProjected[`${key}Projected`] = projected;
      }
      if (Object.keys(offenseWeightProjected).length !== Object.keys(OFFENSE_WEIGHT_VARIANTS).length) continue;

      const combinedWeightProjected = {};
      for (const [key, matrix] of Object.entries(COMBINED_WEIGHT_VARIANTS)) {
        const projected = projectVariantPlayer({
          weeklyArr,
          pos: player.position,
          isHome,
          defStrength,
          leagueAvg,
          scoringSettings,
          week,
          matrix,
          matchupRules: DAMPENED_MATCHUP_RULES,
        });
        if (projected == null) continue;
        combinedWeightProjected[`${key}Projected`] = projected;
      }
      if (Object.keys(combinedWeightProjected).length !== Object.keys(COMBINED_WEIGHT_VARIANTS).length) continue;

      const matchupTestProjected = {};
      for (const [key, variant] of Object.entries(MATCHUP_TEST_VARIANTS)) {
        const projected = projectVariantPlayer({
          weeklyArr,
          pos: player.position,
          isHome,
          defStrength,
          leagueAvg,
          scoringSettings,
          week,
          matrix: variant.matrix,
          matchupRules: variant.matchupRules,
        });
        if (projected == null) continue;
        matchupTestProjected[`${key}Projected`] = projected;
      }
      if (Object.keys(matchupTestProjected).length !== Object.keys(MATCHUP_TEST_VARIANTS).length) continue;

      const productionIdpUsageProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: PRODUCTION_IDP_USAGE_MATRIX,
        matchupRules: DAMPENED_MATCHUP_RULES,
      });
      if (productionIdpUsageProjected == null) continue;

      const firstMatrixProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
      });
      if (firstMatrixProjected == null) continue;

      const firstMatrixNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: FIRST_MATRIX_NO_MATCHUP,
      });
      if (firstMatrixNoMatchupProjected == null) continue;

      const baseOnlyNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: BASE_ONLY_NO_MATCHUP,
      });
      if (baseOnlyNoMatchupProjected == null) continue;

      const gatedLocationNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: GATED_LOCATION_NO_MATCHUP,
      });
      if (gatedLocationNoMatchupProjected == null) continue;

      const locationOnlyNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: CURRENT_WEIGHTS_LOCATION_ONLY_NO_MATCHUP,
      });
      if (locationOnlyNoMatchupProjected == null) continue;

      const usageOnlyNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: CURRENT_WEIGHTS_USAGE_ONLY_NO_MATCHUP,
      });
      if (usageOnlyNoMatchupProjected == null) continue;

      const gatedLocationUsageNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: CURRENT_WEIGHTS_GATED_LOCATION_USAGE_NO_MATCHUP,
      });
      if (gatedLocationUsageNoMatchupProjected == null) continue;

      const conservativeSkillNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: CONSERVATIVE_SKILL_NO_MATCHUP,
      });
      if (conservativeSkillNoMatchupProjected == null) continue;

      const modestRecentSkillNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: MODEST_RECENT_SKILL_NO_MATCHUP,
      });
      if (modestRecentSkillNoMatchupProjected == null) continue;

      const conservativeIdpNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: CONSERVATIVE_IDP_NO_MATCHUP,
      });
      if (conservativeIdpNoMatchupProjected == null) continue;

      const modestRecentIdpNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: MODEST_RECENT_IDP_NO_MATCHUP,
      });
      if (modestRecentIdpNoMatchupProjected == null) continue;

      const qbRbRecentOnlyNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: QB_RB_RECENT_ONLY_NO_MATCHUP,
      });
      if (qbRbRecentOnlyNoMatchupProjected == null) continue;

      const receiversConservativeOnlyNoMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: RECEIVERS_CONSERVATIVE_ONLY_NO_MATCHUP,
      });
      if (receiversConservativeOnlyNoMatchupProjected == null) continue;

      const firstMatrixDampenedMatchupProjected = projectVariantPlayer({
        weeklyArr,
        pos: player.position,
        isHome,
        defStrength,
        leagueAvg,
        scoringSettings,
        week,
        matrix: FIRST_MATRIX,
        matchupRules: DAMPENED_MATCHUP_RULES,
      });
      if (firstMatrixDampenedMatchupProjected == null) continue;

      const iteration1HybridProjected = {
        DB: firstMatrixNoMatchupProjected,
        DL: firstMatrixProjected,
        K: firstMatrixNoMatchupProjected,
        LB: firstMatrixNoMatchupProjected,
        QB: firstMatrixProjected,
        RB: currentNoMatchup.projected,
        TE: currentNoMatchup.projected,
        WR: currentNoMatchup.projected,
      }[normPos] ?? currentNoMatchup.projected;

      const iteration2HybridProjected = {
        DB: firstMatrixNoMatchupProjected,
        DL: firstMatrixDampenedMatchupProjected,
        K: firstMatrixNoMatchupProjected,
        LB: firstMatrixNoMatchupProjected,
        QB: firstMatrixDampenedMatchupProjected,
        RB: currentNoMatchup.projected,
        TE: currentNoMatchup.projected,
        WR: currentNoMatchup.projected,
      }[normPos] ?? currentNoMatchup.projected;

      const contextProjected = {};
      let contextMeta = null;
      if (args.context) {
        const gameContext = await getGameContext({
          season: args.season,
          week,
          team,
          detailedSchedule,
          weatherCache,
        });
        const weatherProjection = projectPlayer({
          weeklyArr,
          pos: player.position,
          oppTeam,
          isHome,
          isIndoor: gameContext.isIndoor,
          weather: gameContext.weather,
          allWeeklyStats: weeklyStats,
          players,
          scoringSettings,
          scheduleMap,
          week,
          defStrength,
          leagueAvg,
          skipOpponentLookup: true,
        });
        const weatherCurrentProjected = weatherProjection?.projected ?? baseline.projected;
        const weatherNoMatchupProjection = projectPlayer({
          weeklyArr,
          pos: player.position,
          oppTeam,
          isHome,
          isIndoor: gameContext.isIndoor,
          weather: gameContext.weather,
          allWeeklyStats: weeklyStats,
          players,
          scoringSettings,
          scheduleMap,
          week,
          defStrength: null,
          leagueAvg: 0,
          skipOpponentLookup: true,
        });
        const weatherNoMatchupProjected = weatherNoMatchupProjection?.projected ?? currentNoMatchup.projected;
        const tinyTeamTotalFactor = getTeamTotalFactor(normPos, gameContext.odds, avgTeamTotal, 'tiny');
        const moderateTeamTotalFactor = getTeamTotalFactor(normPos, gameContext.odds, avgTeamTotal, 'moderate');
        contextProjected.weatherCurrentProjected = weatherCurrentProjected;
        contextProjected.weatherNoMatchupProjected = weatherNoMatchupProjected;
        contextProjected.teamTotalTinyProjected = Number((baseline.projected * tinyTeamTotalFactor).toFixed(1));
        contextProjected.teamTotalModerateProjected = Number((baseline.projected * moderateTeamTotalFactor).toFixed(1));
        contextProjected.weatherTeamTotalTinyProjected = Number((weatherCurrentProjected * tinyTeamTotalFactor).toFixed(1));
        contextProjected.weatherNoMatchupTeamTotalTinyProjected = Number((weatherNoMatchupProjected * tinyTeamTotalFactor).toFixed(1));
        contextMeta = {
          contextDate: gameContext.schedule?.date ?? null,
          contextIndoor: gameContext.isIndoor,
          contextWeatherKnown: gameContext.weatherKnown,
          contextOddsKnown: gameContext.odds != null,
          contextTeamTotal: gameContext.odds
            ? Number(((gameContext.odds.total / 2) - (gameContext.odds.spread / 2)).toFixed(2))
            : null,
        };
      }

      rows.push({
        week,
        playerId,
        name: player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
        pos: normPos,
        team,
        oppTeam,
        actual: Number(actual.toFixed(2)),
        baselineProjected: baseline.projected,
        currentNoMatchupProjected: currentNoMatchup.projected,
        currentDampenedQbDlProjected,
        productionIdpUsageProjected,
        ...idpWeightProjected,
        ...offenseWeightProjected,
        ...combinedWeightProjected,
        ...matchupTestProjected,
        baseOnlyNoMatchupProjected,
        locationOnlyNoMatchupProjected,
        usageOnlyNoMatchupProjected,
        gatedLocationUsageNoMatchupProjected,
        gatedLocationNoMatchupProjected,
        firstMatrixProjected,
        firstMatrixNoMatchupProjected,
        conservativeSkillNoMatchupProjected,
        modestRecentSkillNoMatchupProjected,
        conservativeIdpNoMatchupProjected,
        modestRecentIdpNoMatchupProjected,
        qbRbRecentOnlyNoMatchupProjected,
        receiversConservativeOnlyNoMatchupProjected,
        firstMatrixDampenedMatchupProjected,
        iteration1HybridProjected,
        iteration2HybridProjected,
        ...contextProjected,
        ...(contextMeta ?? {}),
      });
    }
  }

  const summaries = Object.fromEntries(variantKeys.map((key) => {
    const projectionKey = `${key}Projected`;
    return [key, {
      overall: summarize(rows, projectionKey),
      byPosition: summarizeByPosition(rows, projectionKey),
    }];
  }));
  const baselineOverall = summaries.baseline.overall;
  const baselineByPosition = summaries.baseline.byPosition;
  const deltaByPosition = Object.fromEntries(
    Object.keys(summaries.firstMatrix.byPosition).map((pos) => [pos, deltaSummary(summaries.firstMatrix.byPosition[pos], baselineByPosition[pos])]),
  );
  const noMatchupDeltaByPosition = Object.fromEntries(
    Object.keys(summaries.currentNoMatchup.byPosition).map((pos) => [pos, deltaSummary(summaries.currentNoMatchup.byPosition[pos], baselineByPosition[pos])]),
  );
  const firstMatrixNoMatchupDeltaByPosition = Object.fromEntries(
    Object.keys(summaries.firstMatrixNoMatchup.byPosition).map((pos) => [pos, deltaSummary(summaries.firstMatrixNoMatchup.byPosition[pos], baselineByPosition[pos])]),
  );

  const splitReports = SPLITS.map((split) => {
    const splitRows = rows.filter((row) => inWeekRange(row, split.testWeeks));
    const splitSummaries = Object.fromEntries(variantKeys.map((key) => [key, summarize(splitRows, `${key}Projected`)]));
    return {
      ...split,
      rows: splitRows.length,
      ...splitSummaries,
      deltaVsBaseline: deltaSummary(splitSummaries.firstMatrix, splitSummaries.baseline),
      currentNoMatchupDeltaVsBaseline: deltaSummary(splitSummaries.currentNoMatchup, splitSummaries.baseline),
      firstMatrixNoMatchupDeltaVsBaseline: deltaSummary(splitSummaries.firstMatrixNoMatchup, splitSummaries.baseline),
      bestVariant: Object.entries(splitSummaries)
        .sort(([, left], [, right]) => left.weightedScore - right.weightedScore)[0][0],
      byPosition: Object.fromEntries(variantKeys.map((key) => [key, summarizeByPosition(splitRows, `${key}Projected`)])),
    };
  });

  const variantReport = Object.fromEntries(
    variantKeys
      .filter((key) => key !== 'baseline')
      .map((key) => [key, {
        overall: summaries[key].overall,
        byPosition: summaries[key].byPosition,
        deltaVsBaseline: deltaSummary(summaries[key].overall, baselineOverall),
        deltaByPosition: Object.fromEntries(
          Object.keys(summaries[key].byPosition).map((pos) => [pos, deltaSummary(summaries[key].byPosition[pos], baselineByPosition[pos])]),
        ),
        ...(key === 'firstMatrix' ? { splits: splitReports } : {}),
      }]),
  );
  const contextAvailability = args.context ? {
    rows: rows.length,
    indoorRows: rows.filter((row) => row.contextIndoor === true).length,
    weatherKnownRows: rows.filter((row) => row.contextWeatherKnown === true).length,
    oddsKnownRows: rows.filter((row) => row.contextOddsKnown === true).length,
  } : null;

  const report = {
    league: { id: league.league_id, name: league.name, season: args.season },
    sample: { rows: rows.length, minActual: args.minActual, minPriorGames: args.minPriorGames },
    ...(contextAvailability ? { contextAvailability } : {}),
    baseline: {
      overall: baselineOverall,
      byPosition: baselineByPosition,
    },
    variants: variantReport,
    recommendation: buildRecommendation(rows, variantKeys),
  };

  if (args.compact) {
    const overall = Object.fromEntries([
      ['baseline', report.baseline.overall],
      ...Object.entries(report.variants).map(([key, value]) => [key, value.overall]),
    ].map(([key, summary]) => [key, summary.weightedScore]));
    const byPositionBest = {};
    for (const pos of Object.keys(report.baseline.byPosition)) {
      const candidates = [
        ['baseline', report.baseline.byPosition[pos]],
        ...Object.entries(report.variants).map(([key, value]) => [key, value.byPosition[pos]]),
      ].filter(([, summary]) => summary);
      const [bestName, best] = candidates.sort(([, left], [, right]) => left.weightedScore - right.weightedScore)[0];
      byPositionBest[pos] = {
        bestVariant: bestName,
        weightedScore: best.weightedScore,
        baseline: report.baseline.byPosition[pos].weightedScore,
        improvement: Number((report.baseline.byPosition[pos].weightedScore - best.weightedScore).toFixed(2)),
      };
    }
    const splitBest = report.variants.firstMatrix.splits.map((split) => ({
      label: split.label,
      bestVariant: split.bestVariant,
      bestWeightedScore: split[split.bestVariant].weightedScore,
      baseline: split.baseline.weightedScore,
      improvement: Number((split.baseline.weightedScore - split[split.bestVariant].weightedScore).toFixed(2)),
    }));
    const contextVariants = args.context ? Object.fromEntries(
      CONTEXT_VARIANT_KEYS.map((key) => [key, {
        overall: report.variants[key].overall,
        byPosition: report.variants[key].byPosition,
        deltaVsBaseline: report.variants[key].deltaVsBaseline,
      }]),
    ) : undefined;
    console.log(JSON.stringify({
      league: report.league,
      sample: report.sample,
      ...(report.contextAvailability ? { contextAvailability: report.contextAvailability } : {}),
      overall,
      byPositionBest,
      splitBest,
      ...(contextVariants ? { contextVariants } : {}),
      recommendation: report.recommendation,
    }, null, 2));
    return;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
