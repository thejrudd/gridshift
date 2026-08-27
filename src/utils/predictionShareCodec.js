const SNAPSHOT_SCHEMA = 'gridshift.prediction-snapshot';
const SNAPSHOT_VERSION = 1;
const TOKEN_PREFIX = 'gs1';
const DEFAULT_SHARE_PATH = '/predictions';

const COMPRESSION_DEFLATE = 'd';
const COMPRESSION_NONE = 'n';
const TOKEN_PATTERN = /^gs(\d+)\.([a-z])\.([A-Za-z0-9_-]+)\.([a-f0-9]{8})$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_PRESET_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SLEEPER_USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

export const PREDICTION_SHARE_MAX_TOKEN_LENGTH = 4096;
export const PREDICTION_SHARE_MAX_COMPRESSED_BYTES = 3072;
export const PREDICTION_SHARE_MAX_UNCOMPRESSED_BYTES = 24 * 1024;
export const PREDICTION_SHARE_PATH = DEFAULT_SHARE_PATH;
export const PREDICTION_SHARE_TOKEN_PREFIX = TOKEN_PREFIX;

export const PREDICTION_SHARE_TEAM_IDS = Object.freeze([
  'BUF', 'MIA', 'NE', 'NYJ',
  'BAL', 'CIN', 'CLE', 'PIT',
  'HOU', 'IND', 'JAX', 'TEN',
  'DEN', 'KC', 'LV', 'LAC',
  'DAL', 'NYG', 'PHI', 'WSH',
  'CHI', 'DET', 'GB', 'MIN',
  'ATL', 'CAR', 'NO', 'TB',
  'ARI', 'LAR', 'SF', 'SEA',
]);

export const PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS = Object.freeze([
  'AFC-wc-2-7',
  'AFC-wc-3-6',
  'AFC-wc-4-5',
  'AFC-div-1',
  'AFC-div-2',
  'AFC-championship',
  'NFC-wc-2-7',
  'NFC-wc-3-6',
  'NFC-wc-4-5',
  'NFC-div-1',
  'NFC-div-2',
  'NFC-championship',
  'super-bowl',
]);

const TEAM_ID_SET = new Set(PREDICTION_SHARE_TEAM_IDS);
const TEAM_ID_SET_INDEX = new Map(PREDICTION_SHARE_TEAM_IDS.map((teamId, index) => [teamId, index]));
const PLAYOFF_MATCHUP_ID_SET = new Set(PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS);
const SNAPSHOT_KEYS = new Set([
  'schema',
  'version',
  'season',
  'pickWeek',
  'createdAt',
  'mode',
  'scheduleFingerprint',
  'manager',
  'records',
  'gamePicks',
  'playoffPicks',
]);
const MANAGER_KEYS = new Set(['userId', 'username', 'displayName']);
const RECORD_KEYS = new Set(['wins', 'losses', 'ties', 'divisionWins']);
const PRESENTATION_KEYS = new Set(['titleId', 'themeId', 'cardId', 'format']);
const PRESENTATION_FORMATS = new Set(['square', 'tall']);

export class PredictionShareCodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PredictionShareCodecError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PredictionShareCodecError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) fail('invalid_schema', `${label} must be an object.`);
}

function assertExactKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) fail('invalid_schema', `${label} includes unsupported field "${key}".`);
  }
}

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail('invalid_schema', `${label} must be an integer from ${min} through ${max}.`);
  }
  return value;
}

function assertString(value, { label, min = 1, max, pattern = null, allowEmpty = false }) {
  if (typeof value !== 'string') fail('invalid_schema', `${label} must be text.`);
  if ((!allowEmpty && value.length < min) || value.length > max) {
    fail('invalid_schema', `${label} must be ${allowEmpty ? 'at most' : 'from'} ${allowEmpty ? max : `${min} through ${max}`} characters.`);
  }
  if ([...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  })) fail('invalid_schema', `${label} contains unsupported control characters.`);
  if (pattern && !pattern.test(value)) fail('invalid_schema', `${label} has an unsupported format.`);
  return value;
}

