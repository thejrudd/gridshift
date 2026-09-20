/**
 * Fantasy Matchup preview model.
 *
 * Normalizes the state CompanionMatchup already holds — enriched starters with
 * projections, recorded pregame baselines, the win-probability forecast, league
 * rosters and linked-league rivalry — into one shape consumed by both the
 * preview panel and the keys detector engine.
 *
 * Every field is derived from data GridShift actually sources. Anything that
 * cannot be derived is null, and the panel omits that region rather than
 * showing a placeholder number.
 */

import { buildMatchupKeys, hashSeed, say, KEYS_TITLE_BY_PHASE } from './matchupPreviewKeys.js';
import { getNoteworthyWeather } from './playerMatchupPresentation.js';

// Number(null) is 0 and Number('') is 0, so absent values must be rejected
// before coercion or a missing projection silently counts as a zero.
const num = (value) => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const round1 = (value) => (num(value) == null ? null : Math.round(num(value) * 10) / 10);
const pts = (value) => (num(value) == null ? null : `${num(value).toFixed(1)} pts`);
const one = (value) => (num(value) == null ? null : num(value).toFixed(1));
const ordinal = (value) => {
  const parsed = num(value);
  if (parsed == null) return null;
  const rest = parsed % 100;
  if (rest >= 11 && rest <= 13) return `${parsed}th`;
  return `${parsed}${['th', 'st', 'nd', 'rd'][parsed % 10] ?? 'th'}`;
};

export function formatFantasyRosterSeed(value) {
  const label = ordinal(value);
  return label ? `${label} seed` : null;
}

export function getFantasyRosterSeeds(rosters) {
  const rows = (rosters ?? [])
    .map((roster) => ({
      rosterId: String(roster?.roster_id ?? ''),
      pointsFor: rosterPoints(roster?.settings, 'fpts'),
      wins: num(roster?.settings?.wins) ?? 0,
    }))
    .filter((row) => row.rosterId);
  return new Map(
    [...rows]
      .sort((left, right) => (right.wins - left.wins) || ((right.pointsFor ?? 0) - (left.pointsFor ?? 0)))
      .map((row, index) => [row.rosterId, index + 1]),
  );
}

const SLOT_GROUPS = [
  { label: 'QB', match: ['QB'] },
  { label: 'RB', match: ['RB'] },
  { label: 'WR', match: ['WR'] },
  { label: 'TE', match: ['TE'] },
  { label: 'FLEX', match: ['FLEX', 'REC_FLEX', 'WRRBTE_FLEX', 'WRT_FLEX', 'WRRB_FLEX', 'SUPER_FLEX', 'IDP_FLEX'] },
  { label: 'K + DEF', match: ['K', 'DEF', 'DST'] },
];

const isRealPlayer = (player) => Boolean(player?.id) && player.name !== 'Empty' && !player.isUnavailable;

/* ── kickoff windows ──────────────────────────────────────────────────────
   Window membership drives the slate-timing keys. Anything without a parsable
   kickoff is counted in no window rather than guessed into one. */

function kickoffWindow(scheduleEntry) {
  const raw = scheduleEntry?.kickoff ?? scheduleEntry?.date ?? null;
  const parsed = Date.parse(String(raw ?? ''));
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  let weekday;
  let hour;
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false,
    }).formatToParts(date);
    weekday = formatted.find((part) => part.type === 'weekday')?.value ?? null;
    hour = Number(formatted.find((part) => part.type === 'hour')?.value);
  } catch {
    return null;
  }
  if (!Number.isFinite(hour)) return null;
  if (weekday === 'Thu' || weekday === 'Fri') return 'early';
  if (weekday === 'Mon' || weekday === 'Tue') return 'late';
  if (hour >= 19) return 'late';
  if (hour >= 16) return 'late';
  return 'early';
}

function gameIdentity(player) {
  const team = player?.team ?? null;
  const opponent = player?.oppTeam ?? null;
  if (!team || !opponent) return { gameKey: null, gameLabel: null };
  const date = player?.gameDate ?? player?.scheduleEntry?.date ?? '';
  const gameKey = `${[team, opponent].sort().join('@')}|${date}`;
  const gameLabel = player.isHome === true
    ? `${opponent} at ${team}`
    : player.isHome === false
      ? `${team} at ${opponent}`
      : `${team} vs ${opponent}`;
  return { gameKey, gameLabel };
}

