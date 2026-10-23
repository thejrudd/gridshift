import { canonicalTeam } from './nflPlays/fieldGeometry.js';
import { PLAY_ROLES, parseFumble, parseInterception, parsePenaltyClause } from './nflPlays/playNarrative.js';
import { isFirstDownPlay } from './playByPlay/playStatDelta.js';
import { attributePlays } from './statisticsPlayerQuarterStats.js';

// statisticsTeamStatBreakdown.js — which players produced each team stat.
//
// Statistics Scores shows the provider's team totals; expanding a stat lists
// the players behind it, credited from the play-by-play through the same name
// matching as the box-score quarter split. Plays the narrative parser cannot
// read confidently are left out, so a breakdown can sum to less than the
// provider total; it never invents a credit.

// Provider stat labels (see buildTeamStatGroups in balldontlieNflScoreboard.js
// and the dev fixture) mapped to a breakdown. Stats missing here have no single
// owner (yards per play, yards allowed, time of possession) and stay
// non-expandable.
export const TEAM_STAT_BREAKDOWN_BY_LABEL = Object.freeze({
  'Total yards': 'totalYards',
  'Passing yards': 'passingYards',
  'Rushing yards': 'rushingYards',
  'First downs': 'firstDowns',
  Sacks: 'sacks',
  Takeaways: 'takeaways',
  'Third down': 'thirdDown',
  'Fourth down': 'fourthDown',
  'Red zone': 'redZone',
  Turnovers: 'turnovers',
  Penalties: 'penalties',
  'Offensive plays': 'offensivePlays',
  // Rows built from the play-by-play (statisticsScoresPlayStats.js).
  'Success rate': 'successRate',
  'Passes of 20+ yards': 'explosivePasses',
  'Runs of 20+ yards': 'explosiveRuns',
  'Goal-to-go touchdowns': 'goalToGo',
  'Field goals': 'fieldGoals',
  'Kick return average': 'kickReturns',
  'Punt return average': 'puntReturns',
  'Net punting': 'netPunting',
});

const KICK_SLUG = /punt|field.?goal|kickoff|extra.?point/;

function teamOfKey(key) {
  return String(key ?? '').split(':')[0] || null;
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Every flag in a play's official text. One snap can draw several (offsetting
// fouls, a foul after the play), and penalty-only rows have no narrative, so
// the text is read directly rather than through the parsed narrative.
function penaltiesIn(text) {
  const source = String(text ?? '');
  const found = [];
  const pattern = /PENALTY on /gi;
  let match = pattern.exec(source);
  while (match) {
    const clause = parsePenaltyClause(source.slice(match.index));
    if (clause) found.push(clause);
    match = pattern.exec(source);
  }
  return found;
}

// Who lost the ball: the last player named before "FUMBLES", ignoring the
// parenthesized tacklers. The shared parser takes the first name, which on a
// return is the kicker, so a muffed return would be pinned on the wrong side.
function fumblerName(text) {
  const before = String(text ?? '').split(/FUMBLES/i)[0].replace(/\([^)]*\)/g, ' ');
  const names = before.match(/\b[A-Z][A-Za-z'’-]*\.[A-Z][A-Za-z'’.-]+/g);
  return names?.at(-1)?.replace(/\.$/, '') ?? null;
}

// The scorer of a touchdown the narrative grammar could not read, such as a
// play whose text carries a two-point attempt: the receiver on a pass,
// otherwise the first player named.
function touchdownScorerName(text) {
  const source = String(text ?? '').split(/TOUCHDOWN/i)[0];
  const receiver = /\bpass\b[^.]*?\bto ([A-Z][A-Za-z'’-]*\.[A-Z][A-Za-z'’-]+)/.exec(source);
  if (receiver) return receiver[1];
  return /\b([A-Z][A-Za-z'’-]*\.[A-Z][A-Za-z'’-]+)/.exec(source.replace(/^\s*\([^)]*\)\s*/, ''))?.[1] ?? null;
}

function clockLabel(play) {
  const period = Number(play?.period);
  const quarter = period >= 1 && period <= 4 ? `Q${period}` : period === 5 ? 'OT' : null;
  return [quarter, play?.time].filter(Boolean).join(' ');
}

