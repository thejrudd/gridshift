import { createContext, useContext, useState, useEffect } from 'react';
import { findCorrespondingGameIndex } from '../utils/scheduleParser';

const PredictionContext = createContext();
const VALID_GAME_RESULTS = new Set(['W', 'L', 'T']);
const TEAM_SCHEDULE_KEYS = ['games', 'schedule', 'matchups'];
const GAME_ID_KEYS = ['gameId', 'id', 'espnEventId', 'eventId'];
const FULL_SEASON_GAMES = 17;
const DEFAULT_MANUAL_RECORD = { wins: 8, losses: 9, ties: 0, divisionWins: 3 };

const invertResult = (result) => {
  if (result === 'W') return 'L';
  if (result === 'L') return 'W';
  if (result === 'T') return 'T';
  return undefined;
};

const normalizeTeamId = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value.id ? String(value.id).toUpperCase() : null;
  if (typeof value === 'string') return value.toUpperCase();
  return String(value).toUpperCase();
};

const getGameTeamId = (game, keys) => {
  for (const key of keys) {
    const value = game?.[key];
    if (value) return normalizeTeamId(value);
  }
  return null;
};

const getGameId = (game) => {
  for (const key of GAME_ID_KEYS) {
    if (game?.[key] != null) return String(game[key]);
  }
  return null;
};

const getTeamScheduleEntries = (team) => {
  for (const key of TEAM_SCHEDULE_KEYS) {
    if (Array.isArray(team?.[key])) return team[key];
  }
  return null;
};

const getExplicitGameIndex = (game, teamId = null) => {
  const normalizedTeamId = normalizeTeamId(teamId);
  const awayId = getGameTeamId(game, ['awayId', 'awayTeamId', 'awayTeam', 'away']);
  const homeId = getGameTeamId(game, ['homeId', 'homeTeamId', 'homeTeam', 'home']);

  if (normalizedTeamId && normalizedTeamId === awayId) {
    if (Number.isInteger(game?.awayGameIndex)) return game.awayGameIndex;
    if (Number.isInteger(game?.awayIndex)) return game.awayIndex;
  }
  if (normalizedTeamId && normalizedTeamId === homeId) {
    if (Number.isInteger(game?.homeGameIndex)) return game.homeGameIndex;
    if (Number.isInteger(game?.homeIndex)) return game.homeIndex;
  }
  if (Number.isInteger(game?.teamGameIndex)) return game.teamGameIndex;
  if (Number.isInteger(game?.gameIndex)) return game.gameIndex;
  if (Number.isInteger(game?.index)) return game.index;
  return null;
};

const getCanonicalGameKey = (teams, teamId, gameIndex, opponentId = null) => {
  const teamKey = normalizeTeamId(teamId);
  const oppKey = normalizeTeamId(opponentId);
  if (!teamKey || !Number.isInteger(gameIndex)) return null;

  if (oppKey && teams) {
    const correspondingIdx = findCorrespondingGameIndex(teams, teamKey, gameIndex, oppKey);
    if (correspondingIdx !== -1) {
      const slots = [
        `${teamKey}:${gameIndex}`,
        `${oppKey}:${correspondingIdx}`,
      ].sort();
      return slots.join('|');
    }
  }

  return `${teamKey}:${gameIndex}`;
};

const getOpponentIdForGameIndex = (team, gameIndex) => {
  const scheduleEntries = getTeamScheduleEntries(team);
  const scheduleEntry = scheduleEntries?.[gameIndex];
  return getGameTeamId(scheduleEntry, ['opponentId', 'opponent', 'opp'])
    ?? (getGameTeamId(scheduleEntry, ['awayId', 'awayTeamId', 'awayTeam', 'away']) === normalizeTeamId(team?.id)
      ? getGameTeamId(scheduleEntry, ['homeId', 'homeTeamId', 'homeTeam', 'home'])
      : getGameTeamId(scheduleEntry, ['awayId', 'awayTeamId', 'awayTeam', 'away']))
    ?? team?.opponents?.[gameIndex];
};

