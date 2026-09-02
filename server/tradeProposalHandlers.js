import crypto from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import express from 'express';
import { getTradeProposalConfig } from './tradeProposalConfig.js';
import {
  buildTradeProposalFingerprint,
  generateTradeProposalId,
  generateTradeProposalToken,
  hashTradeProposalToken,
} from './tradeProposalCrypto.js';
import { createSleeperTradeApi } from './sleeperTradeApi.js';
import { createTradeProposalStore } from './tradeProposalStore.js';

const SCHEMA_VERSION = 1;
const MAX_ID_LENGTH = 160;
const MAX_LABEL_LENGTH = 180;
const MAX_ASSETS_PER_SIDE = 50;
const MAX_ASSET_ID_LENGTH = 160;
const MAX_TRADE_ROUNDS = 19;
const EXPIRY_OPTIONS = new Set(['hour', 'end_of_day', 'day', 'two_days', 'week']);

function requestError(message, statusCode = 400, kind = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (kind) error.kind = kind;
  return error;
}

function normalizeId(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > MAX_ID_LENGTH) throw requestError(`${label} is required.`, 400);
  return normalized;
}

function normalizeSeason(value) {
  const season = String(value ?? '').trim();
  if (!/^\d{4}$/.test(season)) throw requestError('A valid four-digit season is required.', 400);
  return season;
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization ?? '').trim();
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
  return String(req.headers?.['x-trade-proposal-token'] ?? '').trim();
}

function sendError(res, error, fallbackMessage = 'Trade proposal request failed.') {
  const payload = {
    ok: false,
    error: error?.message ?? fallbackMessage,
  };
  if (error?.kind) payload.kind = error.kind;
  return res.status(error?.statusCode ?? 400).set('Cache-Control', 'no-store').json(payload);
}

function noStore(res) {
  return res.set('Cache-Control', 'no-store');
}

function normalizeAssetId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > MAX_ASSET_ID_LENGTH) throw requestError('Trade asset ID is invalid.', 400);
  return normalized;
}

function safeLabel(value, fallback) {
  const label = String(value ?? '').trim();
  return (label || fallback).slice(0, MAX_LABEL_LENGTH);
}

function getUserName(user, fallback) {
  return safeLabel(user?.display_name ?? user?.username, fallback);
}

function getTeamName(roster, user, rosterId) {
  return safeLabel(
    user?.metadata?.team_name ?? roster?.metadata?.team_name ?? roster?.metadata?.name,
    `Team ${rosterId}`,
  );
}

function getUserAvatar(user) {
  return user?.avatar == null ? null : String(user.avatar);
}

function rosterPlayerIds(roster) {
  return new Set([
    ...(Array.isArray(roster?.players) ? roster.players : []),
    ...(Array.isArray(roster?.reserve) ? roster.reserve : []),
    ...(Array.isArray(roster?.taxi) ? roster.taxi : []),
  ].map((value) => String(value)));
}

function getRosterBalance(roster, league) {
  const budget = Number(league?.settings?.waiver_budget);
  const used = Number(roster?.settings?.waiver_budget_used);
  if (!Number.isFinite(budget) || !Number.isFinite(used)) return null;
  return Math.max(0, budget - used);
}

function getPickOwner(tradedPicks, year, round, originalRosterId) {
  const targetYear = String(year);
  const targetRound = Number(round);
  const targetOriginal = String(originalRosterId ?? '');
  const entry = (tradedPicks ?? []).find((pick) => (
    String(pick?.season ?? '') === targetYear
      && Number(pick?.round) === targetRound
      && String(pick?.roster_id ?? '') === targetOriginal
  ));
  return entry ? String(entry.owner_id ?? entry.roster_id ?? '') : targetOriginal;
}

function getBoundaryMaps(boundary, leagueId, season) {
  if (!isRecord(boundary?.league) || String(boundary.league.league_id ?? leagueId) !== leagueId) {
    throw requestError('Sleeper returned a different league than requested.', 409, 'league-mismatch');
  }
  if (String(boundary.league.season ?? '') !== season) {
    throw requestError('This Sleeper league does not belong to the selected season.', 409, 'season-mismatch');
  }
  const users = Array.isArray(boundary.users) ? boundary.users : [];
  const rosters = Array.isArray(boundary.rosters) ? boundary.rosters : [];
  const usersById = new Map(users.map((user) => [String(user?.user_id ?? ''), user]));
  const rostersById = new Map(rosters.map((roster) => [String(roster?.roster_id ?? ''), roster]));
  return { users, rosters, usersById, rostersById, tradedPicks: boundary.tradedPicks ?? [], league: boundary.league };
}

function assertParticipant(maps, userId, rosterId, label) {
  const normalizedUserId = normalizeId(userId, `${label} user ID`);
  const normalizedRosterId = normalizeId(rosterId, `${label} roster ID`);
  const user = maps.usersById.get(normalizedUserId);
  const roster = maps.rostersById.get(normalizedRosterId);
  if (!user || !roster || String(roster.owner_id ?? '') !== normalizedUserId) {
    throw requestError(`${label} is not a participant in this Sleeper league.`, 403, 'participant-mismatch');
  }
  return { userId: normalizedUserId, rosterId: normalizedRosterId, user, roster };
}