export function isScrimmage(entry) {
  const slug = String(entry.play?.typeSlug ?? '').toLowerCase();
  return !entry.administrative && !entry.negated && !KICK_SLUG.test(slug) && (entry.pass || entry.rush
    || /sack/.test(slug) || entry.narrative.playKind === 'sack');
}

export function completed(entry) {
  return entry.pass && !entry.incomplete && !entry.interception;
}

export function actorsWith(entry, role) {
  return entry.actors.filter((actor) => actor.role === role);
}

// The player who had the ball: the rusher, or the targeted receiver on a pass,
// or the passer on a sack or an untargeted throw.
function ballPlayer(entry) {
  if (entry.rush) return actorsWith(entry, PLAY_ROLES.RUSHER)[0] ?? null;
  return actorsWith(entry, PLAY_ROLES.RECEIVER)[0]
    ?? actorsWith(entry, PLAY_ROLES.PASSER)[0]
    ?? null;
}

export function yardsOf(entry) {
  return finite(entry.narrative.yards) ?? finite(entry.play?.statYardage);
}

/**
 * A successful snap gains 40% of the distance on first down, 60% on second, and
 * all of it on third or fourth, or scores. A sack, an incompletion, or a
 * turnover is a failed snap. Returns null for a snap with no down.
 */
export function isSuccessfulSnap(entry, { turnover = false, gained = entry.rush || completed(entry) } = {}) {
  const down = finite(entry.play?.startDown);
  const distance = finite(entry.play?.startDistance);
  if (!(down >= 1 && down <= 4) || distance == null) return null;
  if (turnover) return false;
  if (entry.touchdown) return true;
  if (!gained) return false;
  const share = down === 1 ? 0.4 : down === 2 ? 0.6 : 1;
  return (yardsOf(entry) ?? 0) >= share * distance;
}

/** Goal to go: the line to gain is the goal line. */
export function isGoalToGo(play) {
  const distance = finite(play?.startDistance);
  const toGo = finite(play?.startYardsToEndzone);
  return distance != null && toGo != null && toGo > 0 && distance >= toGo;
}

/**
 * A kick's special-teams facts from the parsed narrative. The punt's gross
 * distance is read from the official text, because the shared grammar reads
 * "punts 49 yards to CLV 1, downed by…" as zero yards.
 */
export function kickFacts(entry) {
  const kind = entry.narrative.playKind;
  if (entry.negated || entry.administrative) return null;
  const text = String(entry.play?.rawText || entry.play?.description || '');
  const returner = actorsWith(entry, PLAY_ROLES.RETURNER)[0] ?? null;
  const returnYards = finite(entry.narrative.returnYards);
  if (kind === 'field-goal') {
    const kicker = actorsWith(entry, PLAY_ROLES.KICKER)[0] ?? null;
    if (entry.narrative.good == null) return null;
    return { kind, kicker, good: Boolean(entry.narrative.good), distance: finite(entry.narrative.distance) };
  }
  if (kind === 'kickoff') {
    return { kind, returner: returner && returnYards != null ? returner : null, returnYards };
  }
  if (kind === 'punt') {
    if (/blocked/i.test(text)) return null;
    const gross = finite(/punts (-?\d+) yards?/i.exec(text)?.[1]) ?? finite(entry.narrative.distance);
    if (gross == null) return null;
    const touchback = entry.narrative.outcome === 'touchback' || /touchback/i.test(text);
    return {
      kind,
      punter: actorsWith(entry, PLAY_ROLES.PUNTER)[0] ?? null,
      returner: returner && returnYards != null ? returner : null,
      returnYards,
      net: gross - (returnYards ?? 0) - (touchback ? 20 : 0),
    };
  }
  return null;
}

function makeTally() {
  const byTeam = new Map();
  const add = (key, { value = 1, attempts = 0, yards = 0, note = null, name = null } = {}) => {
    const team = teamOfKey(key);
    if (!key || !team) return;
    if (!byTeam.has(team)) byTeam.set(team, new Map());
    const players = byTeam.get(team);
    if (!players.has(key)) players.set(key, { key, name, value: 0, attempts: 0, yards: 0, notes: [] });
    const row = players.get(key);
    row.value += value;
    row.attempts += attempts;
    row.yards += yards;
    if (note) row.notes.push(note);
  };
  return { byTeam, add };
}

