import { canonicalTeam, getDriveNetYards } from './nflPlays/fieldGeometry.js';
import { parseFumble } from './nflPlays/playNarrative.js';
import { attributePlays } from './statisticsPlayerQuarterStats.js';
import { isGoalToGo, isSuccessfulSnap, kickFacts, yardsOf } from './statisticsTeamStatBreakdown.js';

// statisticsScoresPlayStats.js — Team Stats rows the score feed does not
// carry, counted from the game's play-by-play: success rate, explosive plays,
// goal-to-go, drive results, special teams, and scoring before the half and
// the game end. The rows take the provider groups' shape so Team Stats renders
// both the same way, and are merged into the matching provider group.
//
// A row appears only when the plays support it for at least one team; nothing
// is estimated.

const finite = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Team rows classify each snap from its type and parsed narrative, not from the
// matched players, so a team count never depends on box-score name matching.
function snapKind(entry) {
  const slug = String(entry.play?.typeSlug ?? '').toLowerCase();
  const kind = entry.narrative.playKind;
  if (/sack/.test(slug) || kind === 'sack') return 'sack';
  if (/punt|field.?goal|kickoff|extra.?point|two.?point/.test(slug)) return null;
  if (/pass|interception/.test(slug) || ['pass', 'incompletion', 'interception'].includes(kind)) {
    return entry.incomplete || entry.interception ? 'incomplete' : 'completion';
  }
  if (/rush/.test(slug) || kind === 'rush') return 'rush';
  return null;
}

