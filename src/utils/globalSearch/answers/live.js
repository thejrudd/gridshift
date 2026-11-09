// ── Live game answers ──────────────────────────────────────────────────────
// "bills score", "live scores", "jsn live", "chiefs vs bills score".
//
// Two pure halves around the one fetch in live/liveSource.js:
//   getLiveRequest  — does this query ask about live games, and which ones?
//   buildLiveAnswer — given this week's scoreboard, the card that answers it.
//
// A query about the user's own fantasy matchup is deliberately not answered
// here: its live points come from the fantasy platform rather than GridShift's
// own live server, so it keeps to the Live replay and Matchups destinations.

import { KIND_GAME, KIND_PLAYER } from '../entities/record.js';
import { canonicalTeam } from '../../nflPlays/fieldSpots.js';
import { routeForGameResult } from '../resolveRoute.js';
import { buildGameStatHighlights } from '../../balldontlieNflScoreboard.js';

const STATUS_ORDER = { live: 0, halftime: 0, delayed: 1, scheduled: 2, final: 3, postponed: 4 };
const IN_PROGRESS = new Set(['live', 'halftime']);

/**
 * What a live query is about, or null when it is not a live query.
 *
 * @returns {null | { scope: 'teams', teamIds: string[], playerLabel?: string } | { scope: 'all' }}
 */
export function getLiveRequest(slots, groups = []) {
  if (!slots?.intents?.includes('live')) return null;
  // "my live matchup" is the fantasy matchup, which this card does not answer.
  if (slots.scope === 'self' || slots.scope === 'fantasy' || slots.intents.includes('matchup')) {
    return null;
  }

  if (slots.teams.length) {
    return { scope: 'teams', teamIds: slots.teams.map(canonicalTeam) };
  }

  // A player answers with their team's game — but only when a player is what
  // the query found first, so "live scores" never becomes one player's game.
  const topGroup = groups[0];
  const topPlayer = topGroup?.kind === KIND_PLAYER ? topGroup.results[0]?.record : null;
  if (slots.nameTerms.length) {
    if (!topPlayer?.meta?.team) return null;
    return {
      scope: 'teams',
      teamIds: [canonicalTeam(topPlayer.meta.team)],
      playerLabel: topPlayer.label,
    };
  }

  return { scope: 'all' };
}

