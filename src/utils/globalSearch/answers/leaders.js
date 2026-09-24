// ── Leader answers ─────────────────────────────────────────────────────────
// "most rushing yards", "top wr this season", "seahawks receiving", "buf sacks".
//
// Ranks over already-cached stats. Like every resolver here it returns null
// rather than fetching when the data is cold.
//
// Two shapes reach this resolver. A superlative query ("most rushing yards")
// asks about a field. A scope-and-stat query ("seahawks receiving", "nfc west
// rushing", "afc sacks") asks about part of the league and carries no
// superlative at all — naming where to look and what to look for is already an
// unambiguous request for the leaders in it, and requiring people to type
// "most" for the obvious reading is the kind of vocabulary tax this search is
// built to avoid.
//
// The scope itself is resolved in scope.js, shared with standings and team
// stats, so "afc east" means the same four teams whichever card answers.

import { calcPoints } from '../../scoringEngine.js';
import { formatStatValue, IDP_POSITIONS, resolveStatKey } from './playerStat.js';
import { isTeamInScope, resolveTeamScope } from './scope.js';
import { matchesFilter } from '../../parseSearchQuery.js';

const STAT_LABELS = {
  pass_yd: 'passing yards',
  pass_td: 'passing TDs',
  pass_cmp: 'completions',
  pass_att: 'pass attempts',
  pass_int: 'interceptions',
  rush_yd: 'rushing yards',
  rush_td: 'rushing TDs',
  rush_att: 'carries',
  rec_yd: 'receiving yards',
  rec_td: 'receiving TDs',
  rec: 'receptions',
  rec_tgt: 'targets',
  sack: 'sacks',
  tkl: 'tackles',
  int: 'interceptions',
  idp_sack: 'sacks',
  idp_tkl: 'tackles',
  idp_tkl_loss: 'tackles for loss',
  idp_int: 'interceptions',
  idp_ff: 'forced fumbles',
  idp_pass_def: 'passes defended',
  fum_lost: 'fumbles lost',
  pts: 'fantasy points',
};

const RESULT_LIMIT = 5;

// A team's whole qualifying group, for the card's expanded state. A roster
// never has more than a couple of dozen players with a given stat, so this is
// the real "see all" rather than a second, longer truncation.
const TEAM_RESULT_LIMIT = 24;

function sumStat(weeks, statKey, scoring, position) {
  if (statKey === 'pts') {
    return weeks.reduce((total, week) => total + calcPoints(week, scoring, position), 0);
  }
  return weeks.reduce((total, week) => total + (Number(week[statKey]) || 0), 0);
}

// Stats only a defender records. A leaderboard for one means the players who
// made the plays, so the team defense unit is held out: its team total would
// sit above every individual on it.
const IDP_ONLY_STATS = new Set(['sack', 'tkl', 'ff', 'int']);

// "Interceptions" is genuinely ambiguous — one a quarterback threw, one a
// defender caught — and the position already resolves it per player. So the
// field stays open to both readings here; only the team unit is held out, for
// the same reason as above.
const DUAL_READ_STATS = new Set(['pass_int']);

/**
 * Should this record be in a leaderboard for this stat?
 *
 * Naming the team defense ("seahawks team defense sacks") asks for the team
 * total instead, and is the only way to get it.
 */
function qualifiesForStat(position, requestedStat, slots) {
  const wantsTeamDefense = slots.positions.includes('DEF');

  if (IDP_ONLY_STATS.has(requestedStat)) {
    return wantsTeamDefense
      ? position === 'DEF'
      : position !== 'DEF' && IDP_POSITIONS.has(position);
  }

  if (DUAL_READ_STATS.has(requestedStat)) {
    return wantsTeamDefense ? position === 'DEF' : position !== 'DEF';
  }

  return true;
}

/**
 * Rank players by a stat.
 *
 * Rank is assigned over the full ranked field *before* the position filter is
 * applied, and the carried rank is what renders — so "top WR" shows a receiver's
 * standing among all players, not a renumbered 1..5 that means something
 * different from the rest of the app.
 */
