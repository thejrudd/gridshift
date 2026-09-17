import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aggregateSeasonStats,
  getAllWeeklyStats,
  getWeeklyStats,
} from '../api/sleeperApi.js';
import { getStatisticsScoresWeekExport } from '../api/statisticsScoresApi.js';
import {
  AVAILABLE_SLEEPER_SEASONS,
  useFantasyLeague,
  useFantasyStats,
} from '../context/SleeperContext.jsx';
import { getLeagueHistorySnapshot } from '../utils/leagueHistory.js';
import {
  applyKtcMultipliers,
  computeKtcMultipliers,
  fetchKtcPlayers,
  findKtcPlayerFromSleeper,
  getKtcValue,
} from '../utils/ktcApi.js';
import { detectLeagueType } from '../utils/tradeEngine.js';
import {
  buildGameWeekExport,
  downloadGameWeekExport,
} from '../utils/gameWeekExport.js';

const FULL_SEASON_WEEKS = 18;
const HISTORY_CONCURRENCY = 2;

function key(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /cancelled|aborted/i.test(String(error?.message ?? ''));
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Stats export cancelled.');
  error.name = 'AbortError';
  throw error;
}

function slugify(value) {
  return String(value ?? 'fantasy-league')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'fantasy-league';
}

function playerName(player, playerId) {
  return String(
    player?.full_name
      ?? player?.display_name
      ?? [player?.first_name, player?.last_name].filter(Boolean).join(' '),
  ).trim() || `Player ${playerId}`;
}

function normalizeWeeklyMap(weeklyStats) {
  return Object.fromEntries(Object.entries(weeklyStats ?? {}).map(([playerId, rows]) => [
    String(playerId),
    Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? [rows] : [],
  ]));
}

function getWeekRow(weeklyStats, playerId, week) {
  const rows = weeklyStats?.[playerId] ?? weeklyStats?.[String(playerId)];
  if (Array.isArray(rows)) return rows.find((row) => Number(row?.week) === Number(week)) ?? null;
  return rows && typeof rows === 'object' ? rows : null;
}

function mergeWeekIntoStats(weeklyStats, weekStats, week) {
  const merged = normalizeWeeklyMap(weeklyStats);
  Object.entries(weekStats ?? {}).forEach(([playerId, stats]) => {
    const rows = merged[playerId] ?? [];
    merged[playerId] = [
      ...rows.filter((row) => Number(row?.week) !== Number(week)),
      { week: Number(week), ...(stats ?? {}) },
    ];
  });
  return merged;
}

function buildRawWeekMap(weekStats, fallbackWeeklyStats, week, fallbackAllowed = true) {
  const hasWeekStats = Object.keys(weekStats ?? {}).length > 0;
  const source = hasWeekStats || !fallbackAllowed
    ? weekStats
    : Object.fromEntries(Object.entries(fallbackWeeklyStats ?? {}).flatMap(([playerId]) => {
        const row = getWeekRow(fallbackWeeklyStats, playerId, week);
        return row ? [[playerId, row]] : [];
      }));
  return Object.fromEntries(Object.entries(source).map(([playerId, stats]) => [
    String(playerId),
    { week: Number(week), ...(stats ?? {}) },
  ]));
}

