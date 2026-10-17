// dashboardModel.js — derivations for the Statistics player dashboard.
//
// Inputs are the two server payloads (see server/playerSeasonHandlers.js):
// the player's season of games and plays, and his position group's league
// pools. Everything here is pure so the tabs stay presentational.

import { positionGroup } from '../playerMetrics.js';

export const DASHBOARD_TAB_GROUPS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB']);

/** The dashboard group for a position, or null when the position has no dashboard. */
export function dashboardGroup(position) {
  const group = positionGroup(position);
  return DASHBOARD_TAB_GROUPS.includes(group) ? group : null;
}

export const isDefensiveGroup = (group) => group === 'DL' || group === 'LB' || group === 'DB';

const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);
const safeDiv = (a, b) => (b ? a / b : null);

/** NFL passer rating. */
export function passerRating(cmp, att, yds, td, int) {
  if (!att) return null;
  const clamp = (value) => Math.max(0, Math.min(2.375, value));
  return ((clamp((cmp / att - 0.3) * 5) + clamp((yds / att - 3) * 0.25) + clamp((td / att) * 20) + clamp(2.375 - (int / att) * 25)) / 6) * 100;
}

/* ---------- Plays ---------- */

const ATTEMPT = new Set(['pass-reception', 'pass-incompletion', 'passing-touchdown', 'pass-interception-return', 'interception-return-touchdown']);
export const isCatch = (p) => p.t === 'pass-reception' || p.t === 'passing-touchdown';
export const isInterception = (p) => /interception/.test(p.t);
export const isPassAttempt = (p) => p.r === 'passer' && ATTEMPT.has(p.t);
export const isSackTaken = (p) => p.r === 'passer' && /sack/.test(p.t);
export const isRun = (p) => p.r === 'rusher';
export const isTarget = (p) => p.r === 'receiver';
export const isKick = (p) => p.r === 'kicker';
export const isTouchdown = (p) => /touchdown/.test(p.t) && !/interception-return|fumble-return/.test(p.t);
export const isFirstDown = (p) => p.ds != null && (p.y ?? 0) >= p.ds && !/touchdown/.test(p.t);
export const isPressure = (p) => Boolean(p.cr?.sk || p.cr?.hit);
export const isTackle = (p) => Boolean(p.cr?.tkl || p.cr?.sk);
export const isDropback = (p) => isPassAttempt(p) || isSackTaken(p) || (isRun(p) && p.scr);
export const movedChains = (p) => isTouchdown(p) || (p.ds != null && (p.y ?? 0) >= p.ds && !isInterception(p) && !isSackTaken(p));

/** Every play the player was credited on, each carrying its game. */
export function seasonPlays(season) {
  return (season?.games ?? []).flatMap((game) => game.plays.map((play) => ({ ...play, g: game })));
}

/** The label a play gets in lists and filters. */
export function playKind(play, group) {
  if (play.cr) {
    if (play.cr.sk) return play.cr.sk === 0.5 ? 'Half sack' : 'Sack';
    if (play.cr.int) return 'Interception';
    if (play.cr.ff) return 'Forced fumble';
    if (play.cr.pd) return 'Pass defensed';
    if (play.cr.fr) return 'Fumble recovery';
    if (play.cr.tkl) return (play.y ?? 0) < 0 && !play.pass ? 'Tackle for loss' : 'Tackle';
    if (play.cr.hit) return 'QB hit';
    return 'Play';
  }
  if (isSackTaken(play)) return 'Sack';
  if (isPassAttempt(play)) {
    if (play.t === 'passing-touchdown') return 'Touchdown pass';
    if (isInterception(play)) return 'Interception';
    return isCatch(play) ? 'Completion' : 'Incompletion';
  }
  if (isRun(play)) {
    if (group === 'QB') return play.kn ? 'Kneel' : play.scr ? 'Scramble' : 'Designed run';
    if (play.t === 'rushing-touchdown') return 'Rushing touchdown';
    return (play.y ?? 0) >= 10 ? 'Run of 10+' : (play.y ?? 0) <= 0 ? 'Stuffed run' : 'Run';
  }
  if (isTarget(play)) {
    if (play.t === 'passing-touchdown') return 'Touchdown catch';
    return isCatch(play) ? 'Catch' : 'Target, not caught';
  }
  if (isKick(play)) {
    if (/extra-point|extra point/i.test(`${play.t} ${play.raw}`)) return /no good|missed|blocked/i.test(play.raw) ? 'Missed extra point' : 'Extra point';
    if (/field-goal/.test(play.t)) return /good/.test(play.t) ? 'Field goal' : 'Missed field goal';
    return 'Kick';
  }
  if (play.r === 'returner') return 'Return';
  if (play.r === 'punter') return 'Punt';
  return 'Play';
}

