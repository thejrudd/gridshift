export const TRADE_PROPOSAL_SCHEMA_VERSION = 1;

export const TRADE_EXPIRY_OPTIONS = Object.freeze([
  { id: 'hour', label: '1 hour' },
  { id: 'end_of_day', label: 'End of day' },
  { id: 'day', label: '24 hours' },
  { id: 'two_days', label: '2 days' },
  { id: 'week', label: '1 week' },
]);

export const DEFAULT_TRADE_EXPIRY = 'two_days';

function cleanId(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function cleanText(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function getTradeAssetFingerprint(asset) {
  if (!asset) return null;
  if (asset.type === 'player') return `player:${cleanId(asset.id)}`;
  if (asset.type === 'pick') return `pick:${cleanText(asset.year)}:${Number(asset.round)}:${cleanId(asset.originalRosterId ?? asset.fromRosterId)}`;
  if (asset.type === 'faab') return `faab:${Number(asset.amount)}`;
  return null;
}

export function normalizeTradeProposalAsset(asset, fromRosterId, toRosterId) {
  if (!asset) return null;
  const type = cleanText(asset.type);
  if (!['player', 'pick', 'faab'].includes(type)) return null;
  const normalized = {
    type,
    id: cleanId(asset.id),
    label: cleanText(asset.label ?? asset.name, type === 'player' ? `Player ${asset.id ?? ''}` : 'Trade asset'),
    value: normalizeValue(asset.value ?? asset.val),
    fromRosterId: cleanId(asset.fromRosterId ?? fromRosterId),
    toRosterId: cleanId(asset.toRosterId ?? toRosterId),
  };
  if (type === 'player') {
    normalized.position = cleanText(asset.position) || null;
    normalized.team = cleanText(asset.team) || null;
  } else if (type === 'pick') {
    normalized.year = cleanText(asset.year);
    normalized.round = Number(asset.round);
    normalized.originalRosterId = cleanId(asset.originalRosterId ?? asset.pickData?.fromRosterId ?? asset.fromRosterId ?? fromRosterId);
  } else {
    normalized.amount = Number(asset.amount);
  }
  return normalized;
}

function normalizeParticipant(participant, fallbackRosterId) {
  return {
    userId: cleanId(participant?.userId ?? participant?.id),
    rosterId: cleanId(participant?.rosterId ?? fallbackRosterId),
    name: cleanText(participant?.name, 'Manager'),
    teamName: cleanText(participant?.teamName, 'Team'),
    avatarHash: participant?.avatarHash ?? null,
    assets: [],
  };
}

export function buildTradeProposalSnapshot({
  leagueId,
  season,
  sender,
  recipient,
  senderAssets = [],
  recipientAssets = [],
  totals = {},
  verdict = {},
} = {}) {
  const normalizedSender = normalizeParticipant(sender, sender?.rosterId);
  const normalizedRecipient = normalizeParticipant(recipient, recipient?.rosterId);
  normalizedSender.assets = senderAssets.map((asset) => normalizeTradeProposalAsset(asset, normalizedSender.rosterId, normalizedRecipient.rosterId)).filter(Boolean);
  normalizedRecipient.assets = recipientAssets.map((asset) => normalizeTradeProposalAsset(asset, normalizedRecipient.rosterId, normalizedSender.rosterId)).filter(Boolean);
  return {
    schemaVersion: TRADE_PROPOSAL_SCHEMA_VERSION,
    leagueId: cleanId(leagueId),
    season: cleanText(season),
    sender: normalizedSender,
    recipient: normalizedRecipient,
    totals: {
      sender: normalizeValue(totals.sender),
      recipient: normalizeValue(totals.recipient),
    },
    verdict: {
      verdict: cleanText(verdict.verdict, 'Trade proposal'),
      gap: normalizeValue(verdict.gap),
      pct: normalizeValue(verdict.pct),
    },
  };
}

export function buildTradeProposalSnapshotFromSides({
  leagueId,
  season,
  sender,
  recipient,
  yourSide,
  theirSide,
  verdict,
} = {}) {
  return buildTradeProposalSnapshot({
    leagueId,
    season,
    sender,
    recipient,
    senderAssets: yourSide?.items ?? [],
    recipientAssets: theirSide?.items ?? [],
    totals: { sender: yourSide?.total, recipient: theirSide?.total },
    verdict,
  });
}

// A new proposal or counter-proposal is always authored from the current
// participant's perspective, so their side becomes the snapshot sender.
export function buildTradeProposalSnapshotFromCurrentPerspective({
  leagueId,
  season,
  currentParticipant,
  partnerParticipant,
  currentSide,
  partnerSide,
  verdict,
} = {}) {
  return buildTradeProposalSnapshotFromSides({
    leagueId,
    season,
    sender: currentParticipant,
    recipient: partnerParticipant,
    yourSide: currentSide,
    theirSide: partnerSide,
    verdict,
  });
}

export function hasTradeProposalAssets(snapshot) {
  return Boolean(
    snapshot?.sender
    && snapshot?.recipient
    && ((snapshot.sender.assets?.length ?? 0) + (snapshot.recipient.assets?.length ?? 0) > 0),
  );
}

export function swapTradeProposalPerspective(snapshot) {
  if (!snapshot?.sender || !snapshot?.recipient) return null;
  return buildTradeProposalSnapshot({
    leagueId: snapshot.leagueId,
    season: snapshot.season,
    sender: snapshot.recipient,
    recipient: snapshot.sender,
    senderAssets: snapshot.recipient.assets,
    recipientAssets: snapshot.sender.assets,
    totals: { sender: snapshot.totals?.recipient, recipient: snapshot.totals?.sender },
    verdict: snapshot.verdict,
  });
}

export function getTradeProposalExpiryLabel(expiryPreset) {
  return TRADE_EXPIRY_OPTIONS.find((option) => option.id === expiryPreset)?.label ?? '2 days';
}

export function formatTradeProposalExpiry(value, timeZone = null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
        timeZoneName: 'short',
      }).format(date);
    } catch {
      // Fall through to the viewer's locale for legacy or invalid zone data.
    }
  }
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTradeProposalEventTime(value) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function getTradeProposalCountdown(expiresAt, nowMs = Date.now()) {
  const expiryMs = new Date(expiresAt ?? '').getTime();
  if (!Number.isFinite(expiryMs)) return null;
  const remainingMs = expiryMs - Number(nowMs);
  if (remainingMs <= 0) return { expired: true, label: 'Expired', remainingMs };

  let remainingSeconds = Math.ceil(remainingMs / 1_000);
  const days = Math.floor(remainingSeconds / 86_400);
  remainingSeconds -= days * 86_400;
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds -= hours * 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return { expired: false, label: parts.join(' '), remainingMs };
}

