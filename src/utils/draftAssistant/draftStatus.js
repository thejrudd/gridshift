export function getSleeperDraftStatus(draft) {
  return String(draft?.status ?? '').trim().toLowerCase();
}

export function isSleeperDraftPreDraft(draft) {
  return getSleeperDraftStatus(draft) === 'pre_draft';
}

export function getSleeperDraftStartMs(draft) {
  const rawStart = draft?.start_time
    ?? draft?.settings?.start_time
    ?? draft?.metadata?.start_time
    ?? draft?.metadata?.draft_start_time
    ?? null;
  if (rawStart == null || rawStart === '') return null;

  if (typeof rawStart === 'string' && /[a-z:-]/i.test(rawStart.trim())) {
    const parsedDate = Date.parse(rawStart);
    return Number.isFinite(parsedDate) ? parsedDate : null;
  }

  const parsed = Number(rawStart);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function addCalendarMonths(date, months) {
  const next = new Date(date.getTime());
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, daysInTargetMonth));
  return next;
}

export function getScheduledDraftCountdownParts(targetMs, nowMs = Date.now()) {
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs) || targetMs <= nowMs) return null;

  const target = new Date(targetMs);
  const start = new Date(nowMs);
  let months = (target.getFullYear() - start.getFullYear()) * 12
    + target.getMonth()
    - start.getMonth();
  if (addCalendarMonths(start, months).getTime() > targetMs) months -= 1;

  let cursor = addCalendarMonths(start, Math.max(0, months));
  let remainingSeconds = Math.max(0, Math.floor((targetMs - cursor.getTime()) / 1000));
  const weeks = Math.floor(remainingSeconds / 604_800);
  remainingSeconds -= weeks * 604_800;
  const days = Math.floor(remainingSeconds / 86_400);
  remainingSeconds -= days * 86_400;
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds -= hours * 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;

  return {
    months: Math.max(0, months),
    weeks,
    days,
    hours,
    minutes,
    seconds,
  };
}

export function isSleeperDraftPollable(draft) {
  const status = getSleeperDraftStatus(draft);
  return status === 'drafting' || status === 'pre_draft' || status === 'in_progress' || status === 'paused';
}

export function isSleeperDraftLive(draft) {
  const status = getSleeperDraftStatus(draft);
  return status === 'drafting' || status === 'in_progress';
}

export function isSleeperDraftActiveRoom(draft) {
  return isSleeperDraftLive(draft) || getSleeperDraftStatus(draft) === 'paused';
}

export function isSleeperDraftMock(draft, leagueId = null) {
  if (!draft) return false;
  const draftLeagueId = draft?.league_id == null ? '' : String(draft.league_id);
  if (!draftLeagueId) return true;
  return leagueId != null && draftLeagueId !== String(leagueId);
}

export function isSleeperUserDraftParticipant(draft, userId) {
  if (!draft || userId == null) return false;
  const normalizedUserId = String(userId);
  const draftOrder = draft?.draft_order;
  if (draftOrder && typeof draftOrder === 'object' && normalizedUserId in draftOrder) return true;

  const creators = Array.isArray(draft?.creators) ? draft.creators : [];
  return creators.some((creatorId) => String(creatorId) === normalizedUserId);
}

export function shouldShowSleeperDraftGlobalNotice({ draft, userId, leagueId } = {}) {
  if (!isSleeperDraftActiveRoom(draft)) return false;
  if (!isSleeperDraftMock(draft, leagueId)) return true;
  return isSleeperUserDraftParticipant(draft, userId);
}

