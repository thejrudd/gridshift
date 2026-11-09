// ── Result detail ──────────────────────────────────────────────────────────
// The content shown when a result expands in the palette.
//
// Everything here is derived from the indexed result and data the app already
// holds, such as cached player stats or the connected league's roster summaries.
// Nothing fetches: the palette stays instant, and missing data shows fewer
// fields rather than a spinner.

import {
  KIND_APP_VIEW,
  KIND_COMMAND,
  KIND_FANTASY_TEAM,
  KIND_GAME,
  KIND_NFL_TEAM,
  KIND_PLAYER,
} from './entities/record.js';
import { resolvePlayerStatAnswer } from './answers/playerStat.js';
import { getFantasyRosterSeasonSummary } from '../fantasySeasonSchedule.js';
import { findFantasyOwner } from '../fantasyOwnership.js';

const REGULAR_SEASON_WEEKS = 18;

// Team schedules are derived once per index and cached on it. Rebuilding this
// for every keystroke would be wasteful; the index is already immutable.
const scheduleCache = new WeakMap();

function teamSchedules(index) {
  if (!index) return new Map();
  const cached = scheduleCache.get(index);
  if (cached) return cached;

  const byTeam = new Map();
  for (const record of index.records ?? []) {
    if (record.kind !== KIND_GAME || record.meta?.isWeekIndex) continue;
    const { awayTeam, homeTeam } = record.meta ?? {};
    for (const team of [awayTeam, homeTeam]) {
      if (!team) continue;
      const bucket = byTeam.get(team);
      if (bucket) bucket.push(record);
      else byTeam.set(team, [record]);
    }
  }
  for (const games of byTeam.values()) {
    games.sort((left, right) => (left.meta.week ?? 0) - (right.meta.week ?? 0));
  }

  scheduleCache.set(index, byTeam);
  return byTeam;
}

function formatKickoff(kickoff) {
  if (!kickoff) return null;
  const date = new Date(kickoff);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The team's next scheduled game, or null once the season is played out.
 */
function nextGameFor(index, team, now = Date.now()) {
  const games = teamSchedules(index).get(team);
  if (!games?.length) return null;

  const upcoming = games.find((game) => {
    const kickoff = game.meta?.kickoff ? Date.parse(game.meta.kickoff) : null;
    return kickoff == null || kickoff >= now;
  });
  return upcoming ?? null;
}

/**
 * The week a team has no game scheduled.
 */
function byeWeekFor(index, team) {
  const games = teamSchedules(index).get(team);
  if (!games?.length) return null;
  const played = new Set(games.map((game) => game.meta.week));
  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
    if (!played.has(week)) return week;
  }
  return null;
}

function teamGamesInWeek(index, week) {
  if (!index || week == null) return 0;
  let count = 0;
  for (const record of index.records ?? []) {
    if (record.kind !== KIND_GAME || record.meta?.isWeekIndex) continue;
    if (record.meta?.week === week) count += 1;
  }
  return count;
}

function opponentLabel(game, team) {
  const { awayTeam, homeTeam } = game.meta ?? {};
  const isHome = homeTeam === team;
  const opponent = isHome ? awayTeam : homeTeam;
  return `${isHome ? 'vs' : 'at'} ${opponent}`;
}

function gameFacts(index, team) {
  const facts = [];
  const next = nextGameFor(index, team);
  if (next) {
    facts.push({
      label: `Next · Week ${next.meta.week}`,
      value: opponentLabel(next, team),
      detail: formatKickoff(next.meta.kickoff),
    });
  }
  const bye = byeWeekFor(index, team);
  if (bye) facts.push({ label: 'Bye', value: `Week ${bye}` });
  return facts;
}

/**
 * Where a player sits in the connected league.
 *
 * Returns null with no league rather than a "free agent" line: with no rosters
 * to check, every player looks unowned, and stating that would be a claim the
 * data does not support.
 */
function fantasyOwnerOf(record, answerData) {
  const ownership = answerData?.fantasyOwnership;
  if (!ownership?.size) return null;
  const sleeperId = record.meta?.sleeperId;
  if (!sleeperId) return null;
  return { owner: findFantasyOwner(ownership, sleeperId) ?? null, sleeperId };
}

function fantasyDetail(ownership) {
  if (!ownership) return null;
  const { owner } = ownership;
  if (!owner) return { label: 'Free agent', isMine: false };
  return { label: owner.isMine ? 'On your roster' : owner.label, isMine: owner.isMine };
}

const rosterRoute = (rosterId) => ({
  activeTab: 'fantasy',
  companionView: 'rosters',
  leagueSubview: 'roster',
  leagueRosterId: String(rosterId),
});

const matchupRoute = (rosterId) => ({
  activeTab: 'fantasy',
  companionView: 'matchups',
  matchupRosterId: String(rosterId),
});

/**
 * What can be done with a rostered player besides opening their stats page,
 * which stays the row's own job: trade for them (or away), and the roster and
 * matchup that ownership leads to. Trade is offered only where the Trade tab
 * itself is available, by the same rule the Statistics page uses.
 */
function playerActions(ownership, answerData) {
  const owner = ownership?.owner;
  if (!owner) return [];
  const actions = [];
  if (answerData?.tradeAvailable) {
    actions.push({
      key: 'trade',
      label: owner.isMine ? 'Trade away' : 'Trade for',
      route: owner.isMine
        ? { activeTab: 'trade', tradeView: 'agent', tradePlayerId: ownership.sleeperId, tradeSide: 'give' }
        : {
          activeTab: 'trade',
          tradeView: 'agent',
          tradePlayerId: ownership.sleeperId,
          tradeSide: 'get',
          tradePartnerRosterId: String(owner.rosterId),
        },
    });
  }
  actions.push(
    { key: 'roster', label: owner.isMine ? 'My roster' : 'Roster', route: rosterRoute(owner.rosterId) },
    { key: 'matchup', label: 'Matchup', route: matchupRoute(owner.rosterId) },
  );
  return actions;
}

