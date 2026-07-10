// Semver helpers for the What's New / feature-tour system.
// Kept React-free so node unit tests can import directly.

export function parseVersion(version) {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

// Returns negative if a < b, 0 if equal, positive if a > b. Unparseable versions sort lowest.
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return (pa.major - pb.major) || (pa.minor - pb.minor) || (pa.patch - pb.patch);
}

// All entries with lastSeen < entry.version <= current, oldest first.
// entries: array of { version, ... } (e.g. WHATS_NEW from src/data/whatsNew.js).
export function collectWhatsNew(entries, lastSeen, current) {
  if (!Array.isArray(entries) || !parseVersion(lastSeen) || !parseVersion(current)) return [];
  return entries
    .filter((entry) =>
      compareVersions(entry.version, lastSeen) > 0 &&
      compareVersions(entry.version, current) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
}