/* ── starter normalization ───────────────────────────────────────────────── */

function futureKickoff(scheduleEntry, nowMs) {
  const kickoffMs = Date.parse(String(scheduleEntry?.kickoff ?? ''));
  return Number.isFinite(kickoffMs) && kickoffMs > nowMs;
}

function normalizeStarter(player, { slotLabel, baselines, scoreWeeklyEntry, scoringSettings, nowMs }) {
  if (!player?.id) return { id: null, isEmpty: true, slotLabel };
  const baseline = baselines?.[player.id]?.projection?.projected;
  const weeklyPoints = typeof scoreWeeklyEntry === 'function'
    ? (player.weekly ?? [])
      .map((entry) => num(scoreWeeklyEntry(entry, scoringSettings, player.position)))
      .filter((value) => value != null)
    : [];
  const { gameKey, gameLabel } = gameIdentity(player);
  const gameFinal = player.scheduleEntry?.completed === true || player.scheduleEntry?.isFinal === true;
  return {
    id: player.id,
    isEmpty: !isRealPlayer(player),
    name: player.name,
    position: player.position ?? null,
    slotLabel,
    team: player.team ?? null,
    opponentTeam: player.oppTeam ?? null,
    gameKey,
    gameLabel,
    isHome: player.isHome ?? null,
    isBye: player.isBye === true,
    gameStarted: player.gameStarted === true,
    gameFinal,
    // A started game that is not final is the only "live" state. A published
    // future kickoff outranks the shared `gameStarted` flag, which also trusts
    // weekly stat rows that can exist (as zeros) before kickoff, so a game the
    // schedule places in the future is always "upcoming".
    gameState: player.isBye === true ? 'bye'
      : gameFinal ? 'final'
        : futureKickoff(player.scheduleEntry, nowMs) ? 'upcoming'
          : player.gameStarted === true ? 'live' : 'upcoming',
    kickoffWindow: kickoffWindow(player.scheduleEntry),
    kickoffAt: player.scheduleEntry?.kickoff ?? player.scheduleEntry?.date ?? null,
    projected: round1(player.projection?.projected),
    baselineProjected: round1(baseline),
    actual: round1(player.weekPts),
    seasonAverage: round1(player.avgPPG),
    bestWeek: weeklyPoints.length ? round1(Math.max(...weeklyPoints)) : null,
    positionalRank: num(player.rank),
    availabilityStatus: player.availabilityStatus ?? null,
    opponentContext: player.opponentFantasyContext
      ? {
        rank: num(player.opponentFantasyContext.rank),
        teamCount: num(player.opponentFantasyContext.teamCount) ?? 32,
        ptsAllowedPerGame: round1(player.opponentFantasyContext.ptsAllowedPerGame),
        leagueAveragePtsAllowed: round1(player.opponentFantasyContext.leagueAveragePtsAllowed),
        differenceFromLeagueAverage: round1(player.opponentFantasyContext.differenceFromLeagueAverage),
        position: player.opponentFantasyContext.position ?? player.position ?? null,
      }
      : null,
    weatherNote: getNoteworthyWeather({
      weather: player.weather ?? null,
      isIndoor: player.isIndoor === true,
      position: player.position,
    })?.label ?? null,
    teamTheme: player.teamTheme ?? null,
  };
}

/* ── league context ──────────────────────────────────────────────────────── */

function rosterPoints(settings, key) {
  const whole = num(settings?.[key]);
  if (whole == null) return null;
  const decimal = num(settings?.[`${key}_decimal`]) ?? 0;
  return round1(whole + decimal / 100);
}

