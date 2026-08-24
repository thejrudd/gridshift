const WIDTH = 100;
const HEIGHT = 34;
const REGULATION_PERIOD_SECONDS = 15 * 60;
const REGULATION_PERIODS = 4;

function parseClockSeconds(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) return null;
  return (minutes * 60) + seconds;
}
function getPlayElapsedSeconds(play) {
  const period = Number(play?.period);
  const clockSeconds = parseClockSeconds(play?.time ?? play?.clockDisplay ?? play?.clock_display);
  if (!Number.isInteger(period) || period < 1 || clockSeconds == null) return null;
  return ((period - 1) * REGULATION_PERIOD_SECONDS)
    + (REGULATION_PERIOD_SECONDS - Math.min(REGULATION_PERIOD_SECONDS, clockSeconds));
}

function getTerminalPlayValues(play) {
  return [
    play?.typeSlug,
    play?.type,
    play?.rawText,
    play?.shortText,
    play?.description,
    play?.text,
  ]
    .map((value) => String(value ?? '').trim().replace(/[_.-]+/g, ' '))
    .filter(Boolean);
}

function isCompleteWinProbabilityTimeline(plays = [], gameStatus = null) {
  if (String(gameStatus ?? '').toLowerCase() === 'final') return true;
  return plays.some((play) => getTerminalPlayValues(play)
    .some((value) => /^end(?:\s+of)?\s+game$/i.test(value)));
}

export function buildWinProbabilityTimeline(plays = [], { gameStatus = null } = {}) {
  const complete = isCompleteWinProbabilityTimeline(plays, gameStatus);
  const probabilityPlays = plays.filter((play) => play.homeWinProbability != null);
  const maxPeriod = Math.max(
    REGULATION_PERIODS,
    ...plays.map((play) => Number(play?.period)).filter((period) => Number.isInteger(period) && period > 0),
  );
  const durationSeconds = maxPeriod * REGULATION_PERIOD_SECONDS;
  const observedProgress = probabilityPlays
    .map(getPlayElapsedSeconds)
    .filter(Number.isFinite)
    .reduce((latest, elapsed) => Math.max(latest, elapsed / durationSeconds), 0);
  const fallbackEnd = complete ? 1 : observedProgress;

  const points = probabilityPlays.map((play, index, all) => {
    const elapsed = getPlayElapsedSeconds(play);
    const fallbackProgress = all.length <= 1
      ? fallbackEnd
      : (index / (all.length - 1)) * fallbackEnd;
    const progress = Number.isFinite(elapsed)
      ? Math.min(1, Math.max(0, elapsed / durationSeconds))
      : fallbackProgress;
    return {
      x: progress * WIDTH,
      y: HEIGHT - Math.min(1, Math.max(0, play.homeWinProbability)) * HEIGHT,
      probability: play.homeWinProbability,
      period: play.period,
      play,
    };
  });

  if (complete && points.length) {
    points[points.length - 1] = { ...points[points.length - 1], x: WIDTH };
  }

  return { complete, points };
}
