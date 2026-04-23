const ORDINALS = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
};

const QUALITY_SORT_ORDER = {
  Early: 0,
  Mid: 1,
  Late: 2,
};

function toNumber(value, fallback = null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getRosterPoints(roster) {
  const settings = roster?.settings ?? {};
  return (toNumber(settings.fpts, 0) ?? 0) + ((toNumber(settings.fpts_decimal, 0) ?? 0) / 100);
}

function compareRostersForDraftOrder(a, b) {
  const winsA = toNumber(a?.settings?.wins, 0) ?? 0;
  const winsB = toNumber(b?.settings?.wins, 0) ?? 0;
  if (winsA !== winsB) return winsA - winsB;

  const lossesA = toNumber(a?.settings?.losses, 0) ?? 0;
  const lossesB = toNumber(b?.settings?.losses, 0) ?? 0;
  if (lossesA !== lossesB) return lossesB - lossesA;

  const pointsA = getRosterPoints(a);
  const pointsB = getRosterPoints(b);
  if (pointsA !== pointsB) return pointsA - pointsB;

  return String(a?.roster_id ?? '').localeCompare(String(b?.roster_id ?? ''), undefined, { numeric: true });
}

function padPickSlot(slot) {
  return String(slot).padStart(2, '0');
}

function getProjectedSlotRange(quality, teamCount, round) {
  if (!quality || !teamCount || !round) return null;
  const earlyEnd = Math.max(1, Math.floor(teamCount / 3));
  const midEnd = Math.max(earlyEnd + 1, Math.floor((2 * teamCount) / 3));
  const ranges = {
    Early: [1, earlyEnd],
    Mid: [earlyEnd + 1, midEnd],
    Late: [midEnd + 1, teamCount],
  };
  const slots = ranges[quality];
  if (!slots) return null;
  return `${round}.${padPickSlot(slots[0])} - ${round}.${padPickSlot(slots[1])}`;
}

export function getRoundOrdinal(round) {
  const normalizedRound = toNumber(round, null);
  if (!normalizedRound) return 'Round';
  return ORDINALS[normalizedRound] ?? `${normalizedRound}th`;
}

export function getProjectedPickQuality(rosterId, rosters) {
  if (!rosters?.length) return 'Mid';

  const sorted = [...rosters].sort(compareRostersForDraftOrder);
  const idx = sorted.findIndex((roster) => String(roster.roster_id) === String(rosterId));
  if (idx === -1) return 'Mid';

  const third = Math.ceil(sorted.length / 3);
  if (idx < third) return 'Early';
  if (idx < third * 2) return 'Mid';
  return 'Late';
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

export function getFinalStandingsDraftSlot(rosterId, rosters) {
  if (!rosters?.length) return null;
  const sorted = [...rosters].sort(compareRostersForDraftOrder);
  const idx = sorted.findIndex((roster) => String(roster.roster_id) === String(rosterId));
  return idx === -1 ? null : idx + 1;
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

export function getDraftPickDisplayInfo(pick, {
  league = null,
  rosters = [],
  drafts = [],
  currentSeason = null,
} = {}) {
  const year = toNumber(pick?.year, null);
  const round = toNumber(pick?.round, null);
  const current = toNumber(currentSeason ?? league?.season, new Date().getFullYear());
  const upcomingYear = current == null ? null : current + 1;
  const roundOrdinal = getRoundOrdinal(round);
  const projectedQuality = getProjectedPickQuality(pick?.fromRosterId, rosters);
  const teamCount = rosters?.length || 12;

  if (!year || !round) {
    return {
      displayMode: 'unknown',
      label: 'Draft Pick',
      roundOrdinal,
      quality: projectedQuality,
      valueQuality: projectedQuality,
      sortSlot: null,
    };
  }

  if (upcomingYear != null && year > upcomingYear) {
    return {
      displayMode: 'future',
      label: `${year} ${roundOrdinal}`,
      cardHeadline: `${roundOrdinal} Round`,
      cardMetaLabel: null,
      pickRangeLabel: null,
      roundOrdinal,
      quality: null,
      valueQuality: 'Mid',
      sortSlot: null,
    };
  }

  const draft = getDraftForPickYear(drafts, year);
  const draftComplete = draft?.status === 'complete';
  const seasonComplete = isLeagueSeasonComplete(league);
  const shouldShowLockedSlot = draftComplete || (upcomingYear != null && year === upcomingYear && seasonComplete);
  const lockedSlot = shouldShowLockedSlot
    ? (getDraftSlotForRoster(pick?.fromRosterId, rosters, draft) ?? getFinalStandingsDraftSlot(pick?.fromRosterId, rosters))
    : null;

  if (lockedSlot) {
    const pickNumberLabel = `${round}.${padPickSlot(lockedSlot)}`;
    return {
      displayMode: 'locked',
      label: `${year} ${pickNumberLabel}`,
      cardHeadline: `${roundOrdinal} Round · Pick ${pickNumberLabel}`,
      cardMetaLabel: 'Locked Pick',
      pickRangeLabel: pickNumberLabel,
      pickNumberLabel,
      lockedSlot,
      roundOrdinal,
      quality: null,
      valueQuality: projectedQuality,
      sortSlot: lockedSlot,
    };
  }

  const projectedRange = getProjectedSlotRange(projectedQuality, teamCount, round);
  return {
    displayMode: 'projected',
    label: `${year} Projected ${projectedQuality} ${roundOrdinal}`,
    cardHeadline: `${roundOrdinal} Round · Projected ${projectedQuality}`,
    cardMetaLabel: 'Projected Range',
    pickRangeLabel: projectedRange,
    roundOrdinal,
    quality: projectedQuality,
    valueQuality: projectedQuality,
    sortSlot: QUALITY_SORT_ORDER[projectedQuality] ?? 1,
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
    displayQuality: displayInfo.quality,
    valueQuality: displayInfo.valueQuality,
    lockedSlot: displayInfo.lockedSlot ?? null,
    pickNumberLabel: displayInfo.pickNumberLabel ?? null,
    pickRangeLabel: displayInfo.pickRangeLabel ?? null,
    cardHeadline: displayInfo.cardHeadline ?? null,
    cardMetaLabel: displayInfo.cardMetaLabel ?? null,
    sortSlot: displayInfo.sortSlot ?? null,
  };
}

export function compareDraftPickAssets(a, b) {
  const aPick = a?.pickData ?? a ?? {};
  const bPick = b?.pickData ?? b ?? {};

  const yearDiff = (toNumber(a?.year ?? aPick.year, 9999) ?? 9999) - (toNumber(b?.year ?? bPick.year, 9999) ?? 9999);
  if (yearDiff) return yearDiff;

  const roundDiff = (toNumber(a?.round ?? aPick.round, 99) ?? 99) - (toNumber(b?.round ?? bPick.round, 99) ?? 99);
  if (roundDiff) return roundDiff;

  const slotDiff = (toNumber(a?.lockedSlot ?? a?.sortSlot, 99) ?? 99) - (toNumber(b?.lockedSlot ?? b?.sortSlot, 99) ?? 99);
  if (slotDiff) return slotDiff;

  const qualityDiff = (QUALITY_SORT_ORDER[a?.quality ?? a?.displayQuality] ?? 1) - (QUALITY_SORT_ORDER[b?.quality ?? b?.displayQuality] ?? 1);
  if (qualityDiff) return qualityDiff;

  return String(a?.id ?? aPick.key ?? '').localeCompare(String(b?.id ?? bPick.key ?? ''), undefined, { numeric: true });
}