function normalizeAsset(asset, fromRosterId, toRosterId) {
  if (!isRecord(asset)) throw requestError('Each trade asset must be an object.', 400);
  const type = String(asset.type ?? '').trim();
  if (!['player', 'pick', 'faab'].includes(type)) throw requestError('Trade assets must be players, picks, or FAAB.', 400);
  const from = normalizeId(asset.fromRosterId ?? fromRosterId, 'Trade asset source roster ID');
  const to = normalizeId(asset.toRosterId ?? toRosterId, 'Trade asset destination roster ID');
  const normalized = {
    type,
    id: asset.id == null ? null : normalizeAssetId(asset.id),
    label: safeLabel(asset.label, type === 'player' ? `Player ${asset.id ?? ''}` : 'Trade asset'),
    value: Number.isFinite(Number(asset.value ?? asset.val)) ? Number(asset.value ?? asset.val) : null,
    fromRosterId: from,
    toRosterId: to,
  };
  if (type === 'player') {
    normalized.position = asset.position == null ? null : String(asset.position).slice(0, 30);
    normalized.team = asset.team == null ? null : String(asset.team).slice(0, 30);
    if (!normalized.id) throw requestError('Player assets require a player ID.', 400);
  } else if (type === 'pick') {
    normalized.year = normalizeSeason(asset.year);
    normalized.round = Number(asset.round);
    normalized.originalRosterId = normalizeId(asset.originalRosterId ?? asset.rosterId ?? from, 'Draft pick original roster ID');
    if (!Number.isSafeInteger(normalized.round) || normalized.round < 1 || normalized.round > 20) {
      throw requestError('Draft pick round is invalid.', 400);
    }
    normalized.pickNumberLabel = asset.pickNumberLabel == null && asset.pickRangeLabel == null
      ? null
      : safeLabel(asset.pickNumberLabel ?? asset.pickRangeLabel, '');
    normalized.id = `pick:${normalized.year}:${normalized.round}:${normalized.originalRosterId}`;
  } else {
    normalized.amount = Number(asset.amount);
    normalized.id = `faab:${normalized.amount}`;
    if (!Number.isSafeInteger(normalized.amount) || normalized.amount <= 0) {
      throw requestError('FAAB trade amount must be a positive whole number.', 400);
    }
  }
  return normalized;
}

function assetFingerprint(asset) {
  if (asset.type === 'player') return `player:${asset.id}`;
  if (asset.type === 'pick') return `pick:${asset.year}:${asset.round}:${asset.originalRosterId}`;
  return `faab:${asset.amount}`;
}

function normalizeSide(rawSide, participant, otherParticipant) {
  if (!isRecord(rawSide)) throw requestError('Trade proposal sides are required.', 400);
  const rawAssets = rawSide.assets;
  if (!Array.isArray(rawAssets) || rawAssets.length > MAX_ASSETS_PER_SIDE) {
    throw requestError('Each trade side must contain a valid asset list.', 400);
  }
  const assets = rawAssets.map((asset) => normalizeAsset(asset, participant.rosterId, otherParticipant.rosterId));
  const seen = new Set();
  for (const asset of assets) {
    if (asset.fromRosterId !== participant.rosterId || asset.toRosterId !== otherParticipant.rosterId) {
      throw requestError('Trade assets must stay within the two selected league rosters.', 403, 'league-scope');
    }
    const key = assetFingerprint(asset);
    if (seen.has(key)) throw requestError('A trade asset cannot appear twice on one side.', 400);
    seen.add(key);
  }
  return {
    userId: participant.userId,
    rosterId: participant.rosterId,
    name: getUserName(participant.user, `Manager ${participant.rosterId}`),
    teamName: getTeamName(participant.roster, participant.user, participant.rosterId),
    avatarHash: getUserAvatar(participant.user),
    assets,
  };
}

function assertCurrentOwnership(maps, side, otherSide) {
  const playerIds = rosterPlayerIds(maps.rostersById.get(side.rosterId));
  const seenAssets = new Set();
  for (const asset of side.assets) {
    const key = assetFingerprint(asset);
    if (seenAssets.has(key)) throw requestError('A trade asset cannot appear twice in a proposal.', 400);
    seenAssets.add(key);
    if (asset.type === 'player' && !playerIds.has(String(asset.id))) {
      throw requestError(`${asset.label} is no longer on the proposing roster.`, 409, 'asset-not-owned');
    }
    if (asset.type === 'pick') {
      const ownerId = getPickOwner(maps.tradedPicks, asset.year, asset.round, asset.originalRosterId);
      if (ownerId !== side.rosterId) throw requestError(`${asset.label} is not owned by the proposing roster.`, 409, 'asset-not-owned');
    }
    if (asset.type === 'faab') {
      const balance = getRosterBalance(side.roster, maps.league);
      if (balance != null && asset.amount > balance) throw requestError('The proposing roster does not have enough FAAB for this proposal.', 409, 'asset-not-owned');
    }
    if (asset.toRosterId !== otherSide.rosterId) throw requestError('Trade assets must target the other selected roster.', 403, 'league-scope');
  }
}