function assertTeamId(value, label) {
  if (typeof value !== 'string' || !TEAM_ID_SET.has(value)) {
    fail('invalid_schema', `${label} must be a supported NFL team ID or T.`);
  }
  return value;
}

function normalizeCreatedAt(value) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('invalid_schema', 'snapshot.createdAt must be an ISO timestamp.');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail('invalid_schema', 'snapshot.createdAt must be an ISO timestamp.');
  const normalized = new Date(timestamp).toISOString();
  if (normalized.slice(0, 4) < '2000' || normalized.slice(0, 4) > '2100') {
    fail('invalid_schema', 'snapshot.createdAt is outside the supported range.');
  }
  return normalized;
}

/**
 * GridShift treats March as the boundary for the next NFL league year. This
 * matches the app's connected-league season selection without relying on a
 * user's currently selected historical fantasy season.
 */
export function getCurrentPredictionShareSeason(date = new Date()) {
  const resolved = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(resolved.getTime())) fail('invalid_date', 'A valid date is required.');
  return resolved.getMonth() >= 2 ? resolved.getFullYear() : resolved.getFullYear() - 1;
}

export function getCreatablePredictionShareSeasons({ now = new Date(), currentSeason } = {}) {
  const season = currentSeason == null
    ? getCurrentPredictionShareSeason(now)
    : assertInteger(Number(currentSeason), 2000, 2100, 'currentSeason');
  return Object.freeze([season, season + 1]);
}

function assertCreatableSeason(season, options) {
  const allowed = getCreatablePredictionShareSeasons(options);
  if (!allowed.includes(season)) {
    fail(
      'season_not_creatable',
      `Prediction shares can only be created for the current or upcoming season (${allowed.join(' or ')}).`,
    );
  }
}

function normalizeManager(manager) {
  assertPlainObject(manager, 'snapshot.manager');
  assertExactKeys(manager, MANAGER_KEYS, 'snapshot.manager');
  return {
    userId: assertString(manager.userId, {
      label: 'snapshot.manager.userId',
      max: 64,
      pattern: SAFE_ID_PATTERN,
    }),
    username: assertString(manager.username, {
      label: 'snapshot.manager.username',
      max: 50,
      pattern: SLEEPER_USERNAME_PATTERN,
    }),
    displayName: assertString(manager.displayName, {
      label: 'snapshot.manager.displayName',
      min: 1,
      max: 80,
    }),
  };
}

function normalizeRecords(records) {
  assertPlainObject(records, 'snapshot.records');
  const recordTeamIds = Object.keys(records);
  if (recordTeamIds.length !== PREDICTION_SHARE_TEAM_IDS.length) {
    fail('incomplete_snapshot', 'snapshot.records must contain all 32 NFL teams.');
  }
  for (const teamId of recordTeamIds) {
    if (!TEAM_ID_SET.has(teamId)) fail('invalid_schema', `snapshot.records includes unsupported team "${teamId}".`);
  }

  return Object.fromEntries(PREDICTION_SHARE_TEAM_IDS.map((teamId) => {
    const record = records[teamId];
    assertPlainObject(record, `snapshot.records.${teamId}`);
    assertExactKeys(record, RECORD_KEYS, `snapshot.records.${teamId}`);
    const wins = assertInteger(record.wins, 0, 17, `snapshot.records.${teamId}.wins`);
    const losses = assertInteger(record.losses, 0, 17, `snapshot.records.${teamId}.losses`);
    const ties = assertInteger(record.ties, 0, 17, `snapshot.records.${teamId}.ties`);
    const divisionWins = assertInteger(record.divisionWins, 0, 6, `snapshot.records.${teamId}.divisionWins`);
    if (wins + losses + ties !== 17) {
      fail('incomplete_snapshot', `snapshot.records.${teamId} must describe all 17 games.`);
    }
    if (divisionWins > wins) {
      fail('invalid_schema', `snapshot.records.${teamId}.divisionWins cannot exceed its wins.`);
    }
    return [teamId, { wins, losses, ties, divisionWins }];
  }));
}

