import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTradeProposalRouter, createTradeShareApiRouter, createTradeShareRouter, resolveTradeExpiryAt } from '../../server/tradeProposalHandlers.js';
import { getTradeProposalConfig } from '../../server/tradeProposalConfig.js';
import { createTradeProposalStore } from '../../server/tradeProposalStore.js';
import {
  buildTradeProposalSnapshot,
  buildTradeProposalSnapshotFromCurrentPerspective,
  formatTradeProposalExpiry,
  formatTradeProposalEventTime,
  getTradeAssetFingerprint,
  getTradeProposalAssetValue,
  getTradeProposalCountdown,
  getTradeProposalDisplayStatus,
  getTradeProposalTerminalEvent,
  getSleeperLeagueUrl,
  hasTradeProposalAssets,
  swapTradeProposalPerspective,
} from '../../src/utils/tradeProposal.js';

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gridshift-trade-proposal-'));
}

function enabledConfig(dataDir, overrides = {}) {
  return {
    enabled: true,
    ready: true,
    production: false,
    sessionSecret: 'trade-proposal-test-secret',
    dataDir,
    maxPayloadBytes: 64 * 1024,
    tombstoneRetentionMs: 30 * 24 * 60 * 60 * 1_000,
    sessionRetentionMs: 90 * 24 * 60 * 60 * 1_000,
    ...overrides,
  };
}

function getRouteHandler(router, routePath, method) {
  const route = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods?.[method])?.route;
  const handler = route?.stack.find((layer) => layer.method === method)?.handle;
  assert.equal(typeof handler, 'function');
  return handler;
}

async function invoke(router, routePath, method, { body = {}, query = {}, token, params = {}, headers = {} } = {}) {
  const captured = { statusCode: 200, headers: {}, body: null, sent: null };
  const response = {
    status(statusCode) { captured.statusCode = statusCode; return this; },
    set(name, value) { captured.headers[String(name).toLowerCase()] = String(value); return this; },
    type(value) { captured.type = value; return this; },
    json(payload) { captured.body = payload; return this; },
    send(payload) { captured.sent = payload; return this; },
  };
  const request = {
    body,
    query,
    params,
    ip: '127.0.0.1',
    secure: false,
    protocol: 'http',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  };
  await getRouteHandler(router, routePath, method)(request, response);
  return { response: captured, body: captured.body };
}

function boundary() {
  return {
    league: { league_id: 'league-1', season: '2026', name: 'Test League', settings: { waiver_budget: 100 } },
    users: [
      { user_id: 'user-1', display_name: 'One', metadata: { team_name: 'One Team' } },
      { user_id: 'user-2', display_name: 'Two', metadata: { team_name: 'Two Team' } },
      { user_id: 'user-3', display_name: 'Three', metadata: { team_name: 'Three Team' } },
    ],
    rosters: [
      { roster_id: 1, owner_id: 'user-1', players: ['player-1'], settings: { waiver_budget_used: 0 } },
      { roster_id: 2, owner_id: 'user-2', players: ['player-2'], settings: { waiver_budget_used: 0 } },
      { roster_id: 3, owner_id: 'user-3', players: ['player-3'], settings: { waiver_budget_used: 0 } },
    ],
    tradedPicks: [],
  };
}

function snapshot() {
  return buildTradeProposalSnapshot({
    leagueId: 'league-1',
    season: '2026',
    sender: { userId: 'user-1', rosterId: '1', name: 'One', teamName: 'One Team' },
    recipient: { userId: 'user-2', rosterId: '2', name: 'Two', teamName: 'Two Team' },
    senderAssets: [{ type: 'player', id: 'player-1', label: 'Player One', position: 'QB', team: 'ARI', value: 100 }],
    recipientAssets: [{ type: 'player', id: 'player-2', label: 'Player Two', position: 'WR', team: 'BUF', value: 95 }],
    totals: { sender: 100, recipient: 95 },
    verdict: { verdict: 'Fair Deal', gap: 5, pct: 5 },
  });
}

function counterSnapshot() {
  return buildTradeProposalSnapshot({
    leagueId: 'league-1',
    season: '2026',
    sender: { userId: 'user-2', rosterId: '2', name: 'Two', teamName: 'Two Team' },
    recipient: { userId: 'user-1', rosterId: '1', name: 'One', teamName: 'One Team' },
    senderAssets: [{ type: 'player', id: 'player-2', label: 'Player Two', position: 'WR', team: 'BUF', value: 95 }],
    recipientAssets: [{ type: 'player', id: 'player-1', label: 'Player One', position: 'QB', team: 'ARI', value: 100 }],
    totals: { sender: 95, recipient: 100 },
    verdict: { verdict: 'Fair Deal', gap: 5, pct: 5 },
  });
}

