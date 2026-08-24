import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildByeWeekScheduleBundle,
  getByeWeekForTeam,
  isByeWeekBundleForSeason,
  normalizeNflTeamAbbr,
} from '../../src/utils/draftAssistant/byeWeeks.js';

const scheduleFixture = JSON.parse(fs.readFileSync(
  new URL('../../public/season-schedule.json', import.meta.url),
  'utf8',
));

function cloneSchedule() {
  return structuredClone(scheduleFixture);
}

test('normalizes supported provider aliases and rejects non-NFL teams', () => {
  assert.equal(normalizeNflTeamAbbr(' wsh '), 'WAS');
  assert.equal(normalizeNflTeamAbbr('JAC'), 'JAX');
  assert.equal(normalizeNflTeamAbbr('GNB'), 'GB');
  assert.equal(normalizeNflTeamAbbr('LVR'), 'LV');
  assert.equal(normalizeNflTeamAbbr('FA'), null);
  assert.equal(normalizeNflTeamAbbr(''), null);
});

test('derives one verified bye for every team from the complete draft-season schedule', () => {
  const scheduleMap = { 1: { NE: { opp: 'SEA' } } };
  const bundle = buildByeWeekScheduleBundle(scheduleFixture, {
    expectedSeason: '2026',
    scheduleMap,
  });

  assert.equal(bundle.status, 'complete');
  assert.equal(bundle.complete, true);
  assert.equal(bundle.season, '2026');
  assert.equal(bundle.expectedSeason, '2026');
  assert.equal(bundle.scheduleMap, scheduleMap);
  assert.deepEqual(bundle.coverage, {
    weekCount: 18,
    gameCount: 272,
    uniqueGameCount: 272,
    teamCount: 32,
    teamsWithExactly17Games: 32,
  });
  assert.equal(Object.keys(bundle.byeWeekByTeam).length, 32);
  assert.equal(getByeWeekForTeam(bundle, 'BUF', '2026'), 7);
  assert.equal(getByeWeekForTeam(bundle, 'WSH', '2026'), 7);
  assert.equal(getByeWeekForTeam(bundle, 'JAC', '2026'), 7);
  assert.equal(getByeWeekForTeam(bundle, 'FA', '2026'), null);
  assert.equal(isByeWeekBundleForSeason(bundle, 2026), true);
});

test('fails closed when the requested draft season does not match the schedule', () => {
  const bundle = buildByeWeekScheduleBundle(scheduleFixture, { expectedSeason: '2025' });

  assert.equal(bundle.status, 'season-mismatch');
  assert.equal(bundle.complete, false);
  assert.deepEqual(bundle.byeWeekByTeam, {});
  assert.equal(isByeWeekBundleForSeason(bundle, '2025'), false);
  assert.equal(getByeWeekForTeam(bundle, 'BUF'), null);
});

test('rejects malformed season identifiers instead of partially parsing them', () => {
  const schedule = cloneSchedule();
  schedule.season = '2026-regular';
  const bundle = buildByeWeekScheduleBundle(schedule, { expectedSeason: '2026' });

  assert.equal(bundle.status, 'unavailable');
  assert.equal(bundle.complete, false);
  assert.ok(bundle.issues.includes('missing-season'));
  assert.equal(getByeWeekForTeam(bundle, 'BUF', '2026'), null);
});

test('fails closed when a game is missing and teams no longer have 17 games', () => {
  const schedule = cloneSchedule();
  schedule.weeks['1'].pop();
  const bundle = buildByeWeekScheduleBundle(schedule, { expectedSeason: '2026' });

  assert.equal(bundle.status, 'partial');
  assert.equal(bundle.complete, false);
  assert.equal(bundle.coverage.gameCount, 271);
  assert.ok(bundle.coverage.teamsWithExactly17Games < 32);
  assert.ok(bundle.issues.includes('incomplete-game-count'));
  assert.ok(bundle.issues.includes('incomplete-team-games'));
  assert.ok(bundle.issues.includes('invalid-team-bye-count'));
  assert.deepEqual(bundle.byeWeekByTeam, {});
});

test('rejects a duplicated team within a week even when the game count stays complete', () => {
  const schedule = cloneSchedule();
  schedule.weeks['1'][1].awayTeam = schedule.weeks['1'][0].awayTeam;
  const bundle = buildByeWeekScheduleBundle(schedule, { expectedSeason: '2026' });

  assert.equal(bundle.status, 'partial');
  assert.equal(bundle.coverage.gameCount, 272);
  assert.ok(bundle.issues.includes('duplicate-team-in-week'));
  assert.deepEqual(bundle.byeWeekByTeam, {});
});

test('rejects duplicate game identities and incomplete week coverage', () => {
  const duplicateIdSchedule = cloneSchedule();
  duplicateIdSchedule.weeks['1'][1].id = duplicateIdSchedule.weeks['1'][0].id;
  const duplicateIdBundle = buildByeWeekScheduleBundle(duplicateIdSchedule, { expectedSeason: '2026' });
  assert.equal(duplicateIdBundle.status, 'partial');
  assert.equal(duplicateIdBundle.coverage.uniqueGameCount, 271);
  assert.ok(duplicateIdBundle.issues.includes('duplicate-game-id'));
  assert.ok(duplicateIdBundle.issues.includes('incomplete-unique-game-count'));

  const missingWeekSchedule = cloneSchedule();
  delete missingWeekSchedule.weeks['18'];
  const missingWeekBundle = buildByeWeekScheduleBundle(missingWeekSchedule, { expectedSeason: '2026' });
  assert.equal(missingWeekBundle.status, 'partial');
  assert.equal(missingWeekBundle.coverage.weekCount, 17);
  assert.ok(missingWeekBundle.issues.includes('incomplete-week-count'));
});

test('returns an unavailable bundle when no schedule can be loaded', () => {
  const bundle = buildByeWeekScheduleBundle(null, { expectedSeason: '2026' });

  assert.equal(bundle.status, 'unavailable');
  assert.equal(bundle.complete, false);
  assert.equal(bundle.scheduleMap, null);
  assert.deepEqual(bundle.byeWeekByTeam, {});
  assert.equal(getByeWeekForTeam(bundle, 'KC', '2026'), null);
});
