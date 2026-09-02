const ORDINALS = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
};

function toNumber(value, fallback = null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function getRoundOrdinal(round) {
  const normalizedRound = toNumber(round, null);
  if (!normalizedRound) return 'Round';
  return ORDINALS[normalizedRound] ?? `${normalizedRound}th`;
}

export function getDraftPickLabel(pick) {
  const year = toNumber(pick?.year, null);
  const round = toNumber(pick?.round, null);
  if (!year || !round) return 'Draft Pick';
  return `${year} ${getRoundOrdinal(round)}`;
}

export function isLeagueSeasonComplete(league) {
  const status = league?.status;
  if (status === 'complete') return true;
  if (status === 'pre_draft' || status === 'drafting' || status === 'in_season') return false;

  const lastScoredLeg = toNumber(league?.settings?.last_scored_leg, null);
  const playoffWeekStart = toNumber(league?.settings?.playoff_week_start, null);
  return Boolean(lastScoredLeg && playoffWeekStart && lastScoredLeg >= playoffWeekStart - 1);
}

export function getDraftForPickYear(drafts, year) {
  const normalizedYear = String(year ?? '');
  return (drafts ?? []).find((draft) => String(draft?.season ?? '') === normalizedYear) ?? null;
}

export function getDraftSlotForRoster(rosterId, rosters, draft) {
  if (!draft || rosterId == null) return null;
  const normalizedRosterId = String(rosterId);

  const slotToRosterId = draft.slot_to_roster_id ?? null;
  if (slotToRosterId && typeof slotToRosterId === 'object') {
    for (const [slot, mappedRosterId] of Object.entries(slotToRosterId)) {
      if (String(mappedRosterId) === normalizedRosterId) return toNumber(slot, null);
    }
  }

  const draftOrder = draft.draft_order ?? null;
  if (draftOrder && typeof draftOrder === 'object') {
    const roster = (rosters ?? []).find((nextRoster) => String(nextRoster.roster_id) === normalizedRosterId);
    const ownerId = roster?.owner_id ?? null;
    const slot = ownerId == null ? null : draftOrder[ownerId];
    return toNumber(slot, null);
  }

  return null;
}

export function getDraftPickDisplayInfo(pick) {
  const year = toNumber(pick?.year, null);
  const round = toNumber(pick?.round, null);
  const roundOrdinal = getRoundOrdinal(round);
  return {
    displayMode: year && round ? 'round' : 'unknown',
    label: getDraftPickLabel(pick),
    roundOrdinal,
  };
}

export function applyDraftPickDisplayInfo(pickAsset, options = {}) {
  if (!pickAsset) return pickAsset;
  const sourcePick = pickAsset.pickData ?? pickAsset;
  const displayInfo = getDraftPickDisplayInfo(sourcePick, options);
  return {
    ...pickAsset,
    label: displayInfo.label,
    displayMode: displayInfo.displayMode,
  };
}

export function compareDraftPickAssets(a, b) {
  const aPick = a?.pickData ?? a ?? {};
  const bPick = b?.pickData ?? b ?? {};

  const yearDiff = (toNumber(a?.year ?? aPick.year, 9999) ?? 9999) - (toNumber(b?.year ?? bPick.year, 9999) ?? 9999);
  if (yearDiff) return yearDiff;

  const roundDiff = (toNumber(a?.round ?? aPick.round, 99) ?? 99) - (toNumber(b?.round ?? bPick.round, 99) ?? 99);
  if (roundDiff) return roundDiff;

  return String(a?.id ?? aPick.key ?? '').localeCompare(String(b?.id ?? bPick.key ?? ''), undefined, { numeric: true });
}
