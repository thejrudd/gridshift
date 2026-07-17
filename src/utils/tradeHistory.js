import {
  getLeagueRosters,
  getLeagueUsers,
  getTransactions,
} from '../api/sleeperApi.js';
import { cachedFetch } from './playerCache.js';
import { getNflRegularSeasonStartTimestamp } from './nflSeason.js';

export const TRADE_HISTORY_ROUNDS = Array.from({ length: 19 }, (_, round) => round);
export const CURRENT_TRADE_HISTORY_TTL = 5 * 60 * 1000;
export { getNflRegularSeasonStartTimestamp } from './nflSeason.js';

function rosterKey(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function getPlayerName(player, playerId) {
  const fullName = String(player?.full_name ?? '').trim();
  if (fullName) return fullName;
  const joinedName = [player?.first_name, player?.last_name].filter(Boolean).join(' ').trim();
  return joinedName || `Player ${playerId}`;
}

function getTeamName(roster, user, rosterId) {
  return String(
    user?.metadata?.team_name
    ?? roster?.metadata?.team_name
    ?? roster?.metadata?.name
    ?? `Team ${rosterId}`,
  ).trim();
}

function getManagerName(user, rosterId) {
  return String(
    user?.display_name
    ?? user?.username
    ?? `Manager ${rosterId}`,
  ).trim();
}

export function buildTradeRosterIdentities(rosters = [], users = [], season = '') {
  const usersById = new Map(users.map((user) => [String(user?.user_id ?? ''), user]));
  return new Map(rosters.map((roster) => {
    const rosterId = rosterKey(roster?.roster_id);
    const user = usersById.get(String(roster?.owner_id ?? '')) ?? null;
    const userId = String(user?.user_id ?? roster?.owner_id ?? '').trim();
    return [rosterId, {
      id: userId || `${season}:${rosterId}`,
      rosterId,
      name: getManagerName(user, rosterId),
      teamName: getTeamName(roster, user, rosterId),
      avatarHash: user?.avatar ?? null,
    }];
  }).filter(([key]) => key));
}

function fallbackIdentity(rosterId, season) {
  return {
    id: `${season}:${rosterId}`,
    rosterId,
    name: `Manager ${rosterId}`,
    teamName: `Team ${rosterId}`,
    avatarHash: null,
  };
}

function inferOtherRoster(rosterIds, rosterId) {
  if (rosterIds.length !== 2 || !rosterId) return null;
  return rosterIds.find((candidate) => candidate !== rosterId) ?? null;
}

function addRosterId(target, value) {
  const normalized = rosterKey(value);
  if (normalized && !target.includes(normalized)) target.push(normalized);
  return normalized;
}

function collectRosterIds(transaction) {
  const rosterIds = [];
  (transaction?.roster_ids ?? []).forEach((value) => addRosterId(rosterIds, value));
  Object.values(transaction?.adds ?? {}).forEach((value) => addRosterId(rosterIds, value));
  Object.values(transaction?.drops ?? {}).forEach((value) => addRosterId(rosterIds, value));
  (transaction?.draft_picks ?? []).forEach((pick) => {
    addRosterId(rosterIds, pick?.previous_owner_id ?? pick?.roster_id);
    addRosterId(rosterIds, pick?.owner_id);
  });
  (transaction?.waiver_budget ?? []).forEach((transfer) => {
    addRosterId(rosterIds, transfer?.sender);
    addRosterId(rosterIds, transfer?.receiver);
  });
  return rosterIds;
}

function makePlayerAsset(playerId, players, fromRosterId, toRosterId) {
  const player = players?.[playerId] ?? null;
  return {
    type: 'player',
    id: String(playerId),
    label: getPlayerName(player, playerId),
    team: player?.team ?? null,
    position: player?.position ?? player?.fantasy_positions?.[0] ?? null,
    fromRosterId,
    toRosterId,
  };
}

function makePickAsset(pick, fromRosterId, toRosterId) {
  return {
    type: 'pick',
    year: String(pick?.season ?? ''),
    round: Number(pick?.round),
    originalRosterId: rosterKey(pick?.roster_id),
    fromRosterId,
    toRosterId,
  };
}

function makeFaabAsset(transfer, fromRosterId, toRosterId) {
  return {
    type: 'faab',
    amount: Number(transfer?.amount) || 0,
    fromRosterId,
    toRosterId,
  };
}

export function normalizeSleeperTradeTransaction({
  transaction,
  season,
  rosters = [],
  users = [],
  players = {},
} = {}) {
  if (transaction?.type !== 'trade' || transaction?.status !== 'complete') return null;

  const normalizedSeason = String(season ?? '').trim();
  const rosterIds = collectRosterIds(transaction);
  const identities = buildTradeRosterIdentities(rosters, users, normalizedSeason);
  const sidesByRosterId = new Map();
  const ensureSide = (value) => {
    const rosterId = addRosterId(rosterIds, value);
    if (!rosterId) return null;
    if (!sidesByRosterId.has(rosterId)) {
      sidesByRosterId.set(rosterId, {
        rosterId,
        manager: identities.get(rosterId) ?? fallbackIdentity(rosterId, normalizedSeason),
        assets: [],
      });
    }
    return sidesByRosterId.get(rosterId);
  };

  rosterIds.forEach(ensureSide);

  const adds = transaction?.adds ?? {};
  const drops = transaction?.drops ?? {};
  const playerIds = [...new Set([...Object.keys(adds), ...Object.keys(drops)])];
  playerIds.forEach((playerId) => {
    const receiver = rosterKey(adds[playerId]);
    const explicitSender = rosterKey(drops[playerId]);
    const sender = explicitSender ?? inferOtherRoster(rosterIds, receiver);
    const resolvedReceiver = receiver ?? inferOtherRoster(rosterIds, sender);
    ensureSide(sender)?.assets.push(makePlayerAsset(playerId, players, sender, resolvedReceiver));
  });

  (transaction?.draft_picks ?? []).forEach((pick) => {
    const sender = rosterKey(pick?.previous_owner_id ?? pick?.roster_id);
    const receiver = rosterKey(pick?.owner_id) ?? inferOtherRoster(rosterIds, sender);
    ensureSide(sender)?.assets.push(makePickAsset(pick, sender, receiver));
  });

  (transaction?.waiver_budget ?? []).forEach((transfer) => {
    const sender = rosterKey(transfer?.sender);
    const receiver = rosterKey(transfer?.receiver) ?? inferOtherRoster(rosterIds, sender);
    const asset = makeFaabAsset(transfer, sender, receiver);
    if (asset.amount > 0) ensureSide(sender)?.assets.push(asset);
  });

  const sides = rosterIds.map(ensureSide).filter(Boolean);
  if (sides.length < 2 || sides.every((side) => side.assets.length === 0)) return null;

  const timestamp = Number(transaction?.status_updated ?? transaction?.created) || 0;
  const week = Number(transaction?.leg);
  return {
    id: String(transaction?.transaction_id ?? `${normalizedSeason}:${timestamp}`),
    season: normalizedSeason,
    timestamp,
    week: Number.isFinite(week) && week > 0 ? week : null,
    isRegularSeason: timestamp >= getNflRegularSeasonStartTimestamp(normalizedSeason),
    sides,
  };
}

export function normalizeTradeHistorySeason(snapshot, players = {}) {
  const season = String(snapshot?.season ?? '').trim();
  return (snapshot?.transactions ?? [])
    .map((transaction) => normalizeSleeperTradeTransaction({
      transaction,
      season,
      rosters: snapshot?.rosters ?? [],
      users: snapshot?.users ?? [],
      players,
    }))
    .filter(Boolean)
    .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id));
}