const countGameResults = (team, gameResults, teams) => {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let divisionWins = 0;
  const scheduleEntries = getTeamScheduleEntries(team);
  const gameCount = Math.max(team?.opponents?.length || 0, scheduleEntries?.length || 0);

  for (let i = 0; i < gameCount; i++) {
    const result = gameResults?.[i];
    if (!VALID_GAME_RESULTS.has(result)) continue;
    const opponentId = getOpponentIdForGameIndex(team, i);

    if (result === 'W') {
      wins++;
      const opponent = teams?.find(t => t.id === opponentId);
      if (opponent?.division === team.division) divisionWins++;
    } else if (result === 'L') {
      losses++;
    } else if (result === 'T') {
      ties++;
    }
  }

  return { wins, losses, ties, divisionWins };
};

const syncRecordFromGameResults = (record, team, teams) => ({
  ...record,
  ...countGameResults(team, record?.gameResults || {}, teams),
  recordSource: 'games',
  manualOverride: false,
});

const hasSavedRecord = (record) => Boolean(
  record?.recordSource
  || record?.manualOverride
  || Object.keys(record?.gameResults ?? {}).length
  || record?.wins
  || record?.losses
  || record?.ties,
);

const syncOpponentRecordFromForcedResult = (record, team, teams) => {
  const gameResults = record?.gameResults || {};
  const baseRecord = hasSavedRecord(record) ? record : DEFAULT_MANUAL_RECORD;
  const nextRecord = {
    ...record,
    wins: baseRecord.wins ?? DEFAULT_MANUAL_RECORD.wins,
    losses: baseRecord.losses ?? DEFAULT_MANUAL_RECORD.losses,
    ties: baseRecord.ties ?? DEFAULT_MANUAL_RECORD.ties,
    divisionWins: baseRecord.divisionWins ?? DEFAULT_MANUAL_RECORD.divisionWins,
    gameResults,
    recordSource: record?.recordSource ?? 'games',
    manualOverride: record?.manualOverride ?? false,
  };

  const forcedWins = Object.values(gameResults).filter(r => r === 'W').length;
  const forcedLosses = Object.values(gameResults).filter(r => r === 'L').length;
  const forcedTies = Object.values(gameResults).filter(r => r === 'T').length;

  if (forcedTies > nextRecord.ties) {
    nextRecord.ties = forcedTies;
  }

  const availableDecisions = FULL_SEASON_GAMES - nextRecord.ties;
  if (nextRecord.wins + nextRecord.losses !== availableDecisions) {
    nextRecord.wins = Math.min(nextRecord.wins, availableDecisions);
    nextRecord.losses = availableDecisions - nextRecord.wins;
  }

  if (forcedWins > nextRecord.wins) {
    nextRecord.wins = forcedWins;
    nextRecord.losses = availableDecisions - nextRecord.wins;
  }

  if (forcedLosses > nextRecord.losses) {
    nextRecord.losses = forcedLosses;
    nextRecord.wins = availableDecisions - nextRecord.losses;
  }

  const divisionGameIndices = (team?.opponents || [])
    .map((opponentId, index) => {
      const opponent = teams?.find(t => t.id === opponentId);
      return opponent?.division === team.division ? index : -1;
    })
    .filter(index => index !== -1);
  const forcedDivisionWins = divisionGameIndices.filter(index => gameResults[index] === 'W').length;
  const forcedDivisionLosses = divisionGameIndices.filter(index => gameResults[index] === 'L').length;

  nextRecord.divisionWins = Math.min(6, Math.max(0, nextRecord.divisionWins));
  if (forcedDivisionWins > nextRecord.divisionWins) {
    nextRecord.divisionWins = forcedDivisionWins;
  }
  if (forcedDivisionLosses > 6 - nextRecord.divisionWins) {
    nextRecord.divisionWins = 6 - forcedDivisionLosses;
  }

  if (nextRecord.manualOverride) {
    nextRecord.manualRecord = {
      wins: nextRecord.wins,
      losses: nextRecord.losses,
      ties: nextRecord.ties,
      divisionWins: nextRecord.divisionWins,
    };
  }

  return nextRecord;
};

