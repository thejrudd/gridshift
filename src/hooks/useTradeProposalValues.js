import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSleeperLeague, useSleeperStats } from '../context/SleeperContext';
import { applyKtcMultipliers, computeKtcMultipliers, fetchKtcPlayers } from '../utils/ktcApi';
import { buildTradeAnalyticsSnapshot } from '../utils/tradeAnalytics';
import { detectLeagueType } from '../utils/tradeEngine';
import { hasGeneratedProductionTradeValues } from '../utils/idpEngine';

function getPreviousSeasonKey(season) {
  const seasonYear = Number(season);
  return Number.isInteger(seasonYear) && seasonYear > 0 ? String(seasonYear - 1) : null;
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
  const needsGeneratedProductionFallback = hasGeneratedProductionTradeValues(league?.roster_positions);
  const priorSeasonStats = previousSeasonKey
    ? statsBySeason?.[previousSeasonKey]?.seasonStats ?? null
    : null;

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
    if (platform !== 'sleeper' || !needsGeneratedProductionFallback || !previousSeasonKey || priorSeasonStats) return;
    void loadStatsForSeason(previousSeasonKey).catch(() => null);
  }, [loadStatsForSeason, needsGeneratedProductionFallback, platform, previousSeasonKey, priorSeasonStats]);

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
    priorSeasonStats,
    scoringSettings,
    adjustedKtcPlayers,
    adjustedDynastyKtcPlayers,
    leagueType,
    includePlayerTradeValues: true,
  }), [adjustedDynastyKtcPlayers, adjustedKtcPlayers, league, leagueType, players, priorSeasonStats, rosters, scoringSettings, seasonStats]);

  const getAssetValue = useCallback((asset) => {
    if (asset?.type !== 'player') return null;
    return analytics.playerTradeValueMap?.get(String(asset.id)) ?? null;
  }, [analytics.playerTradeValueMap]);

  return { getAssetValue, valuesReady: Boolean(analytics.playerTradeValueMap) };
}
