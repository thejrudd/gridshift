import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlayEvents,
  buildStarterNameIndex,
  buildPlayStatDelta,
  compareLiveFeedEvents,
  groupSharedPlayEvents,
  matchPlayToStarters,
  mergePlayEvents,
  normalizePlay,
  sortLiveFeedEvents,
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

test('an unparsed mixed pass-fumble sentence does not turn a mentioned defender into a feed scorer', () => {
  // The provider's compact text can combine the pass, fumble, and recovery in
  // a shape outside the narrative grammar. B.Young in the official text is
  // Bryce Young, not either rostered Byron Young. The Rams defender proves the
  // wrong-team rejection; the Bears defender proves that a team match alone
  // cannot invent the recovery role from B.Young's passing clause.
  const rawPlay = {
    id: 'young-mcmillan-fumble',
    type_slug: 'fumble-recovery-opponent',
    team: { abbreviation: 'CAR' },
    short_text: 'Bryce Young Pass Complete for 21 Yds to Tetairoa McMillan Tetairoa McMillan Fumble Devin Bush 0 Yd Fumble Recovery',
    text: 'B.Young pass short right to T.McMillan for 21 yards. T.McMillan FUMBLES, RECOVERED by CHI-D.Bush at CHI 31.',
    stat_yardage: 21,
    scoring_play: true,
  };
  const starters = [
    { id: 'byron', player: { full_name: 'Byron Young', position: 'LB', team: 'LAR' } },
    { id: 'byron-defense', player: { full_name: 'Byron Young', position: 'LB', team: 'CHI' } },
  ];
  const play = normalizePlay(rawPlay, 'game-chi-car');
  play.offenseTeamAbbr = 'CAR';
  play.defenseTeamAbbr = 'CHI';

  assert.equal(play.narrative, null);
  assert.deepEqual(matchPlayToStarters(play, buildStarterNameIndex(starters)), []);
  assert.deepEqual(buildPlayEvents(
    { 'game-chi-car': [rawPlay] },
    buildStarterNameIndex(starters),
    { idp_fr: 2 },
    new Map([['byron', 'LB'], ['byron-defense', 'LB']]),
    new Map([['game-chi-car', {
      id: 'game-chi-car', visitor_team: { abbreviation: 'CAR' }, home_team: { abbreviation: 'CHI' },
    }]]),
  ), []);
});

test('explicit official defensive clauses survive an unknown compact provider shape', () => {
  const game = {
    id: 'buf-det',
    visitor_team: { abbreviation: 'BUF' },
    home_team: { abbreviation: 'DET' },
  };
  const plays = [
    {
      id: 'rousseau-sack',
      type_slug: 'sack',
      team: { abbreviation: 'DET' },
      short_text: 'Unknown compact sack shape',
      text: '(Shotgun) J.Goff sacked at DET 18 for -7 yards (G.Rousseau).',
      stat_yardage: -7,
    },
    {
      id: 'campbell-tackle',
      type_slug: 'rush',
      team: { abbreviation: 'BUF' },
      short_text: 'Unknown compact rushing shape',
      text: 'J.Allen up the middle to DET 40 for 4 yards (J.Campbell).',
      stat_yardage: 4,
    },
    {
      id: 'bishop-tackle',
      type_slug: 'pass-reception',
      team: { abbreviation: 'DET' },
      short_text: 'Unknown compact receiving shape',
      text: 'J.Goff pass short right to A.St.Brown for 10 yards (C.Bishop).',
      stat_yardage: 10,
    },
  ];
  const starters = [
    { id: 'rousseau', player: { full_name: 'Greg Rousseau', position: 'DE', team: 'BUF' } },
    { id: 'campbell', player: { full_name: 'Jack Campbell', position: 'LB', team: 'DET' } },
    { id: 'bishop', player: { full_name: 'Cole Bishop', position: 'DB', team: 'BUF' } },
  ];

  const events = buildPlayEvents(
    { 'buf-det': plays },
    buildStarterNameIndex(starters),
    { idp_sack: 4, idp_sack_yd: 0.1, idp_tkl: 1.5 },
    new Map([['rousseau', 'DE'], ['campbell', 'LB'], ['bishop', 'DB']]),
    new Map([['buf-det', game]]),
  );

  assert.deepEqual(
    events
      .map(({ playerId, stats, pts }) => ({ playerId, stats, pts }))
      .sort((left, right) => left.playerId.localeCompare(right.playerId)),
    [
    { playerId: 'bishop', stats: { idp_tkl: 1 }, pts: 1.5 },
    { playerId: 'campbell', stats: { idp_tkl: 1 }, pts: 1.5 },
    { playerId: 'rousseau', stats: { idp_sack: 1, idp_sack_yd: 7 }, pts: 4.7 },
    ],
  );
});

