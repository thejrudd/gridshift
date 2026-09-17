import { buildFantasyScoringBreakdown } from './fantasyBreakdownRows.js';
import { getFallbackRemainingGameFraction } from './liveScoringFeed.js';

const OUTLOOK_LEVELS = [
  { min: 0.55, label: 'Strong outlook', tone: 'strong' },
  { min: 0.15, label: 'Favorable outlook', tone: 'favorable' },
  { min: -0.2, label: 'Mixed outlook', tone: 'mixed' },
  { min: -0.55, label: 'Risky outlook', tone: 'risky' },
  { min: -Infinity, label: 'Very risky outlook', tone: 'very-risky' },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizedPosition(position) {
  const value = String(position ?? '').toUpperCase();
  if (['DE', 'DT'].includes(value)) return 'DL';
  if (['ILB', 'OLB'].includes(value)) return 'LB';
  if (['CB', 'S', 'SS', 'FS'].includes(value)) return 'DB';
  return value || null;
}

function summarizeDefenseTable(defenseTable, position, beforeWeek = null) {
  const normalized = normalizedPosition(position);
  if (!normalized) return new Map();
  const result = new Map();
  for (const [rawTeam, positions] of Object.entries(defenseTable ?? {})) {
    const values = Object.entries(positions?.[normalized] ?? {})
      .filter(([week]) => beforeWeek == null || Number(week) < Number(beforeWeek))
      .map(([, value]) => matchupNumber(value))
      .filter(value => value != null);
    if (!values.length) continue;
    const team = String(rawTeam).toUpperCase();
    result.set(team, {
      team,
      games: values.length,
      ppg: values.reduce((sum, value) => sum + value, 0) / values.length,
    });
  }
  return result;
}

/**
 * Display-only early-season context for the player drilldown. The shared
 * projection and Heatmap classifications remain current-season-only.
 */
export function buildDrilldownOpponentContext({
  currentDefenseTable,
  priorDefenseTable,
  oppTeam,
  position,
  beforeWeek = null,
  transitionGames = 4,
  minStandaloneGames = 3,
} = {}) {
  const team = String(oppTeam ?? '').toUpperCase();
  if (!team) return null;
  const currentByTeam = summarizeDefenseTable(currentDefenseTable, position, beforeWeek);
  const priorByTeam = summarizeDefenseTable(priorDefenseTable, position);
  const teams = new Set([...currentByTeam.keys(), ...priorByTeam.keys()]);
  const rows = [...teams].flatMap((candidate) => {
    const current = currentByTeam.get(candidate) ?? null;
    const prior = priorByTeam.get(candidate)?.games >= minStandaloneGames
      ? priorByTeam.get(candidate)
      : null;
    if (!current && !prior) return [];
    if (current && prior) {
      const currentWeight = clamp(current.games / Math.max(1, transitionGames), 0, 1);
      return [{
        team: candidate,
        ptsAllowedPerGame: current.ppg * currentWeight + prior.ppg * (1 - currentWeight),
        currentPtsAllowedPerGame: current.ppg,
        priorPtsAllowedPerGame: prior.ppg,
        currentGames: current.games,
        priorGames: prior.games,
        currentWeight,
        evidenceKind: currentWeight >= 1 ? 'current' : 'blended',
      }];
    }
    if (current?.games >= minStandaloneGames) {
      return [{
        team: candidate,
        ptsAllowedPerGame: current.ppg,
        currentPtsAllowedPerGame: current.ppg,
        priorPtsAllowedPerGame: null,
        currentGames: current.games,
        priorGames: 0,
        currentWeight: 1,
        evidenceKind: 'current',
      }];
    }
    if (prior) {
      return [{
        team: candidate,
        ptsAllowedPerGame: prior.ppg,
        currentPtsAllowedPerGame: null,
        priorPtsAllowedPerGame: prior.ppg,
        currentGames: 0,
        priorGames: prior.games,
        currentWeight: 0,
        evidenceKind: 'prior',
      }];
    }
    return [];
  });
  const target = rows.find(row => row.team === team);
  if (!target) return null;
  const sorted = rows.slice().sort((left, right) => left.ptsAllowedPerGame - right.ptsAllowedPerGame || left.team.localeCompare(right.team));
  const rank = 1 + sorted.filter(row => row.ptsAllowedPerGame < target.ptsAllowedPerGame).length;
  const leagueAverage = sorted.reduce((sum, row) => sum + row.ptsAllowedPerGame, 0) / sorted.length;
  return {
    ...target,
    rank,
    teamCount: sorted.length,
    leagueAveragePtsAllowed: leagueAverage,
    differenceFromLeagueAverage: target.ptsAllowedPerGame - leagueAverage,
    position: normalizedPosition(position),
  };
}

export function getNoteworthyWeather({ weather, isIndoor = false, position = null } = {}) {
  if (isIndoor || !weather) return null;
  const temperature = matchupNumber(weather.temp_c);
  const wind = matchupNumber(weather.wind_kph);
  const precipitation = matchupNumber(weather.precipitation_mm);
  const passingPosition = ['QB', 'WR', 'TE'].includes(normalizedPosition(position));
  const reasons = [];
  if (wind != null && (wind > 40 || (passingPosition && wind > 25))) reasons.push(`${Math.round(wind)} km/h wind`);
  if (precipitation != null && precipitation > 3) reasons.push(precipitation > 8 ? 'heavy precipitation' : 'steady precipitation');
  if (temperature != null && temperature < 0) reasons.push(`${Math.round(temperature)}°C temperature`);
  if (!reasons.length) return null;
  return {
    label: reasons.join(' and '),
    sentence: `${reasons.join(' and ')} may add volatility.`,
  };
}

export function buildPlayerOutlook({
  projection,
  seasonAverage,
  opponentContext,
  availabilityStatus = null,
  noteworthyWeather = null,
} = {}) {
  const projected = matchupNumber(projection);
  const season = matchupNumber(seasonAverage);
  const allowed = matchupNumber(opponentContext?.ptsAllowedPerGame);
  const leagueAllowed = matchupNumber(opponentContext?.leagueAveragePtsAllowed);
  if (projected == null) {
    return {
      label: 'Outlook unavailable',
      tone: 'mixed',
      sentence: 'A projection is required before this weekly outlook can be assessed.',
    };
  }

  const signals = [];
  if (season != null && season > 0) signals.push(clamp(((projected - season) / season) / 0.2, -1, 1));
  if (allowed != null && leagueAllowed != null && leagueAllowed > 0) {
    signals.push(clamp(((allowed - leagueAllowed) / leagueAllowed) / 0.2, -1, 1));
  }
  let score = signals.length ? signals.reduce((sum, value) => sum + value, 0) / signals.length : 0;
  const status = String(availabilityStatus ?? '').toLowerCase();
  if (/out|injured reserve|pup|nfi|suspended|inactive/.test(status)) score = -1;
  else if (/doubtful/.test(status)) score -= 0.55;
  else if (/questionable|dnp/.test(status)) score -= 0.22;
  if (noteworthyWeather) score -= 0.12;
  const level = OUTLOOK_LEVELS.find(item => score >= item.min) ?? OUTLOOK_LEVELS[2];

  const sentences = [];
  if (season != null) {
    const difference = projected - season;
    sentences.push(`Projects ${Math.abs(difference).toFixed(1)} ${difference >= 0 ? 'above' : 'below'} the ${season.toFixed(1)} season average.`);
  }
  if (allowed != null && leagueAllowed != null) {
    const difference = allowed - leagueAllowed;
    const opponent = opponentContext?.team ?? 'opponent';
    const position = opponentContext?.position ? `${opponentContext.position}` : 'position';
    sentences.push(`${opponent}'s ${allowed.toFixed(1)} ${position} allowance is ${Math.abs(difference).toFixed(1)} ${difference >= 0 ? 'above' : 'below'} league average.`);
  }
  let sentence = sentences.length
    ? sentences.join(' ')
    : 'Projection is available, but season and opponent benchmarks are not yet established.';
  if (availabilityStatus) sentence += ` ${availabilityStatus} adds availability risk.`;
  return { label: level.label, tone: level.tone, sentence, score };
}

export function getRangeMarkerPosition(value, min, max) {
  const numeric = matchupNumber(value);
  const low = matchupNumber(min);
  const high = matchupNumber(max);
  if (numeric == null || low == null || high == null || high <= low) return null;
  return clamp((numeric - low) / (high - low) * 100, 0, 100);
}

export function matchupNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function resolvePlayerDisplayProjection({ isPregame, projection, baseline }) {
  if (!isPregame && matchupNumber(baseline?.projection?.projected) != null) {
    return { projection: baseline.projection, label: 'Pregame projection', recorded: true };
  }
  if (matchupNumber(projection?.projected) != null) {
    return { projection, label: isPregame ? 'Projection' : 'Available estimate', recorded: false };
  }
  return { projection: null, label: 'Projection', recorded: false };
}

/**
 * Returns the projection target a live player should be measured against at
 * this moment. A live score is on pace when it is at or above the share of
 * the full-game projection expected for the elapsed game time. Settled games
 * intentionally use the full-game projection instead; pregame has no actual
 * score to compare.
 */
export function getPlayerPerformanceTarget({
  phase,
  total,
  projected,
  scheduleEntry = null,
  now = Date.now(),
} = {}) {
  const projection = matchupNumber(projected);
  if (projection == null) return null;
  if (phase === 'final') return projection;
  if (phase !== 'live') return null;

  const remainingFraction = getFallbackRemainingGameFraction({
    scheduleEntry,
    currentPoints: total,
    now,
  });
  return projection * (1 - remainingFraction);
}

// The default stat line is football context, not every scoring rule. Preserve
// the full scoring rows separately so bonuses and deductions remain auditable.
export function getPlayerHeadlineStats(position, stats, rows = []) {
  const definitions = {
    QB: [['pass_yd', 'Passing yards'], ['pass_td', 'Passing TDs'], ['rush_yd', 'Rushing yards'], ['pass_int', 'Interceptions']],
    RB: [['rush_yd', 'Rushing yards'], ['rec', 'Receptions'], ['rec_yd', 'Receiving yards'], ['rush_td', 'Rushing TDs'], ['rush_att', 'Carries']],
    WR: [['rec', 'Receptions'], ['rec_yd', 'Receiving yards'], ['rec_td', 'Receiving TDs'], ['rec_tgt', 'Targets']],
    TE: [['rec', 'Receptions'], ['rec_yd', 'Receiving yards'], ['rec_td', 'Receiving TDs'], ['rec_tgt', 'Targets']],
    K: [['fgm', 'Field goals'], ['xpm', 'Extra points'], ['fgmiss', 'Missed field goals'], ['xpmiss', 'Missed extra points']],
    DEF: [['sack', 'Sacks'], ['int', 'Interceptions'], ['pts_allow', 'Points allowed'], ['def_td', 'Touchdowns']],
  };
  const keys = definitions[position] ?? [['idp_tkl_solo', 'Solo tackles'], ['idp_tkl_ast', 'Assists'], ['idp_sack', 'Sacks'], ['idp_int', 'Interceptions']];
  return keys.flatMap(([key, label]) => {
    const row = rows.find(item => item.statKey === key && item.statVal != null);
    const value = matchupNumber(stats?.[key]) ?? matchupNumber(row?.statVal);
    return value == null ? [] : [{ key, label, value, points: row?.pts ?? null }];
  }).slice(0, 4);
}

const PLAYER_STANDOUT_METRICS = {
  QB: [
    { key: 'pass_yd', singular: 'passing yard', plural: 'passing yards' },
    { key: 'pass_td', singular: 'passing touchdown', plural: 'passing touchdowns' },
    { key: 'pass_cmp', singular: 'completion', plural: 'completions' },
    { key: 'rush_yd', singular: 'rushing yard', plural: 'rushing yards' },
    { key: 'rush_td', singular: 'rushing touchdown', plural: 'rushing touchdowns' },
  ],
  RB: [
    { key: 'rush_yd', singular: 'rushing yard', plural: 'rushing yards' },
    { key: 'rush_td', singular: 'rushing touchdown', plural: 'rushing touchdowns' },
    { key: 'rec_yd', singular: 'receiving yard', plural: 'receiving yards' },
    { key: 'rec', singular: 'reception', plural: 'receptions' },
    { key: 'rec_td', singular: 'receiving touchdown', plural: 'receiving touchdowns' },
  ],
  WR: [
    { key: 'rec_yd', singular: 'receiving yard', plural: 'receiving yards' },
    { key: 'rec', singular: 'reception', plural: 'receptions' },
    { key: 'rec_td', singular: 'receiving touchdown', plural: 'receiving touchdowns' },
    { key: 'rush_yd', singular: 'rushing yard', plural: 'rushing yards' },
    { key: 'rush_td', singular: 'rushing touchdown', plural: 'rushing touchdowns' },
  ],
  TE: [
    { key: 'rec_yd', singular: 'receiving yard', plural: 'receiving yards' },
    { key: 'rec', singular: 'reception', plural: 'receptions' },
    { key: 'rec_td', singular: 'receiving touchdown', plural: 'receiving touchdowns' },
    { key: 'rush_yd', singular: 'rushing yard', plural: 'rushing yards' },
    { key: 'rush_td', singular: 'rushing touchdown', plural: 'rushing touchdowns' },
  ],
  K: [
    { key: 'fgm', singular: 'made field goal', plural: 'made field goals' },
    { key: 'xpm', singular: 'made extra point', plural: 'made extra points' },
  ],
  DST: [
    { key: 'def_td', singular: 'defensive touchdown', plural: 'defensive touchdowns' },
    { key: 'sack', singular: 'sack', plural: 'sacks' },
    { key: 'int', singular: 'interception', plural: 'interceptions' },
    { key: 'safe', singular: 'safety', plural: 'safeties' },
    { key: 'def_ff', singular: 'forced fumble', plural: 'forced fumbles' },
  ],
  DL: [
    { key: 'idp_sack', singular: 'sack', plural: 'sacks' },
    { key: 'idp_tkl', singular: 'tackle', plural: 'tackles' },
    { key: 'idp_tkl_solo', singular: 'solo tackle', plural: 'solo tackles' },
    { key: 'idp_int', singular: 'interception', plural: 'interceptions' },
    { key: 'idp_ff', singular: 'forced fumble', plural: 'forced fumbles' },
  ],
  LB: [
    { key: 'idp_tkl', singular: 'tackle', plural: 'tackles' },
    { key: 'idp_sack', singular: 'sack', plural: 'sacks' },
    { key: 'idp_tkl_solo', singular: 'solo tackle', plural: 'solo tackles' },
    { key: 'idp_int', singular: 'interception', plural: 'interceptions' },
    { key: 'idp_ff', singular: 'forced fumble', plural: 'forced fumbles' },
  ],
  DB: [
    { key: 'idp_int', singular: 'interception', plural: 'interceptions' },
    { key: 'idp_tkl', singular: 'tackle', plural: 'tackles' },
    { key: 'idp_tkl_solo', singular: 'solo tackle', plural: 'solo tackles' },
    { key: 'idp_pd', singular: 'pass breakup', plural: 'pass breakups' },
    { key: 'idp_ff', singular: 'forced fumble', plural: 'forced fumbles' },
  ],
};

const PLAYER_NEGATIVE_METRICS = {
  QB: [
    { key: 'pass_sack', singular: 'sack', plural: 'sacks' },
    { key: 'pass_int', singular: 'interception', plural: 'interceptions' },
    { key: 'fum_lost', singular: 'fumble lost', plural: 'fumbles lost' },
  ],
  RB: [
    { key: 'fum_lost', singular: 'fumble lost', plural: 'fumbles lost' },
  ],
  WR: [
    { key: 'fum_lost', singular: 'fumble lost', plural: 'fumbles lost' },
  ],
  TE: [
    { key: 'fum_lost', singular: 'fumble lost', plural: 'fumbles lost' },
  ],
  K: [
    { key: 'fgmiss', singular: 'missed field goal', plural: 'missed field goals' },
    { key: 'xpmiss', singular: 'missed extra point', plural: 'missed extra points' },
  ],
  DST: [
    { key: 'pts_allow', singular: 'point allowed', plural: 'points allowed' },
  ],
};

function getStandoutMetricRow(statByKey, key) {
  if (statByKey instanceof Map || typeof statByKey?.get === 'function') return statByKey.get(key);
  return statByKey && typeof statByKey === 'object' ? statByKey[key] : null;
}

function formatStandoutMetricValue(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function getPlayerStandoutPosition(position) {
  const value = String(position ?? '').toUpperCase();
  if (['DST', 'D/ST', 'DEF', 'DEFENSE'].includes(value)) return 'DST';
  if (value === 'PK') return 'K';
  return normalizedPosition(value);
}

/**
 * Describes one position-appropriate factual stat from a comparison model.
 *
 * `model.statByKey` is normally a Map of scoring-breakdown rows. A row must
 * have a finite positive `statVal`; null, missing, and reported-zero values
 * return no standout. When positive scored points are present, they choose
 * the most consequential metric. Otherwise the configured position order is
 * used.
 * The result is ready to append to editorial copy, or null when no supported
 * factual metric is available.
 */
export function describePlayerStandoutStat(model = {}) {
  if (!model || typeof model !== 'object') return null;
  const position = getPlayerStandoutPosition(model.position ?? model.player?.position);
  const metrics = PLAYER_STANDOUT_METRICS[position];
  if (!metrics || !model.statByKey) return null;

  const candidates = metrics.flatMap((metric, order) => {
    const row = getStandoutMetricRow(model.statByKey, metric.key);
    const value = matchupNumber(row?.statVal);
    const points = matchupNumber(row?.pts);
    if (value == null || value <= 0 || (points != null && points < 0)) return [];
    return [{ metric, value, points, order }];
  });
  if (!candidates.length) return null;

  candidates.sort((left, right) => {
    const leftHasPoints = left.points != null && left.points > 0;
    const rightHasPoints = right.points != null && right.points > 0;
    if (leftHasPoints !== rightHasPoints) return rightHasPoints - leftHasPoints;
    if (leftHasPoints && right.points !== left.points) return right.points - left.points;
    return left.order - right.order;
  });

  const { metric, value } = candidates[0];
  return `${formatStandoutMetricValue(value)} ${value === 1 ? metric.singular : metric.plural}`;
}

/**
 * Describes the factual negative signals that affected a player's result.
 * These are stat events, not inferred narratives: an injury is intentionally
 * omitted unless a separate, explicit injury event is available.
 */
export function describePlayerNegativeStats(model = {}, limit = 2) {
  if (!model || typeof model !== 'object') return null;
  const position = getPlayerStandoutPosition(model.position ?? model.player?.position);
  const metrics = PLAYER_NEGATIVE_METRICS[position];
  if (!metrics || !model.statByKey) return null;

  const signals = metrics.flatMap((metric, order) => {
    const row = getStandoutMetricRow(model.statByKey, metric.key);
    const value = matchupNumber(row?.statVal);
    if (value == null || value <= 0) return [];
    return [{ metric, value, order }];
  }).sort((left, right) => left.order - right.order)
    .slice(0, Math.max(1, Number(limit) || 2));

  if (!signals.length) return null;
  return signals
    .map(({ metric, value }) => `${formatStandoutMetricValue(value)} ${value === 1 ? metric.singular : metric.plural}`)
    .reduce((result, item, index) => index === 0 ? item : `${result}${index === signals.length - 1 ? ' and ' : ', '}${item}`, '');
}

export function getPlayerOpponentDifficulty(percentile) {
  const value = matchupNumber(percentile);
  if (value == null) return null;
  if (value <= 0.2) return { label: 'Difficult', tone: 'negative' };
  if (value <= 0.4) return { label: 'Challenging', tone: 'caution' };
  if (value <= 0.6) return { label: 'Average', tone: 'neutral' };
  if (value <= 0.8) return { label: 'Favorable', tone: 'positive' };
  return { label: 'Easy', tone: 'positive' };
}

// Schedule evidence wins over placeholder zero rows. Missing timing is not
// evidence that a game has started; real stats remain a compatibility fallback.
export function getPlayerMatchupPhase({ scheduleEntry, gameStarted, hasStats = false, now = Date.now() } = {}) {
  const finalFlags = [scheduleEntry?.completed, scheduleEntry?.isFinal, scheduleEntry?.final];
  const explicitlyFinal = finalFlags.some(value => value === true);
  const explicitlyNotFinal = !explicitlyFinal && finalFlags.some(value => value === false);
  const status = [
    scheduleEntry?.status,
    scheduleEntry?.statusType,
    scheduleEntry?.state,
    scheduleEntry?.gameStatus,
  ].map(value => String(value ?? '').toLowerCase()).join(' ');
  if (explicitlyFinal || (!explicitlyNotFinal && /(?:^|[_\s-])(?:final(?:ized)?|complete(?:d)?|post(?:-?game)?)(?:$|[_\s-])/.test(status))) return 'final';
  if (/postponed|cancelled|canceled|delayed/.test(status)) return 'pregame';
  if (/in_progress|inprogress|live|^in$/.test(status)) return 'live';
  const kickoff = Date.parse(scheduleEntry?.kickoff ?? '');
  if (Number.isFinite(kickoff)) return now >= kickoff ? 'live' : 'pregame';
  return gameStarted === true || hasStats ? 'live' : 'pregame';
}

export function buildPlayerProjectionBreakdown(projection, scoringSettings, position) {
  if (!projection?.projectedStats || matchupNumber(projection.projected) == null) return null;
  return buildFantasyScoringBreakdown(projection.projectedStats, scoringSettings, position, {
    authoritativeTotal: matchupNumber(projection.projected),
    includeFallbackTotal: false,
    preferRawStats: true,
    adjustmentLabel: 'Projection adjustment',
  });
}

// Keep scoring adjustments in the point totals, not in the raw-stat comparison.
// An omitted actual stat is zero only when a detailed provider row is present.
export function buildPlayerStatComparison(actualRows, projectedRows, hasActualStats = false) {
  const actual = new Map(actualRows.filter(row => row.statKey && row.statVal != null).map(row => [row.statKey, row]));
  const projected = new Map(projectedRows.filter(row => row.statKey && row.statVal != null).map(row => [row.statKey, row]));
  return [...new Set([...projected.keys(), ...actual.keys()])].map(key => {
    const actualValue = actual.get(key)?.statVal ?? (hasActualStats ? 0 : null);
    const projectedValue = projected.get(key)?.statVal ?? null;
    return {
      key, label: projected.get(key)?.label ?? actual.get(key)?.label,
      actual: actualValue, projected: projectedValue,
      difference: actualValue != null && projectedValue != null ? actualValue - projectedValue : null,
    };
  });
}

// Headline sentence for the drilldown's editorial line, returned as emphasis
// parts rather than markup so the surface never needs dangerouslySetInnerHTML.
// Every number here is one the drilldown already shows elsewhere; this line
// restates visible evidence and never introduces a new projection source.
export function buildPlayerHeadlineParts({
  phase,
  total,
  projected,
  performanceTarget = null,
  seasonAverage,
  opponentContext = null,
  outlook = null,
} = {}) {
  const scored = matchupNumber(total);
  const projection = matchupNumber(projected);
  const season = matchupNumber(seasonAverage);

  if (phase === 'live' || phase === 'final') {
    if (scored == null) return null;
    if (projection == null) {
      return [
        { text: phase === 'final' ? 'Finished the week with ' : 'Has scored ' },
        { text: `${scored.toFixed(1)} points`, emphasis: true },
        { text: '. No projection was available to compare against.' },
      ];
    }
    const target = phase === 'live' ? matchupNumber(performanceTarget) ?? projection : projection;
    const targetLabel = phase === 'live' && matchupNumber(performanceTarget) != null
      ? 'expected pace'
      : phase === 'live' ? 'full-game projection' : 'projection';
    const difference = scored - target;
    const magnitude = Math.abs(difference).toFixed(1);
    const direction = difference >= 0 ? 'above' : 'below';
    return phase === 'final'
      ? [
        { text: 'Finished ' },
        { text: `${magnitude} ${direction}`, emphasis: true },
        { text: ` the ${projection.toFixed(1)} projection` },
        ...(season != null ? [{ text: `, against a ${season.toFixed(1)} season average` }] : []),
        { text: '.' },
      ]
      : [
        { text: 'Currently ' },
        { text: `${magnitude} ${direction}`, emphasis: true },
        { text: ` the ${target.toFixed(1)} ${targetLabel}, with the game still in progress.` },
      ];
  }

  if (projection == null) return null;
  const rank = matchupNumber(opponentContext?.rank);
  const teamCount = matchupNumber(opponentContext?.teamCount);
  const opponent = opponentContext?.team;
  const position = opponentContext?.position;
  const hasOpponentContext = rank != null && teamCount != null && opponent;
  const hasSeasonAverage = season != null && season > 0;

  // A bare "Projects X points" restates the Hero card above with nothing new,
  // so only render it when a season-average comparison or opponent-rank clause
  // can attach; otherwise there is no context left to add and the line is dropped.
  if (!hasSeasonAverage && !hasOpponentContext) return null;

  const parts = [];
  if (hasSeasonAverage) {
    const difference = projection - season;
    parts.push(
      { text: 'Projects ' },
      { text: `${Math.abs(difference).toFixed(1)} ${difference >= 0 ? 'above' : 'below'}`, emphasis: true },
      { text: ` a ${season.toFixed(1)} season average` },
    );
  } else {
    parts.push({ text: 'Projects ' }, { text: `${projection.toFixed(1)} points`, emphasis: true });
  }

  if (hasOpponentContext) {
    parts.push(
      { text: ', against ' },
      { text: `${opponent}'s #${rank}`, emphasis: true },
      { text: ` of ${teamCount} defense versus ${position ?? 'the position'}.` },
    );
  } else {
    parts.push({ text: '.' });
  }

  if (outlook?.tone === 'risky' || outlook?.tone === 'very-risky') {
    parts.push({ text: ` ${outlook.label}.` });
  }
  return parts;
}

/* ── projected stat-line grouping ──
   Presentation only. The scoring rows themselves stay exactly as
   `buildFantasyScoringBreakdown` produced them; this decides which heading a
   row sits under and in what order the headings read, so the drilldown can
   show the composition of a projection instead of one flat decimal list. */

const BREAKDOWN_GROUPS = [
  { id: 'passing', label: 'Passing' },
  { id: 'rushing', label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'kicking', label: 'Kicking' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special teams' },
  { id: 'bonus', label: 'Bonuses' },
  { id: 'negative', label: 'Negative plays' },
  { id: 'model', label: 'Model' },
];

const NEGATIVE_PLAY_KEYS = new Set(['fum', 'fum_lost', 'pass_int', 'pass_int_td', 'int_ret_td']);
const MODEL_KEYS = new Set(['scoring_adjustment', 'projection_adjustment', 'fantasy_points_total']);
const TEAM_RESULT_KEYS = new Set(['team_win', 'team_loss', 'team_tie']);

export function getFantasyBreakdownGroupId(row) {
  const key = String(row?.statKey ?? row?.key ?? '');
  if (MODEL_KEYS.has(key)) return 'model';
  if (NEGATIVE_PLAY_KEYS.has(key)) return 'negative';
  // Bonuses follow the stat family they reward; a bonus spanning two families
  // (rush + rec) has no single home, so it falls through to Bonuses.
  const family = key.startsWith('bonus_') ? key.slice('bonus_'.length) : key;
  if (family.startsWith('rush_rec')) return 'bonus';
  if (family.startsWith('pass')) return 'passing';
  if (family.startsWith('rush')) return 'rushing';
  if (family === 'rec' || family.startsWith('rec')) return 'receiving';
  if (family.startsWith('fg') || family.startsWith('xp')) return 'kicking';
  if (family.startsWith('kr') || family.startsWith('pr') || family.startsWith('st_')
    || family === 'ret_td' || family.startsWith('blk_kick')) return 'special';
  if (family.startsWith('fum')) return 'negative';
  if (family.startsWith('idp') || family.startsWith('def') || family.startsWith('sack')
    || family.startsWith('tkl') || family.startsWith('pts_allow') || family.startsWith('yds_allow')
    || ['int', 'int_ret_yd', 'safe', 'qb_hit'].includes(family)) return 'defense';
  if (family.startsWith('fd_')) return 'bonus';
  if (TEAM_RESULT_KEYS.has(family)) return 'defense';
  return key.startsWith('bonus_') ? 'bonus' : 'model';
}

export function groupFantasyBreakdownRows(rows = []) {
  const byGroup = new Map();
  for (const row of rows) {
    const id = getFantasyBreakdownGroupId(row);
    if (!byGroup.has(id)) byGroup.set(id, []);
    byGroup.get(id).push(row);
  }
  return BREAKDOWN_GROUPS
    .filter(group => byGroup.has(group.id))
    .map(group => {
      const groupRows = byGroup.get(group.id)
        .slice()
        .sort((left, right) => Math.abs(right.pts) - Math.abs(left.pts));
      return {
        ...group,
        rows: groupRows,
        sum: Math.round(groupRows.reduce((total, row) => total + row.pts, 0) * 100) / 100,
      };
    });
}
