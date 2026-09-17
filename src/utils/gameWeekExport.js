import { normalizeBdlScoreboardGame } from './balldontlieNflScoreboard.js';
import { normalizeEspnScoreboardEvent } from './espnNflScoreboard.js';
import { buildFantasyMatchupScoringBreakdown } from './fantasyMatchupBreakdown.js';
import { buildLeagueHistoryModel, buildSeasonStandings } from './leagueHistory.js';
import { calcPoints, calcPointsFromTotals } from './scoringEngine.js';

export const GAME_WEEK_EXPORT_FORMAT = 'gridshift-game-week-roast';
export const GAME_WEEK_EXPORT_SCHEMA_VERSION = 1;

const WEEK_METADATA_KEYS = new Set([
  'week',
  'team',
  'opp',
  'home',
  'gp',
  'games_played',
  'gamesPlayed',
]);

function key(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function finiteNumber(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value) {
  const parsed = finiteNumber(value);
  return parsed == null ? null : Math.round(parsed * 100) / 100;
}

function unique(values = []) {
  return [...new Set(values.map(key).filter(Boolean))];
}

/**
 * Convert provider-shaped data into JSON-safe data without dropping explicit
 * zeroes or nulls. Maps are represented as objects because the download is
 * meant to be consumed outside the browser.
 */
export function toSerializable(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  let serialized;
  if (value instanceof Map) {
    serialized = Object.fromEntries([...value.entries()].map(([mapKey, mapValue]) => [
      String(mapKey),
      toSerializable(mapValue, seen),
    ]));
  } else if (value instanceof Set) {
    serialized = [...value].map((entry) => toSerializable(entry, seen));
  } else if (Array.isArray(value)) {
    serialized = value.map((entry) => toSerializable(entry, seen));
  } else {
    serialized = Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      toSerializable(entryValue, seen),
    ]));
  }
  seen.delete(value);
  return serialized;
}

function getPlayerName(player, playerId) {
  return String(
    player?.full_name
      ?? player?.display_name
      ?? player?.displayName
      ?? [player?.first_name, player?.last_name].filter(Boolean).join(' ')
      ?? `Player ${playerId}`,
  ).trim() || `Player ${playerId}`;
}

function getPlayerPosition(player) {
  return key(player?.position ?? player?.fantasy_positions?.[0])?.toUpperCase() ?? null;
}

function getPlayerTeam(player, weeklyRow) {
  return key(weeklyRow?.team ?? player?.team)?.toUpperCase() ?? null;
}

function getWeekRow(weeklyStatsByPlayer, playerId, week) {
  const value = weeklyStatsByPlayer?.[playerId] ?? weeklyStatsByPlayer?.[String(playerId)];
  if (Array.isArray(value)) {
    return value.find((row) => Number(row?.week) === Number(week)) ?? null;
  }
  if (value && typeof value === 'object') {
    return Number(value.week) === Number(week) || value.week == null ? value : null;
  }
  return null;
}

function hasStatPayload(row) {
  if (!row || typeof row !== 'object') return false;
  const appliedTotal = [row._fantasyPoints, row.fantasy_points, row.appliedTotal]
    .map(finiteNumber)
    .find((value) => value != null);
  if (appliedTotal != null) return true;

  return Object.entries(row).some(([statKey, value]) => (
    !statKey.startsWith('_')
    && !WEEK_METADATA_KEYS.has(statKey)
    && finiteNumber(value) != null
  ));
}

function getReportedFantasyPoints(row) {
  if (!row || typeof row !== 'object') return null;
  return [row._fantasyPoints, row.fantasy_points, row.appliedTotal]
    .map(finiteNumber)
    .find((value) => value != null) ?? null;
}

function getGamesPlayed(stats) {
  const explicit = [stats?.gp, stats?.games_played, stats?.gamesPlayed]
    .map(finiteNumber)
    .find((value) => value != null);
  return explicit == null ? null : Math.max(0, explicit);
}

function getOfficialPlayerPoints(playerPoints, playerId) {
  if (!playerPoints || !Object.prototype.hasOwnProperty.call(playerPoints, playerId)) return null;
  return finiteNumber(playerPoints[playerId]);
}

function getOfficialTeamPoints(row) {
  if (!row || !Object.prototype.hasOwnProperty.call(row, 'points')) return null;
  const points = finiteNumber(row.points);
  if (points == null) return null;
  return round(points + (finiteNumber(row.custom_points) ?? 0));
}

function getRawStats(row) {
  if (!row || typeof row !== 'object') return null;
  return Object.fromEntries(Object.entries(row).filter(([statKey]) => (
    statKey !== 'week'
    && !statKey.startsWith('_')
    && !WEEK_METADATA_KEYS.has(statKey)
  )));
}

function getUserById(usersById, ownerId) {
  return ownerId ? usersById.get(ownerId) ?? null : null;
}

function getTeamName(roster, user, rosterId) {
  return String(
    user?.metadata?.team_name
      ?? roster?.metadata?.team_name
      ?? roster?.metadata?.name
      ?? user?.display_name
      ?? user?.username
      ?? `Team ${rosterId}`,
  ).trim();
}