function buildLeagueContext(rosters) {
  const rows = (rosters ?? [])
    .map((roster) => ({
      rosterId: String(roster?.roster_id ?? ''),
      pointsFor: rosterPoints(roster?.settings, 'fpts'),
      pointsAgainst: rosterPoints(roster?.settings, 'fpts_against'),
      wins: num(roster?.settings?.wins) ?? 0,
      losses: num(roster?.settings?.losses) ?? 0,
      ties: num(roster?.settings?.ties) ?? 0,
    }))
    .filter((row) => row.rosterId);
  if (rows.length < 2) return null;
  const scored = rows.filter((row) => row.pointsFor != null);
  if (scored.length < 2) return null;
  const byPointsFor = [...scored].sort((left, right) => right.pointsFor - left.pointsFor);
  const byPointsAgainst = [...scored].filter((row) => row.pointsAgainst != null).sort((left, right) => left.pointsAgainst - right.pointsAgainst);
  const seed = getFantasyRosterSeeds(rosters);
  return {
    teamCount: rows.length,
    averagePointsFor: round1(scored.reduce((total, row) => total + row.pointsFor, 0) / scored.length),
    averagePointsAgainst: byPointsAgainst.length
      ? round1(byPointsAgainst.reduce((total, row) => total + row.pointsAgainst, 0) / byPointsAgainst.length)
      : null,
    pointsForRank: new Map(byPointsFor.map((row, index) => [row.rosterId, index + 1])),
    pointsAgainstRank: new Map(byPointsAgainst.map((row, index) => [row.rosterId, index + 1])),
    seed,
    row: new Map(rows.map((row) => [row.rosterId, row])),
  };
}

/* ── bench upgrade ────────────────────────────────────────────────────────
   Deliberately conservative: only a same-position swap counts, because full
   flex eligibility depends on league roster settings this model does not own.
   An unreported upgrade is better than an invented one. */

function benchUpgrade(starterList, bench) {
  const benchProjections = (bench ?? [])
    .filter((player) => isRealPlayer(player) && num(player.projection?.projected) != null && player.isBye !== true)
    .map((player) => ({ name: player.name, position: player.position, projected: round1(player.projection.projected) }));
  if (!benchProjections.length) return { gap: null, label: null };
  let best = null;
  for (const candidate of benchProjections) {
    const weakest = starterList
      .filter((starter) => !starter.isEmpty && starter.position === candidate.position && starter.projected != null)
      .sort((left, right) => left.projected - right.projected)[0];
    if (!weakest) continue;
    const gap = candidate.projected - weakest.projected;
    if (gap > 0 && (!best || gap > best.gap)) {
      best = { gap: round1(gap), label: `${candidate.name} over ${weakest.name}` };
    }
  }
  return best ?? { gap: null, label: null };
}

/* ── side + slot assembly ────────────────────────────────────────────────── */

function windowTotal(starterList, window) {
  // Only games still to be played count toward a window's remaining projection.
  const matching = starterList.filter((starter) => starter.kickoffWindow === window && starter.projected != null && !starter.gameFinal);
  if (!matching.length) return null;
  return round1(matching.reduce((total, starter) => total + starter.projected, 0));
}

function buildSide({
  key, identity, starterList, bench, leagueContext, winProbability, recordedProjectedTotal, liveTotals,
}) {
  const rosterId = String(identity?.rosterId ?? '');
  const leagueRow = leagueContext?.row.get(rosterId) ?? null;
  const projected = starterList.filter((starter) => starter.projected != null);
  const remaining = starterList.filter((starter) => !starter.gameFinal && starter.projected != null);
  const upgrade = benchUpgrade(starterList, bench);
  const games = leagueRow ? leagueRow.wins + leagueRow.losses + leagueRow.ties : 0;
  return {
    key,
    id: rosterId || key,
    name: identity?.name ?? 'Team',
    managerName: identity?.managerName ?? null,
    abbr: identity?.abbr ?? null,
    initials: identity?.initials ?? null,
    palette: identity?.palette ?? null,
    record: leagueRow
      ? `${leagueRow.wins}–${leagueRow.losses}${leagueRow.ties ? `–${leagueRow.ties}` : ''}`
      : null,
    games,
    seed: leagueContext?.seed.get(rosterId) ?? null,
    seedLabel: formatFantasyRosterSeed(leagueContext?.seed.get(rosterId)),
    pointsFor: leagueRow?.pointsFor ?? null,
    pointsAgainst: leagueRow?.pointsAgainst ?? null,
    pointsForRank: leagueContext?.pointsForRank.get(rosterId) ?? null,
    pointsAgainstRank: leagueContext?.pointsAgainstRank.get(rosterId) ?? null,
    starters: starterList,
    projectedTotal: projected.length ? round1(projected.reduce((total, starter) => total + starter.projected, 0)) : null,
    recordedProjectedTotal: round1(recordedProjectedTotal),
    // The caller's displayed matchup score is the authority; the win-probability
    // model does not carry actual totals of its own.
    liveTotal: round1(liveTotals?.[key] ?? (key === 'a' ? winProbability?.actualA : winProbability?.actualB)),
    expectedTotal: round1(key === 'a' ? winProbability?.expectedA : winProbability?.expectedB),
    remainingProjection: remaining.length ? round1(remaining.reduce((total, starter) => total + starter.projected, 0)) : null,
    earlyWindowProjection: windowTotal(starterList, 'early'),
    lateWindowProjection: windowTotal(starterList, 'late'),
    benchUpgrade: upgrade.gap,
    benchUpgradeLabel: upgrade.label,
  };
}

