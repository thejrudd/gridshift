import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlayStatDelta,
  buildTeamDefensePlayDelta,
  estimatePlayPoints,
  isTeamDefenseScoringPlay,
  normalizeCanonicalPlay,
  resolveOffenseDefenseTeams,
} from '../../src/utils/playByPlay/normalizePlay.js';
import { buildPlayEvents, buildStarterNameIndex } from '../../src/utils/livePlaysFeed.js';
import { calcPoints } from '../../src/utils/scoringEngine.js';

const GAME = { homeTeam: 'HOU', awayTeam: 'LV' };

// One provider snapshot covering the shapes each consumer used to drop or
// mishandle: an incompletion, a kneel, a tackle for no gain, a row with no
// description at all, and a period-boundary marker.
const MIXED_SNAPSHOT = [
  {
    id: 'p1',
    period: 1,
    clock_display: '12:00',
    type_slug: 'pass-incompletion',
    team: { abbreviation: 'LV' },
    text: 'F.Mendoza pass incomplete short right to J.Nailor.',
    stat_yardage: 0,
  },
  {
    id: 'p2',
    period: 2,
    clock_display: '0:04',
    type_slug: 'rush',
    team: { abbreviation: 'LV' },
    text: 'F.Mendoza kneels to LV 30 for -1 yards.',
    stat_yardage: -1,
  },
  {
    id: 'p3',
    period: 2,
    clock_display: '0:02',
    type_slug: 'rush',
    team: { abbreviation: 'LV' },
    text: 'M.Washington up the middle to LV 30 for no gain (J.Smith).',
    stat_yardage: 0,
  },
  {
    // No text, no short_text, no type. Fantasy Live used to drop this row
    // outright; the canonical normalizer must still account for it.
    id: 'p4',
    period: 2,
    team: { abbreviation: 'LV' },
  },
  {
    id: 'p5',
    period: 3,
    type_slug: 'end-period',
    type_text: 'End of Period',
    text: 'END QUARTER 2',
  },
];

test('every raw play produces exactly one canonical play, including one with no description', () => {
  const normalized = MIXED_SNAPSHOT.map((raw) => normalizeCanonicalPlay(raw, {
    gameId: 'game-1',
    ...GAME,
  }));

  assert.equal(normalized.length, MIXED_SNAPSHOT.length);
  assert.equal(normalized.filter(Boolean).length, MIXED_SNAPSHOT.length);
  assert.deepEqual(normalized.map((play) => play.id), ['p1', 'p2', 'p3', 'p4', 'p5']);

  const descriptionless = normalized.find((play) => play.id === 'p4');
  assert.equal(descriptionless.rawDescription, null);
  assert.equal(descriptionless.narrative, null);
  assert.equal(descriptionless.typeSlug, null);
  assert.equal(descriptionless.period, 2);
  assert.equal(descriptionless.team, 'LV');

  const periodBoundary = normalized.find((play) => play.id === 'p5');
  assert.equal(periodBoundary.typeSlug, 'end-period');
  assert.equal(periodBoundary.typeDisplay, 'End of Period');

  // Unreported geometry stays null rather than collapsing to zero.
  assert.equal(normalized[0].startDown, null);
  assert.equal(normalized[0].statYardage, 0);
  assert.equal(normalized[1].yards, -1);
});

test('a null row is the only thing that yields no canonical play', () => {
  assert.equal(normalizeCanonicalPlay(null, { gameId: 'game-1' }), null);
  assert.equal(normalizeCanonicalPlay(undefined, { gameId: 'game-1' }), null);
});

test('an id falls back to the game, sequence, then description', () => {
  assert.equal(normalizeCanonicalPlay({ sequence: 42, text: 'A run.' }, { gameId: 'g7' }).id, 'g7-42');
  assert.equal(
    normalizeCanonicalPlay({ text: 'A very long provider sentence that keeps going and going.' }, { gameId: 'g7' }).id,
    'g7-A very long provider sen',
  );
});