function getManagerName(user, rosterId) {
  return String(user?.display_name ?? user?.username ?? `Manager ${rosterId}`).trim();
}

function buildIdentity({ roster, user, rosterId, season }) {
  const normalizedRosterId = key(rosterId);
  const ownerId = key(roster?.owner_id ?? user?.user_id);
  return {
    participantId: ownerId || `${String(season ?? '')}:${normalizedRosterId}`,
    rosterId: normalizedRosterId,
    userId: ownerId,
    managerName: getManagerName(user, normalizedRosterId),
    teamName: getTeamName(roster, user, normalizedRosterId),
    avatarHash: user?.avatar ?? null,
    division: key(roster?.settings?.division),
  };
}

function buildRosterIdentities({ rosters = [], users = [], season }) {
  const usersById = new Map(users.map((user) => [key(user?.user_id), user]).filter(([id]) => id));
  return new Map(rosters.map((roster) => {
    const rosterId = key(roster?.roster_id);
    if (!rosterId) return [null, null];
    const user = getUserById(usersById, key(roster?.owner_id));
    return [rosterId, buildIdentity({ roster, user, rosterId, season })];
  }).filter(([rosterId]) => rosterId));
}

function buildWeekAssignments({ matchupRows = [], rosters = [], league }) {
  const assignments = new Map();
  const put = (playerId, assignment) => {
    const normalizedPlayerId = key(playerId);
    if (!normalizedPlayerId || !assignment?.rosterId) return;
    const existing = assignments.get(normalizedPlayerId);
    if (!existing || (assignment.starter && !existing.starter)) {
      assignments.set(normalizedPlayerId, assignment);
    }
  };

  matchupRows.forEach((row) => {
    const rosterId = key(row?.roster_id);
    if (!rosterId) return;
    const starterIds = unique(row?.starters ?? []);
    const starterSet = new Set(starterIds);
    const slots = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
    const players = unique([
      ...(Array.isArray(row?.players) ? row.players : []),
      ...Object.keys(row?.players_points ?? {}),
    ]);
    players.forEach((playerId) => {
      const starterIndex = starterIds.indexOf(playerId);
      const reserve = Array.isArray(row?.reserve) && row.reserve.map(key).includes(playerId);
      put(playerId, {
        rosterId,
        starter: starterSet.has(playerId),
        bench: !starterSet.has(playerId),
        reserve,
        lineupSlot: starterIndex >= 0 ? slots[starterIndex] ?? null : null,
        assignmentSource: 'sleeper.matchups',
      });
    });
  });

  rosters.forEach((roster) => {
    const rosterId = key(roster?.roster_id);
    if (!rosterId) return;
    const starterIds = unique(roster?.starters ?? []);
    const starterSet = new Set(starterIds);
    const slots = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
    unique(roster?.players ?? []).forEach((playerId) => {
      if (assignments.has(playerId)) return;
      const starterIndex = starterIds.indexOf(playerId);
      put(playerId, {
        rosterId,
        starter: starterSet.has(playerId),
        bench: !starterSet.has(playerId),
        reserve: Array.isArray(roster?.reserve) && roster.reserve.map(key).includes(playerId),
        lineupSlot: starterIndex >= 0 ? slots[starterIndex] ?? null : null,
        assignmentSource: 'sleeper.rosters',
      });
    });
  });

  return assignments;
}

function normalizeBreakdownRows(rows = []) {
  return rows.map((row) => ({
    key: row.key ?? null,
    statKey: row.statKey ?? null,
    label: row.label ?? null,
    statValue: finiteNumber(row.statVal),
    points: round(row.pts),
  }));
}

function sumPoints(rows = []) {
  const values = rows.map((row) => finiteNumber(row?.points)).filter((value) => value != null);
  return values.length ? round(values.reduce((sum, value) => sum + value, 0)) : null;
}

function buildPlayerIdentity(playerId, player) {
  return {
    playerId,
    name: getPlayerName(player, playerId),
    position: getPlayerPosition(player),
    nflTeam: key(player?.team)?.toUpperCase() ?? null,
    sleeperId: playerId,
    espnId: key(player?.espn_id),
  };
}