function buildSlotGroups(slots, phase) {
  const valueOf = (starter) => (phase === 'pre' ? starter?.projected : starter?.actual ?? starter?.projected);
  return SLOT_GROUPS.map((group) => {
    const members = slots.filter((slot) => group.match.includes(String(slot.slotPos ?? '').toUpperCase()));
    if (!members.length) return null;
    const totals = ['a', 'b'].map((side) => {
      const values = members.map((slot) => num(valueOf(slot[side]))).filter((value) => value != null);
      return values.length === members.length ? round1(values.reduce((total, value) => total + value, 0)) : null;
    });
    const [a, b] = totals;
    const names = ['a', 'b'].map((side) => members
      .map((slot) => slot[side]?.name)
      .filter(Boolean)
      .join(' · ') || null);
    return {
      label: group.label,
      starters: members.length,
      a,
      b,
      aNames: names[0],
      bNames: names[1],
      lead: a == null || b == null || a === b ? null : a > b ? 'a' : 'b',
    };
  }).filter(Boolean);
}

/* ── narrative ───────────────────────────────────────────────────────────── */

function buildLede(context, seed) {
  const margin = Math.abs(num(context.expectedMargin) ?? 0);
  const leader = (num(context.expectedMargin) ?? 0) >= 0 ? context.sides.a : context.sides.b;
  const trailer = leader === context.sides.a ? context.sides.b : context.sides.a;
  if (context.phase === 'post') {
    const winner = (num(context.finalMargin) ?? 0) >= 0 ? context.sides.a : context.sides.b;
    return say`${winner.name} took it by ${pts(Math.abs(num(context.finalMargin) ?? 0))}, finishing ${one(winner.liveTotal ?? winner.expectedTotal)} against ${one((winner === context.sides.a ? context.sides.b : context.sides.a).liveTotal)}.`;
  }
  if (context.phase === 'live') {
    const lead = Math.abs(num(context.liveMargin) ?? 0);
    const ahead = (num(context.liveMargin) ?? 0) >= 0 ? context.sides.a : context.sides.b;
    const behind = ahead === context.sides.a ? context.sides.b : context.sides.a;
    if (lead < 0.05) return say`The score is level. ${ahead.name} has ${pts(ahead.remainingProjection)} of projection still to play, ${behind.name} ${pts(behind.remainingProjection)}.`;
    if (ahead.remainingProjection == null || behind.remainingProjection == null) return say`${ahead.name} leads by ${pts(lead)}.`;
    return say`${ahead.name} leads by ${pts(lead)}. ${behind.name} has ${pts(behind.remainingProjection)} of projection still to play, against ${pts(ahead.remainingProjection)} for ${ahead.name}.`;
  }
  const swing = num(context.swing);
  const variants = [
    () => swing && margin < swing * 0.6
      ? say`The forecast separates these two by ${pts(margin)} — less than the ${pts(swing)} a normal week moves. Treat it as even.`
      : say`${leader.name} projects ${pts(margin)} clear of ${trailer.name}, ${one(leader.projectedTotal ?? leader.expectedTotal)} to ${one(trailer.projectedTotal ?? trailer.expectedTotal)}.`,
    () => say`${one(leader.expectedTotal ?? leader.projectedTotal)} against ${one(trailer.expectedTotal ?? trailer.projectedTotal)} — ${pts(margin)} between them across ${`${context.starterCount} starters`}.`,
  ];
  return variants[seed % variants.length]();
}

