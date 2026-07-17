export function getNflRegularSeasonStartTimestamp(season) {
  const year = Number(season);
  if (!Number.isFinite(year)) return 0;
  const septemberFirst = new Date(Date.UTC(year, 8, 1));
  const firstMondayOffset = (8 - septemberFirst.getUTCDay()) % 7;
  const firstMonday = septemberFirst.getUTCDate() + firstMondayOffset;
  return Date.UTC(year, 8, firstMonday + 3);
}
