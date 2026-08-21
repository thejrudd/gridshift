// Play-type filtering for the Fantasy Live feed and pace chart.
//
// The filter set is derived from the league rather than hardcoded. Leagues
// score wildly differently — no kicker slot, IDP, return yardage, 4- versus
// 6-point passing touchdowns — so a fixed list of chips would offer filters
// that can never match, and miss ones that matter. Every group and type here
// declares what has to be scorable for it to exist.
//
// Filters read an event's `mechanism` (the football action) as well as its
// `kind` (the fantasy result). A rushing touchdown is kind 'td', mechanism
// 'rush', so it belongs under Rush *and* under TD.

const TD_KEYS = [
  'pass_td', 'rush_td', 'rec_td', 'ret_td', 'kr_td', 'pr_td',
  'def_td', 'idp_def_td', 'fum_ret_td',
];
const KICK_FG_KEYS = ['fgm', 'fg_0_19', 'fg_20_29', 'fg_30_39', 'fg_40_49', 'fg_50p'];
const PASS_KEYS = ['pass_yd', 'pass_td', 'pass_cmp', 'pass_att', 'rec', 'rec_yd', 'rec_td'];
const RUSH_KEYS = ['rush_yd', 'rush_td', 'rush_att'];
const RETURN_KEYS = ['kr_yd', 'pr_yd', 'kr_td', 'pr_td', 'ret_td'];
const TURNOVER_KEYS = ['pass_int', 'fum_lost', 'fum'];
const DEFENSE_SLOTS = new Set(['DEF', 'DL', 'LB', 'DB', 'IDP', 'IDP_FLEX', 'DE', 'DT', 'CB', 'S']);

function scores(scoringSettings, keys) {
  return keys.some((key) => Number(scoringSettings?.[key] ?? 0) !== 0);
}

function hasDefensiveSlot(rosterPositions = []) {
  return rosterPositions.some((slot) => DEFENSE_SLOTS.has(String(slot ?? '').toUpperCase()));
}

// "Big" has to mean the same thing in a 4-point passing league as a 6-point
// one, so it is pegged to what this league pays for the cheapest touchdown —
// every score clears the bar, and so does any other play worth as much.
export function getBigPlayThreshold(scoringSettings) {
  const values = TD_KEYS
    .map((key) => Number(scoringSettings?.[key] ?? 0))
    .filter((value) => value > 0);
  return values.length ? Math.min(...values) : 5;
}

const TYPES = {
  td: { id: 'td', label: 'TD', available: (s) => scores(s, TD_KEYS) },
  fg: { id: 'fg', label: 'FG', available: (s) => scores(s, KICK_FG_KEYS) },
  xp: { id: 'xp', label: 'XP', available: (s) => scores(s, ['xpm']) },
  pass: { id: 'pass', label: 'Pass & rec', available: (s) => scores(s, PASS_KEYS) },
  rush: { id: 'rush', label: 'Rush', available: (s) => scores(s, RUSH_KEYS) },
  return: { id: 'return', label: 'Return', available: (s) => scores(s, RETURN_KEYS) },
  turnover: { id: 'turnover', label: 'Turnover', available: (s) => scores(s, TURNOVER_KEYS) },
  big: { id: 'big', label: 'Big plays', available: () => true },
  negative: { id: 'negative', label: 'Negative', available: () => true },
};

const GROUPS = [
  { id: 'scoring', label: 'Scoring', types: ['td', 'fg', 'xp'] },
  { id: 'offense', label: 'Offense', types: ['pass', 'rush'] },
  {
    id: 'defense',
    label: 'Defense',
    types: [],
    available: (s, roster) => scores(s, ['def_td', 'idp_sack', 'idp_int', 'idp_tkl', 'idp_fr', 'idp_pd'])
      || hasDefensiveSlot(roster),
  },
  { id: 'special', label: 'Special teams', types: ['fg', 'xp', 'return'] },
  { id: 'highlights', label: 'Highlights', types: ['big', 'negative', 'turnover'] },
];

/**
 * The filter tiers this league can actually use. Groups whose every type is
 * unscorable are dropped entirely rather than shown as dead chips.
 */
export function buildFeedFilterModel({ scoringSettings = {}, rosterPositions = [] } = {}) {
  return GROUPS
    .map((group) => ({
      id: group.id,
      label: group.label,
      types: group.types
        .map((typeId) => TYPES[typeId])
        .filter((type) => type.available(scoringSettings))
        .map(({ id, label }) => ({ id, label })),
      explicitlyAvailable: group.available?.(scoringSettings, rosterPositions) ?? null,
    }))
    .filter((group) => (
      group.explicitlyAvailable != null ? group.explicitlyAvailable : group.types.length > 0
    ))
    .map((group) => ({ id: group.id, label: group.label, types: group.types }));
}

function eventAction(event) {
  return String(event?.mechanism ?? event?.kind ?? '').toLowerCase();
}

function eventKind(event) {
  return String(event?.kind ?? '').toLowerCase();
}

function matchesType(event, typeId, threshold) {
  const kind = eventKind(event);
  const action = eventAction(event);
  const points = Number(event?.pts) || 0;
  switch (typeId) {
    case 'td': return kind === 'td';
    case 'fg': return kind === 'fg';
    case 'xp': return kind === 'xp';
    // Action filters read the mechanism, so a rushing touchdown stays a rush.
    case 'pass': return action === 'pass' || kind === 'pass';
    case 'rush': return action === 'rush' || kind === 'rush';
    case 'return': return action === 'return' || kind === 'return';
    case 'turnover': return kind === 'to';
    case 'big': return points >= threshold;
    case 'negative': return points < 0;
    default: return false;
  }
}

function matchesGroup(event, groupId, threshold) {
  const kind = eventKind(event);
  const action = eventAction(event);
  switch (groupId) {
    case 'scoring': return ['td', 'fg', 'xp'].includes(kind);
    case 'offense': return action === 'pass' || action === 'rush';
    case 'defense': return action === 'def' || kind === 'def';
    case 'special': return kind === 'fg' || kind === 'xp' || action === 'return';
    case 'highlights': return matchesType(event, 'big', threshold)
      || matchesType(event, 'negative', threshold)
      || matchesType(event, 'turnover', threshold);
    default: return true;
  }
}

export const EMPTY_FEED_FILTER = Object.freeze({ group: 'all', types: [], positions: [] });

/**
 * Whether one event survives the active filter. Group, types and position are
 * ANDed; the types within a group are ORed, and selecting none of them means
 * the whole group.
 */
export function matchesFeedFilter(event, filter = EMPTY_FEED_FILTER, { position = null, threshold = 5 } = {}) {
  if (!event) return false;
  const group = filter?.group ?? 'all';
  const types = filter?.types ?? [];
  const positions = filter?.positions ?? [];

  if (positions.length) {
    const resolved = String(position ?? '').toUpperCase();
    if (!positions.includes(resolved)) return false;
  }
  if (group !== 'all' && !matchesGroup(event, group, threshold)) return false;
  if (types.length && !types.some((typeId) => matchesType(event, typeId, threshold))) return false;
  return true;
}

/** Toggles one id in a multi-select list. */
export function toggleFilterValue(values = [], value) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}
