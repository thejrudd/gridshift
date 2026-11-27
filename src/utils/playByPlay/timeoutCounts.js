import { canonicalTeam } from '../nflPlays/fieldSpots.js';

// Team timeouts remaining, counted from the provider's own timeout rows
// ("Timeout #2 by GB at 01:54."). Counting from the play feed keeps the
// scoreboard's timeout bars in step with the TIMEOUT badge and the play list,
// which come from the same rows; a scoreboard feed that runs ahead of the
// plays would take a bar away before the timeout appears anywhere else.

const TEAM_TIMEOUT = /\btime ?out #(\d+) by ([A-Z]{2,3})\b/i;

function rowPeriod(row) {
  const value = Number(row?.period ?? row?.quarter);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// Timeouts reset at the half and again in overtime.
function halfOf(period) {
  if (period <= 2) return 'first';
  if (period <= 4) return 'second';
  return `ot-${period}`;
}

/**
 * `{ period, away, home }` for the half the newest row belongs to, or null
 * when the rows carry no period. A team's count is its highest "Timeout #N"
 * in that half, so a row the provider never posted still counts once a later
 * timeout's number covers it. Overtime gives each team two in the regular
 * season and three in the postseason.
 */
export function countTimeoutsRemaining(rows = [], { awayTeam, homeTeam, postseason = false } = {}) {
  const away = canonicalTeam(awayTeam);
  const home = canonicalTeam(homeTeam);
  if (!away || !home) return null;
  const period = rows.reduce((latest, row) => Math.max(latest, rowPeriod(row) ?? 0), 0);
  if (!period) return null;
  const half = halfOf(period);
  const used = new Map();
  rows.forEach((row) => {
    const slug = String(row?.type_slug ?? row?.typeSlug ?? '').toLowerCase();
    if (slug !== 'timeout') return;
    const rowHalf = rowPeriod(row);
    if (rowHalf == null || halfOf(rowHalf) !== half) return;
    const match = TEAM_TIMEOUT.exec(String(row?.text ?? row?.description ?? row?.rawText ?? ''));
    if (!match) return;
    const team = canonicalTeam(match[2]);
    used.set(team, Math.max(used.get(team) ?? 0, Number(match[1])));
  });
  const slots = period > 4 && !postseason ? 2 : 3;
  const remaining = (team) => Math.max(0, slots - (used.get(team) ?? 0));
  return { period, away: remaining(away), home: remaining(home) };
}
