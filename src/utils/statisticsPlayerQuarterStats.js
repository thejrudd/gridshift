import { canonicalTeam, getOffenseTeam } from './nflPlays/fieldGeometry.js';
import { PLAY_ROLES, parseInterception, parsePlayNarrative } from './nflPlays/playNarrative.js';

const GENERATIONAL_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
const OFFENSIVE_ROLES = new Set([
  PLAY_ROLES.PASSER,
  PLAY_ROLES.RECEIVER,
  PLAY_ROLES.RUSHER,
  PLAY_ROLES.KICKER,
  PLAY_ROLES.PUNTER,
]);

const CATEGORY_IDS = Object.freeze([
  'passing',
  'rushing',
  'receiving',
  'defense',
  'kicking',
  'punting',
  'returns',
]);

const CATEGORY_COLUMN_COUNTS = Object.freeze({
  passing: 5,
  rushing: 5,
  receiving: 5,
  defense: 5,
  kicking: 4,
  punting: 4,
  returns: 4,
});

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? null;
}

function playerName(row) {
  return firstString(
    [row?.player?.first_name, row?.player?.last_name].filter(Boolean).join(' '),
    row?.player?.full_name,
    row?.player?.name,
  ) ?? 'Unknown player';
}

function playerTeam(row) {
  return firstString(
    row?.team?.abbreviation,
    row?.player?.team?.abbreviation,
    row?.team?.id,
    row?.player?.team,
    'NFL',
  )?.toUpperCase() ?? 'NFL';
}