test('Trade proposal expiry accepts only the bounded presets', () => {
  const now = Date.UTC(2026, 0, 1, 12);
  assert.equal(resolveTradeExpiryAt('hour', now), now + 60 * 60 * 1_000);
  assert.equal(resolveTradeExpiryAt('week', now), now + 7 * 24 * 60 * 60 * 1_000);
  assert.equal(resolveTradeExpiryAt('end_of_day', now, 'Pacific/Auckland'), Date.UTC(2026, 0, 2, 11));
  assert.equal(resolveTradeExpiryAt('end_of_day', now, 'America/Los_Angeles'), Date.UTC(2026, 0, 2, 8));
  assert.throws(() => resolveTradeExpiryAt('never', now), /one hour and one week/);
  assert.throws(() => resolveTradeExpiryAt('month', now), /one hour and one week/);
});

test('direct-host development uses writable Trade proposal storage by default', () => {
  const config = getTradeProposalConfig({ env: { NODE_ENV: 'development', GRIDSHIFT_SESSION_SECRET: 'test-secret' } });
  assert.notEqual(config.dataDir, '/data');
  assert.match(config.dataDir, /gridshift-trade-proposals$/);
});

test('Trade proposal storage failures return a stable kind without filesystem details', async () => {
  let attempts = 0;
  const injectedConfig = enabledConfig(temporaryDirectory());
  const storeFactory = () => {
    attempts += 1;
    throw Object.assign(new Error('EPERM: mkdir /data'), { code: 'EPERM' });
  };
  const router = createTradeProposalRouter({
    injectedConfig,
    storeFactory,
  });
  const shareApiRouter = createTradeShareApiRouter({
    injectedConfig,
    storeFactory,
  });
  const shareRouter = createTradeShareRouter({
    injectedConfig,
    storeFactory,
  });
  const first = await invoke(router, '/session', 'post');
  const second = await invoke(router, '/session', 'post');
  assert.equal(first.response.statusCode, 503);
  assert.equal(first.body.kind, 'storage-unavailable');
  assert.equal(first.body.error, 'Trade proposal storage is unavailable.');
  assert.equal(second.response.statusCode, 503);
  assert.equal(attempts, 1);

  const publicShare = await invoke(shareApiRouter, '/:token', 'get', { params: { token: 'share-token' } });
  assert.equal(publicShare.response.statusCode, 503);
  assert.equal(publicShare.body.kind, 'storage-unavailable');
  assert.equal(publicShare.body.error, 'Trade proposal storage is unavailable.');

  const shareHtml = await invoke(shareRouter, '/:token', 'get', { params: { token: 'share-token' } });
  assert.equal(shareHtml.response.statusCode, 503);
  assert.doesNotMatch(shareHtml.response.sent, /EPERM|\/data/);
});

test('Trade proposal snapshots preserve full asset identity and fingerprint keys', () => {
  const value = snapshot();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.sender.assets[0].label, 'Player One');
  assert.equal(value.recipient.assets[0].fromRosterId, '2');
  assert.equal(getTradeAssetFingerprint(value.sender.assets[0]), 'player:player-1');
  assert.equal(getTradeAssetFingerprint({ type: 'pick', year: '2027', round: 2, originalRosterId: '1' }), 'pick:2027:2:1');
});

test('Counter snapshots make the acting participant the new sender', () => {
  const value = buildTradeProposalSnapshotFromCurrentPerspective({
    leagueId: 'league-1',
    season: '2026',
    currentParticipant: { userId: 'user-2', rosterId: '2', name: 'Two', teamName: 'Two Team' },
    partnerParticipant: { userId: 'user-1', rosterId: '1', name: 'One', teamName: 'One Team' },
    currentSide: { total: 95, items: [{ type: 'player', id: 'player-2', label: 'Player Two', position: 'WR', team: 'BUF', value: 95 }] },
    partnerSide: { total: 100, items: [{ type: 'player', id: 'player-1', label: 'Player One', position: 'QB', team: 'ARI', value: 100 }] },
    verdict: { verdict: 'Fair Deal', gap: 5, pct: 5 },
  });
  assert.equal(value.sender.userId, 'user-2');
  assert.equal(value.sender.assets[0].id, 'player-2');
  assert.equal(value.sender.assets[0].fromRosterId, '2');
  assert.equal(value.sender.assets[0].toRosterId, '1');
  assert.equal(value.recipient.userId, 'user-1');
  assert.equal(value.recipient.assets[0].id, 'player-1');
});

