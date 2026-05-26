import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyEspnBigPlayBonusesToWeeklyStats,
  getEspnScoringPlayBigPlayBonuses,
} from '../../src/utils/espnBigPlayBonuses.js';
import { calcPoints, importEspnScoringProfile } from '../../src/utils/scoringEngine.js';

const bakerWeekFourBase = {
  week: 4,
  pass_cmp: 22,
  pass_inc: 18,
  pass_yd: 289,
  pass_td: 2,
  pass_int: 1,
  pass_sack: 2,
  rush_att: 2,
  rush_yd: 13,
  team_loss: 1,
  gp: 1,
};

const bakerRowsByWeek = {
  4: bakerWeekFourBase,
  5: {
    week: 5,
    pass_cmp: 29,
    pass_inc: 4,
    pass_yd: 379,
    pass_td: 2,
    pass_sack: 1,
    rush_att: 5,
    rush_yd: 15,
    team_win: 1,
    bonus_pass_yd_300: 1,
    gp: 1,
  },
  6: {
    week: 6,
    pass_cmp: 17,
    pass_inc: 6,
    pass_yd: 256,
    pass_td: 2,
    pass_sack: 1,
    rush_att: 3,
    rush_yd: 14,
    team_win: 1,
    gp: 1,
  },
  15: {
    week: 15,
    pass_cmp: 19,
    pass_inc: 15,
    pass_yd: 277,
    pass_td: 2,
    pass_int: 1,
    pass_sack: 5,
    rush_att: 1,
    rush_yd: 1,
    team_loss: 1,
    gp: 1,
  },
};

const leagueScoring = importEspnScoringProfile({
  scoringItems: [
    { statId: 1, points: 0.5 },
    { statId: 2, points: -0.5 },
    { statId: 3, points: 0.2 },
    { statId: 4, points: 4 },
    { statId: 15, points: 3 },
    { statId: 16, points: 5 },
    { statId: 17, points: 3 },
    { statId: 19, points: 2 },
    { statId: 20, points: -3 },
    { statId: 23, points: 0.1 },
    { statId: 24, points: 0.5 },
    { statId: 64, points: -2 },
    { statId: 155, points: 3 },
    { statId: 156, points: -3 },
  ],
});

