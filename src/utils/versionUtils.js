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

// Removes older features replaced by later features in the same upgrade range.
// Entries without feature arrays are preserved for generic version utilities.
export function collapseSupersededFeatures(entries) {
  if (Array.isArray(entries) === false) return [];

  const supersededIds = new Set(entries.flatMap((entry) =>
    Array.isArray(entry.features)
      ? entry.features.flatMap((feature) => Array.isArray(feature.supersedes) ? feature.supersedes : [])
      : []));

  return entries
    .map((entry) => {
      if (Array.isArray(entry.features) === false) return entry;
      return {
        ...entry,
        features: entry.features.filter((feature) => supersededIds.has(feature.id) === false),
      };
    })
    .filter((entry) => Array.isArray(entry.features) === false || entry.features.length > 0);
}

// All effective entries with lastSeen < entry.version <= current, oldest first.
// Later features can supersede obsolete features from earlier crossed versions.
export function collectWhatsNew(entries, lastSeen, current) {
  if (Array.isArray(entries) === false || parseVersion(lastSeen) === null || parseVersion(current) === null) return [];
  const crossedEntries = entries
    .filter((entry) =>
      compareVersions(entry.version, lastSeen) > 0 &&
      compareVersions(entry.version, current) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
  return collapseSupersededFeatures(crossedEntries);
}