function oddsBand(probabilityA, phase, settled, liveNow) {
  if (settled) return { band: 'Final', tone: '' };
  if (phase === 'live') return liveNow ? { band: 'In progress', tone: 'live' } : { band: 'Week underway', tone: '' };
  const edge = Math.abs(probabilityA - 50);
  if (edge < 6) return { band: 'Tossup', tone: 'tossup' };
  if (edge < 18) return { band: 'Slight edge', tone: '' };
  return { band: 'Clear favourite', tone: '' };
}

/* ── entry point ─────────────────────────────────────────────────────────── */

export function buildMatchupPreviewModel({
  leagueId,
  season,
  week,
  phase = 'pre',
  sides,
  slots = [],
  benches = {},
  winProbability = null,
  liveTotals = null,
  headerExtras = null,
  baselines = null,
  rosters = null,
  rivalry = null,
  slotLabels = {},
  recordedProjectionTotals = {},
  scoreWeeklyEntry = null,
  scoringSettings = null,
  recentKeyIds = [],
  keyLimit = 3,
  nowMs = Date.now(),
} = {}) {
  if (!sides?.a || !sides?.b) return null;
  const leagueContext = buildLeagueContext(rosters);
  const normalize = (player, slotPos) => normalizeStarter(player, {
    slotLabel: slotPos ? (slotLabels[slotPos] ?? slotPos) : player?.position ?? null,
    baselines,
    scoreWeeklyEntry,
    scoringSettings,
    nowMs,
  });

  const normalizedSlots = (slots ?? []).map((slot) => ({
    slotPos: slot.slotPos ?? null,
    label: slot.slotPos ? (slotLabels[slot.slotPos] ?? slot.slotPos) : slot.mine?.position ?? slot.opp?.position ?? '—',
    a: normalize(slot.mine, slot.slotPos),
    b: normalize(slot.opp, slot.slotPos),
  }));

  const sideA = buildSide({
    key: 'a',
    identity: sides.a,
    starterList: normalizedSlots.map((slot) => slot.a),
    bench: benches.a,
    leagueContext,
    winProbability,
    recordedProjectedTotal: recordedProjectionTotals.a,
    liveTotals,
  });
  const sideB = buildSide({
    key: 'b',
    identity: sides.b,
    starterList: normalizedSlots.map((slot) => slot.b),
    bench: benches.b,
    leagueContext,
    winProbability,
    recordedProjectedTotal: recordedProjectionTotals.b,
    liveTotals,
  });

  // Header details the primary matchup header already derives (projected
  // final, projection delta, season record/PF/PA) so the two headers agree.
  for (const [sideKey, side] of [['a', sideA], ['b', sideB]]) {
    const extras = headerExtras?.[sideKey] ?? null;
    side.projectedFinal = round1(extras?.projectedFinal);
    side.projectionDelta = extras?.projectionDelta ?? null;
    side.summary = extras?.summary ?? null;
  }

  const settled = Boolean(winProbability?.settled);
  const starterStates = normalizedSlots
    .flatMap((slot) => [slot.a, slot.b])
    .filter((starter) => !starter.isEmpty);
  // "Live" means scoring has begun. If no starter's game has actually started
  // or finished, the week is still a preview whatever the caller's evidence says.
  const anyScoring = starterStates.some((starter) => starter.gameState === 'live' || starter.gameState === 'final');
  const resolvedPhase = settled ? 'post' : phase === 'live' && !anyScoring && starterStates.length ? 'pre' : phase;
  const probabilityA = Math.max(0, Math.min(100, num(winProbability?.probA) ?? 50));
  const starterCount = num(winProbability?.starterCount)
    ?? normalizedSlots.filter((slot) => !slot.a.isEmpty || !slot.b.isEmpty).length * 2;
  const fallbackCount = Math.max(0, starterCount - (num(winProbability?.projectedCount) ?? starterCount));

  const context = {
    leagueId,
    season,
    week,
    phase: resolvedPhase,
    sides: { a: sideA, b: sideB },
    slots: normalizedSlots,
    slotGroups: buildSlotGroups(normalizedSlots, resolvedPhase),
    expectedMargin: round1(winProbability?.expectedMarginA),
    liveMargin: round1((sideA.liveTotal ?? 0) - (sideB.liveTotal ?? 0)),
    finalMargin: round1((sideA.liveTotal ?? sideA.expectedTotal ?? 0) - (sideB.liveTotal ?? sideB.expectedTotal ?? 0)),
    swing: round1(winProbability?.explanation?.swing),
    starterCount,
    fallbackCount,
    rivalry,
    league: leagueContext
      ? {
        teamCount: leagueContext.teamCount,
        averagePointsFor: leagueContext.averagePointsFor,
        averagePointsAgainst: leagueContext.averagePointsAgainst,
      }
      : null,
    seedKey: `${leagueId}|${season}|${week}|${sideA.id}|${sideB.id}`,
  };

  // "Live" phase means scoring has begun. It only means a game is on the clock
  // when a starter's game has started and not finished; between kickoff windows
  // the week is underway but nothing is live.
  const liveNow = resolvedPhase === 'live' && starterStates.some((starter) => starter.gameState === 'live');
  context.liveNow = liveNow;

  const seed = hashSeed(context.seedKey);
  const band = oddsBand(probabilityA, resolvedPhase, settled, liveNow);
  const bigLabel = resolvedPhase === 'post' ? 'final' : resolvedPhase === 'live' ? (liveNow ? 'live' : 'so far') : 'projected';

  return {
    ...context,
    keysTitle: KEYS_TITLE_BY_PHASE[resolvedPhase] ?? KEYS_TITLE_BY_PHASE.pre,
    keys: buildMatchupKeys(context, { limit: keyLimit, recentIds: recentKeyIds }),
    lede: buildLede(context, seed),
    bigLabel,
    big: {
      // Once scoring has begun the headline is the score, never a projection
      // labelled as one; a missing score renders as unavailable.
      a: resolvedPhase === 'pre' ? sideA.expectedTotal ?? sideA.projectedTotal : resolvedPhase === 'post' ? sideA.liveTotal ?? sideA.expectedTotal : sideA.liveTotal,
      b: resolvedPhase === 'pre' ? sideB.expectedTotal ?? sideB.projectedTotal : resolvedPhase === 'post' ? sideB.liveTotal ?? sideB.expectedTotal : sideB.liveTotal,
    },
    odds: {
      probabilityA,
      labelA: `${Math.round(probabilityA)}%`,
      labelB: `${Math.round(100 - probabilityA)}%`,
      mid: settled ? 'Share of points scored' : liveNow ? 'Live win chance' : 'Estimated win chance',
      band: band.band,
      bandTone: band.tone,
      note: settled
        ? null
        : `Projected margin ${one(Math.abs(num(context.expectedMargin) ?? 0))} pts · ${starterCount} starters${fallbackCount ? `, ${fallbackCount} on fallback estimates` : ', all with direct projections'}`,
    },
    watch: {
      unit: bigLabel,
      title: resolvedPhase === 'post' ? 'Who decided it' : resolvedPhase === 'live' ? (liveNow ? 'Live movers' : 'Top scorers so far') : 'Players to watch',
      a: topStarters(sideA, resolvedPhase),
      b: topStarters(sideB, resolvedPhase),
    },
    seasonShape: buildSeasonShape(sideA, sideB, context.league),
    firstKickoff: firstKickoffLabel(normalizedSlots),
    nextKickoff: firstKickoffLabel(normalizedSlots, (starter) => starter.gameState === 'upcoming'),
    liveNow,
  };
}

