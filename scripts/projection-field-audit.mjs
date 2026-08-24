#!/usr/bin/env node

import { getAllPlayers, getAllWeeklyStats } from '../src/api/sleeperApi.js';

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const DEFAULT_SEASON = '2025';

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

const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

const FIELD_GROUPS = {
  defensiveSnap: ['def_snp', 'idp_snp', 'snap_def'],
  teamDefensiveSnap: ['tm_def_snp', 'team_def_snp', 'tm_snp_def'],
  tackles: ['idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss'],
  passRush: ['idp_sack', 'idp_sack_yd', 'idp_qbhit', 'idp_qb_hit'],
  coverage: ['idp_pd', 'idp_pass_def', 'idp_int', 'idp_int_ret_yd', 'idp_int_td'],
  disruption: ['idp_ff', 'idp_fr', 'idp_fum_rec', 'idp_fr_yd', 'idp_fum_ret_yd', 'idp_fr_td', 'idp_def_td', 'idp_safety', 'idp_safe', 'idp_blk_kick'],
};

const ALL_FIELDS = [...new Set(Object.values(FIELD_GROUPS).flat())];

function parseArgs(argv) {
  const args = { leagueId: null, season: DEFAULT_SEASON };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--league' || arg === '--league-id') args.leagueId = argv[++i];
    else if (arg === '--season') args.season = argv[++i];
    else if (arg === '--help') {
      console.log('Usage: node scripts/projection-field-audit.mjs --league <sleeperLeagueId> [--season 2025]');
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

function hasNumericValue(row, key) {
  return row?.[key] != null && Number.isFinite(Number(row[key]));
}

function hasPositiveValue(row, key) {
  return hasNumericValue(row, key) && Number(row[key]) > 0;
}

function hasAnyPositive(row, keys) {
  return keys.some((key) => hasPositiveValue(row, key));
}

function hasAnyNumeric(row, keys) {
  return keys.some((key) => hasNumericValue(row, key));
}

function emptyBucket() {
  return {
    playerCount: 0,
    rowCount: 0,
    activeRows: 0,
    rowsWithAnyIdpStat: 0,
    rowsWithDefensiveSnap: 0,
    rowsWithTeamDefensiveSnap: 0,
    rowsWithSnapShare: 0,
    rowsWithTackles: 0,
    rowsWithPassRush: 0,
    rowsWithCoverage: 0,
    rowsWithDisruption: 0,
    fields: Object.fromEntries(ALL_FIELDS.map((field) => [field, { presentRows: 0, positiveRows: 0 }])),
  };
}

function pct(part, whole) {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

function compactBucket(bucket) {
  const fields = Object.fromEntries(
    Object.entries(bucket.fields)
      .filter(([, value]) => value.presentRows > 0 || value.positiveRows > 0)
      .map(([field, value]) => [field, {
        ...value,
        presentPct: pct(value.presentRows, bucket.rowCount),
        positivePct: pct(value.positiveRows, bucket.rowCount),
      }]),
  );

  return {
    playerCount: bucket.playerCount,
    rowCount: bucket.rowCount,
    activeRows: bucket.activeRows,
    rowsWithAnyIdpStat: bucket.rowsWithAnyIdpStat,
    rowsWithDefensiveSnap: bucket.rowsWithDefensiveSnap,
    rowsWithTeamDefensiveSnap: bucket.rowsWithTeamDefensiveSnap,
    rowsWithSnapShare: bucket.rowsWithSnapShare,
    rowsWithTackles: bucket.rowsWithTackles,
    rowsWithPassRush: bucket.rowsWithPassRush,
    rowsWithCoverage: bucket.rowsWithCoverage,
    rowsWithDisruption: bucket.rowsWithDisruption,
    coverage: {
      defensiveSnapPct: pct(bucket.rowsWithDefensiveSnap, bucket.rowCount),
      teamDefensiveSnapPct: pct(bucket.rowsWithTeamDefensiveSnap, bucket.rowCount),
      snapSharePct: pct(bucket.rowsWithSnapShare, bucket.rowCount),
      anyIdpStatPct: pct(bucket.rowsWithAnyIdpStat, bucket.rowCount),
      tacklesPct: pct(bucket.rowsWithTackles, bucket.rowCount),
      passRushPct: pct(bucket.rowsWithPassRush, bucket.rowCount),
      coveragePct: pct(bucket.rowsWithCoverage, bucket.rowCount),
      disruptionPct: pct(bucket.rowsWithDisruption, bucket.rowCount),
    },
    fields,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.leagueId) throw new Error('Missing --league <sleeperLeagueId>');

  const [league, rosters, players, weeklyStats] = await Promise.all([
    sleeper(`/league/${args.leagueId}`),
    sleeper(`/league/${args.leagueId}/rosters`),
    getAllPlayers(),
    getAllWeeklyStats(args.season, 18),
  ]);

  if (!league?.league_id) throw new Error(`Sleeper returned no league for ${args.leagueId}.`);

  const rosteredIds = flattenRosters(rosters);
  const buckets = {
    overall: emptyBucket(),
    byPosition: {
      DL: emptyBucket(),
      LB: emptyBucket(),
      DB: emptyBucket(),
    },
  };
  const seenPlayers = {
    overall: new Set(),
    DL: new Set(),
    LB: new Set(),
    DB: new Set(),
  };

  for (const [playerId, weeks] of Object.entries(weeklyStats ?? {})) {
    if (!rosteredIds.has(playerId)) continue;
    const player = players[playerId];
    if (!player || !IDP_POSITIONS.has(player.position)) continue;
    const group = positionGroup(player.position);
    if (!buckets.byPosition[group]) continue;

    seenPlayers.overall.add(playerId);
    seenPlayers[group].add(playerId);

    for (const row of weeks ?? []) {
      for (const bucket of [buckets.overall, buckets.byPosition[group]]) {
        bucket.rowCount += 1;
        if (Number(row.gp ?? 0) > 0) bucket.activeRows += 1;
        if (hasAnyPositive(row, ALL_FIELDS)) bucket.rowsWithAnyIdpStat += 1;
        if (hasAnyNumeric(row, FIELD_GROUPS.defensiveSnap)) bucket.rowsWithDefensiveSnap += 1;
        if (hasAnyNumeric(row, FIELD_GROUPS.teamDefensiveSnap)) bucket.rowsWithTeamDefensiveSnap += 1;
        if (hasAnyNumeric(row, FIELD_GROUPS.defensiveSnap) && hasAnyNumeric(row, FIELD_GROUPS.teamDefensiveSnap)) bucket.rowsWithSnapShare += 1;
        if (hasAnyPositive(row, FIELD_GROUPS.tackles)) bucket.rowsWithTackles += 1;
        if (hasAnyPositive(row, FIELD_GROUPS.passRush)) bucket.rowsWithPassRush += 1;
        if (hasAnyPositive(row, FIELD_GROUPS.coverage)) bucket.rowsWithCoverage += 1;
        if (hasAnyPositive(row, FIELD_GROUPS.disruption)) bucket.rowsWithDisruption += 1;
        for (const field of ALL_FIELDS) {
          if (hasNumericValue(row, field)) bucket.fields[field].presentRows += 1;
          if (hasPositiveValue(row, field)) bucket.fields[field].positiveRows += 1;
        }
      }
    }
  }

  buckets.overall.playerCount = seenPlayers.overall.size;
  for (const pos of Object.keys(buckets.byPosition)) {
    buckets.byPosition[pos].playerCount = seenPlayers[pos].size;
  }

  console.log(JSON.stringify({
    league: { id: league.league_id, name: league.name, season: args.season },
    auditedFields: FIELD_GROUPS,
    overall: compactBucket(buckets.overall),
    byPosition: Object.fromEntries(
      Object.entries(buckets.byPosition).map(([pos, bucket]) => [pos, compactBucket(bucket)]),
    ),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
