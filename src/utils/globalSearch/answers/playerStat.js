// ── Player stat answers ────────────────────────────────────────────────────
// "josh allen stats", "trevor lawrence passing yards this season", "lv 17 last week".
//
// Resolvers are pure: they read already-cached stats and return a display model,
// or null. They never fetch. A cold cache degrades to a plain navigation row,
// which is a better outcome than a palette that stalls on a multi-megabyte
// download the user did not ask for.

import { calcPoints } from '../../scoringEngine.js';

// Display metadata per canonical stat key. Labels are plain language rather than
// the abbreviations the underlying data uses.
const STAT_LABELS = {
  pass_yd: 'Passing yards',
  pass_td: 'Passing TDs',
  pass_int: 'Interceptions',
  pass_cmp: 'Completions',
  pass_att: 'Pass attempts',
  rush_yd: 'Rushing yards',
  rush_td: 'Rushing TDs',
  rush_att: 'Carries',
  rec_yd: 'Receiving yards',
  rec_td: 'Receiving TDs',
  rec: 'Receptions',
  rec_tgt: 'Targets',
  fum_lost: 'Fumbles lost',
  sack: 'Sacks',
  tkl: 'Tackles',
  int: 'Interceptions',
  def_td: 'Defensive TDs',
  idp_sack: 'Sacks',
  idp_tkl: 'Tackles',
  idp_tkl_solo: 'Solo tackles',
  idp_tkl_loss: 'Tackles for loss',
  idp_int: 'Interceptions',
  idp_ff: 'Forced fumbles',
  idp_fum_rec: 'Fumble recoveries',
  idp_pass_def: 'Passes defended',
  idp_qb_hit: 'QB hits',
  pts: 'Fantasy points',
};

// What a defender's stat line is. Without this an IDP search fell through to the
// offensive fallback and answered a linebacker's "stats" with four zeroes for
// rushing and receiving.
const IDP_LINE = ['idp_tkl', 'idp_sack', 'idp_int', 'idp_pass_def'];

// The stat line shown when the query names no specific stat, by position. These
// are the numbers someone means by "stats" for that player.
const DEFAULT_LINES = {
  QB: ['pass_yd', 'pass_td', 'pass_int', 'rush_yd'],
  RB: ['rush_att', 'rush_yd', 'rush_td', 'rec', 'rec_yd'],
  WR: ['rec', 'rec_yd', 'rec_td', 'rec_tgt'],
  TE: ['rec', 'rec_yd', 'rec_td', 'rec_tgt'],
  K: ['pts'],
  DEF: ['sack', 'int', 'pts'],
  DL: IDP_LINE,
  DE: IDP_LINE,
  DT: IDP_LINE,
  NT: IDP_LINE,
  EDGE: IDP_LINE,
  LB: IDP_LINE,
  ILB: IDP_LINE,
  OLB: IDP_LINE,
  MLB: IDP_LINE,
  DB: IDP_LINE,
  CB: ['idp_tkl', 'idp_pass_def', 'idp_int', 'idp_sack'],
  S: IDP_LINE,
  SS: IDP_LINE,
  FS: IDP_LINE,
};

const FALLBACK_LINE = ['rush_yd', 'rec_yd', 'rec', 'pts'];

// "yards" and "touchdowns" are deliberately ambiguous in the vocabulary. The
// player's position resolves them, which is what the user meant anyway.
const AMBIGUOUS_STATS = {
  yards: { QB: 'pass_yd', RB: 'rush_yd', WR: 'rec_yd', TE: 'rec_yd' },
  td: { QB: 'pass_td', RB: 'rush_td', WR: 'rec_td', TE: 'rec_td' },
};

// ── Defensive stats live under two different key sets ──────────────────────
// Sleeper files an individual defender's production under `idp_*` and a team
// defense's under the bare names. Nothing carries both: a defender's `sack` is
// always undefined, which is why "seahawks sacks" used to answer with the
// Seahawks DEF unit alone — the only record in the league that had a `sack` key
// at all, with every actual pass rusher scoring zero and being dropped.
//
// The position resolves which set to read, exactly as it already resolves a
// bare "yards".
export const IDP_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'EDGE', 'ED',
  'LB', 'ILB', 'OLB', 'MLB',
  'DB', 'CB', 'S', 'SS', 'FS',
]);

const IDP_STAT_KEYS = {
  sack: 'idp_sack',
  tkl: 'idp_tkl',
  // A defender's interception is one he caught; the shared vocabulary key for
  // "interceptions" is the one a quarterback throws.
  pass_int: 'idp_int',
  int: 'idp_int',
  ff: 'idp_ff',
};

