// Shared parsing for the NFL gamebook's named field positions.
//
// Most spots are ordinary yard lines such as "SEA 16". The gamebook also
// reports catches and turnovers inside an end zone with a signed yard line —
// "SEA -3" means three yards behind Seattle's goal line. Keeping that grammar
// here prevents narrative parsing and field geometry from disagreeing about
// whether the same provider spot is valid.

/** A captured field spot, including the provider's signed end-zone notation. */
export const FIELD_SPOT_PATTERN = '([A-Z]{2,3}\\s+-?\\d{1,2})';

const TEAM_ALIASES = new Map([
  ['ARZ', 'ARI'], ['BLT', 'BAL'], ['CLV', 'CLE'], ['HST', 'HOU'], ['WSH', 'WAS'],
  ['JAC', 'JAX'], ['LA', 'LAR'], ['LVR', 'LV'], ['SD', 'LAC'], ['SL', 'LAR'],
]);

/** A team abbreviation in the one spelling everything compares against. */
export function canonicalTeam(team) {
  const value = String(team ?? '').trim().toUpperCase();
  return TEAM_ALIASES.get(value) ?? value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Absolute field position from a gamebook spot.
 *
 * The playable field is 0..100. Signed values extend up to ten yards into the
 * named team's own end zone, matching the 120-yard canvas used by every field
 * visual: an away-team `-3` is -3, while a home-team `-3` is 103.
 */
export function possessionTextToPercent(text, { homeTeam } = {}) {
  const match = /^([A-Z]{2,3})\s+(-?\d{1,2})$/.exec(String(text ?? '').trim());
  if (!match || !homeTeam) return null;
  const [, team, yardLine] = match;
  const yards = clamp(Number(yardLine), -10, 50);
  return canonicalTeam(team) === canonicalTeam(homeTeam) ? 100 - yards : yards;
}
