import { NFL_SEASON_PHASES } from './espnNflScoreboard.js';

const NFL_SCHEDULE_TIME_ZONE = 'America/New_York';
const NFL_CALENDAR_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NFL_SCHEDULE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getNflCalendarDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    NFL_CALENDAR_DAY_FORMATTER
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return (parts.year * 10_000) + (parts.month * 100) + parts.day;
}

export function resolveStatisticsScoresCurrentWeekId(weeks, {
  now = Date.now(),
  phase = weeks[0]?.phase,
} = {}) {
  const populated = weeks.filter((week) => week.games.length > 0);
  if (!populated.length) return weeks[0]?.id ?? null;

  const dated = populated
    .map((week) => ({
      id: week.id,
      kickoff: Math.min(...week.games.map((game) => Date.parse(game.kickoff)).filter(Number.isFinite)),
    }))
    .filter((week) => Number.isFinite(week.kickoff))
    .sort((left, right) => left.kickoff - right.kickoff);
  if (!dated.length) return populated[0].id;

  const nowValue = phase === NFL_SEASON_PHASES.PRESEASON
    ? getNflCalendarDay(now)
    : new Date(now).getTime();
  if (!Number.isFinite(nowValue)) return dated[0].id;

  const getBoundary = phase === NFL_SEASON_PHASES.PRESEASON
    ? (week) => getNflCalendarDay(week.kickoff)
    : (week) => week.kickoff;
  let currentId = dated[0].id;
  for (const week of dated) {
    const boundary = getBoundary(week);
    if (!Number.isFinite(boundary) || nowValue < boundary) break;
    currentId = week.id;
  }
  return currentId;
}