function playerDetail(record, index, answerData) {
  const { team, position, jersey, injuryStatus } = record.meta ?? {};
  const facts = [];

  if (position) facts.push({ label: 'Position', value: position });
  if (jersey) facts.push({ label: 'Number', value: `#${jersey}` });
  if (injuryStatus) facts.push({ label: 'Status', value: injuryStatus });
  if (team) facts.push(...gameFacts(index, team));

  // A stat line only when the app already has the stats. This reuses the same
  // resolver the answer card uses, so a player's numbers read identically
  // whether they appear here or in an answer.
  let stats = null;
  if (answerData?.weeklyStats) {
    const answer = resolvePlayerStatAnswer(
      { intents: ['stats'], stats: [], timeframe: null, week: null },
      record,
      answerData,
    );
    if (answer?.values?.length) {
      stats = { label: answer.subtitle, values: answer.values };
    }
  }

  const ownership = fantasyOwnerOf(record, answerData);
  return {
    facts,
    stats,
    fantasy: fantasyDetail(ownership),
    actions: playerActions(ownership, answerData),
  };
}

function nflTeamDetail(record, index) {
  const { teamId, division, conference } = record.meta ?? {};
  const facts = [];
  if (division) facts.push({ label: 'Division', value: division });
  else if (conference) facts.push({ label: 'Conference', value: conference });
  if (teamId) facts.push(...gameFacts(index, teamId));
  // The row opens the team page; these are the two other places a team leads.
  const actions = teamId
    ? [
      {
        key: 'schedule',
        label: 'Schedule',
        route: {
          activeTab: 'statistics',
          statisticsView: 'schedule',
          statisticsScheduleMode: 'team',
          statisticsScheduleTeamId: teamId,
        },
      },
      { key: 'standings', label: 'Standings', route: { activeTab: 'statistics', statisticsView: 'standings' } },
    ]
    : [];
  return { facts, stats: null, fantasy: null, actions };
}

function gameDetail(record, index) {
  const { week, awayTeam, homeTeam, kickoff, network, isWeekIndex } = record.meta ?? {};
  const facts = [];

  if (isWeekIndex) {
    // The label already says which week it is; the useful extra fact is how
    // much football is in it.
    const games = teamGamesInWeek(index, week);
    if (games) facts.push({ label: 'Games', value: String(games) });
    return { facts, stats: null, fantasy: null, actions: [] };
  }

  if (awayTeam && homeTeam) facts.push({ label: 'Matchup', value: `${awayTeam} at ${homeTeam}` });
  const when = formatKickoff(kickoff);
  if (when) facts.push({ label: 'Kickoff', value: when });
  if (network) facts.push({ label: 'Watch', value: network });
  return { facts, stats: null, fantasy: null, actions: [] };
}

function fantasyTeamDetail(record, answerData) {
  const { managerName, teamName } = record.meta ?? {};
  const facts = [];
  if (teamName && managerName) facts.push({ label: 'Manager', value: managerName });

  const rosterId = String(record.meta?.rosterId ?? record.id);
  const roster = (answerData?.fantasyLeague?.rosters ?? []).find(
    (candidate) => String(candidate?.roster_id ?? '') === rosterId,
  );
  const summary = getFantasyRosterSeasonSummary(roster);
  const values = [];

  if (summary) {
    values.push({ key: 'record', display: summary.recordLabel, label: 'Record' });
    if (summary.pointsFor != null) {
      values.push({ key: 'points-for', display: String(summary.pointsFor), label: 'PF' });
    }
    if (summary.pointsAgainst != null) {
      values.push({ key: 'points-against', display: String(summary.pointsAgainst), label: 'PA' });
    }
    if (summary.pointsPerGame != null) {
      values.push({ key: 'points-per-game', display: String(summary.pointsPerGame), label: 'PPG' });
    }
  }

  return {
    facts,
    stats: values.length ? { label: 'This season', values } : null,
    fantasy: null,
    // The row opens the roster; the matchup is the other place a team leads.
    actions: [{ key: 'matchup', label: 'Matchup', route: matchupRoute(rosterId) }],
  };
}

// The DOM id of an action button on the active result, which the search field
// names as its active descendant while the keyboard is on that action.
export function actionOptionId(position) {
  return `global-search-action-${position}`;
}

/**
 * Build the detail model for a result.
 *
 * Returns `{ facts, stats, fantasy, actions }`, each possibly empty or null —
 * callers render whatever is present rather than reserving space for what is
 * missing. `actions` are the result's secondary destinations; the row's own
 * Enter or tap still opens its primary one.
 */
export function buildResultDetail(record, { index = null, answerData = null } = {}) {
  if (!record) return { facts: [], stats: null, fantasy: null, actions: [] };

  switch (record.kind) {
    case KIND_PLAYER: return playerDetail(record, index, answerData);
    case KIND_NFL_TEAM: return nflTeamDetail(record, index);
    case KIND_GAME: return gameDetail(record, index);
    case KIND_FANTASY_TEAM: return fantasyTeamDetail(record, answerData);
    // A destination or a command is fully described by its own row. Expanding
    // one would only echo the label back, so they do not expand at all.
    case KIND_APP_VIEW:
    case KIND_COMMAND:
    default: return { facts: [], stats: null, fantasy: null, actions: [] };
  }
}