function buildFantasyPlayerRows({
  week,
  weeklyStatsByPlayer,
  rawWeeklyStatsByPlayer,
  seasonStatsByPlayer,
  players,
  rosters,
  matchupRows,
  league,
  scoringSettings,
  marketValuesByPlayer,
}) {
  const assignments = buildWeekAssignments({ matchupRows, rosters, league });
  const playerIds = new Set();

  Object.entries(weeklyStatsByPlayer ?? {}).forEach(([playerId]) => {
    if (getWeekRow(weeklyStatsByPlayer, playerId, week)) playerIds.add(String(playerId));
  });
  matchupRows.forEach((row) => {
    unique([
      ...(Array.isArray(row?.players) ? row.players : []),
      ...Object.keys(row?.players_points ?? {}),
    ]).forEach((playerId) => playerIds.add(playerId));
  });
  rosters.forEach((roster) => unique(roster?.players ?? []).forEach((playerId) => playerIds.add(playerId)));

  return [...playerIds].map((playerId) => {
    const player = players?.[playerId] ?? players?.[String(playerId)] ?? null;
    const weeklyRow = getWeekRow(weeklyStatsByPlayer, playerId, week);
    const rawWeeklyRow = getWeekRow(rawWeeklyStatsByPlayer, playerId, week) ?? weeklyRow;
    const assignment = assignments.get(playerId) ?? null;
    const officialPoints = matchupRows
      .map((row) => getOfficialPlayerPoints(row?.players_points, playerId))
      .find((value) => value != null) ?? null;
    const reportedPoints = getReportedFantasyPoints(weeklyRow);
    const hasStats = hasStatPayload(weeklyRow) || hasStatPayload(rawWeeklyRow);
    const position = getPlayerPosition(player);
    const calculatedPoints = hasStats ? round(calcPoints(weeklyRow ?? rawWeeklyRow, scoringSettings, position)) : null;
    const fantasyPoints = officialPoints ?? reportedPoints ?? calculatedPoints;
    const fantasyPointsSource = officialPoints != null
      ? 'sleeper.players_points'
      : reportedPoints != null
        ? 'sleeper.weekly_reported_total'
        : calculatedPoints != null
          ? 'calculated_from_weekly_stats'
          : 'unavailable';
    const seasonStats = seasonStatsByPlayer?.[playerId] ?? null;
    const seasonStatsAvailable = hasStatPayload(seasonStats);
    const seasonPoints = seasonStatsAvailable
      ? round(calcPointsFromTotals(seasonStats, scoringSettings, position))
      : null;
    const gamesPlayed = getGamesPlayed(seasonStats);
    const weeklyGamesPlayed = getGamesPlayed(weeklyRow ?? rawWeeklyRow);

    return {
      ...buildPlayerIdentity(playerId, player),
      week: Number(week),
      nflTeam: getPlayerTeam(player, weeklyRow ?? rawWeeklyRow),
      opponent: key(weeklyRow?.opp)?.toUpperCase() ?? null,
      fantasyPoints: round(fantasyPoints),
      fantasyPointsSource,
      gamesPlayed: weeklyGamesPlayed,
      roster: assignment ? {
        rosterId: assignment.rosterId,
        starter: assignment.starter,
        bench: assignment.bench,
        reserve: assignment.reserve,
        lineupSlot: assignment.lineupSlot,
        assignmentSource: assignment.assignmentSource,
      } : null,
      seasonToDate: {
        fantasyPoints: seasonPoints,
        gamesPlayed,
        ppg: seasonPoints != null && gamesPlayed > 0 ? round(seasonPoints / gamesPlayed) : null,
      },
      marketValue: marketValuesByPlayer?.[playerId] ?? null,
      rawStats: getRawStats(rawWeeklyRow),
      rawWeeklyRow: toSerializable(rawWeeklyRow),
    };
  });
}

function addRanks(rows, valueKey, rankKey, positionRankKey) {
  const ranked = rows
    .filter((row) => finiteNumber(row?.[valueKey]) != null)
    .sort((left, right) => finiteNumber(right[valueKey]) - finiteNumber(left[valueKey]) || left.name.localeCompare(right.name));
  const byPosition = new Map();
  ranked.forEach((row, index) => {
    const position = row.position ?? 'OTHER';
    const positionIndex = byPosition.get(position) ?? 0;
    byPosition.set(position, positionIndex + 1);
    row[rankKey] = index + 1;
    row[positionRankKey] = positionIndex + 1;
  });
  rows.forEach((row) => {
    if (!Object.hasOwn(row, rankKey)) row[rankKey] = null;
    if (!Object.hasOwn(row, positionRankKey)) row[positionRankKey] = null;
  });
}

