import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { applyKtcMultipliers, computeKtcMultipliers, fetchKtcPlayers } from '../utils/ktcApi';
import { buildTradeAnalyticsSnapshot } from '../utils/tradeAnalytics';
import { detectLeagueType } from '../utils/tradeEngine';

function hasRecordedSeasonProduction(seasonStats) {
  return Object.values(seasonStats ?? {}).some((stats) => {
    const gamesPlayed = Number(stats?.gp ?? stats?.games_played ?? stats?.gamesPlayed);
    return Number.isFinite(gamesPlayed) && gamesPlayed > 0;
  });
}

function getPreviousSeasonKey(season) {
  const seasonYear = Number(season);
  return Number.isInteger(seasonYear) && seasonYear > 0 ? String(seasonYear - 1) : null;
}

function hasCompletedScoredLeg(league) {
  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  return Number.isFinite(lastScoredLeg) && lastScoredLeg > 0;
}

function getKtcFormat(league) {
  return league?.settings?.type === 2 ? 'dynasty' : 'redraft';
}

export default function useTradeProposalValues() {
  const { platform, league, rosters, season, scoringSettings } = useSleeperLeague();
  const { players, seasonStats, statsBySeason, loadPlayers, loadSeasonStats, loadStatsForSeason, statsLoading } = useSleeperStats();
  const [ktcPlayers, setKtcPlayers] = useState(null);
  const [dynastyKtcPlayers, setDynastyKtcPlayers] = useState(null);

  const format = getKtcFormat(league);
  const leagueType = detectLeagueType(league);
  const previousSeasonKey = getPreviousSeasonKey(season);
  const usePriorSeasonProduction = !hasRecordedSeasonProduction(seasonStats)
    && !hasCompletedScoredLeg(league);
  const valuationSeasonStats = usePriorSeasonProduction && previousSeasonKey
    ? statsBySeason?.[previousSeasonKey]?.seasonStats ?? null
    : seasonStats;

  useEffect(() => {
    if (platform !== 'sleeper' || !league) return undefined;
    let cancelled = false;
    const fetches = [fetchKtcPlayers(format)];
    if (format !== 'dynasty') fetches.push(fetchKtcPlayers('dynasty').catch(() => []));
    Promise.all(fetches).then(([formatPlayers, dynastyPlayers]) => {
      if (cancelled) return;
      if (dynastyPlayers?.length && format !== 'dynasty') {
        setKtcPlayers([...(formatPlayers ?? []), ...dynastyPlayers.filter((player) => player.position === 'RDP')]);
        setDynastyKtcPlayers(dynastyPlayers.filter((player) => player.position !== 'RDP'));
      } else {
        setKtcPlayers(formatPlayers ?? []);
        setDynastyKtcPlayers(null);
      }
    }).catch(() => {
      if (!cancelled) {
        setKtcPlayers(null);
        setDynastyKtcPlayers(null);
      }
    });
    return () => { cancelled = true; };
  }, [format, league, platform]);

  useEffect(() => {
    if (platform !== 'sleeper' || players) return;
    void loadPlayers();
  }, [loadPlayers, platform, players]);

  useEffect(() => {
    if (platform !== 'sleeper' || seasonStats || statsLoading) return;
    void loadSeasonStats().catch(() => null);
  }, [loadSeasonStats, platform, seasonStats, statsLoading]);

  useEffect(() => {
    if (!usePriorSeasonProduction || !previousSeasonKey || valuationSeasonStats) return;
    void loadStatsForSeason(previousSeasonKey).catch(() => null);
  }, [loadStatsForSeason, previousSeasonKey, usePriorSeasonProduction, valuationSeasonStats]);

  const adjustedKtcPlayers = useMemo(
    () => applyKtcMultipliers(ktcPlayers, computeKtcMultipliers(scoringSettings, league?.roster_positions)),
    [ktcPlayers, league?.roster_positions, scoringSettings],
  );
  const adjustedDynastyKtcPlayers = useMemo(
    () => applyKtcMultipliers(dynastyKtcPlayers, computeKtcMultipliers(scoringSettings, league?.roster_positions)),
    [dynastyKtcPlayers, league?.roster_positions, scoringSettings],
  );
  const analytics = useMemo(() => buildTradeAnalyticsSnapshot({
    league,
    rosters,
    players,
    seasonStats,
    valuationSeasonStats,
    scoringSettings,
    adjustedKtcPlayers,
    adjustedDynastyKtcPlayers,
    leagueType,
    includePlayerTradeValues: true,
  }), [adjustedDynastyKtcPlayers, adjustedKtcPlayers, league, leagueType, players, rosters, scoringSettings, seasonStats, valuationSeasonStats]);

  const getAssetValue = useCallback((asset) => {
    if (asset?.type !== 'player') return null;
    return analytics.playerTradeValueMap?.get(String(asset.id)) ?? null;
  }, [analytics.playerTradeValueMap]);

  return { getAssetValue, valuesReady: Boolean(analytics.playerTradeValueMap) };
}