test('offense and defense follow one shared rule across every possession-changing shape', () => {
  const cases = [
    // [label, raw row, expected offense, expected defense]
    ['interception', { type_slug: 'interception-return-touchdown', team: { abbreviation: 'HOU' } }, 'LV', 'HOU'],
    ['opponent fumble recovery', { type_slug: 'fumble-recovery-opponent', team: { abbreviation: 'HOU' } }, 'LV', 'HOU'],
    ['sack then opponent recovery', { type_slug: 'sack-opp-fumble-recovery', team: { abbreviation: 'HOU' } }, 'LV', 'HOU'],
    ['punt', { type_slug: 'punt', team: { abbreviation: 'LV' } }, 'HOU', 'LV'],
    ['kickoff', { type_slug: 'kickoff', team: { abbreviation: 'LV' } }, 'HOU', 'LV'],
    ['blocked field goal', { type_slug: 'field-goal-blocked', team: { abbreviation: 'LV' } }, 'HOU', 'LV'],
    ['missed field goal', { type_slug: 'field-goal-missed', team: { abbreviation: 'LV' } }, 'HOU', 'LV'],
    // A fumble the offense fell on itself keeps possession.
    ['own fumble recovery', { type_slug: 'fumble-recovery-own', team: { abbreviation: 'LV' } }, 'LV', 'HOU'],
    ['ordinary rush', { type_slug: 'rush', team: { abbreviation: 'LV' } }, 'LV', 'HOU'],
    [
      'turnover on downs',
      {
        type_slug: 'rush',
        team: { abbreviation: 'HOU' },
        start_down: 4,
        end_down: 1,
        start_distance: 5,
        stat_yardage: 2,
      },
      'LV',
      'HOU',
    ],
    [
      'converted fourth down stays with the offense',
      {
        type_slug: 'rush',
        team: { abbreviation: 'HOU' },
        start_down: 4,
        end_down: 1,
        start_distance: 5,
        stat_yardage: 9,
      },
      'HOU',
      'LV',
    ],
  ];

  cases.forEach(([label, raw, offense, defense]) => {
    const play = normalizeCanonicalPlay({ text: 'Provider sentence.', ...raw }, { gameId: 'g', ...GAME });
    assert.equal(play.offenseTeam, offense, `${label}: offense`);
    assert.equal(play.defenseTeam, defense, `${label}: defense`);
  });
});

test('an explicit provider defense_team wins over the inferred rule', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'rush',
    team: { abbreviation: 'HOU' },
    defense_team: { abbreviation: 'LV' },
    text: 'A run.',
  }, { gameId: 'g', ...GAME });
  assert.equal(play.defenseTeam, 'LV');
  assert.equal(play.offenseTeam, 'HOU');

  // Even when the inferred rule would have flipped the possession.
  const punt = normalizeCanonicalPlay({
    type_slug: 'punt',
    team: { abbreviation: 'LV' },
    defense_team: 'LV',
    text: 'A punt.',
  }, { gameId: 'g', ...GAME });
  assert.equal(punt.defenseTeam, 'LV');
  assert.equal(punt.offenseTeam, 'HOU');
});

test('without game teams the possession team is carried through uncorrected', () => {
  const play = normalizeCanonicalPlay({ type_slug: 'punt', team: { abbreviation: 'LV' }, text: 'A punt.' }, { gameId: 'g' });
  assert.equal(play.team, 'LV');
  assert.equal(play.offenseTeam, 'LV');
  assert.equal(play.defenseTeam, null);
});

test('the resolver reads a raw provider row as readily as a canonical play', () => {
  assert.deepEqual(
    resolveOffenseDefenseTeams({ raw: { type_slug: 'punt', team: { abbreviation: 'LV' } } }, GAME),
    { offenseTeam: 'HOU', defenseTeam: 'LV' },
  );
  assert.deepEqual(
    resolveOffenseDefenseTeams({ raw: { type_slug: 'rush', team: { abbreviation: 'LV' } } }, GAME),
    { offenseTeam: 'LV', defenseTeam: 'HOU' },
  );
});

test('the provider scoring flag and the text-inferred reading stay separate', () => {
  const flagged = normalizeCanonicalPlay({ text: 'A run.', scoring_play: true }, { gameId: 'g' });
  assert.equal(flagged.scoring, true);
  assert.equal(flagged.scoringInferred, true);

  const unflagged = normalizeCanonicalPlay({ text: 'J.Smith runs 4 yards for a TOUCHDOWN.' }, { gameId: 'g' });
  assert.equal(unflagged.scoring, null);
  assert.equal(unflagged.scoringInferred, true);

  const ordinary = normalizeCanonicalPlay({ text: 'J.Smith runs 4 yards.' }, { gameId: 'g' });
  assert.equal(ordinary.scoring, null);
  assert.equal(ordinary.scoringInferred, false);
});

// The stat-delta helpers read the consumer-shaped play (description, type,
// yards, scoring), which is what Fantasy Live's feed play carries.
function statPlay(overrides) {
  return { type: '', description: '', scoring: false, yards: 0, raw: {}, ...overrides };
}

