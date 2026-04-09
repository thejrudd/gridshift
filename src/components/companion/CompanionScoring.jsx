import { useState } from 'react';
import { useSleeperLeague } from '../../context/SleeperContext';
import {
  DEFAULT_SCORING, importLeagueScoring,
} from '../../utils/scoringEngine';
import { formatScoringSettingValue } from '../../utils/scoringDisplay';

const STAT_GROUPS = [
  {
    label: 'Passing',
    stats: [
      { key: 'pass_yd',   label: 'Passing Yards', note: 'pts / yd' },
      { key: 'pass_td',   label: 'Passing TD' },
      { key: 'pass_int',    label: 'Interception (thrown)' },
      { key: 'pass_int_td', label: 'Pick 6 Thrown', note: 'additional penalty when INT returned for TD' },
      { key: 'pass_2pt',  label: '2-Pt Conversion Pass' },
      { key: 'pass_sack', label: 'Sack Taken' },
      { key: 'pass_cmp',  label: 'Completion' },
      { key: 'pass_att',  label: 'Pass Attempt' },
      { key: 'pass_inc',  label: 'Incomplete Pass' },
      { key: 'pass_fd',   label: 'First Down (pass)' },
    ],
  },
  {
    label: 'Rushing',
    stats: [
      { key: 'rush_yd',        label: 'Rushing Yards', note: 'pts / yd' },
      { key: 'rush_td',        label: 'Rushing TD' },
      { key: 'rush_2pt',       label: '2-Pt Conversion Rush' },
      { key: 'rush_fd',        label: 'First Down (rush)' },
      { key: 'bonus_rush_att', label: 'Carry Bonus', note: 'extra pts/carry (RBs only)' },
    ],
  },
  {
    label: 'Receiving',
    stats: [
      { key: 'rec',          label: 'Reception' },
      { key: 'rec_yd',       label: 'Receiving Yards', note: 'pts / yd' },
      { key: 'rec_td',       label: 'Receiving TD' },
      { key: 'rec_2pt',      label: '2-Pt Conversion Rec' },
      { key: 'rec_fd',       label: 'First Down (rec)' },
      { key: 'bonus_rec_te', label: 'TE Reception Bonus', note: 'extra pts/catch (TEs only)' },
      { key: 'bonus_rec_rb', label: 'RB Reception Bonus', note: 'extra pts/catch (RBs only)' },
      { key: 'bonus_rec_wr', label: 'WR Reception Bonus', note: 'extra pts/catch (WRs only)' },
    ],
  },
  {
    label: 'Tiered Reception Bonuses',
    stats: [
      { key: 'rec_0_4',   label: 'Reception 0–4 yds', note: 'pts/catch' },
      { key: 'rec_5_9',   label: 'Reception 5–9 yds', note: 'pts/catch' },
      { key: 'rec_10_19', label: 'Reception 10–19 yds', note: 'pts/catch' },
      { key: 'rec_20_29', label: 'Reception 20–29 yds', note: 'pts/catch' },
      { key: 'rec_30_39', label: 'Reception 30–39 yds', note: 'pts/catch' },
    ],
  },
  {
    label: 'Position First Down Bonuses',
    stats: [
      { key: 'bonus_fd_qb', label: 'QB First Down Bonus', note: 'extra pts/FD (pass + rush)' },
      { key: 'bonus_fd_rb', label: 'RB First Down Bonus', note: 'extra pts/FD (rush + rec)' },
      { key: 'bonus_fd_wr', label: 'WR First Down Bonus', note: 'extra pts/FD (rec)' },
      { key: 'bonus_fd_te', label: 'TE First Down Bonus', note: 'extra pts/FD (rec)' },
    ],
  },
  {
    label: 'Misc / Fumbles',
    stats: [
      { key: 'fum',         label: 'Fumble' },
      { key: 'fum_lost',    label: 'Fumble Lost' },
      { key: 'fum_rec',     label: 'Fumble Recovery (off)' },
      { key: 'fum_ret_td',  label: 'Fumble Recovery TD' },
      { key: 'st_td',       label: 'Special Teams TD' },
      { key: 'ret_td',      label: 'Return TD (kick / punt)' },
      { key: 'blk_kick',    label: 'Blocked Kick' },
    ],
  },
  {
    label: 'Special Teams — Player',
    stats: [
      { key: 'kr_yd',          label: 'Kick Return Yards', note: 'pts / yd' },
      { key: 'pr_yd',          label: 'Punt Return Yards', note: 'pts / yd' },
      { key: 'st_tkl_solo',    label: 'ST Solo Tackle' },
      { key: 'blk_kick_ret_yd', label: 'Blocked Kick Return Yds', note: 'pts / yd' },
      { key: 'fg_ret_yd',      label: 'Missed FG Return Yards', note: 'pts / yd' },
      { key: 'fum_ret_yd',     label: 'Fumble Return Yards (player)', note: 'pts / yd' },
    ],
  },
  {
    label: 'Yardage Bonuses',
    stats: [
      { key: 'bonus_pass_yd_300',     label: '300+ Pass Yds (game)' },
      { key: 'bonus_pass_yd_400',     label: '400+ Pass Yds (game)' },
      { key: 'bonus_rush_yd_100',     label: '100+ Rush Yds (game)' },
      { key: 'bonus_rush_yd_200',     label: '200+ Rush Yds (game)' },
      { key: 'bonus_rec_yd_100',      label: '100+ Rec Yds (game)' },
      { key: 'bonus_rec_yd_200',      label: '200+ Rec Yds (game)' },
      { key: 'bonus_rush_rec_yd_100', label: '100+ Rush+Rec Yds (game)' },
      { key: 'bonus_rush_rec_yd_200', label: '200+ Rush+Rec Yds (game)' },
    ],
  },
  {
    label: 'Game Threshold Bonuses',
    stats: [
      { key: 'bonus_pass_cmp_25', label: '25+ Completions (game)' },
      { key: 'bonus_rush_att_20', label: '20+ Carries (game)' },
    ],
  },
  {
    label: 'Big-Play Bonuses',
    stats: [
      { key: 'bonus_pass_td_40p',     label: '40+ Yd Passing TD Bonus', note: 'extra pts per 40+ yd TD pass' },
      { key: 'bonus_pass_td_50p',     label: '50+ Yd Passing TD Bonus', note: 'extra pts per 50+ yd TD pass' },
      { key: 'bonus_pass_cmp_40p',    label: '40+ Yd Completion Bonus', note: 'extra pts per 40+ yd completion' },
      { key: 'bonus_rush_td_40p',     label: '40+ Yd Rushing TD Bonus', note: 'extra pts per 40+ yd TD run' },
      { key: 'bonus_rush_td_50p',     label: '50+ Yd Rushing TD Bonus', note: 'extra pts per 50+ yd TD run' },
      { key: 'bonus_rec_td_40p',      label: '40+ Yd Receiving TD Bonus', note: 'extra pts per 40+ yd TD catch' },
      { key: 'bonus_rec_td_50p',      label: '50+ Yd Receiving TD Bonus', note: 'extra pts per 50+ yd TD catch' },
      { key: 'bonus_rec_40p',         label: '40+ Yd Reception Bonus', note: 'extra pts per 40+ yd reception' },
      { key: 'bonus_rush_40p',        label: '40+ Yd Rush Bonus', note: 'extra pts per 40+ yd run' },
      { key: 'bonus_def_fum_td_50p',  label: '50+ Yd Fumble Return TD (def)', note: 'IDP / team DST' },
      { key: 'bonus_def_int_td_50p',  label: '50+ Yd INT Return TD (def)', note: 'IDP / team DST' },
    ],
  },
  {
    label: 'IDP — Tackles',
    stats: [
      { key: 'idp_tkl',      label: 'Tackle (combined)' },
      { key: 'idp_tkl_solo', label: 'Solo Tackle' },
      { key: 'idp_tkl_ast',  label: 'Assisted Tackle' },
      { key: 'idp_tkl_loss', label: 'Tackle for Loss' },
      { key: 'idp_qbhit',    label: 'QB Hit' },
      { key: 'bonus_tkl_10p', label: '10+ Tackle Game Bonus' },
    ],
  },
  {
    label: 'IDP — Turnovers, Sacks & Other',
    stats: [
      { key: 'idp_sack',        label: 'Sack' },
      { key: 'idp_sack_yd',     label: 'Sack Yards', note: 'pts / yd' },
      { key: 'bonus_sack_2p',   label: '2+ Sack Game Bonus' },
      { key: 'idp_int',         label: 'Interception (def)' },
      { key: 'idp_int_ret_yd',  label: 'INT Return Yards', note: 'pts / yd' },
      { key: 'idp_int_td',      label: 'INT Return TD' },
      { key: 'idp_ff',          label: 'Forced Fumble' },
      { key: 'idp_fr',          label: 'Fumble Recovery' },
      { key: 'idp_fr_yd',       label: 'Fumble Return Yards', note: 'pts / yd' },
      { key: 'idp_fr_td',       label: 'Fumble Return TD' },
      { key: 'idp_def_td',      label: 'Defensive TD (any)' },
      { key: 'idp_pd',          label: 'Pass Deflection' },
      { key: 'idp_pass_def_3p', label: '3+ Pass Deflection Game Bonus' },
      { key: 'idp_safety',      label: 'Safety' },
      { key: 'idp_blk_kick',    label: 'Blocked Kick (def)' },
    ],
  },
  {
    label: 'Kicker — Field Goals Made',
    stats: [
      { key: 'fgm',              label: 'FG Made (flat)' },
      { key: 'fgm_0_19',         label: 'FG Made 0–19 yds' },
      { key: 'fgm_20_29',        label: 'FG Made 20–29 yds' },
      { key: 'fgm_30_39',        label: 'FG Made 30–39 yds' },
      { key: 'fgm_40_49',        label: 'FG Made 40–49 yds' },
      { key: 'fgm_50_59',        label: 'FG Made 50–59 yds' },
      { key: 'fgm_60p',          label: 'FG Made 60+ yds' },
      { key: 'xpm',              label: 'Extra Point Made' },
      { key: 'fgm_yds',          label: 'FG Yards Scored', note: 'pts / yd (all FG yds)' },
      { key: 'fgm_yds_over_30',  label: 'FG Yards Over 30', note: 'pts / yd beyond 30' },
    ],
  },
  {
    label: 'Kicker — Misses',
    stats: [
      { key: 'fgmiss',       label: 'FG Miss (flat)' },
      { key: 'fgmiss_0_19',  label: 'FG Miss 0–19 yds' },
      { key: 'fgmiss_20_29', label: 'FG Miss 20–29 yds' },
      { key: 'fgmiss_30_39', label: 'FG Miss 30–39 yds' },
      { key: 'fgmiss_40_49', label: 'FG Miss 40–49 yds' },
      { key: 'fgmiss_50_59', label: 'FG Miss 50–59 yds' },
      { key: 'fgmiss_60p',   label: 'FG Miss 60+ yds' },
      { key: 'xpmiss',       label: 'Extra Point Miss' },
    ],
  },
  {
    label: 'Team DST — Turnovers & Scoring',
    stats: [
      { key: 'sack',     label: 'Sack (team)' },
      { key: 'sack_yd',  label: 'Sack Yards (team)', note: 'pts / yd' },
      { key: 'int',      label: 'Interception (team)' },
      { key: 'int_ret_yd', label: 'INT Return Yards (team)', note: 'pts / yd' },
      { key: 'safe',     label: 'Safety (team)' },
      { key: 'def_td',   label: 'Defensive TD (team)' },
      { key: 'def_2pt',  label: 'Defensive 2-Pt Return' },
    ],
  },
  {
    label: 'Team DST — Points Allowed',
    stats: [
      { key: 'pts_allow',       label: 'Pts Allowed (per pt)', note: 'rate; alternative to tier brackets' },
      { key: 'pts_allow_0',     label: 'Pts Allowed: 0 (shutout)' },
      { key: 'pts_allow_1_6',   label: 'Pts Allowed: 1–6' },
      { key: 'pts_allow_7_13',  label: 'Pts Allowed: 7–13' },
      { key: 'pts_allow_14_20', label: 'Pts Allowed: 14–20' },
      { key: 'pts_allow_21_27', label: 'Pts Allowed: 21–27' },
      { key: 'pts_allow_28_34', label: 'Pts Allowed: 28–34' },
      { key: 'pts_allow_35p',   label: 'Pts Allowed: 35+' },
    ],
  },
  {
    label: 'Team DST — Yards Allowed',
    stats: [
      { key: 'yds_allow',         label: 'Yds Allowed (per yd)', note: 'rate; alternative to tier brackets' },
      { key: 'yds_allow_0_100',   label: 'Yds Allowed: 0–100' },
      { key: 'yds_allow_100_199', label: 'Yds Allowed: 100–199' },
      { key: 'yds_allow_200_299', label: 'Yds Allowed: 200–299' },
      { key: 'yds_allow_300_349', label: 'Yds Allowed: 300–349' },
      { key: 'yds_allow_350_399', label: 'Yds Allowed: 350–399' },
      { key: 'yds_allow_400_449', label: 'Yds Allowed: 400–449' },
      { key: 'yds_allow_450_499', label: 'Yds Allowed: 450–499' },
      { key: 'yds_allow_500_549', label: 'Yds Allowed: 500–549' },
      { key: 'yds_allow_550p',    label: 'Yds Allowed: 550+' },
    ],
  },
  {
    label: 'Team DST — Tackles & Other',
    stats: [
      { key: 'tkl',              label: 'Tackle (team)' },
      { key: 'tkl_solo',         label: 'Solo Tackle (team)' },
      { key: 'tkl_ast',          label: 'Assisted Tackle (team)' },
      { key: 'tkl_loss',         label: 'Tackle for Loss (team)' },
      { key: 'qb_hit',           label: 'QB Hit (team)' },
      { key: 'def_pass_def',     label: 'Pass Deflection (team)' },
      { key: 'def_3_and_out',    label: '3-and-Out Forced' },
      { key: 'def_4_and_stop',   label: '4th Down Stop' },
      { key: 'def_forced_punts', label: 'Forced Punt' },
      { key: 'def_st_tkl_solo',  label: 'ST Solo Tackle (team)' },
      { key: 'def_kr_yd',        label: 'Kick Return Yards (team)', note: 'pts / yd' },
      { key: 'def_pr_yd',        label: 'Punt Return Yards (team)', note: 'pts / yd' },
    ],
  },
];

