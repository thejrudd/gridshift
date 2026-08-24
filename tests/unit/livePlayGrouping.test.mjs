import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlayEvents,
  buildStarterNameIndex,
  buildPlayStatDelta,
  groupSharedPlayEvents,
  mergePlayEvents,
  normalizePlay,
} from '../../src/utils/livePlaysFeed.js';

const SCORING = {
  pass_yd: 0.04,
  pass_cmp: 0,
  pass_att: 0,
  pass_td: 4,
  rec_yd: 0.1,
  rec: 1,
  rec_td: 6,
};

const TOUCHDOWN = {
  id: 'nyg-td-1',
  type_slug: 'passing-touchdown',
  team: { abbreviation: 'NYG' },
  short_text: "Wan'Dale Robinson 39 Yd pass from Jameis Winston",
  text: "J.Winston pass deep left to W.Robinson for 39 yards, TOUCHDOWN.",
  stat_yardage: 39,
  scoring_play: true,
};

const STARTERS = [
  { id: 'winston', player: { full_name: 'Jameis Winston', position: 'QB', team: 'NYG' } },
  { id: 'wandale', player: { full_name: "Wan'Dale Robinson", position: 'WR', team: 'NYG' } },
];

const RUSH_WITH_FAILED_PAT = {
  id: 'hou-rush-td-1',
  type_slug: 'rushing-touchdown',
  team: { abbreviation: 'HOU' },
  short_text: 'Dare Ogunbowale 19 Yd Run (Kansei Matsuzawa PAT failed)',
  text: 'Dare Ogunbowale 19 Yd Run (Kansei Matsuzawa PAT failed)',
  stat_yardage: 19,
  scoring_play: true,
};

const HOU_STARTERS = [
  { id: 'ogunbowale', player: { full_name: 'Dare Ogunbowale', position: 'RB', team: 'HOU' } },
  { id: 'matsuzawa', player: { full_name: 'Kansei Matsuzawa', position: 'K', team: 'HOU' } },
];

const KICK_SCORING = {
  rush_yd: 0.1,
  rush_td: 6,
  xpm: 1,
  xpmiss: -1,
};

test('a failed PAT keeps the touchdown and kicker penalty on their actual players', () => {
  const normalized = normalizePlay(RUSH_WITH_FAILED_PAT, 'game-hou');
  assert.equal(normalized.narrative.confident, true);

  const events = buildPlayEvents(
    { 'game-hou': [RUSH_WITH_FAILED_PAT] },
    buildStarterNameIndex(HOU_STARTERS),
    KICK_SCORING,
    new Map([['ogunbowale', 'RB'], ['matsuzawa', 'K']]),
    new Map(),
  );

  const runner = events.find((event) => event.playerId === 'ogunbowale');
  const kicker = events.find((event) => event.playerId === 'matsuzawa');
  assert.deepEqual(runner.stats, { rush_att: 1, rush_yd: 19, rush_td: 1 });
  assert.equal(runner.pts, 7.9);
  assert.deepEqual(kicker.stats, { xpmiss: 1 });
  assert.equal(kicker.pts, -1);
  assert.equal(kicker.kind, 'xp');
  assert.equal(runner.sharedPlayId, kicker.sharedPlayId);

  const [grouped] = groupSharedPlayEvents(events, () => 'viewer');
  assert.equal(grouped.pts, 6.9);
  assert.deepEqual(grouped.contributors.map(({ playerId, pts }) => ({ playerId, pts })), [
    { playerId: 'ogunbowale', pts: 7.9 },
    { playerId: 'matsuzawa', pts: -1 },
  ]);
});

test('a made PAT uses the kicker actor without inheriting the touchdown', () => {
  const made = {
    ...RUSH_WITH_FAILED_PAT,
    id: 'hou-rush-td-2',
    short_text: 'Dare Ogunbowale 19 Yd Rush (Kansei Matsuzawa Kick)',
    text: 'Dare Ogunbowale 19 Yd Rush (Kansei Matsuzawa Kick)',
  };
  const events = buildPlayEvents(
    { 'game-hou': [made] },
    buildStarterNameIndex(HOU_STARTERS),
    KICK_SCORING,
    new Map([['ogunbowale', 'RB'], ['matsuzawa', 'K']]),
    new Map(),
  );
  const kicker = events.find((event) => event.playerId === 'matsuzawa');
  assert.deepEqual(kicker.stats, { xpm: 1 });
  assert.equal(kicker.pts, 1);
  assert.equal(kicker.kind, 'xp');
});

