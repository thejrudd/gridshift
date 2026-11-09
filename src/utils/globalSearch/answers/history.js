// ── League history answers ─────────────────────────────────────────────────
// "champions", "2023 champion", "head to head dana", "me vs dana",
// "trades with dana", "jsn trades", "my trades", "transactions".
//
// Read-only over League History's own model (buildLeagueHistoryModel and
// buildActivitySeasonGroups), built from season snapshots League History has
// already stored on this device. Never fetches: with nothing stored the
// resolvers return null and the League history, activity and Trade history
// destinations answer instead.

import {
  buildActivitySeasonGroups,
  buildLeagueHistoryModel,
  peekLeagueHistorySnapshot,
} from '../../leagueHistory.js';
import { KIND_FANTASY_TEAM, KIND_PLAYER } from '../entities/record.js';

const LIST_LIMIT = 8;

const HISTORY_ROUTE = { activeTab: 'league', leagueView: 'history' };
const ACTIVITY_ROUTE = { activeTab: 'league', leagueView: 'activity' };
const TRADE_HISTORY_ROUTE = { activeTab: 'trade', tradeView: 'history' };

// Built once per set of linked seasons — the palette re-resolves on every
// keystroke, and parsing a season of snapshots each time would show as lag.
const historyCache = new WeakMap();

/**
 * League History's model and activity for the connected league, from stored
 * snapshots only. Null when no season has been stored yet.
 */
export function readStoredHistory({ entries = [], players = {} } = {}) {
  if (!entries?.length) return null;
  const cached = historyCache.get(entries);
  if (cached && cached.players === players) return cached.value;

  const snapshots = entries
    .map((entry) => peekLeagueHistorySnapshot({ league: entry.league, season: entry.season }))
    .filter(Boolean);
  const value = snapshots.length
    ? {
      model: buildLeagueHistoryModel(snapshots, players ?? {}),
      activity: buildActivitySeasonGroups(snapshots, players ?? {}),
    }
    : null;
  historyCache.set(entries, { players, value });
  return value;
}

function topRecordOf(groups, kind, side = null) {
  for (const group of groups) {
    if (group.kind !== kind) continue;
    const entry = group.results.find((candidate) => side == null || candidate.compareSide === side);
    if (entry) return entry.record;
  }
  return null;
}

function formatScore(value) {
  return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : '—';
}

function participantName(participant) {
  return participant?.teamName || participant?.managerName || 'Unknown team';
}

// ── Champions ───────────────────────────────────────────────────────────────

function championsAnswer(slots, model) {
  let champions = model.champions ?? [];
  if (slots.season != null) champions = champions.filter((entry) => Number(entry.season) === slots.season);
  if (!champions.length) return null;

  return {
    kind: 'historyRows',
    title: slots.season != null ? `${slots.season} champion` : 'League champions',
    subtitle: slots.season != null ? null : `${champions.length} ${champions.length === 1 ? 'season' : 'seasons'}`,
    rows: champions.map((entry) => ({
      key: entry.season,
      rank: entry.season,
      label: participantName(entry.participant),
      sublabel: [
        entry.participant?.teamName ? entry.participant.managerName : null,
        entry.runnerUp ? `beat ${participantName(entry.runnerUp)}` : null,
      ].filter(Boolean).join(' · '),
      route: HISTORY_ROUTE,
    })),
    collapseAfter: 5,
    route: HISTORY_ROUTE,
    routeLabel: 'Open league history',
  };
}

// ── Head to head ────────────────────────────────────────────────────────────

function myParticipantId(data) {
  const league = data.fantasyLeague;
  const mine = (league?.rosters ?? []).find((roster) => String(roster?.roster_id) === String(league?.myRosterId));
  return mine?.owner_id ? String(mine.owner_id) : null;
}

function headToHeadAnswer(model, myId, opponentId) {
  if (!myId || !opponentId || myId === opponentId) return null;
  const rivalry = (model.rivalries ?? []).find((entry) => (
    entry.participants?.some((participant) => participant?.id === myId)
    && entry.participants?.some((participant) => participant?.id === opponentId)
  ));
  const opponent = rivalry?.participants?.find((participant) => participant?.id === opponentId);
  if (!rivalry?.games || !opponent) return null;

  const wins = rivalry.winsByParticipantId?.[myId] ?? 0;
  const losses = rivalry.winsByParticipantId?.[opponentId] ?? 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const game of rivalry.meetings) {
    const mine = game.left.identity.id === myId ? game.left : game.right;
    const theirs = mine === game.left ? game.right : game.left;
    pointsFor += mine.points;
    pointsAgainst += theirs.points;
  }
  const last = [...rivalry.meetings].sort((left, right) => (
    Number(right.season) - Number(left.season) || Number(right.week) - Number(left.week)
  ))[0];
  const lastMine = last.left.identity.id === myId ? last.left : last.right;
  const lastTheirs = lastMine === last.left ? last.right : last.left;
  const lastResult = last.tied ? 'T' : last.winnerId === myId ? 'W' : 'L';

  return {
    kind: 'headToHead',
    title: `You vs ${participantName(opponent)}`,
    subtitle: [opponent.teamName ? opponent.managerName : null, 'All time'].filter(Boolean).join(' · '),
    values: [
      {
        key: 'record',
        label: 'Record',
        display: rivalry.ties ? `${wins}-${losses}-${rivalry.ties}` : `${wins}-${losses}`,
      },
      { key: 'pf', label: 'Points for', display: formatScore(pointsFor) },
      { key: 'pa', label: 'Points against', display: formatScore(pointsAgainst) },
      {
        key: 'last',
        label: `Last · ${last.season} week ${last.week}`,
        display: `${lastResult} ${formatScore(lastMine.points)}–${formatScore(lastTheirs.points)}`,
      },
    ],
    route: HISTORY_ROUTE,
    routeLabel: 'Open league history',
  };
}