function truncateHistorySnapshot(snapshot, week, selectedMatchups) {
  if (!snapshot) return null;
  const matchupsByWeek = Object.fromEntries(
    Object.entries(snapshot.matchupsByWeek ?? {})
      .filter(([snapshotWeek]) => Number(snapshotWeek) <= Number(week)),
  );
  matchupsByWeek[String(week)] = selectedMatchups;
  return {
    ...snapshot,
    league: {
      ...snapshot.league,
      settings: {
        ...(snapshot.league?.settings ?? {}),
        last_scored_leg: Number(week),
      },
    },
    matchupsByWeek,
    transactions: (snapshot.transactions ?? []).filter((transaction) => {
      const transactionWeek = Number(transaction?.leg);
      return !Number.isFinite(transactionWeek) || transactionWeek <= Number(week);
    }),
    completed: false,
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadMarketValues({ league, players, scoringSettings, playerIds }) {
  const format = Number(league?.settings?.type) === 2 ? 'dynasty' : 'redraft';
  const rawKtcPlayers = await fetchKtcPlayers(format);
  const multipliers = computeKtcMultipliers(scoringSettings, league?.roster_positions ?? []);
  const adjustedKtcPlayers = applyKtcMultipliers(rawKtcPlayers, multipliers);
  const leagueType = detectLeagueType(league);
  const values = {};

  playerIds.forEach((playerId) => {
    const rawEntry = findKtcPlayerFromSleeper(playerId, players, rawKtcPlayers);
    const adjustedEntry = findKtcPlayerFromSleeper(playerId, players, adjustedKtcPlayers);
    const rawValue = getKtcValue(rawEntry, leagueType);
    const value = getKtcValue(adjustedEntry, leagueType);
    if (rawValue == null && value == null) return;
    const position = String(players?.[playerId]?.position ?? '').toUpperCase() || null;
    values[playerId] = {
      playerId,
      name: playerName(players?.[playerId], playerId),
      position,
      value: value ?? null,
      rawValue: rawValue ?? null,
      leagueType,
      format,
      positionalMultiplier: multipliers?.[position] ?? 1,
      rank: adjustedEntry?.rank ?? rawEntry?.rank ?? null,
      source: 'keeptradecut.current',
    };
  });

  return {
    values,
    source: {
      provider: 'KeepTradeCut',
      format,
      leagueType,
      fetchedAt: new Date().toISOString(),
    },
  };
}

const INITIAL_STATE = {
  status: 'idle',
  progress: { label: '', completed: 0, total: 1 },
  error: null,
  result: null,
};

export default function useGameWeekExport() {
  const {
    platform,
    selectedLeagueId,
    league,
    rosters,
    leagueUsers,
    season,
    linkedLeagueHistory,
    scoringSettings,
    activeScoringSettings,
    loadMatchups,
    loadPlayers: loadLeaguePlayers,
  } = useFantasyLeague();
  const {
    players,
    weeklyStats,
    seasonStats,
    loadPlayers: loadStatPlayers,
  } = useFantasyStats();
  const [state, setState] = useState(INITIAL_STATE);
  const controllerRef = useRef(null);
  const runIdRef = useRef(0);

  const loadPlayers = loadLeaguePlayers ?? loadStatPlayers;

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((current) => current.status === 'loading' ? INITIAL_STATE : current);
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const runExport = useCallback(async ({
    week,
    includeHistory = true,
    includeMarketValues = true,
    nflDetail = 'box_score',
  } = {}) => {
    if (platform !== 'sleeper' || !selectedLeagueId || !league) {
      throw new Error('Connect a Sleeper league before exporting stats.');
    }

    const normalizedWeek = Number(week);
    const normalizedSeason = String(season ?? league.season ?? '');
    if (!Number.isInteger(normalizedWeek) || normalizedWeek < 1 || normalizedWeek > 22) {
      throw new Error('Choose a valid fantasy week before exporting.');
    }

    runIdRef.current += 1;
    const runId = runIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => runIdRef.current === runId && !controller.signal.aborted;
    const update = (next) => {
      if (isCurrent()) setState((current) => ({ ...current, ...next }));
    };
    const warnings = [];
    const playersMap = players ?? {};
    const statsMap = normalizeWeeklyMap(weeklyStats);
    let loadedPlayers = playersMap;
    let selectedWeekStats = {};
    let selectedWeekStatsSucceeded = false;
    let currentSeasonStats = seasonStats ?? null;
    let historySnapshots = [];
    let historyCurrentSnapshot = null;
    let currentMatchups = [];
    let matchupSucceeded = false;
    let nflBundle = null;
    let nflError = null;
    let marketValuesByPlayer = {};
    let marketValueSource = null;
    let marketValueError = null;
    let historyRequestedCount = 0;
    let historyLoadedCount = 0;
    let historySelectedLoaded = false;
    const exportStartedAt = new Date().toISOString();

    try {
      update({
        status: 'loading',
        error: null,
        result: null,
        progress: { label: 'Loading player directory', completed: 0, total: 5 },
      });

      try {
        loadedPlayers = await loadPlayers?.() ?? loadedPlayers;
      } catch (error) {
        warnings.push(`Player directory unavailable: ${error?.message ?? 'unknown error'}`);
      }
      throwIfAborted(controller.signal);
      update({ progress: { label: 'Loading player directory', completed: 1, total: 5 } });

      try {
        selectedWeekStats = await getWeeklyStats(normalizedSeason, normalizedWeek);
        selectedWeekStatsSucceeded = Boolean(selectedWeekStats && typeof selectedWeekStats === 'object');
      } catch (error) {
        warnings.push(`Selected-week player stats unavailable: ${error?.message ?? 'unknown error'}`);
      }
      throwIfAborted(controller.signal);

      let fullWeeklyStats = statsMap;
      if (!Object.keys(fullWeeklyStats).length) {
        const failedWeeks = [];
        update({ progress: { label: 'Loading fantasy player stats', completed: 0, total: FULL_SEASON_WEEKS } });
        fullWeeklyStats = await getAllWeeklyStats(
          normalizedSeason,
          FULL_SEASON_WEEKS,
          (completed, total) => update({ progress: { label: 'Loading fantasy player stats', completed, total } }),
          failedWeeks,
        );
        if (failedWeeks.length) {
          warnings.push(`Sleeper player stats were unavailable for weeks: ${failedWeeks.join(', ')}.`);
        }
        currentSeasonStats = aggregateSeasonStats(fullWeeklyStats);
      }
      fullWeeklyStats = mergeWeekIntoStats(fullWeeklyStats, selectedWeekStats, normalizedWeek);
      const rawWeeklyStatsByPlayer = buildRawWeekMap(
        selectedWeekStats,
        fullWeeklyStats,
        normalizedWeek,
        !selectedWeekStatsSucceeded,
      );
      if (!selectedWeekStatsSucceeded && Object.keys(rawWeeklyStatsByPlayer).length) {
        warnings.push('The export used the loaded fantasy stats cache for the selected week.');
      }
      currentSeasonStats = aggregateSeasonStats(fullWeeklyStats);
      throwIfAborted(controller.signal);
      update({ progress: { label: 'Loading fantasy player stats', completed: 2, total: 5 } });

      try {
        currentMatchups = await loadMatchups(selectedLeagueId, normalizedWeek) ?? [];
        matchupSucceeded = true;
      } catch (error) {
        warnings.push(`Fantasy matchup rows unavailable: ${error?.message ?? 'unknown error'}`);
      }
      throwIfAborted(controller.signal);
      update({ progress: { label: 'Loading fantasy matchup outcomes', completed: 3, total: 5 } });

      if (includeHistory) {
        const eligibleEntries = (linkedLeagueHistory ?? [])
          .filter((entry) => Number(entry.season) <= Number(normalizedSeason))
          .sort((left, right) => Number(left.season) - Number(right.season));
        if (!eligibleEntries.some((entry) => String(entry.season) === normalizedSeason)) {
          eligibleEntries.push({ season: normalizedSeason, league });
        }
        historyRequestedCount = eligibleEntries.length;
        update({ progress: { label: 'Loading league history and records', completed: 2, total: 5 } });
        const loadedSnapshots = await mapWithConcurrency(
          eligibleEntries,
          HISTORY_CONCURRENCY,
          async (entry) => {
            try {
              return await getLeagueHistorySnapshot({
                league: entry.league,
                season: entry.season,
                completed: Number(entry.season) < Number(normalizedSeason),
              });
            } catch (error) {
              warnings.push(`${entry.season} league history unavailable: ${error?.message ?? 'unknown error'}`);
              return null;
            }
          },
        );
        const selectedHistory = loadedSnapshots.find((snapshot) => String(snapshot?.season) === normalizedSeason);
        if (!matchupSucceeded && selectedHistory) {
          const fallbackMatchups = selectedHistory.matchupsByWeek?.[normalizedWeek]
            ?? selectedHistory.matchupsByWeek?.[String(normalizedWeek)]
            ?? [];
          if (fallbackMatchups.length) {
            currentMatchups = fallbackMatchups;
            matchupSucceeded = true;
            warnings.push('The export used selected-season history for the matchup rows.');
          }
        }
        historyLoadedCount = loadedSnapshots.filter(Boolean).length;
        historySelectedLoaded = Boolean(selectedHistory);
        historyCurrentSnapshot = truncateHistorySnapshot(selectedHistory, normalizedWeek, currentMatchups);
        historySnapshots = loadedSnapshots
          .filter((snapshot) => snapshot && String(snapshot.season) !== normalizedSeason);
        if (!historyCurrentSnapshot) {
          warnings.push('Selected-season history was unavailable; records are based on this export week.');
        }
      }
      throwIfAborted(controller.signal);

      update({ progress: { label: 'Loading NFL scoreboard and detail', completed: 3, total: 5 } });
      try {
        nflBundle = await getStatisticsScoresWeekExport({
          season: normalizedSeason,
          phase: 'regular',
          week: normalizedWeek,
          detail: nflDetail,
          signal: controller.signal,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        nflError = error;
        warnings.push(`NFL package unavailable: ${error?.message ?? 'unknown error'}`);
      }
      throwIfAborted(controller.signal);
      update({ progress: { label: 'Loading NFL scoreboard and detail', completed: 4, total: 5 } });

      if (includeMarketValues) {
        try {
          const playerIds = new Set([
            ...Object.keys(fullWeeklyStats),
            ...Object.keys(selectedWeekStats ?? {}),
            ...rosters.flatMap((roster) => roster?.players ?? []),
            ...currentMatchups.flatMap((row) => [
              ...(row?.players ?? []),
              ...Object.keys(row?.players_points ?? {}),
            ]),
          ].map(key).filter(Boolean));
          const market = await loadMarketValues({
            league,
            players: loadedPlayers,
            scoringSettings: activeScoringSettings ?? scoringSettings,
            playerIds: [...playerIds],
          });
          marketValuesByPlayer = market.values;
          marketValueSource = market.source;
        } catch (error) {
          marketValueError = error;
          warnings.push(`Current market values unavailable: ${error?.message ?? 'unknown error'}`);
        }
      }
      throwIfAborted(controller.signal);
      update({ progress: { label: 'Packaging stats export', completed: 5, total: 5 } });

      const currentMatchupsByWeek = {
        ...(historyCurrentSnapshot?.matchupsByWeek ?? {}),
        [normalizedWeek]: currentMatchups,
      };
      const result = buildGameWeekExport({
        season: normalizedSeason,
        fantasyWeek: normalizedWeek,
        nflPhase: 'regular',
        nflWeek: normalizedWeek,
        platform,
        league,
        rosters,
        leagueUsers,
        players: loadedPlayers,
        weeklyStatsByPlayer: fullWeeklyStats,
        rawWeeklyStatsByPlayer,
        seasonStatsByPlayer: currentSeasonStats,
        scoringSettings: activeScoringSettings ?? scoringSettings,
        matchupRows: currentMatchups,
        historySnapshots,
        historyCurrentSnapshot,
        currentMatchupsByWeek,
        nflBundle,
        marketValuesByPlayer,
        coverage: {
          weeklyPlayerStats: {
            status: selectedWeekStatsSucceeded ? 'complete' : Object.keys(rawWeeklyStatsByPlayer).length ? 'partial' : 'unavailable',
            players: Object.keys(rawWeeklyStatsByPlayer).length,
            scope: 'selected_week',
          },
          fantasyMatchups: {
            status: matchupSucceeded ? 'complete' : 'unavailable',
            rows: currentMatchups.length,
          },
          nflGames: {
            status: nflBundle?.coverage?.scoreboard ?? 'unavailable',
            games: nflBundle?.games?.length ?? 0,
          },
          nflBoxScores: nflBundle?.coverage?.boxScores ?? 'unavailable',
          nflPlayByPlay: nflBundle?.coverage?.playByPlay ?? 'unavailable',
          leagueHistory: includeHistory
            ? {
                status: historyLoadedCount === historyRequestedCount && historySelectedLoaded
                  ? 'complete'
                  : historyLoadedCount > 0
                    ? 'partial'
                    : 'unavailable',
                seasons: [
                  ...(historySnapshots ?? []).map((snapshot) => String(snapshot.season)),
                  ...(historyCurrentSnapshot ? [normalizedSeason] : []),
                ],
              }
            : { status: 'not_requested', seasons: [] },
          marketValues: includeMarketValues
            ? {
                status: Object.keys(marketValuesByPlayer).length ? 'complete' : 'unavailable',
                players: Object.keys(marketValuesByPlayer).length,
              }
            : { status: 'not_requested', players: 0 },
        },
        sources: {
          fantasy: {
            endpoints: ['Sleeper weekly stats', 'Sleeper matchups', 'Sleeper league history'],
            selectedWeekFetchedAt: exportStartedAt,
          },
          nflScoreboard: nflBundle ? {
            provider: nflBundle.provider,
            fetchedAt: nflBundle.freshness?.providerFetchedAt ?? nflBundle.cache?.fetchedAt ?? null,
          } : null,
          nflDetails: nflBundle ? {
            provider: nflBundle.provider,
            detailLevel: nflBundle.detailLevel,
            fetchedAt: nflBundle.freshness?.providerFetchedAt ?? nflBundle.cache?.fetchedAt ?? null,
          } : null,
          marketValues: marketValueSource,
        },
        warnings: [
          ...warnings,
          ...(nflError ? [`NFL detail error: ${nflError.message}`] : []),
          ...(marketValueError ? [`Market value error: ${marketValueError.message}`] : []),
        ],
      });
      const filename = `gridshift-${slugify(league.name)}-${normalizedSeason}-week-${normalizedWeek}-stats.json`;
      downloadGameWeekExport(result, filename);
      if (isCurrent()) {
        setState({
          status: 'ready',
          progress: { label: 'Downloaded stats export', completed: 5, total: 5 },
          error: null,
          result,
        });
      }
      return result;
    } catch (error) {
      if (isAbortError(error)) return null;
      if (isCurrent()) {
        setState({
          status: 'error',
          progress: { label: '', completed: 0, total: 1 },
          error: error?.message ?? 'Could not create the stats export.',
          result: null,
        });
      }
      throw error;
    } finally {
      if (runIdRef.current === runId) controllerRef.current = null;
    }
  }, [
    activeScoringSettings,
    league,
    leagueUsers,
    linkedLeagueHistory,
    loadMatchups,
    loadPlayers,
    platform,
    players,
    rosters,
    season,
    scoringSettings,
    seasonStats,
    selectedLeagueId,
    weeklyStats,
  ]);

  useEffect(() => () => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  return {
    ...state,
    busy: state.status === 'loading',
    runExport,
    cancel,
    reset,
    availableSeasons: AVAILABLE_SLEEPER_SEASONS,
  };
}
