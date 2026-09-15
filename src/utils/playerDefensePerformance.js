import { calcPoints } from './scoringEngine.js';
import { getCachedOffenseAllowedTable, getHeatmapPlayerGameTeam } from './fantasyHeatmapData.js';
import { isFullGameWeekComplete } from './matchupTaleOfTape.js';

const METRICS = [
  {
    id: 'receiving',
    statMode: 'rec_yd',
    label: 'Receiving defense',
    definition: 'Receiving yards allowed per completed game to all offensive players. Lower values indicate a stronger receiving defense.',
  },
  {
    id: 'rushing',
    statMode: 'rush_yd',
    label: 'Rushing defense',
    definition: 'Rushing yards allowed per completed game to all offensive players. Lower values indicate a stronger rushing defense.',
  },
];

const BUCKETS = [
  { id: 'strong', label: 'Strongest quarter' },
  { id: 'middle', label: 'Middle half' },
  { id: 'weak', label: 'Weakest quarter' },
];

const OFFENSIVE_INSIGHT_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const COMMON_RANK_STATS = {
  QB: [['pass_yd', 'Passing yards'], ['pass_td', 'Passing TDs'], ['rush_yd', 'Rushing yards']],
  RB: [['rush_yd', 'Rushing yards'], ['rec_yd', 'Receiving yards'], ['rush_td', 'Rushing TDs']],
  WR: [['rec_yd', 'Receiving yards'], ['rec', 'Receptions'], ['rec_td', 'Receiving TDs']],
  TE: [['rec_yd', 'Receiving yards'], ['rec', 'Receptions'], ['rec_td', 'Receiving TDs']],
  K: [['fgm', 'Field goals'], ['xpm', 'Extra points']],
};

function asWeek(value) {
  if (value == null || value === '') return null;
  const week = Number(value);
  return Number.isFinite(week) ? week : null;
}

function normalizedTeam(value) {
  const team = String(value ?? '').trim().toUpperCase();
  return team || null;
}

function normalizedPosition(value) {
  const position = String(value ?? '').trim().toUpperCase();
  if (['DL', 'DE', 'DT'].includes(position)) return 'DL';
  if (['LB', 'ILB', 'OLB'].includes(position)) return 'LB';
  if (['DB', 'CB', 'S', 'SS', 'FS'].includes(position)) return 'DB';
  return position || null;
}

function getCompletedWeeks(scheduleMap, completedWeeks, currentWeek = null) {
  if (Array.isArray(completedWeeks)) {
    return [...new Set(completedWeeks.map(asWeek).filter(week => week != null))].sort((a, b) => a - b);
  }

  const weeks = Object.keys(scheduleMap ?? {})
    .map(asWeek)
    .filter(week => week != null && isFullGameWeekComplete(scheduleMap?.[week] ?? scheduleMap?.[String(week)]))
    .sort((a, b) => a - b);
  const partialWeek = asWeek(currentWeek);
  if (partialWeek != null && !weeks.includes(partialWeek)) {
    const games = scheduleMap?.[partialWeek] ?? scheduleMap?.[String(partialWeek)] ?? {};
    const hasCompletedGame = Object.values(games).some(game => game?.completed === true || /final|post|completed/i.test(String(game?.status ?? game?.state ?? '')));
    if (hasCompletedGame) weeks.push(partialWeek);
  }
  return weeks.sort((a, b) => a - b);
}

function summarizeGameRows(gameRows) {
  const points = gameRows.reduce((total, row) => total + row.points, 0);
  return {
    games: gameRows.length,
    points,
    ppg: gameRows.length ? points / gameRows.length : null,
    gameRows: gameRows.slice().sort((left, right) => left.week - right.week),
  };
}

function buildCommonStatRanks(playerId, position, players, weeklyStats, completedWeekSet) {
  const definitions = COMMON_RANK_STATS[position] ?? [];
  return definitions.map(([key, label]) => {
    const summaries = Object.entries(players).filter(([, candidate]) => normalizedPosition(candidate?.position) === position).map(([candidateId]) => {
      const rows = (weeklyStats?.[candidateId] ?? []).filter(row => completedWeekSet.has(asWeek(row?.week)) && Number(row?.gp ?? 1) !== 0 && row?.[key] != null);
      const total = rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
      return { playerId: String(candidateId), games: rows.length, value: rows.length ? total / rows.length : null };
    }).filter(summary => summary.value != null);
    const ranked = summaries.slice().sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
    const target = ranked.findIndex(row => row.playerId === String(playerId));
    return { key, label, rank: target >= 0 ? target + 1 : null, peerCount: ranked.length, ppg: target >= 0 ? ranked[target].value : null, games: target >= 0 ? summaries.find(row => row.playerId === String(playerId))?.games ?? 0 : 0 };
  });
}