function buildTeamPlayerRows({ row, week, weeklyStatsByPlayer, players, scoringSettings, league }) {
  const playerIds = unique([
    ...(Array.isArray(row?.players) ? row.players : []),
    ...Object.keys(row?.players_points ?? {}),
  ]);
  const starterIds = unique(row?.starters ?? []);
  const starterSet = new Set(starterIds);
  const slots = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
  const breakdown = buildFantasyMatchupScoringBreakdown({
    playerIds,
    playerPoints: row?.players_points ?? {},
    teamTotal: getOfficialTeamPoints(row),
    week,
    weeklyStats: weeklyStatsByPlayer,
    players,
    scoringSettings,
  });
  const breakdownById = new Map(
    (breakdown.playerRows ?? []).map((entry) => [String(entry.id), entry]),
  );
  const normalizedPlayers = playerIds.map((playerId) => {
    const player = players?.[playerId] ?? null;
    const playerBreakdown = breakdownById.get(playerId);
    const points = getOfficialPlayerPoints(row?.players_points, playerId)
      ?? finiteNumber(playerBreakdown?.points);
    const starterIndex = starterIds.indexOf(playerId);
    return {
      ...buildPlayerIdentity(playerId, player),
      points: round(points),
      pointsSource: getOfficialPlayerPoints(row?.players_points, playerId) != null
        ? 'sleeper.players_points'
        : playerBreakdown?.pointSource === 'calculated'
          ? 'calculated_from_weekly_stats'
          : 'unavailable',
      starter: starterSet.has(playerId),
      bench: !starterSet.has(playerId),
      reserve: Array.isArray(row?.reserve) && row.reserve.map(key).includes(playerId),
      lineupSlot: starterIndex >= 0 ? slots[starterIndex] ?? null : null,
      scoringBreakdown: normalizeBreakdownRows(playerBreakdown?.breakdown ?? []),
      rawWeeklyRow: toSerializable(getWeekRow(weeklyStatsByPlayer, playerId, week)),
    };
  });
  const starters = normalizedPlayers.filter((player) => player.starter);
  const bench = normalizedPlayers.filter((player) => !player.starter);
  const pointsByPosition = {};
  normalizedPlayers.forEach((player) => {
    if (player.points == null || !player.position) return;
    pointsByPosition[player.position] = round((pointsByPosition[player.position] ?? 0) + player.points);
  });

  return {
    players: normalizedPlayers,
    starters,
    bench,
    starterPoints: sumPoints(starters),
    benchPoints: sumPoints(bench),
    pointsByPosition,
    scoringBreakdown: {
      byCategory: normalizeBreakdownRows(breakdown.categoryRows ?? []),
      calculatedTotal: round(breakdown.calculatedTotal),
      categoryTotal: round(breakdown.categoryTotal),
      teamAdjustment: round((breakdown.playerRows ?? []).find((entry) => entry.isAdjustment)?.points),
    },
  };
}

function buildFantasyTeamPerformances({
  week,
  matchupRows,
  rosters,
  leagueUsers,
  league,
  players,
  weeklyStatsByPlayer,
  scoringSettings,
  season,
}) {
  const rostersById = new Map(rosters.map((roster) => [key(roster?.roster_id), roster]).filter(([id]) => id));
  const usersById = new Map(leagueUsers.map((user) => [key(user?.user_id), user]).filter(([id]) => id));
  const identities = buildRosterIdentities({ rosters, users: leagueUsers, season });
  const groups = new Map();

  matchupRows.forEach((row, index) => {
    const rosterId = key(row?.roster_id);
    if (!rosterId) return;
    const rawMatchupId = key(row?.matchup_id);
    const matchupId = rawMatchupId ?? `unpaired:${rosterId}:${index}`;
    if (!groups.has(matchupId)) groups.set(matchupId, []);
    groups.get(matchupId).push(row);
  });

  const performances = [];
  groups.forEach((rows, matchupId) => {
    const sides = rows.map((row) => {
      const rosterId = key(row?.roster_id);
      const roster = rostersById.get(rosterId) ?? null;
      const user = usersById.get(key(roster?.owner_id)) ?? null;
      const identity = identities.get(rosterId) ?? buildIdentity({ roster, user, rosterId, season });
      const teamRows = buildTeamPlayerRows({ row, week, weeklyStatsByPlayer, players, scoringSettings, league });
      return {
        rosterId,
        participantId: identity.participantId,
        managerName: identity.managerName,
        teamName: identity.teamName,
        avatarHash: identity.avatarHash,
        matchupId,
        score: getOfficialTeamPoints(row),
        scoreSource: getOfficialTeamPoints(row) != null
          ? 'sleeper.matchups.points+custom_points'
          : 'unavailable',
        ...teamRows,
        rawMatchupRow: toSerializable(row),
      };
    });
    sides.forEach((side) => {
      const opponent = sides.find((candidate) => candidate.rosterId !== side.rosterId) ?? null;
      const score = finiteNumber(side.score);
      const opponentScore = finiteNumber(opponent?.score);
      const result = score == null || opponentScore == null
        ? null
        : score === opponentScore ? 'tie' : score > opponentScore ? 'win' : 'loss';
      performances.push({
        ...side,
        opponentRosterId: opponent?.rosterId ?? null,
        opponentTeamName: opponent?.teamName ?? null,
        opponentScore,
        result,
        margin: score != null && opponentScore != null ? round(Math.abs(score - opponentScore)) : null,
      });
    });
  });

  return performances.sort((left, right) => (
    String(left.matchupId ?? left.rosterId).localeCompare(String(right.matchupId ?? right.rosterId))
    || left.teamName.localeCompare(right.teamName)
  ));
}

function teamEvidence(team) {
  return team ? {
    rosterId: team.rosterId,
    participantId: team.participantId,
    teamName: team.teamName,
    managerName: team.managerName,
    matchupId: team.matchupId,
    score: team.score,
    opponentRosterId: team.opponentRosterId,
    opponentTeamName: team.opponentTeamName,
    opponentScore: team.opponentScore,
    result: team.result,
    margin: team.margin,
    week: team.week ?? null,
  } : null;
}

