export function normalizeBroadcastLabel(value) {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  if (!label || /^tv\s+tbd$/i.test(label)) return null;
  return label;
}

function isFinalGame(game = {}) {
  if (game.completed === true || game.isFinal === true || game.final === true) return true;
  const status = String(game.status ?? '').trim();
  return /(^|[_\s-])(final|post|complete|completed)([_\s-]|$)/i.test(status);
}

export function getScoreNetworkLabel(game = {}, { fallback = true } = {}) {
  const network = normalizeBroadcastLabel(game.network);
  if (network) return network;
  if (fallback && !isFinalGame(game)) return 'TV TBD';
  return null;
}
