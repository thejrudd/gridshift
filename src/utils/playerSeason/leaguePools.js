// leaguePools.js — league-wide context for the Statistics player dashboard.
//
// Input is Sleeper's weekly stat rows (api.sleeper.com/stats/nfl/{season}/{week}),
// which carry each player's team, opponent, position, snaps, and full offensive,
// kicking, and IDP lines. One pass builds two things the dashboard ranks and
// compares against:
//
// - players: season sums per player, grouped by dashboard position group, plus
//   the per-game workload counts each group's "all starters" pool needs.
// - teams: what each team's offense produced by position group in every week,
//   so a defense's "allowed" figures are the opposing offenses' lines.
//
// Pure: no fetching. The server owns requests and caching.

import { positionGroup } from '../playerMetrics.js';
import { getTeamAbbr } from '../liveScoringFeed.js';

export const DASHBOARD_GROUPS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB']);

// Season sums kept per group. Anything a rank metric or tile reads must be here.
const OFFENSE_KEYS = [
  'off_snp', 'tm_off_snp',
  'pass_cmp', 'pass_att', 'pass_yd', 'pass_td', 'pass_int', 'pass_sack', 'pass_fd',
  'rush_att', 'rush_yd', 'rush_td', 'rush_fd',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rec_fd',
  'fum_lost',
];
const KICK_KEYS = ['fgm', 'fga', 'fgm_50p', 'fgm_40_49', 'fgm_30_39', 'fgm_20_29', 'fgm_0_19', 'xpm', 'xpa'];
const IDP_KEYS = [
  'def_snp', 'tm_def_snp',
  'idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'idp_sack', 'idp_qb_hit',
  'idp_ff', 'idp_pass_def', 'idp_int',
];
const GROUP_KEYS = {
  QB: OFFENSE_KEYS, RB: OFFENSE_KEYS, WR: OFFENSE_KEYS, TE: OFFENSE_KEYS,
  K: KICK_KEYS, DL: IDP_KEYS, LB: IDP_KEYS, DB: IDP_KEYS,
};

// A game that counts toward a group's "all starters" pool.
const STARTER_GAME = {
  QB: (s) => (s.pass_att ?? 0) >= 14,
  RB: (s) => (s.rush_att ?? 0) + (s.rec ?? 0) >= 10,
  WR: (s) => (s.rec_tgt ?? 0) >= 4,
  TE: (s) => (s.rec_tgt ?? 0) >= 3,
  K: (s) => (s.fga ?? 0) + (s.xpa ?? 0) >= 1,
  DL: (s) => (s.def_snp ?? 0) >= 30,
  LB: (s) => (s.def_snp ?? 0) >= 30,
  DB: (s) => (s.def_snp ?? 0) >= 30,
};

// Team-week offense lines, by the position group that produced them.
const TEAM_LINE = {
  QB: ['pass_cmp', 'pass_att', 'pass_yd', 'pass_td', 'pass_int', 'pass_sack', 'rush_att', 'rush_yd'],
  RB: ['rush_att', 'rush_yd', 'rush_td', 'rec_tgt', 'rec', 'rec_yd', 'rec_td'],
  WR: ['rec_tgt', 'rec', 'rec_yd', 'rec_td'],
  TE: ['rec_tgt', 'rec', 'rec_yd', 'rec_td'],
  K: ['fgm', 'fga', 'xpm', 'xpa'],
};

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function playerName(row) {
  const player = row?.player ?? {};
  return [player.first_name, player.last_name].filter(Boolean).join(' ') || player.full_name || '';
}

function addInto(target, keys, stats) {
  for (const key of keys) {
    const value = num(stats[key]);
    if (value) target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * @param {Array<{ week: number, rows: Array<object> }>} weeks Sleeper weekly rows.
 * @returns {{ weeks: number[], players: object[], teams: object }}
 */
export function buildLeaguePools(weeks = []) {
  const players = new Map();
  const teams = {};
  const weekNumbers = [];

  for (const { week, rows } of weeks) {
    if (!Array.isArray(rows) || !rows.length) continue;
    weekNumbers.push(Number(week));

    for (const row of rows) {
      const stats = row?.stats ?? {};
      const team = getTeamAbbr(row?.team);
      const opp = getTeamAbbr(row?.opponent);
      if (!team || !opp) continue;
      const position = String(row?.player?.position ?? '').toUpperCase();

      // Team defense rows hold the authoritative points allowed for the week.
      if (position === 'DEF') {
        const line = ensureTeamWeek(teams, team, week, opp);
        if (stats.pts_allow != null) line.pa = num(stats.pts_allow);
        continue;
      }

      const group = positionGroup(position);
      if (TEAM_LINE[group] && (num(stats.gp) || num(stats.off_snp))) {
        const line = ensureTeamWeek(teams, team, week, opp);
        const bucket = (line.off[group] ??= {});
        addInto(bucket, TEAM_LINE[group], stats);
        // Team-level passing workload: every passer, whatever his listed position.
        line.passAtt += num(stats.pass_att);
        line.sacks += num(stats.pass_sack);
        line.rushAtt += num(stats.rush_att);
      }

      const keys = GROUP_KEYS[group];
      if (!keys || !num(stats.gp)) continue;
      const id = String(row.player_id);
      let entry = players.get(id);
      if (!entry) {
        entry = { id, n: playerName(row), pos: position, g: group, t: team, gp: 0, st: 0, s: {} };
        players.set(id, entry);
      }
      entry.t = team;
      entry.gp += 1;
      if (STARTER_GAME[group](stats)) entry.st += 1;
      addInto(entry.s, keys, stats);
      if (group === 'K' && num(stats.fgm_lng) > (entry.s.fgm_lng ?? 0)) entry.s.fgm_lng = num(stats.fgm_lng);
    }
  }

  // Points scored are the opponent defense's points allowed.
  for (const [team, byWeek] of Object.entries(teams)) {
    for (const [week, line] of Object.entries(byWeek)) {
      const oppLine = teams[line.opp]?.[week];
      if (oppLine?.pa != null) line.pf = oppLine.pa;
    }
    teams[team] = byWeek;
  }

  return {
    weeks: [...new Set(weekNumbers)].sort((a, b) => a - b),
    players: [...players.values()],
    teams,
  };
}

function ensureTeamWeek(teams, team, week, opp) {
  const byWeek = (teams[team] ??= {});
  return (byWeek[week] ??= { opp, pf: null, pa: null, passAtt: 0, sacks: 0, rushAtt: 0, off: {} });
}

const ROW_KEYS = [...new Set([
  'gp', 'pts_allow', 'fgm_lng',
  ...OFFENSE_KEYS, ...KICK_KEYS, ...IDP_KEYS,
])];

/** Sleeper rows reduced to the fields the pools and per-game snaps read. */
export function compactWeekRows(rows = []) {
  return rows
    .filter((row) => row?.player_id != null && row?.team && row?.opponent && row?.stats)
    .map((row) => {
      const stats = {};
      for (const key of ROW_KEYS) if (row.stats[key] != null) stats[key] = row.stats[key];
      return {
        player_id: String(row.player_id),
        team: row.team,
        opponent: row.opponent,
        player: {
          first_name: row.player?.first_name ?? '',
          last_name: row.player?.last_name ?? '',
          position: row.player?.position ?? '',
        },
        stats,
      };
    })
    .filter((row) => Object.keys(row.stats).length > 0);
}

/** One group's slice of the pools, sized for the browser. */
export function selectGroupPools(pools, group) {
  return {
    weeks: pools.weeks,
    players: pools.players.filter((player) => player.g === group),
    teams: pools.teams,
  };
}