function buildRankMap(peerSummaries, minGames) {
  const eligible = peerSummaries
    .filter(summary => summary.games >= minGames && Number.isFinite(summary.ppg))
    .sort((left, right) => right.ppg - left.ppg || String(left.playerId).localeCompare(String(right.playerId)));
  const ranks = new Map();
  let previousPpg = null;
  let rank = 0;
  eligible.forEach((summary, index) => {
    if (previousPpg == null || summary.ppg !== previousPpg) rank = index + 1;
    ranks.set(String(summary.playerId), rank);
    previousPpg = summary.ppg;
  });
  return { ranks, peerCount: eligible.length };
}

function hasVerifiedQuarterbackStarterMetadata(player, playerWeeks, completedWeekSet = null) {
  const depthVerified = Number(player?.depth_chart_order) === 1
    && normalizedPosition(player?.depth_chart_position) === 'QB';
  if (depthVerified) return true;
  return (playerWeeks ?? []).some((week) => {
    if (completedWeekSet && !completedWeekSet.has(asWeek(week?.week))) return false;
    return [week?.gs, week?.games_started].some((value) => {
      const starts = Number(value);
      return Number.isFinite(starts) && starts > 0;
    });
  });
}

function buildPlayerGameRows(playerId, player, weeklyStats, scheduleMap, completedWeekSet, scoringSettings) {
  const playerWeeks = Array.isArray(weeklyStats?.[playerId]) ? weeklyStats[playerId] : [];
  const rows = [];
  for (const wEntry of playerWeeks) {
    const week = asWeek(wEntry?.week);
    if (week == null || !completedWeekSet.has(week) || (wEntry.gp != null && Number(wEntry.gp) === 0)) continue;
    const team = getHeatmapPlayerGameTeam(wEntry, player, playerWeeks);
    const opponent = team
      ? normalizedTeam(scheduleMap?.[week]?.[team]?.opp ?? scheduleMap?.[String(week)]?.[team]?.opp)
      : null;
    if (!opponent || opponent === team) continue;
    const points = Number(calcPoints(wEntry, scoringSettings, player?.position));
    if (!Number.isFinite(points)) continue;
    rows.push({ week, team, opponent, points });
  }
  return rows;
}

function buildDefenseRows({ metric, completedWeeks, weeklyStats, players, scheduleMap, scoringSettings }) {
  const offenseTable = getCachedOffenseAllowedTable(
    weeklyStats,
    players,
    scheduleMap,
    scoringSettings,
    metric.statMode,
  );
  const rowsByTeam = new Map();

  const observedByTeam = new Map();
  for (const [id, playerWeeks] of Object.entries(weeklyStats)) {
    const player = players[id];
    if (!player || !['QB', 'RB', 'WR', 'TE', 'K'].includes(player.position) || !Array.isArray(playerWeeks)) continue;
    for (const entry of playerWeeks) {
      const value = entry?.[metric.statMode];
      if ((entry?.gp != null && Number(entry.gp) === 0) || value == null || value === '' || !Number.isFinite(Number(value))) continue;
      const team = getHeatmapPlayerGameTeam(entry, player, playerWeeks);
      if (!observedByTeam.has(team)) observedByTeam.set(team, new Set());
      observedByTeam.get(team).add(asWeek(entry.week));
    }
  }

  for (const week of completedWeeks) {
    const scheduleWeek = scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? {};
    for (const [rawDefenseTeam, scheduleEntry] of Object.entries(scheduleWeek)) {
      const defenseTeam = normalizedTeam(rawDefenseTeam);
      const offenseTeam = normalizedTeam(scheduleEntry?.opp);
      if (!defenseTeam || !offenseTeam) continue;
      const observed = observedByTeam.get(offenseTeam)?.has(week) ?? false;
      const row = rowsByTeam.get(defenseTeam) ?? {
        team: defenseTeam,
        games: 0,
        observedGames: 0,
        total: 0,
      };
      row.games += 1;
      if (observed) {
        let value = 0;
        for (const weeklyValues of Object.values(offenseTable?.[offenseTeam] ?? {})) {
          value += Number(weeklyValues?.[week] ?? weeklyValues?.[String(week)] ?? 0);
        }
        row.observedGames += 1;
        row.total += value;
      }
      rowsByTeam.set(defenseTeam, row);
    }
  }

  const rows = [...rowsByTeam.values()]
    .filter(row => row.games > 0)
    .map(row => ({
      ...row,
      perGame: row.observedGames === row.games ? row.total / row.games : null,
      rank: null,
      teamCount: null,
      bucket: null,
    }));
  const rankedRows = rows
    .filter(row => row.observedGames === row.games)
    .sort((left, right) => left.perGame - right.perGame || left.team.localeCompare(right.team));
  // An incomplete league-wide defense pool cannot define NFL quartiles.
  if (rankedRows.length !== rows.length) return rows;
  const teamCount = rankedRows.length;
  const strongLimit = Math.ceil(teamCount / 4);
  const weakStart = teamCount - Math.ceil(teamCount / 4) + 1;
  let previousValue = null;
  let currentRank = 0;

  rankedRows.forEach((row, index) => {
    if (previousValue == null || row.perGame !== previousValue) currentRank = index + 1;
    row.rank = currentRank;
    row.teamCount = teamCount;
    const lastTieIndex = rankedRows.findLastIndex(candidate => candidate.perGame === row.perGame);
    const midpointRank = (currentRank + lastTieIndex + 1) / 2;
    row.bucket = midpointRank <= strongLimit
      ? 'strong'
      : midpointRank >= weakStart
        ? 'weak'
        : 'middle';
    previousValue = row.perGame;
  });
  return rows;
}

