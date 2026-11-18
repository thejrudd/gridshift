export function getNflRegularSeasonStartTimestamp(season) {
  const year = Number(season);
  if (!Number.isFinite(year)) return 0;
  const septemberFirst = new Date(Date.UTC(year, 8, 1));
  const firstMondayOffset = (8 - septemberFirst.getUTCDay()) % 7;
  const firstMonday = septemberFirst.getUTCDate() + firstMondayOffset;
  return Date.UTC(year, 8, firstMonday + 3);
}

// An NFL season that starts in September of year S ends with the Super Bowl in
// February of S + 1, so from March of S + 1 on nothing in it can change.
export function isNflSeasonCompleted(season, nowMs = Date.now()) {
  const year = Number(season);
  if (!Number.isFinite(year)) return false;
  return nowMs >= Date.UTC(year + 1, 2, 1);
}
