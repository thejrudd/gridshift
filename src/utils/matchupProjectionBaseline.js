export const MATCHUP_PROJECTION_BASELINE_STORAGE_KEY = 'gridshift-matchup-projection-baselines-v2:';
export const MATCHUP_PROJECTION_BASELINE_LIMIT = 400;

let memoryStore = {};
const unavailableStores = new WeakSet();

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

export function scoringFingerprint(scoringSettings = null) {
  return JSON.stringify(stable(scoringSettings ?? {}));
}

export function baselineScope({ leagueId, season, week, playerId, scoringSettings, scoringFingerprint: fingerprint } = {}) {
  return JSON.stringify([leagueId, season, week, playerId].map(value => String(value ?? '')).concat(fingerprint ?? scoringFingerprint(scoringSettings)));
}

function getStorage(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

function validRecord(key, value) {
  if (!value || !value.leagueId || !value.season || !value.week || value.playerId == null || typeof value.scoringFingerprint !== 'string') return false;
  const score = value.projection?.projected;
  return typeof score === 'number' && Number.isFinite(score)
    && typeof value.capturedAt === 'number' && Number.isFinite(value.capturedAt)
    && value.capturedAt < Date.parse(value.kickoff ?? '')
    && key === baselineScope(value);
}

function observationKey(snapshot) {
  return `${MATCHUP_PROJECTION_BASELINE_STORAGE_KEY}${encodeURIComponent(baselineScope(snapshot))}:${snapshot.capturedAt}`;
}

function readObservations(target) {
  const keys = Array.from({ length: target.length }, (_, index) => target.key(index))
    .filter(key => key?.startsWith(MATCHUP_PROJECTION_BASELINE_STORAGE_KEY));
  return keys.flatMap(key => {
    try {
      const snapshot = JSON.parse(target.getItem(key));
      return validRecord(baselineScope(snapshot ?? {}), snapshot) && key === observationKey(snapshot)
        ? [[key, snapshot]] : [];
    } catch { return []; }
  });
}

function newestByScope(observations) {
  const newest = {};
  for (const [, snapshot] of observations) {
    const key = baselineScope(snapshot);
    if (!newest[key] || snapshot.capturedAt >= newest[key].capturedAt) newest[key] = snapshot;
  }
  return Object.fromEntries(Object.entries(newest).sort((a, b) => a[1].capturedAt - b[1].capturedAt).slice(-MATCHUP_PROJECTION_BASELINE_LIMIT));
}

function readAll(storage) {
  const target = getStorage(storage);
  if (!target?.getItem || unavailableStores.has(target)) return memoryStore;
  try { return newestByScope(readObservations(target)); } catch { return memoryStore; }
}

// Each observation has its own key. Concurrent tabs never replace an aggregate
// store or overwrite a newer timestamp. Pruning removes only keys actually read.
function writeSnapshots(snapshots, storage) {
  memoryStore = newestByScope([...Object.entries(readAll(storage)), ...snapshots.map(snapshot => [observationKey(snapshot), snapshot])]);
  const target = getStorage(storage);
  if (!target?.setItem) return;
  try {
    for (const snapshot of snapshots) target.setItem(observationKey(snapshot), JSON.stringify(snapshot));
    const observations = readObservations(target);
    const keep = new Set(Object.values(newestByScope(observations)).map(observationKey));
    for (const [key] of observations) if (!keep.has(key)) target.removeItem(key);
    unavailableStores.delete(target);
  } catch { unavailableStores.add(target); }
}

export function getMatchupProjectionBaselines({ storage } = {}) {
  return readAll(storage);
}

function createSnapshot({ leagueId, season, week, playerId, scoringSettings, projection, scheduleEntry, gameStarted = false, nowMs = Date.now() }) {
  const kickoffMs = Date.parse(scheduleEntry?.kickoff ?? '');
  const status = String(scheduleEntry?.state ?? scheduleEntry?.status ?? '').toLowerCase();
  if (!leagueId || season == null || week == null || playerId == null || !Number.isFinite(nowMs)
    || !Number.isFinite(kickoffMs) || kickoffMs <= nowMs || gameStarted || scheduleEntry?.completed === true
    || /final|post|complete|live|in_progress|inprogress|^in$/.test(status)) return null;
  const score = projection?.projected;
  if (score == null || score === '' || !Number.isFinite(Number(score))) return null;
  return {
    projection: JSON.parse(JSON.stringify({ ...projection, projected: Number(score) })),
    capturedAt: nowMs, kickoff: scheduleEntry.kickoff,
    leagueId: String(leagueId), season: String(season), week: String(week), playerId: String(playerId),
    scoringFingerprint: scoringFingerprint(scoringSettings),
  };
}

export function captureMatchupProjectionBaseline(options = {}) {
  const snapshot = createSnapshot(options);
  if (!snapshot) return null;
  writeSnapshots([snapshot], options.storage);
  return snapshot;
}

// Batch pruning once for the whole matchup, after writing its observations.
export function captureMatchupProjectionBaselines({ players = [], ...scope } = {}) {
  const snapshots = players.filter(player => player?.id).map(player => createSnapshot({
    ...scope, playerId: player.id, projection: player.projection,
    scheduleEntry: player.scheduleEntry, gameStarted: player.gameStarted,
  })).filter(Boolean);
  if (snapshots.length) writeSnapshots(snapshots, scope.storage);
}

export function getMatchupProjectionBaseline(scope, { storage } = {}) {
  return readAll(storage)[baselineScope(scope)] ?? null;
}

export function selectMatchupProjectionBaselines(all, { leagueId, season, week, scoringSettings }) {
  const fingerprint = scoringFingerprint(scoringSettings);
  return Object.fromEntries(Object.values(all).filter(record => record.leagueId === String(leagueId)
    && record.season === String(season) && record.week === String(week)
    && record.scoringFingerprint === fingerprint).map(record => [record.playerId, record]));
}

// Every recorded pregame projection for one player across the season, keyed by
// week. Only weeks whose kickoff was observed pregame have a record, so callers
// treat a missing week as "not recorded" rather than "no projection existed".
export function selectPlayerProjectionBaselineWeeks(all, { leagueId, season, playerId, scoringSettings }) {
  if (playerId == null) return {};
  const fingerprint = scoringFingerprint(scoringSettings);
  return Object.fromEntries(Object.values(all ?? {}).filter(record => record.leagueId === String(leagueId)
    && record.season === String(season) && record.playerId === String(playerId)
    && record.scoringFingerprint === fingerprint)
    .map(record => [Number(record.week), Number(record.projection?.projected)])
    .filter(([week, projected]) => Number.isFinite(week) && Number.isFinite(projected)));
}

export function summarizeRecordedPregameProjection(players, baselines) {
  const rosterPlayers = (players ?? []).filter((player) => player?.id && player?.name !== 'Empty');
  if (!rosterPlayers.length) return null;
  const projectedPlayers = rosterPlayers
    .map((player) => baselines?.[String(player.id)])
    .filter((baseline) => ['balldontlie', 'sleeper'].includes(baseline?.projection?.factors?.source))
    .map((baseline) => Number(baseline.projection.projected))
    .filter(Number.isFinite);
  if (!projectedPlayers.length) return null;
  return {
    total: Math.round(projectedPlayers.reduce((sum, value) => sum + value, 0) * 10) / 10,
    projectedCount: projectedPlayers.length,
    starterCount: rosterPlayers.length,
    complete: projectedPlayers.length === rosterPlayers.length,
  };
}

export function summarizeBdlProjection(players) {
  return summarizeProjectionSources(players, new Set(['balldontlie']));
}

export function summarizeExternalProjection(players) {
  return summarizeProjectionSources(players, new Set(['balldontlie', 'sleeper']));
}

function summarizeProjectionSources(players, sources) {
  const rosterPlayers = (players ?? []).filter((player) => player?.id && player?.name !== 'Empty');
  if (!rosterPlayers.length) return null;
  const projectedPlayers = rosterPlayers
    .map((player) => player.projection)
    .filter((projection) => sources.has(projection?.factors?.source))
    .map((projection) => Number(projection.projected))
    .filter(Number.isFinite);
  if (!projectedPlayers.length) return null;
  return {
    total: Math.round(projectedPlayers.reduce((sum, value) => sum + value, 0) * 10) / 10,
    projectedCount: projectedPlayers.length,
    starterCount: rosterPlayers.length,
    complete: projectedPlayers.length === rosterPlayers.length,
  };
}

export function clearMatchupProjectionBaselines({ storage } = {}) {
  memoryStore = {};
  const target = getStorage(storage);
  try { for (const [key] of readObservations(target)) target.removeItem(key); } catch { /* memory is cleared even if storage is blocked */ }
  if (target) unavailableStores.delete(target);
}
