export const DEVICE_SYNC_TOKEN_STORAGE_KEY = 'gridshift_draft_sync_device_tokens_v1';

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readDeviceSyncTokenMap(storage) {
  try {
    const resolvedStorage = resolveStorage(storage);
    if (!resolvedStorage) return {};
    const parsed = JSON.parse(resolvedStorage.getItem(DEVICE_SYNC_TOKEN_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readDeviceSyncToken(userId, storage) {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) return '';
  return String(readDeviceSyncTokenMap(storage)[normalizedUserId] ?? '');
}

export function writeDeviceSyncToken(userId, token, storage) {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) return;
  try {
    const resolvedStorage = resolveStorage(storage);
    if (!resolvedStorage) return;
    const tokens = readDeviceSyncTokenMap(resolvedStorage);
    const normalizedToken = String(token ?? '');
    if (normalizedToken) tokens[normalizedUserId] = normalizedToken;
    else delete tokens[normalizedUserId];
    resolvedStorage.setItem(DEVICE_SYNC_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Device credentials are best-effort local state. A cleared browser can re-pair.
  }
}