/** Earliest kickoff across every starter, for the panel's header line. */
function firstKickoffLabel(slots, include = () => true) {
  const kickoffs = slots
    .flatMap((slot) => [slot.a, slot.b])
    .filter((starter) => !starter?.isEmpty && include(starter))
    .map((starter) => Date.parse(String(starter?.kickoffAt ?? '')))
    .filter((value) => Number.isFinite(value));
  if (!kickoffs.length) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(Math.min(...kickoffs)));
  } catch { return null; }
}

function topStarters(side, phase) {
  const value = (starter) => (phase === 'pre' ? starter.projected : starter.actual ?? starter.projected);
  // Once scoring has begun the list ranks scorers, so a starter whose game has
  // not kicked off has no score to rank and would only show a placeholder 0.0.
  const hasScored = (starter) => phase === 'pre' || starter.gameState === 'live' || starter.gameState === 'final';
  return side.starters
    .filter((starter) => !starter.isEmpty && hasScored(starter) && value(starter) != null)
    .sort((left, right) => value(right) - value(left))
    .slice(0, 3)
    .map((starter) => ({
      ...starter,
      value: value(starter),
      // A finished game cannot score any more, so only an unfinished game's
      // points are "so far" / "live".
      unit: phase === 'pre' ? 'projected' : starter.gameState === 'final' ? 'final' : 'live',
      tag: starterTag(starter, phase),
      tone: starterTone(starter, phase),
    }));
}