export function getTradeProposalTerminalEvent({ status, sleeperOutcome = 'unknown', updatedAt = null, acceptedAt = null, sleeperMatch = null } = {}) {
  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  const normalizedOutcome = String(sleeperOutcome ?? '').trim().toLowerCase();
  if (normalizedStatus === 'declined') return { label: 'Declined', timestamp: updatedAt };
  if (normalizedOutcome === 'completed') return { label: 'Completed', timestamp: sleeperMatch?.timestamp ?? updatedAt };
  if (normalizedStatus === 'accepted') return { label: 'Accepted', timestamp: acceptedAt ?? updatedAt };
  return null;
}

export function getTradeProposalDisplayStatus({ status, sleeperOutcome = 'unknown', viewerIsCurrentAuthor = false } = {}) {
  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  const normalizedOutcome = String(sleeperOutcome ?? '').trim().toLowerCase();
  if (normalizedStatus === 'declined') return { label: 'Trade declined', tone: 'declined' };
  if (normalizedStatus === 'withdrawn') return { label: 'Withdrawn', tone: 'withdrawn' };
  if (normalizedOutcome === 'completed') return { label: 'Completed', tone: 'completed' };
  if (normalizedStatus === 'accepted') return { label: 'Accepted', tone: 'accepted' };
  if (normalizedOutcome === 'not_completed') return { label: 'Not completed', tone: 'not-completed' };
  if (normalizedOutcome === 'possible_match') return { label: 'Possible match', tone: 'possible-match' };
  if (normalizedStatus === 'countered') return { label: 'Countered', tone: 'countered' };
  if (viewerIsCurrentAuthor) return { label: 'Proposed', tone: 'proposed' };
  return { label: 'Awaiting response', tone: 'awaiting' };
}

export function getTradeProposalAssetValue(asset, valueResolver = null) {
  const resolved = valueResolver?.(asset);
  if (resolved != null && Number.isFinite(Number(resolved))) return Number(resolved);
  return normalizeValue(asset?.value ?? asset?.val);
}

export function getTradeProposalActorRole(proposal, userId) {
  const normalized = cleanId(userId);
  if (!normalized || !proposal) return null;
  if (normalized === proposal.senderUserId || normalized === proposal.revision?.snapshot?.sender?.userId) return 'sender';
  if (normalized === proposal.recipientUserId || normalized === proposal.revision?.snapshot?.recipient?.userId) return 'recipient';
  return null;
}

export function getTradeProposalOtherParticipant(proposal, userId) {
  const role = getTradeProposalActorRole(proposal, userId);
  if (role === 'sender') return proposal.recipientUserId;
  if (role === 'recipient') return proposal.senderUserId;
  return null;
}

export function getSleeperLeagueUrl(leagueId) {
  const normalized = cleanId(leagueId);
  return normalized ? `https://sleeper.com/leagues/${encodeURIComponent(normalized)}` : null;
}