export default function CompanionScoring() {
  const { scoringSettings, setScoringSettings, league } = useSleeperLeague();
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };

  const handleImportLeague = () => {
    if (!league?.scoring_settings) return;
    const imported = importLeagueScoring(league.scoring_settings);
    setScoringSettings({ ...DEFAULT_SCORING, ...imported });
  };

  // Filter groups/stats based on toggle
  const visibleGroups = STAT_GROUPS.map(group => ({
    ...group,
    stats: showActiveOnly ? group.stats.filter(s => (settings[s.key] ?? 0) !== 0) : group.stats,
  })).filter(group => group.stats.length > 0);

  return (
    <div className="pb-6">
      {/* Import from league + toggle row */}
      <div className="px-4 pt-2 pb-4 flex items-center gap-3">
        {league?.scoring_settings ? (
          <button
            onClick={handleImportLeague}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-70"
            style={{ background: 'var(--color-fill)', color: 'var(--color-accent)' }}
          >
            Sync from {league.name}
          </button>
        ) : (
          <p className="flex-1 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
            Connect a league to view its scoring settings.
          </p>
        )}
        <div
          className="shrink-0 flex rounded-lg overflow-hidden"
          style={{ background: 'var(--color-fill)', padding: '2px', gap: '2px' }}
        >
          {[
            { label: 'Active', value: true },
            { label: 'All', value: false },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => setShowActiveOnly(opt.value)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                background: showActiveOnly === opt.value ? 'var(--color-signature)' : 'transparent',
                color: showActiveOnly === opt.value ? 'var(--color-signature-fg)' : 'var(--color-label-tertiary)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat groups — read-only */}
      {visibleGroups.map(group => (
        <div key={group.label} className="px-4 mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
            {group.label}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            {group.stats.map((stat, i) => {
              const val = settings[stat.key] ?? 0;
              return (
                <div
                  key={stat.key}
                  className="flex items-center px-4 py-3 gap-4"
                  style={{ borderTop: i > 0 ? '1px solid var(--color-separator)' : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: val !== 0 ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}>
                      {stat.label}
                    </span>
                    {stat.note && (
                      <span className="ml-1.5 text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
                        {stat.note}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-mono text-sm tabular-nums"
                    style={{
                      color: val < 0
                        ? 'var(--color-accent-red)'
                        : val > 0
                        ? 'var(--color-label)'
                        : 'var(--color-label-quaternary)',
                    }}
                  >
                    {formatScoringSettingValue(stat.key, val)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