function starterTag(starter, phase) {
  if (phase !== 'pre') {
    const baseline = starter.baselineProjected ?? starter.projected;
    const status = starter.gameState === 'final' ? 'Final' : starter.gameState === 'live' ? 'In progress' : 'Not started';
    if (starter.gameState !== 'upcoming' && starter.actual != null && baseline != null) {
      const delta = starter.actual - baseline;
      return `${status} · ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} vs projection`;
    }
    return status;
  }
  if (starter.isBye) return 'On bye';
  if (starter.opponentContext?.rank != null) {
    return `#${starter.opponentContext.rank} vs ${starter.opponentContext.position}`;
  }
  // The opponent already appears in the row's own meta line, so an opponent-only
  // tag would just repeat it.
  return null;
}

function starterTone(starter, phase) {
  if (phase !== 'pre') {
    const baseline = starter.baselineProjected ?? starter.projected;
    if (starter.actual == null || baseline == null) return 'flat';
    const delta = starter.actual - baseline;
    return delta > 1.5 ? 'good' : delta < -1.5 ? 'bad' : 'flat';
  }
  const rank = starter.opponentContext?.rank;
  const teams = starter.opponentContext?.teamCount ?? 32;
  if (rank == null) return 'flat';
  if (rank >= teams - 7) return 'good';
  if (rank <= 8) return 'bad';
  return 'flat';
}

function buildSeasonShape(sideA, sideB, league) {
  if (!sideA.games && !sideB.games) return null;
  const rows = [
    sideA.record && sideB.record
      ? {
        label: 'Record', sub: 'league seed', numeric: false,
        a: sideA.record, b: sideB.record,
        aValue: sideA.seed == null ? null : -sideA.seed,
        bValue: sideB.seed == null ? null : -sideB.seed,
        aSub: sideA.seedLabel,
        bSub: sideB.seedLabel,
      }
      : null,
    sideA.pointsFor != null && sideB.pointsFor != null
      ? { label: 'Points for', unit: 'pts', a: sideA.pointsFor, b: sideB.pointsFor }
      : null,
    sideA.pointsAgainst != null && sideB.pointsAgainst != null
      ? { label: 'Points against', unit: 'pts', lowerWins: true, a: sideA.pointsAgainst, b: sideB.pointsAgainst }
      : null,
    sideA.pointsFor != null && sideA.pointsAgainst != null && sideB.pointsFor != null && sideB.pointsAgainst != null
      ? (() => {
        const diffA = round1(sideA.pointsFor - sideA.pointsAgainst);
        const diffB = round1(sideB.pointsFor - sideB.pointsAgainst);
        return {
          label: 'Differential', numeric: false,
          a: `${diffA >= 0 ? '+' : '−'}${Math.abs(diffA).toFixed(1)}`,
          b: `${diffB >= 0 ? '+' : '−'}${Math.abs(diffB).toFixed(1)}`,
          aValue: diffA, bValue: diffB,
        };
      })()
      : null,
    league?.averagePointsFor != null && sideA.pointsFor != null && sideB.pointsFor != null && sideA.games && sideB.games
      ? {
        label: 'Points a week', sub: 'league average ' + one(league.averagePointsFor / Math.max(1, Math.max(sideA.games, sideB.games))),
        unit: 'pts',
        a: round1(sideA.pointsFor / sideA.games),
        b: round1(sideB.pointsFor / sideB.games),
      }
      : null,
  ].filter(Boolean);
  if (!rows.length) return null;
  const weeks = Math.max(sideA.games, sideB.games);
  return { title: 'Season shape', note: `through ${weeks} week${weeks === 1 ? '' : 's'}`, rows };
}