function getSleeperDraftModelStatus(draft) {
  return isSleeperDraftActiveRoom(draft) ? 'active_room' : getSleeperDraftStatus(draft);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function getSleeperDraftSemanticSignature(draft) {
  if (!draft) return '';
  const metadata = { ...(draft.metadata ?? {}) };
  delete metadata.elapsed_pick_timer;
    return stableStringify({
    draft_id: draft.draft_id ?? null,
    last_picked: draft.last_picked ?? null,
    metadata,
    settings: draft.settings ?? null,
    slot_to_roster_id: draft.slot_to_roster_id ?? null,
    start_time: draft.start_time ?? null,
    status: getSleeperDraftModelStatus(draft),
    type: draft.type ?? null,
  });
}

export function getSleeperDraftPicksSignature(picks = []) {
  return stableStringify((Array.isArray(picks) ? picks : []).map((pick) => ({
    draft_slot: pick?.draft_slot ?? null,
    metadata: {
      first_name: pick?.metadata?.first_name ?? null,
      last_name: pick?.metadata?.last_name ?? null,
      position: pick?.metadata?.position ?? null,
      team: pick?.metadata?.team ?? null,
    },
    pick_no: pick?.pick_no ?? null,
    picked_by: pick?.picked_by ?? null,
    player_id: pick?.player_id ?? null,
    roster_id: pick?.roster_id ?? null,
    round: pick?.round ?? null,
  })));
}

export function getSleeperDraftTradedPicksSignature(tradedPicks = []) {
  return stableStringify((Array.isArray(tradedPicks) ? tradedPicks : []).map((pick) => ({
    draft_id: pick?.draft_id ?? null,
    draft_slot: pick?.draft_slot ?? null,
    owner_id: pick?.owner_id ?? null,
    previous_owner_id: pick?.previous_owner_id ?? null,
    roster_id: pick?.roster_id ?? null,
    round: pick?.round ?? null,
    season: pick?.season ?? null,
  })));
}

export function shouldRefreshSleeperDraftPicks({
  initialLoad = false,
  nextDraft = null,
  previousDraft = null,
  now = Date.now(),
  lastPicksPollAt = 0,
  liveRefreshMs = 5_000,
  idleRefreshMs = 15_000,
} = {}) {
  if (initialLoad || !previousDraft) return true;
  if (!nextDraft) return false;

  const nextStatus = getSleeperDraftStatus(nextDraft);
  const previousStatus = getSleeperDraftStatus(previousDraft);
  if (String(nextDraft?.draft_id ?? '') !== String(previousDraft?.draft_id ?? '')) return true;
  if (Number(nextDraft?.last_picked ?? 0) !== Number(previousDraft?.last_picked ?? 0)) return true;
  if (Number(nextDraft?.settings?.pick_timer ?? 0) !== Number(previousDraft?.settings?.pick_timer ?? 0)) return true;
  if (nextStatus !== previousStatus) {
    return !(isSleeperDraftActiveRoom(nextDraft) && isSleeperDraftActiveRoom(previousDraft));
  }

  const refreshMs = isSleeperDraftActiveRoom(nextDraft) ? liveRefreshMs : idleRefreshMs;
  return now - lastPicksPollAt >= refreshMs;
}

export function shouldRefreshSleeperDraftTradedPicks({
  initialLoad = false,
  nextDraft = null,
  previousDraft = null,
  now = Date.now(),
  lastTradedPicksPollAt = 0,
  refreshMs = 30_000,
} = {}) {
  if (initialLoad || !previousDraft) return true;
  if (!nextDraft) return false;
  if (String(nextDraft?.draft_id ?? '') !== String(previousDraft?.draft_id ?? '')) return true;
  return now - lastTradedPicksPollAt >= refreshMs;
}

export function resolveLeagueDraftId(league, drafts) {
  const leagueDraftId = league?.draft_id ? String(league.draft_id) : null;
  if (!drafts?.length) return leagueDraftId;

  const ranked = [...drafts].sort((a, b) => {
    const statusRank = (draft) => {
      const status = getSleeperDraftStatus(draft);
      if (status === 'drafting' || status === 'in_progress') return 0;
      if (status === 'paused') return 1;
      if (status === 'pre_draft') return 2;
      if (String(draft?.draft_id) === leagueDraftId) return 3;
      return 4;
    };
    return statusRank(a) - statusRank(b);
  });

  return String(ranked[0]?.draft_id ?? leagueDraftId ?? '');
}