test('Trade proposal display perspective swaps manager sides and totals without changing the trade assets', () => {
  const value = swapTradeProposalPerspective(snapshot());
  assert.equal(value.sender.userId, 'user-2');
  assert.equal(value.sender.assets[0].id, 'player-2');
  assert.equal(value.sender.assets[0].fromRosterId, '2');
  assert.equal(value.recipient.userId, 'user-1');
  assert.equal(value.recipient.assets[0].id, 'player-1');
  assert.equal(value.totals.sender, 95);
  assert.equal(value.totals.recipient, 100);
});

test('Trade proposal display helpers keep current values separate from the sent snapshot', () => {
  const asset = { type: 'player', id: 'player-1', value: 100 };
  assert.equal(getTradeProposalAssetValue(asset, () => 112), 112);
  assert.equal(getTradeProposalAssetValue(asset, () => null), 100);
  assert.deepEqual(getTradeProposalCountdown('2026-01-01T12:00:05.000Z', Date.UTC(2026, 0, 1, 12)), {
    expired: false,
    label: '5s',
    remainingMs: 5_000,
  });
  assert.equal(
    getTradeProposalCountdown('2026-01-01T12:02:05.000Z', Date.UTC(2026, 0, 1, 12)).label,
    '2m 5s',
  );
  assert.match(formatTradeProposalExpiry('2026-01-01T12:00:00.000Z', 'Pacific/Auckland'), /GMT\+13/);
  assert.match(formatTradeProposalEventTime('2026-01-01T12:00:00.000Z'), /2026/);
  assert.deepEqual(getTradeProposalTerminalEvent({ status: 'declined', updatedAt: 1234 }), { label: 'Declined', timestamp: 1234 });
  assert.deepEqual(getTradeProposalTerminalEvent({ status: 'accepted', acceptedAt: 4321, updatedAt: 1234, sleeperMatch: { timestamp: 5678 } }), { label: 'Accepted', timestamp: 4321 });
  assert.deepEqual(getTradeProposalTerminalEvent({ status: 'accepted', updatedAt: 1234, sleeperMatch: { timestamp: 5678 } }), { label: 'Accepted', timestamp: 1234 });
  assert.deepEqual(getTradeProposalTerminalEvent({ status: 'pending', sleeperOutcome: 'completed', updatedAt: 1234, sleeperMatch: { timestamp: 5678 } }), { label: 'Completed', timestamp: 5678 });
  assert.equal(getTradeProposalTerminalEvent({ status: 'countered', updatedAt: 1234 }), null);
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'pending', viewerIsCurrentAuthor: true }), { label: 'Proposed', tone: 'proposed' });
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'pending' }), { label: 'Awaiting response', tone: 'awaiting' });
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'countered', viewerIsCurrentAuthor: true }), { label: 'Countered', tone: 'countered' });
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'accepted' }), { label: 'Accepted', tone: 'accepted' });
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'accepted', sleeperOutcome: 'completed' }), { label: 'Completed', tone: 'completed' });
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'pending', sleeperOutcome: 'completed' }), { label: 'Completed', tone: 'completed' });
  assert.deepEqual(getTradeProposalDisplayStatus({ status: 'declined' }), { label: 'Trade declined', tone: 'declined' });
});

test('Trade proposal surfaces reject incomplete snapshots without inventing an empty trade', () => {
  assert.equal(hasTradeProposalAssets(snapshot()), true);
  assert.equal(hasTradeProposalAssets({ sender: { assets: [] }, recipient: { assets: [] } }), false);
  assert.equal(hasTradeProposalAssets({ sender: { assets: [{ type: 'player' }] } }), false);
});

test('Sleeper handoff URLs stay on the known league route', () => {
  assert.equal(getSleeperLeagueUrl('league-1'), 'https://sleeper.com/leagues/league-1');
  assert.equal(getSleeperLeagueUrl('league/with spaces'), 'https://sleeper.com/leagues/league%2Fwith%20spaces');
  assert.equal(getSleeperLeagueUrl(''), null);
});