function rowsFor(tally, team, format) {
  const players = tally.byTeam.get(team);
  if (!players) return [];
  return [...players.values()]
    .map((row) => ({ key: row.key, ...(row.name ? { name: row.name } : {}), ...format(row) }))
    .filter((row) => row.sort !== 0 || row.keep)
    .sort((left, right) => right.sort - left.sort || left.key.localeCompare(right.key));
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const FORMATS = {
  totalYards: (row) => ({ sort: row.value, value: `${row.value} yds`, detail: plural(row.attempts, 'touch', 'touches') }),
  passingYards: (row) => ({ sort: row.value, value: `${row.value} yds`, detail: plural(row.attempts, 'catch', 'catches') }),
  rushingYards: (row) => ({ sort: row.value, value: `${row.value} yds`, detail: plural(row.attempts, 'carry', 'carries') }),
  firstDowns: (row) => ({ sort: row.value, value: String(row.value) }),
  sacks: (row) => ({ sort: row.value, value: String(row.value), detail: row.yards ? `${row.yards} yds` : null }),
  takeaways: (row) => ({ sort: row.value, value: String(row.value), detail: row.notes.join(', ') }),
  thirdDown: (row) => ({ sort: row.value + row.attempts / 1000, keep: true, value: `${row.value}–${row.attempts}` }),
  fourthDown: (row) => ({ sort: row.value + row.attempts / 1000, keep: true, value: `${row.value}–${row.attempts}` }),
  redZone: (row) => ({ sort: row.value, value: plural(row.value, 'TD'), detail: row.notes.join(', ') }),
  turnovers: (row) => ({ sort: row.value, value: String(row.value), detail: row.notes.join(', ') }),
  penalties: (row) => ({ sort: row.value + row.yards / 1000, value: `${row.value}–${row.yards}`, detail: row.notes.join(', ') }),
  offensivePlays: (row) => ({ sort: row.value, value: String(row.value) }),
  successRate: (row) => ({ sort: row.value + row.attempts / 1000, keep: true, value: `${row.value}–${row.attempts}`, detail: row.attempts ? `${Math.round((row.value / row.attempts) * 100)}%` : null }),
  explosivePasses: (row) => ({ sort: row.value + row.yards / 1000, value: String(row.value), detail: `${row.yards} yds` }),
  explosiveRuns: (row) => ({ sort: row.value + row.yards / 1000, value: String(row.value), detail: `${row.yards} yds` }),
  goalToGo: (row) => ({ sort: row.value, value: plural(row.value, 'TD'), detail: row.notes.join(', ') }),
  fieldGoals: (row) => ({ sort: row.value + row.attempts / 1000, keep: true, value: `${row.value}–${row.attempts}`, detail: row.notes.join(', ') }),
  kickReturns: (row) => ({ sort: row.yards, keep: true, value: (row.yards / row.attempts).toFixed(1), detail: `${plural(row.attempts, 'return')} · ${row.yards} yds` }),
  puntReturns: (row) => ({ sort: row.yards, keep: true, value: (row.yards / row.attempts).toFixed(1), detail: `${plural(row.attempts, 'return')} · ${row.yards} yds` }),
  netPunting: (row) => ({ sort: row.attempts, keep: true, value: (row.yards / row.attempts).toFixed(1), detail: plural(row.attempts, 'punt') }),
};

/**
 * Players behind each expandable team stat, per team.
 *
 * @returns {Record<string, Record<string, Array<{key, value, detail, sort}>>>}
 *   breakdown id -> team abbreviation -> rows sorted by contribution.
 */
export function buildTeamStatBreakdown({ plays = [], roster = [], homeTeam = null, awayTeam = null } = {}) {
  const { entries, matchName } = attributePlays({ plays, roster, homeTeam, awayTeam });
  const tallies = Object.fromEntries(Object.keys(FORMATS).map((id) => [id, makeTally()]));
  // A credited name that is not in the box score (an offensive lineman's flag, a
  // recovery by a player with no other stat) keeps the official text's name.
  const resolve = (name, team) => {
    if (!name) return { key: null, name: null };
    const key = matchName(name, team);
    return key ? { key, name: null } : { key: team ? `${team}:text-${name}` : null, name };
  };
  const redZoneDrives = new Set();
  const goalToGoDrives = new Set();

  for (const entry of entries) {
    const { play } = entry;
    const driveKey = play?.driveId ?? play?.drive ?? null;
    const yardsToEndzone = finite(play?.startYardsToEndzone);
    if (driveKey != null && yardsToEndzone != null && yardsToEndzone <= 20 && !entry.administrative) {
      redZoneDrives.add(`${entry.offenseTeam}:${driveKey}`);
    }
    if (driveKey != null && !entry.administrative && !entry.negated && isGoalToGo(play)) {
      goalToGoDrives.add(`${entry.offenseTeam}:${driveKey}`);
    }

    // Penalties are read from the flag itself, so a play the narrative cannot
    // parse, or one the flag wiped out, still credits the flagged player.
    for (const penalty of penaltiesIn(play?.rawText || play?.description)) {
      if (penalty.declined) continue;
      const team = canonicalTeam(penalty.team);
      // A flag on the club itself (delay of game, too many men) names no one.
      const flagged = penalty.name ? resolve(penalty.name, team) : { key: team ? `${team}:team` : null, name: 'Team' };
      tallies.penalties.add(flagged.key, { yards: finite(penalty.yards) ?? 0, note: penalty.infraction, name: flagged.name });
    }

    if (entry.negated || entry.administrative) continue;
    const scrimmage = isScrimmage(entry);
    const text = play?.rawText || play?.description;
    const pick = entry.interception ? parseInterception(text) : null;
    const fumble = parseFumble(text);
    // A return fumble belongs to the receiving side, not the play's offense, so
    // the fumbling team comes from the player who lost the ball.
    const fumblerKey = fumble
      ? (actorsWith(entry, PLAY_ROLES.FUMBLER)[0]?.playerKey ?? matchName(fumblerName(text) ?? fumble.fumbledBy, null))
      : null;
    const fumblerTeam = fumblerKey ? teamOfKey(fumblerKey) : entry.offenseTeam;
    const lostFumble = fumble && canonicalTeam(fumble.recoveredByTeam) !== fumblerTeam ? fumble : null;
    const carrier = ballPlayer(entry);
    const yards = yardsOf(entry) ?? 0;

    if (entry.rush) {
      for (const actor of actorsWith(entry, PLAY_ROLES.RUSHER)) {
        tallies.rushingYards.add(actor.playerKey, { value: yards, attempts: 1 });
        tallies.totalYards.add(actor.playerKey, { value: yards, attempts: 1 });
      }
    }
    if (completed(entry)) {
      for (const actor of actorsWith(entry, PLAY_ROLES.RECEIVER)) {
        tallies.passingYards.add(actor.playerKey, { value: yards, attempts: 1 });
        tallies.totalYards.add(actor.playerKey, { value: yards, attempts: 1 });
      }
    }
    const turnover = entry.interception || Boolean(lostFumble);
    if (scrimmage && carrier) {
      tallies.offensivePlays.add(carrier.playerKey);
      // The shared first-down check reads the raw row; normalized Scores plays
      // carry the same end-of-snap down as `endDown`.
      const needed = finite(play?.startDistance);
      const gained = entry.rush || completed(entry);
      const startDown = finite(play?.startDown);
      const converted = entry.touchdown || (!turnover && gained && (startDown === 4
        ? needed != null && yards >= needed
        : isFirstDownPlay(play) || finite(play?.endDown) === 1 || (needed != null && yards >= needed)));
      if ((entry.rush || completed(entry)) && converted) tallies.firstDowns.add(carrier.playerKey);
      const down = startDown;
      if (down === 3) tallies.thirdDown.add(carrier.playerKey, { value: converted ? 1 : 0, attempts: 1 });
      if (down === 4) tallies.fourthDown.add(carrier.playerKey, { value: converted ? 1 : 0, attempts: 1 });
      const success = isSuccessfulSnap(entry, { turnover });
      if (success != null) tallies.successRate.add(carrier.playerKey, { value: success ? 1 : 0, attempts: 1 });
    }
    if (yards >= 20 && completed(entry)) {
      for (const actor of actorsWith(entry, PLAY_ROLES.RECEIVER)) tallies.explosivePasses.add(actor.playerKey, { yards });
    }
    if (yards >= 20 && entry.rush) {
      for (const actor of actorsWith(entry, PLAY_ROLES.RUSHER)) tallies.explosiveRuns.add(actor.playerKey, { yards });
    }

    const kick = kickFacts(entry);
    if (kick?.kind === 'field-goal' && kick.kicker) {
      tallies.fieldGoals.add(kick.kicker.playerKey, { value: kick.good ? 1 : 0, attempts: 1, note: kick.distance != null ? `${kick.distance}${kick.good ? '' : ' missed'}` : null });
    }
    if (kick?.returner) {
      tallies[kick.kind === 'punt' ? 'puntReturns' : 'kickReturns'].add(kick.returner.playerKey, { value: 0, attempts: 1, yards: kick.returnYards });
    }
    if (kick?.kind === 'punt' && kick.punter) tallies.netPunting.add(kick.punter.playerKey, { value: 0, attempts: 1, yards: kick.net });

    for (const actor of actorsWith(entry, PLAY_ROLES.SACKER)) {
      tallies.sacks.add(actor.playerKey, { yards: Math.abs(yards) });
    }

    // Turnovers are read from the official text as well as the parsed actors,
    // so a pick or a lost fumble the narrative grammar missed is still credited.
    if (entry.interception) {
      const passer = actorsWith(entry, PLAY_ROLES.PASSER)[0]?.playerKey ?? matchName(pick?.passer, entry.offenseTeam);
      const defenderKey = actorsWith(entry, PLAY_ROLES.INTERCEPTER)[0]?.playerKey;
      const defender = defenderKey ? { key: defenderKey, name: null } : resolve(pick?.defender, entry.defenseTeam);
      tallies.turnovers.add(passer, { note: 'Interception' });
      tallies.takeaways.add(defender.key, { note: 'Interception', name: defender.name });
    }
    if (lostFumble) {
      const fumbler = fumblerKey;
      const recovererKey = actorsWith(entry, PLAY_ROLES.RECOVERER)[0]?.playerKey;
      const recoverer = recovererKey ? { key: recovererKey, name: null } : resolve(lostFumble.recoveredBy, canonicalTeam(lostFumble.recoveredByTeam));
      tallies.turnovers.add(fumbler, { note: 'Fumble lost' });
      tallies.takeaways.add(recoverer.key, { note: 'Fumble recovery', name: recoverer.name });
    }

    const scoredOnRedZoneDrive = driveKey != null && redZoneDrives.has(`${entry.offenseTeam}:${driveKey}`);
    // BALLDONTLIE's red_zone_scores counts touchdowns on red-zone trips, so a
    // field goal from inside the 20 is not a red-zone score here either.
    const touchdownPlay = entry.touchdown || /TOUCHDOWN/.test(String(text ?? ''));
    if (scoredOnRedZoneDrive && touchdownPlay && !entry.interception && !lostFumble) {
      const actor = completed(entry) ? actorsWith(entry, PLAY_ROLES.RECEIVER)[0] : actorsWith(entry, PLAY_ROLES.RUSHER)[0];
      const scorer = actor ? { key: actor.playerKey, name: null } : resolve(touchdownScorerName(text), entry.offenseTeam);
      tallies.redZone.add(scorer.key, { note: clockLabel(play), name: scorer.name });
    }
    if (driveKey != null && goalToGoDrives.has(`${entry.offenseTeam}:${driveKey}`) && touchdownPlay && !entry.interception && !lostFumble) {
      const actor = completed(entry) ? actorsWith(entry, PLAY_ROLES.RECEIVER)[0] : actorsWith(entry, PLAY_ROLES.RUSHER)[0];
      const scorer = actor ? { key: actor.playerKey, name: null } : resolve(touchdownScorerName(text), entry.offenseTeam);
      tallies.goalToGo.add(scorer.key, { note: clockLabel(play), name: scorer.name });
    }
  }

  const teams = [awayTeam, homeTeam].map(canonicalTeam).filter(Boolean);
  return Object.fromEntries(Object.entries(tallies).map(([id, tally]) => [
    id,
    Object.fromEntries(teams.map((team) => [team, rowsFor(tally, team, FORMATS[id])])),
  ]));
}