const findScheduleEntryIndex = (team, game) => {
  const entries = getTeamScheduleEntries(team);
  if (!entries) return -1;

  const gameId = getGameId(game);
  const opponentId = getGameTeamId(game, ['opponentId', 'opponent', 'opp']);
  const awayId = getGameTeamId(game, ['awayId', 'awayTeamId', 'awayTeam', 'away']);
  const homeId = getGameTeamId(game, ['homeId', 'homeTeamId', 'homeTeam', 'home']);
  const week = game?.week == null ? null : Number(game.week);

  return entries.findIndex((entry) => {
    const entryId = getGameId(entry);
    if (gameId && entryId && String(entryId) === gameId) return true;
    if (week != null && Number(entry.week) !== week) return false;

    const entryOpponent = getGameTeamId(entry, ['opponentId', 'opponent', 'opp']);
    const entryAway = getGameTeamId(entry, ['awayId', 'awayTeamId', 'awayTeam', 'away']);
    const entryHome = getGameTeamId(entry, ['homeId', 'homeTeamId', 'homeTeam', 'home']);
    const teamId = normalizeTeamId(team.id);

    if (opponentId && entryOpponent === opponentId) return true;
    if (awayId && homeId) {
      if (entryAway === awayId && entryHome === homeId) return true;
      if (teamId === awayId && entryOpponent === homeId) return true;
      if (teamId === homeId && entryOpponent === awayId) return true;
    }
    return false;
  });
};

const resolveGameSlot = (teams, game) => {
  if (!teams || !game) return null;

  const explicitTeamId = getGameTeamId(game, ['teamId', 'team']);
  const explicitOpponentId = getGameTeamId(game, ['opponentId', 'opponent', 'opp']);
  const awayId = getGameTeamId(game, ['awayId', 'awayTeamId', 'awayTeam', 'away']);
  const homeId = getGameTeamId(game, ['homeId', 'homeTeamId', 'homeTeam', 'home']);
  const teamId = explicitTeamId || awayId || homeId;
  const opponentId = explicitOpponentId || (teamId === awayId ? homeId : awayId);
  const explicitIndex = getExplicitGameIndex(game, teamId);

  if (teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return null;

    let gameIndex = explicitIndex;
    if (!Number.isInteger(gameIndex)) {
      gameIndex = findScheduleEntryIndex(team, game);
    }
    if (!Number.isInteger(gameIndex) || gameIndex < 0) {
      const occurrence = Number.isInteger(game?.occurrence) ? game.occurrence : null;
      let seen = 0;
      gameIndex = team.opponents?.findIndex((id) => {
        if (id !== opponentId) return false;
        if (occurrence == null) return true;
        seen++;
        return seen === occurrence;
      }) ?? -1;
    }
    if (!Number.isInteger(gameIndex) || gameIndex < 0) return null;

    const resolvedOpponentId = opponentId || team.opponents?.[gameIndex];
    if (!resolvedOpponentId) return null;
    const opponentIndex = findCorrespondingGameIndex(teams, teamId, gameIndex, resolvedOpponentId);
    return { teamId, opponentId: resolvedOpponentId, gameIndex, opponentIndex };
  }

  const gameId = getGameId(game);
  if (gameId) {
    for (const team of teams) {
      const gameIndex = findScheduleEntryIndex(team, game);
      if (gameIndex !== -1) {
        const resolvedOpponentId = team.opponents?.[gameIndex] || getGameTeamId(getTeamScheduleEntries(team)?.[gameIndex], ['opponentId', 'opponent', 'opp']);
        const opponentIndex = resolvedOpponentId
          ? findCorrespondingGameIndex(teams, team.id, gameIndex, resolvedOpponentId)
          : -1;
        return { teamId: team.id, opponentId: resolvedOpponentId, gameIndex, opponentIndex };
      }
    }
  }

  return null;
};

