// teamDashboardModel.js — browser-side derivations for the Statistics team dashboard.

import { DEFAULT_SCORING, calcPoints } from '../scoringEngine.js';
import { passerRating } from '../playerSeason/dashboardModel.js';

const z = (value) => Number(value) || 0;

/** Names compared across ESPN and BALLDONTLIE: no suffixes, punctuation, or case. */
export const nameKey = (value) => String(value ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

export const lastName = (name) => {
  const parts = String(name ?? '').split(' ');
  return parts.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts.at(-1)) ? parts.at(-2) : parts.at(-1);
};

export const gameWon = (game) => game.pf > game.pa;

const SUMS = ['passing_completions', 'passing_attempts', 'passing_yards', 'passing_touchdowns', 'passing_interceptions', 'sacks',
  'rushing_attempts', 'rushing_yards', 'rushing_touchdowns', 'receptions', 'receiving_targets', 'receiving_yards', 'receiving_touchdowns',
  'fumbles', 'fumbles_lost', 'total_tackles', 'solo_tackles', 'defensive_sacks', 'tackles_for_loss', 'passes_defended', 'qb_hits',
  'defensive_interceptions', 'interception_yards', 'interception_touchdowns', 'kick_returns', 'kick_return_yards', 'kick_return_touchdowns',
  'punt_returns', 'punt_return_yards', 'punt_return_touchdowns', 'field_goal_attempts', 'field_goals_made', 'extra_points_made', 'total_points',
  'punts', 'punt_yards', 'punts_inside_20'];
const MAXES = ['long_rushing', 'long_reception', 'long_field_goal_made', 'long_punt'];

/* ---------- Fantasy ---------- */

export const FANTASY_FORMATS = [
  { id: 'ppr', label: 'PPR', rec: 1 },
  { id: 'half', label: 'Half PPR', rec: 0.5 },
  { id: 'std', label: 'Standard', rec: 0 },
];
const FANTASY_GROUPS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const KICKER = new Set(['K', 'PK']);

/** A box-score line in Sleeper stat keys, for calcPoints. */
export function lineToFantasyStats(line = {}) {
  return {
    pass_att: z(line.passing_attempts), pass_cmp: z(line.passing_completions), pass_yd: z(line.passing_yards),
    pass_td: z(line.passing_touchdowns), pass_int: z(line.passing_interceptions),
    rush_att: z(line.rushing_attempts), rush_yd: z(line.rushing_yards), rush_td: z(line.rushing_touchdowns),
    rec: z(line.receptions), rec_tgt: z(line.receiving_targets), rec_yd: z(line.receiving_yards), rec_td: z(line.receiving_touchdowns),
    fum_lost: z(line.fumbles_lost), fgm: z(line.field_goals_made), fga: z(line.field_goal_attempts), xpm: z(line.extra_points_made),
  };
}

/**
 * Scoring for the fantasy toggle. Presets score kickers 3 per field goal and
 * 1 per extra point, because box lines carry no kick distances. League
 * scoring leaves kickers out for the same reason.
 */
export function fantasyScoring(format, leagueScoring) {
  if (format === 'league' && leagueScoring) return { scoring: leagueScoring, kickers: false };
  const preset = FANTASY_FORMATS.find((entry) => entry.id === format) ?? FANTASY_FORMATS[0];
  return { scoring: { ...DEFAULT_SCORING, rec: preset.rec, fgm: 3, xpm: 1 }, kickers: true };
}

export function linePoints(line, position, fantasy) {
  if (!line || !fantasy) return null;
  const pos = String(position ?? '').toUpperCase();
  const group = KICKER.has(pos) ? 'K' : pos;
  if (!FANTASY_GROUPS.has(group) || (group === 'K' && !fantasy.kickers)) return null;
  if (!(line.passing_attempts || line.rushing_attempts || line.receptions || line.receiving_targets || line.field_goal_attempts || line.extra_points_made)) return null;
  return calcPoints(lineToFantasyStats(line), fantasy.scoring, group === 'K' ? 'K' : group);
}

/** Season totals per player from the team's box lines, with fantasy points when scoring is given. */
export function seasonTotals(games = [], fantasy = null) {
  const out = {};
  for (const game of games) {
    for (const line of game.lines) {
      const entry = (out[line.id] ??= { id: line.id, n: line.n, pos: line.pos, j: line.j, gp: 0 });
      entry.gp += 1;
      for (const key of SUMS) if (line[key]) entry[key] = (entry[key] ?? 0) + line[key];
      for (const key of MAXES) if (line[key] != null) entry[key] = Math.max(entry[key] ?? 0, line[key]);
      const points = linePoints(line, line.pos, fantasy);
      if (points != null) { entry.fp = (entry.fp ?? 0) + points; entry.fgp = (entry.fgp ?? 0) + 1; }
    }
  }
  for (const entry of Object.values(out)) if (entry.punts) entry.punt_avg = z(entry.punt_yards) / entry.punts;
  return Object.values(out);
}

export const lineFor = (game, id) => game.lines.find((line) => line.id === id);

/* ---------- Depth chart ---------- */