function normalizeSnapshot(rawSnapshot, maps, sender, recipient, { requireAssets = true } = {}) {
  if (!isRecord(rawSnapshot)) throw requestError('A trade proposal snapshot is required.', 400);
  if (rawSnapshot.schemaVersion != null && Number(rawSnapshot.schemaVersion) !== SCHEMA_VERSION) {
    throw requestError('This trade proposal format is not supported by the server.', 400);
  }
  const senderSide = normalizeSide(rawSnapshot.sender, sender, recipient);
  const recipientSide = normalizeSide(rawSnapshot.recipient, recipient, sender);
  if ((senderSide.assets.length + recipientSide.assets.length === 0) && requireAssets) {
    throw requestError('A trade proposal must include at least one asset.', 400);
  }
  assertCurrentOwnership(maps, senderSide, recipientSide);
  assertCurrentOwnership(maps, recipientSide, senderSide);
  const fingerprintData = {
    leagueId: maps.league.league_id,
    season: String(maps.league.season),
    senderRosterId: sender.rosterId,
    recipientRosterId: recipient.rosterId,
    senderAssets: senderSide.assets.map(assetFingerprint).sort(),
    recipientAssets: recipientSide.assets.map(assetFingerprint).sort(),
  };
  const totals = isRecord(rawSnapshot.totals) ? rawSnapshot.totals : {};
  const verdict = isRecord(rawSnapshot.verdict) ? rawSnapshot.verdict : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    leagueId: String(maps.league.league_id),
    season: String(maps.league.season),
    sender: senderSide,
    recipient: recipientSide,
    totals: {
      sender: Number.isFinite(Number(totals.sender)) ? Number(totals.sender) : null,
      recipient: Number.isFinite(Number(totals.recipient)) ? Number(totals.recipient) : null,
    },
    verdict: {
      verdict: safeLabel(verdict.verdict, 'Trade proposal'),
      gap: Number.isFinite(Number(verdict.gap)) ? Number(verdict.gap) : null,
      pct: Number.isFinite(Number(verdict.pct)) ? Number(verdict.pct) : null,
    },
    fingerprint: buildTradeProposalFingerprint(fingerprintData),
    fingerprintData,
  };
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function getEndOfDay(nowMs, timeZone) {
  let zone = String(timeZone ?? '').trim() || 'UTC';
  try { getZonedParts(new Date(nowMs), zone); } catch { zone = 'UTC'; }
  const current = getZonedParts(new Date(nowMs), zone);
  const nextDay = new Date(Date.UTC(current.year, current.month - 1, current.day) + 86_400_000);
  const localMidnightUtc = nextDay.getTime();
  return localMidnightUtc - getTimeZoneOffsetMs(new Date(localMidnightUtc), zone);
}

function normalizeTradeTimeZone(value) {
  const timeZone = String(value ?? '').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function resolveTradeExpiryAt(preset, nowMs, timeZone = 'UTC') {
  const normalized = String(preset ?? 'two_days').trim();
  if (!EXPIRY_OPTIONS.has(normalized)) throw requestError('Choose an expiry between one hour and one week.', 400);
  const oneHour = 60 * 60 * 1_000;
  const oneDay = 24 * oneHour;
  const expiry = normalized === 'hour'
    ? nowMs + oneHour
    : normalized === 'day'
      ? nowMs + oneDay
      : normalized === 'two_days'
        ? nowMs + 2 * oneDay
        : normalized === 'week'
          ? nowMs + 7 * oneDay
          : getEndOfDay(nowMs, timeZone);
  if (!Number.isSafeInteger(expiry) || expiry <= nowMs || expiry > nowMs + 7 * oneDay) {
    throw requestError('Trade proposal expiry must be within the next week.', 400);
  }
  return expiry;
}

function getProposalForSession(currentStore, proposalId, session) {
  currentStore.pruneExpired();
  const proposal = currentStore.getProposal(proposalId);
  if (!proposal) {
    const tombstone = currentStore.getTombstone(proposalId);
    if (tombstone) throw requestError('This trade proposal has expired.', 410, 'expired');
    throw requestError('Trade proposal not found.', 404);
  }
  if (proposal.leagueId !== session.leagueId || proposal.season !== session.season) {
    throw requestError('This trade proposal belongs to a different league or season.', 403, 'league-scope');
  }
  if (session.sleeperUserId !== proposal.senderUserId && session.sleeperUserId !== proposal.recipientUserId) {
    throw requestError('You are not a participant in this trade proposal.', 403, 'participant-mismatch');
  }
  return proposal;
}

function getPublicProposal(currentStore, token) {
  const proposal = currentStore.getProposalByShareToken(token);
  if (proposal) return proposal;
  throw requestError('This trade proposal link is invalid or has expired.', 404);
}

function makeShareUrl(req, token) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const protocol = forwardedProto || (req.secure ? 'https' : 'http');
  const host = String(req.headers?.host ?? 'localhost').trim();
  return `${protocol}://${host}/trade/share/${encodeURIComponent(token)}`;
}

function assetSummary(asset) {
  if (asset.type === 'faab') return `$${asset.amount} FAAB`;
  const value = Number.isFinite(Number(asset.value)) ? ` (${Math.round(Number(asset.value))})` : '';
  return `${asset.label}${value}`;
}

