import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useFantasyLeague } from './SleeperContext.jsx';
import useDraftSync from '../hooks/useDraftSync.js';
import { getPredictionsSyncState, putPredictionsSyncState } from '../api/predictionsSyncApi.js';
import { findCorrespondingGameIndex } from '../utils/scheduleParser';
import {
  generateRandomPlayoffPicks,
  getCreatablePredictionSeasons,
  getCurrentPredictionSeason,
  isCreatablePredictionSeason,
} from '../utils/predictionSnapshot.js';

const PredictionContext = createContext();
const VALID_GAME_RESULTS = new Set(['W', 'L', 'T']);
const TEAM_SCHEDULE_KEYS = ['games', 'schedule', 'matchups'];
const GAME_ID_KEYS = ['gameId', 'id', 'espnEventId', 'eventId'];
const FULL_SEASON_GAMES = 17;
const DEFAULT_MANUAL_RECORD = { wins: 8, losses: 9, ties: 0, divisionWins: 3 };
const LEGACY_PREDICTION_STORAGE_KEY = 'nfl-predictions-2026';
const PREDICTION_STORAGE_KEY = 'gridshift-predictions-v2';
const PREDICTION_IMPORT_BACKUP_KEY = 'gridshift-predictions-import-backup-v1';
const PREDICTION_STORAGE_VERSION = 2;
const PREDICTIONS_SYNC_SCHEMA_VERSION = 1;
const PREDICTIONS_SYNC_META_PREFIX = 'gridshift_predictions_sync_meta_v1';
const PREDICTIONS_SYNC_WRITE_DEBOUNCE_MS = 500;
const PREDICTIONS_SYNC_POLL_MS = 2_000;

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const createEmptySeasonState = () => ({ predictions: {}, playoffPicks: {} });

const normalizeSeasonState = (value) => ({
  predictions: isPlainObject(value?.predictions) ? value.predictions : {},
  playoffPicks: isPlainObject(value?.playoffPicks) ? value.playoffPicks : {},
  scheduleFingerprint: typeof value?.scheduleFingerprint === 'string' ? value.scheduleFingerprint : '',
});

const getPredictionsSyncMetaKey = (userId, season) => `${PREDICTIONS_SYNC_META_PREFIX}:${String(userId ?? '')}:${String(season ?? '')}`;

const readPredictionsSyncMeta = (userId, season) => {
  try {
    const value = JSON.parse(localStorage.getItem(getPredictionsSyncMetaKey(userId, season)) || '{}');
    return isPlainObject(value) ? value : {};
  } catch { return {}; }
};

const writePredictionsSyncMeta = (userId, season, update) => {
  try {
    localStorage.setItem(getPredictionsSyncMetaKey(userId, season), JSON.stringify({
      ...readPredictionsSyncMeta(userId, season),
      ...update,
    }));
  } catch { /* Sync metadata must never block local predictions. */ }
};