export function formatTradeHistoryPick(asset) {
  const round = Number(asset?.round);
  const mod100 = round % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[round % 10] ?? 'th');
  const roundLabel = Number.isFinite(round) && round > 0 ? `${round}${suffix}` : 'Pick';
  return [asset?.year, roundLabel].filter(Boolean).join(' ');
}

export function getTradeHistoryAssetLabel(asset) {
  if (asset?.type === 'player') return asset.label;
  if (asset?.type === 'pick') return formatTradeHistoryPick(asset);
  if (asset?.type === 'faab') return `$${asset.amount} FAAB`;
  return 'Asset';
}

export function getTradeHistoryFaabTotal(trade) {
  return (trade?.sides ?? [])
    .flatMap((side) => side.assets ?? [])
    .filter((asset) => asset.type === 'faab')
    .reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0);
}

export function tradeHistoryMatches(trade, query = '', managerId = 'all') {
  if (managerId !== 'all' && !(trade?.sides ?? []).some((side) => side.manager.id === managerId)) return false;
  const normalizedQuery = String(query).trim().toLowerCase();
  if (!normalizedQuery) return true;
  const searchText = (trade?.sides ?? []).flatMap((side) => [
    side.manager.name,
    side.manager.teamName,
    ...(side.assets ?? []).flatMap((asset) => [
      getTradeHistoryAssetLabel(asset),
      asset.team,
      asset.position,
      asset.type === 'pick' ? 'draft pick' : null,
      asset.type === 'faab' ? 'waiver budget' : null,
    ]),
  ]).filter(Boolean).join(' ').toLowerCase();
  return searchText.includes(normalizedQuery);
}

export async function fetchLeagueTradeHistorySnapshot({ leagueId, season }) {
  const transactionRounds = await Promise.all(
    TRADE_HISTORY_ROUNDS.map((round) => getTransactions(leagueId, round)),
  );
  const [rosters, users] = await Promise.all([
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  const transactionsById = new Map();
  transactionRounds.flat().forEach((transaction) => {
    const id = String(transaction?.transaction_id ?? '');
    if (id) transactionsById.set(id, transaction);
  });
  return {
    leagueId: String(leagueId),
    season: String(season),
    rosters: Array.isArray(rosters) ? rosters : [],
    users: Array.isArray(users) ? users : [],
    transactions: [...transactionsById.values()],
  };
}

export function getLeagueTradeHistorySnapshot({ leagueId, season, completed = false }) {
  const ttl = completed ? Infinity : CURRENT_TRADE_HISTORY_TTL;
  return cachedFetch(
    `trade-history:${leagueId}:${season}`,
    () => fetchLeagueTradeHistorySnapshot({ leagueId, season }),
    ttl,
  );
}