test('an unfamiliar sentence with only a defensive name remains unattributed', () => {
  const events = buildPlayEvents(
    { game: [{
      id: 'ambiguous-rousseau',
      type_slug: 'unknown',
      team: { abbreviation: 'DET' },
      short_text: 'Unknown provider format',
      text: 'Greg Rousseau was mentioned near the sideline.',
    }] },
    buildStarterNameIndex([
      { id: 'rousseau', player: { full_name: 'Greg Rousseau', position: 'DE', team: 'BUF' } },
    ]),
    { idp_sack: 4, idp_tkl: 1.5 },
    new Map([['rousseau', 'DE']]),
    new Map([['game', {
      id: 'game', visitor_team: { abbreviation: 'BUF' }, home_team: { abbreviation: 'DET' },
    }]]),
  );

  assert.deepEqual(events, []);
});

test('explicit multi-role defenders and team defense each produce one row', () => {
  const game = {
    id: 'buf-det-fumble',
    visitor_team: { abbreviation: 'BUF' },
    home_team: { abbreviation: 'DET' },
  };
  const fumble = {
    id: 'campbell-force-recovery',
    type_slug: 'fumble-recovery-opponent',
    team: { abbreviation: 'BUF' },
    defense_team: { abbreviation: 'DET' },
    short_text: 'Unknown compact fumble shape',
    text: 'J.Allen to DET 20 for 2 yards. J.Allen FUMBLES (J.Campbell), '
      + 'RECOVERED by DET-J.Campbell at DET 20.',
    stat_yardage: 2,
  };
  const events = buildPlayEvents(
    { 'buf-det-fumble': [fumble] },
    buildStarterNameIndex([
      { id: 'campbell', player: { full_name: 'Jack Campbell', position: 'LB', team: 'DET' } },
      { id: 'det-dst', player: { full_name: 'Detroit Lions', position: 'DEF', team: 'DET' } },
    ]),
    { idp_ff: 2, idp_fr: 2, def_ff: 1 },
    new Map([['campbell', 'LB'], ['det-dst', 'DEF']]),
    new Map([['buf-det-fumble', game]]),
  );

  assert.equal(events.filter((event) => event.playerId === 'campbell').length, 1);
  assert.deepEqual(events.find((event) => event.playerId === 'campbell')?.stats, {
    idp_ff: 1,
    idp_fr: 1,
  });
  assert.equal(events.filter((event) => event.playerId === 'det-dst').length, 1);
  assert.deepEqual(events.find((event) => event.playerId === 'det-dst')?.stats, { def_ff: 1 });
});

test('named tacklers do not invent solo or assisted tackle distinctions', () => {
  const events = buildPlayEvents(
    { game: [{
      id: 'shared-tackle',
      type_slug: 'rush',
      team: { abbreviation: 'BUF' },
      short_text: 'James Cook 4 Yd Rush',
      text: 'J.Cook up the middle to DET 40 for 4 yards (J.Campbell; B.Branch).',
      stat_yardage: 4,
    }] },
    buildStarterNameIndex([
      { id: 'campbell', player: { full_name: 'Jack Campbell', position: 'LB', team: 'DET' } },
      { id: 'branch', player: { full_name: 'Brian Branch', position: 'DB', team: 'DET' } },
    ]),
    { idp_tkl_solo: 1, idp_tkl_ast: 0.5 },
    new Map([['campbell', 'LB'], ['branch', 'DB']]),
    new Map([['game', {
      id: 'game', visitor_team: { abbreviation: 'BUF' }, home_team: { abbreviation: 'DET' },
    }]]),
  );

  assert.deepEqual(events, []);
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
  assert.equal(quarterback.pts, 5.56);
  assert.equal(receiver.pts, 10.9);
  assert.equal(quarterback.sharedPlayId, receiver.sharedPlayId);
});

