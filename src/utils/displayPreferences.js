export const DISPLAY_SIZE_STORAGE_KEY = 'gridshift-display-size';
export const DEFAULT_DISPLAY_SIZE = 'comfortable';
export const DISPLAY_SIZES = ['compact', 'comfortable', 'large'];

export function normalizeDisplaySize(value) {
  return DISPLAY_SIZES.includes(value) ? value : DEFAULT_DISPLAY_SIZE;
}

export function readDisplaySize(storage) {
  try {
    const resolvedStorage = storage === undefined ? globalThis.localStorage : storage;
    return normalizeDisplaySize(resolvedStorage?.getItem(DISPLAY_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_DISPLAY_SIZE;
  }
}

export function applyDisplaySize(size, root = globalThis.document?.documentElement) {
  const normalized = normalizeDisplaySize(size);
  root?.setAttribute('data-display-size', normalized);
  return normalized;
}

export function persistDisplaySize(size, storage) {
  const normalized = normalizeDisplaySize(size);
  try {
    const resolvedStorage = storage === undefined ? globalThis.localStorage : storage;
    resolvedStorage?.setItem(DISPLAY_SIZE_STORAGE_KEY, normalized);
  } catch {
    // Display preferences are an enhancement; storage failures are non-fatal.
  }
  return normalized;
}
