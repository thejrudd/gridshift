// ── PlayerMatchupCompare ─────────────────────────────────────────────────────
// Two-player sibling of PlayerMatchupBreakdown.jsx — same pmd-* design system
// and data pipeline (phase detection, projection, opponent context, season
// rank/defense splits via buildPlayerDefensePerformance), but every slot is
// mirrored so both players read against each other directly instead of each
// reading against their own single-player benchmark.
//
// Replaces the flatter Tale of the Tape modal at the same call site
// (CompanionMatchup.jsx's per-slot "Compare" action).

import { useMemo } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_SCORING } from '../../utils/scoringEngine';
import { formatWeather } from '../../api/weatherApi';
import { getTeamColorKey } from '../../data/teamColors.js';
import { getNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import { buildFantasyScoringBreakdown } from '../../utils/fantasyBreakdownRows.js';
import { areCompatibleProviderIdentities, getProviderPlayerIdentity } from '../../utils/providerPlayerIdentity.js';
import Modal from '../Modal';
import PlayerAvatar from '../shared/PlayerAvatar.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
import {
  buildPlayerProjectionBreakdown,
  describePlayerNegativeStats,
  describePlayerStandoutStat,
  getPlayerMatchupPhase,
  matchupNumber,
  resolvePlayerDisplayProjection,
} from '../../utils/playerMatchupPresentation.js';
import { buildPlayerDefensePerformance, buildPlayerFormRows } from '../../utils/playerDefensePerformance.js';
import {
  getMatchupProjectionBaselines, selectPlayerProjectionBaselineWeeks,
} from '../../utils/matchupProjectionBaseline.js';
import {
  STAT_LABELS, formatNumber, formatOrdinal, formatStat, signed,
  getChartMaximum, getChartPosition, getOpponentEvidenceLabel, getSeasonBenchmark,
} from './PlayerMatchupBreakdown.jsx';
import './PlayerMatchupBreakdown.css';

// ── per-side model ───────────────────────────────────────────────────────────

function summarizeCompareHistory(rows) {
  if (!rows?.length) return null;
  const points = rows.map(row => matchupNumber(row?.points)).filter(value => value != null);
  if (!points.length) return null;
  return {
    games: points.length,
    points: points.reduce((sum, value) => sum + value, 0),
    average: points.reduce((sum, value) => sum + value, 0) / points.length,
    high: Math.max(...points),
    last: points[points.length - 1],
  };
}

function buildCompareVenueHistory(gameRows) {
  return {
    home: summarizeCompareHistory(gameRows.filter(row => row.isHome === true)),
    road: summarizeCompareHistory(gameRows.filter(row => row.isHome === false)),
  };
}

function resolveComparePlayerId(player, players) {
  const sourceId = player?.id;
  if (sourceId == null || !players) return sourceId ?? null;

  const directId = String(sourceId);
  const directPlayer = players[directId] ?? null;
  const displayIdentity = getProviderPlayerIdentity({
    name: player?.name ?? player?.displayName ?? player?.full_name,
    team: player?.team ?? player?.teamId ?? player?.teamName,
    position: player?.position,
  });
  if (!displayIdentity) return directId;

  const identityFor = (candidate) => getProviderPlayerIdentity({
    name: candidate?.name ?? candidate?.displayName ?? candidate?.full_name
      ?? [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' '),
    team: candidate?.team ?? candidate?.teamId ?? candidate?.teamName,
    position: candidate?.position,
  });
  const directIdentity = identityFor(directPlayer);
  if (directPlayer && (!directIdentity || areCompatibleProviderIdentities(directIdentity, displayIdentity))) {
    return directId;
  }

  const identityMatch = Object.entries(players).find(([candidateId, candidate]) => (
    candidateId !== directId && areCompatibleProviderIdentities(identityFor(candidate), displayIdentity)
  ));
  return identityMatch?.[0] ?? directId;
}

function buildCompareDisplayPlayer(player, players, resolvedPlayerId) {
  const rawPlayer = players?.[resolvedPlayerId];
  if (!rawPlayer || String(player?.id) === String(resolvedPlayerId)) return player;
  return {
    ...rawPlayer,
    ...player,
    id: resolvedPlayerId,
    name: player?.name ?? player?.displayName ?? rawPlayer.full_name ?? rawPlayer.name ?? rawPlayer.displayName,
    team: player?.team ?? player?.teamId ?? rawPlayer.team,
    position: player?.position ?? rawPlayer.position,
  };
}

function usePlayerCompareModel({ player, week, baseline, weeklyStats, activeScoringSettings, players, scheduleMap, leagueId, season }) {
  const resolvedPlayerId = useMemo(() => resolveComparePlayerId({
    id: player?.id,
    name: player?.name,
    displayName: player?.displayName,
    full_name: player?.full_name,
    team: player?.team,
    teamId: player?.teamId,
    teamName: player?.teamName,
    position: player?.position,
  }, players), [player?.displayName, player?.full_name, player?.id, player?.name, player?.position, player?.team, player?.teamId, player?.teamName, players]);
  const comparePlayer = buildCompareDisplayPlayer(player, players, resolvedPlayerId);
  const resolvedBaseline = baseline?.playerId != null
    && String(baseline.playerId) !== String(resolvedPlayerId)
    ? null
    : baseline;
  const phase = getPlayerMatchupPhase({ scheduleEntry: player?.scheduleEntry, gameStarted: player?.gameStarted });
  const isPregame = phase === 'pregame';
  const position = player?.position ?? null;

  const weekEntry = (() => {
    if (!resolvedPlayerId || isPregame) return null;
    const entry = weeklyStats?.[resolvedPlayerId]?.find(w => w.week === week) ?? null;
    const fallbackPoints = matchupNumber(player?.weekPts);
    if (entry) return entry;
    if (!Number.isFinite(fallbackPoints)) return null;
    return { week, _fantasyPoints: fallbackPoints, fantasy_points: fallbackPoints };
  })();

  const { breakdown, total } = useMemo(() => {
    if (!weekEntry) return { breakdown: [], total: null };
    const result = buildFantasyScoringBreakdown(weekEntry, activeScoringSettings ?? DEFAULT_SCORING, position);
    return { breakdown: result.rows, total: result.total };
  }, [weekEntry, activeScoringSettings, position]);

  const projectionView = useMemo(
    () => resolvePlayerDisplayProjection({ isPregame, projection: player?.projection ?? null, baseline: resolvedBaseline }),
    [isPregame, player?.projection, resolvedBaseline],
  );
  const displayProjection = projectionView.projection;
  const projectedBreakdown = useMemo(
    () => buildPlayerProjectionBreakdown(displayProjection, activeScoringSettings ?? DEFAULT_SCORING, position),
    [displayProjection, activeScoringSettings, position],
  );

  const peerModel = useMemo(() => buildPlayerDefensePerformance({
    playerId: resolvedPlayerId, oppTeam: player?.oppTeam, weeklyStats, players, scheduleMap,
    currentWeek: week, scoringSettings: activeScoringSettings ?? DEFAULT_SCORING,
  }), [activeScoringSettings, player?.oppTeam, players, resolvedPlayerId, scheduleMap, week, weeklyStats]);

  // Peer rankings and defense tiers remain gated by a complete NFL slate, but
  // the selected player's own season form can use every valid weekly row up to
  // the selected week. Otherwise a partial provider schedule makes the visible
  // PPG/total/high/games rows undercount the player while the matchup is already
  // showing those games elsewhere.
  const formThroughWeek = Number.isFinite(Number(week))
    ? phase === 'final' ? Number(week) : Number(week) - 1
    : null;
  const formGameRows = useMemo(() => buildPlayerFormRows({
    playerId: resolvedPlayerId,
    player: players?.[resolvedPlayerId] ?? { position: player?.position, team: player?.team },
    weeklyStats,
    scheduleMap,
    scoringSettings: activeScoringSettings ?? DEFAULT_SCORING,
    throughWeek: formThroughWeek,
  }), [activeScoringSettings, formThroughWeek, player?.position, player?.team, players, resolvedPlayerId, scheduleMap, weeklyStats]);
  const gameRows = useMemo(
    () => formGameRows.length ? formGameRows : (peerModel?.overall?.gameRows ?? []),
    [formGameRows, peerModel?.overall?.gameRows],
  );
  const formSummary = summarizeCompareHistory(gameRows);
  const formPeerModel = peerModel
    ? {
      ...peerModel,
      overall: {
        ...peerModel.overall,
        games: formSummary?.games ?? 0,
        points: formSummary?.points ?? 0,
        ppg: formSummary?.average ?? null,
        gameRows,
      },
    }
    : peerModel;
  const seasonBenchmark = getSeasonBenchmark({ player: comparePlayer, peerModel: formPeerModel, projection: displayProjection });
  const opponentContext = player?.opponentFantasyContext ?? (player?.defStrength ? {
    ...player.defStrength, team: player?.oppTeam, position,
    currentGames: player.defStrength.gamesAnalyzed, evidenceKind: 'current',
  } : null);
  const heroValue = isPregame ? matchupNumber(displayProjection?.projected) : matchupNumber(total);
  const statRows = isPregame ? (projectedBreakdown?.rows ?? []) : breakdown;
  const statByKey = new Map(statRows.map(row => [row.key ?? row.statKey, row]));

  const rankValue = matchupNumber(player?.rank?.rank);
  const peerCount = matchupNumber(player?.rank?.posCount);
  const rankLabel = player?.rank?.posLabel ?? position ?? '';

  const ladderRows = gameRows.slice(-5).reverse();

  // Season average as it stood after each week, so the ladder's benchmark moves
  // with the season instead of judging Week 1 against a full-season number.
  const averageByWeek = useMemo(() => {
    const map = new Map();
    let running = 0;
    gameRows.forEach((row, index) => {
      running += matchupNumber(row.points) ?? 0;
      map.set(row.week, running / (index + 1));
    });
    return map;
  }, [gameRows]);

  // Projections are only known for weeks this league was open pregame, so weeks
  // without a recorded baseline simply carry no projection marker.
  const recordedProjectionsByWeek = useMemo(() => selectPlayerProjectionBaselineWeeks(
    getMatchupProjectionBaselines(),
    { leagueId, season, playerId: resolvedPlayerId, scoringSettings: activeScoringSettings ?? DEFAULT_SCORING },
  ), [leagueId, season, resolvedPlayerId, activeScoringSettings]);

  const projectionByWeek = useMemo(() => {
    const map = new Map(Object.entries(recordedProjectionsByWeek).map(([key, value]) => [Number(key), value]));
    const baselineWeek = Number(resolvedBaseline?.week);
    const baselineProjection = matchupNumber(resolvedBaseline?.projection?.projected);
    if (Number.isFinite(baselineWeek) && baselineProjection != null) map.set(baselineWeek, baselineProjection);
    const current = matchupNumber(displayProjection?.projected);
    // A current pregame projection is a valid going-into-that-week marker. An
    // available estimate on a started/final game is not a reconstructable
    // historical baseline and must not be presented as one.
    if (isPregame && current != null && !map.has(Number(week))) map.set(Number(week), current);
    return map;
  }, [displayProjection?.projected, isPregame, recordedProjectionsByWeek, resolvedBaseline, week]);
  const recentHistory = summarizeCompareHistory(gameRows.slice(-3));
  const venueHistory = buildCompareVenueHistory(gameRows);
  const seasonHigh = gameRows.length
    ? Math.max(...gameRows.map(row => matchupNumber(row.points)).filter(v => v != null))
    : null;

  const teamScore = matchupNumber(player?.scheduleEntry?.ptsFor);
  const opponentScore = matchupNumber(player?.scheduleEntry?.ptsAgainst);
  const finalScore = phase === 'final' && teamScore != null && opponentScore != null
    ? { teamScore, opponentScore }
    : null;

  return {
    id: resolvedPlayerId, name: comparePlayer?.name, position: comparePlayer?.position ?? position, team: comparePlayer?.team,
    availabilityStatus: player?.availabilityStatus, oppTeam: player?.oppTeam, isHome: player?.isHome,
    phase, isPregame, finalScore,
    weather: player?.weather, isIndoor: player?.isIndoor,
    total, displayProjection, projectionView,
    heroValue,
    rangeLow: matchupNumber(displayProjection?.min), rangeHigh: matchupNumber(displayProjection?.max),
    seasonBenchmark, opponentContext,
    rankValue, peerCount, rankLabel,
    ladderRows,
    averageByWeek,
    projectionByWeek,
    recentHistory,
    venueHistory,
    statRanks: peerModel?.statRanks ?? [],
    seasonAvg: formSummary?.average ?? matchupNumber(peerModel?.overall?.ppg),
    seasonPoints: formSummary?.points ?? matchupNumber(peerModel?.overall?.points),
    seasonHigh,
    gamesPlayed: formSummary?.games ?? matchupNumber(peerModel?.overall?.games),
    statByKey,
    player: comparePlayer,
  };
}

// ── verdict ───────────────────────────────────────────────────────────────────

const PRIMARY_TD_STAT_BY_POSITION = {
  QB: { key: 'pass_td', label: 'passing touchdown' },
  RB: { key: 'rush_td', label: 'rushing touchdown' },
  WR: { key: 'rec_td', label: 'receiving touchdown' },
  TE: { key: 'rec_td', label: 'receiving touchdown' },
};

function stableCompareStorySeed(left, right) {
  const source = [left?.id, right?.id, left?.oppTeam, right?.oppTeam, left?.position].join('|');
  return [...source].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

const POSITION_NOUNS = {
  QB: 'quarterbacks',
  RB: 'running backs',
  WR: 'wide receivers',
  TE: 'tight ends',
  K: 'kickers',
  DEF: 'team defenses',
};

function buildComparePregameVerdict(winner, loser, diff) {
  const position = winner.position ?? 'position';
  const positionNoun = POSITION_NOUNS[position] ?? `${position} players`;
  const winnerProjection = matchupNumber(winner.displayProjection?.projected) ?? matchupNumber(winner.heroValue);
  const loserProjection = matchupNumber(loser.displayProjection?.projected) ?? matchupNumber(loser.heroValue);
  if (winnerProjection == null || loserProjection == null) return null;
  const opponent = winner.oppTeam;
  const contextAllowed = matchupNumber(winner.opponentContext?.ptsAllowedPerGame);
  const contextLeagueAverage = matchupNumber(winner.opponentContext?.leagueAveragePtsAllowed);
  const contextDelta = matchupNumber(winner.opponentContext?.differenceFromLeagueAverage)
    ?? (contextAllowed != null && contextLeagueAverage != null ? contextAllowed - contextLeagueAverage : null);
  const allowed = matchupNumber(winner.opponentContext?.ptsAllowedPerGame);
  const defenseRank = matchupNumber(winner.opponentContext?.rank);
  const defenseCount = matchupNumber(winner.opponentContext?.teamCount);
  const defenseQuarter = defenseCount != null ? Math.max(1, Math.ceil(defenseCount / 4)) : null;
  const defenseTier = defenseRank != null && defenseQuarter != null
    ? defenseRank <= defenseQuarter ? 'tough'
      : defenseRank > defenseCount - defenseQuarter ? 'soft'
        : null
    : null;
  const matchupInsight = opponent && defenseTier
    ? `${defenseTier === 'tough' ? 'a tough' : 'a favorable'} ${position} draw against ${opponent} (#${defenseRank} of ${defenseCount} defenses)`
    : opponent && allowed != null && contextDelta != null && Math.abs(contextDelta) >= 0.75
      ? `${opponent} allowing ${allowed.toFixed(1)} fantasy points to ${positionNoun} per game, ${contextDelta > 0 ? 'above' : 'below'} the league average`
      : null;

  const seasonAverage = matchupNumber(winner.seasonAvg);
  const seasonDelta = winnerProjection != null && seasonAverage != null ? winnerProjection - seasonAverage : null;
  const seasonInsight = seasonDelta != null && Math.abs(seasonDelta) >= 0.5
    ? `the ${winnerProjection.toFixed(1)} forecast landing ${Math.abs(seasonDelta).toFixed(1)} ${seasonDelta >= 0 ? 'above' : 'below'} their ${seasonAverage.toFixed(1)} season average`
    : null;

  const recent = winner.recentHistory;
  const recentDelta = recent?.average != null && seasonAverage != null ? recent.average - seasonAverage : null;
  const recentInsight = recent?.games >= 2
    ? recentDelta != null && Math.abs(recentDelta) >= 0.75
      ? `their last ${recent.games} games averaging ${recent.average.toFixed(1)} points, ${Math.abs(recentDelta).toFixed(1)} ${recentDelta >= 0 ? 'above' : 'below'} their season rate`
      : `their last ${recent.games} games averaging ${recent.average.toFixed(1)} points`
    : null;
  const seasonHighInsight = recent?.games >= 2 && winner.seasonHigh != null && recent.high === winner.seasonHigh
    ? `a ${winner.seasonHigh.toFixed(1)}-point season high in their recent form`
    : null;

  const currentVenue = winner.isHome === true ? winner.venueHistory?.home
    : winner.isHome === false ? winner.venueHistory?.road
      : null;
  const otherVenue = winner.isHome === true ? winner.venueHistory?.road
    : winner.isHome === false ? winner.venueHistory?.home
      : null;
  const venueLabel = winner.isHome === true ? 'home' : winner.isHome === false ? 'road' : null;
  const venueInsight = currentVenue?.games >= 2
    ? otherVenue?.games >= 2 && Math.abs(currentVenue.average - otherVenue.average) >= 0.75
      ? `their ${currentVenue.average.toFixed(1)}-point average at ${venueLabel} versus ${otherVenue.average.toFixed(1)} at the other venue`
      : `a ${currentVenue.average.toFixed(1)}-point average across ${currentVenue.games} ${venueLabel} games`
    : null;

  const statRank = (winner.statRanks ?? [])
    .map(result => ({ ...result, rank: matchupNumber(result.rank), peerCount: matchupNumber(result.peerCount) }))
    .filter(result => result.rank != null && result.peerCount != null && result.rank <= Math.min(3, result.peerCount))
    .sort((a, b) => a.rank - b.rank)[0];
  const statRankInsight = statRank
    ? `a ${position}${statRank.rank} season rank in ${String(statRank.label).toLowerCase()}`
    : null;

  const winnerCeiling = matchupNumber(winner.rangeHigh);
  const loserCeiling = matchupNumber(loser.rangeHigh);
  const ceilingInsight = winnerCeiling != null && loserCeiling != null && winnerCeiling - loserCeiling >= 0.5
    ? `a higher likely ceiling of ${winnerCeiling.toFixed(1)} points versus ${loserCeiling.toFixed(1)}`
    : null;

  const insights = [
    matchupInsight ? { kind: 'defense', priority: defenseTier ? 4 : 3, text: matchupInsight } : null,
    venueInsight ? { kind: 'venue-history', priority: 4, text: venueInsight } : null,
    recentInsight ? { kind: 'recent-form', priority: recentDelta != null && Math.abs(recentDelta) >= 0.75 ? 3 : 2, text: recentInsight } : null,
    seasonHighInsight ? { kind: 'stat-history', priority: 3, text: seasonHighInsight } : null,
    statRankInsight ? { kind: 'stat-history', priority: 2, text: statRankInsight } : null,
    seasonInsight ? { kind: 'season-average', priority: 2, text: seasonInsight } : null,
    ceilingInsight ? { kind: 'ceiling', priority: 1, text: ceilingInsight } : null,
    opponent ? {
      kind: 'venue', priority: 1,
      text: winner.isHome === true ? `a home date against ${opponent}`
        : winner.isHome === false ? `a road date at ${opponent}`
          : `a date against ${opponent}`,
    } : null,
  ].filter(Boolean).sort((a, b) => b.priority - a.priority);
  const storySeed = stableCompareStorySeed(winner, loser);
  const primaryPool = insights.slice(0, Math.min(4, insights.length));
  const primary = primaryPool.length ? primaryPool[storySeed % primaryPool.length] : null;
  const secondaryPool = insights.filter(insight => insight !== primary && insight.kind !== primary?.kind && insight.priority >= 2);
  const eligibleSecondaryPool = secondaryPool.filter(insight => (primary?.text.length ?? 0) + insight.text.length <= 190);
  const secondary = eligibleSecondaryPool.length && storySeed % 3 !== 1
    ? eligibleSecondaryPool[(storySeed >>> 3) % eligibleSecondaryPool.length]
    : null;
  const leadTemplates = [
    `${winner.name} has the stronger ${position} forecast: ${winnerProjection.toFixed(1)} to ${loserProjection.toFixed(1)}, a ${diff.toFixed(1)}-point edge`,
    `The ${position} forecast leans ${winner.name}'s way by ${diff.toFixed(1)} points — ${winnerProjection.toFixed(1)} to ${loserProjection.toFixed(1)}`,
    `${winner.name} owns a ${diff.toFixed(1)}-point projection edge over ${loser.name}`,
    `This ${position} call tilts toward ${winner.name}: ${winnerProjection.toFixed(1)} against ${loserProjection.toFixed(1)}`,
    `${winner.name} takes the ${position} projection lead by ${diff.toFixed(1)} points`,
    `The numbers give ${winner.name} a ${diff.toFixed(1)}-point edge at ${position} — ${winnerProjection.toFixed(1)} to ${loserProjection.toFixed(1)}`,
    `${winner.name} enters this one ${diff.toFixed(1)} projected points clear of ${loser.name}`,
    `The pregame lean is ${winner.name}'s by ${diff.toFixed(1)} points at ${position}`,
  ];
  const lead = leadTemplates[stableCompareStorySeed(loser, winner) % leadTemplates.length];
  const evidence = [primary, secondary].filter(Boolean).map((insight, index) => `${index === 0 ? 'with' : 'plus'} ${insight.text}`).join(', ');
  return `${lead}${evidence ? `, ${evidence}` : ''}.`;
}

function buildCompareVerdict(left, right) {
  if (!left || !right) return null;
  const bothStarted = !left.isPregame && !right.isPregame;
  const bothFinal = left.phase === 'final' && right.phase === 'final';
  const bothPregame = left.isPregame && right.isPregame;

  if (bothStarted && left.heroValue != null && right.heroValue != null && left.heroValue !== right.heroValue) {
    const winner = left.heroValue > right.heroValue ? left : right;
    const loser = winner === left ? right : left;
    const diff = Math.abs(left.heroValue - right.heroValue);
    const verb = bothFinal ? 'outscored' : 'is outscoring';
    const timeframe = bothFinal ? 'this week' : 'so far';
    let sentence = `${winner.name} ${verb} ${loser.name} by ${diff.toFixed(1)} points ${timeframe}`;

    const winnerProjected = matchupNumber(winner.displayProjection?.projected);
    if (winnerProjected != null) {
      const winnerProjDelta = winner.heroValue - winnerProjected;
      if (Math.abs(winnerProjDelta) >= 1) {
        sentence += `, ${winnerProjDelta >= 0 ? 'beating' : 'missing'} projections by ${Math.abs(winnerProjDelta).toFixed(1)} points`;
      }
    }

    const standout = describePlayerStandoutStat(winner);
    if (standout) sentence += ` with ${standout}`;
    const winnerNegatives = describePlayerNegativeStats(winner);
    if (winnerNegatives) sentence += ` despite ${winnerNegatives}`;
    sentence += '.';

    // A second sentence only when the trailing player had a genuinely bad
    // week: missed their own projection by a wide margin and was shut out on
    // their position's headline scoring stat.
    if (bothFinal) {
      const loserProjected = matchupNumber(loser.displayProjection?.projected);
      const loserNegatives = describePlayerNegativeStats(loser);
      if (loserNegatives) sentence += ` ${loser.name} was hurt by ${loserNegatives}.`;
      const primary = PRIMARY_TD_STAT_BY_POSITION[loser.position];
      if (!loserNegatives && loserProjected != null && primary) {
        const loserProjDelta = loser.heroValue - loserProjected;
        const loserHadNone = !(matchupNumber(loser.statByKey.get(primary.key)?.statVal) > 0);
        if (loserProjDelta <= -3 && loserHadNone) {
          sentence += ` ${loser.name} underperformed by ${loserProjDelta.toFixed(1)} without a single ${primary.label}.`;
        }
      }
    }

    return sentence;
  }

  if (bothPregame && left.heroValue != null && right.heroValue != null && Math.abs(left.heroValue - right.heroValue) >= 0.3) {
    const winner = left.heroValue > right.heroValue ? left : right;
    const loser = winner === left ? right : left;
    const diff = Math.abs(left.heroValue - right.heroValue);
    return buildComparePregameVerdict(winner, loser, diff);
  }

  return null;
}

// ── mirrored row primitives ─────────────────────────────────────────────────

function CompareRow({ label, sub, valA, valB, numA, numB, higher = 'better', neutral = false, nobar = false, highlight, subA, subB }) {
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const canCompare = !neutral && finite(numA) && finite(numB) && numA !== numB;
  const aLead = canCompare && (higher === 'lower' ? numA < numB : numA > numB);
  const bLead = canCompare && !aLead;
  const barMax = Math.max(Math.abs(numA ?? 0), Math.abs(numB ?? 0)) || 1;
  const barPct = (v) => (!neutral && !nobar && finite(v)) ? `${Math.min(1, Math.abs(v) / barMax) * 100}%` : '0%';

  return (
    <div className="pmd-cmp-row">
      <div className={`pmd-cmp-v is-left${aLead ? ' is-leading' : ''}`} style={{ '--pmd-cmp-w': barPct(numA), '--pmd-cmp-color': 'var(--pmd-cmp-left-bar, var(--color-accent))' }}>
        <span className={`pmd-cmp-n pmd-num${highlight ? ' is-big' : ''}`}>
          {aLead && <i className="pmd-cmp-tick" aria-hidden="true">▲</i>}
          {valA}
        </span>
        {subA && <span className="pmd-cmp-s">{subA}</span>}
      </div>
      <div className="pmd-cmp-l">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className={`pmd-cmp-v is-right${bLead ? ' is-leading' : ''}`} style={{ '--pmd-cmp-w': barPct(numB), '--pmd-cmp-color': 'var(--pmd-cmp-right-bar, var(--color-accent-orange))' }}>
        <span className={`pmd-cmp-n pmd-num${highlight ? ' is-big' : ''}`}>
          {valB}
          {bLead && <i className="pmd-cmp-tick" aria-hidden="true">▲</i>}
        </span>
        {subB && <span className="pmd-cmp-s">{subB}</span>}
      </div>
    </div>
  );
}

function CompareRankRail({ left, right }) {
  if (!left.rankValue || !right.rankValue || !left.peerCount || !right.peerCount || left.rankLabel !== right.rankLabel) return null;
  const leftPos = Math.max(0, Math.min(100, (left.rankValue - 1) / Math.max(1, left.peerCount - 1) * 100));
  const rightPos = Math.max(0, Math.min(100, (right.rankValue - 1) / Math.max(1, right.peerCount - 1) * 100));
  const markerEdgeClass = (position) => position <= 8 ? ' is-near-start' : position >= 92 ? ' is-near-end' : '';
  const leftLeading = left.rankValue < right.rankValue;
  const rightLeading = right.rankValue < left.rankValue;
  return (
    <section className="pmd-sec">
      <div className="pmd-eyebrow">Season points rank{' · '}<span>{left.peerCount}-{left.rankLabel} pool</span></div>
      <div className="pmd-cmp-rank-plot">
        <span className="pmd-cmp-rank-boundary is-best" aria-hidden="true">Best</span>
        <div className="pmd-cmp-rank-scale">
          <div className="pmd-rail" role="img" aria-label={`${left.name} ranks ${formatOrdinal(left.rankValue)}, ${right.name} ranks ${formatOrdinal(right.rankValue)}, from best to worst of ${left.peerCount} ${left.rankLabel} players.`} />
          <div
            className={`pmd-cmp-rank-player is-left${markerEdgeClass(leftPos)}`}
            style={{ left: `${leftPos}%`, '--pmd-cmp-player-color': 'var(--pmd-cmp-left-bar, var(--color-accent))' }}
          >
            <PlayerAvatar
              player={left.player}
              name={left.name}
              size={44}
              className="pmd-cmp-rank-avatar"
              background="var(--color-fill-secondary)"
            />
            <span className="pmd-cmp-rank-player__identity">
              <span className="pmd-cmp-rank-player__name">{left.name}</span>
              <span className={`pmd-cmp-rank-player__rank pmd-num${leftLeading ? ' is-leading' : ''}`}>{left.rankLabel}{left.rankValue}</span>
            </span>
          </div>
          <div
            className={`pmd-cmp-rank-player is-right${markerEdgeClass(rightPos)}`}
            style={{ left: `${rightPos}%`, '--pmd-cmp-player-color': 'var(--pmd-cmp-right-bar, var(--color-accent-orange))' }}
          >
            <PlayerAvatar
              player={right.player}
              name={right.name}
              size={44}
              className="pmd-cmp-rank-avatar"
              background="var(--color-fill-secondary)"
            />
            <span className="pmd-cmp-rank-player__identity">
              <span className="pmd-cmp-rank-player__name">{right.name}</span>
              <span className={`pmd-cmp-rank-player__rank pmd-num${rightLeading ? ' is-leading' : ''}`}>{right.rankLabel}{right.rankValue}</span>
            </span>
          </div>
        </div>
        <span className="pmd-cmp-rank-boundary is-worst" aria-hidden="true">Worst</span>
      </div>
    </section>
  );
}

function CompareLadder({ left, right }) {
  if (!left.ladderRows.length && !right.ladderRows.length) return null;
  const weeks = Array.from(new Set([...left.ladderRows.map(r => r.week), ...right.ladderRows.map(r => r.week)])).sort((a, b) => b - a).slice(0, 5);
  if (!weeks.length) return null;
  const byWeekLeft = new Map(left.ladderRows.map(r => [r.week, r.points]));
  const byWeekRight = new Map(right.ladderRows.map(r => [r.week, r.points]));
  // Reference lines move week to week: the season average as it stood after
  // that week, and the projection that was on record going into it. Each side
  // reads against its own benchmarks, never the other player's.
  const benchmarksFor = (model, week) => ({
    average: matchupNumber(model.averageByWeek?.get(week)),
    projection: matchupNumber(model.projectionByWeek?.get(week)),
  });
  const allBenchmarks = weeks.flatMap(week => [benchmarksFor(left, week), benchmarksFor(right, week)]);
  const maximum = getChartMaximum(
    weeks.map(w => byWeekLeft.get(w)), weeks.map(w => byWeekRight.get(w)),
    allBenchmarks.map(b => b.average), allBenchmarks.map(b => b.projection),
  );
  const hasAverage = allBenchmarks.some(b => b.average != null);
  const hasProjection = allBenchmarks.some(b => b.projection != null);
  const leftBar = 'var(--pmd-cmp-left-bar, var(--color-accent))';
  const rightBar = 'var(--pmd-cmp-right-bar, var(--color-accent-orange))';

  const renderTrack = (model, week, side, value, bar) => {
    const { average, projection } = benchmarksFor(model, week);
    const averagePosition = getChartPosition(average, maximum);
    const projectionPosition = getChartPosition(projection, maximum);
    const edge = side === 'left' ? 'right' : 'left';
    return (
      <div className={`pmd-cmp-fcell is-${side}`}>
        <div className={`pmd-cmp-ftrack is-${side}`}>
          <i style={{ width: `${getChartPosition(value, maximum) ?? 0}%`, background: bar }} />
          {averagePosition != null && <u style={{ [edge]: `${averagePosition}%` }} />}
          {projectionPosition != null && <u className="is-target" style={{ [edge]: `${projectionPosition}%` }} />}
        </div>
        <div className="pmd-cmp-fmarks pmd-num">
          {average != null && <span className="is-average" style={{ [edge]: `${averagePosition}%` }}>{formatNumber(average)}</span>}
          {projection != null
            ? <span className="is-target" style={{ [edge]: `${projectionPosition}%` }}>{formatNumber(projection)}</span>
            : hasProjection && <span className="is-target is-unavailable" title="Projection not recorded" aria-label="Projection not recorded">—</span>}
        </div>
      </div>
    );
  };

  return (
    <section className="pmd-sec">
      <div className="pmd-eyebrow">Recent form{' · '}<span>fantasy points by week</span></div>
      <div className="pmd-cmp-ladder">
        {weeks.map(week => {
          const a = matchupNumber(byWeekLeft.get(week));
          const b = matchupNumber(byWeekRight.get(week));
          const leftLeading = a != null && b != null && a > b;
          const rightLeading = a != null && b != null && b > a;
          return (
            <div className="pmd-cmp-lrow" key={week}>
              <div className={`pmd-cmp-lrow-v is-left pmd-num${leftLeading ? ' is-leading' : ''}`}>{formatNumber(a)}</div>
              {renderTrack(left, week, 'left', a, leftBar)}
              <div className="pmd-cmp-lrow-k pmd-cond">Wk {week}</div>
              {renderTrack(right, week, 'right', b, rightBar)}
              <div className={`pmd-cmp-lrow-v pmd-num${rightLeading ? ' is-leading' : ''}`}>{formatNumber(b)}</div>
            </div>
          );
        })}
      </div>
      {(hasAverage || hasProjection) && (
        <div className="pmd-legend pmd-cmp-legend">
          {hasAverage && <span><i className="is-tick" />Season average through that week</span>}
          {hasProjection && <span><i className="is-target" />Projection going into that week</span>}
        </div>
      )}
    </section>
  );
}

// ── hero ─────────────────────────────────────────────────────────────────────

function CompareHero({ player, side, darkMode, onViewStats }) {
  const teamTheme = getTeamVisualTheme(player?.team, darkMode);
  const style = {
    background: teamTheme?.gradient ?? 'var(--color-fill-secondary)',
    color: teamTheme?.gradientFullForeground ?? 'var(--color-label)',
    '--pmd-cmp-hero-muted': teamTheme?.gradientFullMuted ?? 'var(--color-label-secondary)',
    '--pmd-cmp-hero-accent': teamTheme?.accentColor ?? 'var(--color-accent)',
  };
  const clickable = Boolean(onViewStats);
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onViewStats : undefined}
      aria-label={clickable ? `View ${player?.name ?? 'player'} statistics` : undefined}
      className={`pmd-cmp-hero is-${side}${clickable ? ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]' : ''}`}
      style={style}
    >
      <PlayerAvatar player={player} name={player?.name} size={84} className="pmd-cmp-hero-avatar" />
      <div className="pmd-cmp-hero-name">{player?.name ?? 'Unknown'}</div>
      <div className="pmd-cmp-hero-meta">
        <span>{player?.position ?? '—'}</span><span aria-hidden="true">·</span>
        <span className="pmd-cmp-hero-team">
          <TeamLogo team={player?.team} className="pmd-cmp-hero-logo" />
          <span>{player?.team ?? 'FA'}</span>
        </span>
      </div>
      {player?.availabilityStatus && <PlayerStatusBadge status={player.availabilityStatus} compact />}
    </Tag>
  );
}