// ── Trades and transactions ─────────────────────────────────────────────────

function namesOf(players) {
  return players.map((player) => player.playerName).join(', ');
}

/**
 * One line per transaction: who was involved on the first line, what moved on
 * the second. A trade lists what each side received.
 */
function transactionRow(entry) {
  const when = entry.week ? `Wk ${entry.week}` : entry.season;
  if (entry.type === 'trade') {
    const received = entry.teams.map((team) => {
      const players = entry.adds.filter((player) => player.rosterId === team.rosterId);
      const picks = entry.draftPicks.filter((pick) => pick.team?.rosterId === team.rosterId);
      const parts = [
        players.length ? namesOf(players) : null,
        picks.length ? `${picks.length} ${picks.length === 1 ? 'pick' : 'picks'}` : null,
      ].filter(Boolean);
      return parts.length ? `${participantName(team)} gets ${parts.join(', ')}` : null;
    }).filter(Boolean);
    return {
      key: entry.id,
      rank: when,
      label: entry.teams.map(participantName).join(' · '),
      sublabel: received.join('; '),
      season: entry.season,
    };
  }

  const team = entry.teams[0];
  const moved = [
    entry.adds.length ? `adds ${namesOf(entry.adds)}` : null,
    entry.drops.length ? `drops ${namesOf(entry.drops)}` : null,
  ].filter(Boolean).join(', ');
  return {
    key: entry.id,
    rank: when,
    label: participantName(team),
    sublabel: [entry.type === 'waiver' ? 'Waiver claim' : null, moved].filter(Boolean).join(' · '),
    season: entry.season,
  };
}

function allTransactions(activity) {
  return (activity ?? []).flatMap((group) => group.entries);
}

function tradesAnswer({ activity, title, filter }) {
  const trades = allTransactions(activity).filter((entry) => entry.type === 'trade' && filter(entry));
  if (!trades.length) return null;
  return {
    kind: 'historyRows',
    title,
    subtitle: `${trades.length} ${trades.length === 1 ? 'trade' : 'trades'}`,
    rows: trades.map((entry) => ({ ...transactionRow(entry), route: TRADE_HISTORY_ROUTE })),
    collapseAfter: 5,
    route: TRADE_HISTORY_ROUTE,
    routeLabel: 'Open trade history',
  };
}

function transactionsAnswer(activity) {
  // The latest season with any activity — "recent" means this season's moves,
  // not a mix reaching back years.
  const season = (activity ?? []).find((group) => group.entries.length);
  if (!season) return null;
  const rows = season.entries.slice(0, LIST_LIMIT).map((entry) => ({ ...transactionRow(entry), route: ACTIVITY_ROUTE }));
  return {
    kind: 'historyRows',
    title: 'Recent transactions',
    subtitle: `${season.season} season`,
    rows,
    route: ACTIVITY_ROUTE,
    routeLabel: 'Open league activity',
  };
}

const involves = (participantId) => (entry) => entry.teams.some((team) => team?.id === participantId);

/**
 * A league history card for the query, or null.
 */
export function resolveHistoryAnswer(slots, groups = [], data = {}) {
  const intents = slots.intents ?? [];
  const wantsChampions = intents.includes('champions');
  const wantsHeadToHead = intents.includes('headToHead');
  const wantsTrades = intents.includes('trades');
  const wantsTransactions = intents.includes('transactions');
  // "me vs dana" is a head-to-head question in compare form.
  const compareSelf = slots.compare
    && (slots.compare.left.scope === 'self' || slots.compare.right.scope === 'self');
  if (!wantsChampions && !wantsHeadToHead && !wantsTrades && !wantsTransactions && !compareSelf) return null;

  const history = readStoredHistory(data.leagueHistory ?? {});
  if (!history) return null;
  const { model, activity } = history;
  const myId = myParticipantId(data);

  if (wantsHeadToHead || compareSelf) {
    const side = compareSelf ? (slots.compare.left.scope === 'self' ? 'right' : 'left') : null;
    const opponent = topRecordOf(groups, KIND_FANTASY_TEAM, side);
    return opponent ? headToHeadAnswer(model, myId, String(opponent.meta?.ownerId ?? '')) : null;
  }

  if (wantsChampions) return championsAnswer(slots, model);

  if (wantsTrades) {
    const player = topRecordOf(groups, KIND_PLAYER);
    const team = topRecordOf(groups, KIND_FANTASY_TEAM);
    const topKind = groups[0]?.kind;
    if (player && topKind === KIND_PLAYER && player.meta?.sleeperId) {
      const playerId = String(player.meta.sleeperId);
      return tradesAnswer({
        activity,
        title: `${player.label} trades`,
        filter: (entry) => entry.adds.some((moved) => moved.playerId === playerId),
      });
    }
    if (team && topKind === KIND_FANTASY_TEAM && team.meta?.ownerId) {
      const theirId = String(team.meta.ownerId);
      // Your trades with them first; if you have never traded, all of theirs.
      return (myId && myId !== theirId
        ? tradesAnswer({
          activity,
          title: `Your trades with ${team.label}`,
          filter: (entry) => involves(theirId)(entry) && involves(myId)(entry),
        })
        : null)
        ?? tradesAnswer({ activity, title: `${team.label} trades`, filter: involves(theirId) });
    }
    if (slots.scope === 'self' && myId) {
      return tradesAnswer({ activity, title: 'Your trades', filter: involves(myId) });
    }
    if (!slots.nameTerms.length) return tradesAnswer({ activity, title: 'League trades', filter: () => true });
    return null;
  }

  return transactionsAnswer(activity);
}
