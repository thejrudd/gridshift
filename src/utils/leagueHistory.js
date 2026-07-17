import {
  getLeagueRosters,
  getLeagueUsers,
  getLosersBracket,
  getMatchups,
  getTransactions,
  getWinnersBracket,
} from '../api/sleeperApi.js';
import { cachedFetch } from './playerCache.js';
import { getNflRegularSeasonStartTimestamp } from './nflSeason.js';

export const LEAGUE_HISTORY_WEEKS = Array.from({ length: 18 }, (_, index) => index + 1);
export const LEAGUE_HISTORY_TRANSACTION_ROUNDS = Array.from({ length: 19 }, (_, index) => index);
export const CURRENT_LEAGUE_HISTORY_TTL = 5 * 60 * 1000;

const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S']);
const OFFENSE_POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const IDP_POSITION_ORDER = ['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S'];

function key(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundScore(value) {
  return Math.round(number(value) * 100) / 100;
}

function matchupScore(row) {
  return roundScore(number(row?.points) + number(row?.custom_points));
}

function teamName(roster, user, rosterId) {
  return String(
    user?.metadata?.team_name
    ?? roster?.metadata?.team_name
    ?? roster?.metadata?.name
    ?? user?.display_name
    ?? user?.username
    ?? `Team ${rosterId}`,
  ).trim();
}

function managerName(user, rosterId) {
  return String(user?.display_name ?? user?.username ?? `Manager ${rosterId}`).trim();
}

export function buildSeasonParticipantIdentities({ season, rosters = [], users = [] } = {}) {
  const usersById = new Map(users.map((user) => [key(user?.user_id), user]).filter(([id]) => id));
  return new Map(rosters.map((roster) => {
    const rosterId = key(roster?.roster_id);
    const ownerId = key(roster?.owner_id);
    const user = ownerId ? usersById.get(ownerId) ?? null : null;
    const participantId = ownerId || `${String(season)}:${rosterId}`;
    return [rosterId, {
      id: participantId,
      userId: ownerId,
      rosterId,
      season: String(season ?? ''),
      managerName: managerName(user, rosterId),
      teamName: teamName(roster, user, rosterId),
      avatarHash: user?.avatar ?? null,
      division: key(roster?.settings?.division),
    }];
  }).filter(([rosterId]) => rosterId));
}

export function aggregateParticipantIdentities(snapshots = []) {
  const participants = new Map();
  [...snapshots]
    .sort((left, right) => Number(left?.season) - Number(right?.season))
    .forEach((snapshot) => {
      const identities = buildSeasonParticipantIdentities(snapshot);
      identities.forEach((identity) => {
        const existing = participants.get(identity.id);
        participants.set(identity.id, {
          ...(existing ?? {}),
          ...identity,
          seasons: [...new Set([...(existing?.seasons ?? []), identity.season])],
          rosterIdsBySeason: {
            ...(existing?.rosterIdsBySeason ?? {}),
            [identity.season]: identity.rosterId,
          },
        });
      });
    });
  return participants;
}

export function getLatestFinalizedWeek(snapshot) {
  const declared = number(snapshot?.league?.settings?.last_scored_leg, 0);
  const available = Object.entries(snapshot?.matchupsByWeek ?? {})
    .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
    .map(([week]) => number(week, 0));
  const latestAvailable = available.length ? Math.max(...available) : 0;
  if (declared > 0) return Math.min(declared, latestAvailable || declared);
  if (snapshot?.completed) return latestAvailable;
  return 0;
}

function buildWeekGames(snapshot, throughWeek = null) {
  const identities = buildSeasonParticipantIdentities(snapshot);
  const games = [];
  Object.entries(snapshot?.matchupsByWeek ?? {})
    .map(([week, rows]) => [number(week), rows])
    .filter(([week]) => week > 0 && (!throughWeek || week <= throughWeek))
    .sort(([left], [right]) => left - right)
    .forEach(([week, rows]) => {
      const groups = new Map();
      (rows ?? []).forEach((row) => {
        const matchupId = key(row?.matchup_id);
        const rosterId = key(row?.roster_id);
        if (!matchupId || !rosterId) return;
        if (!groups.has(matchupId)) groups.set(matchupId, []);
        groups.get(matchupId).push({
          rosterId,
          points: matchupScore(row),
          identity: identities.get(rosterId),
          starters: (row?.starters ?? []).map(key).filter(Boolean),
          players: (row?.players ?? []).map(key).filter(Boolean),
          playerPoints: Object.fromEntries(Object.entries(row?.players_points ?? {}).map(([playerId, points]) => (
            [key(playerId), roundScore(points)]
          )).filter(([playerId]) => playerId)),
        });
      });
      groups.forEach((pair, matchupId) => {
        if (pair.length !== 2 || pair.some((entry) => !entry.identity)) return;
        const [left, right] = pair;
        games.push({
          id: `${snapshot.season}:${week}:${matchupId}`,
          season: String(snapshot.season),
          week,
          left,
          right,
          margin: roundScore(Math.abs(left.points - right.points)),
          tied: left.points === right.points,
          winnerId: left.points === right.points ? null : (left.points > right.points ? left.identity.id : right.identity.id),
          loserId: left.points === right.points ? null : (left.points < right.points ? left.identity.id : right.identity.id),
        });
      });
    });
  return games;
}

function blankStanding(identity) {
  return {
    participantId: identity.id,
    rosterId: identity.rosterId,
    managerName: identity.managerName,
    teamName: identity.teamName,
    division: identity.division,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    recentForm: [],
  };
}

function standingComparator(left, right) {
  const leftGames = left.wins + left.losses + left.ties;
  const rightGames = right.wins + right.losses + right.ties;
  const leftPct = leftGames ? (left.wins + left.ties * 0.5) / leftGames : 0;
  const rightPct = rightGames ? (right.wins + right.ties * 0.5) / rightGames : 0;
  return rightPct - leftPct
    || right.pointsFor - left.pointsFor
    || left.teamName.localeCompare(right.teamName);
}

export function buildSeasonStandings(snapshot, { historical = false } = {}) {
  const identities = buildSeasonParticipantIdentities(snapshot);
  const latestFinalizedWeek = getLatestFinalizedWeek(snapshot);
  const playoffStart = number(snapshot?.league?.settings?.playoff_week_start, 0);
  const throughWeek = historical && playoffStart > 1
    ? Math.min(latestFinalizedWeek, playoffStart - 1)
    : latestFinalizedWeek;
  const rowsById = new Map([...identities.values()].map((identity) => [identity.id, blankStanding(identity)]));
  buildWeekGames(snapshot, throughWeek).forEach((game) => {
    const left = rowsById.get(game.left.identity.id);
    const right = rowsById.get(game.right.identity.id);
    if (!left || !right) return;
    left.pointsFor += game.left.points;
    left.pointsAgainst += game.right.points;
    right.pointsFor += game.right.points;
    right.pointsAgainst += game.left.points;
    if (game.tied) {
      left.ties += 1;
      right.ties += 1;
      left.recentForm.push('T');
      right.recentForm.push('T');
    } else if (game.winnerId === left.participantId) {
      left.wins += 1;
      right.losses += 1;
      left.recentForm.push('W');
      right.recentForm.push('L');
    } else {
      right.wins += 1;
      left.losses += 1;
      right.recentForm.push('W');
      left.recentForm.push('L');
    }
  });

  const rows = [...rowsById.values()].map((row) => ({
    ...row,
    pointsFor: roundScore(row.pointsFor),
    pointsAgainst: roundScore(row.pointsAgainst),
    recentForm: row.recentForm.slice(-5),
  })).sort(standingComparator).map((row, index) => ({ ...row, seed: index + 1 }));
  const divisionGroups = new Map();
  rows.forEach((row) => {
    const id = row.division || 'League';
    if (!divisionGroups.has(id)) divisionGroups.set(id, []);
    divisionGroups.get(id).push(row);
  });
  return {
    season: String(snapshot?.season ?? ''),
    throughWeek,
    playoffTeamCount: Math.max(0, number(snapshot?.league?.settings?.playoff_teams, 0)),
    rows,
    divisions: [...divisionGroups.entries()].sort(([left], [right]) => (
      number(left, Number.MAX_SAFE_INTEGER) - number(right, Number.MAX_SAFE_INTEGER)
      || left.localeCompare(right)
    )).map(([id, divisionRows]) => ({
      id,
      label: getDivisionLabel(snapshot?.league, id),
      rows: [...divisionRows].sort(standingComparator),
    })),
  };
}

function getDivisionLabel(league, id) {
  if (id === 'League') return 'League';
  const metadata = league?.metadata ?? {};
  const label = metadata[`division_${id}`]
    ?? metadata[`division_${id}_name`]
    ?? metadata[`division_name_${id}`]
    ?? null;
  return typeof label === 'string' && label.trim() ? label.trim() : `Division ${id}`;
}

function bracketHasEvidence(bracket = []) {
  return bracket.some((matchup) => (
    directRosterId(matchup?.t1) || directRosterId(matchup?.t2)
    || key(matchup?.w) || key(matchup?.l)
    || bracketSource(matchup, 't1') || bracketSource(matchup, 't2')
    || number(matchup?.p, 0) > 0
  ));
}

function bracketSource(matchup, side) {
  const explicit = matchup?.[`${side}_from`];
  if (explicit && typeof explicit === 'object') return explicit;
  const inline = matchup?.[side];
  return inline && typeof inline === 'object' ? inline : null;
}

function sourceOutcome(source) {
  if (key(source?.l)) return 'l';
  if (key(source?.w)) return 'w';
  return null;
}

function normalizeBracketSource(source) {
  const outcome = sourceOutcome(source);
  const matchupId = outcome ? key(source?.[outcome]) : null;
  return matchupId ? { matchupId, outcome } : null;
}

function inferLosersBracketType(bracket = [], league = {}, normalizedRows = []) {
  const rawPlayoffType = league?.settings?.playoff_type;
  const numericPlayoffType = rawPlayoffType == null ? null : Number(rawPlayoffType);
  if (numericPlayoffType === 0) return 'toilet-bowl';
  if (numericPlayoffType === 1) return 'consolation';

  const explicitType = [
    league?.settings?.playoff_type,
    league?.settings?.losers_bracket_type,
    league?.metadata?.playoff_type,
    league?.metadata?.losers_bracket_type,
    league?.metadata?.toilet_bowl,
  ].find((value) => typeof value === 'string' || value === true);
  if (explicitType === true || /toilet/i.test(String(explicitType ?? ''))) return 'toilet-bowl';
  if (/consolation/i.test(String(explicitType ?? ''))) return 'consolation';

  const championship = (bracket ?? []).find((matchup) => number(matchup?.p, 0) === 1);
  if (championship) {
    const championshipOutcomes = ['t1', 't2']
      .map((side) => sourceOutcome(bracketSource(championship, side)))
      .filter(Boolean);
    if (championshipOutcomes.includes('l')) return 'toilet-bowl';
    if (championshipOutcomes.includes('w')) return 'consolation';
  }

  const sourcedRounds = (bracket ?? [])
    .filter((matchup) => bracketSource(matchup, 't1') || bracketSource(matchup, 't2'))
    .map((matchup) => number(matchup?.r, 0));
  const finalProgressionRound = Math.max(...sourcedRounds, 0);
  const outcomesFor = (matchup) => ['t1', 't2']
    .map((side) => sourceOutcome(bracketSource(matchup, side)))
    .filter(Boolean);
  const progressionOutcomes = (bracket ?? [])
    .filter((matchup) => number(matchup?.r, 0) <= finalProgressionRound)
    .flatMap(outcomesFor);
  const loserSources = progressionOutcomes.filter((outcome) => outcome === 'l').length;
  const winnerSources = progressionOutcomes.filter((outcome) => outcome === 'w').length;
  if (loserSources > winnerSources) return 'toilet-bowl';
  if (winnerSources > loserSources) return 'consolation';

  const advancementSignals = normalizedRows.reduce((signals, matchup) => {
    const expectedWeek = number(league?.settings?.playoff_week_start, 0) + Math.max(0, number(matchup?.round, 0) - 1);
    if (expectedWeek > 0 && matchup.week !== expectedWeek) return signals;
    if (!matchup?.winner?.id || matchup.team1Score == null || matchup.team2Score == null) return signals;
    const advancedScore = matchup.winner.id === matchup.team1?.id
      ? matchup.team1Score
      : matchup.winner.id === matchup.team2?.id
        ? matchup.team2Score
        : null;
    const eliminatedScore = matchup.winner.id === matchup.team1?.id
      ? matchup.team2Score
      : matchup.winner.id === matchup.team2?.id
        ? matchup.team1Score
        : null;
    if (advancedScore == null || eliminatedScore == null || advancedScore === eliminatedScore) return signals;
    if (advancedScore < eliminatedScore) signals.loserAdvances += 1;
    else signals.winnerAdvances += 1;
    return signals;
  }, { loserAdvances: 0, winnerAdvances: 0 });
  if (advancementSignals.loserAdvances > advancementSignals.winnerAdvances) return 'toilet-bowl';
  if (advancementSignals.winnerAdvances > 0) return 'consolation';

  const latestRound = Math.max(...(bracket ?? []).map((matchup) => number(matchup?.r, 0)), 0);
  const terminalTeams = new Set((bracket ?? [])
    .filter((matchup) => number(matchup?.r, 0) === latestRound)
    .flatMap((matchup) => [directRosterId(matchup?.t1), directRosterId(matchup?.t2)])
    .filter(Boolean));
  const priorResults = (bracket ?? [])
    .filter((matchup) => number(matchup?.r, 0) === latestRound - 1);
  const advancedWinners = priorResults.filter((matchup) => terminalTeams.has(key(matchup?.w))).length;
  const advancedLosers = priorResults.filter((matchup) => terminalTeams.has(key(matchup?.l))).length;
  if (advancedLosers > advancedWinners) return 'toilet-bowl';
  if (advancedWinners > 0) return 'consolation';
  return 'losers-bracket';
}

function directRosterId(value) {
  return value && typeof value === 'object' ? null : key(value);
}

function resolveBracketRosterId(matchup, side, matchupsById, seen = new Set()) {
  const directId = directRosterId(matchup?.[side]);
  if (directId) return directId;
  const source = bracketSource(matchup, side);
  const outcome = sourceOutcome(source);
  const sourceMatchId = outcome ? key(source?.[outcome]) : null;
  if (!sourceMatchId || seen.has(sourceMatchId)) return null;
  const sourceMatch = matchupsById.get(sourceMatchId);
  if (!sourceMatch) return null;
  const resultId = directRosterId(sourceMatch?.[outcome]);
  if (resultId) return resultId;
  const nextSeen = new Set(seen);
  nextSeen.add(sourceMatchId);
  return resolveBracketRosterId(sourceMatch, outcome === 'w' ? 't1' : 't2', matchupsById, nextSeen);
}

function findBracketMatchupScores(snapshot, matchup, round, resolvedTeamIds = []) {
  const playoffStart = number(snapshot?.league?.settings?.playoff_week_start, 0);
  const expectedWeek = playoffStart > 0 ? playoffStart + Math.max(0, round - 1) : 0;
  const teamIds = resolvedTeamIds.length
    ? resolvedTeamIds
    : [directRosterId(matchup?.t1), directRosterId(matchup?.t2)].filter(Boolean);
  const weeks = Object.entries(snapshot?.matchupsByWeek ?? {})
    .map(([week, rows]) => [number(week, 0), rows ?? []])
    .filter(([week]) => week > 0)
    .sort(([left], [right]) => {
      if (left === expectedWeek) return -1;
      if (right === expectedWeek) return 1;
      return left - right;
    });

  for (const [week, rows] of weeks) {
    const grouped = new Map();
    rows.forEach((row) => {
      const matchupId = key(row?.matchup_id);
      if (!matchupId) return;
      if (!grouped.has(matchupId)) grouped.set(matchupId, []);
      grouped.get(matchupId).push(row);
    });
    const rawMatchupId = key(matchup?.m);
    const candidates = [
      ...[...grouped.values()].filter((pair) => (
        teamIds.length === 2
        && teamIds.every((teamId) => pair.some((row) => key(row?.roster_id) === teamId))
      )),
      ...(rawMatchupId && grouped.has(rawMatchupId) ? [grouped.get(rawMatchupId)] : []),
    ];
    const pair = candidates.find((rowsForMatchup) => rowsForMatchup?.length >= 2);
    if (!pair) continue;
    return {
      week,
      byRosterId: new Map(pair.map((row) => [key(row?.roster_id), matchupScore(row)])),
    };
  }
  return { week: expectedWeek || null, byRosterId: new Map() };
}

function collectChampionshipMatchIds(rows = []) {
  const matchupsById = new Map(rows
    .map((matchup) => [key(matchup?.m), matchup])
    .filter(([matchupId]) => matchupId));
  const final = rows.find((matchup) => number(matchup?.p, 0) === 1);
  if (!final) {
    return new Set(rows
      .filter((matchup) => number(matchup?.p, 0) <= 3)
      .map((matchup) => key(matchup?.m))
      .filter(Boolean));
  }

  const championshipIds = new Set();
  const visit = (matchup) => {
    const matchupId = key(matchup?.m);
    if (!matchupId || championshipIds.has(matchupId)) return;
    championshipIds.add(matchupId);
    ['t1', 't2'].forEach((side) => {
      const source = bracketSource(matchup, side);
      const outcome = sourceOutcome(source);
      const sourceMatchId = outcome ? key(source?.[outcome]) : null;
      if (sourceMatchId) visit(matchupsById.get(sourceMatchId));
    });
  };
  visit(final);
  return championshipIds;
}

function addBracketByeNodes(normalizedRows, seeds, playoffStart) {
  const matchupsById = new Map((normalizedRows ?? []).map((matchup) => [matchup.id, matchup]));
  const bracketRounds = (normalizedRows ?? []).map((matchup) => matchup.round).filter((round) => round > 0);
  const firstRound = bracketRounds.length > 0 ? Math.min(...bracketRounds) : 1;
  const byes = [];

  const rows = (normalizedRows ?? []).map((matchup) => {
    if (matchup.round <= firstRound) return matchup;
    const nextMatchup = { ...matchup };

    ['team1', 'team2'].forEach((teamKey) => {
      const sourceKey = `${teamKey}Source`;
      const opposingSourceKey = teamKey === 'team1' ? 'team2Source' : 'team1Source';
      const team = matchup[teamKey];
      const opposingSource = matchup[opposingSourceKey];
      const sourceMatch = opposingSource ? matchupsById.get(opposingSource.matchupId) : null;
      if (!team || matchup[sourceKey] || sourceMatch?.round !== matchup.round - 1) return;

      const byeId = `bye:${matchup.id}:${teamKey}`;
      byes.push({
        id: byeId,
        round: matchup.round - 1,
        week: playoffStart > 0 ? playoffStart + matchup.round - 2 : null,
        placement: null,
        team1: team,
        team2: null,
        team1Seed: seeds.get(team.id) ?? null,
        team2Seed: null,
        team1Score: null,
        team2Score: null,
        winner: team,
        loser: null,
        team1Source: null,
        team2Source: null,
        isBye: true,
      });
      nextMatchup[sourceKey] = { matchupId: byeId, outcome: 'w', synthetic: true };
    });
    return nextMatchup;
  });

  return [...rows, ...byes.filter((bye, index) => byes.findIndex((candidate) => candidate.id === bye.id) === index)]
    .sort((left, right) => left.round - right.round || Number(Boolean(right.isBye)) - Number(Boolean(left.isBye)) || left.id.localeCompare(right.id));
}

export function normalizeSeasonBrackets(snapshot) {
  const identities = buildSeasonParticipantIdentities(snapshot);
  const standings = buildSeasonStandings(snapshot, { historical: true });
  const seeds = new Map(standings.rows.map((row) => [row.participantId, row.seed]));
  const normalize = (rows) => {
    const matchupsById = new Map((rows ?? [])
      .map((matchup) => [key(matchup?.m), matchup])
      .filter(([matchupId]) => matchupId));
    return (rows ?? []).map((matchup) => {
    const round = number(matchup?.r, 0);
    const team1RosterId = resolveBracketRosterId(matchup, 't1', matchupsById);
    const team2RosterId = resolveBracketRosterId(matchup, 't2', matchupsById);
    const team1 = identities.get(team1RosterId) ?? null;
    const team2 = identities.get(team2RosterId) ?? null;
    const scores = findBracketMatchupScores(snapshot, matchup, round, [team1RosterId, team2RosterId].filter(Boolean));
    return {
      id: key(matchup?.m) ?? `${matchup?.r ?? 0}:${matchup?.p ?? 0}`,
      round,
      week: scores.week,
      placement: number(matchup?.p, 0) || null,
      team1,
      team2,
      team1Seed: seeds.get(team1?.id) ?? null,
      team2Seed: seeds.get(team2?.id) ?? null,
      team1Score: scores.byRosterId.get(team1RosterId) ?? null,
      team2Score: scores.byRosterId.get(team2RosterId) ?? null,
      winner: identities.get(key(matchup?.w)) ?? null,
      loser: identities.get(key(matchup?.l)) ?? null,
      team1Source: normalizeBracketSource(bracketSource(matchup, 't1')),
      team2Source: normalizeBracketSource(bracketSource(matchup, 't2')),
    };
    });
  };
  const normalizedWinners = bracketHasEvidence(snapshot?.winnersBracket) ? normalize(snapshot.winnersBracket) : [];
  const championshipMatchIds = collectChampionshipMatchIds(snapshot?.winnersBracket ?? []);
  const championshipRows = normalizedWinners.filter((matchup) => (
    championshipMatchIds.has(matchup.id) || matchup.placement === 3
  ));
  const championship = addBracketByeNodes(
    championshipRows,
    seeds,
    number(snapshot?.league?.settings?.playoff_week_start, 0),
  );

  const normalizedLosers = bracketHasEvidence(snapshot?.losersBracket) ? normalize(snapshot.losersBracket) : [];
  const losersBracketType = inferLosersBracketType(snapshot?.losersBracket, snapshot?.league, normalizedLosers);
  const totalRosters = number(snapshot?.league?.total_rosters, 0) || (snapshot?.rosters ?? []).length;
  const displayedLosers = losersBracketType === 'toilet-bowl' && totalRosters > 0
    ? normalizedLosers.map((matchup) => ({
      ...matchup,
      bracketPlacement: matchup.placement,
      placement: matchup.placement == null ? null : totalRosters - matchup.placement + 1,
    }))
    : normalizedLosers;
  const consolation = addBracketByeNodes(
    displayedLosers,
    seeds,
    number(snapshot?.league?.settings?.playoff_week_start, 0),
  );
  return {
    championship,
    championshipPlacement: normalizedWinners.filter((matchup) => (
      !championshipMatchIds.has(matchup.id) && matchup.placement !== 3
    )),
    consolation,
    hasChampionship: championshipMatchIds.size > 0,
    hasConsolation: consolation.length > 0,
    losersBracketType,
  };
}

export function getSeasonChampion(snapshot) {
  if (!snapshot?.completed) return null;
  const brackets = normalizeSeasonBrackets(snapshot);
  const championship = brackets.championship.find((matchup) => matchup.placement === 1 && matchup.winner)
    ?? [...brackets.championship].sort((left, right) => right.round - left.round).find((matchup) => matchup.winner)
    ?? null;
  if (championship?.winner) {
    return {
      season: String(snapshot.season),
      participant: championship.winner,
      runnerUp: championship.loser ?? null,
      matchup: championship,
    };
  }
  const standings = buildSeasonStandings(snapshot, { historical: true });
  return standings.rows[0] ? { season: String(snapshot.season), participant: standings.rows[0] } : null;
}

function transactionRosterIds(transaction) {
  const ids = new Set((transaction?.roster_ids ?? []).map(key).filter(Boolean));
  Object.values(transaction?.adds ?? {}).map(key).filter(Boolean).forEach((id) => ids.add(id));
  Object.values(transaction?.drops ?? {}).map(key).filter(Boolean).forEach((id) => ids.add(id));
  return ids;
}

export function buildLeagueHistoryModel(snapshots = [], players = {}) {
  const participants = aggregateParticipantIdentities(snapshots);
  const leaderboard = new Map([...participants.values()].map((participant) => [participant.id, {
    ...participant,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    games: 0,
  }]));
  const rivalryMap = new Map();
  const scoreEvents = [];
  const completedGames = [];
  const tradeCounts = new Map();
  const waiverAdds = new Map();
  const starterScoreEvents = [];
  const benchScoreEvents = [];
  const benchTotalEvents = [];
  const starterShareEvents = [];

  snapshots.forEach((snapshot) => {
    const identities = buildSeasonParticipantIdentities(snapshot);
    const games = buildWeekGames(snapshot, getLatestFinalizedWeek(snapshot));
    games.forEach((game) => {
      completedGames.push(game);
      [game.left, game.right].forEach((side) => {
        const opponent = side === game.left ? game.right : game.left;
        const row = leaderboard.get(side.identity.id);
        if (!row) return;
        row.games += 1;
        row.pointsFor += side.points;
        row.pointsAgainst += opponent.points;
        if (game.tied) row.ties += 1;
        else if (game.winnerId === side.identity.id) row.wins += 1;
        else row.losses += 1;
        scoreEvents.push({
          participant: side.identity,
          rosterId: side.rosterId,
          score: side.points,
          season: game.season,
          week: game.week,
        });
        const starterIds = new Set(side.starters);
        const playerScoreEntries = Object.entries(side.playerPoints);
        playerScoreEntries.forEach(([playerId, score]) => {
          const event = {
            participant: side.identity,
            rosterId: side.rosterId,
            playerId,
            playerName: getPlayerLabel(players[playerId], playerId),
            score,
            season: game.season,
            week: game.week,
          };
          if (starterIds.has(playerId)) {
            starterScoreEvents.push(event);
            if (side.points > 0) starterShareEvents.push({ ...event, share: (score / side.points) * 100 });
          } else {
            benchScoreEvents.push(event);
          }
        });
        if (playerScoreEntries.length > 0) {
          const benchPoints = playerScoreEntries
            .filter(([playerId]) => !starterIds.has(playerId))
            .reduce((total, [, score]) => total + score, 0);
          benchTotalEvents.push({
            participant: side.identity,
            rosterId: side.rosterId,
            score: roundScore(benchPoints),
            season: game.season,
            week: game.week,
          });
        }
      });
      const pairIds = [game.left.identity.id, game.right.identity.id].sort();
      const rivalryKey = pairIds.join(':');
      if (!rivalryMap.has(rivalryKey)) {
        rivalryMap.set(rivalryKey, {
          id: rivalryKey,
          participants: pairIds.map((id) => participants.get(id)),
          games: 0,
          ties: 0,
          winsByParticipantId: Object.fromEntries(pairIds.map((id) => [id, 0])),
        });
      }
      const rivalry = rivalryMap.get(rivalryKey);
      rivalry.games += 1;
      if (game.tied) rivalry.ties += 1;
      else rivalry.winsByParticipantId[game.winnerId] += 1;
    });

    (snapshot?.transactions ?? []).filter((transaction) => transaction?.status === 'complete').forEach((transaction) => {
      const rosterIds = transactionRosterIds(transaction);
      if (transaction.type === 'trade') {
        rosterIds.forEach((rosterId) => {
          const participantId = identities.get(rosterId)?.id;
          if (participantId) tradeCounts.set(participantId, (tradeCounts.get(participantId) ?? 0) + 1);
        });
      }
      if (transaction.type === 'waiver' || transaction.type === 'free_agent') {
        Object.values(transaction?.adds ?? {}).map(key).filter(Boolean).forEach((rosterId) => {
          const participantId = identities.get(rosterId)?.id;
          if (participantId) waiverAdds.set(participantId, (waiverAdds.get(participantId) ?? 0) + 1);
        });
      }
    });
  });

  const streaks = new Map();
  const bestStreaks = new Map();
  completedGames.sort((left, right) => Number(left.season) - Number(right.season) || left.week - right.week).forEach((game) => {
    [game.left.identity.id, game.right.identity.id].forEach((participantId) => {
      const won = game.winnerId === participantId;
      const next = won ? (streaks.get(participantId) ?? 0) + 1 : 0;
      streaks.set(participantId, next);
      bestStreaks.set(participantId, Math.max(bestStreaks.get(participantId) ?? 0, next));
    });
  });

  const topCounter = (counts) => {
    const entry = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    return entry ? { participant: participants.get(entry[0]), value: entry[1] } : null;
  };
  const decisiveGames = completedGames.filter((game) => !game.tied);
  const biggest = [...decisiveGames].sort((left, right) => right.margin - left.margin)[0] ?? null;
  const narrowest = [...decisiveGames].sort((left, right) => left.margin - right.margin)[0] ?? null;
  const highest = [...scoreEvents].sort((left, right) => right.score - left.score)[0] ?? null;
  const lowest = [...scoreEvents].sort((left, right) => left.score - right.score)[0] ?? null;
  const winningScores = decisiveGames.map((game) => (
    game.left.identity.id === game.winnerId ? { ...game.left, season: game.season, week: game.week } : { ...game.right, season: game.season, week: game.week }
  ));
  const losingScores = decisiveGames.map((game) => (
    game.left.identity.id === game.loserId ? { ...game.left, season: game.season, week: game.week } : { ...game.right, season: game.season, week: game.week }
  ));
  const lowestWinningScore = [...winningScores].sort((left, right) => left.points - right.points)[0] ?? null;
  const highestLosingScore = [...losingScores].sort((left, right) => right.points - left.points)[0] ?? null;
  const highestCombinedScore = completedGames
    .map((game) => ({ ...game, value: roundScore(game.left.points + game.right.points) }))
    .sort((left, right) => right.value - left.value)[0] ?? null;
  const highestStarterScore = [...starterScoreEvents].sort((left, right) => right.score - left.score)[0] ?? null;
  const highestBenchScore = [...benchScoreEvents].sort((left, right) => right.score - left.score)[0] ?? null;
  const mostBenchPoints = [...benchTotalEvents].sort((left, right) => right.score - left.score)[0] ?? null;
  const largestStarterShare = [...starterShareEvents].sort((left, right) => right.share - left.share)[0] ?? null;

  return {
    participants,
    leaderboard: [...leaderboard.values()].map((row) => ({
      ...row,
      pointsFor: roundScore(row.pointsFor),
      pointsAgainst: roundScore(row.pointsAgainst),
    })).sort((left, right) => right.wins - left.wins || right.pointsFor - left.pointsFor),
    champions: snapshots.map(getSeasonChampion).filter(Boolean).sort((left, right) => Number(right.season) - Number(left.season)),
    rivalries: [...rivalryMap.values()].sort((left, right) => right.games - left.games || left.id.localeCompare(right.id)),
    records: {
      highestScore: highest,
      highestLosingScore,
      lowestWinningScore,
      lowestScore: lowest,
      highestCombinedScore,
      biggestBlowout: biggest ? { ...biggest, value: biggest.margin } : null,
      narrowestWin: narrowest ? { ...narrowest, value: narrowest.margin } : null,
      highestStarterScore,
      highestBenchScore,
      mostBenchPoints,
      largestStarterShare,
      longestWinStreak: topCounter(bestStreaks),
      mostTrades: topCounter(tradeCounts),
      mostWaiverAdds: topCounter(waiverAdds),
    },
  };
}

function getPlayerLabel(player, playerId) {
  return String(player?.full_name ?? [player?.first_name, player?.last_name].filter(Boolean).join(' ') ?? '').trim() || `Player ${playerId}`;
}

function normalizeActivityPlayer(playerId, rosterId, players, identities) {
  const player = players[playerId] ?? {};
  return {
    playerId,
    playerName: getPlayerLabel(player, playerId),
    position: key(player.position ?? player.fantasy_positions?.[0])?.toUpperCase() ?? null,
    nflTeam: key(player.team)?.toUpperCase() ?? null,
    espnId: key(player.espn_id),
    rosterId: key(rosterId),
    team: identities.get(key(rosterId)) ?? null,
  };
}

export function normalizeActivityTransaction({ transaction, snapshot, players = {} } = {}) {
  if (!transaction || transaction.status !== 'complete') return null;
  const supported = new Set(['trade', 'waiver', 'free_agent', 'commissioner']);
  if (!supported.has(transaction.type)) return null;
  const identities = buildSeasonParticipantIdentities(snapshot);
  const rosterIds = [...transactionRosterIds(transaction)];
  const teams = rosterIds.map((rosterId) => identities.get(rosterId)).filter(Boolean);
  const adds = Object.entries(transaction.adds ?? {}).map(([playerId, rosterId]) => (
    normalizeActivityPlayer(playerId, rosterId, players, identities)
  ));
  const drops = Object.entries(transaction.drops ?? {}).map(([playerId, rosterId]) => (
    normalizeActivityPlayer(playerId, rosterId, players, identities)
  ));
  const timestamp = number(transaction.status_updated ?? transaction.created, 0);
  const transactionWeek = number(transaction.leg, 0);
  const isRegularSeason = timestamp >= getNflRegularSeasonStartTimestamp(snapshot?.season);
  const labels = {
    trade: 'Trade completed',
    waiver: 'Waiver claim processed',
    free_agent: 'Free-agent move',
    commissioner: 'Commissioner action',
  };
  return {
    id: key(transaction.transaction_id) ?? `${snapshot?.season}:${timestamp}:${transaction.type}`,
    season: String(snapshot?.season ?? ''),
    type: transaction.type,
    label: labels[transaction.type],
    timestamp,
    week: isRegularSeason && transactionWeek > 0 ? transactionWeek : null,
    teams,
    adds,
    drops,
    draftPicks: (transaction.draft_picks ?? []).map((pick) => ({
      ...pick,
      team: identities.get(key(pick?.owner_id)) ?? null,
      originalTeam: identities.get(key(pick?.roster_id)) ?? null,
    })),
    waiverBudget: transaction.waiver_budget ?? [],
    creator: key(transaction.creator),
  };
}

export function buildActivitySeasonGroups(snapshots = [], players = {}) {
  return snapshots.map((snapshot) => ({
    season: String(snapshot.season),
    entries: (snapshot.transactions ?? [])
      .map((transaction) => normalizeActivityTransaction({ transaction, snapshot, players }))
      .filter(Boolean)
      .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id)),
  })).sort((left, right) => Number(right.season) - Number(left.season));
}

