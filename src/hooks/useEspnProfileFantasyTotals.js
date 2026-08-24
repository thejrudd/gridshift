import { useEffect, useMemo, useState } from 'react';
import { calcPoints } from '../utils/scoringEngine.js';
import {
  getEspnFantasyPlayerId,
  isEspnFantasyGameLogPosition,
  loadEspnFantasyGameLogRows,
} from '../utils/espnFantasyGameLogRows.js';

const ESPN_PROFILE_TOTAL_CACHE = new Map();
const ESPN_PROFILE_TOTAL_CACHE_VERSION = 'league-active-weeks-v1';

export function isEspnProfileFantasyPosition(position) {
  return isEspnFantasyGameLogPosition(position);
}

export function getPlayerEspnId(player, fallbackId) {
  return getEspnFantasyPlayerId(player, fallbackId);
}

function getProfileTotalCacheKey({ season, player, playerId, scoringSettings, maxWeek }) {
  const espnId = getPlayerEspnId(player, playerId);
  const scoringVersion = JSON.stringify({
    settings: scoringSettings?.settings ?? scoringSettings ?? {},
    positionOverrides: scoringSettings?.positionOverrides ?? {},
  });
  return espnId ? `${ESPN_PROFILE_TOTAL_CACHE_VERSION}:${season}:${espnId}:${maxWeek ?? 'all'}:${scoringVersion}` : null;
}

async function loadEspnProfileFantasyTotal({ playerId, player, season, scoringSettings, maxWeek = null }) {
  const espnId = getPlayerEspnId(player, playerId);
  if (!espnId || !isEspnProfileFantasyPosition(player?.position)) return null;

  const cacheKey = getProfileTotalCacheKey({ season, player, playerId, scoringSettings, maxWeek });
  if (cacheKey && ESPN_PROFILE_TOTAL_CACHE.has(cacheKey)) return ESPN_PROFILE_TOTAL_CACHE.get(cacheKey);

  const rows = await loadEspnFantasyGameLogRows({
    playerId,
    player,
    season,
    scoringSettings,
  });

  const maxFantasyWeek = Number(maxWeek);
  const hasMaxFantasyWeek = Number.isFinite(maxFantasyWeek) && maxFantasyWeek > 0;
  const scoringRows = rows.filter((row) => {
    const week = Number(row?.week);
    if (!Number.isFinite(week) || row?._isPostseason) return false;
    return !hasMaxFantasyWeek || week <= maxFantasyWeek;
  });
  const total = scoringRows.reduce((sum, row) => sum + calcPoints(row, scoringSettings, player?.position), 0);
  const games = scoringRows.length;
  const result = games > 0
    ? {
        total,
        games,
        avg: Math.round((total / games) * 10) / 10,
        rows: scoringRows,
      }
    : null;
  if (cacheKey) ESPN_PROFILE_TOTAL_CACHE.set(cacheKey, result);
  return result;
}

export default function useEspnProfileFantasyTotals({
  enabled,
  candidates,
  season,
  scoringSettings,
  maxWeek = null,
  maxPlayers = Infinity,
}) {
  const candidateKey = useMemo(
    () => (candidates ?? []).map(({ id }) => id).join('|'),
    [candidates],
  );
  const [totals, setTotals] = useState({});
  const [resolved, setResolved] = useState({});

  useEffect(() => {
    if (!enabled || !season || !scoringSettings || !(candidates ?? []).length) return undefined;
    const loadCandidates = (candidates ?? [])
      .filter(({ id, player }) => player && isEspnProfileFantasyPosition(player.position) && getPlayerEspnId(player, id))
      .slice(0, maxPlayers);
    if (!loadCandidates.length) return undefined;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const { id } of loadCandidates) next[id] = false;
        return next;
      });
    });

    Promise.all(loadCandidates.map(async ({ id, player }) => {
      try {
        const total = await loadEspnProfileFantasyTotal({
          playerId: id,
          player,
          season,
          scoringSettings,
          maxWeek,
        });
        return [id, total];
      } catch {
        return [id, null];
      }
    })).then((entries) => {
      if (cancelled) return;
      setTotals((prev) => {
        const next = { ...prev };
        for (const [id, total] of entries) {
          if (total) next[id] = total;
        }
        return next;
      });
      setResolved((prev) => {
        const next = { ...prev };
        for (const [id] of entries) next[id] = true;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, candidateKey, season, scoringSettings, maxWeek, maxPlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  return { totals, resolved };
}