test('an unparsed provider sentence retains the conservative text-matching fallback', () => {
  const unknown = {
    id: 'unknown-run',
    type_slug: 'rush',
    team: { abbreviation: 'HOU' },
    short_text: 'Novel provider format for Dare Ogunbowale',
    text: 'Dare Ogunbowale rushes for 4 yards.',
    stat_yardage: 4,
    scoring_play: false,
  };
  const [event] = buildPlayEvents(
    { 'game-hou': [unknown] },
    buildStarterNameIndex(HOU_STARTERS),
    KICK_SCORING,
    new Map([['ogunbowale', 'RB'], ['matsuzawa', 'K']]),
    new Map(),
  );
  assert.equal(event.playerId, 'ogunbowale');
  assert.deepEqual(event.stats, { rush_att: 1, rush_yd: 4 });
});

test('a provider passing touchdown retains stat_yardage for both rostered scorers', () => {
  const play = normalizePlay(TOUCHDOWN, 'game-1');
  assert.equal(play.yards, 39);

  const events = buildPlayEvents(
    { 'game-1': [TOUCHDOWN] },
    buildStarterNameIndex(STARTERS),
    SCORING,
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map(),
  );

  const quarterback = events.find((event) => event.playerId === 'winston');
  const receiver = events.find((event) => event.playerId === 'wandale');
  assert.equal(quarterback.pts, 5.6);
  assert.equal(receiver.pts, 10.9);
  assert.equal(quarterback.sharedPlayId, receiver.sharedPlayId);
});

test('a completed pass uses the full league scoring profile before display rounding', () => {
  const completion = {
    id: 'no-pass-14',
    type_slug: 'pass-reception',
    team: { abbreviation: 'NO' },
    short_text: 'Ty Simpson Pass Complete for 14 Yds to Alex Bachman',
    text: 'T.Simpson pass short right to A.Bachman to the LAR 38 for 14 yards.',
    stat_yardage: 14,
  };
  const [quarterback] = buildPlayEvents(
    { 'game-no': [completion] },
    buildStarterNameIndex([
      { id: 'simpson', player: { full_name: 'Ty Simpson', position: 'QB', team: 'NO' } },
    ]),
    { pass_yd: 0.02, pass_cmp: 0.4, pass_att: 0 },
    new Map([['simpson', 'QB']]),
    new Map(),
  );

  assert.deepEqual(quarterback.stats, { pass_yd: 14, pass_cmp: 1, pass_att: 1 });
  assert.equal(quarterback.pts, 0.7);
});

test('an incompletion records an attempt and incompletion without pass or receiving yards', () => {
  const incomplete = normalizePlay({
    id: 'no-incomplete',
    type_slug: 'pass-incompletion',
    team: { abbreviation: 'NO' },
    short_text: 'Ty Simpson Incomplete Pass, Intended For Alex Bachman',
    text: 'T.Simpson pass incomplete short right to A.Bachman.',
    stat_yardage: 9,
  }, 'game-no');

  assert.deepEqual(buildPlayStatDelta(incomplete, 'passer'), { pass_att: 1, pass_inc: 1 });
  assert.deepEqual(buildPlayStatDelta(incomplete, 'receiver'), {});
});

test('a defensive interference no-play keeps raw geometry but has no fantasy stats', () => {
  const noPlay = normalizePlay({
    id: 'no-defensive-pi',
    type_slug: 'pass-incompletion',
    team: { abbreviation: 'NO' },
    short_text: 'Ty Simpson Incomplete Pass, Intended For Alex Bachman',
    text: 'T.Simpson pass incomplete to A.Bachman. PENALTY on LAR-X.Player, Defensive Pass Interference, 10 yards, enforced at NO 24 - No Play.',
    stat_yardage: 10,
  }, 'game-no');

  assert.equal(noPlay.yards, 10);
  assert.equal(noPlay.narrative.negated, true);
  assert.deepEqual(buildPlayStatDelta(noPlay, 'passer'), {});
  assert.deepEqual(buildPlayStatDelta(noPlay, 'receiver'), {});
});

