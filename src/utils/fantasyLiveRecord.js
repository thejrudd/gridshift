import {
  getOfficialMatchupRowPoints,
  getSleeperPlayerName,
  getTeamAbbr,
  hasReconciledMatchup,
  isCompleteScheduleWeek,
} from './liveScoringFeed.js';
import { hasFinalMatchupGameEvidence } from './matchupWinProbability.js';

function getRosterId(row) {
  const rosterId = Number(row?.roster_id);
  return Number.isFinite(rosterId) ? rosterId : null;
}

function getStarterIds(row) {
  return (row?.starters ?? [])
    .map((id) => String(id))
    .filter((id) => id && id !== '0');
}

function getWeekSchedule(scheduleMap, week) {
  return scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? null;
}

function getRosterPoints(row) {
  const official = getOfficialMatchupRowPoints(row);
  if (official != null) return official;

  const playerPoints = row?.players_points ?? {};
  const starterPoints = getStarterIds(row).reduce((sum, id) => {
    const points = Number(playerPoints[id]);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0);
  const customPoints = Number(row?.custom_points);
  return starterPoints + (Number.isFinite(customPoints) ? customPoints : 0);
}

function buildFinalityPlayers(groupRows, scheduleWeek, players) {
  const scheduleWeekComplete = isCompleteScheduleWeek(scheduleWeek);
  return groupRows.flatMap((row) => getStarterIds(row).map((id) => {
    const player = players?.[id];
    const team = getTeamAbbr(player?.team);
    const scheduleEntry = team ? scheduleWeek?.[team] ?? null : null;
    return {
      id,
      name: getSleeperPlayerName(player),
      scheduleEntry,
      isBye: scheduleWeekComplete && !scheduleEntry,
    };
  }));
}

/**
 * A Live record is allowed to advance only after the selected matchup has
 * both final game evidence for every non-bye starter and complete official
 * Sleeper starter points. A partial current-week score is never enough.
 */
export function isSettledFantasyLiveMatchup(
  groupRows = [],
  { scheduleWeek = null, players = null, now = Date.now() } = {},
) {
  const matchupId = groupRows[0]?.matchup_id;
  if (matchupId == null || groupRows.length !== 2) return false;
  if (!hasReconciledMatchup(groupRows, matchupId)) return false;

  return hasFinalMatchupGameEvidence(
    buildFinalityPlayers(groupRows, scheduleWeek, players),
    {
      scheduleWeekComplete: isCompleteScheduleWeek(scheduleWeek),
      now,
    },
  );
}

function addRosterResult(totals, rosterId, result) {
  if (rosterId == null) return;
  const current = totals.get(rosterId) ?? {
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    losses: 0,
    ties: 0,
  };
  totals.set(rosterId, {
    pointsFor: current.pointsFor + result.pointsFor,
    pointsAgainst: current.pointsAgainst + result.pointsAgainst,
    wins: current.wins + result.wins,
    losses: current.losses + result.losses,
    ties: current.ties + result.ties,
  });
}

/**
 * Builds the cumulative record shown by Fantasy Live from settled matchup
 * rows. The current week is included only if this selected matchup has
 * independently proven finality; otherwise it contributes nothing.
 */
export function buildFantasyLiveRosterResults({
  matchupsByWeek = {},
  throughWeek = null,
  scheduleMap = null,
  players = null,
  now = Date.now(),
} = {}) {
  const totals = new Map();
  const currentWeek = Number(throughWeek);
  if (!Number.isInteger(currentWeek) || currentWeek < 1) return totals;

  for (let week = 1; week <= currentWeek; week += 1) {
    const groups = new Map();
    (matchupsByWeek?.[week] ?? []).forEach((row) => {
      if (row?.matchup_id == null) return;
      const key = Number(row.matchup_id);
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    });

    groups.forEach((groupRows) => {
      const scheduleWeek = getWeekSchedule(scheduleMap, week);
      if (!isSettledFantasyLiveMatchup(groupRows, { scheduleWeek, players, now })) return;

      const scoringRows = groupRows
        .map((row) => ({ rosterId: getRosterId(row), pointsFor: getRosterPoints(row) }))
        .filter((row) => row.rosterId != null && Number.isFinite(row.pointsFor));
      if (scoringRows.length < 2) return;

      scoringRows.forEach((row) => {
        const opponents = scoringRows.filter((other) => other.rosterId !== row.rosterId);
        const pointsAgainst = opponents.reduce((sum, other) => sum + other.pointsFor, 0);
        const opponentHigh = Math.max(...opponents.map((other) => other.pointsFor));
        addRosterResult(totals, row.rosterId, {
          pointsFor: row.pointsFor,
          pointsAgainst,
          wins: row.pointsFor > opponentHigh ? 1 : 0,
          losses: row.pointsFor < opponentHigh ? 1 : 0,
          ties: row.pointsFor === opponentHigh ? 1 : 0,
        });
      });
    });
  }

  return totals;
}
