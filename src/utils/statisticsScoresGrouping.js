export const NFL_SCOREBOARD_TIME_ZONE = 'America/New_York';

const ACTIVE_GAME_STATUSES = new Set(['live', 'halftime', 'delayed']);
const WEEKDAY_LABELS = Object.freeze({
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
});
const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NFL_SCOREBOARD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NFL_SCOREBOARD_TIME_ZONE,
  weekday: 'long',
});
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NFL_SCOREBOARD_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function dateKey(date) {
  const parts = Object.fromEntries(
    DAY_KEY_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function fallbackGameDay(game) {
  const existingDateLabel = String(game?.dateLabel ?? '').trim();
  const weekday = existingDateLabel.match(/^([a-z]{3})/i)?.[1]?.toLowerCase();
  return {
    key: existingDateLabel
      ? `label:${existingDateLabel.toLowerCase()}`
      : `slot:${game?.slot ?? 'game-day'}`,
    label: WEEKDAY_LABELS[weekday]
      ?? game?.slotLabel
      ?? 'Game Day',
    dateLabel: existingDateLabel || null,
  };
}

function kickoffTime(game) {
  const value = Date.parse(game?.kickoff);
  return Number.isFinite(value) ? value : null;
}

function sortGamesByKickoff(games) {
  return games
    .map((game, index) => ({ game, index, kickoff: kickoffTime(game) }))
    .sort((left, right) => {
      if (left.kickoff == null && right.kickoff == null) return left.index - right.index;
      if (left.kickoff == null) return 1;
      if (right.kickoff == null) return -1;
      return left.kickoff - right.kickoff || left.index - right.index;
    })
    .map(({ game }) => game);
}

export function getStatisticsScoresGameDay(game) {
  if (!game?.kickoff) return fallbackGameDay(game);
  const kickoff = new Date(game?.kickoff);
  if (Number.isNaN(kickoff.getTime())) return fallbackGameDay(game);

  return {
    key: dateKey(kickoff),
    label: DAY_LABEL_FORMATTER.format(kickoff),
    dateLabel: DATE_LABEL_FORMATTER.format(kickoff),
  };
}

export function groupStatisticsScoresGames(games = []) {
  const activeGames = [];
  const dayGroups = new Map();

  games.forEach((game) => {
    if (ACTIVE_GAME_STATUSES.has(game?.status)) {
      activeGames.push(game);
      return;
    }

    const day = getStatisticsScoresGameDay(game);
    const existing = dayGroups.get(day.key);
    if (existing) existing.games.push(game);
    else dayGroups.set(day.key, { ...day, games: [game] });
  });

  const sortedDayGroups = [...dayGroups.values()]
    .map((group, index) => ({
      ...group,
      games: sortGamesByKickoff(group.games),
      index,
      kickoff: Math.min(...group.games.map(kickoffTime).filter((value) => value != null)),
    }))
    .sort((left, right) => {
      const leftDated = Number.isFinite(left.kickoff);
      const rightDated = Number.isFinite(right.kickoff);
      if (!leftDated || !rightDated) return left.index - right.index;
      return left.kickoff - right.kickoff || left.index - right.index;
    })
    .map((group) => ({
      key: group.key,
      label: group.label,
      dateLabel: group.dateLabel,
      games: group.games,
    }));

  return [
    ...(activeGames.length ? [{
      key: 'live',
      label: 'Live',
      dateLabel: null,
      games: sortGamesByKickoff(activeGames),
    }] : []),
    ...sortedDayGroups,
  ];
}
