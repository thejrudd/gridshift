import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcPoints,
  calcPointsFromTotals,
  DEFAULT_SCORING,
  getEspnAppliedStatFallbackId,
  getEspnDstScoringIndexAudit,
  getEspnScoringImportAudit,
  importEspnScoringProfile,
  importLeagueScoring,
  isEspnAppliedStatFallbackKey,
  mapEspnStatIdToContributionKey,
  mapEspnStatIdToScoringKey,
  mapEspnStatIdToSettingKey,
  normalizeScoringProfile,
} from '../../src/utils/scoringEngine.js';

describe('scoring engine provider profiles', () => {
  it('keeps flat Sleeper-style scoring unchanged', () => {
    const scoring = { ...DEFAULT_SCORING, pass_td: 4, pass_yd: 0.04, rec: 1 };
    const points = calcPoints({ pass_yd: 250, pass_td: 2, rec: 5 }, scoring, 'QB');
    assert.equal(points, 23);
  });

  it('applies ESPN position overrides by player position', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 24, points: 0.1, pointsOverrides: { 0: 0.05, 2: 0.2 } },
      ],
    });

    assert.equal(calcPoints({ rush_yd: 10 }, profile, 'QB'), 0.5);
    assert.equal(calcPoints({ rush_yd: 10 }, profile, 'RB'), 2);
    assert.equal(calcPoints({ rush_yd: 10 }, profile, 'WR'), 1);
  });

  it('uses ESPN applied fantasy totals before recalculating raw stats', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [{ statId: 24, points: 0.1 }],
    });

    assert.equal(calcPoints({ rush_yd: 999, _fantasyPoints: 7.25 }, profile, 'RB'), 7.25);
    assert.equal(calcPointsFromTotals({ rush_yd: 1000, _fantasyPoints: 101.4 }, profile, 'RB'), 101.4);
  });

  it('uses ESPN applied stat contributions before recalculating raw stats', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 24, points: 0.1 },
        { statId: 53, points: 1 },
      ],
    });

    assert.equal(
      calcPoints({ rush_yd: 999, rec: 99, _fantasyContributions: { rush_yd: 4.4, rec: 2.1 } }, profile, 'RB'),
      6.5,
    );
  });

  it('maps common ESPN stat IDs to normalized stat keys', () => {
    assert.equal(mapEspnStatIdToScoringKey(2), 'pass_inc');
    assert.equal(mapEspnStatIdToScoringKey(3), 'pass_yd');
    assert.equal(mapEspnStatIdToSettingKey(15), 'bonus_pass_td_40p');
    assert.equal(mapEspnStatIdToScoringKey(24), 'rush_yd');
    assert.equal(mapEspnStatIdToScoringKey(35), 'rush_td_40p');
    assert.equal(mapEspnStatIdToSettingKey(23), 'rush_att');
    assert.equal(mapEspnStatIdToSettingKey(37), 'bonus_rush_yd_100');
    assert.equal(mapEspnStatIdToSettingKey(64), 'pass_sack');
    assert.equal(mapEspnStatIdToSettingKey(80), 'fgm_0_39');
    assert.equal(mapEspnStatIdToSettingKey(93), 'blk_kick_ret_td');
    assert.equal(mapEspnStatIdToSettingKey(100), 'sack_half');
    assert.equal(mapEspnStatIdToSettingKey(110), 'tkl_3');
    assert.equal(mapEspnStatIdToSettingKey(111), 'tkl_5');
    assert.equal(mapEspnStatIdToSettingKey(112), 'tkl_loss');
    assert.equal(mapEspnStatIdToSettingKey(114), 'kr_yd');
    assert.equal(mapEspnStatIdToSettingKey(114, { position: 'DEF' }), 'def_kr_yd');
    assert.equal(mapEspnStatIdToSettingKey(115), 'pr_yd');
    assert.equal(mapEspnStatIdToSettingKey(115, { position: 'DEF' }), 'def_pr_yd');
    assert.equal(mapEspnStatIdToSettingKey(116), 'def_kr_yd_10');
    assert.equal(mapEspnStatIdToSettingKey(187), 'pts_allow');
    assert.equal(mapEspnStatIdToSettingKey(192), 'pts_allow_18_21');
    assert.equal(mapEspnStatIdToSettingKey(121), 'pts_allow_18_21');
    assert.equal(mapEspnStatIdToSettingKey(155), 'team_win');
    assert.equal(mapEspnStatIdToSettingKey(156), 'team_loss');
    assert.equal(mapEspnStatIdToSettingKey(209), 'def_1pt_safe');
  });

  it('creates per-stat fallback keys for unmapped ESPN applied scoring IDs', () => {
    const key = mapEspnStatIdToContributionKey(9999);

    assert.equal(key, 'espn_stat_9999');
    assert.equal(isEspnAppliedStatFallbackKey(key), true);
    assert.equal(getEspnAppliedStatFallbackId(key), '9999');
    assert.equal(mapEspnStatIdToSettingKey(9999), null);
  });

  it('imports ESPN scoring IDs needed for QB raw-stat fallback scoring', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 1, points: 0.5 },
        { statId: 2, points: -0.5 },
        { statId: 3, points: 0.2 },
        { statId: 4, points: 4 },
        { statId: 20, points: -3 },
        { statId: 23, points: 0.1 },
        { statId: 24, points: 0.5 },
        { statId: 64, points: -2 },
      ],
    });

    assert.equal(profile.settings.pass_inc, -0.5);
    assert.equal(profile.settings.rush_att, 0.1);
    assert.equal(profile.settings.bonus_rush_att, DEFAULT_SCORING.bonus_rush_att);
    assert.equal(
      calcPoints({
        pass_cmp: 17,
        pass_inc: 15,
        pass_yd: 167,
        pass_td: 3,
        rush_att: 5,
        rush_yd: 39,
      }, profile, 'QB'),
      66.4,
    );
  });

  it('counts ESPN team result scoring without importing it into Sleeper profiles', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 155, points: 3 },
        { statId: 156, points: -3 },
      ],
    });

    assert.equal(profile.settings.team_win, 3);
    assert.equal(profile.settings.team_loss, -3);
    assert.equal(calcPoints({ pass_td: 1, team_win: 1 }, profile, 'QB'), 7);
    assert.equal(calcPoints({ pass_td: 1, team_loss: 1 }, profile, 'QB'), 1);
    assert.deepEqual(importLeagueScoring({ team_win: 3, team_loss: -3 }), {});
    assert.equal(calcPoints({ pass_td: 1, team_win: 1 }, { ...DEFAULT_SCORING, pass_td: 4 }, 'QB'), 4);
  });

  it('keeps ESPN D/ST interval scoring in separate columns', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 100, points: 0.5 },
        { statId: 110, points: 1 },
        { statId: 111, points: 2 },
        { statId: 112, points: 0.5 },
        { statId: 116, points: 1 },
      ],
    });

    assert.equal(profile.settings.sack_half, 0.5);
    assert.equal(profile.settings.tkl_3, 1);
    assert.equal(profile.settings.tkl_5, 2);
    assert.equal(profile.settings.tkl_loss, 0.5);
    assert.equal(profile.settings.def_kr_yd_10, 1);
    assert.equal(calcPoints({
      sack_half: 5,
      tkl_3: 10,
      tkl_5: 6,
      tkl_loss: 7,
      def_kr_yd_10: 4,
    }, profile, 'DEF'), 32);
  });

  it('audits the ESPN D/ST scoring-index test league by unique point values', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 53, points: 1 },
        { statId: 114, points: 39, pointsOverrides: { 16: 1 } },
        { statId: 115, points: 40, pointsOverrides: { 16: 2 } },
        { statId: 112, points: 15 },
        { statId: 205, points: 37 },
        { statId: 209, points: 52, pointsOverrides: { 16: 38 } },
        { statId: 99, points: 3 },
      ],
    });
    const audit = getEspnDstScoringIndexAudit(profile);
    const byPoints = new Map(audit.rows.map((row) => [row.indexPoints, row]));

    assert.equal(byPoints.get(1).statId, 114);
    assert.equal(byPoints.get(1).gridshiftKey, 'def_kr_yd');
    assert.equal(byPoints.get(1).indexSource, 'override');
    assert.equal(byPoints.get(1).indexPosition, 'DEF');
    assert.equal(byPoints.get(1).status, 'match');
    assert.equal(byPoints.get(15).expectedKey, 'tkl_loss');
    assert.equal(byPoints.get(15).gridshiftKey, 'tkl_loss');
    assert.equal(byPoints.get(15).status, 'match');
    assert.equal(byPoints.get(37).gridshiftKey, 'def_2pt');
    assert.equal(byPoints.get(37).status, 'match');
    assert.equal(byPoints.get(38).expectedKey, 'def_1pt_safe');
    assert.equal(byPoints.get(38).gridshiftKey, 'def_1pt_safe');
    assert.equal(byPoints.get(38).status, 'match');
    assert.equal(byPoints.get(39).gridshiftKey, 'kr_yd');
    assert.equal(byPoints.get(39).status, 'match');
    assert.equal(byPoints.get(40).gridshiftKey, 'pr_yd');
    assert.equal(byPoints.get(40).status, 'match');
    assert.equal(byPoints.get(52).gridshiftKey, 'def_1pt_safe');
    assert.equal(byPoints.get(52).status, 'match');
    assert.equal(byPoints.get(3).gridshiftKey, 'sack');
    assert.equal(byPoints.get(3).status, 'match');
  });

  it('keeps raw ESPN scoring items available for import audits', () => {
    const profile = importEspnScoringProfile({
      scoringItems: [
        { statId: 24, points: 0.1, pointsOverrides: { 2: 0.2 } },
        { statId: 9999, points: 3 },
      ],
    });
    const audit = getEspnScoringImportAudit(profile);

    assert.equal(profile.sourceMeta.rawScoringItems.length, 2);
    assert.equal(audit.rows[0].gridshiftKey, 'rush_yd');
    assert.equal(audit.rows[0].espnPositionOverrides.RB, 0.2);
    assert.equal(audit.unmappedRows[0].statId, 9999);
  });

  it('re-keys legacy persisted ESPN stat maps after mapping fixes', () => {
    const profile = normalizeScoringProfile({
      provider: 'espn',
      settings: {
        ...DEFAULT_SCORING,
        pass_inc: 0,
        bonus_rush_att: 0.1,
        fum: 3,
        pts_allow_21_27: 6,
      },
      positionOverrides: {
        RB: { bonus_rush_att: 0.2 },
      },
      sourceMeta: {
        provider: 'espn',
        rawScoringItems: [
          { statId: 2, points: -0.5, pointsOverrides: {}, mappedKey: null },
          { statId: 23, points: 0.1, pointsOverrides: { RB: 0.2 }, mappedKey: 'bonus_rush_att' },
        ],
        statIdMap: {
          23: 'bonus_rush_att',
          35: 'fum',
          93: 'pts_allow_21_27',
        },
      },
    }, 'espn');

    assert.equal(profile.settings.pass_inc, -0.5);
    assert.equal(profile.settings.rush_att, 0.1);
    assert.equal(profile.settings.bonus_rush_att, DEFAULT_SCORING.bonus_rush_att);
    assert.equal(profile.settings.bonus_rush_td_40p, 3);
    assert.equal(profile.settings.fum, DEFAULT_SCORING.fum);
    assert.equal(profile.settings.blk_kick_ret_td, 6);
    assert.equal(profile.settings.pts_allow_21_27, DEFAULT_SCORING.pts_allow_21_27);
    assert.equal(profile.positionOverrides.RB.rush_att, 0.2);
    assert.equal(profile.sourceMeta.rawScoringItems[0].mappedKey, 'pass_inc');
    assert.equal(profile.sourceMeta.rawScoringItems[1].mappedKey, 'rush_att');
    assert.equal(profile.sourceMeta.statIdMap[35], 'bonus_rush_td_40p');
  });
});
