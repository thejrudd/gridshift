import { readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WHATS_NEW } from '../src/data/whatsNew.js';
import { buildAppPath, normalizeAppRoute, parseAppRoute } from '../src/utils/appRoutes.js';
import { collapseSupersededFeatures, compareVersions, parseVersion } from '../src/utils/versionUtils.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = resolve(root, 'src');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const placements = new Set(['auto', 'top', 'bottom', 'left', 'right']);
const selectorPattern = /^\[data-tour=(['"])([^'"]+)\1\]$/;
const errors = [];
const featureIds = new Set();
const featureRecords = [];
const allSupersededIds = new Set(WHATS_NEW.flatMap((entry) =>
  entry.features.flatMap((feature) => Array.isArray(feature.supersedes) ? feature.supersedes : [])));

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

const sourceFiles = walk(sourceRoot).filter((path) => !path.endsWith('src/data/whatsNew.js'));
const sourceCorpus = sourceFiles.map((path) => readFileSync(path, 'utf8')).join('\n');

function fail(location, message) {
  errors.push(`${location}: ${message}`);
}

function requireText(value, location) {
  if (typeof value !== 'string' || !value.trim()) fail(location, 'must be a non-empty string');
}

function validateAnchor(selector, location) {
  if (selector == null) return;
  const match = typeof selector === 'string' ? selector.match(selectorPattern) : null;
  if (!match) {
    fail(location, 'must be a simple [data-tour="..."] selector');
    return;
  }
  const anchorName = match[2];
  const anchorPrefix = anchorName.slice(0, anchorName.lastIndexOf('-') + 1);
  const hasSourceToken = sourceCorpus.includes(anchorName) || sourceCorpus.includes(anchorPrefix);
  if (!hasSourceToken) {
    fail(location, `has no matching data-tour token in src: ${anchorName}`);
  }
}

function validateRoute(route, location) {
  if (route == null) return;
  if (typeof route !== 'object' || Array.isArray(route)) {
    fail(location, 'must be an applyRoute object or null');
    return;
  }

  const normalized = normalizeAppRoute(route);
  for (const [key, value] of Object.entries(route)) {
    if (normalized[key] !== value) {
      fail(location, `normalization changes ${key} from ${JSON.stringify(value)} to ${JSON.stringify(normalized[key])}`);
    }
  }

  const path = buildAppPath(route);
  const url = new URL(path, 'https://gridshift.local');
  const reparsed = parseAppRoute(url.pathname, url.search);
  for (const [key, value] of Object.entries(route)) {
    if (reparsed[key] !== value) {
      fail(location, `route round trip through ${path} changes ${key} to ${JSON.stringify(reparsed[key])}`);
    }
  }
}

let previousVersion = null;
for (const [entryIndex, entry] of WHATS_NEW.entries()) {
  const entryLocation = `WHATS_NEW[${entryIndex}]`;
  if (!parseVersion(entry.version)) fail(`${entryLocation}.version`, 'must be valid semantic version text');
  if (previousVersion && compareVersions(previousVersion, entry.version) >= 0) {
    fail(`${entryLocation}.version`, `must be newer than ${previousVersion}`);
  }
  previousVersion = entry.version;
  requireText(entry.title, `${entryLocation}.title`);
  if (!Array.isArray(entry.features) || entry.features.length === 0) {
    fail(`${entryLocation}.features`, 'must contain at least one feature');
    continue;
  }

  for (const [featureIndex, feature] of entry.features.entries()) {
    const featureLocation = `${entryLocation}.features[${featureIndex}]`;
    requireText(feature.id, `${featureLocation}.id`);
    if (featureIds.has(feature.id)) fail(`${featureLocation}.id`, `duplicates feature id ${feature.id}`);
    featureIds.add(feature.id);
    featureRecords.push({ feature, entryIndex, version: entry.version, location: featureLocation });
    requireText(feature.name, `${featureLocation}.name`);
    requireText(feature.description, `${featureLocation}.description`);
    if (!Array.isArray(feature.steps) || feature.steps.length === 0) {
      fail(`${featureLocation}.steps`, 'must contain at least one step');
      continue;
    }

    for (const [stepIndex, step] of feature.steps.entries()) {
      const stepLocation = `${featureLocation}.steps[${stepIndex}]`;
      if (allSupersededIds.has(feature.id) === false) {
        validateRoute(step.route, `${stepLocation}.route`);
        validateAnchor(step.anchor, `${stepLocation}.anchor`);
        validateAnchor(step.anchorMobile, `${stepLocation}.anchorMobile`);
      }
      if (!placements.has(step.placement)) fail(`${stepLocation}.placement`, `must be one of ${[...placements].join(', ')}`);

      if (step.contextKey) {
        requireText(step.contextKey, `${stepLocation}.contextKey`);
        if (!step.copyByContext || typeof step.copyByContext !== 'object') {
          fail(`${stepLocation}.copyByContext`, 'is required when contextKey is set');
        } else {
          for (const [contextValue, copy] of Object.entries(step.copyByContext)) {
            requireText(copy?.title, `${stepLocation}.copyByContext.${contextValue}.title`);
            requireText(copy?.body, `${stepLocation}.copyByContext.${contextValue}.body`);
          }
        }
      } else {
        requireText(step.title, `${stepLocation}.title`);
        requireText(step.body, `${stepLocation}.body`);
      }

      if (step.demoWhen && !step.demoMode) {
        fail(`${stepLocation}.demoWhen`, 'requires demoMode');
      }
    }
  }
}


const featureRecordById = new Map(featureRecords.map((record) => [record.feature.id, record]));
const targetOwners = new Map();

for (const record of featureRecords) {
  const supersedes = record.feature.supersedes ?? [];
  if (Array.isArray(supersedes) === false) {
    fail(record.location + '.supersedes', 'must be an array of earlier feature IDs');
    continue;
  }

  const uniqueSupersedes = new Set();
  for (const targetId of supersedes) {
    if (typeof targetId !== 'string' || targetId.trim() === '') {
      fail(record.location + '.supersedes', 'must contain non-empty feature IDs');
      continue;
    }
    if (uniqueSupersedes.has(targetId)) {
      fail(record.location + '.supersedes', 'duplicates ' + targetId);
      continue;
    }
    uniqueSupersedes.add(targetId);
    const target = featureRecordById.get(targetId);
    if (!target) {
      fail(record.location + '.supersedes', 'references unknown feature ' + targetId);
    } else if (target.entryIndex >= record.entryIndex) {
      fail(record.location + '.supersedes', 'must reference an earlier version feature: ' + targetId);
    }
  }

  for (const step of record.feature.steps ?? []) {
    if (!step.route || !step.anchor) continue;
    const targetKey = buildAppPath(step.route) + '|' + step.anchor;
    const previous = targetOwners.get(targetKey);
    if (
      previous &&
      previous.entryIndex < record.entryIndex &&
      supersedes.includes(previous.feature.id) === false
    ) {
      fail(
        record.location,
        'shares tour target ' + targetKey + ' with earlier feature ' + previous.feature.id
          + '; declare supersedes if this is its replacement',
      );
    }
    targetOwners.set(targetKey, record);
  }
}

if (errors.length > 0) {
  console.error(`What's New tour validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const effectiveEntries = collapseSupersededFeatures(WHATS_NEW);
  const effectiveFeatureCount = effectiveEntries.reduce((total, entry) => total + entry.features.length, 0);
  const effectiveStepCount = effectiveEntries.reduce((total, entry) => total
    + entry.features.reduce((featureTotal, feature) => featureTotal + feature.steps.length, 0), 0);
  console.log(`What's New tour validation passed: ${WHATS_NEW.length} versions, ${effectiveFeatureCount} effective features, ${effectiveStepCount} effective steps.`);
  for (const entry of effectiveEntries) console.log(`- v${entry.version}: ${entry.features.length} effective features`);
}