test('team-defense scoring detection covers sacks, turnovers, safeties and breakups', () => {
  assert.equal(isTeamDefenseScoringPlay(statPlay({
    description: 'M.Washington up the middle for 4 yards.',
  })), false);
  assert.equal(isTeamDefenseScoringPlay(statPlay({
    description: 'D.Hunter sacked F.Mendoza for -7 yards.',
    yards: -7,
  })), true);
  assert.deepEqual(buildTeamDefensePlayDelta(statPlay({
    description: 'D.Hunter sacked F.Mendoza for -7 yards.',
    yards: -7,
  })), { sack: 1, sack_yd: 7 });
  assert.deepEqual(buildTeamDefensePlayDelta(statPlay({
    description: 'W.Woodaz intercepted the pass and returned it 80 yards for a touchdown.',
    scoring: true,
    yards: 80,
  })), {
    int: 1, def_td: 1, def_int_td: 1, int_ret_yd: 80, bonus_def_int_td_50p: 1,
  });
  assert.deepEqual(buildTeamDefensePlayDelta(statPlay({
    description: 'A.Thomas recovers the fumble and returns it 55 yards for a touchdown.',
    scoring: true,
    yards: 55,
  })), {
    def_ff: 1, def_td: 1, def_fum_td: 1, fum_ret_yd: 55, bonus_def_fum_td_50p: 1,
  });
  assert.deepEqual(buildTeamDefensePlayDelta(statPlay({
    description: 'Tackled in the end zone for a safety.',
  })), { safe: 1 });
});

test('the individual defensive delta covers the full IDP key set', () => {
  const idp = (description, extra = {}) => buildPlayStatDelta(statPlay({ description, ...extra }), 'defense');

  assert.deepEqual(idp('D.Hunter sacked F.Mendoza for -7 yards.'), { idp_sack: 1 });
  assert.deepEqual(idp('W.Woodaz intercepted the pass.'), { idp_int: 1 });
  assert.deepEqual(idp('A.Thomas with a forced fumble.'), { idp_ff: 1 });
  assert.deepEqual(
    idp('Forced fumble, recovered by A.Thomas for a 12 yard return.'),
    { idp_ff: 1, idp_fr: 1, idp_fr_yd: 12 },
  );
  assert.deepEqual(idp('Tackled in the end zone for a safety.'), { idp_safety: 1 });
  assert.deepEqual(idp('Pass broken up by K.Stingley.'), { idp_pd: 1 });
  assert.deepEqual(
    idp('W.Woodaz intercepted the pass and returned it 80 yards for a touchdown.', { scoring: true, yards: 80 }),
    {
      idp_int: 1,
      idp_def_td: 1,
      idp_int_td: 1,
      idp_int_ret_yd: 80,
      bonus_def_int_td_50p: 1,
    },
  );
  assert.deepEqual(
    idp('The fumble is recovered by A.Thomas and returned 55 yards for a touchdown.', { scoring: true, yards: 55 }),
    {
      idp_fr: 1,
      idp_fr_yd: 55,
      idp_def_td: 1,
      idp_fr_td: 1,
      bonus_def_fum_td_50p: 1,
    },
  );
  // Nothing specific in the sentence still credits the tackle rather than
  // silently dropping the involvement.
  assert.deepEqual(idp('Stopped after a short gain by A.Al-Shaair.'), { idp_tkl: 1 });
});

test('estimatePlayPoints is exactly the rounded scoring of the play stat delta', () => {
  const scoring = {
    pass_yd: 0.04,
    pass_td: 4,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
    idp_sack: 2,
    idp_tkl: 1,
  };
  const cases = [
    [statPlay({ description: 'J.Winston pass deep left to W.Robinson for 39 yards, TOUCHDOWN.', scoring: true, yards: 39, type: 'passing-touchdown' }), 'passer', 'QB'],
    [statPlay({ description: 'J.Winston pass deep left to W.Robinson for 39 yards, TOUCHDOWN.', scoring: true, yards: 39, type: 'passing-touchdown' }), 'receiver', 'WR'],
    [statPlay({ description: 'D.Hunter sacked F.Mendoza for -7 yards.', yards: -7 }), 'defense', 'DE'],
    [statPlay({ description: 'Stopped after a short gain.' }), 'defense', 'LB'],
  ];

  cases.forEach(([play, role, position]) => {
    const expected = Math.round(calcPoints(buildPlayStatDelta(play, role), scoring, position) * 100) / 100;
    assert.equal(estimatePlayPoints(play, role, position, scoring), expected);
  });
});