const TEAM_DEF_STAT_KEYS = {
  pass_int: 'int',
  tkl: 'tkl',
};

export function resolveStatKey(statKey, position) {
  const pos = String(position ?? '').toUpperCase();

  if (pos === 'DEF') return TEAM_DEF_STAT_KEYS[statKey] ?? statKey;
  if (IDP_POSITIONS.has(pos)) return IDP_STAT_KEYS[statKey] ?? statKey;

  const mapping = AMBIGUOUS_STATS[statKey];
  if (!mapping) return statKey;
  return mapping[pos] ?? mapping.WR;
}

// Sacks and tackles for loss are credited in halves, so rounding them would
// turn 2.5 into 3 — a number the player did not record.
const FRACTIONAL_STATS = new Set(['sack', 'idp_sack', 'idp_tkl_loss', 'pts_idp']);

export function formatStatValue(statKey, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (statKey === 'pts') return value.toFixed(1);
  if (FRACTIONAL_STATS.has(statKey)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(Math.round(value));
}

const formatValue = formatStatValue;

/**
 * Pick the weeks the timeframe refers to.
 *
 * `currentWeek` is the league's current week; "last week" means the week before
 * it, which is the most recent one with complete stats.
 */
function selectWeeks(weeks, timeframe, explicitWeek, currentWeek) {
  if (!Array.isArray(weeks) || !weeks.length) return { weeks: [], label: null };

  if (typeof explicitWeek === 'number') {
    const match = weeks.filter((entry) => entry.week === explicitWeek);
    return { weeks: match, label: `Week ${explicitWeek}` };
  }

  if (timeframe === 'last_week' && Number.isFinite(currentWeek)) {
    const target = currentWeek - 1;
    const match = weeks.filter((entry) => entry.week === target);
    return { weeks: match, label: `Week ${target}` };
  }

  if (timeframe === 'this_week' && Number.isFinite(currentWeek)) {
    const match = weeks.filter((entry) => entry.week === currentWeek);
    return { weeks: match, label: `Week ${currentWeek}` };
  }

  return { weeks, label: 'This season' };
}

function sumStats(weeks) {
  const totals = {};
  for (const week of weeks) {
    for (const [key, value] of Object.entries(week)) {
      if (key === 'week' || typeof value !== 'number') continue;
      totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return totals;
}

/**
 * Build a stat answer for the top player result, or null.
 *
 * @param {object} slots       parsed query slots
 * @param {object} record      the player search record the answer is about
 * @param {object} data        { weeklyStats, scoring, currentWeek }
 */
export function resolvePlayerStatAnswer(slots, record, data = {}) {
  if (!record || record.kind !== 'player') return null;

  const wantsStats = slots.intents.includes('stats')
    || slots.stats.length > 0
    || slots.timeframe != null;
  if (!wantsStats) return null;

  const { weeklyStats, scoring, currentWeek } = data;
  const sleeperId = record.meta?.sleeperId;
  if (!sleeperId || !weeklyStats) return null;

  const playerWeeks = weeklyStats[sleeperId];
  if (!Array.isArray(playerWeeks) || !playerWeeks.length) return null;

  const { weeks, label: timeframeLabel } = selectWeeks(
    playerWeeks,
    slots.timeframe,
    typeof slots.week === 'number' ? slots.week : null,
    currentWeek,
  );
  if (!weeks.length) return null;

  const totals = sumStats(weeks);
  const position = record.meta?.position;
  const points = calcPoints(totals, scoring, position);

  const requested = slots.stats.map((key) => resolveStatKey(key, position));
  const keys = requested.length
    ? requested
    : (DEFAULT_LINES[String(position ?? '').toUpperCase()] ?? FALLBACK_LINE);

  const values = keys.map((key) => ({
    key,
    label: STAT_LABELS[key] ?? key,
    value: key === 'pts' ? points : (totals[key] ?? 0),
    display: formatValue(key, key === 'pts' ? points : (totals[key] ?? 0)),
  }));

  return {
    kind: 'playerStat',
    title: record.label,
    subtitle: [record.meta?.position, record.meta?.team, timeframeLabel]
      .filter(Boolean)
      .join(' · '),
    values,
    // Games are meaningful for a season line and noise for a single week.
    footnote: weeks.length > 1 ? `${weeks.length} games` : null,
  };
}