const normalizeResultForTeam = (result, teamId, opponentId, game) => {
  const directResult = typeof result === 'object' && result !== null
    ? (result.result ?? result.outcome ?? result.winner ?? result.winnerId ?? result.winningTeam)
    : result;

  if (directResult == null || directResult === '') return undefined;

  const normalized = String(directResult).toUpperCase();
  if (VALID_GAME_RESULTS.has(normalized)) return normalized;
  if (['CLEAR', 'NONE', 'UNSET'].includes(normalized)) return undefined;
  if (normalized === normalizeTeamId(teamId)) return 'W';
  if (normalized === normalizeTeamId(opponentId)) return 'L';

  const awayId = getGameTeamId(game, ['awayId', 'awayTeamId', 'awayTeam', 'away']);
  const homeId = getGameTeamId(game, ['homeId', 'homeTeamId', 'homeTeam', 'home']);
  if (['AWAY', 'A'].includes(normalized) && awayId) return awayId === normalizeTeamId(teamId) ? 'W' : 'L';
  if (['HOME', 'H'].includes(normalized) && homeId) return homeId === normalizeTeamId(teamId) ? 'W' : 'L';

  return undefined;
};

export const PredictionProvider = ({ children }) => {
  // predictions = { "KC": {wins: 14, losses: 3, divisionWins: 5}, "BUF": {wins: 12, losses: 5, divisionWins: 4}, ... }
  const [predictions, setPredictions] = useState({});

  // Load predictions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('nfl-predictions-2026');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPredictions(parsed);
        console.log('Loaded predictions from localStorage:', parsed);
      } catch (error) {
        console.error('Error loading predictions from localStorage:', error);
      }
    }
  }, []);

  // Save predictions to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(predictions).length > 0) {
      try {
        localStorage.setItem('nfl-predictions-2026', JSON.stringify(predictions));
      } catch (e) {
        console.warn('Could not save predictions to localStorage:', e);
      }
    }
  }, [predictions]);

  // Set a team's win/loss record, division record, and optional game results
  // allTeams is needed for cross-team sync of game results
  const setTeamRecord = (teamId, wins, losses, divisionWins = 3, gameResults = {}, allTeams = null, ties = 0, options = {}) => {
    setPredictions(prev => {
      const manualOverride = options.manualOverride ?? true;
      const recordSource = options.recordSource ?? (manualOverride ? 'manual' : 'games');
      const opponentSyncMode = options.opponentSyncMode ?? (manualOverride ? 'preserve' : 'recompute');
      const next = {
        ...prev,
        [teamId]: {
          ...prev[teamId],
          wins,
          losses,
          divisionWins,
          gameResults,
          ties,
          recordSource,
          manualOverride,
          ...(manualOverride ? {
            manualOverride: true,
            manualRecord: { wins, losses, ties, divisionWins },
          } : {}),
        },
      };

      // Cross-team sync: update opponents' game results with inverse
      if (allTeams) {
        const team = allTeams.find(t => t.id === teamId);
        if (team) {
          // Build set of current game results for diffing
          const prevGameResults = prev[teamId]?.gameResults || {};

          // Process all 17 game slots
          for (let i = 0; i < team.opponents.length; i++) {
            const opponentId = team.opponents[i];
            const correspondingIdx = findCorrespondingGameIndex(allTeams, teamId, i, opponentId);
            if (correspondingIdx === -1) continue;

            const newResult = gameResults[i];
            const oldResult = prevGameResults[i];

            // Skip if nothing changed for this game
            if (newResult === oldResult) continue;

            const oppRecord = { ...(next[opponentId] || {}) };
            const oppGameResults = { ...(oppRecord.gameResults || {}) };

            if (newResult === 'W') {
              oppGameResults[correspondingIdx] = 'L';
            } else if (newResult === 'L') {
              oppGameResults[correspondingIdx] = 'W';
            } else if (newResult === 'T') {
              oppGameResults[correspondingIdx] = 'T';
            } else {
              // Result was cleared — only clear opponent's if it was set by us
              delete oppGameResults[correspondingIdx];
            }

            const oppTeam = allTeams.find(t => t.id === opponentId);
            if (oppTeam) {
              const recordWithGameResults = { ...oppRecord, gameResults: oppGameResults };
              next[opponentId] = opponentSyncMode === 'recompute'
                ? syncRecordFromGameResults(recordWithGameResults, oppTeam, allTeams)
                : syncOpponentRecordFromForcedResult(recordWithGameResults, oppTeam, allTeams);
            } else {
              next[opponentId] = {
                ...oppRecord,
                gameResults: oppGameResults,
                recordSource: 'games',
                manualOverride: false,
              };
            }
          }
        }
      }

      return next;
    });
  };

  const setManualTeamRecord = (teamId, record = {}, allTeams = null) => {
    const team = allTeams?.find(t => t.id === teamId);
    const ties = record.ties ?? 0;
    const wins = record.wins ?? 0;
    const losses = record.losses ?? Math.max(0, FULL_SEASON_GAMES - wins - ties);
    const divisionWins = record.divisionWins ?? Math.min(6, wins);
    const forcedResult = team && ties === 0 && wins === FULL_SEASON_GAMES
      ? 'W'
      : team && ties === 0 && losses === FULL_SEASON_GAMES
        ? 'L'
        : null;

    if (forcedResult) {
      const gameResults = Object.fromEntries((team.opponents || []).map((_, index) => [index, forcedResult]));
      setTeamRecord(
        teamId,
        wins,
        losses,
        divisionWins,
        gameResults,
        allTeams,
        ties,
        { manualOverride: true, recordSource: 'manual', opponentSyncMode: 'preserve' },
      );
      return;
    }

    setPredictions(prev => {
      const current = prev[teamId] || {};
      const manualRecord = { wins, losses, ties, divisionWins };

      return {
        ...prev,
        [teamId]: {
          ...current,
          ...manualRecord,
          gameResults: current.gameResults || {},
          recordSource: 'manual',
          manualOverride: true,
          manualRecord,
        },
      };
    });
  };

  const setTeamGameResults = (teamId, gameResults = {}, allTeams = []) => {
    const team = allTeams.find(t => t.id === teamId);
    if (!team) return false;
    const record = countGameResults(team, gameResults, allTeams);
    setTeamRecord(
      teamId,
      record.wins,
      record.losses,
      record.divisionWins,
      gameResults,
      allTeams,
      record.ties,
      { manualOverride: false, recordSource: 'games' },
    );
    return true;
  };

  const setGameResult = (game, result, allTeams) => {
    const slot = resolveGameSlot(allTeams, game);
    if (!slot) return false;

    const teamResult = normalizeResultForTeam(result, slot.teamId, slot.opponentId, game);
    const opponentResult = invertResult(teamResult);

    setPredictions(prev => {
      const next = { ...prev };
      const team = allTeams.find(t => t.id === slot.teamId);
      const opponent = allTeams.find(t => t.id === slot.opponentId);
      if (!team || !opponent) return prev;

      const teamRecord = { ...(next[slot.teamId] || {}) };
      const teamGameResults = { ...(teamRecord.gameResults || {}) };
      if (teamResult) teamGameResults[slot.gameIndex] = teamResult;
      else delete teamGameResults[slot.gameIndex];
      teamRecord.gameResults = teamGameResults;
      next[slot.teamId] = syncRecordFromGameResults(teamRecord, team, allTeams);

      if (slot.opponentIndex !== -1) {
        const opponentRecord = { ...(next[slot.opponentId] || {}) };
        const opponentGameResults = { ...(opponentRecord.gameResults || {}) };
        if (opponentResult) opponentGameResults[slot.opponentIndex] = opponentResult;
        else delete opponentGameResults[slot.opponentIndex];
        opponentRecord.gameResults = opponentGameResults;
        next[slot.opponentId] = syncRecordFromGameResults(opponentRecord, opponent, allTeams);
      }

      return next;
    });

    return true;
  };

  const setScheduleGameResult = setGameResult;

  // Get a team's record (or default if not set)
  const getTeamRecord = (teamId) => {
    return predictions[teamId] || null;
  };

  // Reset all predictions
  const resetAllPredictions = () => {
    setPredictions({});
    try { localStorage.removeItem('nfl-predictions-2026'); } catch (e) { console.warn(e); }
  };

  // Get count of teams with predictions
  const getPredictionCount = () => {
    return Object.keys(predictions).length;
  };

  const getGamePredictionCounts = (allTeams) => {
    if (!allTeams?.length) {
      return { pickedGames: 0, totalGames: 0, pickedTeamSlots: 0, totalTeamSlots: 0 };
    }

    const pickedGames = new Set();
    const totalGames = new Set();
    let pickedTeamSlots = 0;
    let totalTeamSlots = 0;

    for (const team of allTeams) {
      for (let i = 0; i < (team.opponents?.length || 0); i++) {
        const opponentId = team.opponents[i];
        const key = getCanonicalGameKey(allTeams, team.id, i, opponentId);
        if (key) totalGames.add(key);
        totalTeamSlots++;

        const result = predictions[team.id]?.gameResults?.[i];
        if (VALID_GAME_RESULTS.has(result)) {
          if (key) pickedGames.add(key);
          pickedTeamSlots++;
        }
      }
    }

    return {
      pickedGames: pickedGames.size,
      totalGames: totalGames.size,
      pickedTeamSlots,
      totalTeamSlots,
    };
  };

  const getPickedGameCount = (allTeams) => getGamePredictionCounts(allTeams).pickedGames;

  // Generate random predictions for all teams with consistent game results
  const generateRandomPredictions = (allTeams) => {

    const gameOutcomes = {};

    for (const team of allTeams) {
      for (let i = 0; i < team.opponents.length; i++) {
        const key = `${team.id}-${i}`;
        if (gameOutcomes[key]) continue;

        const oppId = team.opponents[i];
        const correspondingIdx = findCorrespondingGameIndex(allTeams, team.id, i, oppId);

        const rand = Math.random();
        const result = rand < 0.004 ? 'T' : rand < 0.502 ? 'W' : 'L';

        gameOutcomes[key] = result;
        if (correspondingIdx !== -1) {
          const inverse = result === 'W' ? 'L' : result === 'L' ? 'W' : 'T';
          gameOutcomes[`${oppId}-${correspondingIdx}`] = inverse;
        }
      }
    }

    const newPredictions = {};
    for (const team of allTeams) {
      const gameResults = {};
      let wins = 0, losses = 0, ties = 0, divWins = 0;

      for (let i = 0; i < team.opponents.length; i++) {
        const result = gameOutcomes[`${team.id}-${i}`];
        if (!result) continue; // skip unresolved games (correspondingIdx === -1 edge case)
        gameResults[i] = result;
        if (result === 'W') wins++;
        else if (result === 'L') losses++;
        else ties++;

        const opp = allTeams.find(t => t.id === team.opponents[i]);
        if (opp && opp.division === team.division && result === 'W') divWins++;
      }

      newPredictions[team.id] = { wins, losses, ties, divisionWins: divWins, gameResults, recordSource: 'games', manualOverride: false };
    }

    setPredictions(newPredictions);
    try { localStorage.setItem('nfl-predictions-2026', JSON.stringify(newPredictions)); } catch (e) { console.warn(e); }
  };

  // Import predictions from an exported JSON object
  const importPredictions = (data) => {
    setPredictions(data);
    try { localStorage.setItem('nfl-predictions-2026', JSON.stringify(data)); } catch (e) { console.warn(e); }
  };

  return (
    <PredictionContext.Provider
      value={{
        predictions,
        setTeamRecord,
        setManualTeamRecord,
        setGameResult,
        setScheduleGameResult,
        setTeamGameResults,
        getTeamRecord,
        resetAllPredictions,
        getPredictionCount,
        getGamePredictionCounts,
        getPickedGameCount,
        importPredictions,
        generateRandomPredictions
      }}
    >
      {children}
    </PredictionContext.Provider>
  );
};

// Custom hook to use the prediction context
export const usePredictions = () => {
  const context = useContext(PredictionContext);
  if (!context) {
    throw new Error('usePredictions must be used within a PredictionProvider');
  }
  return context;
};