function renderTradeShareHtml(proposal, shareUrl) {
  const snapshot = proposal.revision?.snapshot ?? {};
  const senderName = snapshot.sender?.name ?? snapshot.sender?.teamName ?? 'Sender';
  const recipientName = snapshot.recipient?.name ?? snapshot.recipient?.teamName ?? 'Recipient';
  const senderAssets = (snapshot.sender?.assets ?? []).map(assetSummary);
  const recipientAssets = (snapshot.recipient?.assets ?? []).map(assetSummary);
  const totals = [snapshot.totals?.sender, snapshot.totals?.recipient]
    .map((value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);
  const summary = `${senderName} sends ${senderAssets.join(', ') || 'no listed assets'} for ${recipientName} sending ${recipientAssets.join(', ') || 'no listed assets'}${totals.every((value) => value != null) ? `. Trade values: ${totals[0]} offered and ${totals[1]} requested.` : '.'}`;
  const title = `${senderName} ↔ ${recipientName} · Trade Proposal | GridShift`;
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const safeTitle = escape(title);
  const safeSummary = escape(summary);
  const safeUrl = escape(shareUrl);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeSummary}"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeSummary}"><meta property="og:type" content="website"><meta property="og:url" content="${safeUrl}"><meta name="twitter:card" content="summary"><meta http-equiv="refresh" content="0;url=/trade?share=${encodeURIComponent(shareUrl.split('/').pop())}"></head><body><p>Opening this GridShift trade proposal…</p><p><a href="/trade?share=${encodeURIComponent(shareUrl.split('/').pop())}">Continue to GridShift</a></p></body></html>`;
}

function transactionAssetFingerprint(transaction, senderRosterId, recipientRosterId) {
  const adds = isRecord(transaction?.adds) ? transaction.adds : null;
  const drops = isRecord(transaction?.drops) ? transaction.drops : null;
  const senderAssets = [];
  const recipientAssets = [];
  const playerIds = new Set([...Object.keys(adds ?? {}), ...Object.keys(drops ?? {})]);
  if (adds && drops) {
    for (const playerId of playerIds) {
      const receiver = String(adds[playerId] ?? '');
      const sender = String(drops[playerId] ?? '');
      if (sender === senderRosterId && receiver === recipientRosterId) senderAssets.push(`player:${playerId}`);
      if (sender === recipientRosterId && receiver === senderRosterId) recipientAssets.push(`player:${playerId}`);
    }
  }
  for (const pick of transaction?.draft_picks ?? []) {
    const originalRosterId = String(pick?.roster_id ?? pick?.previous_owner_id ?? '');
    const key = `pick:${String(pick?.season ?? '')}:${Number(pick?.round)}:${originalRosterId}`;
    const from = String(pick?.previous_owner_id ?? pick?.roster_id ?? '');
    const to = String(pick?.owner_id ?? '');
    if (from === senderRosterId && to === recipientRosterId) senderAssets.push(key);
    if (from === recipientRosterId && to === senderRosterId) recipientAssets.push(key);
  }
  for (const transfer of transaction?.waiver_budget ?? []) {
    const amount = Number(transfer?.amount);
    const from = String(transfer?.sender ?? '');
    const to = String(transfer?.receiver ?? '');
    if (from === senderRosterId && to === recipientRosterId) senderAssets.push(`faab:${amount}`);
    if (from === recipientRosterId && to === senderRosterId) recipientAssets.push(`faab:${amount}`);
  }
  return { senderAssets: senderAssets.sort(), recipientAssets: recipientAssets.sort(), hasDetails: Boolean(adds && drops) || senderAssets.length > 0 || recipientAssets.length > 0 };
}

function transactionTouchesRosters(transaction, rosterIds) {
  const touched = new Set((transaction?.roster_ids ?? []).map((value) => String(value)));
  Object.values(transaction?.adds ?? {}).forEach((value) => touched.add(String(value)));
  Object.values(transaction?.drops ?? {}).forEach((value) => touched.add(String(value)));
  for (const pick of transaction?.draft_picks ?? []) {
    touched.add(String(pick?.previous_owner_id ?? pick?.roster_id ?? ''));
    touched.add(String(pick?.owner_id ?? ''));
  }
  for (const transfer of transaction?.waiver_budget ?? []) {
    touched.add(String(transfer?.sender ?? ''));
    touched.add(String(transfer?.receiver ?? ''));
  }
  return rosterIds.every((rosterId) => touched.has(String(rosterId)));
}

async function findSleeperTradeMatch(sleeperApi, proposal) {
  const fingerprintData = proposal.revision?.snapshot?.fingerprintData;
  if (!fingerprintData) return null;
  const expectedSender = [...(fingerprintData.senderAssets ?? [])].sort();
  const expectedRecipient = [...(fingerprintData.recipientAssets ?? [])].sort();
  const rounds = Array.from({ length: MAX_TRADE_ROUNDS }, (_, index) => index);
  const transactionLists = await Promise.all(rounds.map((round) => sleeperApi.getTransactions(proposal.leagueId, round).catch(() => [])));
  for (const transactions of transactionLists) {
    for (const transaction of Array.isArray(transactions) ? transactions : []) {
      if (transaction?.type !== 'trade' || transaction?.status !== 'complete') continue;
      const rosterIds = [proposal.senderRosterId, proposal.recipientRosterId];
      if (!transactionTouchesRosters(transaction, rosterIds)) continue;
      const details = transactionAssetFingerprint(transaction, proposal.senderRosterId, proposal.recipientRosterId);
      if (details.hasDetails && JSON.stringify(details.senderAssets) === JSON.stringify(expectedSender) && JSON.stringify(details.recipientAssets) === JSON.stringify(expectedRecipient)) {
        return {
          transactionId: String(transaction.transaction_id ?? ''),
          confidence: 'exact',
          timestamp: Number(transaction.status_updated ?? transaction.created) || null,
          leg: Number(transaction.leg) || null,
        };
      }
      if (!details.hasDetails) {
        return {
          transactionId: String(transaction.transaction_id ?? ''),
          confidence: 'weak',
          timestamp: Number(transaction.status_updated ?? transaction.created) || null,
          leg: Number(transaction.leg) || null,
          reason: 'Sleeper identified a completed trade between these two rosters but did not expose enough asset detail to compare it automatically.',
        };
      }
    }
  }
  return null;
}

export function createTradeProposalRouter({
  injectedConfig,
  env = process.env,
  store: injectedStore,
  storeFactory = createTradeProposalStore,
  sleeperApi: injectedSleeperApi,
  sleeperApiFactory = createSleeperTradeApi,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
} = {}) {
  const config = injectedConfig ?? getTradeProposalConfig({ env });
  const router = express.Router();
  let store = injectedStore ?? null;
  let storeError = null;
  let sleeperApi = injectedSleeperApi ?? null;

  router.use(express.json({ limit: `${config.maxPayloadBytes}b` }));

  function requireReady() {
    if (!config.enabled || !config.ready) throw requestError('Trade proposals are not configured on this server.', 503, 'not-configured');
    if (store) return store;
    if (storeError) throw requestError('Trade proposal storage is unavailable.', 503, 'storage-unavailable');
    try {
      store = storeFactory({ config, now });
      return store;
    } catch (error) {
      storeError = error;
      throw requestError('Trade proposal storage is unavailable.', 503, 'storage-unavailable');
    }
  }

  function requireSleeperApi() {
    if (sleeperApi) return sleeperApi;
    sleeperApi = sleeperApiFactory();
    return sleeperApi;
  }

  function requireSession(req) {
    const token = getBearerToken(req);
    if (!token) throw requestError('A GridShift trade participant token is required.', 401);
    const currentStore = requireReady();
    const session = currentStore.getSession(token);
    if (!session) throw requestError('The GridShift trade participant token is invalid.', 401);
    currentStore.touchSession(session.tokenHash, Number(now()));
    return { currentStore, session, token };
  }

  async function loadMaps(leagueId, season) {
    const boundary = await requireSleeperApi().getLeagueBoundary(leagueId);
    return getBoundaryMaps(boundary, leagueId, season);
  }

  function validateSessionScope(session, leagueId, season) {
    if (session.leagueId !== leagueId || session.season !== season) {
      throw requestError('This participant token is scoped to a different league or season.', 403, 'league-scope');
    }
  }

  function makeEventId() {
    return generateTradeProposalId(randomBytes);
  }

  const cleanupTimer = setInterval(() => {
    try {
      const currentStore = requireReady();
      currentStore.pruneExpired(Number(now()));
    } catch {
      // Requests continue to surface storage/configuration failures. Cleanup
      // is opportunistic and must never take down the API sidecar.
    }
  }, 5 * 60 * 1_000);
  cleanupTimer.unref?.();

  router.get('/status', (_req, res) => noStore(res).json({
    ok: true,
    tradeProposals: {
      enabled: config.enabled,
      ready: config.ready,
      maxExpiryMs: config.maxExpiryMs,
      tombstoneRetentionMs: config.tombstoneRetentionMs,
      expiryOptions: [...EXPIRY_OPTIONS],
    },
  }));

  router.post('/session', async (req, res) => {
    try {
      const currentStore = requireReady();
      const leagueId = normalizeId(req.body?.leagueId ?? req.body?.league_id, 'League ID');
      const season = normalizeSeason(req.body?.season);
      const sleeperUserId = normalizeId(req.body?.sleeperUserId ?? req.body?.sleeper_user_id, 'Sleeper user ID');
      const maps = await loadMaps(leagueId, season);
      assertParticipant(maps, sleeperUserId, req.body?.rosterId ?? req.body?.roster_id, 'Your roster');
      const token = generateTradeProposalToken(randomBytes);
      const createdAt = Number(now());
      currentStore.createSession({
        tokenHash: hashTradeProposalToken(token, config.sessionSecret),
        sleeperUserId,
        leagueId,
        season,
        createdAt,
      });
      return noStore(res).json({ ok: true, sessionToken: token, leagueId, season, sleeperUserId });
    } catch (error) {
      return sendError(res, error, 'Could not establish the GridShift trade participant session.');
    }
  });

  router.post('/proposals', async (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      const leagueId = normalizeId(req.body?.leagueId ?? req.body?.league_id, 'League ID');
      const season = normalizeSeason(req.body?.season);
      validateSessionScope(session, leagueId, season);
      const maps = await loadMaps(leagueId, season);
      const sender = assertParticipant(maps, session.sleeperUserId, req.body?.senderRosterId ?? req.body?.sender_roster_id, 'Sender');
      const recipient = assertParticipant(maps, req.body?.recipientUserId ?? req.body?.recipient_user_id, req.body?.recipientRosterId ?? req.body?.recipient_roster_id, 'Recipient');
      if (sender.rosterId === recipient.rosterId || sender.userId === recipient.userId) throw requestError('A trade must involve two different league participants.', 400);
      const snapshot = normalizeSnapshot(req.body?.snapshot, maps, sender, recipient);
      const createdAt = Number(now());
      const senderTimeZone = normalizeTradeTimeZone(req.body?.timeZone);
      const expiresAt = resolveTradeExpiryAt(req.body?.expiryPreset, createdAt, senderTimeZone);
      const proposalId = generateTradeProposalId(randomBytes);
      const shareToken = generateTradeProposalToken(randomBytes);
      const proposal = currentStore.createProposal({
        proposalId,
        shareTokenHash: hashTradeProposalToken(shareToken, config.sessionSecret),
        leagueId,
        season,
        senderUserId: sender.userId,
        senderRosterId: sender.rosterId,
        recipientUserId: recipient.userId,
        recipientRosterId: recipient.rosterId,
        snapshot,
        expiresAt,
        senderTimeZone,
        createdAt,
        fingerprint: snapshot.fingerprint,
        fingerprintData: snapshot.fingerprintData,
        eventId: makeEventId(),
      });
      return noStore(res).status(201).json({ ok: true, proposal, shareUrl: makeShareUrl(req, shareToken), shareToken, expiresAt: new Date(expiresAt).toISOString() });
    } catch (error) {
      return sendError(res, error, 'Could not send the GridShift trade proposal.');
    }
  });

  router.get('/inbox', (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      currentStore.pruneExpired(Number(now()));
      const inbox = currentStore.listInbox({ sleeperUserId: session.sleeperUserId, leagueId: session.leagueId, season: session.season, currentTime: Number(now()) });
      return noStore(res).json({ ok: true, ...inbox, leagueId: session.leagueId, season: session.season });
    } catch (error) {
      return sendError(res, error, 'Could not load GridShift proposals.');
    }
  });

  router.get('/proposals/:proposalId', (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      currentStore.pruneExpired(Number(now()));
      const proposal = getProposalForSession(currentStore, req.params.proposalId, session);
      return noStore(res).json({ ok: true, proposal });
    } catch (error) {
      return sendError(res, error, 'Could not load the GridShift trade proposal.');
    }
  });

  router.post('/proposals/:proposalId/counter', async (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      const current = getProposalForSession(currentStore, req.params.proposalId, session);
      if (!['pending', 'countered'].includes(current.status)) throw requestError('This trade proposal is closed.', 409);
      if (current.revision?.authorUserId === session.sleeperUserId) throw requestError('Wait for the other participant to respond before sending another counter-proposal.', 409);
      const maps = await loadMaps(current.leagueId, current.season);
      const originalSender = assertParticipant(maps, current.senderUserId, current.senderRosterId, 'Sender');
      const originalRecipient = assertParticipant(maps, current.recipientUserId, current.recipientRosterId, 'Recipient');
      const sender = session.sleeperUserId === current.senderUserId ? originalSender : originalRecipient;
      const recipient = session.sleeperUserId === current.senderUserId ? originalRecipient : originalSender;
      const snapshot = normalizeSnapshot(req.body?.snapshot, maps, sender, recipient);
      const senderTimeZone = normalizeTradeTimeZone(req.body?.timeZone);
      const expiresAt = resolveTradeExpiryAt(req.body?.expiryPreset, Number(now()), senderTimeZone);
      const result = currentStore.addCounter({
        proposalId: current.id,
        expectedRevision: Number(req.body?.expectedRevision ?? req.body?.revision),
        authorUserId: session.sleeperUserId,
        snapshot,
        expiresAt,
        senderTimeZone,
        eventId: makeEventId(),
        createdAt: Number(now()),
      });
      if (result.conflict) return noStore(res).status(409).json({ ok: false, error: 'This trade proposal changed before the counter-proposal was sent.', proposal: result.proposal });
      if (!result.proposal) throw requestError('Trade proposal not found.', 404);
      return noStore(res).json({ ok: true, proposal: result.proposal, expiresAt: new Date(expiresAt).toISOString() });
    } catch (error) {
      return sendError(res, error, 'Could not send the counter-proposal.');
    }
  });

  async function updateTradeStatus(req, res, status) {
    try {
      const { currentStore, session } = requireSession(req);
      const current = getProposalForSession(currentStore, req.params.proposalId, session);
      if (!['pending', 'countered'].includes(current.status)) throw requestError('This trade proposal is closed.', 409);
      if (status === 'declined' && current.currentRevision === 1 && session.sleeperUserId === current.senderUserId) {
        throw requestError('The original sender can withdraw this proposal; only its recipient can decline it.', 403);
      }
      if (status === 'withdrawn' && String(current.revision?.authorUserId ?? '') !== String(session.sleeperUserId)) {
        throw requestError('Only the participant who made the latest proposal can withdraw it.', 403);
      }
      if (status === 'declined' && current.revision?.authorUserId === session.sleeperUserId) {
        throw requestError('A participant cannot decline their own current proposal.', 403);
      }
      const proposal = currentStore.updateStatus({ proposalId: current.id, status, actorUserId: session.sleeperUserId, eventId: makeEventId(), createdAt: Number(now()) });
      return noStore(res).json({ ok: true, proposal });
    } catch (error) {
      return sendError(res, error, status === 'declined' ? 'Could not decline the trade proposal.' : 'Could not withdraw the trade proposal.');
    }
  }

  router.post('/proposals/:proposalId/decline', (req, res) => updateTradeStatus(req, res, 'declined'));
  router.post('/proposals/:proposalId/withdraw', (req, res) => updateTradeStatus(req, res, 'withdrawn'));

  router.post('/proposals/:proposalId/accept', (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      const current = getProposalForSession(currentStore, req.params.proposalId, session);
      if (!['pending', 'countered'].includes(current.status)) throw requestError('This trade proposal is closed.', 409);
      if (current.revision?.authorUserId === session.sleeperUserId) {
        throw requestError('You cannot accept the proposal you most recently sent.', 403);
      }
      const result = currentStore.acceptProposal({
        proposalId: current.id,
        expectedRevision: current.currentRevision,
        actorUserId: session.sleeperUserId,
        eventId: makeEventId(),
        createdAt: Number(now()),
      });
      if (result.forbidden) {
        throw requestError(result.reason === 'author' ? 'You cannot accept the proposal you most recently sent.' : 'You are not a participant in this trade proposal.', 403);
      }
      if (result.conflict) return noStore(res).status(409).json({ ok: false, error: 'This trade proposal changed before it was accepted.', proposal: result.proposal });
      if (!result.proposal) throw requestError('Trade proposal not found.', 404);
      return noStore(res).json({ ok: true, proposal: result.proposal });
    } catch (error) {
      return sendError(res, error, 'Could not accept the trade proposal.');
    }
  });

  router.post('/proposals/:proposalId/completion', (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      const current = getProposalForSession(currentStore, req.params.proposalId, session);
      if (current.status !== 'accepted') throw requestError('Accept this proposal in GridShift before marking it done.', 409);
      if (current.acceptedByUserId !== session.sleeperUserId) throw requestError('Only the manager who accepted this proposal can mark it done.', 403);
      const outcome = String(req.body?.outcome ?? '').trim();
      if (outcome !== 'completed') throw requestError('Mark the trade done after Sleeper processes it.', 400);
      const proposal = currentStore.updateSleeperOutcome({
        proposalId: current.id,
        outcome,
        transactionId: current.sleeperTransactionId,
        match: current.sleeperMatch,
        checkedAt: Number(now()),
        eventId: makeEventId(),
        eventRecipients: [session.sleeperUserId === current.senderUserId ? current.recipientUserId : current.senderUserId],
        eventType: 'trade_marked_completed',
        actorUserId: session.sleeperUserId,
      });
      return noStore(res).json({ ok: true, proposal });
    } catch (error) {
      return sendError(res, error, 'Could not update the Sleeper trade outcome.');
    }
  });

  router.post('/proposals/:proposalId/reconcile', async (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      const current = getProposalForSession(currentStore, req.params.proposalId, session);
      if (current.status !== 'accepted') throw requestError('Accept this proposal in GridShift before checking Sleeper.', 409);
      if (current.acceptedByUserId !== session.sleeperUserId) throw requestError('Only the manager who accepted this proposal can check Sleeper.', 403);
      const match = await findSleeperTradeMatch(requireSleeperApi(), current);
      if (!match) return noStore(res).json({ ok: true, match: null, proposal: current });
      const proposal = currentStore.updateSleeperOutcome({
        proposalId: current.id,
        outcome: 'possible_match',
        transactionId: match.transactionId,
        match,
        checkedAt: Number(now()),
        eventId: makeEventId(),
        eventRecipients: [current.senderUserId, current.recipientUserId],
        eventType: 'sleeper_match_possible',
        actorUserId: session.sleeperUserId,
      });
      return noStore(res).json({ ok: true, match, proposal });
    } catch (error) {
      return sendError(res, error, 'Could not check Sleeper for a matching completed trade.');
    }
  });

  router.post('/events/:eventId/read', (req, res) => {
    try {
      const { currentStore, session } = requireSession(req);
      const read = currentStore.markEventRead({ eventId: req.params.eventId, sleeperUserId: session.sleeperUserId, leagueId: session.leagueId, season: session.season, readAt: Number(now()) });
      return noStore(res).json({ ok: true, read });
    } catch (error) {
      return sendError(res, error, 'Could not mark the trade notification as read.');
    }
  });

  router.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).set('Cache-Control', 'no-store').json({ ok: false, error: 'Trade proposal payload is too large.' });
    if (error) return sendError(res, error, 'Invalid trade proposal JSON payload.');
    return next();
  });

  return router;
}

export function createTradeShareRouter({
  injectedConfig,
  env = process.env,
  store: injectedStore,
  storeFactory = createTradeProposalStore,
  now = () => Date.now(),
} = {}) {
  const config = injectedConfig ?? getTradeProposalConfig({ env });
  const router = express.Router();
  let store = injectedStore ?? null;
  let storeError = null;

  function getStore() {
    if (!config.enabled || !config.ready) throw requestError('Trade proposals are not configured on this server.', 503);
    if (store) return store;
    if (storeError) throw requestError('Trade proposal storage is unavailable.', 503, 'storage-unavailable');
    try {
      store = storeFactory({ config, now });
    } catch (error) {
      storeError = error;
      throw requestError('Trade proposal storage is unavailable.', 503, 'storage-unavailable');
    }
    store.pruneExpired(Number(now()));
    return store;
  }

  router.get('/:token', (req, res) => {
    try {
      const currentStore = getStore();
      const proposal = getPublicProposal(currentStore, req.params.token);
      const forwardedProto = String(req.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim();
      const protocol = forwardedProto || String(req.protocol ?? 'http');
      const shareUrl = `${protocol}://${String(req.headers?.host ?? 'localhost')}/trade/share/${encodeURIComponent(req.params.token)}`;
      return noStore(res).type('html').send(renderTradeShareHtml(proposal, shareUrl));
    } catch (error) {
      return res.status(error?.statusCode ?? 404).set('Cache-Control', 'no-store').type('html').send(`<h1>Trade proposal unavailable</h1><p>${String(error?.message ?? 'This trade proposal is unavailable.')}</p>`);
    }
  });

  return router;
}

