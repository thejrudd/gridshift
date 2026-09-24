// ── Standings answers ──────────────────────────────────────────────────────
// "nfc west standings", "afc standings", "fantasy standings", "league table".
//
// Both competitions are answered here because they are the same question asked
// of two different tables, and keeping them together is what stops the NFL card
// and the fantasy card drifting into different column sets.
//
// Nothing fetches. The NFL rows come from `buildStatisticsStandings`, the same
// pure builder the Statistics standings page uses, run over the hydrated
// schedule the app already holds. The fantasy rows come from
// `getFantasyRosterSeasonSummary` over rosters SleeperContext hydrates from
// localStorage at mount. A cold cache means no schedule and no rosters, and the
// resolver returns null like every other one here.

import { buildStatisticsStandings, compareStandingRows } from '../../statisticsStandings.js';
import { getFantasyRosterSeasonSummary } from '../../fantasySeasonSchedule.js';
import { resolveTeamScope } from './scope.js';

// The NFL model is derived once per schedule object and cached on it. Search
// rebuilds its answer on every keystroke, and replaying the whole season's
// games each time is the kind of cost that shows up as input lag.
const modelCache = new WeakMap();

function round1(value) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

/**
 * Every team's opponents across the full schedule, played or not.
 *
 * Strength of schedule is about the season a team was handed, so it counts the
 * games still to come as well as the ones behind them.
 */
function opponentsBySchedule(scheduleData) {
  const byTeam = new Map();
  const weeks = scheduleData?.weeks ?? [];
  const list = Array.isArray(weeks) ? weeks : Object.values(weeks);

  for (const week of list) {
    for (const game of week?.games ?? []) {
      const away = String(game.awayTeam ?? game.away_team ?? game.away ?? '').toUpperCase();
      const home = String(game.homeTeam ?? game.home_team ?? game.home ?? '').toUpperCase();
      if (!away || !home) continue;
      if (!byTeam.has(away)) byTeam.set(away, []);
      if (!byTeam.has(home)) byTeam.set(home, []);
      byTeam.get(away).push(home);
      byTeam.get(home).push(away);
    }
  }

  return byTeam;
}

/**
 * The NFL standings rows, with the derived columns search asks for that the
 * standings page does not show: points per game, points allowed per game, and
 * strength of schedule.
 *
 * SOS here is the average win percentage of a team's opponents, computed from
 * results actually on the board. That is the conventional reading and it is
 * always available. The app's other SOS — `getStrengthOfSchedule` in
 * scheduleParser.js — is average opponent *predicted* wins, which belongs to
 * the Predictions tab and returns nothing until the user has made predictions.
 * A search result that said "unavailable" for a number visible elsewhere would
 * be worse than a different, well-labelled one.
 */
export function buildNflStandingsModel({ nflTeams = [], nflSchedule = null } = {}) {
  if (!nflSchedule || !nflTeams?.length) return null;

  const cached = modelCache.get(nflSchedule);
  if (cached) return cached;

  const standings = buildStatisticsStandings({ teams: nflTeams, scheduleData: nflSchedule });
  const winPctById = new Map(standings.rows.map((row) => [row.teamId, row.winPct]));
  const opponents = opponentsBySchedule(nflSchedule);

  const rows = standings.rows.map((row) => {
    const opponentPcts = (opponents.get(row.teamId) ?? [])
      .map((opponentId) => winPctById.get(opponentId))
      .filter((pct) => pct != null && Number.isFinite(pct));
    const sos = opponentPcts.length
      ? opponentPcts.reduce((total, pct) => total + pct, 0) / opponentPcts.length
      : null;

    return {
      ...row,
      name: row.team?.name ?? row.teamId,
      pointsPerGame: row.gamesPlayed ? round1(row.pointsFor / row.gamesPlayed) : null,
      pointsAgainstPerGame: row.gamesPlayed ? round1(row.pointsAgainst / row.gamesPlayed) : null,
      strengthOfSchedule: sos,
    };
  });

  const model = {
    rows,
    byId: new Map(rows.map((row) => [row.teamId, row])),
    // Nothing has been played yet: every row would be 0-0 and every derived
    // column empty, which is a table that answers nothing.
    hasResults: standings.scoredGames > 0,
  };

  modelCache.set(nflSchedule, model);
  return model;
}

/**
 * The connected league's teams, as standings rows.
 *
 * Sorted by record then points for, which is the ordering Sleeper itself uses
 * and therefore the one the user already knows from their league page.
 */
