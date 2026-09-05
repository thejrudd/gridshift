// Sleeper includes preassigned keepers in later rounds in the picks response.
// Progress follows unfilled slots, not the number (or highest number) of picks.
export function buildUpcomingDraftWindow(pickOrder = [], myRosterId = null, picks = []) {
  const occupied = new Set(picks
    .filter((pick) => pick?.playerId)
    .map((pick) => pick.overall));
  const upcomingPicks = pickOrder.filter((pick) => !occupied.has(pick.overall));
  const currentPick = upcomingPicks[0] ?? null;
  const currentOverall = currentPick?.overall ?? (pickOrder.length + 1);
  const nextMyPick = myRosterId == null ? null
    : upcomingPicks.find((pick) => String(pick.rosterId) === String(myRosterId)) ?? null;
  const picksBeforeUser = nextMyPick
    ? upcomingPicks.filter((pick) => pick.overall < nextMyPick.overall)
    : [];
  return { currentOverall, currentPick, nextMyPick, upcomingPicks, picksBeforeUser };
}