test('Trade proposal store deletes expired payloads while retaining a small tombstone', () => {
  const dataDir = temporaryDirectory();
  const store = createTradeProposalStore({ config: enabledConfig(dataDir), now: () => 1_000 });
  try {
    store.createProposal({
      proposalId: 'proposal-1',
      shareTokenHash: 'share-hash-1',
      leagueId: 'league-1', season: '2026',
      senderUserId: 'user-1', senderRosterId: '1',
      recipientUserId: 'user-2', recipientRosterId: '2',
      snapshot: { fingerprint: 'fingerprint-1', fingerprintData: { senderAssets: ['player:player-1'] } },
      fingerprint: 'fingerprint-1', fingerprintData: { senderAssets: ['player:player-1'] },
      expiresAt: 900, createdAt: 500, eventId: 'event-1',
    });
    assert.equal(store.pruneExpired(1_000).expired, 1);
    assert.equal(store.getProposal('proposal-1'), null);
    assert.equal(store.getTombstone('proposal-1').fingerprint, 'fingerprint-1');
    assert.equal(store.pruneExpired(2_000).purged, 0);
    assert.equal(store.getTombstone('proposal-1').proposalId, 'proposal-1');
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Trade proposal API enforces exact league membership, participant scope, contextual status actions, and decline', async () => {
  const dataDir = temporaryDirectory();
  let now = 10_000;
  const config = enabledConfig(dataDir);
  const store = createTradeProposalStore({ config, now: () => now });
  const api = {
    getLeagueBoundary: async (leagueId) => leagueId === 'league-1' ? boundary() : { ...boundary(), league: { ...boundary().league, league_id: leagueId } },
    getTransactions: async () => [],
  };
  const router = createTradeProposalRouter({ injectedConfig: config, store, sleeperApi: api, now: () => now });
  const shareApiRouter = createTradeShareApiRouter({ injectedConfig: config, store, sleeperApi: api, now: () => now });
  const shareRouter = createTradeShareRouter({ injectedConfig: config, store, now: () => now });
  try {
    const sessionOne = await invoke(router, '/session', 'post', { body: { leagueId: 'league-1', season: '2026', sleeperUserId: 'user-1', rosterId: '1' } });
    const sessionTwo = await invoke(router, '/session', 'post', { body: { leagueId: 'league-1', season: '2026', sleeperUserId: 'user-2', rosterId: '2' } });
    assert.equal(sessionOne.response.statusCode, 200);
    assert.equal(sessionTwo.response.statusCode, 200);

    const created = await invoke(router, '/proposals', 'post', {
      token: sessionOne.body.sessionToken,
      body: { leagueId: 'league-1', season: '2026', senderRosterId: '1', recipientUserId: 'user-2', recipientRosterId: '2', snapshot: snapshot(), expiryPreset: 'hour', timeZone: 'Pacific/Auckland' },
      headers: { host: 'gridshift.test' },
    });
    assert.equal(created.response.statusCode, 201);
    assert.match(created.body.shareUrl, /\/trade\/share\//);
    assert.equal(created.body.proposal.status, 'pending');
    assert.equal(created.body.proposal.revision.senderTimeZone, 'Pacific/Auckland');

    const withdrawByRecipient = await invoke(router, '/proposals/:proposalId/withdraw', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(withdrawByRecipient.response.statusCode, 403);

    const publicShare = await invoke(shareApiRouter, '/:token', 'get', { params: { token: created.body.shareToken } });
    assert.equal(publicShare.response.statusCode, 200);
    assert.equal(publicShare.body.proposal.sender.assets[0].id, 'player-1');
    assert.equal(publicShare.body.proposal.sender.assets[0].value, 100);

    const unauthorizedClaim = await invoke(shareApiRouter, '/:token/claim', 'post', {
      params: { token: created.body.shareToken },
      body: { sleeperUserId: 'user-3', rosterId: '3' },
    });
    assert.equal(unauthorizedClaim.response.statusCode, 403);

    const claimed = await invoke(shareApiRouter, '/:token/claim', 'post', {
      params: { token: created.body.shareToken },
      body: { sleeperUserId: 'user-2', rosterId: '2' },
    });
    assert.equal(claimed.response.statusCode, 200);
    assert.ok(claimed.body.sessionToken);

    const shareHtml = await invoke(shareRouter, '/:token', 'get', {
      params: { token: created.body.shareToken },
      headers: { host: 'gridshift.test', 'x-forwarded-proto': 'https' },
    });
    assert.equal(shareHtml.response.statusCode, 200);
    assert.equal(shareHtml.response.type, 'html');
    assert.match(shareHtml.response.sent, /https:\/\/gridshift\.test\/trade\/share\//);

    const inbox = await invoke(router, '/inbox', 'get', { token: sessionTwo.body.sessionToken });
    assert.equal(inbox.response.statusCode, 200);
    assert.equal(inbox.body.proposals.length, 1);
    assert.equal(inbox.body.unreadCount, 1);
    assert.equal(inbox.body.proposals[0].revision.number, 1);
    assert.equal(inbox.body.proposals[0].revision.authorUserId, 'user-1');
    assert.equal(inbox.body.proposals[0].revision.snapshot.sender.assets[0].id, 'player-1');
    assert.equal(inbox.body.proposals[0].revision.snapshot.recipient.assets[0].id, 'player-2');

    const senderInbox = await invoke(router, '/inbox', 'get', { token: sessionOne.body.sessionToken });
    assert.equal(senderInbox.response.statusCode, 200);
    assert.equal(senderInbox.body.proposals.length, 1);
    assert.equal(senderInbox.body.proposals[0].revision.snapshot.sender.assets[0].id, 'player-1');

    const loadedForCounter = await invoke(router, '/proposals/:proposalId', 'get', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(loadedForCounter.response.statusCode, 200);
    assert.equal(loadedForCounter.body.proposal.revision.snapshot.sender.assets[0].id, 'player-1');
    assert.equal(loadedForCounter.body.proposal.revision.snapshot.recipient.assets[0].id, 'player-2');

    const crossLeague = await invoke(router, '/proposals', 'post', {
      token: sessionOne.body.sessionToken,
      body: { leagueId: 'league-2', season: '2026', senderRosterId: '1', recipientUserId: 'user-2', recipientRosterId: '2', snapshot: snapshot(), expiryPreset: 'hour' },
    });
    assert.equal(crossLeague.response.statusCode, 403);

    const counter = await invoke(router, '/proposals/:proposalId/counter', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { expectedRevision: 1, expiryPreset: 'day', snapshot: counterSnapshot(), timeZone: 'America/Los_Angeles' },
    });
    assert.equal(counter.response.statusCode, 200);
    assert.equal(counter.body.proposal.currentRevision, 2);
    assert.equal(counter.body.proposal.status, 'countered');
    assert.equal(counter.body.proposal.revision.snapshot.sender.userId, 'user-2');
    assert.equal(counter.body.proposal.revision.snapshot.sender.assets[0].id, 'player-2');
    assert.equal(counter.body.proposal.revision.snapshot.recipient.userId, 'user-1');

    const withdrawByPreviousAuthor = await invoke(router, '/proposals/:proposalId/withdraw', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(withdrawByPreviousAuthor.response.statusCode, 403);

    const inboxAfterCounter = await invoke(router, '/inbox', 'get', { token: sessionOne.body.sessionToken });
    assert.equal(inboxAfterCounter.response.statusCode, 200);
    assert.equal(inboxAfterCounter.body.proposals[0].currentRevision, 2);
    assert.equal(inboxAfterCounter.body.proposals[0].revision.authorUserId, 'user-2');
    assert.equal(inboxAfterCounter.body.proposals[0].revision.senderTimeZone, 'America/Los_Angeles');
    assert.equal(inboxAfterCounter.body.proposals[0].revision.snapshot.sender.name, 'Two');
    assert.equal(inboxAfterCounter.body.proposals[0].revision.snapshot.sender.assets[0].id, 'player-2');
    assert.equal(inboxAfterCounter.body.events[0].type, 'counter_received');

    const counterBack = await invoke(router, '/proposals/:proposalId/counter', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { expectedRevision: 2, expiryPreset: 'day', snapshot: snapshot(), timeZone: 'Pacific/Auckland' },
    });
    assert.equal(counterBack.response.statusCode, 200);
    assert.equal(counterBack.body.proposal.currentRevision, 3);
    assert.equal(counterBack.body.proposal.status, 'countered');
    assert.equal(counterBack.body.proposal.revision.authorUserId, 'user-1');
    assert.equal(counterBack.body.proposal.revision.snapshot.sender.userId, 'user-1');
    assert.equal(counterBack.body.proposal.revision.snapshot.sender.assets[0].id, 'player-1');
    assert.equal(counterBack.body.proposal.revision.snapshot.recipient.userId, 'user-2');

    const withdrawByPreviousCounterAuthor = await invoke(router, '/proposals/:proposalId/withdraw', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(withdrawByPreviousCounterAuthor.response.statusCode, 403);

    const counteredProposal = await invoke(router, '/proposals', 'post', {
      token: sessionOne.body.sessionToken,
      body: { leagueId: 'league-1', season: '2026', senderRosterId: '1', recipientUserId: 'user-2', recipientRosterId: '2', snapshot: snapshot(), expiryPreset: 'hour' },
    });
    assert.equal(counteredProposal.response.statusCode, 201);
    const counteredForWithdraw = await invoke(router, '/proposals/:proposalId/counter', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: counteredProposal.body.proposal.id },
      body: { expectedRevision: 1, expiryPreset: 'day', snapshot: counterSnapshot() },
    });
    assert.equal(counteredForWithdraw.response.statusCode, 200);
    const withdrawnByLatestAuthor = await invoke(router, '/proposals/:proposalId/withdraw', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: counteredProposal.body.proposal.id },
    });
    assert.equal(withdrawnByLatestAuthor.response.statusCode, 200);
    assert.equal(withdrawnByLatestAuthor.body.proposal.status, 'withdrawn');

    const declinedByAuthor = await invoke(router, '/proposals/:proposalId/decline', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(declinedByAuthor.response.statusCode, 403);

    const declined = await invoke(router, '/proposals/:proposalId/decline', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(declined.response.statusCode, 200);
    assert.equal(declined.body.proposal.status, 'declined');

    now += 10;
    const afterDecline = await invoke(router, '/proposals/:proposalId/counter', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { expectedRevision: 3, expiryPreset: 'day', snapshot: counterSnapshot() },
    });
    assert.equal(afterDecline.response.statusCode, 409);
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Trade proposal acceptance notifies the other manager and gates the Sleeper completion flow', async () => {
  const dataDir = temporaryDirectory();
  let now = 20_000;
  const config = enabledConfig(dataDir);
  const store = createTradeProposalStore({ config, now: () => now });
  const api = {
    getLeagueBoundary: async () => boundary(),
    getTransactions: async () => [],
  };
  const router = createTradeProposalRouter({ injectedConfig: config, store, sleeperApi: api, now: () => now });
  try {
    const sessionOne = await invoke(router, '/session', 'post', { body: { leagueId: 'league-1', season: '2026', sleeperUserId: 'user-1', rosterId: '1' } });
    const sessionTwo = await invoke(router, '/session', 'post', { body: { leagueId: 'league-1', season: '2026', sleeperUserId: 'user-2', rosterId: '2' } });
    const created = await invoke(router, '/proposals', 'post', {
      token: sessionOne.body.sessionToken,
      body: { leagueId: 'league-1', season: '2026', senderRosterId: '1', recipientUserId: 'user-2', recipientRosterId: '2', snapshot: snapshot(), expiryPreset: 'week' },
    });
    assert.equal(created.response.statusCode, 201);

    const acceptByAuthor = await invoke(router, '/proposals/:proposalId/accept', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(acceptByAuthor.response.statusCode, 403);

    const accepted = await invoke(router, '/proposals/:proposalId/accept', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(accepted.response.statusCode, 200);
    assert.equal(accepted.body.proposal.status, 'accepted');
    assert.equal(accepted.body.proposal.acceptedByUserId, 'user-2');
    assert.equal(accepted.body.proposal.acceptedAt, 20_000);

    const senderInbox = await invoke(router, '/inbox', 'get', { token: sessionOne.body.sessionToken });
    assert.equal(senderInbox.body.unreadCount, 1);
    assert.equal(senderInbox.body.events[0].type, 'trade_accepted');
    assert.equal(senderInbox.body.events[0].payload.actorUserId, 'user-2');
    const acceptingInbox = await invoke(router, '/inbox', 'get', { token: sessionTwo.body.sessionToken });
    assert.equal(acceptingInbox.body.events[0].type, 'proposal_received');
    assert.equal(acceptingInbox.body.events.some((event) => event.type === 'trade_accepted'), false);

    const repeatedAccept = await invoke(router, '/proposals/:proposalId/accept', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(repeatedAccept.response.statusCode, 409);
    const counterAfterAccept = await invoke(router, '/proposals/:proposalId/counter', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { expectedRevision: 1, expiryPreset: 'day', snapshot: counterSnapshot() },
    });
    assert.equal(counterAfterAccept.response.statusCode, 409);
    const reconcileByOtherManager = await invoke(router, '/proposals/:proposalId/reconcile', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(reconcileByOtherManager.response.statusCode, 403);

    const reconcileByAcceptor = await invoke(router, '/proposals/:proposalId/reconcile', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(reconcileByAcceptor.response.statusCode, 200);
    assert.equal(reconcileByAcceptor.body.match, null);

    const markDoneByOtherManager = await invoke(router, '/proposals/:proposalId/completion', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { outcome: 'completed' },
    });
    assert.equal(markDoneByOtherManager.response.statusCode, 403);
    now = 21_000;
    const markedDone = await invoke(router, '/proposals/:proposalId/completion', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { outcome: 'completed' },
    });
    assert.equal(markedDone.response.statusCode, 200);
    assert.equal(markedDone.body.proposal.status, 'accepted');
    assert.equal(markedDone.body.proposal.sleeperOutcome, 'completed');
    assert.equal(markedDone.body.proposal.acceptedAt, 20_000);

    const senderDoneEvent = await invoke(router, '/inbox', 'get', { token: sessionOne.body.sessionToken });
    assert.equal(senderDoneEvent.body.events[0].type, 'trade_marked_completed');
    now += 8 * 24 * 60 * 60 * 1_000;
    const retainedAccepted = await invoke(router, '/inbox', 'get', { token: sessionTwo.body.sessionToken });
    assert.equal(retainedAccepted.body.proposals[0].status, 'accepted');
    assert.equal(retainedAccepted.body.proposals[0].sleeperOutcome, 'completed');
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Trade proposal acceptance follows the latest counter author and expires with the current offer', async () => {
  const dataDir = temporaryDirectory();
  let now = 30_000;
  const config = enabledConfig(dataDir);
  const store = createTradeProposalStore({ config, now: () => now });
  const api = { getLeagueBoundary: async () => boundary(), getTransactions: async () => [] };
  const router = createTradeProposalRouter({ injectedConfig: config, store, sleeperApi: api, now: () => now });
  try {
    const sessionOne = await invoke(router, '/session', 'post', { body: { leagueId: 'league-1', season: '2026', sleeperUserId: 'user-1', rosterId: '1' } });
    const sessionTwo = await invoke(router, '/session', 'post', { body: { leagueId: 'league-1', season: '2026', sleeperUserId: 'user-2', rosterId: '2' } });
    const created = await invoke(router, '/proposals', 'post', {
      token: sessionOne.body.sessionToken,
      body: { leagueId: 'league-1', season: '2026', senderRosterId: '1', recipientUserId: 'user-2', recipientRosterId: '2', snapshot: snapshot(), expiryPreset: 'week' },
    });
    const countered = await invoke(router, '/proposals/:proposalId/counter', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
      body: { expectedRevision: 1, expiryPreset: 'week', snapshot: counterSnapshot() },
    });
    assert.equal(countered.response.statusCode, 200);
    const counterAuthorAccept = await invoke(router, '/proposals/:proposalId/accept', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(counterAuthorAccept.response.statusCode, 403);
    const accepted = await invoke(router, '/proposals/:proposalId/accept', 'post', {
      token: sessionOne.body.sessionToken,
      params: { proposalId: created.body.proposal.id },
    });
    assert.equal(accepted.response.statusCode, 200);
    assert.equal(accepted.body.proposal.currentRevision, 2);
    assert.equal(accepted.body.proposal.acceptedByUserId, 'user-1');

    const expiring = await invoke(router, '/proposals', 'post', {
      token: sessionOne.body.sessionToken,
      body: { leagueId: 'league-1', season: '2026', senderRosterId: '1', recipientUserId: 'user-2', recipientRosterId: '2', snapshot: snapshot(), expiryPreset: 'hour' },
    });
    now += 60 * 60 * 1_000 + 1;
    const expiredAccept = await invoke(router, '/proposals/:proposalId/accept', 'post', {
      token: sessionTwo.body.sessionToken,
      params: { proposalId: expiring.body.proposal.id },
    });
    assert.equal(expiredAccept.response.statusCode, 410);
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