test('a punt return credits the returner without inventing rushing stats for the punter', () => {
  const punt = {
    id: 'punt-return-1',
    type_slug: 'punt',
    team: { abbreviation: 'CLE' },
    short_text: 'Ryan Rehkow 54 Yd Punt DeAndre Carter 14 Yd Punt Return',
    text: 'Ryan Rehkow punts 54 yards. DeAndre Carter returned 14 yards.',
    stat_yardage: 14,
    scoring_play: false,
  };
  const events = buildPlayEvents(
    { 'game-1': [punt] },
    buildStarterNameIndex([
      { id: 'carter', player: { full_name: 'DeAndre Carter', position: 'WR', team: 'CIN' } },
      { id: 'rehkow', player: { full_name: 'Ryan Rehkow', position: 'P', team: 'CLE' } },
    ]),
    { pr_yd: 0.1 },
    new Map([['carter', 'WR'], ['rehkow', 'P']]),
    new Map(),
  );

  assert.deepEqual(events.map((event) => event.playerId), ['carter']);
  assert.equal(events[0].kind, 'return');
  assert.deepEqual(events[0].stats, { pr_yd: 14 });
  assert.equal(events[0].pts, 1.4);
});

test('provider kick and conversion shapes retain their scoring stat keys', () => {
  assert.deepEqual(buildPlayStatDelta({
    type: 'extra-point-good',
    description: 'Justin Tucker extra point is good',
    scoring: true,
    yards: 0,
  }, 'kicker'), { xpm: 1 });
  assert.deepEqual(buildPlayStatDelta({
    type: 'two-point-conversion',
    description: 'Jalen Hurts pass complete to A.J. Brown',
    scoring: true,
    yards: 0,
  }, 'passer'), { pass_2pt: 1 });
});

test('a summary-only pick-six recovers the same-possession passer and credits Houston', () => {
  const plays = [
    {
      id: '401873286422', period: 1, clock_display: '9:56', type_slug: 'pass-reception',
      team: { abbreviation: 'LV' }, short_text: 'Fernando Mendoza Pass Complete for 22 Yds to Jalen Nailor',
      text: '(Shotgun) F.Mendoza pass short right to J.Nailor to LV 43 for 22 yards (J.Reed).', stat_yardage: 22,
    },
    {
      id: '401873286447', period: 1, clock_display: '9:16', type_slug: 'rush',
      team: { abbreviation: 'LV' }, short_text: 'Mike Washington Jr. 33 Yd Rush',
      text: 'M.Washington up the middle to HST 24 for 33 yards (J.Smith).', stat_yardage: 33,
    },
    {
      id: '401873286469', period: 1, clock_display: '8:18', type_slug: 'interception-return-touchdown',
      type_text: 'Interception Return Touchdown', team: { abbreviation: 'HOU' },
      short_text: "Wade Woodaz 80 Yd Interception Return (Ka'imi Fairbairn Kick)",
      text: "Wade Woodaz 80 Yd Interception Return (Ka'imi Fairbairn Kick)",
      start_down: 1, start_distance: 10, start_yard_line: 24, end_yard_line: 100,
      start_yards_to_endzone: 24, end_yards_to_endzone: 0, stat_yardage: 80, scoring_play: true,
    },
  ];
  const starters = [
    { id: 'mendoza', player: { full_name: 'Fernando Mendoza', position: 'QB', team: 'LV' } },
    { id: 'woodaz', player: { full_name: 'Wade Woodaz', position: 'LB', team: 'HOU' } },
    { id: 'hou-dst', player: { full_name: 'Houston Texans', position: 'DEF', team: 'HOU' } },
    { id: 'fairbairn', player: { full_name: "Ka'imi Fairbairn", position: 'K', team: 'HOU' } },
  ];
  const game = {
    id: '1393564', away: { id: 'LV' }, home: { id: 'HOU' },
  };
  const events = buildPlayEvents(
    { 1393564: plays },
    buildStarterNameIndex(starters),
    { pass_int: -2, idp_int: 2, idp_def_td: 6, idp_int_td: 6, int: 2, def_td: 6, def_int_td: 6 },
    new Map([['mendoza', 'QB'], ['woodaz', 'LB'], ['hou-dst', 'DEF'], ['fairbairn', 'K']]),
    new Map([['1393564', game]]),
  ).filter((event) => event.sharedPlayId === '401873286469');

  assert.deepEqual(events.map((event) => event.playerId).sort(), ['hou-dst', 'mendoza', 'woodaz']);
  assert.deepEqual(events.find((event) => event.playerId === 'mendoza').stats, { pass_int: 1 });
  assert.equal(events.find((event) => event.playerId === 'woodaz').play.defenseTeamAbbr, 'HOU');
  assert.equal(events.find((event) => event.playerId === 'hou-dst').play.defenseTeamAbbr, 'HOU');
  const mendoza = events.find((event) => event.playerId === 'mendoza');
  assert.equal(mendoza.play.inferredPasserName, 'Fernando Mendoza');
  assert.equal(
    mendoza.desc,
    "Fernando Mendoza's pass was intercepted by Wade Woodaz and returned 80 yards for a touchdown.",
  );
  assert.equal(events.some((event) => event.playerId === 'fairbairn'), false, 'the appended PAT is a separate snap');
});