function letters(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

function nameTokens(value) {
  return String(value ?? '')
    .replace(/[’']/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function lastNameToken(tokens) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!GENERATIONAL_SUFFIXES.has(letters(tokens[index]))) return tokens[index];
  }
  return tokens.at(-1) ?? '';
}

function nameAliases(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];

  const tokens = nameTokens(text);
  const last = letters(lastNameToken(tokens));
  const first = letters(tokens[0]);
  const aliases = [letters(text)];
  if (first && last) {
    aliases.push(`${first[0]}${last}`);
    aliases.push(`${first}${last}`);
  }

  // Official descriptions abbreviate a name as `D.Prescott` or `J.Jeudy`.
  // Keep the surname boundary so a full-name player index can resolve those
  // names without accepting an ambiguous surname-only match.
  const abbreviated = /^([a-z])\.(.+)$/i.exec(text);
  if (abbreviated) aliases.push(`${abbreviated[1].toLowerCase()}${letters(abbreviated[2])}`);

  return [...new Set(aliases.filter(Boolean))];
}

/**
 * Stable key shared by the normalized player rows and the play-derived split.
 * Provider player IDs win when present; the team/name fallback keeps fixtures
 * and older provider responses addressable without inventing an ID.
 */
export function getStatisticsPlayerKey(row) {
  const team = canonicalTeam(playerTeam(row));
  const playerId = row?.player?.id ?? row?.player?.player_id ?? row?.player_id ?? row?.playerId;
  const identity = playerId == null || playerId === '' ? letters(playerName(row)) : `id-${playerId}`;
  return `${team}:${identity}`;
}

function periodNumber(value) {
  if (value == null || value === '' || value === 'T') return null;
  if (String(value).toUpperCase() === 'OT') return 5;
  const period = Number(value);
  return Number.isInteger(period) && period > 0 ? period : null;
}

function periodLabel(period) {
  return period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `OT${period - 4}`;
}

function normalizedPlayTeam(play) {
  return canonicalTeam(firstString(play?.team?.abbreviation, play?.team?.id, play?.team));
}

function otherTeam(team, { homeTeam, awayTeam }) {
  const home = canonicalTeam(homeTeam);
  const away = canonicalTeam(awayTeam);
  if (!team || !home || !away) return null;
  if (team === home) return away;
  if (team === away) return home;
  return null;
}

function roleTeam(role, play, context) {
  const possessionTeam = normalizedPlayTeam(play);
  const homeTeam = canonicalTeam(context.homeTeam);
  const awayTeam = canonicalTeam(context.awayTeam);
  const offenseTeam = canonicalTeam(getOffenseTeam(
    { ...play, team: possessionTeam },
    { homeTeam, awayTeam },
  ));

  if (OFFENSIVE_ROLES.has(role) || role === PLAY_ROLES.FUMBLER) return offenseTeam || possessionTeam;
  if (role === PLAY_ROLES.TACKLER || role === PLAY_ROLES.SACKER) {
    return otherTeam(offenseTeam, { homeTeam, awayTeam }) || possessionTeam;
  }
  if (role === PLAY_ROLES.INTERCEPTER || role === PLAY_ROLES.RETURNER || role === PLAY_ROLES.RECOVERER) {
    return possessionTeam || otherTeam(offenseTeam, { homeTeam, awayTeam });
  }
  return possessionTeam;
}

function buildPlayerIndex(players) {
  const rows = players.map((row) => ({
    key: getStatisticsPlayerKey(row),
    name: playerName(row),
    team: canonicalTeam(playerTeam(row)),
  }));
  const byTeamAlias = new Map();
  const byAlias = new Map();

  for (const row of rows) {
    for (const alias of nameAliases(row.name)) {
      const teamAlias = `${row.team}:${alias}`;
      if (!byTeamAlias.has(teamAlias)) byTeamAlias.set(teamAlias, row.key);
      else if (byTeamAlias.get(teamAlias) !== row.key) byTeamAlias.set(teamAlias, null);

      if (!byAlias.has(alias)) byAlias.set(alias, row.key);
      else if (byAlias.get(alias) !== row.key) byAlias.set(alias, null);
    }
  }

  return { byTeamAlias, byAlias };
}

function matchActor(actor, team, index) {
  const aliases = nameAliases(actor?.name);
  const normalizedTeam = canonicalTeam(team);
  for (const alias of aliases) {
    const teamMatch = index.byTeamAlias.get(`${normalizedTeam}:${alias}`);
    if (teamMatch) return teamMatch;
  }
  for (const alias of aliases) {
    const globalMatch = index.byAlias.get(alias);
    if (globalMatch) return globalMatch;
  }
  return null;
}

function getBucket(store, playerKey, category, period) {
  if (!store.has(playerKey)) store.set(playerKey, new Map());
  const categories = store.get(playerKey);
  if (!categories.has(category)) categories.set(category, new Map());
  const periods = categories.get(category);
  if (!periods.has(period)) periods.set(period, { events: 0 });
  return periods.get(period);
}

function addCounter(bucket, key, amount = 1) {
  bucket[key] = (bucket[key] ?? 0) + amount;
}

function addKnownSum(bucket, key, value) {
  const knownKey = `${key}Known`;
  if (bucket[knownKey] === false) return;
  if (value == null || !Number.isFinite(Number(value))) {
    bucket[knownKey] = false;
    return;
  }
  bucket[key] = (bucket[key] ?? 0) + Number(value);
}

function addKnownMax(bucket, key, value) {
  const knownKey = `${key}Known`;
  if (bucket[knownKey] === false) return;
  if (value == null || !Number.isFinite(Number(value))) {
    bucket[knownKey] = false;
    return;
  }
  bucket[key] = Math.max(bucket[key] ?? Number.NEGATIVE_INFINITY, Number(value));
}

function isInterception(play, narrative) {
  return /interception/.test(String(play?.typeSlug ?? '').toLowerCase()) || narrative.playKind === 'interception';
}

function isIncomplete(play, narrative) {
  return /incompletion|incomplete/.test(String(play?.typeSlug ?? '').toLowerCase()) || narrative.playKind === 'incompletion';
}

function isPass(play, narrative, actors) {
  const hasPasser = actors.some((actor) => actor.role === PLAY_ROLES.PASSER);
  if (!hasPasser || /sack/.test(String(play?.typeSlug ?? '').toLowerCase())) return false;
  return /pass/.test(String(play?.typeSlug ?? '').toLowerCase())
    || narrative.playKind === 'pass'
    || narrative.playKind === 'incompletion'
    || narrative.playKind === 'interception'
    || actors.some((actor) => actor.role === PLAY_ROLES.RECEIVER);
}

function isRush(play, narrative, actors) {
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  return actors.some((actor) => actor.role === PLAY_ROLES.RUSHER)
    && (/rush|run/.test(slug) || narrative.playKind === 'rush');
}

function touchdown(play, narrative) {
  return /touchdown/.test(String(play?.typeSlug ?? '').toLowerCase()) || narrative.playKind === 'touchdown';
}

function playerActorMap(narrative, play, context, index) {
  const actors = [...(narrative.actors ?? [])];
  if (!actors.some((actor) => actor.role === PLAY_ROLES.PASSER)) {
    const interception = isInterception(play, narrative)
      ? parseInterception(play?.rawText || play?.description)
      : null;
    const passerName = interception?.passer || play?.inferredPasserName;
    if (passerName) actors.push({ role: PLAY_ROLES.PASSER, name: passerName, inferred: true });
  }
  return actors
    .map((actor) => ({
      ...actor,
      playerKey: matchActor(actor, roleTeam(actor.role, play, context), index),
    }))
    .filter((actor) => actor.playerKey);
}

function calculatePasserRating(bucket) {
  const attempts = bucket.attempts;
  if (!attempts || bucket.yardsKnown === false) return null;
  const completions = bucket.completions ?? 0;
  const yards = bucket.yards ?? 0;
  const touchdownsCount = bucket.touchdowns ?? 0;
  const interceptions = bucket.interceptions ?? 0;
  const components = [
    ((completions / attempts) - 0.3) * 5,
    ((yards / attempts) - 3) * 0.25,
    (touchdownsCount / attempts) * 20,
    2.375 - ((interceptions / attempts) * 25),
  ].map((value) => Math.min(2.375, Math.max(0, value)));
  return components.reduce((total, value) => total + value, 0) / 6 * 100;
}

function displayedValue(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return digits ? Number(value).toFixed(digits) : String(Number.isInteger(Number(value)) ? Number(value) : Math.round(Number(value) * 10) / 10);
}

function bucketValue(bucket, key) {
  return bucket?.[`${key}Known`] === false ? null : bucket?.[key] ?? null;
}

function valuesFor(category, bucket) {
  if (!bucket) return Array.from({ length: CATEGORY_COLUMN_COUNTS[category] ?? 0 }, () => '—');
  switch (category) {
    case 'passing': {
      const attempts = bucket.attempts ?? null;
      const completions = bucket.completions ?? null;
      return [
        attempts == null || completions == null ? '—' : `${completions}/${attempts}`,
        displayedValue(bucketValue(bucket, 'yards')),
        displayedValue(bucket.touchdowns ?? null),
        displayedValue(bucket.interceptions ?? null),
        displayedValue(calculatePasserRating(bucket), 1),
      ];
    }
    case 'rushing': {
      const attempts = bucket.attempts ?? null;
      const yards = bucketValue(bucket, 'yards');
      return [
        displayedValue(attempts),
        displayedValue(yards),
        attempts && yards != null ? displayedValue(yards / attempts, 1) : '—',
        displayedValue(bucket.touchdowns ?? null),
        displayedValue(bucketValue(bucket, 'long')),
      ];
    }
    case 'receiving': {
      const receptions = bucket.receptions ?? null;
      const yards = bucketValue(bucket, 'yards');
      return [
        displayedValue(receptions),
        displayedValue(bucket.targets ?? null),
        displayedValue(yards),
        receptions && yards != null ? displayedValue(yards / receptions, 1) : '—',
        displayedValue(bucket.touchdowns ?? null),
      ];
    }
    case 'defense':
      return [
        displayedValue(bucket.totalTackles ?? null),
        '—',
        displayedValue(bucket.sacks ?? null, 1),
        '—',
        '—',
      ];
    case 'kicking':
      return [
        bucket.fieldGoalAttempts == null || bucket.fieldGoalsMade == null
          ? '—'
          : `${bucket.fieldGoalsMade}/${bucket.fieldGoalAttempts}`,
        displayedValue(bucketValue(bucket, 'long')),
        displayedValue(bucket.extraPointsMade ?? null),
        displayedValue(bucket.points ?? null),
      ];
    case 'punting': {
      const punts = bucket.punts ?? null;
      const yards = bucketValue(bucket, 'yards');
      return [
        displayedValue(punts),
        punts && yards != null ? displayedValue(yards / punts, 1) : '—',
        '—',
        displayedValue(bucketValue(bucket, 'long')),
      ];
    }
    case 'returns': {
      const returns = bucket.returns ?? null;
      const yards = bucketValue(bucket, 'yards');
      return [
        displayedValue(returns),
        displayedValue(yards),
        returns && yards != null ? displayedValue(yards / returns, 1) : '—',
        displayedValue(bucketValue(bucket, 'long')),
      ];
    }
    default:
      return [];
  }
}

function addPassingStats(store, actor, period, narrative, play, actors) {
  const bucket = getBucket(store, actor.playerKey, 'passing', period);
  bucket.events += 1;
  bucket.touchdowns ??= 0;
  bucket.interceptions ??= 0;
  addCounter(bucket, 'attempts');
  const interception = isInterception(play, narrative);
  const incomplete = isIncomplete(play, narrative);
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  const complete = !interception && !incomplete
    && (actors.some((entry) => entry.role === PLAY_ROLES.RECEIVER) || /reception|passing-touchdown/.test(slug) || narrative.playKind === 'pass');
  if (complete) addCounter(bucket, 'completions');
  if (complete) addKnownSum(bucket, 'yards', narrative.yards);
  if (touchdown(play, narrative) && complete) addCounter(bucket, 'touchdowns');
  if (interception) addCounter(bucket, 'interceptions');
}

function addRushingStats(store, actor, period, narrative, play) {
  const bucket = getBucket(store, actor.playerKey, 'rushing', period);
  bucket.events += 1;
  addCounter(bucket, 'attempts');
  addKnownSum(bucket, 'yards', narrative.yards);
  addCounter(bucket, 'touchdowns', touchdown(play, narrative) ? 1 : 0);
  addKnownMax(bucket, 'long', narrative.yards == null ? null : Math.max(0, narrative.yards));
}

function addReceivingStats(store, actor, period, narrative, play, actors) {
  const bucket = getBucket(store, actor.playerKey, 'receiving', period);
  bucket.events += 1;
  bucket.receptions ??= 0;
  bucket.touchdowns ??= 0;
  addCounter(bucket, 'targets');
  const interception = isInterception(play, narrative);
  const incomplete = isIncomplete(play, narrative);
  const complete = !interception && !incomplete;
  if (complete && actors.some((entry) => entry.role === PLAY_ROLES.RECEIVER)) addCounter(bucket, 'receptions');
  if (complete) addKnownSum(bucket, 'yards', narrative.yards);
  if (complete && touchdown(play, narrative)) addCounter(bucket, 'touchdowns');
}

function addDefenseStats(store, actor, period, role) {
  const bucket = getBucket(store, actor.playerKey, 'defense', period);
  bucket.events += 1;
  bucket.sacks ??= 0;
  if (role === PLAY_ROLES.TACKLER || role === PLAY_ROLES.SACKER) addCounter(bucket, 'totalTackles');
  if (role === PLAY_ROLES.SACKER) addCounter(bucket, 'sacks');
}

function addKickingStats(store, actor, period, narrative, play) {
  const bucket = getBucket(store, actor.playerKey, 'kicking', period);
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  bucket.events += 1;
  bucket.points ??= 0;
  if (/field.?goal/.test(slug) || narrative.playKind === 'field-goal') {
    addCounter(bucket, 'fieldGoalAttempts');
    if (narrative.good === true) {
      addCounter(bucket, 'fieldGoalsMade');
      addCounter(bucket, 'points', 3);
      addKnownMax(bucket, 'long', narrative.distance);
    } else if (narrative.good === false) {
      addCounter(bucket, 'fieldGoalsMade', 0);
    }
    return;
  }
  if (narrative.patResult) {
    if (/^kick$/i.test(narrative.patResult)) {
      addCounter(bucket, 'extraPointsMade');
      addCounter(bucket, 'points');
    }
  }
}

function addPuntingStats(store, actor, period, narrative) {
  const bucket = getBucket(store, actor.playerKey, 'punting', period);
  bucket.events += 1;
  addCounter(bucket, 'punts');
  addKnownSum(bucket, 'yards', narrative.distance);
  addKnownMax(bucket, 'long', narrative.distance);
}

function addReturnStats(store, actor, period, narrative) {
  const bucket = getBucket(store, actor.playerKey, 'returns', period);
  bucket.events += 1;
  addCounter(bucket, 'returns');
  addKnownSum(bucket, 'yards', narrative.returnYards);
  addKnownMax(bucket, 'long', narrative.returnYards);
}

function statsForPeriods(categories, periods) {
  return Object.fromEntries([...categories.entries()].map(([category, periodBuckets]) => [
    category,
    {
      source: 'play-by-play',
      periods: periods.map((period) => ({
        label: periodLabel(period),
        values: valuesFor(category, periodBuckets.get(period)),
      })),
    },
  ]));
}

/**
 * Derive a player's quarter split from the normalized play feed.
 *
 * This intentionally returns only confident actor matches. The provider's
 * player endpoint remains authoritative for full-game totals; this helper is a
 * transparent play-by-play projection for the expandable detail row.
 */
export function buildPlayerQuarterStats({
  plays = [],
  players = [],
  homeTeam = null,
  awayTeam = null,
  quarterLabels = [],
} = {}) {
  const context = { homeTeam, awayTeam };
  const index = buildPlayerIndex(players);
  const store = new Map();
  const periods = new Set(
    quarterLabels.map(periodNumber).filter(Boolean),
  );

  for (const play of plays) {
    const period = periodNumber(play?.period);
    if (!period) continue;
    periods.add(period);

    const narrative = parsePlayNarrative(play);
    const interception = isInterception(play, narrative)
      ? parseInterception(play?.rawText || play?.description)
      : null;
    if ((!narrative.confident && !interception?.passer) || narrative.administrative || narrative.negated) continue;
    const actors = playerActorMap(narrative, play, context, index);
    if (!actors.length) continue;

    const pass = isPass(play, narrative, actors);
    const rush = isRush(play, narrative, actors);
    for (const actor of actors) {
      if (actor.role === PLAY_ROLES.PASSER && pass) addPassingStats(store, actor, period, narrative, play, actors);
      if (actor.role === PLAY_ROLES.RUSHER && rush) addRushingStats(store, actor, period, narrative, play);
      if (actor.role === PLAY_ROLES.RECEIVER && pass) addReceivingStats(store, actor, period, narrative, play, actors);
      if (actor.role === PLAY_ROLES.TACKLER || actor.role === PLAY_ROLES.SACKER) addDefenseStats(store, actor, period, actor.role);
      if (actor.role === PLAY_ROLES.KICKER) addKickingStats(store, actor, period, narrative, play);
      if (actor.role === PLAY_ROLES.PUNTER) addPuntingStats(store, actor, period, narrative);
      if (actor.role === PLAY_ROLES.RETURNER) addReturnStats(store, actor, period, narrative);
    }
  }

  const orderedPeriods = [...periods].sort((left, right) => left - right);
  const byPlayer = Object.fromEntries([...store.entries()].map(([playerKey, categories]) => [
    playerKey,
    statsForPeriods(categories, orderedPeriods),
  ]));

  return { byPlayer, periods: orderedPeriods.map(periodLabel) };
}

export const STATISTICS_PLAYER_QUARTER_CATEGORIES = CATEGORY_IDS;