test('a row carrying only type_text still flips possession', () => {
  // BDL sends `type_text` without a slug on some summary rows. Reading only
  // type_slug/type_abbreviation left a pick-six unflipped, crediting the score
  // to the team that threw the interception.
  const pickSix = normalizeCanonicalPlay({
    type_text: 'Interception Return Touchdown',
    team: { abbreviation: 'HOU' },
    text: "Wade Woodaz 80 Yd Interception Return (Ka'imi Fairbairn Kick)",
    scoring_play: true,
  }, { gameId: 'g', ...GAME });
  assert.equal(pickSix.offenseTeam, 'LV');
  assert.equal(pickSix.defenseTeam, 'HOU');
  // The canonical slug itself stays the provider's own, for parsePlayNarrative.
  assert.equal(pickSix.typeSlug, null);

  const puntByText = normalizeCanonicalPlay({
    type_text: 'Punt',
    team: { abbreviation: 'LV' },
    text: 'A punt.',
  }, { gameId: 'g', ...GAME });
  assert.equal(puntByText.offenseTeam, 'HOU');
  assert.equal(puntByText.defenseTeam, 'LV');
});

test('the turnover-on-downs test reads the provider scoring flag, not the inferred one', () => {
  // A 4th-down snap whose sentence mentions a touchdown but whose provider flag
  // is absent must resolve the same way for both consumers.
  const raw = {
    type_slug: 'rush',
    team: { abbreviation: 'HOU' },
    start_down: 4,
    end_down: 1,
    start_distance: 5,
    stat_yardage: 2,
    text: 'Stopped short of the marker after the earlier touchdown drive.',
  };
  const canonical = normalizeCanonicalPlay(raw, { gameId: 'g', ...GAME });
  assert.equal(canonical.scoringInferred, true);
  assert.equal(canonical.scoring, null);
  // Fantasy Live's feed play carries scoring: scoringInferred; the resolver
  // must ignore it and read the provider flag off the raw row.
  assert.deepEqual(
    resolveOffenseDefenseTeams({ scoring: true, raw }, GAME),
    resolveOffenseDefenseTeams(canonical, GAME),
  );
  assert.equal(canonical.offenseTeam, 'LV');
});

test('a kickoff credits the returner to the receiving team and the tackler to the kicking team', () => {
  const kickoff = {
    id: 'ko-1',
    type_slug: 'kickoff',
    // BDL's `team` on a kick names the RECEIVING side — whoever ends up with
    // the ball — so the kicking team is the resolved offense.
    team: { abbreviation: 'DAL' },
    type_abbreviation: 'K',
    type_text: 'Kickoff',
    // Verbatim provider shape (BDL play 4017725101271): Philadelphia kicks,
    // Dallas returns, and a Philadelphia coverage player makes the tackle.
    text: 'J.Elliott kicks 57 yards from PHI 35 to DAL 8. K.Turpin to DAL 31 for 23 yards (S.Brown).',
    short_text: 'Jake Elliott 57 Yd Kickoff KaVontae Turpin 23 Yd Kickoff Return',
    stat_yardage: 23,
  };
  const game = {
    id: 'game-phi-dal',
    visitor_team: { abbreviation: 'DAL' },
    home_team: { abbreviation: 'PHI' },
    away: { id: 'DAL' },
    home: { id: 'PHI' },
  };
  const starters = [
    { id: 'turpin', player: { full_name: 'KaVontae Turpin', position: 'WR', team: 'DAL' } },
    { id: 'brown', player: { full_name: 'S.Brown', position: 'S', team: 'PHI' } },
    { id: 'elliott', player: { full_name: 'Jake Elliott', position: 'K', team: 'PHI' } },
  ];
  const events = buildPlayEvents(
    { 'game-phi-dal': [kickoff] },
    buildStarterNameIndex(starters),
    { kr_yd: 0.04, idp_tkl: 1 },
    new Map([['turpin', 'WR'], ['brown', 'S'], ['elliott', 'K']]),
    new Map([['game-phi-dal', game]]),
  );

  const returner = events.find((event) => event.playerId === 'turpin');
  const tackler = events.find((event) => event.playerId === 'brown');
  assert.ok(returner, 'the receiving team keeps its returner');
  assert.ok(tackler, 'the kicking team keeps its coverage tackle');
  assert.deepEqual(returner.stats, { kr_yd: 23 });
  assert.deepEqual(tackler.stats, { idp_tkl: 1 });

  // The kicking team is the resolved offense on the play both are attached to.
  assert.equal(returner.play.offenseTeamAbbr, 'PHI');
  assert.equal(returner.play.defenseTeamAbbr, 'DAL');
  // A punt distance is never a fantasy line, so the kicker earns nothing here.
  assert.equal(events.find((event) => event.playerId === 'elliott'), undefined);
});