function normalizeGamePicks(gamePicks, mode) {
  assertPlainObject(gamePicks, 'snapshot.gamePicks');
  const entries = Object.entries(gamePicks);
  const expectedCount = mode === 'advanced' ? 272 : 0;
  if (entries.length !== expectedCount) {
    fail(
      'incomplete_snapshot',
      mode === 'advanced'
        ? 'Advanced prediction shares must contain all 272 regular-season game picks.'
        : 'Record-mode prediction shares cannot contain per-game picks.',
    );
  }

  return Object.fromEntries(entries
    .map(([gameId, winnerId]) => {
      assertString(gameId, { label: 'snapshot.gamePicks game ID', max: 128, pattern: SAFE_ID_PATTERN });
      if (winnerId !== 'T') assertTeamId(winnerId, `snapshot.gamePicks.${gameId}`);
      return [gameId, winnerId];
    })
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizePlayoffPicks(playoffPicks) {
  assertPlainObject(playoffPicks, 'snapshot.playoffPicks');
  const matchupIds = Object.keys(playoffPicks);
  if (matchupIds.length !== PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS.length) {
    fail('incomplete_snapshot', 'snapshot.playoffPicks must contain all 13 playoff decisions.');
  }
  for (const matchupId of matchupIds) {
    if (!PLAYOFF_MATCHUP_ID_SET.has(matchupId)) {
      fail('invalid_schema', `snapshot.playoffPicks includes unsupported matchup "${matchupId}".`);
    }
  }

  return Object.fromEntries(PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS.map((matchupId) => [
    matchupId,
    assertTeamId(playoffPicks[matchupId], `snapshot.playoffPicks.${matchupId}`),
  ]));
}

function normalizeSnapshot(snapshot, { enforceSeasonPolicy = false, ...seasonOptions } = {}) {
  assertPlainObject(snapshot, 'snapshot');
  assertExactKeys(snapshot, SNAPSHOT_KEYS, 'snapshot');
  if (snapshot.schema !== SNAPSHOT_SCHEMA || snapshot.version !== SNAPSHOT_VERSION) {
    fail('unsupported_snapshot_version', `Only ${SNAPSHOT_SCHEMA} version ${SNAPSHOT_VERSION} is supported.`);
  }

  const season = assertInteger(snapshot.season, 2000, 2100, 'snapshot.season');
  if (enforceSeasonPolicy) assertCreatableSeason(season, seasonOptions);
  const mode = snapshot.mode;
  if (mode !== 'record' && mode !== 'advanced') {
    fail('invalid_schema', 'snapshot.mode must be record or advanced.');
  }

  return {
    schema: SNAPSHOT_SCHEMA,
    version: SNAPSHOT_VERSION,
    season,
    pickWeek: assertInteger(snapshot.pickWeek, 1, 18, 'snapshot.pickWeek'),
    createdAt: normalizeCreatedAt(snapshot.createdAt),
    mode,
    scheduleFingerprint: assertString(snapshot.scheduleFingerprint, {
      label: 'snapshot.scheduleFingerprint',
      max: 128,
      pattern: SAFE_ID_PATTERN,
    }),
    manager: normalizeManager(snapshot.manager),
    records: normalizeRecords(snapshot.records),
    gamePicks: normalizeGamePicks(snapshot.gamePicks, mode),
    playoffPicks: normalizePlayoffPicks(snapshot.playoffPicks),
  };
}

function normalizePresentation(presentation) {
  if (presentation == null) return null;
  assertPlainObject(presentation, 'presentation');
  assertExactKeys(presentation, PRESENTATION_KEYS, 'presentation');

  const normalized = {};
  for (const field of ['titleId', 'themeId', 'cardId']) {
    if (presentation[field] == null) continue;
    normalized[field] = assertString(presentation[field], {
      label: `presentation.${field}`,
      max: 64,
      pattern: SAFE_PRESET_PATTERN,
    });
  }
  if (presentation.format != null) {
    if (!PRESENTATION_FORMATS.has(presentation.format)) {
      fail('invalid_schema', 'presentation.format must be square or tall.');
    }
    normalized.format = presentation.format;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeScheduleContext(options, snapshot, { required = false } = {}) {
  const gameIds = options.scheduleGameIds;
  const fingerprint = options.scheduleFingerprint;
  if (gameIds == null && fingerprint == null && !required) return null;
  if (!Array.isArray(gameIds) || gameIds.length !== 272) {
    fail('schedule_required', 'A canonical 272-game schedule order is required for this prediction share.');
  }
  if (fingerprint !== snapshot.scheduleFingerprint) {
    fail('schedule_mismatch', 'The active schedule does not match this prediction share.');
  }

  const seen = new Set();
  const normalizedGameIds = gameIds.map((gameId, index) => {
    const normalized = assertString(gameId, {
      label: `scheduleGameIds[${index}]`,
      max: 128,
      pattern: SAFE_ID_PATTERN,
    });
    if (seen.has(normalized)) fail('invalid_schema', `scheduleGameIds includes duplicate game "${normalized}".`);
    seen.add(normalized);
    return normalized;
  });
  return { gameIds: normalizedGameIds, fingerprint };
}

function packOrderedGamePicks(gamePicks, scheduleContext) {
  const gamePickIds = Object.keys(gamePicks);
  if (gamePickIds.length !== scheduleContext.gameIds.length
      || scheduleContext.gameIds.some((gameId) => !Object.hasOwn(gamePicks, gameId))) {
    fail('schedule_mismatch', 'Advanced game picks do not match the canonical schedule order.');
  }

  const bytes = new Uint8Array(Math.ceil((scheduleContext.gameIds.length * 6) / 8));
  let accumulator = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const gameId of scheduleContext.gameIds) {
    const winnerId = gamePicks[gameId];
    const code = winnerId === 'T' ? 0 : TEAM_ID_SET.has(winnerId) ? TEAM_ID_SET_INDEX.get(winnerId) + 1 : -1;
    if (code < 0) fail('invalid_schema', `snapshot.gamePicks.${gameId} has an unsupported winner.`);
    accumulator = (accumulator << 6) | code;
    bitCount += 6;
    while (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIndex] = (accumulator >>> bitCount) & 0xff;
      byteIndex += 1;
      accumulator &= (1 << bitCount) - 1;
    }
  }
  if (bitCount > 0) bytes[byteIndex] = (accumulator << (8 - bitCount)) & 0xff;
  return bytesToBase64Url(bytes);
}

function unpackOrderedGamePicks(encoded, scheduleContext) {
  const bytes = base64UrlToBytes(encoded);
  const expectedBytes = Math.ceil((scheduleContext.gameIds.length * 6) / 8);
  if (bytes.byteLength !== expectedBytes) {
    fail('invalid_schema', 'The packed Advanced Mode game picks have an invalid length.');
  }

  const gamePicks = Object.create(null);
  let accumulator = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const gameId of scheduleContext.gameIds) {
    while (bitCount < 6) {
      accumulator = (accumulator << 8) | bytes[byteIndex];
      bitCount += 8;
      byteIndex += 1;
    }
    bitCount -= 6;
    const code = (accumulator >>> bitCount) & 0x3f;
    accumulator &= (1 << bitCount) - 1;
    if (code > PREDICTION_SHARE_TEAM_IDS.length) {
      fail('invalid_schema', 'The packed Advanced Mode game picks include an unsupported team code.');
    }
    gamePicks[gameId] = code === 0 ? 'T' : PREDICTION_SHARE_TEAM_IDS[code - 1];
  }
  if (accumulator !== 0) fail('invalid_schema', 'The packed Advanced Mode game picks have non-zero trailing data.');
  return gamePicks;
}

function compactSnapshot(snapshot, presentation, scheduleContext) {
  return {
    s: [
      snapshot.season,
      snapshot.pickWeek,
      Date.parse(snapshot.createdAt),
      snapshot.mode === 'record' ? 'r' : 'a',
      snapshot.scheduleFingerprint,
    ],
    m: [snapshot.manager.userId, snapshot.manager.username, snapshot.manager.displayName],
    r: PREDICTION_SHARE_TEAM_IDS.map((teamId) => {
      const record = snapshot.records[teamId];
      return [record.wins, record.losses, record.ties, record.divisionWins];
    }),
    g: snapshot.mode === 'advanced' && scheduleContext
      ? packOrderedGamePicks(snapshot.gamePicks, scheduleContext)
      : Object.entries(snapshot.gamePicks),
    p: PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS.map((matchupId) => snapshot.playoffPicks[matchupId]),
    ...(presentation ? {
      o: [
        presentation.titleId ?? '',
        presentation.themeId ?? '',
        presentation.cardId ?? '',
        presentation.format ?? '',
      ],
    } : {}),
  };
}

function expandCompactEnvelope(compact, options = {}) {
  assertPlainObject(compact, 'share payload');
  const compactKeys = new Set(['s', 'm', 'r', 'g', 'p', 'o']);
  assertExactKeys(compact, compactKeys, 'share payload');
  if (!Array.isArray(compact.s) || compact.s.length !== 5
      || !Array.isArray(compact.m) || compact.m.length !== 3
      || !Array.isArray(compact.r) || compact.r.length !== PREDICTION_SHARE_TEAM_IDS.length
      || (!Array.isArray(compact.g) && typeof compact.g !== 'string')
      || !Array.isArray(compact.p) || compact.p.length !== PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS.length) {
    fail('invalid_schema', 'The prediction share payload has an invalid structure.');
  }

  const [season, pickWeek, createdAt, modeCode, scheduleFingerprint] = compact.s;
  const records = Object.fromEntries(PREDICTION_SHARE_TEAM_IDS.map((teamId, index) => {
    const row = compact.r[index];
    if (!Array.isArray(row) || row.length !== 4) fail('invalid_schema', `The ${teamId} record payload is invalid.`);
    return [teamId, {
      wins: row[0],
      losses: row[1],
      ties: row[2],
      divisionWins: row[3],
    }];
  }));

  let gamePicks;
  if (typeof compact.g === 'string') {
    const scheduleContext = normalizeScheduleContext(options, { scheduleFingerprint }, { required: true });
    gamePicks = unpackOrderedGamePicks(compact.g, scheduleContext);
  } else {
    gamePicks = Object.create(null);
    for (const row of compact.g) {
      if (!Array.isArray(row) || row.length !== 2 || Object.hasOwn(gamePicks, row[0])) {
        fail('invalid_schema', 'The regular-season game-pick payload is invalid.');
      }
      gamePicks[row[0]] = row[1];
    }
  }

  const playoffPicks = Object.fromEntries(PREDICTION_SHARE_PLAYOFF_MATCHUP_IDS.map((matchupId, index) => [
    matchupId,
    compact.p[index],
  ]));

  let createdAtIso;
  try {
    createdAtIso = new Date(createdAt).toISOString();
  } catch {
    fail('invalid_schema', 'The prediction share timestamp is invalid.');
  }

  const snapshot = normalizeSnapshot({
    schema: SNAPSHOT_SCHEMA,
    version: SNAPSHOT_VERSION,
    season,
    pickWeek,
    createdAt: createdAtIso,
    mode: modeCode === 'r' ? 'record' : modeCode === 'a' ? 'advanced' : modeCode,
    scheduleFingerprint,
    manager: {
      userId: compact.m[0],
      username: compact.m[1],
      displayName: compact.m[2],
    },
    records,
    gamePicks,
    playoffPicks,
  });

  let presentation = null;
  if (compact.o != null) {
    if (!Array.isArray(compact.o) || compact.o.length !== 4) {
      fail('invalid_schema', 'The prediction share presentation payload is invalid.');
    }
    presentation = normalizePresentation({
      ...(compact.o[0] ? { titleId: compact.o[0] } : {}),
      ...(compact.o[1] ? { themeId: compact.o[1] } : {}),
      ...(compact.o[2] ? { cardId: compact.o[2] } : {}),
      ...(compact.o[3] ? { format: compact.o[3] } : {}),
    });
  }

  return { snapshot, presentation };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checksumHex(bytes) {
  return crc32(bytes).toString(16).padStart(8, '0');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    fail('invalid_token', 'The prediction share payload is not valid base64url data.');
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    fail('invalid_token', 'The prediction share payload is not valid base64url data.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readStreamWithLimit(stream, limit, errorCode, errorMessage) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        fail(errorCode, errorMessage);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PredictionShareCodecError) throw error;
    fail('invalid_token', 'The prediction share payload could not be decompressed.');
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return readStreamWithLimit(
    stream,
    PREDICTION_SHARE_MAX_COMPRESSED_BYTES,
    'payload_too_large',
    'The compressed prediction share payload is too large.',
  );
}

async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') {
    fail('unsupported_compression', 'This browser cannot open compressed prediction shares.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return readStreamWithLimit(
    stream,
    PREDICTION_SHARE_MAX_UNCOMPRESSED_BYTES,
    'payload_too_large',
    'The expanded prediction share payload is too large.',
  );
}

function normalizeTokenInput(value) {
  if (typeof value !== 'string' || !value.trim()) fail('invalid_token', 'A prediction share token is required.');
  let token = value.trim();

  if (token.includes('#')) {
    token = token.slice(token.indexOf('#') + 1);
  } else if (/^https?:\/\//i.test(token)) {
    try {
      token = new URL(token).hash.slice(1);
    } catch {
      fail('invalid_token', 'The prediction share URL is invalid.');
    }
  }

  if (token.startsWith('p=')) token = token.slice(2);
  try {
    token = decodeURIComponent(token);
  } catch {
    fail('invalid_token', 'The prediction share token contains invalid URL encoding.');
  }
  if (token.length > PREDICTION_SHARE_MAX_TOKEN_LENGTH) {
    fail('token_too_large', 'The prediction share token is too large.');
  }
  return token;
}

/**
 * Creates a self-contained, URL-safe prediction share token. Creation accepts
 * only the current/upcoming NFL season; decoding intentionally does not apply
 * that policy so a saved link can later open in historical grading mode.
 */
export async function createPredictionShareToken(snapshotOrEnvelope, options = {}) {
  const hasEnvelope = isPlainObject(snapshotOrEnvelope) && Object.hasOwn(snapshotOrEnvelope, 'snapshot');
  const snapshotInput = hasEnvelope ? snapshotOrEnvelope.snapshot : snapshotOrEnvelope;
  const presentationInput = options.presentation ?? (hasEnvelope ? snapshotOrEnvelope.presentation : null);
  const snapshot = normalizeSnapshot(snapshotInput, {
    enforceSeasonPolicy: true,
    now: options.now,
    currentSeason: options.currentSeason,
  });
  const presentation = normalizePresentation(presentationInput);
  const scheduleContext = snapshot.mode === 'advanced' && options.scheduleGameIds
    ? normalizeScheduleContext(options, snapshot, { required: true })
    : null;
  const compact = compactSnapshot(snapshot, presentation, scheduleContext);
  const rawBytes = new TextEncoder().encode(JSON.stringify(compact));
  if (rawBytes.byteLength > PREDICTION_SHARE_MAX_UNCOMPRESSED_BYTES) {
    fail('payload_too_large', 'The prediction share payload is too large.');
  }

  let compression = COMPRESSION_NONE;
  let payloadBytes = rawBytes;
  if (options.compression !== 'none') {
    const compressed = await deflate(rawBytes);
    if (compressed && compressed.byteLength < rawBytes.byteLength) {
      compression = COMPRESSION_DEFLATE;
      payloadBytes = compressed;
    }
  }
  if (payloadBytes.byteLength > PREDICTION_SHARE_MAX_COMPRESSED_BYTES) {
    fail('payload_too_large', 'The encoded prediction share payload is too large.');
  }

  const token = `${TOKEN_PREFIX}.${compression}.${bytesToBase64Url(payloadBytes)}.${checksumHex(rawBytes)}`;
  if (token.length > PREDICTION_SHARE_MAX_TOKEN_LENGTH) {
    fail('token_too_large', 'The prediction share token is too large.');
  }
  return token;
}

export async function decodePredictionShareToken(value, options = {}) {
  const token = normalizeTokenInput(value);
  const match = token.match(TOKEN_PATTERN);
  if (!match) fail('invalid_token', 'The prediction share token has an invalid format.');

  const [, codecVersion, compression, encodedPayload, expectedChecksum] = match;
  if (Number(codecVersion) !== SNAPSHOT_VERSION) {
    fail('unsupported_codec_version', `Prediction share codec version ${codecVersion} is not supported.`);
  }
  if (compression !== COMPRESSION_DEFLATE && compression !== COMPRESSION_NONE) {
    fail('unsupported_compression', `Prediction share compression "${compression}" is not supported.`);
  }

  const encodedBytes = base64UrlToBytes(encodedPayload);
  if (encodedBytes.byteLength > PREDICTION_SHARE_MAX_COMPRESSED_BYTES) {
    fail('payload_too_large', 'The encoded prediction share payload is too large.');
  }
  const rawBytes = compression === COMPRESSION_DEFLATE ? await inflate(encodedBytes) : encodedBytes;
  if (rawBytes.byteLength > PREDICTION_SHARE_MAX_UNCOMPRESSED_BYTES) {
    fail('payload_too_large', 'The expanded prediction share payload is too large.');
  }
  if (checksumHex(rawBytes) !== expectedChecksum) {
    fail('checksum_mismatch', 'The prediction share token is damaged or has been changed.');
  }

  let compact;
  try {
    compact = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBytes));
  } catch {
    fail('invalid_token', 'The prediction share payload is not valid JSON.');
  }
  return expandCompactEnvelope(compact, options);
}

export function getCurrentPredictionShareOrigin(locationLike = globalThis.location) {
  const candidate = typeof locationLike === 'string' ? locationLike : locationLike?.origin;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    fail('invalid_origin', 'A valid HTTP or HTTPS origin is required to create a share URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('invalid_origin', 'A valid HTTP or HTTPS origin is required to create a share URL.');
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    fail('invalid_origin', 'The share origin cannot include a path, credentials, query, or fragment.');
  }
  return url.origin;
}

export async function createPredictionShareUrl(snapshotOrEnvelope, options = {}) {
  const origin = getCurrentPredictionShareOrigin(options.origin ?? globalThis.location);
  const path = options.path ?? DEFAULT_SHARE_PATH;
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('?') || path.includes('#')) {
    fail('invalid_path', 'The prediction share path must be an absolute app path without a query or fragment.');
  }
  const token = await createPredictionShareToken(snapshotOrEnvelope, options);
  return `${origin}${path}#${token}`;
}

export async function decodePredictionShareUrl(urlOrToken, options = {}) {
  return decodePredictionShareToken(urlOrToken, options);
}