function playerEvidence(player, teamPerformances) {
  if (!player) return null;
  const team = teamPerformances.find((candidate) => candidate.players?.some((row) => row.playerId === player.playerId));
  return {
    playerId: player.playerId,
    name: player.name,
    position: player.position,
    nflTeam: player.nflTeam,
    points: player.points,
    starter: player.starter,
    rosterId: team?.rosterId ?? player.roster?.rosterId ?? null,
    teamName: team?.teamName ?? null,
    matchupId: team?.matchupId ?? null,
    week: player.week ?? null,
  };
}

function buildWeekRecords({ week, playerRows, teamPerformances }) {
  const validTeams = teamPerformances.filter((team) => finiteNumber(team.score) != null);
  const pairedTeams = validTeams.filter((team) => team.opponentRosterId && finiteNumber(team.opponentScore) != null);
  const decisiveTeams = pairedTeams.filter((team) => team.result !== 'tie');
  const highestScore = [...validTeams].sort((left, right) => right.score - left.score)[0] ?? null;
  const highestLosingScore = [...pairedTeams].filter((team) => team.result === 'loss').sort((left, right) => right.score - left.score)[0] ?? null;
  const lowestWinningScore = [...pairedTeams].filter((team) => team.result === 'win').sort((left, right) => left.score - right.score)[0] ?? null;
  const biggestBlowout = [...decisiveTeams].sort((left, right) => right.margin - left.margin)[0] ?? null;
  const narrowestWin = [...decisiveTeams].sort((left, right) => left.margin - right.margin)[0] ?? null;
  const highestCombinedScore = [...pairedTeams]
    .sort((left, right) => (
      (right.score + right.opponentScore) - (left.score + left.opponentScore)
    ))[0] ?? null;
  const validPlayers = playerRows.filter((player) => finiteNumber(player.fantasyPoints) != null)
    .map((player) => ({
      ...player,
      points: player.fantasyPoints,
      starter: player.roster?.starter ?? false,
      week: player.week,
    }));
  const starters = validPlayers.filter((player) => player.starter);
  const benchByTeam = teamPerformances
    .filter((team) => finiteNumber(team.benchPoints) != null)
    .sort((left, right) => right.benchPoints - left.benchPoints)[0] ?? null;
  const starterShareRows = teamPerformances
    .filter((team) => finiteNumber(team.starterPoints) > 0)
    .flatMap((team) => (team.starters ?? [])
      .filter((player) => finiteNumber(player.points) != null)
      .map((player) => ({
        ...player,
        share: round((player.points / team.starterPoints) * 100),
        rosterId: team.rosterId,
        teamName: team.teamName,
        matchupId: team.matchupId,
        week,
      })));
  const largestStarterShare = starterShareRows.sort((left, right) => right.share - left.share)[0] ?? null;

  return {
    highestScore: teamEvidence(highestScore),
    highestScoreInLoss: teamEvidence(highestLosingScore),
    lowestWinningScore: teamEvidence(lowestWinningScore),
    highestCombinedScore: highestCombinedScore ? {
      ...teamEvidence(highestCombinedScore),
      combinedScore: round(highestCombinedScore.score + highestCombinedScore.opponentScore),
    } : null,
    biggestBlowout: teamEvidence(biggestBlowout),
    narrowestWin: teamEvidence(narrowestWin),
    highestIndividualScore: playerEvidence([...validPlayers].sort((left, right) => right.points - left.points)[0], teamPerformances),
    highestStarterScore: playerEvidence([...starters].sort((left, right) => right.points - left.points)[0], teamPerformances),
    highestBenchScore: playerEvidence([...validPlayers].filter((player) => !player.starter).sort((left, right) => right.points - left.points)[0], teamPerformances),
    mostBenchPoints: benchByTeam ? {
      ...teamEvidence(benchByTeam),
      benchPoints: benchByTeam.benchPoints,
    } : null,
    largestStarterShare: largestStarterShare ? {
      ...playerEvidence({ ...largestStarterShare, points: largestStarterShare.points }, teamPerformances),
      share: largestStarterShare.share,
    } : null,
  };
}

function buildOutcomes(teamPerformances) {
  const seen = new Set();
  return teamPerformances.flatMap((team) => {
    if (!team.matchupId || seen.has(team.matchupId)) return [];
    seen.add(team.matchupId);
    const opponent = teamPerformances.find((candidate) => candidate.matchupId === team.matchupId && candidate.rosterId !== team.rosterId);
    return [{
      matchupId: team.matchupId,
      rosterIds: [team.rosterId, opponent?.rosterId].filter(Boolean),
      winnerRosterId: team.result === 'win' ? team.rosterId : opponent?.result === 'win' ? opponent.rosterId : null,
      loserRosterId: team.result === 'loss' ? team.rosterId : opponent?.result === 'loss' ? opponent.rosterId : null,
      result: team.result === 'win' ? 'decided' : team.result === 'tie' ? 'tie' : opponent?.result === 'win' ? 'decided' : 'unresolved',
      scores: {
        [team.rosterId]: team.score,
        ...(opponent?.rosterId ? { [opponent.rosterId]: opponent.score } : {}),
      },
      margin: team.margin,
    }];
  });
}