test('same-side contributors become one combined feed moment', () => {
  const events = buildPlayEvents(
    { 'game-1': [TOUCHDOWN] },
    buildStarterNameIndex(STARTERS),
    SCORING,
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map(),
  );
  const grouped = groupSharedPlayEvents(events, () => 'a');

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].pts, 16.5);
  assert.deepEqual(grouped[0].contributorIds, ['winston', 'wandale']);
  assert.deepEqual(grouped[0].contributors.map((contributor) => contributor.position), ['QB', 'WR']);
});

test('a shared play keeps one stable row id as same-side contributors arrive', () => {
  const events = buildPlayEvents(
    { 'game-1': [TOUCHDOWN] },
    buildStarterNameIndex(STARTERS),
    SCORING,
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map(),
  );
  const quarterback = events.find((event) => event.playerId === 'winston');

  const firstSnapshot = groupSharedPlayEvents([quarterback], () => 'a');
  const nextSnapshot = groupSharedPlayEvents(events, () => 'a');

  assert.equal(firstSnapshot[0].id, 'shared-nyg-td-1-a');
  assert.equal(nextSnapshot[0].id, firstSnapshot[0].id);
  assert.deepEqual(nextSnapshot[0].contributorIds, ['winston', 'wandale']);
  assert.equal(nextSnapshot[0].pts, 16.5);
});

test('shared snaps remain separate when contributors are on opposing fantasy sides', () => {
  const events = buildPlayEvents(
    { 'game-1': [TOUCHDOWN] },
    buildStarterNameIndex(STARTERS),
    SCORING,
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map(),
  );
  const grouped = groupSharedPlayEvents(events, (event) => (
    event.playerId === 'winston' ? 'a' : 'b'
  ));
  assert.equal(grouped.length, 2);
});

test('a play-enriched live delta retains its shared snap identity', () => {
  const game = {
    id: 'game-1',
    visitor_team: { abbreviation: 'NYG' },
    home_team: { abbreviation: 'DAL' },
  };
  const [play] = buildPlayEvents(
    { 'game-1': [TOUCHDOWN] },
    buildStarterNameIndex(STARTERS),
    SCORING,
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map([['game-1', game]]),
  ).filter((event) => event.playerId === 'winston');
  const [merged] = mergePlayEvents([play], [{
    id: 'live-winston',
    playerId: 'winston',
    kind: play.kind,
    pts: play.pts,
    stats: { pass_cmp: 1, pass_yd: 10, pass_td: 1 },
    at: play.at,
  }]);
  assert.equal(merged.sharedPlayId, play.sharedPlayId);
  assert.deepEqual(merged.stats, { pass_cmp: 1, pass_yd: 10, pass_td: 1 });
  assert.equal(merged.playGame, game);
});

test('a matching stat snapshot hydrates a delayed provider play within the replay window', () => {
  const play = {
    id: 'provider-catch-1',
    playerId: 'receiver',
    kind: 'pass',
    pts: 3,
    stats: { rec: 1, rec_yd: 20 },
    at: 1_000_000,
    gameId: 'game-1',
    desc: 'Jaxon Smith-Njigba for 20 yards',
    play: { id: 'provider-catch-1' },
    playGame: { id: 'game-1' },
  };
  const [merged] = mergePlayEvents([play], [{
    id: 'snapshot-catch-1',
    playerId: 'receiver',
    kind: 'pass',
    pts: 0,
    stats: { rec: 1, rec_yd: 20 },
    at: 1_300_000,
    gameId: 'game-1',
  }]);

  assert.equal(merged.id, 'snapshot-catch-1');
  assert.equal(merged.source, 'play+delta');
  assert.equal(merged.play.id, 'provider-catch-1');
  assert.deepEqual(merged.playGame, { id: 'game-1' });
  assert.deepEqual(merged.stats, { rec: 1, rec_yd: 20 });
});