test('plays without wallclock use kickoff order across games', () => {
  const oldGame = {
    id: 'old-game',
    date: '2026-09-14T17:00:00.000Z',
    visitor_team: { abbreviation: 'NYG' },
    home_team: { abbreviation: 'DAL' },
  };
  const liveGame = {
    id: 'live-game',
    date: '2026-09-15T17:00:00.000Z',
    visitor_team: { abbreviation: 'NYG' },
    home_team: { abbreviation: 'DAL' },
  };
  const oldPlay = { ...TOUCHDOWN, id: 'old-play', period: 4, clock: '1:00' };
  const livePlay = { ...TOUCHDOWN, id: 'live-play', period: 2, clock: '10:00' };
  const events = buildPlayEvents(
    { 'old-game': [oldPlay], 'live-game': [livePlay] },
    buildStarterNameIndex(STARTERS),
    SCORING,
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map([['old-game', oldGame], ['live-game', liveGame]]),
  );

  assert.equal(events[0].gameId, 'live-game');
  assert.equal(events[events.length - 1].gameId, 'old-game');
  assert.ok(events[0].order > events.at(-1).order);
});

test('the shared feed comparator keeps chart and feed order aligned', () => {
  const events = sortLiveFeedEvents([
    { id: 'old', progress: 0.25, at: 200 },
    { id: 'new', progress: 0.75, at: 100 },
  ]);
  assert.deepEqual(events.map((event) => event.id), ['new', 'old']);
  assert.equal(compareLiveFeedEvents(events[0], events[1]) < 0, true);
});

test('a zero-value provider scoring flag does not create a fantasy row', () => {
  const events = buildPlayEvents(
    { 'game-1': [{ ...TOUCHDOWN, id: 'zero-value', scoring_play: true }] },
    buildStarterNameIndex(STARTERS),
    {
      pass_yd: 0,
      pass_td: 0,
      pass_cmp: 0,
      pass_att: 0,
      rec_yd: 0,
      rec_td: 0,
      rec: 0,
    },
    new Map([['winston', 'QB'], ['wandale', 'WR']]),
    new Map(),
  );
  assert.deepEqual(events, []);
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
  assert.equal(quarterback.pts, 0.68);
});

test('structured end-down data credits first downs when provider text omits the label', () => {
  const pass = normalizePlay({
    id: 'structured-pass-first-down',
    type_slug: 'pass-reception',
    team: { abbreviation: 'NO' },
    start_down: 2,
    start_distance: 8,
    end_down: 1,
    end_distance: 10,
    short_text: 'Ty Simpson Pass Complete for 14 Yds to Alex Bachman',
    text: 'T.Simpson pass short right to A.Bachman for 14 yards.',
    stat_yardage: 14,
  }, 'game-no');
  const rush = normalizePlay({
    id: 'structured-rush-first-down',
    type_slug: 'rush',
    team: { abbreviation: 'NO' },
    start_down: 3,
    start_distance: 4,
    end_down: 1,
    end_distance: 10,
    short_text: 'Ty Simpson 6 Yd Run',
    text: 'T.Simpson scrambles right for 6 yards.',
    stat_yardage: 6,
  }, 'game-no');

  assert.equal(buildPlayStatDelta(pass, 'passer').pass_fd, 1);
  assert.equal(buildPlayStatDelta(pass, 'receiver').rec_fd, 1);
  assert.equal(buildPlayStatDelta(rush, 'rusher').rush_fd, 1);
});

test('a made field goal carries cumulative yards over 30 for kicker scoring', () => {
  [
    { distance: 30, over30: 0 },
    { distance: 31, over30: 1 },
    { distance: 59, over30: 29 },
  ].forEach(({ distance, over30 }) => {
    const play = normalizePlay({
      id: `field-goal-${distance}`,
      type_slug: 'field-goal',
      team: { abbreviation: 'BAL' },
      short_text: `Justin Tucker ${distance} Yd Field Goal`,
      text: `Justin Tucker ${distance} Yd Field Goal`,
      scoring_play: true,
    }, 'game-bal');

    assert.deepEqual(buildPlayStatDelta(play, 'kicker'), {
      fgm: 1,
      fgm_yds: distance,
      fgm_yds_over_30: over30,
    });
  });
});