function buildHistorySection({ historySnapshots, currentSnapshot, players }) {
  const selectedStandings = buildSeasonStandings(currentSnapshot);
  const snapshots = [
    ...(historySnapshots ?? []).filter((snapshot) => String(snapshot?.season) !== String(currentSnapshot?.season)),
    currentSnapshot,
  ];
  const model = buildLeagueHistoryModel(snapshots, players);
  return {
    selectedSeasonStandings: selectedStandings,
    finalizedThroughWeek: selectedStandings.throughWeek,
    historySeasonCount: snapshots.length,
    participants: toSerializable(model.participants),
    leaderboard: toSerializable(model.leaderboard),
    champions: toSerializable(model.champions),
    rivalries: toSerializable(model.rivalries),
    recordBook: toSerializable(model.records),
  };
}

function getNflOutcome(game) {
  const away = finiteNumber(game?.score?.away);
  const home = finiteNumber(game?.score?.home);
  if (away == null || home == null) return 'unresolved';
  if (away === home) return 'tie';
  return away > home ? 'away_win' : 'home_win';
}

function buildNflSection(bundle, { season, phase, week }) {
  if (!bundle) {
    return {
      provider: null,
      season,
      phase,
      week,
      games: [],
      coverage: { scoreboard: 'unavailable', boxScores: 'unavailable', playByPlay: 'unavailable' },
      responseMeta: null,
    };
  }

  if (bundle.provider === 'balldontlie') {
    const detailsByGameId = new Map((bundle.details ?? []).map((entry) => [String(entry.gameId), entry]));
    const games = (bundle.games ?? []).map((rawGame) => {
      const normalized = normalizeBdlScoreboardGame(rawGame, {
        phase,
        detailsAvailable: Boolean(bundle.capabilities?.stats || bundle.capabilities?.teamStats),
        playByPlayAvailable: bundle.capabilities?.plays === true,
      });
      if (!normalized) return null;
      const detailEntry = detailsByGameId.get(String(rawGame?.id));
      const detail = detailEntry?.detail ?? null;
      return {
        ...normalized,
        week: Number(rawGame?.week ?? normalized.week ?? week) || null,
        outcome: getNflOutcome(normalized),
        coverage: {
          scoreboard: true,
          boxScore: Boolean(detail?.coverage?.game && (detail?.coverage?.teamStats || detail?.coverage?.playerStats)),
          teamStats: Boolean(detail?.coverage?.teamStats),
          playerStats: Boolean(detail?.coverage?.playerStats),
          playByPlay: Boolean(detail?.coverage?.plays),
          scoring: Boolean(detail?.coverage?.scoring),
          error: detailEntry?.error ?? null,
        },
        teamStats: toSerializable(detail?.teamStats ?? []),
        playerStats: toSerializable(detail?.playerStats ?? []),
        scoringPlays: toSerializable(detail?.scoringPlays ?? []),
        plays: toSerializable(detail?.plays ?? []),
        raw: {
          scoreboardGame: toSerializable(rawGame),
          detail: toSerializable(detail),
        },
      };
    }).filter(Boolean);
    return {
      provider: 'balldontlie',
      season,
      phase,
      week,
      games,
      coverage: bundle.coverage ?? {
        scoreboard: games.length ? 'complete' : 'unavailable',
        boxScores: 'partial',
        playByPlay: bundle.detailLevel === 'full_play_by_play' ? 'partial' : 'not_requested',
      },
      responseMeta: toSerializable({
        fallbackReason: bundle.fallbackReason ?? null,
        capabilities: bundle.capabilities ?? null,
        cache: bundle.cache ?? null,
        freshness: bundle.freshness ?? null,
        accounting: bundle.accounting ?? null,
      }),
    };
  }

  const events = bundle.scoreboard?.events ?? [];
  const games = events.map((event) => {
    const normalized = normalizeEspnScoreboardEvent(event, { phase });
    if (!normalized) return null;
    return {
      ...normalized,
      week: Number(week),
      outcome: getNflOutcome(normalized),
      coverage: {
        scoreboard: true,
        boxScore: false,
        teamStats: false,
        playerStats: false,
        playByPlay: false,
        scoring: false,
        error: null,
      },
      teamStats: [],
      playerStats: [],
      scoringPlays: [],
      plays: [],
      raw: { scoreboardEvent: toSerializable(event), detail: null },
    };
  }).filter(Boolean);
  return {
    provider: bundle.provider ?? 'espn',
    season,
    phase,
    week,
    games,
    coverage: bundle.coverage ?? {
      scoreboard: games.length ? 'complete' : 'unavailable',
      boxScores: 'unavailable',
      playByPlay: 'unavailable',
    },
    responseMeta: toSerializable({
      fallbackReason: bundle.fallbackReason ?? null,
      capabilities: bundle.capabilities ?? null,
      cache: bundle.cache ?? null,
      freshness: bundle.freshness ?? null,
      accounting: bundle.accounting ?? null,
    }),
  };
}