/** Result filters on Every play, in display order, per group. */
export const KIND_FILTERS = {
  QB: ['Completion', 'Incompletion', 'Touchdown pass', 'Interception', 'Sack', 'Designed run', 'Scramble'],
  RB: ['Run', 'Run of 10+', 'Stuffed run', 'Rushing touchdown', 'Catch', 'Target, not caught', 'Touchdown catch'],
  WR: ['Catch', 'Target, not caught', 'Touchdown catch', 'Run'],
  TE: ['Catch', 'Target, not caught', 'Touchdown catch', 'Run'],
  K: ['Field goal', 'Missed field goal', 'Extra point', 'Missed extra point'],
  DL: ['Tackle', 'Tackle for loss', 'Sack', 'Half sack', 'QB hit', 'Forced fumble', 'Pass defensed', 'Interception'],
  LB: ['Tackle', 'Tackle for loss', 'Sack', 'Half sack', 'QB hit', 'Forced fumble', 'Pass defensed', 'Interception'],
  DB: ['Tackle', 'Tackle for loss', 'Pass defensed', 'Interception', 'Forced fumble', 'Sack', 'QB hit'],
};

export function passAgg(plays) {
  const attempts = plays.filter(isPassAttempt);
  const completions = attempts.filter(isCatch);
  const yards = sum(completions.map((p) => p.y));
  const td = attempts.filter((p) => p.t === 'passing-touchdown').length;
  const int = attempts.filter(isInterception).length;
  return {
    att: attempts.length,
    cmp: completions.length,
    y: yards,
    td,
    int,
    sk: plays.filter(isSackTaken).length,
    ya: safeDiv(yards, attempts.length),
    pct: attempts.length ? (100 * completions.length) / attempts.length : null,
    rate: passerRating(completions.length, attempts.length, yards, td, int),
  };
}

export function runAgg(plays) {
  const runs = plays.filter((p) => isRun(p) && !p.kn);
  const yards = sum(runs.map((p) => p.y));
  return {
    n: runs.length,
    y: yards,
    ypc: safeDiv(yards, runs.length),
    td: runs.filter((p) => p.t === 'rushing-touchdown').length,
    fd: runs.filter(isFirstDown).length,
    big: runs.filter((p) => (p.y ?? 0) >= 10).length,
    stuff: runs.filter((p) => (p.y ?? 0) <= 0).length,
  };
}

export function recAgg(plays) {
  const targets = plays.filter(isTarget);
  const catches = targets.filter(isCatch);
  const yards = sum(catches.map((p) => p.y));
  return {
    tgt: targets.length,
    rec: catches.length,
    y: yards,
    td: catches.filter((p) => p.t === 'passing-touchdown').length,
    fd: catches.filter(isFirstDown).length,
    pct: targets.length ? (100 * catches.length) / targets.length : null,
    ypt: safeDiv(yards, targets.length),
  };
}

export function defAgg(plays) {
  const credit = (key) => sum(plays.map((p) => p.cr?.[key]));
  return {
    n: plays.length,
    tkl: plays.filter(isTackle).length,
    sk: credit('sk'),
    hit: credit('hit'),
    prs: plays.filter(isPressure).length,
    tfl: plays.filter((p) => p.cr?.sk || (p.cr?.tkl && (p.y ?? 0) < 0 && !p.pass)).length,
    ff: credit('ff'),
    pd: credit('pd'),
    int: credit('int'),
    fr: credit('fr'),
  };
}