const clockSeconds = (time) => {
  const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

function emptyTally() {
  return {
    snaps: 0, successes: 0, explosivePasses: 0, explosiveRuns: 0,
    goalToGoTrips: 0, goalToGoTouchdowns: 0,
    drives: 0, drivePoints: 0, driveYards: 0, threeAndOuts: 0, startSum: 0, starts: 0,
    fieldGoals: 0, fieldGoalTries: 0, kickReturns: 0, kickReturnYards: 0,
    puntReturns: 0, puntReturnYards: 0, punts: 0, netPuntYards: 0,
    lateHalfPoints: 0,
  };
}

const ownLine = (yardsToEndzone) => 100 - yardsToEndzone;
const fieldSpot = (own) => {
  const rounded = Math.round(own);
  return rounded === 50 ? 'Midfield' : rounded < 50 ? `Own ${rounded}` : `Opp ${100 - rounded}`;
};

// Team score after a play, for whichever side is asked.
function scoreOf(play, side) {
  return finite(side === 'home' ? play?.homeScore : play?.awayScore);
}

/** Per-team counts from the play-by-play. */
export function tallyPlayStats({ drives = [], roster = [], homeTeam = null, awayTeam = null } = {}) {
  const home = canonicalTeam(homeTeam);
  const away = canonicalTeam(awayTeam);
  const tallies = { [away]: emptyTally(), [home]: emptyTally() };
  const sideOf = (team) => (team === home ? 'home' : team === away ? 'away' : null);
  const originals = drives.flatMap((drive) => drive.plays);
  const plays = drives.flatMap((drive) => drive.plays.map((play) => ({ ...play, driveId: drive.id })));
  const { entries } = attributePlays({ plays, roster, homeTeam, awayTeam });
  const entryByPlay = new Map(entries.map((entry, index) => [originals[index], entry]));

  for (const entry of entries) {
    const tally = tallies[entry.offenseTeam];
    if (!tally || entry.negated || entry.administrative) continue;
    const text = entry.play?.rawText || entry.play?.description;
    const snap = snapKind(entry);
    if (snap) {
      const fumble = parseFumble(text);
      const lost = Boolean(fumble?.recoveredByTeam) && canonicalTeam(fumble.recoveredByTeam) !== entry.offenseTeam;
      const gained = snap === 'rush' || snap === 'completion';
      const success = isSuccessfulSnap(entry, { turnover: entry.interception || lost, gained });
      if (success != null) {
        tally.snaps += 1;
        if (success) tally.successes += 1;
      }
      const yards = yardsOf(entry) ?? 0;
      if (yards >= 20 && snap === 'completion') tally.explosivePasses += 1;
      if (yards >= 20 && snap === 'rush') tally.explosiveRuns += 1;
    }
    const kick = kickFacts(entry);
    if (kick?.kind === 'field-goal') {
      tally.fieldGoalTries += 1;
      if (kick.good) tally.fieldGoals += 1;
    }
    if (kick?.kind === 'punt') {
      tally.punts += 1;
      tally.netPuntYards += kick.net;
    }
    if (kick && kick.kind !== 'field-goal' && kick.returnYards != null) {
      const returning = tallies[entry.defenseTeam];
      if (returning && kick.kind === 'punt') { returning.puntReturns += 1; returning.puntReturnYards += kick.returnYards; }
      if (returning && kick.kind === 'kickoff') { returning.kickReturns += 1; returning.kickReturnYards += kick.returnYards; }
    }
  }

  // Drives: points are the offense's own score change across the possession,
  // so a defensive score during it is not credited to the offense.
  let previous = { away: 0, home: 0 };
  for (const drive of drives) {
    const team = canonicalTeam(drive.team);
    const side = sideOf(team);
    const scored = [...drive.plays].reverse().find((play) => scoreOf(play, 'away') != null && scoreOf(play, 'home') != null);
    const after = scored ? { away: scoreOf(scored, 'away'), home: scoreOf(scored, 'home') } : previous;
    const tally = side ? tallies[team] : null;
    const snaps = drive.plays.map((play) => entryByPlay.get(play))
      .filter((entry) => entry && entry.offenseTeam === team && !entry.negated && !entry.administrative && snapKind(entry));
    if (tally && snaps.length) {
      tally.drives += 1;
      tally.drivePoints += Math.max(0, after[side] - previous[side]);
      tally.driveYards += getDriveNetYards(drive.plays, { homeTeam: home, awayTeam: away }) ?? 0;
      const start = finite(snaps[0].play?.startYardsToEndzone);
      if (start != null) { tally.startSum += ownLine(start); tally.starts += 1; }
      if (/punt/i.test(drive.result ?? '') && snaps.length <= 3) tally.threeAndOuts += 1;
      if (snaps.some((entry) => isGoalToGo(entry.play))) {
        tally.goalToGoTrips += 1;
        const touchdown = snaps.some((entry) => entry.touchdown && !entry.interception);
        if (touchdown || (/touchdown/i.test(drive.result ?? '') && after[side] - previous[side] >= 6)) tally.goalToGoTouchdowns += 1;
      }
    }
    previous = after;
  }

  // Points in the last two minutes of each half, from the running score.
  let running = { away: 0, home: 0 };
  for (const play of plays) {
    const next = { away: scoreOf(play, 'away') ?? running.away, home: scoreOf(play, 'home') ?? running.home };
    const seconds = clockSeconds(play.time);
    const late = (Number(play.period) === 2 || Number(play.period) === 4) && seconds != null && seconds <= 120;
    if (late) {
      if (tallies[away]) tallies[away].lateHalfPoints += Math.max(0, next.away - running.away);
      if (tallies[home]) tallies[home].lateHalfPoints += Math.max(0, next.home - running.home);
    }
    running = next;
  }
  return tallies;
}

const ratioValue = (made, tries) => (tries ? `${made}–${tries}` : null);
const average = (total, count, digits = 1) => (count ? (total / count).toFixed(digits) : null);

// The advantage rail reads numbers; an average formatted as text carries its
// number as the ratio.
const numeric = (value) => (typeof value === 'string' ? finite(Number.parseFloat(value)) : finite(value));

function row(label, awayValue, homeValue, { direction = 'higher', awayRatio = numeric(awayValue), homeRatio = numeric(homeValue) } = {}) {
  if (awayValue == null && homeValue == null) return null;
  return {
    label,
    away: awayValue ?? '—',
    home: homeValue ?? '—',
    direction,
    awayRatio,
    homeRatio,
  };
}

const share = (made, tries) => (tries ? made / tries : null);

/**
 * Team Stats rows from the play-by-play, keyed by the provider group they
 * extend (`offense`, `situational`, `possession`) or a new group
 * (`drives`, `special`).
 */
export function buildPlayStatGroups({ drives = [], roster = [], homeTeam = null, awayTeam = null } = {}) {
  if (!drives.length) return [];
  const tallies = tallyPlayStats({ drives, roster, homeTeam, awayTeam });
  const a = tallies[canonicalTeam(awayTeam)];
  const h = tallies[canonicalTeam(homeTeam)];
  if (!a || !h) return [];
  const pct = (made, tries) => (tries ? `${Math.round((made / tries) * 100)}%` : null);
  const groups = [
    ['offense', 'Offense', [
      row('Success rate', pct(a.successes, a.snaps), pct(h.successes, h.snaps), { awayRatio: share(a.successes, a.snaps), homeRatio: share(h.successes, h.snaps) }),
      a.snaps || h.snaps ? row('Passes of 20+ yards', a.explosivePasses, h.explosivePasses) : null,
      a.snaps || h.snaps ? row('Runs of 20+ yards', a.explosiveRuns, h.explosiveRuns) : null,
    ]],
    ['situational', 'Situational', [
      row('Goal-to-go touchdowns', ratioValue(a.goalToGoTouchdowns, a.goalToGoTrips), ratioValue(h.goalToGoTouchdowns, h.goalToGoTrips), {
        awayRatio: share(a.goalToGoTouchdowns, a.goalToGoTrips), homeRatio: share(h.goalToGoTouchdowns, h.goalToGoTrips),
      }),
    ]],
    ['drives', 'Drives', [
      row('Points per drive', average(a.drivePoints, a.drives), average(h.drivePoints, h.drives)),
      row('Yards per drive', average(a.driveYards, a.drives), average(h.driveYards, h.drives)),
      a.drives || h.drives ? row('Three-and-outs', a.threeAndOuts, h.threeAndOuts, { direction: 'lower' }) : null,
      row('Average start', a.starts ? fieldSpot(a.startSum / a.starts) : null, h.starts ? fieldSpot(h.startSum / h.starts) : null, {
        awayRatio: a.starts ? a.startSum / a.starts : null, homeRatio: h.starts ? h.startSum / h.starts : null,
      }),
    ]],
    ['possession', 'Possession', [
      a.drives || h.drives ? row('Points in final 2:00 of halves', a.lateHalfPoints, h.lateHalfPoints) : null,
    ]],
    ['special', 'Special teams', [
      row('Field goals', ratioValue(a.fieldGoals, a.fieldGoalTries), ratioValue(h.fieldGoals, h.fieldGoalTries), {
        awayRatio: share(a.fieldGoals, a.fieldGoalTries), homeRatio: share(h.fieldGoals, h.fieldGoalTries),
      }),
      row('Kick return average', average(a.kickReturnYards, a.kickReturns), average(h.kickReturnYards, h.kickReturns)),
      row('Punt return average', average(a.puntReturnYards, a.puntReturns), average(h.puntReturnYards, h.puntReturns)),
      row('Net punting', average(a.netPuntYards, a.punts), average(h.netPuntYards, h.punts)),
    ]],
  ];
  return groups
    .map(([id, label, stats]) => ({ id, label, stats: stats.filter(Boolean) }))
    .filter((group) => group.stats.length);
}

// Where the new groups sit among the provider's.
const GROUP_ORDER = ['offense', 'defense', 'situational', 'drives', 'discipline', 'possession', 'special'];

/** Provider groups with the play-by-play rows appended to the matching group. */
export function mergeStatGroups(providerGroups = [], playGroups = []) {
  const merged = new Map(providerGroups.map((group) => [group.id, { ...group, stats: [...group.stats] }]));
  for (const group of playGroups) {
    if (merged.has(group.id)) {
      const target = merged.get(group.id);
      const labels = new Set(target.stats.map((stat) => stat.label));
      target.stats.push(...group.stats.filter((stat) => !labels.has(stat.label)));
    } else {
      merged.set(group.id, group);
    }
  }
  const rank = (id) => {
    const index = GROUP_ORDER.indexOf(id);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...merged.values()].sort((left, right) => rank(left.id) - rank(right.id));
}