export function buildFantasyStandingsModel({
  rosters = [],
  leagueUsers = [],
  getUserDisplayName = null,
} = {}) {
  const rows = (rosters ?? [])
    .map((roster) => {
      const summary = getFantasyRosterSeasonSummary(roster);
      if (!summary) return null;
      const owner = leagueUsers?.find?.((user) => user.user_id === roster.owner_id);
      const teamName = owner?.metadata?.team_name || null;
      const managerName = typeof getUserDisplayName === 'function'
        ? getUserDisplayName(roster.owner_id)
        : null;

      return {
        ...summary,
        name: teamName || managerName || `Team ${summary.rosterId}`,
        managerName,
        pointDifferential: summary.pointsFor != null && summary.pointsAgainst != null
          ? round1(summary.pointsFor - summary.pointsAgainst)
          : null,
        winPct: summary.gamesPlayed
          ? (summary.wins + (summary.ties * 0.5)) / summary.gamesPlayed
          : 0,
      };
    })
    .filter(Boolean);

  if (!rows.length) return null;

  rows.sort((left, right) => {
    if (right.winPct !== left.winPct) return right.winPct - left.winPct;
    return (right.pointsFor ?? 0) - (left.pointsFor ?? 0);
  });

  return { rows, hasResults: rows.some((row) => row.gamesPlayed > 0) };
}

function formatRecord(row) {
  return row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
}

function formatPct(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(3).replace(/^0/, '');
}

function nflStandingsCard(slots, model, scope) {
  let rows = model.rows;
  if (!scope.isLeagueWide) {
    rows = rows.filter((row) => scope.teamIds.has(row.teamId));
  }
  if (!rows.length) return null;

  rows = [...rows].sort((left, right) => compareStandingRows(left, right, 'division'));

  return {
    kind: 'standings',
    title: `${scope.label ?? 'NFL'} standings`,
    subtitle: 'This season',
    columns: [
      { key: 'record', label: 'W-L' },
      { key: 'pct', label: 'PCT' },
      { key: 'pf', label: 'PF' },
      { key: 'pa', label: 'PA' },
      { key: 'diff', label: 'DIFF' },
    ],
    rows: rows.map((row, index) => ({
      rank: index + 1,
      key: row.teamId,
      teamId: row.teamId,
      label: row.name,
      // A division table is all one division, so repeating it on every row
      // says nothing; a wider table needs it to make sense.
      sublabel: scope.isLeagueWide || (scope.teamIds?.size ?? 0) > 4 ? row.division : null,
      values: [
        formatRecord(row),
        formatPct(row.winPct),
        String(row.pointsFor),
        String(row.pointsAgainst),
        row.pointDifferential > 0 ? `+${row.pointDifferential}` : String(row.pointDifferential),
      ],
    })),
    collapseAfter: 8,
    route: { activeTab: 'statistics', statisticsView: 'standings' },
    routeLabel: 'Open NFL standings',
  };
}

function fantasyStandingsCard(model) {
  return {
    kind: 'standings',
    title: 'League standings',
    subtitle: 'Your league, this season',
    columns: [
      { key: 'record', label: 'W-L' },
      { key: 'pf', label: 'PF' },
      { key: 'pa', label: 'PA' },
      { key: 'ppg', label: 'PPG' },
    ],
    rows: model.rows.map((row, index) => ({
      rank: index + 1,
      key: String(row.rosterId),
      rosterId: row.rosterId,
      label: row.name,
      sublabel: row.managerName && row.managerName !== row.name ? row.managerName : null,
      values: [
        row.recordLabel,
        row.pointsFor == null ? '—' : String(row.pointsFor),
        row.pointsAgainst == null ? '—' : String(row.pointsAgainst),
        row.pointsPerGame == null ? '—' : String(row.pointsPerGame),
      ],
    })),
    collapseAfter: 8,
    route: { activeTab: 'league', leagueView: 'standings' },
    routeLabel: 'Open league standings',
  };
}

/**
 * Build a standings answer, or null.
 *
 * Which competition is asked for is decided by evidence: a division or
 * conference is unambiguously the NFL, and a fantasy scope word ("fantasy
 * standings", "my league standings") or a matching fantasy team name is
 * unambiguously the connected league.
 *
 * A bare "standings" resolves to the NFL. It is the reading that always has an
 * answer — there may be no connected league — and the League standings
 * destination still appears in the result rows underneath, so the other reading
 * is one row away rather than unreachable.
 */
export function resolveStandingsAnswer(slots, data = {}, { hasFantasyTeamMatch = false } = {}) {
  if (!slots.intents?.includes('standings')) return null;

  const scope = resolveTeamScope(slots, data.nflTeams ?? []);
  const wantsNfl = !scope.isLeagueWide;
  const wantsFantasy = slots.scope === 'fantasy' || slots.scope === 'self' || hasFantasyTeamMatch;

  if (!wantsNfl && (wantsFantasy || !data.nflSchedule)) {
    const fantasy = buildFantasyStandingsModel(data.fantasyLeague ?? {});
    if (fantasy) return fantasyStandingsCard(fantasy);
    if (wantsFantasy) return null;
  }

  const model = buildNflStandingsModel(data);
  if (!model?.hasResults) return null;
  if (!scope.isLeagueWide && scope.teamIds.size === 0) return null;

  return nflStandingsCard(slots, model, scope);
}
