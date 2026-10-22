import { parsePlayNarrative } from './nflPlays/playNarrative.js';

// A plain-language recap assembled from the normalized play-by-play. It only
// restates plays the provider reported: each scoring play or turnover reuses the
// shared play narrative sentence, and the quarter's closing score frames it.
// Nothing here is inferred editorial content; StoryStats owns that.

const PERIOD_NAMES = { 1: 'first quarter', 2: 'second quarter', 3: 'third quarter', 4: 'fourth quarter' };
const PERIOD_HEADINGS = { 1: 'First quarter', 2: 'Second quarter', 3: 'Third quarter', 4: 'Fourth quarter' };
const AFTER_PERIOD = { 1: 'after the first quarter', 2: 'at halftime', 3: 'after the third quarter', 4: 'at the end of regulation' };
const PERIOD_END_SLUGS = new Set(['end-period', 'end-of-half', 'end-of-game']);
const TURNOVER_SLUG = /interception|fumble-recovery-opponent/;

const periodName = (period) => PERIOD_NAMES[period] ?? 'overtime';
const periodHeading = (period) => PERIOD_HEADINGS[period] ?? (period === 5 ? 'Overtime' : `Overtime ${period - 4}`);
const afterPeriod = (period) => AFTER_PERIOD[period] ?? 'after overtime';
const isScore = (value) => Number.isFinite(value);
const teamName = (team) => team?.name || team?.id || 'The team';

function playScore(play) {
  return isScore(play?.awayScore) && isScore(play?.homeScore)
    ? { away: play.awayScore, home: play.homeScore }
    : null;
}

function scoringFallback(play, before, away, home) {
  const after = playScore(play);
  if (!after || !before) return null;
  const awayDelta = after.away - before.away;
  const homeDelta = after.home - before.home;
  const delta = Math.max(awayDelta, homeDelta);
  if (delta <= 0) return null;
  const scorer = awayDelta > homeDelta ? away : home;
  const what = delta >= 6 ? 'a touchdown' : delta === 3 ? 'a field goal' : delta === 2 ? 'a safety' : null;
  return what ? `${teamName(scorer)} scored ${what}.` : `${teamName(scorer)} scored.`;
}

function whenLabel(play) {
  const name = periodName(play.period);
  if (!PERIOD_NAMES[play.period]) return 'in overtime';
  return play.time === '0:00' ? `as the ${name} ended` : `with ${play.time} left in the ${name}`;
}

function leadSentence(score, away, home, suffix) {
  if (score.away === score.home) return `The game was tied ${score.away}-${score.home} ${suffix}.`;
  const awayLeads = score.away > score.home;
  const leader = awayLeads ? away : home;
  return `${teamName(leader)} led ${Math.max(score.away, score.home)}-${Math.min(score.away, score.home)} ${suffix}.`;
}

/**
 * Builds the Game Story fallback recap from a Scores detail object.
 *
 * Returns null when there is no play-by-play to recap. While a game is live,
 * only finished quarters are summarized; `note` explains an empty recap.
 */
export function buildGameRecap(detail) {
  const plays = (detail?.drives ?? []).flatMap((drive) => drive.plays ?? [])
    .filter((play) => Number(play?.period) > 0);
  if (!plays.length) return null;

  const { away, home } = detail;
  const final = detail.status === 'final';
  const lastPeriod = Math.max(...plays.map((play) => Number(play.period)));
  const periodClosed = (period) => final
    || period < lastPeriod
    || plays.some((play) => play.period === period && PERIOD_END_SLUGS.has(play.typeSlug));

  // One pass in game order: narrate key plays, and remember the running score so
  // a scoring play the narrative cannot read still gets a factual sentence.
  let running = { away: 0, home: 0 };
  const keyPlays = [];
  const periodScores = new Map();
  const seen = new Set();
  for (const play of plays) {
    const before = running;
    const after = playScore(play);
    if (after) running = after;
    periodScores.set(play.period, running);

    const scoring = Boolean(play.scoring);
    const turnover = TURNOVER_SLUG.test(String(play.typeSlug ?? ''));
    if ((!scoring && !turnover) || seen.has(play.id)) continue;
    seen.add(play.id);

    const narrative = parsePlayNarrative(play);
    const sentence = narrative.confident && narrative.sentence
      ? narrative.sentence
      : scoring ? scoringFallback(play, before, away, home) : null;
    if (sentence) keyPlays.push({ play, sentence, scoring, before, after: running });
  }

  const periods = [...periodScores.keys()].filter(periodClosed).sort((a, b) => b - a);
  const sections = periods.map((period) => {
    const lines = keyPlays.filter((entry) => entry.play.period === period).map((entry) => entry.sentence);
    const scored = keyPlays.some((entry) => entry.play.period === period && entry.scoring);
    const closing = leadSentence(periodScores.get(period), away, home, afterPeriod(period));
    return {
      id: `period-${period}`,
      heading: periodHeading(period),
      paragraphs: [[...(scored ? [] : ['Neither team scored.']), ...lines, closing].join(' ')],
    };
  });

  if (final) {
    const score = isScore(detail.score?.away) && isScore(detail.score?.home) ? detail.score : running;
    const paragraphs = [];
    if (score.away === score.home) {
      paragraphs.push(`${teamName(away)} and ${teamName(home)} tied ${score.away}-${score.home}.`);
    } else {
      const winnerSide = score.away > score.home ? 'away' : 'home';
      const winner = winnerSide === 'away' ? away : home;
      const loser = winnerSide === 'away' ? home : away;
      paragraphs.push(`${teamName(winner)} beat ${teamName(loser)} ${Math.max(score.away, score.home)}-${Math.min(score.away, score.home)}.`);
      // The lead-for-good score is the last one that moved the winner from
      // tied or trailing into the lead.
      const leads = (value, side) => (side === 'away' ? value.away > value.home : value.home > value.away);
      const decisive = keyPlays.filter((entry) => entry.scoring && entry.before && !leads(entry.before, winnerSide) && leads(entry.after, winnerSide)).at(-1);
      if (decisive) paragraphs.push(`${teamName(winner)} took the lead for good ${whenLabel(decisive.play)}. ${decisive.sentence}`);
    }
    sections.unshift({ id: 'final', heading: 'Final', paragraphs });
  }

  return {
    sections,
    note: sections.length ? null : 'The recap starts once the first quarter ends.',
  };
}