export function resolveLeadersAnswer(slots, data = {}) {
  const scope = resolveTeamScope(slots, data.nflTeams ?? []);
  // A scope plus a stat is its own trigger — see the note at the top of the
  // file. Naming only a scope is not: "seahawks" is a team lookup.
  const isScopedQuery = !scope.isLeagueWide && slots.stats.length > 0;

  if (!slots.superlative && !isScopedQuery) return null;
  // A superlative that only exists because a name was typo-corrected is far too
  // weak to justify an answer card: a surname one edit from "best" or "most"
  // would otherwise turn a player lookup into a leaderboard.
  if (slots.superlative && slots.correctedTypes?.includes('superlative')) return null;
  // The same caution applies to a scope that is only a scope because of a
  // correction: a surname one edit from an abbreviation would turn a player
  // lookup into that team's leaderboard.
  if (isScopedQuery && slots.correctedTypes?.includes('team')) return null;
  if (!slots.stats.length && !slots.positions.length) return null;
  // A scope nothing satisfies ("afc east seahawks") is a real answer, but it is
  // an empty one — better to say nothing than to widen it back to the league.
  if (!scope.isLeagueWide && scope.teamIds.size === 0) return null;

  const { weeklyStats, players, scoring } = data;
  if (!weeklyStats || !players) return null;

  const direction = slots.superlative === 'least' ? 1 : -1;
  // With a position but no stat named ("top WR"), fantasy points is what people
  // mean by best at a position.
  const requestedStat = slots.stats[0] ?? 'pts';

  const ranked = [];
  for (const [sleeperId, weeks] of Object.entries(weeklyStats)) {
    if (!Array.isArray(weeks) || !weeks.length) continue;
    const player = players[sleeperId];
    if (!player?.position) continue;

    const position = String(player.position).toUpperCase();
    if (!qualifiesForStat(position, requestedStat, slots)) continue;
    const statKey = resolveStatKey(requestedStat, position);
    const value = sumStat(weeks, statKey, scoring, position);
    if (!Number.isFinite(value) || value === 0) continue;

    ranked.push({
      sleeperId,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      team: player.team ? String(player.team).toUpperCase() : null,
      position,
      statKey,
      value,
    });
  }

  if (!ranked.length) return null;

  ranked.sort((left, right) => direction * (left.value - right.value));
  // Rank before filtering; the filtered rows keep the rank they earned.
  ranked.forEach((entry, position) => { entry.rank = position + 1; });

  let filtered = ranked;
  if (slots.positions.length) {
    filtered = filtered.filter(
      (entry) => slots.positions.some((pos) => matchesFilter(entry.position, pos)),
    );
  }
  // The scope filter runs here, after ranking, for the same reason the position
  // filter does: a player's rank means their standing in the league, not a
  // renumbered 1..5 that would read as if a division had the top receiver in
  // football.
  if (!scope.isLeagueWide) {
    filtered = filtered.filter((entry) => isTeamInScope(scope, entry.team));
  }
  if (!filtered.length) return null;

  const statLabel = STAT_LABELS[filtered[0].statKey] ?? filtered[0].statKey;
  // Plain language over the roster abbreviation: "DEF" is the slot code, not
  // what anyone calls the unit.
  const positionNames = slots.positions.map((pos) => (pos === 'DEF' ? 'team defense' : pos));
  const positionLabel = positionNames.length ? ` — ${positionNames.join(', ')}` : '';
  // A scope narrow enough to read in full gets the full group; the league does
  // not, and stays at five.
  const limit = scope.isLeagueWide ? RESULT_LIMIT : TEAM_RESULT_LIMIT;

  // A scoped card is titled for the scope, not for a superlative nobody typed.
  const title = !scope.isLeagueWide && !slots.superlative
    ? `${scope.label} — ${statLabel}${positionLabel}`
    : `${slots.superlative === 'least' ? 'Fewest' : 'Most'} ${statLabel}${positionLabel}`
      + (!scope.isLeagueWide ? ` — ${scope.label}` : '');

  return {
    kind: 'leaders',
    title,
    subtitle: slots.timeframe === 'season' || !slots.timeframe ? 'This season' : null,
    // Ranks are league-wide, so the card says so rather than leaving a scoped
    // leader's "#14" looking like a mistake.
    footnote: scope.isLeagueWide ? null : 'Rank is across the NFL',
    // Rows past the fifth are collapsed behind the card's own "Show all", which
    // is why a scoped query returns the full qualifying group rather than five.
    collapseAfter: RESULT_LIMIT,
    // Only a single team has a page to open. A division does not.
    route: scope.isSingleTeam
      ? {
        activeTab: 'statistics',
        statisticsView: 'team',
        statisticsTeamId: [...scope.teamIds][0],
      }
      : null,
    routeLabel: scope.isSingleTeam ? `Open ${scope.label}` : null,
    rows: filtered.slice(0, limit).map((entry) => ({
      rank: entry.rank,
      sleeperId: entry.sleeperId,
      label: entry.name,
      sublabel: [entry.position, entry.team].filter(Boolean).join(' · '),
      display: formatStatValue(entry.statKey, entry.value),
    })),
  };
}