describe('ESPN big-play bonus enrichment', () => {
  it('derives stacked 40+ and 50+ passing TD bonuses from ESPN scoring plays', () => {
    const players = {
      'espn:3052587': { full_name: 'Baker Mayfield', position: 'QB', team: 'TB' },
      'espn:4430807': { full_name: 'Emeka Egbuka', position: 'WR', team: 'TB' },
      'espn:4683062': { full_name: 'Bucky Irving', position: 'RB', team: 'TB' },
      'espn:4040715': { full_name: 'Chris Godwin Jr.', position: 'WR', team: 'TB' },
    };
    const scoringPlays = [
      { type: { text: 'Passing Touchdown' }, text: 'Emeka Egbuka 77 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
      { type: { text: 'Passing Touchdown' }, text: 'Bucky Irving 72 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
      { type: { text: 'Passing Touchdown' }, text: 'Chris Godwin Jr. 3 Yd pass from Baker Mayfield (Baker Mayfield Pass to Chris Godwin Jr. for Two-Point Conversion)' },
    ];

    const bonuses = getEspnScoringPlayBigPlayBonuses(scoringPlays, players);

    assert.deepEqual(bonuses['espn:3052587'], {
      pass_td_40p: 2,
      pass_td_50p: 2,
      pass_2pt: 1,
    });
    assert.deepEqual(bonuses['espn:4430807'], {
      rec_td_40p: 1,
      rec_td_50p: 1,
    });
    assert.deepEqual(bonuses['espn:4683062'], {
      rec_td_40p: 1,
      rec_td_50p: 1,
    });
    assert.equal(bonuses['espn:3052587'].pass_2pt, 1);
    assert.equal(bonuses['espn:4040715'].rec_2pt, 1);
  });

  it('brings Baker Mayfield Week 4 into alignment with ESPN scoring', () => {
    const players = {
      'espn:3052587': { full_name: 'Baker Mayfield', position: 'QB', team: 'TB' },
      'espn:4430807': { full_name: 'Emeka Egbuka', position: 'WR', team: 'TB' },
      'espn:4683062': { full_name: 'Bucky Irving', position: 'RB', team: 'TB' },
    };
    const weeklyStats = {
      'espn:3052587': [{
        ...bakerWeekFourBase,
        _fantasyPoints: 64.5,
        fantasy_points: 64.5,
        _fantasyContributions: { pass_td: 8 },
      }],
    };
    const bonuses = getEspnScoringPlayBigPlayBonuses([
      { type: { text: 'Passing Touchdown' }, text: 'Emeka Egbuka 77 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
      { type: { text: 'Passing Touchdown' }, text: 'Bucky Irving 72 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
    ], players);

    const enriched = applyEspnBigPlayBonusesToWeeklyStats(weeklyStats, 4, bonuses);
    const row = enriched['espn:3052587'][0];

    assert.equal(calcPoints(bakerWeekFourBase, leagueScoring, 'QB'), 64.5);
    assert.equal(row.pass_td_40p, 2);
    assert.equal(row.pass_td_50p, 2);
    assert.equal(row._fantasyPoints, undefined);
    assert.equal(row._fantasyContributions, undefined);
    assert.equal(calcPoints(row, leagueScoring, 'QB'), 80.5);
  });

  it('aligns Baker Mayfield mismatched 2025 ESPN weeks from scoring plays', () => {
    const players = {
      'espn:3052587': { full_name: 'Baker Mayfield', position: 'QB', team: 'TB' },
      'espn:4430807': { full_name: 'Emeka Egbuka', position: 'WR', team: 'TB' },
      'espn:4683062': { full_name: 'Bucky Irving', position: 'RB', team: 'TB' },
      'espn:4567048': { full_name: 'Tez Johnson', position: 'WR', team: 'TB' },
      'espn:4040715': { full_name: 'Chris Godwin Jr.', position: 'WR', team: 'TB' },
    };
    const weeklyStats = {
      'espn:3052587': [
        { ...bakerRowsByWeek[4], _fantasyPoints: 64.5 },
        { ...bakerRowsByWeek[5], _fantasyPoints: 108.3 },
        { ...bakerRowsByWeek[6], _fantasyPoints: 73 },
        { ...bakerRowsByWeek[15], _fantasyPoints: 50 },
      ],
    };
    const scoringPlaysByWeek = {
      4: [
        { type: { text: 'Passing Touchdown' }, text: 'Emeka Egbuka 77 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
        { type: { text: 'Passing Touchdown' }, text: 'Bucky Irving 72 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
      ],
      5: [
        { type: { text: 'Passing Touchdown' }, text: 'Emeka Egbuka 20 Yd pass from Baker Mayfield (Baker Mayfield Pass to Emeka Egbuka for Two-Point Conversion)' },
      ],
      6: [
        { type: { text: 'Passing Touchdown' }, text: 'Kameron Johnson 34 Yd pass from Baker Mayfield (Two-Point Run Conversion Failed)' },
        { type: { text: 'Passing Touchdown' }, text: 'Tez Johnson 45 Yd pass from Baker Mayfield (Chase McLaughlin Kick)' },
      ],
      15: [
        { type: { text: 'Passing Touchdown' }, text: 'Chris Godwin Jr. 3 Yd pass from Baker Mayfield (Baker Mayfield Pass to Chris Godwin Jr. for Two-Point Conversion)' },
      ],
    };

    let enriched = weeklyStats;
    for (const [week, scoringPlays] of Object.entries(scoringPlaysByWeek)) {
      const bonuses = getEspnScoringPlayBigPlayBonuses(scoringPlays, players);
      enriched = applyEspnBigPlayBonusesToWeeklyStats(enriched, Number(week), bonuses);
    }

    const byWeek = new Map(enriched['espn:3052587'].map((row) => [row.week, row]));
    assert.equal(calcPoints(byWeek.get(4), leagueScoring, 'QB'), 80.5);
    assert.equal(calcPoints(byWeek.get(5), leagueScoring, 'QB'), 110.3);
    assert.equal(calcPoints(byWeek.get(6), leagueScoring, 'QB'), 76);
    assert.equal(calcPoints(byWeek.get(15), leagueScoring, 'QB'), 52);
    assert.equal(byWeek.get(5).pass_2pt, 1);
    assert.equal(byWeek.get(6).pass_td_40p, 1);
    assert.equal(byWeek.get(15).pass_2pt, 1);
  });

  it('clears stale ESPN applied totals when bonus counters already exist', () => {
    const weeklyStats = {
      'espn:3052587': [{
        ...bakerWeekFourBase,
        pass_td_40p: 2,
        pass_td_50p: 2,
        _fantasyPoints: 64.5,
        fantasy_points: 64.5,
        _espnAppliedStats: { 4: 8 },
      }],
    };

    const enriched = applyEspnBigPlayBonusesToWeeklyStats(weeklyStats, 4, {
      'espn:3052587': {
        pass_td_40p: 2,
        pass_td_50p: 2,
      },
    });
    const row = enriched['espn:3052587'][0];

    assert.equal(row.pass_td_40p, 2);
    assert.equal(row.pass_td_50p, 2);
    assert.equal(row._fantasyPoints, undefined);
    assert.equal(row._espnAppliedStats, undefined);
    assert.equal(calcPoints(row, leagueScoring, 'QB'), 80.5);
  });
});