function TeamLogo({ team, className = 'pmd-cmp-game-logo' }) {
  const url = team ? getNflTeamLogoUrl(getTeamColorKey(team)) : null;
  if (!url) return null;
  return <img src={url} alt="" aria-hidden="true" className={className} onError={(e) => { e.currentTarget.hidden = true; }} />;
}

function CompareGameChip({ model }) {
  if (!model) return <div className="pmd-cmp-game" />;
  const phaseLabel = model.phase === 'pregame' ? 'Pregame' : model.phase === 'final' ? 'Final' : 'Live';

  if (model.finalScore) {
    const teamWon = model.finalScore.teamScore >= model.finalScore.opponentScore;
    return (
      <div className="pmd-cmp-game">
        <span className="pmd-phase pmd-cond">{phaseLabel}</span>
        <div className="pmd-cmp-game-score">
          <span className={`pmd-cmp-game-team${teamWon ? ' is-winner' : ''}`}>
            <TeamLogo team={model.team} />{model.team} <b className="pmd-num">{formatNumber(model.finalScore.teamScore, 0)}</b>
          </span>
          <span className="pmd-cmp-game-sep">·</span>
          <span className={`pmd-cmp-game-team${!teamWon ? ' is-winner' : ''}`}>
            <TeamLogo team={model.oppTeam} />{model.oppTeam} <b className="pmd-num">{formatNumber(model.finalScore.opponentScore, 0)}</b>
          </span>
        </div>
      </div>
    );
  }

  const oppText = model.oppTeam
    ? (model.isHome == null ? `vs ${model.oppTeam}` : model.isHome ? `Home vs ${model.oppTeam}` : `Away at ${model.oppTeam}`)
    : '—';
  const weather = model.isIndoor ? 'Indoor' : formatWeather(model.weather, false);
  return (
    <div className="pmd-cmp-game">
      <span className={`pmd-phase pmd-cond${model.phase === 'live' ? ' is-live' : ''}`}>{phaseLabel}</span>
      <div className="pmd-cmp-game-o"><TeamLogo team={model.oppTeam} />{[oppText, weather].filter(Boolean).join(' · ')}</div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function PlayerMatchupCompare({ left, right, week, slotLabel, leftBaseline = null, rightBaseline = null, onClose, onViewStats }) {
  const { players, weeklyStats, activeScoringSettings, scheduleMap, selectedLeagueId, season } = useSleeperBase();
  const { darkMode } = useTheme();

  const leftModel = usePlayerCompareModel({ player: left, week, baseline: leftBaseline, weeklyStats, activeScoringSettings, players, scheduleMap, leagueId: selectedLeagueId, season });
  const rightModel = usePlayerCompareModel({ player: right, week, baseline: rightBaseline, weeklyStats, activeScoringSettings, players, scheduleMap, leagueId: selectedLeagueId, season });

  if (!left?.id || !right?.id || left.name === 'Empty' || right.name === 'Empty') return null;

  const verdict = buildCompareVerdict(leftModel, rightModel);
  const bothStarted = !leftModel.isPregame && !rightModel.isPregame;
  const bothPregame = leftModel.isPregame && rightModel.isPregame;
  const pointsLabel = bothPregame ? 'Projected points' : bothStarted ? 'Points' : 'Points (mixed status)';
  const leftTeamTheme = getTeamVisualTheme(leftModel.team, darkMode);
  const rightTeamTheme = getTeamVisualTheme(rightModel.team, darkMode);
  // Bars sit on the neutral comparison canvas, so use the mode-appropriate
  // readable team treatment rather than the hero-only foreground accent.
  const leftTeamColor = (darkMode ? leftTeamTheme?.accentColor : leftTeamTheme?.borderColor)
    ?? leftTeamTheme?.color
    ?? 'var(--color-accent)';
  const rightTeamColor = (darkMode ? rightTeamTheme?.accentColor : rightTeamTheme?.borderColor)
    ?? rightTeamTheme?.color
    ?? 'var(--color-accent-orange)';

  const hasRange = bothPregame && (leftModel.rangeLow != null || rightModel.rangeLow != null);
  const getStatsPlayerMeta = (player) => {
    const raw = players?.[player?.id] ?? player;
    const id = raw?.espn_id ?? raw?.espnId ?? player?.espnId ?? player?.id;
    if (!onViewStats || id == null) return null;
    return {
      id: String(id),
      displayName: player?.name ?? raw?.full_name ?? raw?.name,
      teamId: raw?.team ?? player?.team ?? null,
      position: raw?.position ?? player?.position ?? null,
      experience: raw?.years_exp != null ? raw.years_exp + 1 : undefined,
    };
  };
  const canOpenStats = (player) => Boolean(getStatsPlayerMeta(player));

  // Generalized stat-category comparison, keyed off whatever rows each side
  // actually has (final box score if the game has started, else the
  // projected stat line) — works for any position automatically. Curated to
  // the handful of categories that actually moved the score, ranked by
  // whichever side scored more off that category, so a QB shows passing
  // touchdowns and yards rather than every scored field (2-pt conversions,
  // first downs, etc.) at once.
  const MAX_STAT_ROWS = 6;
  const statKeys = Array.from(new Set([...leftModel.statByKey.keys(), ...rightModel.statByKey.keys()]))
    .filter(Boolean)
    .map(key => {
      const ptsA = matchupNumber(leftModel.statByKey.get(key)?.pts);
      const ptsB = matchupNumber(rightModel.statByKey.get(key)?.pts);
      return { key, weight: Math.max(Math.abs(ptsA ?? 0), Math.abs(ptsB ?? 0)) };
    })
    .filter(row => row.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_STAT_ROWS)
    .map(row => row.key);

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel={`Compare ${leftModel.name} and ${rightModel.name}`}
      containerClassName="matchup-breakdown-dialog pmd-cmp-dialog gridshift-reveal flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-separator)', maxWidth: '900px', maxHeight: '90dvh' }}
    >
      <header className="pmd-cmp-hd">
        <span className="pmd-slot pmd-cond">{leftModel.position === rightModel.position ? leftModel.position : (slotLabel ?? 'Compare')}</span>
        <span className="pmd-ctx--lead pmd-num">Week {week}</span>
        <button type="button" onClick={onClose} aria-label="Close comparison" className="pmd-hd__close" style={{ marginLeft: 'auto' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="pmd-cmp-body gridshift-reveal gridshift-reveal--auto" style={{ '--pmd-cmp-left-bar': leftTeamColor, '--pmd-cmp-right-bar': rightTeamColor }}>
        <div className="pmd-cmp-heroes">
          <CompareHero player={leftModel.player} side="left" darkMode={darkMode} onViewStats={canOpenStats(leftModel.player) ? () => { const meta = getStatsPlayerMeta(leftModel.player); onClose(); onViewStats(meta.id, meta); } : null} />
          <CompareHero player={rightModel.player} side="right" darkMode={darkMode} onViewStats={canOpenStats(rightModel.player) ? () => { const meta = getStatsPlayerMeta(rightModel.player); onClose(); onViewStats(meta.id, meta); } : null} />
        </div>

        <div className="pmd-cmp-games">
          <CompareGameChip model={leftModel} />
          <i />
          <CompareGameChip model={rightModel} />
        </div>

        {verdict && <div className="pmd-sec"><p className="pmd-headline">{verdict}</p></div>}

        <section className="pmd-sec">
          <div className="pmd-eyebrow">Week {week}</div>
          <CompareRow
            label={pointsLabel}
            valA={leftModel.heroValue != null ? formatNumber(leftModel.heroValue, bothStarted ? 2 : 1) : '—'}
            valB={rightModel.heroValue != null ? formatNumber(rightModel.heroValue, bothStarted ? 2 : 1) : '—'}
            numA={leftModel.heroValue} numB={rightModel.heroValue}
            subA={!leftModel.isPregame && leftModel.displayProjection?.projected != null ? `${signed(leftModel.heroValue - leftModel.displayProjection.projected)} vs projected` : null}
            subB={!rightModel.isPregame && rightModel.displayProjection?.projected != null ? `${signed(rightModel.heroValue - rightModel.displayProjection.projected)} vs projected` : null}
            highlight
          />
          {hasRange && (
            <CompareRow
              label="Likely range"
              valA={leftModel.rangeLow != null ? `${formatNumber(leftModel.rangeLow)}–${formatNumber(leftModel.rangeHigh)}` : '—'}
              valB={rightModel.rangeLow != null ? `${formatNumber(rightModel.rangeLow)}–${formatNumber(rightModel.rangeHigh)}` : '—'}
              neutral
            />
          )}
          {(leftModel.opponentContext || rightModel.opponentContext) && (
            <CompareRow
              label="Opponent vs position"
              valA={leftModel.opponentContext ? `#${leftModel.opponentContext.rank ?? '—'}` : '—'}
              valB={rightModel.opponentContext ? `#${rightModel.opponentContext.rank ?? '—'}` : '—'}
              subA={leftModel.opponentContext ? `${leftModel.oppTeam} · ${formatNumber(leftModel.opponentContext.ptsAllowedPerGame)} allowed` : getOpponentEvidenceLabel(null)}
              subB={rightModel.opponentContext ? `${rightModel.oppTeam} · ${formatNumber(rightModel.opponentContext.ptsAllowedPerGame)} allowed` : getOpponentEvidenceLabel(null)}
              neutral
            />
          )}
        </section>

        <CompareRankRail left={leftModel} right={rightModel} />

        <section className="pmd-sec">
          <div className="pmd-eyebrow">Season form{' · '}<span>through {Math.max(leftModel.gamesPlayed ?? 0, rightModel.gamesPlayed ?? 0)} game{Math.max(leftModel.gamesPlayed ?? 0, rightModel.gamesPlayed ?? 0) === 1 ? '' : 's'}</span></div>
          {leftModel.rankLabel === rightModel.rankLabel && (leftModel.rankValue || rightModel.rankValue) && (
            <CompareRow
              label="Season rank" sub="position pool"
              valA={leftModel.rankValue ? `${leftModel.rankLabel}${leftModel.rankValue}` : '—'}
              valB={rightModel.rankValue ? `${rightModel.rankLabel}${rightModel.rankValue}` : '—'}
              numA={leftModel.rankValue} numB={rightModel.rankValue}
              higher="lower" nobar
            />
          )}
          <CompareRow label="Points per game" valA={formatNumber(leftModel.seasonAvg)} valB={formatNumber(rightModel.seasonAvg)} numA={leftModel.seasonAvg} numB={rightModel.seasonAvg} />
          <CompareRow label="Total points" valA={formatNumber(leftModel.seasonPoints)} valB={formatNumber(rightModel.seasonPoints)} numA={leftModel.seasonPoints} numB={rightModel.seasonPoints} />
          <CompareRow label="Season high" valA={formatNumber(leftModel.seasonHigh)} valB={formatNumber(rightModel.seasonHigh)} numA={leftModel.seasonHigh} numB={rightModel.seasonHigh} />
          <CompareRow label="Games played" valA={leftModel.gamesPlayed != null ? String(leftModel.gamesPlayed) : '—'} valB={rightModel.gamesPlayed != null ? String(rightModel.gamesPlayed) : '—'} numA={leftModel.gamesPlayed} numB={rightModel.gamesPlayed} neutral />
        </section>

        <CompareLadder left={leftModel} right={rightModel} />

        {statKeys.length > 0 && (
          <section className="pmd-sec">
            <div className="pmd-eyebrow">{bothStarted ? 'Scoring breakdown' : 'Projected stat line'}</div>
            {statKeys.map(key => {
              const rowA = leftModel.statByKey.get(key);
              const rowB = rightModel.statByKey.get(key);
              const label = rowA?.label ?? rowB?.label ?? STAT_LABELS[key] ?? key;
              const ptsA = matchupNumber(rowA?.pts);
              const ptsB = matchupNumber(rowB?.pts);
              if (ptsA == null && ptsB == null) return null;
              return (
                <CompareRow
                  key={key}
                  label={label}
                  valA={formatStat(rowA?.statVal)}
                  valB={formatStat(rowB?.statVal)}
                  subA={ptsA != null ? `${signed(ptsA)} pts` : null}
                  subB={ptsB != null ? `${signed(ptsB)} pts` : null}
                  numA={ptsA} numB={ptsB}
                />
              );
            })}
          </section>
        )}

      </div>
    </Modal>
  );
}