export const unitOf = (name) => (/special/i.test(name) ? 'st' : /wr|te|offense/i.test(name) ? 'off' : 'def');

/** ESPN athlete id → every depth-chart slot they hold, with 1-based rank. */
export function depthIndex(units = []) {
  const index = {};
  for (const unit of units) {
    const key = unitOf(unit.name);
    const fourThree = /4-3/.test(unit.name ?? '');
    for (const slot of unit.slots) {
      slot.athletes.forEach((athlete, i) => {
        (index[athlete.id] ??= []).push({ unit: key, k: slot.key, a: slot.abbr, n: slot.name, rank: i + 1, fourThree });
      });
    }
  }
  return index;
}

const ROLE_FROM_SLOT = { qb: 'QB', rb: 'RB', fb: 'RB', wr: 'WR', wr1: 'WR', wr2: 'WR', wr3: 'WR', te: 'TE', lde: 'DL', nt: 'DL', rde: 'DL', ldt: 'DL', rdt: 'DL', wlb: 'EDGE', slb: 'EDGE', lilb: 'LB', rilb: 'LB', mlb: 'LB', lcb: 'CB', rcb: 'CB', ss: 'S', fs: 'S', pk: 'K', p: 'P' };
// In a 4-3 the ends rush the passer and all three linebackers play off the ball; the slot
// map above is the 3-4 reading (ends inside, outside linebackers on the edge).
const ROLE_FROM_SLOT_43 = { lde: 'EDGE', rde: 'EDGE', ldt: 'DL', rdt: 'DL', nt: 'DL', wlb: 'LB', mlb: 'LB', slb: 'LB' };
// Without a depth chart, a listed defensive end is the best edge signal the box score has.
const ROLE_FROM_POS = { QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE', DT: 'DL', DE: 'EDGE', NT: 'DL', DL: 'DL', LB: 'LB', ILB: 'LB', MLB: 'LB', OLB: 'EDGE', CB: 'CB', S: 'S', SS: 'S', FS: 'S', PK: 'K', K: 'K', P: 'P' };

/** The card role for a player: his best depth-chart slot, else his listed position. */
export function roleOf(position, depthSlots = []) {
  const slots = depthSlots.filter((slot) => slot.unit !== 'st' || slot.k === 'pk' || slot.k === 'p').sort((a, b) => a.rank - b.rank);
  for (const slot of slots) {
    if (slot.k === 'nb') return ROLE_FROM_POS[position] || 'CB';
    const role = (slot.fourThree && ROLE_FROM_SLOT_43[slot.k]) || ROLE_FROM_SLOT[slot.k];
    if (role) return role;
  }
  return ROLE_FROM_POS[String(position ?? '').toUpperCase()] ?? null;
}

const rating = (a) => passerRating(z(a.passing_completions), z(a.passing_attempts), z(a.passing_yards), z(a.passing_touchdowns), z(a.passing_interceptions));

export const LEADER_SPECS = {
  QB: { label: 'Quarterback', score: (a) => z(a.passing_attempts), stat: 'passing_yards', unit: 'pass yds', line: (a) => `${z(a.passing_completions)}/${z(a.passing_attempts)} · ${z(a.passing_touchdowns)} TD · ${z(a.passing_interceptions)} INT · ${(rating(a) ?? 0).toFixed(1)} rating` },
  RB: { label: 'Running back', score: (a) => z(a.rushing_attempts), stat: 'rushing_yards', unit: 'rush yds', line: (a) => `${z(a.rushing_attempts)} carries · ${(z(a.rushing_yards) / (a.rushing_attempts || 1)).toFixed(1)} avg · ${z(a.rushing_touchdowns)} TD · ${z(a.receptions)} catches` },
  WR: { label: 'Wide receiver', score: (a) => z(a.receiving_yards), stat: 'receiving_yards', unit: 'rec yds', line: (a) => `${z(a.receptions)} catches on ${z(a.receiving_targets)} targets · ${z(a.receiving_touchdowns)} TD` },
  TE: { label: 'Tight end', score: (a) => z(a.receiving_yards) + z(a.receptions), stat: 'receiving_yards', unit: 'rec yds', line: (a) => `${z(a.receptions)} catches on ${z(a.receiving_targets)} targets · ${z(a.receiving_touchdowns)} TD` },
  EDGE: { label: 'Edge rusher', score: (a) => 3 * z(a.defensive_sacks) + z(a.qb_hits) + z(a.tackles_for_loss), stat: 'defensive_sacks', unit: 'sacks', dp: 1, line: (a) => `${z(a.qb_hits)} QB hits · ${z(a.tackles_for_loss)} for loss · ${z(a.total_tackles)} tackles` },
  DL: { label: 'Defensive line', score: (a) => z(a.total_tackles) + 2 * z(a.tackles_for_loss) + 3 * z(a.defensive_sacks), stat: 'total_tackles', unit: 'tackles', line: (a) => `${z(a.defensive_sacks)} sacks · ${z(a.tackles_for_loss)} for loss · ${z(a.qb_hits)} QB hits` },
  LB: { label: 'Linebacker', score: (a) => z(a.total_tackles), stat: 'total_tackles', unit: 'tackles', line: (a) => `${z(a.solo_tackles)} solo · ${z(a.tackles_for_loss)} for loss · ${z(a.passes_defended)} passes defended` },
  CB: { label: 'Cornerback', score: (a) => 2 * z(a.passes_defended) + 4 * z(a.defensive_interceptions) + 0.3 * z(a.total_tackles), stat: 'passes_defended', unit: 'passes defended', line: (a) => `${z(a.defensive_interceptions)} INT · ${z(a.total_tackles)} tackles` },
  S: { label: 'Safety', score: (a) => z(a.total_tackles) + 4 * z(a.defensive_interceptions) + z(a.passes_defended), stat: 'total_tackles', unit: 'tackles', line: (a) => `${z(a.defensive_interceptions)} INT · ${z(a.passes_defended)} passes defended` },
  K: { label: 'Kicker', score: (a) => z(a.total_points) + z(a.field_goal_attempts), stat: 'total_points', unit: 'points', line: (a) => `${z(a.field_goals_made)}/${z(a.field_goal_attempts)} field goals · long ${a.long_field_goal_made ?? '–'} · ${z(a.extra_points_made)} extra points` },
  INT: { label: 'Interceptions', score: (a) => z(a.defensive_interceptions), stat: 'defensive_interceptions', unit: 'INT', line: (a) => `${z(a.interception_yards)} return yards · ${z(a.passes_defended)} passes defended` },
  P: { label: 'Punter', score: (a) => z(a.punts), stat: 'punt_avg', unit: 'yds per punt', dp: 1, line: (a) => `${z(a.punts)} punts · ${z(a.punts_inside_20)} inside the 20 · long ${a.long_punt ?? '–'}` },
};
export const FANTASY_ROLES = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

/** Where a player sits on the depth chart, in plain words, and whether he's a backup. */
export function depthStanding(slots = [], role, slotAthletes) {
  const slot = slots.filter((entry) => entry.unit !== 'st' || role === 'K' || role === 'P').sort((a, b) => a.rank - b.rank)[0];
  if (!slot) return { text: 'Not on the depth chart', backup: false, slot: null };
  const starters = slot.k === 'wr' ? 3 : 1;
  const backup = slot.rank > starters;
  const ahead = backup && slot.k !== 'wr' ? slotAthletes?.(slot)?.[0]?.name : null;
  const ordinal = ['', '1st', '2nd', '3rd'][slot.rank] ?? `${slot.rank}th`;
  return {
    backup,
    slot,
    text: backup ? `${ordinal} at ${slot.a}${ahead ? `, behind ${lastName(ahead)}` : ''}` : `Starter at ${slot.a}`,
  };
}

/* ---------- Scoring breakdown ---------- */

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];
export const SCORING_ROWS = ['Passing TD', 'Rushing TD', 'Field goal', 'Extra point', 'Two-point conversion', 'Defensive scores', 'Return TD'];
const TRY_ROWS = new Set(['Extra point', 'Two-point conversion']);
// Rows that show even at zero, so a missing kind of score reads as none rather than as left out.
const ALWAYS_ROWS = new Set(['Extra point', 'Two-point conversion', 'Defensive scores']);