function buildStorylineSignals({ records, outcomes }) {
  const signals = [];
  const add = (type, evidence) => {
    if (evidence) signals.push({ type, evidence });
  };
  add('highest_score', records.highestScore);
  add('highest_score_in_loss', records.highestScoreInLoss);
  add('lowest_score_to_win', records.lowestWinningScore);
  add('biggest_blowout', records.biggestBlowout);
  add('narrowest_win', records.narrowestWin);
  add('highest_individual_score', records.highestIndividualScore);
  add('highest_bench_score', records.highestBenchScore);
  add('most_bench_points', records.mostBenchPoints);
  add('largest_starter_share', records.largestStarterShare);
  add('unresolved_matchup', outcomes.find((outcome) => outcome.result === 'unresolved'));
  return signals;
}

export function buildGameWeekExport({
  season,
  fantasyWeek,
  nflPhase = 'regular',
  nflWeek = fantasyWeek,
  platform = 'sleeper',
  league = null,
  rosters = [],
  leagueUsers = [],
  players = {},
  weeklyStatsByPlayer = {},
  rawWeeklyStatsByPlayer = {},
  seasonStatsByPlayer = {},
  scoringSettings = null,
  matchupRows = [],
  historySnapshots = [],
  historyCurrentSnapshot = null,
  currentMatchupsByWeek = null,
  nflBundle = null,
  marketValuesByPlayer = {},
  coverage = {},
  sources = {},
  warnings = [],
  includeRaw = true,
} = {}) {
  const normalizedSeason = String(season ?? league?.season ?? '');
  const normalizedFantasyWeek = Number(fantasyWeek);
  const rosterIdentities = buildRosterIdentities({ rosters, users: leagueUsers, season: normalizedSeason });
  const playersRows = buildFantasyPlayerRows({
    week: normalizedFantasyWeek,
    weeklyStatsByPlayer,
    rawWeeklyStatsByPlayer,
    seasonStatsByPlayer,
    players,
    rosters,
    matchupRows,
    league,
    scoringSettings,
    marketValuesByPlayer,
  });
  const teamPerformances = buildFantasyTeamPerformances({
    week: normalizedFantasyWeek,
    matchupRows,
    rosters,
    leagueUsers,
    league,
    players,
    weeklyStatsByPlayer,
    scoringSettings,
    season: normalizedSeason,
  }).map((team) => ({ ...team, week: normalizedFantasyWeek }));
  const outcomes = buildOutcomes(teamPerformances);
  const weekRecords = buildWeekRecords({ week: normalizedFantasyWeek, playerRows: playersRows.map((row) => ({
    ...row,
    fantasyPoints: row.fantasyPoints,
    points: row.fantasyPoints,
    week: normalizedFantasyWeek,
  })), teamPerformances });
  addRanks(playersRows, 'fantasyPoints', 'weeklyRank', 'weeklyPositionRank');
  const seasonRankRows = playersRows
    .map((row) => ({ playerId: row.playerId, seasonRank: null, seasonPositionRank: null, value: row.seasonToDate?.fantasyPoints }))
    .filter((row) => finiteNumber(row.value) != null)
    .sort((left, right) => right.value - left.value || left.playerId.localeCompare(right.playerId));
  const seasonRanksByPlayer = new Map();
  const seasonPositionCounts = new Map();
  seasonRankRows.forEach((row, index) => {
    const player = playersRows.find((candidate) => candidate.playerId === row.playerId);
    const position = player?.position ?? 'OTHER';
    const positionRank = (seasonPositionCounts.get(position) ?? 0) + 1;
    seasonPositionCounts.set(position, positionRank);
    seasonRanksByPlayer.set(row.playerId, { seasonRank: index + 1, seasonPositionRank: positionRank });
  });
  playersRows.forEach((row) => Object.assign(row, seasonRanksByPlayer.get(row.playerId) ?? { seasonRank: null, seasonPositionRank: null }));

  const currentSnapshot = {
    ...(historyCurrentSnapshot ?? {}),
    season: normalizedSeason,
    league: {
      ...(historyCurrentSnapshot?.league ?? {}),
      ...league,
      settings: {
        ...(historyCurrentSnapshot?.league?.settings ?? {}),
        ...(league?.settings ?? {}),
        last_scored_leg: normalizedFantasyWeek,
      },
    },
    rosters,
    users: leagueUsers,
    matchupsByWeek: currentMatchupsByWeek ?? { [normalizedFantasyWeek]: matchupRows },
    transactions: historyCurrentSnapshot?.transactions ?? [],
    winnersBracket: historyCurrentSnapshot?.winnersBracket ?? [],
    losersBracket: historyCurrentSnapshot?.losersBracket ?? [],
    completed: false,
  };
  const history = buildHistorySection({ historySnapshots, currentSnapshot, players });
  const nfl = buildNflSection(nflBundle, { season: normalizedSeason, phase: nflPhase, week: nflWeek });
  const normalizedRosterRows = rosters.map((roster) => {
    const identity = rosterIdentities.get(key(roster?.roster_id));
    return {
      rosterId: key(roster?.roster_id),
      ownerId: key(roster?.owner_id),
      participantId: identity?.participantId ?? null,
      managerName: identity?.managerName ?? null,
      teamName: identity?.teamName ?? null,
      players: unique(roster?.players ?? []),
      starters: unique(roster?.starters ?? []),
      reserve: unique(roster?.reserve ?? []),
      rawSettings: toSerializable(roster?.settings ?? null),
    };
  });

  const normalizedCoverage = {
    weeklyPlayerStats: coverage.weeklyPlayerStats ?? {
      status: playersRows.some((row) => row.rawWeeklyRow) ? 'complete' : 'unavailable',
      players: playersRows.filter((row) => row.rawWeeklyRow).length,
      failedWeeks: [],
    },
    fantasyMatchups: coverage.fantasyMatchups ?? {
      status: matchupRows.length ? 'complete' : 'unavailable',
      rows: matchupRows.length,
    },
    nflGames: coverage.nflGames ?? {
      status: nfl.games.length ? 'complete' : 'unavailable',
      games: nfl.games.length,
    },
    nflBoxScores: coverage.nflBoxScores ?? nfl.coverage.boxScores,
    nflPlayByPlay: coverage.nflPlayByPlay ?? nfl.coverage.playByPlay,
    leagueHistory: coverage.leagueHistory ?? {
      status: historySnapshots.length ? 'complete' : 'selected-season-only',
      seasons: historySnapshots.map((snapshot) => String(snapshot.season)),
    },
    marketValues: coverage.marketValues ?? {
      status: Object.keys(marketValuesByPlayer ?? {}).length ? 'complete' : 'not_requested',
      players: Object.keys(marketValuesByPlayer ?? {}).length,
    },
  };

  const output = {
    format: GAME_WEEK_EXPORT_FORMAT,
    schemaVersion: GAME_WEEK_EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    scope: {
      platform,
      leagueId: key(league?.league_id),
      leagueName: league?.name ?? null,
      season: normalizedSeason,
      fantasyWeek: normalizedFantasyWeek,
      nflPhase,
      nflWeek: Number(nflWeek),
      mode: 'roast_week',
      historyScope: historySnapshots.length ? 'linked_league_seasons_through_selected_season' : 'selected_season_only',
      finalizedThroughWeek: history.finalizedThroughWeek,
    },
    sources: toSerializable({
      fantasy: { provider: platform, ...sources.fantasy },
      nflScoreboard: sources.nflScoreboard ?? null,
      nflDetails: sources.nflDetails ?? null,
      marketValues: sources.marketValues ?? null,
    }),
    coverage: toSerializable(normalizedCoverage),
    league: {
      identity: {
        leagueId: key(league?.league_id),
        name: league?.name ?? null,
        season: normalizedSeason,
        totalRosters: finiteNumber(league?.total_rosters) ?? rosters.length,
        rosterPositions: toSerializable(league?.roster_positions ?? []),
      },
      scoringSettings: toSerializable(scoringSettings),
      rosters: normalizedRosterRows,
      managers: normalizedRosterRows.map((roster) => ({
        rosterId: roster.rosterId,
        participantId: roster.participantId,
        managerName: roster.managerName,
        teamName: roster.teamName,
      })),
    },
    fantasy: {
      weeklyPlayerStats: playersRows,
      teamPerformances,
      outcomes,
      records: {
        selectedWeek: weekRecords,
        leagueHistory: history,
      },
      marketValues: Object.values(marketValuesByPlayer ?? {}),
    },
    nfl,
    storylineSignals: buildStorylineSignals({ records: weekRecords, outcomes }),
    warnings: unique(warnings),
    assumptions: [
      'Sleeper matchup totals and players_points are authoritative when present.',
      'Unavailable values are null; valid provider-reported zeroes remain zero.',
      'Calculated fantasy points are labeled as calculated_from_weekly_stats.',
      'NFL detail is provider-capability dependent; scoreboard coverage does not imply box-score coverage.',
      'Market values are point-in-time snapshots and are not historical weekly values.',
    ],
  };

  if (includeRaw) {
    output.raw = {
      sleeper: {
        league: toSerializable(league),
        weeklyStats: toSerializable(rawWeeklyStatsByPlayer),
        seasonStats: toSerializable(seasonStatsByPlayer),
        matchupRows: toSerializable(matchupRows),
        leagueHistory: toSerializable([
          ...(historySnapshots ?? []),
          currentSnapshot,
        ]),
      },
      nfl: toSerializable(nflBundle),
    };
  }

  return toSerializable(output);
}

export function downloadGameWeekExport(payload, filename = 'gridshift-game-week-stats.json') {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
