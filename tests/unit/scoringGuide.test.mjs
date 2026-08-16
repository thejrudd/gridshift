import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import { getCompanionPlayerImageUrl } from '../../src/utils/companionAssetVisuals.js';
import { SCORING_GAME_EXAMPLE_OPTIONS, SCORING_GAME_EXAMPLES, filterScoringGroups, getPositionStrengthRanking, getPreviousLeagueHistoryOptions, getScoringGameExample, getScoringGameExampleCandidates, getScoringPositionOptions, getScoringProfile, getScoringRuleMeta, isNonStandardScoringSetting, isScoringRuleRosterEligible, pickRandomScoringGameExample, pickRandomScoringGameExampleId } from '../../src/utils/scoringGuide.js';

const GROUPS = [{ label: 'Rules', stats: [
  { key: 'pass_td' }, { key: 'bonus_rec_te' }, { key: 'idp_tkl' }, { key: 'fgm' }, { key: 'def_td' }, { key: 'kr_yd' },
] }];

describe('scoring guide helpers', () => {
  it('uses only the league-enabled position groups', () => {
    assert.deepEqual(getScoringPositionOptions(['QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF', 'BN']).map((option) => option.id), ['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF']);
  });

  it('filters detailed rules by position, play type, and active value', () => {
    const scoring = { ...DEFAULT_SCORING, pass_td: 6, bonus_rec_te: 0.5, idp_tkl: 1.5, fgm: 3, def_td: 6, kr_yd: 0.1 };
    assert.deepEqual(filterScoringGroups(GROUPS, { scoring, position: 'TE' })[0].stats.map((stat) => stat.key), ['pass_td', 'bonus_rec_te', 'kr_yd']);
    assert.deepEqual(filterScoringGroups(GROUPS, { scoring, position: 'LB', playType: 'DEFENSE' })[0].stats.map((stat) => stat.key), ['idp_tkl']);
    assert.deepEqual(filterScoringGroups(GROUPS, { scoring, position: 'DEF', playType: 'DEFENSE' })[0].stats.map((stat) => stat.key), ['def_td']);
    assert.deepEqual(filterScoringGroups(GROUPS, { scoring, position: 'K', playType: 'KICKING' })[0].stats.map((stat) => stat.key), ['fgm']);
    assert.equal(getScoringRuleMeta('fgm').playTypes.has('SPECIAL_TEAMS'), false);
  });

  it('builds readable profile copy and recalculates one 2025 example for every scoring phase', () => {
    const scoring = {
      ...DEFAULT_SCORING,
      rec: 0.5, rush_yd: 0.1, rec_yd: 0.1, rec_td: 6,
      idp_tkl_solo: 0.5, idp_tkl_loss: 2, idp_pd: 3, idp_ff: 4, idp_fr: 3,
      kr_yd: 0.1, kr_td: 6,
      fgm: 0, fgm_40_49: 2.5, fgm_50_59: 3, fgm_60p: 4, xpm: 1,
    };
    assert.deepEqual(getScoringProfile(scoring, ['RB', 'DEF', 'BN']).profiles.slice(0, 2), ['Half PPR', '4-point passing TDs']);
    assert.deepEqual(SCORING_GAME_EXAMPLE_OPTIONS.map((option) => option.id), ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS', 'KICKING']);
    assert.equal(getScoringGameExample('OFFENSE', scoring).points, 28.5);
    assert.equal(getScoringGameExample('DEFENSE', scoring).points, 15.5);
    assert.equal(getScoringGameExample('SPECIAL_TEAMS', scoring).points, 23.1);
    assert.equal(getScoringGameExample('KICKING', scoring).points, 16);
    assert.deepEqual(
      getScoringGameExample('OFFENSE', scoring).breakdown.map((row) => row.label),
      ['Rush Yards', 'Rec TD', 'Rec Yards', 'Reception'],
    );
    assert.equal(
      getScoringGameExample('OFFENSE', scoring).breakdown.reduce((total, row) => total + row.pts, 0),
      getScoringGameExample('OFFENSE', scoring).points,
    );
    assert.deepEqual(
      {
        name: getScoringGameExample('SPECIAL_TEAMS', { ...DEFAULT_SCORING, def_kr_yd: 0.1 }).name,
        position: getScoringGameExample('SPECIAL_TEAMS', { ...DEFAULT_SCORING, def_kr_yd: 0.1 }).position,
        points: getScoringGameExample('SPECIAL_TEAMS', { ...DEFAULT_SCORING, def_kr_yd: 0.1 }).points,
        label: getScoringGameExample('SPECIAL_TEAMS', { ...DEFAULT_SCORING, def_kr_yd: 0.1 }).pointsLabel,
      },
      { name: 'New England Patriots', position: 'DEF', points: 17.1, label: 'D/ST pts' },
    );
    assert.equal(getScoringGameExample('SPECIAL_TEAMS', { ...DEFAULT_SCORING, kr_yd: 0.1 }).name, 'Antonio Gibson');
  });

  it('varies eligible phases without an immediate repeat', () => {
    assert.equal(
      pickRandomScoringGameExampleId(
        ['OFFENSE', 'KICKING'],
        { previousId: 'OFFENSE', random: () => 0 },
      ),
      'KICKING',
    );
    assert.equal(
      pickRandomScoringGameExampleId(
        ['OFFENSE', 'KICKING'],
        { previousId: 'KICKING', random: () => 0 },
      ),
      'OFFENSE',
    );
    assert.equal(
      pickRandomScoringGameExampleId(['KICKING'], { previousId: 'KICKING' }),
      'KICKING',
    );
    assert.equal(pickRandomScoringGameExampleId([]), null);
  });

  it('rotates through multiple curated players within a phase and excludes zero-point candidates', () => {
    assert.deepEqual(
      Object.fromEntries(Object.entries(SCORING_GAME_EXAMPLES).map(([phase, examples]) => [phase, examples.length])),
      { OFFENSE: 2, DEFENSE: 2, SPECIAL_TEAMS: 2, KICKING: 2 },
    );

    const standardOffense = {
      ...DEFAULT_SCORING,
      pass_yd: 0.04,
      pass_td: 4,
      rush_yd: 0.1,
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
    };
    const first = pickRandomScoringGameExample('OFFENSE', standardOffense, { random: () => 0 });
    const second = pickRandomScoringGameExample('OFFENSE', standardOffense, {
      previousCandidateId: first.id,
      random: () => 0,
    });

    assert.equal(first.id, 'jonathan-taylor-week-2');
    assert.equal(second.id, 'jared-goff-week-2');
    assert.notEqual(first.name, second.name);

    const rushingOnly = Object.fromEntries(Object.keys(DEFAULT_SCORING).map((key) => [key, 0]));
    rushingOnly.rush_yd = 0.1;
    assert.deepEqual(
      getScoringGameExampleCandidates('OFFENSE', rushingOnly).map((candidate) => candidate.id),
      ['jonathan-taylor-week-2'],
    );
    assert.equal(
      pickRandomScoringGameExample('OFFENSE', rushingOnly, {
        previousCandidateId: 'jonathan-taylor-week-2',
      }).id,
      'jonathan-taylor-week-2',
    );
  });

  it('provides a player-photo source for every curated individual sample', () => {
    const individualSamples = Object.values(SCORING_GAME_EXAMPLES).flat();

    assert.deepEqual(
      individualSamples.filter((sample) => !getCompanionPlayerImageUrl(sample)).map((sample) => sample.id),
      [],
    );
  });

  it('selects team or individual special-teams candidates only when that representation scores', () => {
    const noScoring = Object.fromEntries(Object.keys(DEFAULT_SCORING).map((key) => [key, 0]));

    const individualKickReturn = getScoringGameExampleCandidates(
      'SPECIAL_TEAMS',
      { ...noScoring, kr_yd: 0.1 },
      { allowTeamExample: false },
    );
    assert.deepEqual(
      individualKickReturn.map((candidate) => [candidate.id, candidate.name, candidate.isTeam ?? false]),
      [['antonio-gibson-week-2', 'Antonio Gibson', false]],
    );

    const teamPuntReturn = getScoringGameExampleCandidates(
      'SPECIAL_TEAMS',
      { ...noScoring, def_pr_yd: 0.1 },
      { allowTeamExample: true },
    );
    assert.deepEqual(
      teamPuntReturn.map((candidate) => [candidate.id, candidate.name, candidate.isTeam]),
      [['malik-washington-week-2', 'Miami Dolphins', true]],
    );
    assert.deepEqual(
      getScoringGameExampleCandidates(
        'SPECIAL_TEAMS',
        { ...noScoring, def_pr_yd: 0.1 },
        { allowTeamExample: false },
      ),
      [],
    );

    assert.deepEqual(
      getScoringGameExampleCandidates(
        'SPECIAL_TEAMS',
        { ...noScoring, st_td: 6 },
        { allowTeamExample: false, rosterPositions: ['RB', 'WR'] },
      ).map((candidate) => candidate.id),
      ['antonio-gibson-week-2', 'malik-washington-week-2'],
    );

    assert.deepEqual(
      getScoringGameExampleCandidates(
        'SPECIAL_TEAMS',
        { ...noScoring, def_pr_yd: 0.1 },
        { allowTeamExample: true, rosterPositions: ['TST'] },
      ).map((candidate) => [candidate.id, candidate.position]),
      [['malik-washington-week-2', 'DEF']],
    );
  });

  it('keeps player samples within roster-eligible positions', () => {
    const scoring = {
      ...DEFAULT_SCORING,
      pass_yd: 0.04,
      pass_td: 4,
      rush_yd: 0.1,
      rec_yd: 0.1,
      rec_td: 6,
    };

    assert.deepEqual(
      getScoringGameExampleCandidates(
        'OFFENSE',
        scoring,
        { rosterPositions: ['QB'] },
      ).map((candidate) => candidate.id),
      ['jared-goff-week-2'],
    );
  });

  it('surfaces reception premiums with their effective per-catch value', () => {
    const scoring = { ...DEFAULT_SCORING, rec: 0.5, bonus_rec_te: 1 };
    const profile = getScoringProfile(scoring, ['QB', 'RB', 'WR', 'TE', 'FLEX']);
    const tightEndRule = profile.coreRules.find((rule) => rule.id === 'te-reception');

    assert.equal(profile.title, 'Half PPR · TE premium');
    assert.equal(profile.summary, 'Tight ends earn 1.5 points per catch—1 more than the league baseline.');
    assert.deepEqual(tightEndRule, {
      id: 'te-reception',
      label: 'Tight end reception',
      value: '1.5 pts',
      detail: '+1 vs. baseline',
      emphasis: true,
    });
  });

  it('identifies IDP leagues and surfaces representative defensive scoring', () => {
    const scoring = {
      ...DEFAULT_SCORING,
      rec: 1,
      bonus_rec_te: 0.25,
      idp_tkl_solo: 0.5,
      idp_sack: 5,
      idp_int: 6,
    };
    const profile = getScoringProfile(scoring, ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX', 'IDP_FLEX']);
    const idpUnit = profile.units.find((unit) => unit.id === 'IDP');

    assert.equal(profile.title, 'Full PPR · IDP');
    assert.deepEqual(profile.facts, ['TE premium', 'Superflex', '4-point passing TDs']);
    assert.equal(profile.coreRules.find((rule) => rule.id === 'idp-tackle').value, '0.5 pts');
    assert.equal(profile.coreRules.find((rule) => rule.id === 'idp-impact-play').value, '5 / 6');
    assert.equal(idpUnit.detail, '0.5 solo tackle · 5 sack · 6 interception');
  });

  it('hides IDP scoring when the league has no IDP roster slots', () => {
    const scoring = { ...DEFAULT_SCORING, idp_tkl_solo: 1, idp_sack: 3, idp_int: 5 };
    const profile = getScoringProfile(scoring, ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF']);

    assert.equal(profile.hasIDPScoring, false);
    assert.equal(profile.coreRules.some((rule) => rule.id.startsWith('idp-')), false);
    assert.equal(profile.units.some((unit) => unit.id === 'IDP'), false);
    assert.deepEqual(
      filterScoringGroups(GROUPS, { scoring, includeIDP: false })[0].stats.map((stat) => stat.key),
      ['pass_td'],
    );
  });

  it('ranks enabled positions by the top-eight average and reports distinct depth bands', () => {
    const players = {
      qb1: { position: 'QB' }, qb2: { position: 'QB' },
      rb1: { position: 'RB' }, rb2: { position: 'RB' }, rb3: { position: 'RB' },
      lb1: { position: 'LB' },
    };
    const seasonStats = {
      qb1: { gp: 2, pass_td: 8 }, qb2: { gp: 2, pass_td: 6 },
      rb1: { gp: 2, rush_td: 6 }, rb2: { gp: 2, rush_td: 4 }, rb3: { gp: 2, rush_td: 2 },
      lb1: { gp: 2, idp_tkl_solo: 20 },
    };
    const rows = getPositionStrengthRanking({
      players,
      seasonStats,
      scoring: { ...DEFAULT_SCORING, pass_td: 4, rush_td: 6, idp_tkl_solo: 1 },
      rosterPositions: ['QB', 'RB', 'FLEX'],
    });

    assert.deepEqual(rows, [
      { position: 'QB', top8: 14, nineTo16: null, seventeenTo32: null, playerCount: 2, rank: 1 },
      { position: 'RB', top8: 12, nineTo16: null, seventeenTo32: null, playerCount: 3, rank: 2 },
    ]);
  });

  it('marks values that differ from the app scoring baseline', () => {
    assert.equal(isNonStandardScoringSetting('pass_td', 4), false);
    assert.equal(isNonStandardScoringSetting('pass_td', 6), true);
    assert.equal(isNonStandardScoringSetting('bonus_rec_te', 0.25), true);
    assert.equal(isNonStandardScoringSetting('idp_sack', 0), false);
  });

  it('offers only participated historical seasons before the league season being viewed', () => {
    const currentLeague = { league_id: 'league-2026', season: '2026' };
    const previousLeague = { league_id: 'league-2025', season: '2025' };
    const olderLeague = { league_id: 'league-2023', season: '2023' };
    const linkedHistory = [
      { season: '2026', league: currentLeague },
      { season: '2025', league: previousLeague },
      { season: '2023', league: olderLeague },
    ];

    assert.deepEqual(
      getPreviousLeagueHistoryOptions(linkedHistory, '2026').map((entry) => entry.season),
      ['2025', '2023'],
    );
    assert.deepEqual(
      getPreviousLeagueHistoryOptions(linkedHistory, '2025').map((entry) => entry.season),
      ['2023'],
    );
    assert.deepEqual(getPreviousLeagueHistoryOptions(linkedHistory, null), []);
  });

  it('recalculates historical production with the current league rules', () => {
    const historicalStats = {
      receiver: { rec: 10, rec_yd: 100, gp: 1 },
    };
    const players = {
      receiver: { position: 'WR' },
    };
    const currentRules = { ...DEFAULT_SCORING, rec: 1, rec_yd: 0.1 };
    const priorRules = { ...currentRules, rec: 0.5 };

    const currentRuleRanking = getPositionStrengthRanking({
      seasonStats: historicalStats,
      players,
      scoring: currentRules,
      rosterPositions: ['WR'],
    });
    const priorRuleRanking = getPositionStrengthRanking({
      seasonStats: historicalStats,
      players,
      scoring: priorRules,
      rosterPositions: ['WR'],
    });

    assert.equal(currentRuleRanking[0].top8, 20);
    assert.equal(priorRuleRanking[0].top8, 15);
  });

  it('separates D/ST special-teams rules from team defense and kicker scoring', () => {
    const scoring = {
      ...DEFAULT_SCORING,
      rec: 0.5,
      fgm: 3,
      xpm: 1,
      def_td: 0,
      sack: 0,
      int: 0,
      pts_allow_0: 0,
      def_st_tkl_solo: 1,
    };
    const profile = getScoringProfile(scoring, ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
    const units = Object.fromEntries(profile.units.map((unit) => [unit.id, unit]));

    assert.equal(units.KICKING.status, 'Active');
    assert.match(units.KICKING.detail, /field goals/);
    assert.equal(units.DEFENSE.status, 'Special teams only');
    assert.match(units.DEFENSE.detail, /not defensive plays/);
    assert.equal(units.SPECIAL_TEAMS.status, 'Active');
    assert.doesNotMatch(units.SPECIAL_TEAMS.detail, /kicking|field goals|extra points/i);

    const noDstProfile = getScoringProfile({ ...scoring, def_td: 6 }, ['QB', 'RB', 'WR', 'TE', 'K']);
    const noDstUnit = noDstProfile.units.find((unit) => unit.id === 'DEFENSE');
    assert.equal(noDstUnit.status, 'Not rostered');
    assert.match(noDstUnit.detail, /no D\/ST roster slot/);
  });

  it('presents only roster-eligible methodology while retaining configured rules in the All reference', () => {
    const scoring = {
      ...DEFAULT_SCORING,
      kr_td: 6,
      def_kr_yd: 0.1,
      def_td: 6,
      idp_tkl_solo: 1,
    };
    const rosterPositions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];
    const profile = getScoringProfile(scoring, rosterPositions);
    const specialTeams = profile.units.find((unit) => unit.id === 'SPECIAL_TEAMS');
    const groups = [{ label: 'Eligibility', stats: [
      { key: 'kr_td' },
      { key: 'def_kr_yd' },
      { key: 'def_td' },
      { key: 'idp_tkl_solo' },
    ] }];

    assert.equal(specialTeams.status, 'Active');
    assert.match(specialTeams.detail, /^Rostered individual players · /);
    assert.equal(profile.availableExampleIds.includes('DEFENSE'), false);
    assert.equal(profile.availableExampleIds.includes('SPECIAL_TEAMS'), true);
    assert.equal(isScoringRuleRosterEligible('kr_td', rosterPositions), true);
    assert.equal(isScoringRuleRosterEligible('def_kr_yd', rosterPositions), false);
    assert.equal(isScoringRuleRosterEligible('def_kr_yd', ['TST']), true);
    assert.equal(isScoringRuleRosterEligible('def_td', ['TST']), false);
    assert.equal(isScoringRuleRosterEligible('bonus_def_int_td_50p', ['DEF']), true);
    assert.equal(isScoringRuleRosterEligible('bonus_def_int_td_50p', ['LB']), true);
    assert.deepEqual(
      filterScoringGroups(groups, {
        scoring,
        rosterPositions,
        includeIDP: false,
        showActiveOnly: true,
      })[0].stats.map((stat) => stat.key),
      ['kr_td'],
    );
    assert.deepEqual(
      filterScoringGroups(groups, {
        scoring,
        rosterPositions,
        includeIDP: false,
        showActiveOnly: false,
      })[0].stats.map((stat) => stat.key),
      ['kr_td', 'def_kr_yd', 'def_td', 'idp_tkl_solo'],
    );
    assert.equal(
      getScoringGameExample('SPECIAL_TEAMS', scoring, { allowTeamExample: false }).name,
      'Antonio Gibson',
    );

    const impossibleBonuses = getScoringProfile({
      ...DEFAULT_SCORING,
      bonus_rec_te: 1,
      bonus_def_int_td_50p: 2,
    }, ['QB', 'RB', 'WR']);
    assert.equal(impossibleBonuses.activeBonusCount, 0);
    assert.equal(impossibleBonuses.premiumRules.length, 0);
    assert.equal(impossibleBonuses.coreRules.some((rule) => rule.id === 'te-reception'), false);
  });
});