export function buildDraftBlueprintSummaries({ picks = [], rosters = [], users = [], draft = null, league = {}, players = {}, myRosterId = null, myUserId = null } = {}) {
  const rosterSlots = new Set(league?.roster_positions ?? []);
  const isIdp = [...rosterSlots].some((position) => IDP_POSITIONS.has(String(position).toUpperCase()) || String(position).toUpperCase() === 'IDP_FLEX');
  const usersById = new Map(users.map((user) => [key(user?.user_id), user]).filter(([id]) => id));
  const rostersById = new Map(rosters.map((roster) => [key(roster?.roster_id), roster]).filter(([id]) => id));
  const draftOrder = draft?.draft_order && typeof draft.draft_order === 'object' ? draft.draft_order : null;
  const hasDraftOrder = Boolean(draftOrder && Object.keys(draftOrder).length > 0);
  const summaries = new Map();
  const ensure = (rosterId) => {
    const normalizedRosterId = key(rosterId);
    if (!normalizedRosterId) return null;
    if (!summaries.has(normalizedRosterId)) {
      const roster = rostersById.get(normalizedRosterId) ?? null;
      const user = usersById.get(key(roster?.owner_id)) ?? null;
      summaries.set(normalizedRosterId, {
        rosterId: normalizedRosterId,
        teamName: teamName(roster, user, normalizedRosterId),
        managerName: managerName(user, normalizedRosterId),
        isMine: normalizedRosterId === key(myRosterId),
        pickCount: 0,
        positionCounts: {},
        picks: [],
        earlyPicks: [],
        firstRoundPick: null,
      });
    }
    return summaries.get(normalizedRosterId);
  };
  rosters.forEach((roster) => ensure(roster.roster_id));
  picks.forEach((pick) => {
    const rosterId = key(pick?.rosterId ?? pick?.roster_id);
    const summary = ensure(rosterId);
    if (!summary) return;
    const pickedBy = key(pick?.pickedBy ?? pick?.picked_by);
    const reliablePickedBy = pickedBy && (!hasDraftOrder || Object.prototype.hasOwnProperty.call(draftOrder, pickedBy));
    if (reliablePickedBy && !summary.draftManagerId) {
      const roster = rostersById.get(rosterId) ?? null;
      const draftUser = usersById.get(pickedBy) ?? null;
      summary.draftManagerId = pickedBy;
      summary.teamName = String(
        draftUser?.metadata?.team_name
        ?? draftUser?.display_name
        ?? draftUser?.username
        ?? teamName(roster, draftUser, rosterId),
      ).trim();
      summary.managerName = managerName(draftUser, rosterId);
      if (key(myUserId)) summary.isMine = pickedBy === key(myUserId);
    } else if (!reliablePickedBy && !summary.draftManagerId) {
      summary.teamName = `Roster ${rosterId}`;
      summary.managerName = 'Draft manager unavailable';
      summary.isMine = false;
    }
    const playerId = key(pick?.playerId ?? pick?.player_id ?? pick?.metadata?.player_id);
    const player = players?.[playerId] ?? null;
    let position = String(player?.position ?? player?.fantasy_positions?.[0] ?? pick?.metadata?.position ?? 'OTHER').toUpperCase();
    if (!isIdp && IDP_POSITIONS.has(position)) return;
    if (isIdp && position === 'DEF') position = 'DL';
    summary.pickCount += 1;
    summary.positionCounts[position] = (summary.positionCounts[position] ?? 0) + 1;
    const round = number(pick?.round, Math.ceil(number(pick?.overall ?? pick?.pick_no, 0) / Math.max(1, rosters.length)));
    summary.picks.push({
      playerId,
      playerName: getPlayerLabel(player ?? pick?.metadata, playerId),
      position,
      nflTeam: key(player?.team ?? pick?.metadata?.team)?.toUpperCase() ?? null,
      round,
      overall: number(pick?.overall ?? pick?.pick_no, 0) || null,
      pickLabel: pick?.pickLabel ?? pick?.pick_no ?? pick?.overall ?? null,
    });
  });
  summaries.forEach((summary) => {
    summary.picks.sort((left, right) => (
      left.round - right.round
      || (left.overall ?? Number.MAX_SAFE_INTEGER) - (right.overall ?? Number.MAX_SAFE_INTEGER)
      || left.playerName.localeCompare(right.playerName)
    ));
    summary.firstRoundPick = summary.picks.find((pick) => pick.round === 1) ?? null;
    summary.earlyPicks = summary.picks.filter((pick) => pick.round <= 3);
  });
  const positionOrder = [...OFFENSE_POSITION_ORDER, ...(isIdp ? IDP_POSITION_ORDER : [])];
  return {
    isIdp,
    positions: [...new Set(positionOrder.filter((position) => [...summaries.values()].some((summary) => summary.positionCounts[position])))],
    teams: [...summaries.values()].filter((summary) => summary.pickCount > 0).sort((left, right) => {
      if (left.isMine) return -1;
      if (right.isMine) return 1;
      return left.teamName.localeCompare(right.teamName);
    }),
  };
}