function buildQuarterbackCoverage({ players, weeklyStats, scheduleMap, completedWeeks }) {
  const expectedTeams = new Set();
  for (const week of completedWeeks) {
    Object.keys(scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? {}).forEach((team) => {
      const normalized = normalizedTeam(team);
      if (normalized) expectedTeams.add(normalized);
    });
  }
  const verifiedTeams = new Set();
  for (const [playerId, player] of Object.entries(players ?? {})) {
    if (normalizedPosition(player?.position) !== 'QB') continue;
    if (!hasVerifiedQuarterbackStarterMetadata(player, weeklyStats?.[playerId] ?? [], new Set(completedWeeks))) continue;
    const team = normalizedTeam(player?.team);
    if (team) verifiedTeams.add(team);
  }
  const missingTeams = [...expectedTeams].filter(team => !verifiedTeams.has(team));
  if (!expectedTeams.size || missingTeams.length) {
    return {
      available: false,
      reason: expectedTeams.size
        ? `Verified starting-quarterback metadata is unavailable for ${missingTeams.length} of ${expectedTeams.size} teams.`
        : 'Verified starting-quarterback metadata is unavailable.',
    };
  }
  return { available: true, reason: null };
}

function attachRanking(targetSummary, peerSummaries, targetId, minGames, unavailableReason = null) {
  if (unavailableReason) {
    return { ...targetSummary, rank: null, peerCount: null, rankingUnavailableReason: unavailableReason };
  }
  if (targetSummary.games < minGames) {
    return {
      ...targetSummary,
      rank: null,
      peerCount: null,
      rankingUnavailableReason: `At least ${minGames} qualifying games are required for a peer rank.`,
    };
  }
  const { ranks, peerCount } = buildRankMap(peerSummaries, minGames);
  if (!peerCount || !ranks.has(String(targetId))) {
    return {
      ...targetSummary,
      rank: null,
      peerCount,
      rankingUnavailableReason: 'No qualifying peer ranking is available.',
    };
  }
  return { ...targetSummary, rank: ranks.get(String(targetId)), peerCount, rankingUnavailableReason: null };
}

function bucketRows(gameRows, bucket) {
  return gameRows.filter(row => row.bucket === bucket);
}

/**
 * Builds current-season, factual player performance against defenses classified
 * by the same receiving/rushing yard totals shown in Fantasy Heatmap.
 * `completedWeeks` is a test seam; production callers rely on full-final week
 * metadata and never infer completion from kickoff time.
 */
