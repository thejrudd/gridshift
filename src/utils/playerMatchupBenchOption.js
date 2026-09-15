import { getSlotEligiblePositions, normalizeOpportunityPos } from './opportunity/opportunityPositions.js';
import { getPlayerAvailabilityStatus } from './playerAvailabilityStatus.js';
import { getPlayerMatchupPhase, matchupNumber } from './playerMatchupPresentation.js';

function hasUpcomingGame(player, now) {
  const schedule = player?.scheduleEntry;
  const kickoff = Date.parse(schedule?.kickoff ?? '');
  const status = [schedule?.status, schedule?.statusType, schedule?.state, schedule?.gameStatus].join(' ');
  return Boolean(player?.id && !player.isBye && player.gameStarted !== true
    && Number.isFinite(kickoff) && kickoff > now
    && !/postponed|cancelled|canceled|delayed/i.test(status)
    && getPlayerMatchupPhase({ scheduleEntry: schedule, now }) === 'pregame');
}

/** Informational comparison only. No lineup mutation or multi-slot reassignment. */
export function buildPlayerMatchupBenchOption({ context, now = Date.now() } = {}) {
  if (!context?.isUser || !Number.isFinite(now) || !hasUpcomingGame(context.starter, now)) return null;
  const starterScore = matchupNumber(context.starter?.projection?.projected);
  const eligible = getSlotEligiblePositions(context.slot);
  if (starterScore == null || !eligible.length) return null;
  const excludedIds = new Set((context.excludedIds ?? []).map(String));

  const options = (context.bench ?? []).flatMap(player => {
    if (!player?.id || String(player.id) === String(context.starter.id)
      || excludedIds.has(String(player.id)) || !hasUpcomingGame(player, now)) return [];
    const raw = context.players?.[player.id] ?? player;
    const availability = getPlayerAvailabilityStatus(raw) ?? player.availabilityStatus ?? null;
    if (availability && !['Questionable', 'Probable'].includes(availability)) return [];
    const positions = raw.fantasy_positions?.length ? raw.fantasy_positions : [player.position];
    if (!positions.some(position => eligible.includes(normalizeOpportunityPos(position)))) return [];
    const projected = matchupNumber(player.projection?.projected);
    if (projected == null || projected - starterScore < 2) return [];
    return [{ player, projected, improvement: projected - starterScore, slot: context.slot }];
  });
  options.sort((left, right) => right.projected - left.projected
    || String(left.player.id).localeCompare(String(right.player.id)));
  return options[0] ?? null;
}