export function createTradeShareApiRouter({
  injectedConfig,
  env = process.env,
  store: injectedStore,
  storeFactory = createTradeProposalStore,
  sleeperApi: injectedSleeperApi,
  sleeperApiFactory = createSleeperTradeApi,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
} = {}) {
  const config = injectedConfig ?? getTradeProposalConfig({ env });
  const router = express.Router();
  let store = injectedStore ?? null;
  let storeError = null;
  let sleeperApi = injectedSleeperApi ?? null;
  router.use(express.json({ limit: `${config.maxPayloadBytes}b` }));

  function getStore() {
    if (!config.enabled || !config.ready) throw requestError('Trade proposals are not configured on this server.', 503);
    if (store) return store;
    if (storeError) throw requestError('Trade proposal storage is unavailable.', 503, 'storage-unavailable');
    try {
      store = storeFactory({ config, now });
    } catch (error) {
      storeError = error;
      throw requestError('Trade proposal storage is unavailable.', 503, 'storage-unavailable');
    }
    store.pruneExpired(Number(now()));
    return store;
  }

  function getApi() {
    if (!sleeperApi) sleeperApi = sleeperApiFactory();
    return sleeperApi;
  }

  router.get('/:token', (req, res) => {
    try {
      const currentStore = getStore();
      const token = String(req.params.token ?? '').trim();
      const proposal = currentStore.getProposalByShareToken(token);
      if (!proposal) throw requestError('This trade proposal link is invalid or has expired.', 404);
      return noStore(res).json({
        ok: true,
        shareToken: token,
        proposal: {
          id: proposal.id,
          leagueId: proposal.leagueId,
          season: proposal.season,
          sender: proposal.revision?.snapshot?.sender,
          recipient: proposal.revision?.snapshot?.recipient,
          currentRevision: proposal.currentRevision,
          expiresAt: proposal.expiresAt,
          updatedAt: proposal.updatedAt,
          acceptedAt: proposal.acceptedAt,
          status: proposal.status,
          sleeperOutcome: proposal.sleeperOutcome,
          sleeperMatch: proposal.sleeperMatch,
          revision: proposal.revision,
        },
      });
    } catch (error) {
      return sendError(res, error, 'Could not load the shared trade proposal.');
    }
  });

  router.post('/:token/claim', async (req, res) => {
    try {
      const currentStore = getStore();
      const token = String(req.params.token ?? '').trim();
      const proposal = currentStore.getProposalByShareToken(token);
      if (!proposal) throw requestError('This trade proposal link is invalid or has expired.', 404);
      const sleeperUserId = normalizeId(req.body?.sleeperUserId ?? req.body?.sleeper_user_id, 'Sleeper user ID');
      const maps = getBoundaryMaps(await getApi().getLeagueBoundary(proposal.leagueId), proposal.leagueId, proposal.season);
      const participant = assertParticipant(maps, sleeperUserId, req.body?.rosterId ?? req.body?.roster_id, 'Your roster');
      if (![proposal.senderUserId, proposal.recipientUserId].includes(participant.userId)) {
        throw requestError('Only the two participants in this trade can open it.', 403, 'participant-mismatch');
      }
      const sessionToken = generateTradeProposalToken(randomBytes);
      currentStore.createSession({ tokenHash: hashTradeProposalToken(sessionToken, config.sessionSecret), sleeperUserId, leagueId: proposal.leagueId, season: proposal.season, createdAt: Number(now()) });
      return noStore(res).json({ ok: true, sessionToken, proposal });
    } catch (error) {
      return sendError(res, error, 'Could not claim this shared trade proposal.');
    }
  });

  return router;
}