test('a defensive fumble recovery does not attach to an offensive player in a trailing tackle clause', () => {
  const play = {
    id: 'fumble-jameson-attribution',
    type_slug: 'fumble-recovery-opponent',
    team: { abbreviation: 'PHI' },
    short_text: 'Miles Sanders 1 Yd Rush Miles Sanders Fumble Quinyon Mitchell 6 Yd Fumble Recovery',
    text: 'M.Sanders left guard to PHI 10 for 1 yard (J.Campbell; B.Young). FUMBLES (J.Campbell), RECOVERED by PHI-Q.Mitchell at PHI 10. Q.Mitchell to PHI 16 for 6 yards (J.Williams).',
    stat_yardage: 6,
    scoring_play: false,
  };
  const starters = [
    { id: 'sanders', player: { full_name: 'Miles Sanders', position: 'RB', team: 'PHI' } },
    { id: 'quinyon', player: { full_name: 'Quinyon Mitchell', position: 'DB', team: 'PHI' } },
    { id: 'jameson', player: { full_name: 'Jameson Williams', position: 'WR', team: 'DAL' } },
  ];
  const normalized = normalizePlay(play, 'game-fumble');
  const matches = matchPlayToStarters(normalized, buildStarterNameIndex(starters));

  assert.equal(matches.some(({ playerId }) => playerId === 'jameson'), false);
  assert.equal(matches.find(({ playerId }) => playerId === 'quinyon')?.role, 'defense');
  assert.deepEqual(buildPlayStatDelta(normalized, 'defense'), { idp_fr: 1, idp_fr_yd: 6 });
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
  assert.equal(grouped[0].pts, 16.46);
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
  assert.equal(nextSnapshot[0].pts, 16.46);
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

test('grouped contributors keep the reconciled scoring fields the expansion reads', () => {
  // Connected live hands grouping rows whose `pts` is already the displayed
  // total, with the play's own score moved to `rawPts`.
  const shared = (playerId, extra) => ({
    id: `play-td-${playerId}`,
    sharedPlayId: 'snap-1',
    playerId,
    position: playerId === 'winston' ? 'QB' : 'WR',
    kind: 'td',
    mechanism: 'pass',
    pts: extra.displayPts,
    rawPts: extra.rawPts,
    stats: { pass_td: 1 },
    at: 1_000_000,
    order: 10,
    gameId: 'game-1',
    source: 'play',
    estimated: true,
    ...extra,
  });

  const [grouped] = groupSharedPlayEvents([
    shared('winston', {
      rawPts: 4, adjustment: 0.3, displayPts: 4.3, status: 'confirmed', confirmedBy: 'stats',
    }),
    shared('wandale', {
      rawPts: 6, adjustment: 0, displayPts: 6, status: 'pending', confirmedBy: null,
    }),
  ], () => 'viewer');

  assert.equal(grouped.pts, 10.3);
  assert.deepEqual(grouped.contributors.map(({
    playerId, rawPts, adjustment, displayPts, status, confirmedBy,
  }) => ({ playerId, rawPts, adjustment, displayPts, status, confirmedBy })), [
    { playerId: 'winston', rawPts: 4, adjustment: 0.3, displayPts: 4.3, status: 'confirmed', confirmedBy: 'stats' },
    { playerId: 'wandale', rawPts: 6, adjustment: 0, displayPts: 6, status: 'pending', confirmedBy: null },
  ]);
});

test('demo and preseason rows gain no reconciler fields from grouping', () => {
  const plain = (playerId) => ({
    id: `demo-${playerId}`,
    sharedPlayId: 'snap-demo',
    playerId,
    position: 'WR',
    kind: 'pass',
    pts: 2,
    stats: { rec: 1, rec_yd: 10 },
    at: 5,
    source: 'play',
    estimated: true,
  });

  const [grouped] = groupSharedPlayEvents([plain('a'), plain('b')], () => 'viewer');

  grouped.contributors.forEach((contributor) => {
    assert.equal(contributor.rawPts, undefined);
    assert.equal(contributor.adjustment, undefined);
    assert.equal(contributor.displayPts, undefined);
    assert.equal(contributor.status, undefined);
    assert.equal(contributor.confirmedBy, undefined);
  });
});