export function kickAgg(plays) {
  const fgs = plays.filter((p) => isKick(p) && /field-goal/.test(p.t));
  const made = fgs.filter((p) => /good/.test(p.t));
  const xps = plays.filter((p) => isKick(p) && /extra point/i.test(p.raw));
  const xpMade = xps.filter((p) => !/no good|missed|blocked/i.test(p.raw));
  return {
    fga: fgs.length,
    fgm: made.length,
    long: Math.max(0, ...made.map((p) => p.fg ?? 0)),
    xpa: xps.length,
    xpm: xpMade.length,
    pct: fgs.length ? (100 * made.length) / fgs.length : null,
  };
}

/** Season box totals summed from the per-game lines. */
export function seasonBox(season) {
  const totals = {};
  for (const game of season?.games ?? []) {
    for (const [key, value] of Object.entries(game.line ?? {})) {
      if (/rating|qbr|long|pct|avg|per_/.test(key)) continue;
      totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return totals;
}

export const gameWon = (game) => game.pf > game.pa;

/* ---------- League ranks ---------- */

const s = (player, key) => player.s?.[key] ?? 0;
const perGame = (player, key) => s(player, key) / (player.gp || 1);
const snapShare = (player, own, team) => (s(player, team) ? (100 * s(player, own)) / s(player, team) : 0);

// [key, label, value, direction (1 = higher is better), decimals, suffix]
export const RANK_METRICS = {
  QB: [
    ['ypg', 'Passing yards per game', (p) => perGame(p, 'pass_yd'), 1, 1],
    ['ya', 'Yards per attempt', (p) => s(p, 'pass_yd') / (s(p, 'pass_att') || 1), 1, 2],
    ['cmp', 'Completion rate', (p) => (100 * s(p, 'pass_cmp')) / (s(p, 'pass_att') || 1), 1, 1, '%'],
    ['rate', 'Passer rating', (p) => passerRating(s(p, 'pass_cmp'), s(p, 'pass_att'), s(p, 'pass_yd'), s(p, 'pass_td'), s(p, 'pass_int')) ?? 0, 1, 1],
    ['tdp', 'Touchdown rate', (p) => (100 * s(p, 'pass_td')) / (s(p, 'pass_att') || 1), 1, 1, '%'],
    ['intp', 'Interception rate', (p) => (100 * s(p, 'pass_int')) / (s(p, 'pass_att') || 1), -1, 1, '%'],
    ['skp', 'Sack rate', (p) => (100 * s(p, 'pass_sack')) / ((s(p, 'pass_att') + s(p, 'pass_sack')) || 1), -1, 1, '%'],
    ['rypg', 'Rushing yards per game', (p) => perGame(p, 'rush_yd'), 1, 1],
    ['totd', 'Total touchdowns', (p) => s(p, 'pass_td') + s(p, 'rush_td'), 1, 0],
    ['scrim', 'Total yards per game', (p) => (s(p, 'pass_yd') + s(p, 'rush_yd')) / (p.gp || 1), 1, 1],
  ],
  RB: [
    ['rypg', 'Rushing yards per game', (p) => perGame(p, 'rush_yd'), 1, 1],
    ['ypc', 'Yards per carry', (p) => s(p, 'rush_yd') / (s(p, 'rush_att') || 1), 1, 2],
    ['cpg', 'Carries per game', (p) => perGame(p, 'rush_att'), 1, 1],
    ['rtd', 'Rushing touchdowns', (p) => s(p, 'rush_td'), 1, 0],
    ['tgpg', 'Targets per game', (p) => perGame(p, 'rec_tgt'), 1, 1],
    ['rcypg', 'Receiving yards per game', (p) => perGame(p, 'rec_yd'), 1, 1],
    ['scrim', 'Scrimmage yards per game', (p) => (s(p, 'rush_yd') + s(p, 'rec_yd')) / (p.gp || 1), 1, 1],
    ['totd', 'Total touchdowns', (p) => s(p, 'rush_td') + s(p, 'rec_td'), 1, 0],
    ['share', 'Snap share', (p) => snapShare(p, 'off_snp', 'tm_off_snp'), 1, 1, '%'],
    ['fl', 'Fumbles lost', (p) => s(p, 'fum_lost'), -1, 0],
  ],
  WR: [
    ['rcypg', 'Receiving yards per game', (p) => perGame(p, 'rec_yd'), 1, 1],
    ['tgpg', 'Targets per game', (p) => perGame(p, 'rec_tgt'), 1, 1],
    ['recpg', 'Receptions per game', (p) => perGame(p, 'rec'), 1, 1],
    ['catch', 'Catch rate', (p) => (100 * s(p, 'rec')) / (s(p, 'rec_tgt') || 1), 1, 1, '%'],
    ['ypt', 'Yards per target', (p) => s(p, 'rec_yd') / (s(p, 'rec_tgt') || 1), 1, 2],
    ['ypr', 'Yards per catch', (p) => s(p, 'rec_yd') / (s(p, 'rec') || 1), 1, 1],
    ['fdpg', 'First downs per game', (p) => perGame(p, 'rec_fd'), 1, 1],
    ['rtd', 'Receiving touchdowns', (p) => s(p, 'rec_td'), 1, 0],
    ['share', 'Snap share', (p) => snapShare(p, 'off_snp', 'tm_off_snp'), 1, 1, '%'],
  ],
  K: [
    ['fgp', 'Field goal rate', (p) => (100 * s(p, 'fgm')) / (s(p, 'fga') || 1), 1, 1, '%'],
    ['fgm', 'Field goals made', (p) => s(p, 'fgm'), 1, 0],
    ['fg50', 'Made from 50+', (p) => s(p, 'fgm_50p'), 1, 0],
    ['xpp', 'Extra point rate', (p) => (100 * s(p, 'xpm')) / (s(p, 'xpa') || 1), 1, 1, '%'],
    ['ppg', 'Kicking points per game', (p) => (3 * s(p, 'fgm') + s(p, 'xpm')) / (p.gp || 1), 1, 1],
    ['long', 'Longest field goal', (p) => s(p, 'fgm_lng'), 1, 0],
  ],
  DL: [
    ['sk', 'Sacks', (p) => s(p, 'idp_sack'), 1, 1],
    ['hit', 'QB hits', (p) => s(p, 'idp_qb_hit'), 1, 0],
    ['prs', 'Pressures per game (sacks + QB hits)', (p) => (s(p, 'idp_sack') + s(p, 'idp_qb_hit')) / (p.gp || 1), 1, 2],
    ['prs100', 'Pressures per 100 snaps', (p) => (s(p, 'def_snp') ? (100 * (s(p, 'idp_sack') + s(p, 'idp_qb_hit'))) / s(p, 'def_snp') : 0), 1, 1],
    ['tfl', 'Tackles for loss', (p) => s(p, 'idp_tkl_loss'), 1, 0],
    ['tkl', 'Tackles per game', (p) => perGame(p, 'idp_tkl'), 1, 1],
    ['ff', 'Forced fumbles', (p) => s(p, 'idp_ff'), 1, 0],
    ['share', 'Snap share', (p) => snapShare(p, 'def_snp', 'tm_def_snp'), 1, 1, '%'],
  ],
  LB: [
    ['tkl', 'Tackles per game', (p) => perGame(p, 'idp_tkl'), 1, 1],
    ['solo', 'Solo tackles', (p) => s(p, 'idp_tkl_solo'), 1, 0],
    ['tfl', 'Tackles for loss', (p) => s(p, 'idp_tkl_loss'), 1, 0],
    ['sk', 'Sacks', (p) => s(p, 'idp_sack'), 1, 1],
    ['hit', 'QB hits', (p) => s(p, 'idp_qb_hit'), 1, 0],
    ['pd', 'Passes defended', (p) => s(p, 'idp_pass_def'), 1, 0],
    ['int', 'Interceptions', (p) => s(p, 'idp_int'), 1, 0],
    ['ff', 'Forced fumbles', (p) => s(p, 'idp_ff'), 1, 0],
    ['share', 'Snap share', (p) => snapShare(p, 'def_snp', 'tm_def_snp'), 1, 1, '%'],
  ],
  DB: [
    ['pd', 'Passes defended', (p) => s(p, 'idp_pass_def'), 1, 0],
    ['int', 'Interceptions', (p) => s(p, 'idp_int'), 1, 0],
    ['tkl', 'Tackles per game', (p) => perGame(p, 'idp_tkl'), 1, 1],
    ['solo', 'Solo tackles', (p) => s(p, 'idp_tkl_solo'), 1, 0],
    ['tfl', 'Tackles for loss', (p) => s(p, 'idp_tkl_loss'), 1, 0],
    ['ff', 'Forced fumbles', (p) => s(p, 'idp_ff'), 1, 0],
    ['share', 'Snap share', (p) => snapShare(p, 'def_snp', 'tm_def_snp'), 1, 1, '%'],
  ],
};
RANK_METRICS.TE = RANK_METRICS.WR;

// Qualified pools follow the NFL's per-team-game leaderboard rules where one exists.
const QUALIFIED = {
  QB: (p, tg) => s(p, 'pass_att') >= 14 * tg,
  RB: (p, tg) => s(p, 'rush_att') >= 6.25 * tg,
  WR: (p, tg) => s(p, 'rec') >= 1.875 * tg,
  TE: (p, tg) => s(p, 'rec') >= 1.875 * tg,
  K: (p, tg) => s(p, 'fga') >= 0.75 * tg,
  DL: (p) => p.gp >= 3 && snapShare(p, 'def_snp', 'tm_def_snp') >= 50,
  LB: (p) => p.gp >= 3 && snapShare(p, 'def_snp', 'tm_def_snp') >= 50,
  DB: (p) => p.gp >= 3 && snapShare(p, 'def_snp', 'tm_def_snp') >= 50,
};

export const POOL_RULES = {
  QB: ['14+ pass attempts per team game (the NFL qualifying rule)', 'Every QB with at least one game of 14+ attempts'],
  RB: ['6.25+ carries per team game (the NFL rushing-title rule)', 'Every RB with at least one game of 10+ touches'],
  WR: ['1.875+ catches per team game (the NFL receiving rule)', 'Every WR with at least one game of 4+ targets'],
  TE: ['1.875+ catches per team game (the NFL receiving rule)', 'Every TE with at least one game of 3+ targets'],
  K: ['0.75+ field goal attempts per team game', 'Every kicker who attempted a kick'],
  DL: ['3+ games and on the field for half his team’s defensive snaps', 'Every DL with a game of 30+ defensive snaps'],
  LB: ['3+ games and on the field for half his team’s defensive snaps', 'Every LB with a game of 30+ defensive snaps'],
  DB: ['3+ games and on the field for half his team’s defensive snaps', 'Every DB with a game of 30+ defensive snaps'],
};

/** Weeks each team has played, from the pools' team-week lines. */
export function teamGamesPlayed(pools) {
  return Object.fromEntries(Object.entries(pools?.teams ?? {}).map(([team, byWeek]) => [team, Object.keys(byWeek).length]));
}

function rankList(players, group) {
  return RANK_METRICS[group].map(([key, label, valueOf, dir, dp, suffix = '']) => {
    const vals = players.map((player) => ({ id: player.id, n: player.n, t: player.t, v: Number(valueOf(player).toFixed(dp + 1)) }));
    vals.sort((a, b) => (dir > 0 ? b.v - a.v : a.v - b.v));
    vals.forEach((entry, index) => { entry.r = index > 0 && vals[index - 1].v === entry.v ? vals[index - 1].r : index + 1; });
    return { key, label, dir, dp, suffix, vals };
  });
}

/**
 * Rank lists for the qualified and all-starters pools. The player is always
 * included in the all-starters pool so his own page can show where he sits.
 */
export function buildRanks(pools, group, playerSleeperId) {
  if (!pools?.players?.length || !RANK_METRICS[group]) return null;
  const teamGames = teamGamesPlayed(pools);
  const players = pools.players;
  const qualified = players.filter((player) => QUALIFIED[group](player, teamGames[player.t] || 0) && (teamGames[player.t] || 0) > 0);
  const all = players.filter((player) => player.st >= 1 || player.id === String(playerSleeperId));
  return {
    qualified: rankList(qualified, group),
    all: rankList(all, group),
    qualifiedCount: qualified.length,
    allCount: all.length,
    isQualified: qualified.some((player) => player.id === String(playerSleeperId)),
  };
}

/* ---------- Opponent context ---------- */

// What an opposing defense allowed per game, or what an opposing offense did,
// across its games other than the one being viewed. `easy` is 1 when a higher
// value makes the matchup easier for this player, -1 when it makes it harder.
const OPPONENT_METRICS = {
  QB: {
    side: 'defense',
    fields: [
      ['rate', 'Passer rating allowed', 1, (t) => passerRating(t.cmp, t.att, t.yds, t.td, t.int)],
      ['passA', 'Passing yards allowed per game', 1, (t, g) => t.yds / g],
      ['ypa', 'Yards per attempt allowed', 1, (t) => safeDiv(t.yds, t.att)],
      ['sk', 'Sacks per game', -1, (t, g) => t.sk / g],
      ['ptsA', 'Points allowed per game', 1, (t, g) => t.pts / g],
    ],
  },
  RB: {
    side: 'defense',
    fields: [
      ['ypc', 'Yards per carry allowed to RBs', 1, (t) => safeDiv(t.rby, t.rba)],
      ['rushA', 'RB rushing yards allowed per game', 1, (t, g) => t.rby / g],
      ['recA', 'RB receiving yards allowed per game', 1, (t, g) => t.rbrec / g],
      ['ptsA', 'Points allowed per game', 1, (t, g) => t.pts / g],
    ],
  },
  WR: {
    side: 'defense',
    fields: [
      ['ypt', 'Yards per target allowed to WRs', 1, (t) => safeDiv(t.wry, t.wrt)],
      ['recA', 'WR receiving yards allowed per game', 1, (t, g) => t.wry / g],
      ['ptsA', 'Points allowed per game', 1, (t, g) => t.pts / g],
    ],
  },
  TE: {
    side: 'defense',
    fields: [
      ['ypt', 'Yards per target allowed to TEs', 1, (t) => safeDiv(t.tey, t.tet)],
      ['recA', 'TE receiving yards allowed per game', 1, (t, g) => t.tey / g],
      ['ptsA', 'Points allowed per game', 1, (t, g) => t.pts / g],
    ],
  },
  K: {
    side: 'defense',
    fields: [
      ['fgaA', 'Field goal tries allowed per game', 1, (t, g) => t.fga / g],
      ['ptsA', 'Points allowed per game', 1, (t, g) => t.pts / g],
    ],
  },
  DL: {
    side: 'offense',
    fields: [
      ['skA', 'Sacks allowed per game', 1, (t, g) => t.sk / g],
      ['skRate', 'Sack rate allowed', 1, (t) => (t.att + t.sk ? (100 * t.sk) / (t.att + t.sk) : null)],
      ['ypc', 'RB yards per carry', -1, (t) => safeDiv(t.rby, t.rba)],
      ['pts', 'Points scored per game', -1, (t, g) => t.pts / g],
    ],
  },
};
OPPONENT_METRICS.LB = OPPONENT_METRICS.DL;
OPPONENT_METRICS.DB = {
  side: 'offense',
  fields: [
    ['passYds', 'Passing yards per game', -1, (t, g) => t.yds / g],
    ['ypa', 'Yards per attempt', -1, (t) => safeDiv(t.yds, t.att)],
    ['skA', 'Sacks allowed per game', 1, (t, g) => t.sk / g],
    ['pts', 'Points scored per game', -1, (t, g) => t.pts / g],
  ],
};

function offenseTotals(lines) {
  const t = { cmp: 0, att: 0, yds: 0, td: 0, int: 0, sk: 0, rba: 0, rby: 0, rbrec: 0, wrt: 0, wry: 0, tet: 0, tey: 0, fga: 0, pts: 0 };
  for (const line of lines) {
    const qb = line.off.QB ?? {};
    const rb = line.off.RB ?? {};
    const wr = line.off.WR ?? {};
    const te = line.off.TE ?? {};
    const k = line.off.K ?? {};
    t.cmp += qb.pass_cmp ?? 0; t.att += qb.pass_att ?? 0; t.yds += qb.pass_yd ?? 0; t.td += qb.pass_td ?? 0; t.int += qb.pass_int ?? 0;
    t.sk += line.sacks ?? 0;
    t.rba += rb.rush_att ?? 0; t.rby += rb.rush_yd ?? 0; t.rbrec += rb.rec_yd ?? 0;
    t.wrt += wr.rec_tgt ?? 0; t.wry += wr.rec_yd ?? 0; t.tet += te.rec_tgt ?? 0; t.tey += te.rec_yd ?? 0;
    t.fga += k.fga ?? 0;
    t.pts += line.pf ?? 0;
  }
  return t;
}

// Lines for one opponent: the offenses that faced it (defense side) or its own offense (offense side).
function opponentLines(pools, team, side, excludeWeek) {
  const lines = [];
  for (const [abbr, byWeek] of Object.entries(pools?.teams ?? {})) {
    for (const [week, line] of Object.entries(byWeek)) {
      if (Number(week) === Number(excludeWeek)) continue;
      if (side === 'defense' ? line.opp === team : abbr === team) lines.push(line);
    }
  }
  return lines;
}

export function opponentMetricFields(group) {
  return OPPONENT_METRICS[group]?.fields.map(([key, label, easy]) => ({ key, label, easy })) ?? [];
}

/** One opponent's context, from its games other than `excludeWeek`. */
export function opponentContext(pools, group, team, excludeWeek = null) {
  const spec = OPPONENT_METRICS[group];
  if (!spec) return null;
  const lines = opponentLines(pools, team, spec.side, excludeWeek);
  if (!lines.length) return null;
  const totals = offenseTotals(lines);
  const games = lines.length;
  return Object.fromEntries([['g', games], ...spec.fields.map(([key, , , valueOf]) => [key, valueOf(totals, games)])]);
}

/** League rank for every opponent, per metric: 1st is the easiest matchup for this player. */
export function opponentRanks(pools, group) {
  const spec = OPPONENT_METRICS[group];
  if (!spec) return {};
  const contexts = Object.keys(pools?.teams ?? {}).map((team) => [team, opponentContext(pools, group, team)]).filter(([, context]) => context);
  const ranks = {};
  for (const [key, , easy] of spec.fields) {
    // The easiest matchup for this player ranks 1st.
    const ordered = contexts.filter(([, context]) => context[key] != null)
      .sort((a, b) => (easy > 0 ? b[1][key] - a[1][key] : a[1][key] - b[1][key]));
    ordered.forEach(([team], index) => { (ranks[team] ??= {})[key] = index + 1; });
  }
  return ranks;
}

/* ---------- Formatting ---------- */

export function ordinal(value) {
  const n = Math.round(Number(value));
  const tail = n % 100;
  const suffix = tail >= 11 && tail <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '–';
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export const quarterName = (period) => (period <= 4 ? `Q${period}` : 'OT');

/** "BUF v HOU" at home, "BUF @ HOU" away. */
export const matchupLabel = (team, game) => `${team} ${game.home ? 'v' : '@'} ${game.opp}`;