async function safeFetch(fetcher) {
  try {
    const value = await fetcher();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function fetchLeagueHistorySnapshot({ league, season, completed = false }) {
  const leagueId = key(league?.league_id);
  if (!leagueId) throw new Error('League history is missing a Sleeper league ID.');
  const lastScoredLeg = number(league?.settings?.last_scored_leg, 0);
  const matchupWeeks = completed
    ? LEAGUE_HISTORY_WEEKS
    : LEAGUE_HISTORY_WEEKS.filter((week) => week <= Math.max(1, lastScoredLeg));
  const [rosters, users, matchupRows, transactionRows, winnersBracket, losersBracket] = await Promise.all([
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    Promise.all(matchupWeeks.map((week) => safeFetch(() => getMatchups(leagueId, week)))),
    Promise.all(LEAGUE_HISTORY_TRANSACTION_ROUNDS.map((round) => safeFetch(() => getTransactions(leagueId, round)))),
    safeFetch(() => getWinnersBracket(leagueId)),
    safeFetch(() => getLosersBracket(leagueId)),
  ]);
  const transactionsById = new Map();
  transactionRows.flat().forEach((transaction) => {
    const id = key(transaction?.transaction_id);
    if (id) transactionsById.set(id, transaction);
  });
  return {
    leagueId,
    league,
    season: String(season ?? league?.season ?? ''),
    completed,
    rosters: Array.isArray(rosters) ? rosters : [],
    users: Array.isArray(users) ? users : [],
    matchupsByWeek: Object.fromEntries(matchupWeeks.map((week, index) => [week, matchupRows[index] ?? []])),
    transactions: [...transactionsById.values()],
    winnersBracket,
    losersBracket,
  };
}

export function getLeagueHistorySnapshot({ league, season, completed = false }) {
  const ttl = completed ? Infinity : CURRENT_LEAGUE_HISTORY_TTL;
  return cachedFetch(
    `league-history:v1:${league?.league_id}:${season}`,
    () => fetchLeagueHistorySnapshot({ league, season, completed }),
    ttl,
  );
}
