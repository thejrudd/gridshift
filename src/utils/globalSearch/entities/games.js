// ── Game and week records ──────────────────────────────────────────────────
// Source: public/season-schedule.json (272 games across 18 weeks). Fully static,
// so these records work offline from the precached index with no live data.

import { KIND_GAME, makeRecord, nameTokens } from './record.js';

function teamNameFor(teams, abbr) {
  const id = String(abbr ?? '').toUpperCase();
  const team = teams.find((entry) => String(entry.id ?? '').toUpperCase() === id);
  return team?.name ?? id;
}

/**
 * One record per game, findable by either team and by week.
 *
 * Games carry a low base weight: a query naming only a team should surface the
 * team itself first, with its games below. A query that also names a week scores
 * the matching game up through slot agreement in rank.js.
 */
export function buildGameRecords(seasonSchedule = {}, scheduleData = {}) {
  const teams = Array.isArray(scheduleData.teams) ? scheduleData.teams : [];
  const weeks = seasonSchedule.weeks ?? {};
  const season = seasonSchedule.season ?? scheduleData.season ?? null;
  const records = [];

  for (const [weekKey, games] of Object.entries(weeks)) {
    const week = Number(weekKey);
    if (!Number.isFinite(week) || !Array.isArray(games)) continue;

    for (const game of games) {
      const away = String(game.awayTeam ?? '').toUpperCase();
      const home = String(game.homeTeam ?? '').toUpperCase();
      if (!away || !home) continue;

      const awayName = teamNameFor(teams, away);
      const homeName = teamNameFor(teams, home);

      records.push(makeRecord({
        kind: KIND_GAME,
        id: String(game.id ?? `${season}-W${week}-${away}-${home}`),
        label: `${awayName} at ${homeName}`,
        sublabel: `Week ${week}`,
        tokens: [
          away.toLowerCase(),
          home.toLowerCase(),
          `week${week}`,
          ...nameTokens(awayName),
          ...nameTokens(homeName),
        ],
        route: {
          activeTab: 'statistics',
          statisticsView: 'schedule',
          statisticsScheduleMode: 'week',
          statisticsScheduleWeek: week,
        },
        weight: 0.2,
        meta: {
          week,
          season,
          awayTeam: away,
          homeTeam: home,
          espnEventId: game.espnEventId ?? null,
          kickoff: game.kickoff ?? null,
          network: game.network ?? null,
        },
      }));
    }
  }

  return records;
}

/**
 * One record per week, so a bare "week 3" has somewhere to land.
 */
export function buildWeekRecords(seasonSchedule = {}) {
  const weeks = Object.keys(seasonSchedule.weeks ?? {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  return weeks.map((week) => makeRecord({
    kind: KIND_GAME,
    id: `week-${week}`,
    label: `Week ${week}`,
    sublabel: 'NFL schedule',
    tokens: [`week${week}`, `wk${week}`, String(week)],
    route: {
      activeTab: 'statistics',
      statisticsView: 'schedule',
      statisticsScheduleMode: 'week',
      statisticsScheduleWeek: week,
    },
    weight: 0.3,
    meta: { week, isWeekIndex: true },
  }));
}