/**
 * Every scoring play split into its parts: the score itself and the try after a
 * touchdown. Games cached before tries were read keep their total on the play.
 */
export function scoringPartsOf(games = []) {
  return games.flatMap((game) => (game.scoring ?? []).flatMap((play) => {
    const quarter = QUARTERS[Math.min(play.q, 5) - 1] ?? 'OT';
    const type = play.type === 'Defensive TD' || play.type === 'Safety' ? 'Defensive scores' : play.type;
    const parts = [{ side: play.side, quarter, type, pts: play.playPts ?? play.pts, made: true }];
    if (play.try) parts.push({ side: play.side, quarter, type: play.try, pts: z(play.tryPts), made: Boolean(play.tryGood) });
    return parts;
  }));
}

/** The team's points by way of scoring, for the season or one quarter. Tries count made of attempted. */
export function scoringBreakdown(parts = [], quarter = null) {
  const mine = parts.filter((part) => part.side === 'me' && (!quarter || part.quarter === quarter));
  return SCORING_ROWS.map((type) => {
    const list = mine.filter((part) => part.type === type);
    const made = list.filter((part) => part.made).length;
    const isTry = TRY_ROWS.has(type);
    return { type, pts: list.reduce((total, part) => total + part.pts, 0), plays: isTry ? made : list.length, made: isTry ? made : null, attempts: isTry ? list.length : null };
  }).filter((row) => row.plays || row.attempts || ALWAYS_ROWS.has(row.type));
}

/** Points by quarter for the team and its opponents, in total or for one way of scoring. */
export function quarterPoints(parts = [], type = null) {
  return QUARTERS.map((quarter) => {
    const list = parts.filter((part) => part.quarter === quarter && (!type || part.type === type));
    const sum = (side) => list.filter((part) => part.side === side).reduce((total, part) => total + part.pts, 0);
    return { q: quarter, f: sum('me'), a: sum('opp') };
  });
}
