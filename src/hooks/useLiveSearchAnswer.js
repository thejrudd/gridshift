// ── Live answer for the search palette ─────────────────────────────────────
// Runs the one network request global search makes, for a live question only:
// after the input settles, aborted when the query changes, and answered from
// liveSource's short cache when the same week was just read.
//
// Returns the live card, or `unavailable` when the server has live data but the
// request failed — the palette then says so beside the ordinary results. With
// live data off on the server, it returns neither and nothing is shown.

import { useEffect, useMemo, useState } from 'react';

import {
  attachGameHighlights,
  buildLiveAnswer,
  gamesNeedingDetail,
  getLiveRequest,
} from '../utils/globalSearch/answers/live.js';
import { selectThisWeeksGames } from '../utils/globalSearch/suggestions.js';
import { KIND_NFL_TEAM } from '../utils/globalSearch/entities/record.js';
import { canonicalTeam } from '../utils/nflPlays/fieldSpots.js';
import {
  LIVE_STATE_ERROR,
  LIVE_STATE_OK,
  loadLiveGameDetail,
  loadLiveWeek,
} from '../utils/globalSearch/live/liveSource.js';

const SETTLE_MS = 300;

export default function useLiveSearchAnswer({ slots, groups, index, leagueId }) {
  const request = useMemo(() => getLiveRequest(slots, groups), [groups, slots]);

  const { season, week } = useMemo(() => {
    const game = selectThisWeeksGames(index)[0];
    return { season: game?.meta?.season ?? null, week: game?.meta?.week ?? null };
  }, [index]);

  const requestKey = request && leagueId && season && week
    ? JSON.stringify([leagueId, season, week])
    : null;

  const [loaded, setLoaded] = useState({ key: null, result: null });

  useEffect(() => {
    if (!requestKey) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadLiveWeek({ leagueId, season, week, signal: controller.signal })
        .then((result) => setLoaded({ key: requestKey, result }))
        .catch(() => { /* Aborted by a newer query. */ });
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [leagueId, requestKey, season, week]);

  const teamNames = useMemo(() => {
    const names = {};
    for (const record of index?.records ?? []) {
      if (record.kind === KIND_NFL_TEAM) names[canonicalTeam(record.meta?.teamId ?? record.id)] = record.label;
    }
    return names;
  }, [index]);

  const base = useMemo(() => {
    const result = requestKey && loaded.key === requestKey ? loaded.result : null;
    if (!result) return { answer: null, unavailable: false };
    if (result.state === LIVE_STATE_ERROR) return { answer: null, unavailable: true };
    if (result.state !== LIVE_STATE_OK) return { answer: null, unavailable: false };
    return {
      answer: buildLiveAnswer(request, result.games, { index, week, teamNames }),
      unavailable: false,
    };
  }, [index, loaded, request, requestKey, teamNames, week]);

  // A team card's started games get their box score in a second, smaller
  // request each. The score shows first; the highlights fill in under it.
  const detailIds = gamesNeedingDetail(base.answer).map((game) => game.gameId);
  const detailKey = detailIds.join(',');
  const [details, setDetails] = useState({ key: null, byId: {} });

  useEffect(() => {
    if (!detailKey) return undefined;
    const controller = new AbortController();
    const ids = detailKey.split(',');
    Promise.all(ids.map((gameId) => loadLiveGameDetail({ gameId, signal: controller.signal })))
      .then((payloads) => {
        const byId = {};
        ids.forEach((gameId, position) => { if (payloads[position]) byId[gameId] = payloads[position]; });
        setDetails({ key: detailKey, byId });
      })
      .catch(() => { /* Aborted by a newer query. */ });
    return () => controller.abort();
  }, [detailKey]);

  return useMemo(() => {
    if (!base.answer || !detailKey || details.key !== detailKey) return base;
    return { ...base, answer: attachGameHighlights(base.answer, details.byId) };
  }, [base, detailKey, details]);
}
