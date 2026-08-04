// liveDemoTimeline.js — compresses Fantasy Live's mock play-by-play into active
// NFL game time. Real kickoff dates decide which days appear; inactive days
// consume no chart space.

const NFL_DAY_TIME_ZONE = 'America/New_York';

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NFL_DAY_TIME_ZONE,
  weekday: 'short',
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NFL_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getKickoff(game) {
  const kickoff = Date.parse(game?.date ?? '');
  return Number.isFinite(kickoff) ? kickoff : null;
}

function compareGames(left, right) {
  const leftKickoff = getKickoff(left);
  const rightKickoff = getKickoff(right);
  if (leftKickoff != null && rightKickoff != null && leftKickoff !== rightKickoff) {
    return leftKickoff - rightKickoff;
  }
  if (leftKickoff != null) return -1;
  if (rightKickoff != null) return 1;
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''), undefined, { numeric: true });
}

function getGameDay(game, fallbackIndex) {
  const kickoff = getKickoff(game);
  if (kickoff == null) {
    return { key: `game-${fallbackIndex}`, label: fallbackIndex ? `Game ${fallbackIndex + 1}` : 'Game day' };
  }
  const date = new Date(kickoff);
  return {
    key: dayKeyFormatter.format(date),
    label: weekdayFormatter.format(date),
  };
}

/**
 * Gives every relevant game equal navigable space, in actual kickoff order.
 * Back-to-back segments remove dead calendar time while naturally giving busy
 * game days more room than single-game prime-time windows.
 */
export function buildDemoTimeline(games = []) {
  const unique = Array.from(new Map(
    games
      .filter((game) => game?.id != null)
      .map((game) => [String(game.id), game]),
  ).values()).sort(compareGames);
  const gameWindows = new Map();
  const ticks = [];

  if (!unique.length) return { gameWindows, ticks };

  const width = 1 / unique.length;
  let previousDayKey = null;
  unique.forEach((game, index) => {
    const day = getGameDay(game, index);
    const window = {
      start: index * width,
      end: (index + 1) * width,
      dayKey: day.key,
      dayLabel: day.label,
      kickoff: game.date ?? null,
    };
    gameWindows.set(String(game.id), window);
    if (day.key !== previousDayKey) {
      ticks.push({ x: window.start, label: day.label, dayKey: day.key });
      previousDayKey = day.key;
    }
  });

  return { gameWindows, ticks };
}

export function mapGameProgressToDemoTimeline(progress, window) {
  const numeric = Number(progress);
  if (!window || !Number.isFinite(numeric)) return null;
  const gameProgress = Math.min(1, Math.max(0, numeric));
  return window.start + ((window.end - window.start) * gameProgress);
}

function formatGameClock(progress) {
  const seconds = Math.min(3599, Math.max(0, Math.round((Number(progress) || 0) * 3600)));
  const quarter = Math.min(4, Math.floor(seconds / 900) + 1);
  const left = 900 - (seconds % 900);
  return `Q${quarter} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
}

export function formatDemoTimelinePoint(progress, timeline) {
  const numeric = Math.min(1, Math.max(0, Number(progress) || 0));
  const windows = Array.from(timeline?.gameWindows?.values?.() ?? []);
  if (!windows.length) return formatGameClock(numeric);
  const window = windows.find((candidate) => numeric >= candidate.start && numeric <= candidate.end)
    ?? windows.reduce((closest, candidate) => (
      Math.abs(candidate.start - numeric) < Math.abs(closest.start - numeric) ? candidate : closest
    ), windows[0]);
  const gameProgress = (numeric - window.start) / Math.max(0.0001, window.end - window.start);
  return `${window.dayLabel} · ${formatGameClock(gameProgress)}`;
}