export function buildPlayerDefensePerformance({
  playerId,
  oppTeam = null,
  weeklyStats = {},
  players = {},
  scheduleMap = {},
  scoringSettings = {},
  completedWeeks = undefined,
  currentWeek = null,
  minPlayerGamesForRank = 3,
} = {}) {
  weeklyStats = weeklyStats ?? {};
  players = players ?? {};
  scheduleMap = scheduleMap ?? {};
  scoringSettings = scoringSettings ?? {};
  const player = players?.[playerId] ?? null;
  const position = normalizedPosition(player?.position);
  const completeWeeks = getCompletedWeeks(scheduleMap, completedWeeks, currentWeek);
  const completedWeekSet = new Set(completeWeeks);
  const completedThroughWeek = completeWeeks.length ? completeWeeks[completeWeeks.length - 1] : null;
  const noPlayerResult = {
    completedThroughWeek,
    position,
    peerLabel: position === 'QB' ? 'Verified starting QBs' : position ? `Qualifying ${position}s` : null,
    overall: { games: 0, points: 0, ppg: null, rank: null, peerCount: null, gameRows: [], rankingUnavailableReason: 'Player data is unavailable.' },
    metrics: [],
    statRanks: [],
  };
  if (!player || !position) return noPlayerResult;

  const targetGameRows = buildPlayerGameRows(playerId, player, weeklyStats, scheduleMap, completedWeekSet, scoringSettings);
  const quarterbackCoverage = position === 'QB'
    ? buildQuarterbackCoverage({ players, weeklyStats, scheduleMap, completedWeeks: completeWeeks })
    : { available: true, reason: null };
  const playerRowsById = new Map();
  for (const [candidateId, candidate] of Object.entries(players)) {
    if (normalizedPosition(candidate?.position) !== position) continue;
    if (position === 'QB' && !hasVerifiedQuarterbackStarterMetadata(candidate, weeklyStats?.[candidateId] ?? [], completedWeekSet)) continue;
    playerRowsById.set(String(candidateId), buildPlayerGameRows(
      candidateId,
      candidate,
      weeklyStats,
      scheduleMap,
      completedWeekSet,
      scoringSettings,
    ));
  }
  // The selected player must remain visible even when QB starter metadata is
  // unknown. Its points are factual; only the peer-rank marker is unavailable.
  const starterReason = position === 'QB' && !playerRowsById.has(String(playerId))
    ? 'Starting-quarterback eligibility is not verified for this player.'
    : quarterbackCoverage.available ? null : quarterbackCoverage.reason;

  const allPeerSummaries = [...playerRowsById.entries()].map(([candidateId, rows]) => ({
    playerId: candidateId,
    ...summarizeGameRows(rows),
  }));
  const overall = attachRanking(
    summarizeGameRows(targetGameRows),
    allPeerSummaries,
    playerId,
    minPlayerGamesForRank,
    starterReason,
  );
  const statRanks = completeWeeks.length ? buildCommonStatRanks(playerId, position, players, weeklyStats, completedWeekSet) : [];

  const metrics = (OFFENSIVE_INSIGHT_POSITIONS.has(position) ? METRICS : []).map((metric) => {
    const defenseRows = buildDefenseRows({
      metric,
      completedWeeks: completeWeeks,
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings,
    });
    const defenseByTeam = new Map(defenseRows.map(row => [row.team, row]));
    const coverageReason = defenseRows.some(row => row.rank == null) || !defenseRows.length
      ? 'Defense classification needs receiving or rushing stat coverage for every completed NFL game in this period.' : null;
    const decoratedTargetRows = targetGameRows.map(row => ({
      ...row,
      bucket: defenseByTeam.get(row.opponent)?.bucket ?? null,
    }));
    const buckets = BUCKETS.map((bucket) => {
      const targetSummary = summarizeGameRows(bucketRows(decoratedTargetRows, bucket.id));
      const peerSummaries = [...playerRowsById.entries()].map(([candidateId, rows]) => ({
        playerId: candidateId,
        ...summarizeGameRows(bucketRows(rows.map(row => ({
          ...row,
          bucket: defenseByTeam.get(row.opponent)?.bucket ?? null,
        })), bucket.id)),
      }));
      return {
        ...bucket,
        ...attachRanking(
          targetSummary,
          peerSummaries,
          playerId,
          minPlayerGamesForRank,
          coverageReason ?? starterReason,
        ),
      };
    });
    const opponent = defenseByTeam.get(normalizedTeam(oppTeam)) ?? null;
    return {
      id: metric.id,
      label: metric.label,
      definition: metric.definition,
      coverageReason,
      opponent: opponent
        ? {
          team: opponent.team,
          rank: opponent.rank,
          teamCount: opponent.teamCount,
          perGame: opponent.perGame,
          games: opponent.games,
          total: opponent.total,
          bucket: opponent.bucket,
        }
        : null,
      buckets,
    };
  });

  return {
    completedThroughWeek,
    position,
    peerLabel: position === 'QB' ? 'Verified starting QBs' : `Qualifying ${position}s`,
    overall,
    statRanks,
    metrics,
  };
}
