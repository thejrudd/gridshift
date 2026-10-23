// The week's x-axis for the Matchups live layer (replay bar and chart).
//
// Games that kick off together share one window, because a fantasy manager
// lives the week window by window: Thursday night, Sunday early, Sunday late,
// and so on. Each window's width follows how many games it holds, with a floor,
// so a single Thursday or Monday game stays usable without taking as much room
// as a full Sunday slate. Windows come from the week's real kickoff times, so a
// Thanksgiving, Christmas or Saturday slate needs no special case.
//
// A position on the axis is a number from 0 to 1. A play inside a game sits at
// its window's start plus the game's own progress through that window.

export const KICKOFF_CLUSTER_MS = 45 * 60 * 1000;
export const MIN_WINDOW_WEIGHT = 1.5;
const LABEL_TIME_ZONE = 'America/New_York';

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function getGameKickoffMs(game) {
  const parsed = Date.parse(game?.date ?? game?.kickoff ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

// Intl formatters are slow to construct; build one pair per time zone.
const FORMATTERS = new Map();
function getFormatters(timeZone) {
  if (!FORMATTERS.has(timeZone)) {
    FORMATTERS.set(timeZone, {
      parts: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
      day: new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    });
  }
  return FORMATTERS.get(timeZone);
}

function formatParts(ms, timeZone) {
  const formatters = getFormatters(timeZone);
  const parts = formatters.parts.formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const minute = get('minute');
  const period = get('dayPeriod').toLowerCase().startsWith('p') ? 'p' : 'a';
  return {
    day: get('weekday'),
    time: `${get('hour')}${minute === '00' ? '' : `:${minute}`}${period}`,
    dayKey: formatters.day.format(new Date(ms)),
  };
}

/**
 * Builds the kickoff-window axis for a week's games.
 *
 * Returns `{ windows, windowByGameId, gamePosition, windowAt, isEmpty }`:
 * - `windows`: `[{ index, startMs, gameIds, weight, p0, p1, label, longLabel }]`
 *   in kickoff order. `label` is the short tick text ("Thu", "Sun 1p");
 *   `longLabel` always carries the time ("Sun 1p").
 * - `gamePosition(gameId, gameProgress)`: a play's place on the 0..1 axis, or
 *   null when the game is unknown or has no kickoff.
 * - `windowAt(position)`: the window a position falls in.
 */
export function buildSlateAxis(games = [], {
  clusterMs = KICKOFF_CLUSTER_MS,
  minWeight = MIN_WINDOW_WEIGHT,
  timeZone = LABEL_TIME_ZONE,
} = {}) {
  const timed = (games ?? [])
    .map((game) => ({ id: String(game?.id ?? ''), kickoff: getGameKickoffMs(game) }))
    .filter((game) => game.id && game.kickoff != null)
    .sort((left, right) => left.kickoff - right.kickoff);

  const groups = [];
  timed.forEach((game) => {
    const last = groups[groups.length - 1];
    if (last && game.kickoff - last.startMs <= clusterMs) last.gameIds.push(game.id);
    else groups.push({ startMs: game.kickoff, gameIds: [game.id] });
  });

  const totalWeight = groups.reduce((sum, group) => sum + Math.max(minWeight, group.gameIds.length), 0);
  const windowsPerDay = new Map();
  groups.forEach((group) => {
    const { dayKey } = formatParts(group.startMs, timeZone);
    windowsPerDay.set(dayKey, (windowsPerDay.get(dayKey) ?? 0) + 1);
  });

  let cursor = 0;
  const windows = groups.map((group, index) => {
    const weight = Math.max(minWeight, group.gameIds.length);
    const { day, time, dayKey } = formatParts(group.startMs, timeZone);
    const p0 = totalWeight ? cursor / totalWeight : 0;
    cursor += weight;
    const p1 = totalWeight ? cursor / totalWeight : 0;
    const shared = (windowsPerDay.get(dayKey) ?? 1) > 1;
    return {
      index,
      startMs: group.startMs,
      gameIds: group.gameIds,
      weight,
      p0,
      p1,
      label: shared ? `${day} ${time.replace(':00', '')}` : day,
      longLabel: `${day} ${time}`,
    };
  });

  const windowByGameId = new Map();
  windows.forEach((window) => window.gameIds.forEach((id) => windowByGameId.set(id, window)));

  const gamePosition = (gameId, gameProgress) => {
    const window = windowByGameId.get(String(gameId ?? ''));
    if (!window || gameProgress == null || !Number.isFinite(Number(gameProgress))) return null;
    return window.p0 + clamp01(gameProgress) * (window.p1 - window.p0);
  };

  const windowAt = (position) => {
    if (!windows.length) return null;
    const value = clamp01(position);
    return windows.find((window) => value < window.p1) ?? windows[windows.length - 1];
  };

  return { windows, windowByGameId, gamePosition, windowAt, isEmpty: windows.length === 0 };
}