function kickoffMs(game) {
  const value = Date.parse(game?.kickoff ?? '');
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function findGameRecord(week, awayId, homeId, gameRecords) {
  return gameRecords.find((entry) => (
    entry.meta?.week === week
    && canonicalTeam(entry.meta?.awayTeam) === awayId
    && canonicalTeam(entry.meta?.homeTeam) === homeId
  )) ?? null;
}

/**
 * One scoreboard row. Team ids are canonical so a query and the provider agree
 * ("WSH" and "WAS" are one team); logos use the schedule's own codes, which are
 * the logo file names.
 *
 * The row opens what the matching schedule record would — decided at click
 * time exactly as a game result is: Scores once it has kicked off, the schedule
 * drill-in before.
 */
function toRow(game, gameRecords, now) {
  const awayId = canonicalTeam(game.awayTeam ?? game.away?.id);
  const homeId = canonicalTeam(game.homeTeam ?? game.home?.id);
  const record = findGameRecord(game.week, awayId, homeId, gameRecords);
  return {
    key: game.id,
    awayId,
    homeId,
    awayLogoId: record?.meta?.awayTeam ?? awayId,
    homeLogoId: record?.meta?.homeTeam ?? homeId,
    awayScore: game.awayScore ?? null,
    homeScore: game.homeScore ?? null,
    status: game.status,
    statusLabel: game.status === 'scheduled'
      ? [game.dateLabel, game.kickoffLabel].filter(Boolean).join(' · ')
      : game.statusLabel,
    inProgress: IN_PROGRESS.has(game.status),
    started: game.status !== 'scheduled' && game.status !== 'postponed',
    lineScore: lineScoreOf(game),
    gameId: game.bdlGameId ?? null,
    providerAwayId: game.away?.id ?? null,
    providerHomeId: game.home?.id ?? null,
    kickoff: game.kickoff ?? null,
    week: game.week,
    route: record ? routeForGameResult({ record, route: record.route }, { now }) : null,
  };
}

/**
 * Points by quarter, overtime last, for a game that has started. Quarters not
 * reached yet stay null rather than reading as scoreless.
 */
function lineScoreOf(game) {
  const away = game.quarterScores?.away;
  const home = game.quarterScores?.home;
  if (!away && !home) return null;
  const length = Math.max(4, away?.length ?? 0, home?.length ?? 0);
  const periods = Array.from({ length }, (_, index) => (index < 4 ? String(index + 1) : 'OT'));
  const pad = (scores) => Array.from({ length }, (_, index) => scores?.[index] ?? null);
  return { periods, away: pad(away), home: pad(home) };
}

function numeric(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function highlightLeader(stat) {
  if (stat.direction === 'neutral') return null;
  const away = stat.awayRatio ?? numeric(stat.away);
  const home = stat.homeRatio ?? numeric(stat.home);
  if (away == null || home == null || away === home) return null;
  const awayBetter = stat.direction === 'lower' ? away < home : away > home;
  return awayBetter ? 'away' : 'home';
}

/**
 * The games on a team card that are worth a box score: started, and few
 * enough that the card stays a glance. The whole slate never gets details.
 */
export function gamesNeedingDetail(answer) {
  if (!answer || answer.kind !== 'liveGames' || answer.collapseAfter) return [];
  return answer.games.filter((game) => game.started && game.gameId).slice(0, 2);
}

/**
 * Attach headline team stats to a card's games from their Scores detail
 * payloads, keyed by provider game id. A game without a payload keeps its score.
 */
export function attachGameHighlights(answer, detailsById = {}) {
  if (!answer?.games?.length) return answer;
  let changed = false;
  const games = answer.games.map((game) => {
    const detail = detailsById[game.gameId];
    if (!detail) return game;
    const highlights = buildGameStatHighlights(detail, game.providerAwayId, game.providerHomeId)
      .map((stat) => ({
        label: stat.label,
        away: String(stat.away),
        home: String(stat.home),
        leader: highlightLeader(stat),
      }));
    if (!highlights.length) return game;
    changed = true;
    return { ...game, highlights };
  });
  return changed ? { ...answer, games } : answer;
}

function sortRows(rows) {
  return [...rows].sort((left, right) => (
    (STATUS_ORDER[left.status] ?? 5) - (STATUS_ORDER[right.status] ?? 5)
    || kickoffMs(left) - kickoffMs(right)
  ));
}

/**
 * The live card for a request, given the week's normalized scoreboard games.
 */
export function buildLiveAnswer(request, games = [], { index = null, week = null, teamNames = {}, now = Date.now() } = {}) {
  if (!request) return null;
  const gameRecords = (index?.records ?? []).filter((record) => (
    record.kind === KIND_GAME && !record.meta?.isWeekIndex
  ));
  const named = (id) => teamNames[id] ?? id;

  const allRows = games.map((game) => toRow(game, gameRecords, now));

  if (request.scope === 'teams') {
    const wanted = new Set(request.teamIds);
    const rows = sortRows(allRows.filter((row) => wanted.has(row.awayId) || wanted.has(row.homeId)));
    const teamsLabel = request.teamIds.map(named).join(' and ');
    if (!rows.length) {
      return {
        kind: 'liveGames',
        title: request.playerLabel ?? teamsLabel,
        subtitle: week ? `No game in week ${week}` : 'No game this week',
        games: [],
      };
    }
    return {
      kind: 'liveGames',
      title: rows.length === 1
        ? `${named(rows[0].awayId)} at ${named(rows[0].homeId)}`
        : teamsLabel,
      subtitle: [request.playerLabel ? `${request.playerLabel}'s game` : null, week ? `Week ${week}` : null]
        .filter(Boolean)
        .join(' · '),
      games: rows,
    };
  }

  const rows = sortRows(allRows);
  const liveCount = rows.filter((row) => row.inProgress).length;
  return {
    kind: 'liveGames',
    title: liveCount ? 'Live now' : (week ? `Week ${week} games` : 'This week'),
    subtitle: liveCount
      ? `${liveCount} ${liveCount === 1 ? 'game' : 'games'} in progress${week ? ` · Week ${week}` : ''}`
      : null,
    games: rows,
    collapseAfter: 6,
  };
}
