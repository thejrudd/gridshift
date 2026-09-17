import {
  getProviderIdentityKey,
  getProviderPlayerIdentity,
  normalizeProviderPlayerName,
  normalizeProviderPosition,
  normalizeProviderTeam,
} from './providerPlayerIdentity.js';
import {
  canonicalizeAvailabilityStatus,
  getPlayerAvailabilityContext,
} from './playerAvailabilityStatus.js';

const DURABLE_SLEEPER_STATUSES = new Set([
  'Injured Reserve', 'PUP', 'NFI', 'Suspended', 'Exempt', 'COVID-19', 'Reserve', 'Retired',
]);

function first(...values) {
  return values.find((value) => value != null && value !== '') ?? null;
}

function list(value) {
  return Array.isArray(value) ? value : value ? Object.values(value) : [];
}

function playerName(player) {
  return player?.full_name
    || player?.fullName
    || [player?.first_name ?? player?.firstName, player?.last_name ?? player?.lastName].filter(Boolean).join(' ')
    || '';
}

function designationName(row) {
  return playerName(row?.player ?? row) || row?.name || '';
}

function designationTeam(row) {
  return row?.team?.abbreviation
    ?? row?.team?.short_name
    ?? row?.team?.name
    ?? row?.team
    ?? row?.player?.team;
}

function designationPosition(row) {
  return row?.player?.position_abbreviation
    ?? row?.player?.position
    ?? row?.position_abbreviation
    ?? row?.position;
}