const loadPredictionStore = () => {
  const currentSeason = getCurrentPredictionSeason();
  try {
    const saved = localStorage.getItem(PREDICTION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.version === PREDICTION_STORAGE_VERSION && isPlainObject(parsed.seasons)) {
        const activeSeason = Number(parsed.activeSeason);
        const normalizedActiveSeason = isCreatablePredictionSeason(activeSeason) ? activeSeason : currentSeason;
        return {
          version: PREDICTION_STORAGE_VERSION,
          activeSeason: normalizedActiveSeason,
          seasons: Object.fromEntries(
            Object.entries(parsed.seasons).map(([season, value]) => [String(season), normalizeSeasonState(value)]),
          ),
        };
      }
    }

    const legacySaved = localStorage.getItem(LEGACY_PREDICTION_STORAGE_KEY);
    if (legacySaved) {
      const legacyPredictions = JSON.parse(legacySaved);
      if (isPlainObject(legacyPredictions)) {
        const legacySeason = 2026;
        return {
          version: PREDICTION_STORAGE_VERSION,
          activeSeason: isCreatablePredictionSeason(legacySeason) ? legacySeason : currentSeason,
          seasons: {
            [legacySeason]: { predictions: legacyPredictions, playoffPicks: {} },
          },
        };
      }
    }
  } catch (error) {
    console.warn('Could not load saved predictions:', error);
  }

  return {
    version: PREDICTION_STORAGE_VERSION,
    activeSeason: currentSeason,
    seasons: { [currentSeason]: createEmptySeasonState() },
  };
};

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
  const { platform, sleeperUser } = useFantasyLeague();
  const {
    enabled: draftSyncEnabled,
    deviceToken,
    deviceRole,
    pairingStatus,
    initialSyncSetup,
  } = useDraftSync();
  const sleeperUserId = String(sleeperUser?.user_id ?? '').trim();
  const [predictionStore, setPredictionStore] = useState(loadPredictionStore);
  const [predictionSyncStatus, setPredictionSyncStatus] = useState('local-only');
  const [predictionSyncConflict, setPredictionSyncConflict] = useState(null);
  const [predictionSyncActive, setPredictionSyncActiveState] = useState(false);
  const predictionStoreRef = useRef(predictionStore);
  const predictionSyncRevisionRef = useRef(0);
  const predictionSyncEtagRef = useRef(null);
  const predictionSyncPendingRef = useRef(null);
  const predictionSyncTimerRef = useRef(null);
  const predictionSyncInFlightRef = useRef(false);
  const predictionSyncActiveRef = useRef(false);
  const authorityInitialPublishRef = useRef(false);
  const authorityStateKnownRef = useRef(false);
  const [predictionImportBackup, setPredictionImportBackup] = useState(() => {
    try {
      const saved = localStorage.getItem(PREDICTION_IMPORT_BACKUP_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const predictionSeason = predictionStore.activeSeason;
  const activeSeasonState = normalizeSeasonState(predictionStore.seasons?.[predictionSeason]);
  // predictions = { "KC": {wins: 14, losses: 3, divisionWins: 5}, "BUF": {wins: 12, losses: 5, divisionWins: 4}, ... }
  const predictions = activeSeasonState.predictions;
  const playoffPicks = activeSeasonState.playoffPicks;

  useEffect(() => { predictionStoreRef.current = predictionStore; }, [predictionStore]);

  const getSyncState = useCallback((season, source = predictionStoreRef.current) => {
    const seasonState = normalizeSeasonState(source.seasons?.[String(season)]);
    return {
      schemaVersion: PREDICTIONS_SYNC_SCHEMA_VERSION,
      season: String(season),
      // The schedule fingerprint is intentionally opaque here. The schedule-facing
      // surface may replace this with its canonical fingerprint without changing
      // the sync envelope.
      scheduleFingerprint: seasonState.scheduleFingerprint || `season-${season}`,
      predictions: seasonState.predictions,
      playoffPicks: seasonState.playoffPicks,
    };
  }, []);

  const applyRemotePredictionState = useCallback((season, remoteState, revision, etag) => {
    if (!remoteState || Number(remoteState.season) !== Number(season)) return;
    setPredictionStore((current) => ({
      ...current,
      seasons: {
        ...current.seasons,
        [String(season)]: normalizeSeasonState(remoteState),
      },
    }));
    predictionSyncRevisionRef.current = Number(revision ?? 0);
    predictionSyncEtagRef.current = etag ?? null;
    predictionSyncPendingRef.current = null;
    writePredictionsSyncMeta(sleeperUserId, season, { revision: predictionSyncRevisionRef.current, dirty: false });
    setPredictionSyncConflict(null);
    setPredictionSyncStatus('synced');
  }, [sleeperUserId]);

  const flushPredictionSync = useCallback(async () => {
    const pending = predictionSyncPendingRef.current;
    if (!pending || !draftSyncEnabled || !deviceToken || !sleeperUserId || predictionSyncInFlightRef.current) return;
    predictionSyncInFlightRef.current = true;
    setPredictionSyncStatus('syncing');
    try {
      const result = await putPredictionsSyncState({
        token: deviceToken,
        sleeperUserId,
        season: pending.season,
        state: pending.state,
        expectedRevision: predictionSyncRevisionRef.current,
      });
      predictionSyncRevisionRef.current = Number(result.revision ?? predictionSyncRevisionRef.current + 1);
      predictionSyncEtagRef.current = result.etag ?? predictionSyncEtagRef.current;
      predictionSyncPendingRef.current = null;
      authorityStateKnownRef.current = true;
      authorityInitialPublishRef.current = false;
      writePredictionsSyncMeta(sleeperUserId, pending.season, { revision: predictionSyncRevisionRef.current, dirty: false });
      setPredictionSyncConflict(null);
      setPredictionSyncStatus('synced');
    } catch (error) {
      if (error?.status === 409) {
        const remoteRevision = Number(error.payload?.revision ?? predictionSyncRevisionRef.current);
        const remoteEtag = error.etag ?? `"${remoteRevision}"`;
        predictionSyncRevisionRef.current = remoteRevision;
        predictionSyncEtagRef.current = remoteEtag;
        if (deviceRole === 'authoritative' && authorityInitialPublishRef.current) {
          predictionSyncPendingRef.current = { season: pending.season, state: pending.state };
          if (predictionSyncTimerRef.current) window.clearTimeout(predictionSyncTimerRef.current);
          predictionSyncTimerRef.current = window.setTimeout(() => {
            predictionSyncTimerRef.current = null;
            void flushPredictionSync();
          }, 0);
          return;
        }
        setPredictionSyncConflict({
          season: pending.season,
          localState: pending.state,
          remoteState: error.payload?.state ?? null,
          remoteRevision,
          remoteEtag,
        });
        setPredictionSyncStatus('conflict');
      } else if (error?.status === 401 || error?.status === 403) {
        setPredictionSyncStatus('pairing-required');
      } else {
        setPredictionSyncStatus('offline');
      }
    } finally {
      predictionSyncInFlightRef.current = false;
    }
  }, [deviceRole, deviceToken, draftSyncEnabled, sleeperUserId]);

  const queuePredictionSync = useCallback((season, source) => {
    if (!draftSyncEnabled || !deviceToken || !sleeperUserId) {
      setPredictionSyncStatus('local-only');
      return;
    }
    const state = getSyncState(season, source);
    predictionSyncPendingRef.current = { season, state };
    writePredictionsSyncMeta(sleeperUserId, season, { revision: predictionSyncRevisionRef.current, dirty: true });
    setPredictionSyncStatus('syncing');
    if (predictionSyncTimerRef.current) window.clearTimeout(predictionSyncTimerRef.current);
    predictionSyncTimerRef.current = window.setTimeout(() => {
      predictionSyncTimerRef.current = null;
      void flushPredictionSync();
    }, PREDICTIONS_SYNC_WRITE_DEBOUNCE_MS);
  }, [deviceToken, draftSyncEnabled, flushPredictionSync, getSyncState, sleeperUserId]);

  const refreshPredictionSync = useCallback(async ({ allowInactive = false } = {}) => {
    const season = predictionStoreRef.current.activeSeason;
    if ((!allowInactive && !predictionSyncActiveRef.current) || !draftSyncEnabled || !deviceToken || !sleeperUserId || predictionSyncInFlightRef.current) return;
    predictionSyncInFlightRef.current = true;
    try {
      const result = await getPredictionsSyncState({
        token: deviceToken,
        sleeperUserId,
        season,
        etag: predictionSyncEtagRef.current,
      });
      if (result.notModified) {
        if (deviceRole === 'authoritative' && authorityInitialPublishRef.current) {
          queuePredictionSync(season, predictionStoreRef.current);
          return;
        }
        setPredictionSyncStatus((status) => status === 'syncing' ? 'synced' : status);
        return;
      }
      if (result.missing) {
        predictionSyncRevisionRef.current = 0;
        predictionSyncEtagRef.current = null;
        authorityStateKnownRef.current = false;
        if (deviceRole === 'authoritative') {
          authorityInitialPublishRef.current = true;
          queuePredictionSync(season, predictionStoreRef.current);
        } else if (deviceRole === 'non-authoritative') {
          setPredictionSyncStatus('waiting-for-primary');
        } else {
          setPredictionSyncStatus('synced');
        }
        return;
      }
      const remoteState = result.state ?? null;
      if (!remoteState || remoteState.schemaVersion !== PREDICTIONS_SYNC_SCHEMA_VERSION || Number(remoteState.season) !== Number(season)) {
        setPredictionSyncStatus('update-required');
        return;
      }
      if (deviceRole === 'authoritative' && authorityInitialPublishRef.current) {
        predictionSyncRevisionRef.current = Number(result.revision ?? 0);
        predictionSyncEtagRef.current = result.etag ?? null;
        queuePredictionSync(season, predictionStoreRef.current);
        return;
      }
      const meta = readPredictionsSyncMeta(sleeperUserId, season);
      const joiningPairing = deviceRole === 'non-authoritative'
        && (initialSyncSetup?.status === 'waiting' || meta.hydrated !== true);
      if (meta.dirty && !joiningPairing) {
        predictionSyncRevisionRef.current = Number(result.revision ?? 0);
        predictionSyncEtagRef.current = result.etag ?? null;
        setPredictionSyncConflict({
          season,
          localState: getSyncState(season),
          remoteState,
          remoteRevision: predictionSyncRevisionRef.current,
          remoteEtag: predictionSyncEtagRef.current,
        });
        setPredictionSyncStatus('conflict');
        return;
      }
      applyRemotePredictionState(season, remoteState, result.revision, result.etag);
      writePredictionsSyncMeta(sleeperUserId, season, { hydrated: true });
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) setPredictionSyncStatus('pairing-required');
      else setPredictionSyncStatus('offline');
    } finally {
      predictionSyncInFlightRef.current = false;
    }
  }, [applyRemotePredictionState, deviceRole, deviceToken, draftSyncEnabled, getSyncState, initialSyncSetup, queuePredictionSync, sleeperUserId]);

  const setPredictionSyncActive = useCallback((active) => {
    const nextActive = Boolean(active);
    predictionSyncActiveRef.current = nextActive;
    setPredictionSyncActiveState(nextActive);
  }, []);

  const resolvePredictionSyncConflict = useCallback(async (choice) => {
    const conflict = predictionSyncConflict;
    if (!conflict) return;
    if (choice === 'server') {
      applyRemotePredictionState(conflict.season, conflict.remoteState, conflict.remoteRevision, conflict.remoteEtag);
      return;
    }
    predictionSyncRevisionRef.current = conflict.remoteRevision;
    predictionSyncEtagRef.current = conflict.remoteEtag;
    predictionSyncPendingRef.current = { season: conflict.season, state: conflict.localState };
    writePredictionsSyncMeta(sleeperUserId, conflict.season, { revision: conflict.remoteRevision, dirty: true });
    setPredictionSyncConflict(null);
    await flushPredictionSync();
  }, [applyRemotePredictionState, flushPredictionSync, predictionSyncConflict, sleeperUserId]);

  useEffect(() => {
    const meta = readPredictionsSyncMeta(sleeperUserId, predictionSeason);
    predictionSyncRevisionRef.current = Number(meta.revision ?? 0);
    predictionSyncEtagRef.current = null;
    predictionSyncPendingRef.current = null;
    authorityStateKnownRef.current = false;
    setPredictionSyncConflict(null);
  }, [predictionSeason, sleeperUserId]);

  useEffect(() => {
    if (deviceRole !== 'authoritative') {
      authorityInitialPublishRef.current = false;
      authorityStateKnownRef.current = false;
      return;
    }
    if (pairingStatus === 'pending') {
      authorityInitialPublishRef.current = true;
      authorityStateKnownRef.current = false;
    }
  }, [deviceRole, pairingStatus]);

  const seedAuthoritativePredictionSync = useCallback(async () => {
    if (
      platform !== 'sleeper'
      || !draftSyncEnabled
      || !deviceToken
      || !sleeperUserId
      || deviceRole !== 'authoritative'
      || predictionSyncInFlightRef.current
      || (authorityStateKnownRef.current && !authorityInitialPublishRef.current)
    ) return;

    const season = predictionStoreRef.current.activeSeason;
    predictionSyncInFlightRef.current = true;
    try {
      const remote = await getPredictionsSyncState({
        token: deviceToken,
        sleeperUserId,
        season,
        etag: authorityInitialPublishRef.current ? null : predictionSyncEtagRef.current,
      });
      if (remote.notModified) {
        authorityStateKnownRef.current = true;
        return;
      }
      predictionSyncRevisionRef.current = remote.missing ? 0 : Number(remote.revision ?? 0);
      predictionSyncEtagRef.current = remote.missing ? null : remote.etag ?? null;
      if (remote.missing) {
        authorityStateKnownRef.current = false;
        authorityInitialPublishRef.current = true;
        queuePredictionSync(season, predictionStoreRef.current);
      } else if (authorityInitialPublishRef.current) {
        // A new pairing-code generator owns the collision state. Keep this
        // marker through the first successful write, even if the code is
        // claimed before that write completes.
        queuePredictionSync(season, predictionStoreRef.current);
      } else {
        authorityStateKnownRef.current = true;
        setPredictionSyncStatus('synced');
      }
    } catch (error) {
      setPredictionSyncStatus(error?.status === 401 || error?.status === 403 ? 'pairing-required' : 'offline');
    } finally {
      predictionSyncInFlightRef.current = false;
    }
  }, [
    deviceRole,
    deviceToken,
    draftSyncEnabled,
    platform,
    queuePredictionSync,
    sleeperUserId,
  ]);

  // An authoritative device retries an unknown/missing scope independent of
  // the transient pairing status. Active-surface reads reset the known marker
  // after a sidecar restart, without rewriting an existing remote state.
  useEffect(() => {
    if (
      platform !== 'sleeper'
      || !draftSyncEnabled
      || !deviceToken
      || !sleeperUserId
      || deviceRole !== 'authoritative'
    ) return undefined;

    void seedAuthoritativePredictionSync();
    const retryId = window.setInterval(() => {
      void seedAuthoritativePredictionSync();
    }, 2_000);
    return () => window.clearInterval(retryId);
  }, [
    deviceRole,
    deviceToken,
    draftSyncEnabled,
    platform,
    seedAuthoritativePredictionSync,
    sleeperUserId,
  ]);

  // A joining device never writes its local copy into an empty remote scope.
  // It briefly retries the read after pairing so the authoritative device's
  // debounced first publish arrives without requiring the user to edit again.
  useEffect(() => {
    if (
      platform !== 'sleeper'
      || !draftSyncEnabled
      || !deviceToken
      || !sleeperUserId
      || deviceRole !== 'non-authoritative'
      || predictionSyncStatus === 'synced'
    ) return undefined;

    void refreshPredictionSync({ allowInactive: true });
    const retryId = window.setInterval(() => {
      void refreshPredictionSync({ allowInactive: true });
    }, 2_000);
    return () => window.clearInterval(retryId);
  }, [
    deviceRole,
    deviceToken,
    draftSyncEnabled,
    platform,
    predictionSyncStatus,
    refreshPredictionSync,
    sleeperUserId,
  ]);

  useEffect(() => {
    if (!predictionSyncActiveRef.current || !draftSyncEnabled || !deviceToken || !sleeperUserId || platform !== 'sleeper') return undefined;
    const refresh = () => { if (document.visibilityState === 'visible') void refreshPredictionSync(); };
    void refreshPredictionSync();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    const intervalId = window.setInterval(refresh, PREDICTIONS_SYNC_POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      window.clearInterval(intervalId);
    };
  }, [deviceToken, draftSyncEnabled, platform, predictionSyncActive, refreshPredictionSync, sleeperUserId, predictionSeason]);

  useEffect(() => () => {
    if (predictionSyncTimerRef.current) window.clearTimeout(predictionSyncTimerRef.current);
  }, []);

  const updateSeasonState = (season, updater) => {
    setPredictionStore((previousStore) => {
      const seasonKey = String(season);
      const previousSeasonState = normalizeSeasonState(previousStore.seasons?.[seasonKey]);
      const nextSeasonState = normalizeSeasonState(updater(previousSeasonState));
      const nextStore = {
        ...previousStore,
        seasons: {
          ...previousStore.seasons,
          [seasonKey]: nextSeasonState,
        },
      };
      queuePredictionSync(season, nextStore);
      return nextStore;
    });
  };

  const setPredictions = (updater) => {
    updateSeasonState(predictionSeason, (previousSeasonState) => ({
      ...previousSeasonState,
      predictions: typeof updater === 'function'
        ? updater(previousSeasonState.predictions)
        : updater,
    }));
  };

  const setPlayoffPicks = (updater) => {
    updateSeasonState(predictionSeason, (previousSeasonState) => ({
      ...previousSeasonState,
      playoffPicks: typeof updater === 'function'
        ? updater(previousSeasonState.playoffPicks)
        : updater,
    }));
  };

  const setPredictionSeason = (season) => {
    const normalizedSeason = Number(season);
    if (!isCreatablePredictionSeason(normalizedSeason)) return false;
    setPredictionStore((previousStore) => ({
      ...previousStore,
      activeSeason: normalizedSeason,
      seasons: {
        ...previousStore.seasons,
        [normalizedSeason]: normalizeSeasonState(previousStore.seasons?.[normalizedSeason]),
      },
    }));
    return true;
  };

  const setPredictionSyncScheduleFingerprint = useCallback((season, fingerprint) => {
    const normalizedFingerprint = String(fingerprint ?? '').trim();
    if (!normalizedFingerprint) return;
    setPredictionStore((previousStore) => {
      const seasonKey = String(season);
      const previousSeasonState = normalizeSeasonState(previousStore.seasons?.[seasonKey]);
      if (previousSeasonState.scheduleFingerprint === normalizedFingerprint) return previousStore;
      return {
        ...previousStore,
        seasons: {
          ...previousStore.seasons,
          [seasonKey]: { ...previousSeasonState, scheduleFingerprint: normalizedFingerprint },
        },
      };
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(predictionStore));
    } catch (error) {
      console.warn('Could not save predictions to localStorage:', error);
    }
  }, [predictionStore]);

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

    // A manual record is authoritative. Clear any previously forced or partial
    // game results (and their mirrored opponent results) so Advanced Mode can
    // never appear complete with a schedule that describes a different record.
    setTeamRecord(
      teamId,
      wins,
      losses,
      divisionWins,
      {},
      allTeams,
      ties,
      { manualOverride: true, recordSource: 'manual', opponentSyncMode: 'preserve' },
    );
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
    updateSeasonState(predictionSeason, () => createEmptySeasonState());
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

    let randomizedPlayoffPicks = {};
    try {
      randomizedPlayoffPicks = generateRandomPlayoffPicks({ teams: allTeams, records: newPredictions });
    } catch (error) {
      console.warn('Could not generate randomized playoff predictions:', error);
    }

    updateSeasonState(predictionSeason, () => ({
      predictions: newPredictions,
      playoffPicks: randomizedPlayoffPicks,
    }));
  };

  // Import predictions from an exported JSON object
  const importPredictions = (data, options = {}) => {
    const targetSeason = Number(options.season ?? predictionSeason);
    if (!isCreatablePredictionSeason(targetSeason)) {
      throw new Error('Predictions can only be imported for the current or upcoming season.');
    }
    const backup = {
      season: targetSeason,
      state: normalizeSeasonState(predictionStore.seasons?.[String(targetSeason)]),
    };
    setPredictionImportBackup(backup);
    try { localStorage.setItem(PREDICTION_IMPORT_BACKUP_KEY, JSON.stringify(backup)); } catch { /* ignore */ }
    updateSeasonState(targetSeason, (previousSeasonState) => ({
        predictions: data,
        playoffPicks: isPlainObject(options.playoffPicks)
          ? options.playoffPicks
          : previousSeasonState.playoffPicks,
    }));
    if (targetSeason !== predictionSeason) {
      setPredictionStore((previousStore) => ({ ...previousStore, activeSeason: targetSeason }));
    }
  };

  const restorePredictionImportBackup = () => {
    const backupSeason = Number(predictionImportBackup?.season);
    if (!predictionImportBackup?.state || !isCreatablePredictionSeason(backupSeason)) return false;
    updateSeasonState(backupSeason, () => normalizeSeasonState(predictionImportBackup.state));
    setPredictionStore((previousStore) => ({ ...previousStore, activeSeason: backupSeason }));
    setPredictionImportBackup(null);
    try { localStorage.removeItem(PREDICTION_IMPORT_BACKUP_KEY); } catch { /* ignore */ }
    return true;
  };

  return (
    <PredictionContext.Provider
      value={{
        predictions,
        predictionSeason,
        predictionSeasonOptions: getCreatablePredictionSeasons(),
        setPredictionSeason,
        setPredictionSyncScheduleFingerprint,
        playoffPicks,
        setPlayoffPicks,
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
        predictionImportBackup,
        restorePredictionImportBackup,
        generateRandomPredictions,
        predictionSyncStatus,
        predictionSyncConflict,
        setPredictionSyncActive,
        refreshPredictionSync,
        resolvePredictionSyncConflict,
      }}
    >
      {children}
    </PredictionContext.Provider>
  );
};

// Custom hook to use the prediction context
// eslint-disable-next-line react-refresh/only-export-components
export const usePredictions = () => {
  const context = useContext(PredictionContext);
  if (!context) {
    throw new Error('usePredictions must be used within a PredictionProvider');
  }
  return context;
};