function nullableBoolean(value) {
  if (value == null || value === '') return null;
  if (value === true || value === 1 || String(value).toLowerCase() === 'true') return true;
  if (value === false || value === 0 || String(value).toLowerCase() === 'false') return false;
  return null;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function getRosterPlayerId(item) {
  return String(
    typeof item === 'string' || typeof item === 'number'
      ? item
      : item?.player_id ?? item?.playerId ?? item?.id ?? '',
  );
}

function rosterEntries({ players = {}, rosterPlayers, reservePlayers, taxiPlayers, rosters } = {}) {
  const byId = new Map(
    Object.entries(players ?? {}).map(([id, player]) => [
      String(id),
      { ...player, player_id: player?.player_id ?? id },
    ]),
  );
  const entries = new Map();
  const bucketPriority = { roster: 1, taxi: 2, reserve: 3 };

  const add = (items, bucket, roster = null) => {
    list(items).forEach((item) => {
      const playerId = getRosterPlayerId(item);
      const player = byId.get(playerId) ?? item?.player ?? item;
      if (!player || !playerId) return;

      const rosterId = item?.roster_id ?? item?.rosterId ?? roster?.roster_id ?? roster?.rosterId ?? player?.roster_id ?? null;
      const ownerId = item?.owner_id ?? item?.ownerId ?? roster?.owner_id ?? roster?.ownerId ?? player?.owner_id ?? null;
      const key = `${String(rosterId ?? '')}|${playerId}`;
      const existing = entries.get(key);
      if (existing && bucketPriority[existing.bucket] >= bucketPriority[bucket]) return;
      entries.set(key, {
        ...player,
        player_id: playerId,
        roster_id: rosterId,
        owner_id: ownerId,
        bucket,
      });
    });
  };

  if (rosterPlayers || reservePlayers || taxiPlayers) {
    add(rosterPlayers, 'roster');
    add(taxiPlayers, 'taxi');
    add(reservePlayers, 'reserve');
  } else {
    list(rosters).forEach((roster) => {
      add(roster?.players ?? roster?.starters ?? [], 'roster', roster);
      add(roster?.taxi ?? [], 'taxi', roster);
      add(roster?.reserve ?? roster?.ir ?? [], 'reserve', roster);
    });
  }

  return [...entries.values()];
}

function normalizePracticeStatus(value) {
  const status = cleanText(value);
  if (!status) return null;
  const lower = status.toLowerCase().replace(/[_-]+/g, ' ');
  if (lower === 'dnp' || lower.includes('did not participate') || lower.includes('didn’t participate')) return 'Did not practice';
  if (lower === 'lp' || lower.includes('limited')) return 'Limited practice';
  if (lower === 'fp' || lower.includes('full participation') || lower.includes('full practice')) return 'Full practice';
  return status;
}

function normalizePracticeReports(row) {
  const reports = list(row?.practice_reports ?? row?.practiceReports).map((report, index) => ({
    date: cleanText(report?.date ?? report?.practice_date ?? report?.practiceDate),
    status: normalizePracticeStatus(first(
      report?.status,
      report?.participation,
      report?.practice_status,
      report?.practiceStatus,
      report?.report,
    )),
    index,
  })).filter((report) => report.status);

  const singular = normalizePracticeStatus(first(
    row?.practice_status,
    row?.practiceStatus,
    row?.practice_report,
    row?.practiceReport,
  ));
  if (singular && reports.length === 0) reports.push({ date: null, status: singular, index: 0 });

  return reports.sort((left, right) => {
    if (!left.date && !right.date) return left.index - right.index;
    if (!left.date) return -1;
    if (!right.date) return 1;
    return left.date.localeCompare(right.date) || left.index - right.index;
  }).map(({ date, status }) => ({ date, status }));
}

function getInjuryReason(row) {
  const injury = row?.injury;
  if (typeof injury === 'string') return cleanText(injury);
  return cleanText(first(
    injury?.description,
    injury?.body_part,
    injury?.bodyPart,
    row?.injury_reason,
    row?.injuryReason,
    row?.injury_body_part,
    row?.injuryBodyPart,
  ));
}

function designationFacts(row) {
  const practiceReports = normalizePracticeReports(row);
  return {
    id: row?.id ?? null,
    injury: getInjuryReason(row),
    gameStatus: cleanText(row?.game_status ?? row?.gameStatus),
    practiceReports,
    latestPractice: practiceReports.at(-1) ?? null,
    active: nullableBoolean(row?.active),
    starter: nullableBoolean(row?.starter),
    didNotPlay: nullableBoolean(row?.did_not_play ?? row?.didNotPlay),
    updatedAt: cleanText(row?.updated_at ?? row?.updatedAt),
    season: row?.season ?? null,
    week: row?.week ?? null,
    seasonType: cleanText(row?.season_type ?? row?.seasonType),
    gameId: row?.game_id ?? row?.gameId ?? null,
  };
}

function isActionableDesignation(facts) {
  return Boolean(
    facts.injury
    || facts.gameStatus
    || facts.practiceReports.length > 0
    || facts.active === false
    || facts.didNotPlay === true,
  );
}

function canonicalGameStatus(value) {
  return canonicalizeAvailabilityStatus(value) ?? cleanText(value);
}

function getUrgencyRank({ sleeperStatus, facts }) {
  const gameStatus = canonicalGameStatus(facts?.gameStatus);
  const latestPractice = facts?.latestPractice?.status;
  if (
    facts?.active === false
    || facts?.didNotPlay === true
    || ['Inactive', 'Out', 'DNP'].includes(gameStatus)
    || ['Inactive', 'Out', 'DNP'].includes(sleeperStatus)
  ) return 1;
  if (gameStatus === 'Doubtful' || sleeperStatus === 'Doubtful') return 2;
  if (gameStatus === 'Questionable' || sleeperStatus === 'Questionable') return 3;
  if (latestPractice === 'Did not practice') return 4;
  if (latestPractice === 'Limited practice') return 5;
  if (facts) return 6;
  return 7;
}

function getPrimaryStatus({ sleeperStatus, facts }) {
  const gameStatus = canonicalGameStatus(facts?.gameStatus);
  if (gameStatus) return gameStatus;
  if (facts?.active === false) return 'Inactive';
  if (facts?.didNotPlay === true) return 'DNP';
  if (sleeperStatus) return sleeperStatus;
  if (facts?.latestPractice?.status) return facts.latestPractice.status;
  if (facts?.injury) return 'Injury report';
  return null;
}

function compareRows(left, right) {
  return Number(right.isCurrentUser) - Number(left.isCurrentUser)
    || left.urgency - right.urgency
    || String(left.ownerName ?? '').localeCompare(String(right.ownerName ?? ''))
    || left.displayName.localeCompare(right.displayName)
    || String(left.playerId).localeCompare(String(right.playerId));
}

/**
 * The report is current-week data, so it must never use a roster snapshot from
 * a different league season or from the interval while a season switch is in
 * flight. Keeping this boundary pure makes it usable by the component and by
 * lifecycle regression tests without duplicating the comparison logic.
 */
export function isFantasyInjuryLeagueSnapshotReady({ season, leagueSeason, seasonSwitching = null } = {}) {
  if (seasonSwitching != null) return false;
  if (season == null || leagueSeason == null) return false;
  return String(season) === String(leagueSeason);
}

export function isFantasyInjuryCurrentSeason({ selectedSeason, nflSeason } = {}) {
  if (selectedSeason == null || nflSeason == null) return false;
  return String(selectedSeason) === String(nflSeason);
}

export function buildFantasyInjuries({
  players = {}, rosterPlayers, reservePlayers, taxiPlayers, rosters,
  bdlInjuries = [], weeklyFacts = [], currentUserId = null,
} = {}) {
  const pool = rosterEntries({ players, rosterPlayers, reservePlayers, taxiPlayers, rosters });
  const designationGroups = new Map();

  [...list(bdlInjuries), ...list(weeklyFacts)].forEach((row) => {
    const identity = getProviderPlayerIdentity({
      name: designationName(row), team: designationTeam(row), position: designationPosition(row),
    });
    const key = getProviderIdentityKey(identity);
    if (!key) return;
    const facts = designationFacts(row);
    if (!isActionableDesignation(facts)) return;
    const group = designationGroups.get(key) ?? [];
    group.push(facts);
    designationGroups.set(key, group);
  });

  const poolIdentityCounts = new Map();
  pool.forEach((entry) => {
    const key = getProviderIdentityKey(getProviderPlayerIdentity({
      name: playerName(entry), team: entry.team, position: entry.position,
    }));
    if (key) poolIdentityCounts.set(key, (poolIdentityCounts.get(key) ?? 0) + 1);
  });

  return pool.map((entry) => {
    const identity = getProviderPlayerIdentity({
      name: playerName(entry), team: entry.team, position: entry.position,
    });
    const key = getProviderIdentityKey(identity);
    const designationMatches = key ? designationGroups.get(key) ?? [] : [];
    const uniqueMatch = key && poolIdentityCounts.get(key) === 1 && designationMatches.length === 1;
    const facts = uniqueMatch ? designationMatches[0] : null;
    const sleeper = getPlayerAvailabilityContext(entry, { isReserve: entry.bucket === 'reserve' });
    const sleeperStatus = sleeper.status;
    // Sleeper is the report's inclusion authority. BALLDONTLIE provides
    // game-week context for an already-reported Sleeper concern, but cannot
    // create a concern of its own: this keeps the core report useful when the
    // optional designation source is unavailable.
    const actionable = Boolean(sleeperStatus);

    return {
      ...entry,
      playerId: entry.player_id,
      displayName: playerName(entry),
      team: normalizeProviderTeam(entry.team),
      position: normalizeProviderPosition(entry.position),
      ownerId: entry.owner_id,
      rosterId: entry.roster_id,
      isCurrentUser: currentUserId != null && String(entry.owner_id) === String(currentUserId),
      sleeper: {
        status: sleeperStatus,
        durable: DURABLE_SLEEPER_STATUSES.has(sleeperStatus),
        label: sleeper.label,
        detail: sleeper.detail,
        bodyPart: sleeper.bodyPart,
        note: sleeper.note,
      },
      bdl: facts ? { ...facts, available: true } : null,
      status: getPrimaryStatus({ sleeperStatus, facts }),
      urgency: getUrgencyRank({ sleeperStatus, facts }),
      actionable,
      identity,
    };
  }).filter((row) => row.actionable).sort(compareRows);
}

function hasSelection(value) {
  return value != null && value !== '' && value !== 'all' && (!Array.isArray(value) || value.length > 0);
}

function asList(value) {
  return Array.isArray(value) ? value : [value];
}

export function matchesFantasyInjuryFilters(row, filters = {}) {
  const position = filters.position ?? filters.positions;
  const team = filters.team ?? filters.teams;
  const owners = filters.owner ?? filters.owners;
  const rosterIds = filters.rosterId ?? filters.rosterIds;
  const search = String(filters.playerQuery ?? filters.search ?? filters.ownerQuery ?? '').trim().toLowerCase();

  if (hasSelection(position) && !asList(position).map(normalizeProviderPosition).includes(row.position)) return false;
  if (hasSelection(team) && !asList(team).map(normalizeProviderTeam).includes(row.team)) return false;
  if (hasSelection(owners) && !asList(owners).some((owner) => String(owner) === String(row.ownerId))) return false;
  if (hasSelection(rosterIds) && !asList(rosterIds).some((rosterId) => String(rosterId) === String(row.rosterId))) return false;
  if (search && !String(row.displayName ?? '').toLowerCase().includes(search)) return false;
  return true;
}

export function filterFantasyInjuries(rows = [], filters = {}) {
  return rows.filter((row) => matchesFantasyInjuryFilters(row, filters));
}

export function buildFantasyInjuryReport({
  players = {}, rosters = [], leagueUsers = [], sleeperUser = null,
  designationRows = [], weeklyFacts = [], ...rest
} = {}) {
  const currentUserId = sleeperUser?.user_id ?? sleeperUser?.userId ?? sleeperUser?.id ?? null;
  const usersById = new Map(list(leagueUsers).map((user) => [
    String(user?.user_id ?? user?.userId ?? user?.id), user,
  ]));
  return buildFantasyInjuries({
    players, rosters, bdlInjuries: designationRows, weeklyFacts, currentUserId, ...rest,
  }).map((row) => {
    const owner = usersById.get(String(row.ownerId));
    const ownerName = owner?.display_name ?? owner?.displayName ?? owner?.username ?? 'Unknown owner';
    return {
      ...row,
      ownerName,
      username: owner?.username ?? null,
      fantasyTeamName: owner?.metadata?.team_name ?? ownerName,
      ownerAvatar: owner?.avatar ?? null,
    };
  }).sort(compareRows);
}

/**
 * Returns the NFL teams that need optional designation enrichment. A player
 * without a complete identity remains in the Sleeper report, but is not sent
 * through the provider-match path where we could not verify the result.
 */
export function getFantasyInjurySleeperCandidateTeams({
  players = {}, rosters = [], ...rest
} = {}) {
  return [...new Set(buildFantasyInjuries({ players, rosters, ...rest })
    .filter((row) => row.sleeper?.status && row.identity?.team)
    .map((row) => row.identity.team))].sort();
}

export function filterFantasyInjuryReport(rows = [], filters = {}) {
  return filterFantasyInjuries(rows, {
    position: filters.position,
    team: filters.nflTeams ?? filters.team,
    rosterId: filters.rosterIds ?? filters.rosterId,
    owner: filters.owner,
    playerQuery: filters.playerQuery ?? filters.ownerQuery,
  });
}

export function getFantasyInjuryPositionOptions(rows = []) {
  return [...new Set(rows.map((row) => row.position).filter(Boolean))].sort();
}

export function getFantasyInjuryPracticeLabel(row, compact = false) {
  const value = row?.bdl?.latestPractice?.status ?? null;
  if (!compact || !value) return value;
  if (value === 'Did not practice') return 'DNP';
  if (value === 'Limited practice') return 'LP';
  if (value === 'Full practice') return 'FP';
  return value;
}

export function getFantasyInjuryStatusLabel(row, compact = false) {
  const value = row?.status ?? null;
  if (!compact || !value) return value;
  if (value === 'Did not practice') return 'DNP';
  if (value === 'Limited practice') return 'LP';
  if (value === 'Full practice') return 'FP';
  return value;
}

export { normalizeProviderPlayerName, normalizeProviderPosition, normalizeProviderTeam };
