import { useState, useCallback, useMemo } from 'react';
import { useSleeperLeague } from '../../context/SleeperContext';
import {
  DEFAULT_SCORING, getEspnScoringImportAudit, getFlatScoringSettings, importLeagueScoring, normalizeScoringProfile,
} from '../../utils/scoringEngine';
import { getLeague } from '../../api/sleeperApi';
import { formatScoringSettingValue } from '../../utils/scoringDisplay';
import { CompanionSelectorButton, CompanionSegmentedControl } from './CompanionSelectorControls.jsx';

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
      { key: 'rush_att',       label: 'Rushing Attempt' },
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
      { key: 'team_win',    label: 'Team Win', note: 'ESPN only', espnOnly: true },
      { key: 'team_loss',   label: 'Team Loss', note: 'ESPN only', espnOnly: true },
      { key: 'team_tie',    label: 'Team Tie', note: 'ESPN only', espnOnly: true },
      { key: 'kr_td',       label: 'Kickoff Return TD' },
      { key: 'pr_td',       label: 'Punt Return TD' },
      { key: 'blk_kick',    label: 'Blocked Kick' },
      { key: 'blk_kick_ret_td', label: 'Blocked Kick Return TD' },
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
      { key: 'fgm_0_39',         label: 'FG Made 0–39 yds' },
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
      { key: 'fgmiss_0_39',  label: 'FG Miss 0–39 yds' },
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
      { key: 'sack_half', label: 'Half Sack (team)' },
      { key: 'sack_yd',  label: 'Sack Yards (team)', note: 'pts / yd' },
      { key: 'int',      label: 'Interception (team)' },
      { key: 'int_ret_yd', label: 'INT Return Yards (team)', note: 'pts / yd' },
      { key: 'safe',     label: 'Safety (team)' },
      { key: 'def_td',   label: 'Defensive TD (team)' },
      { key: 'def_2pt',  label: 'Defensive 2-Pt Return' },
      { key: 'def_1pt_safe', label: 'Defensive 1-Pt Safety' },
      { key: 'def_int_td', label: 'INT Return TD (team)' },
      { key: 'def_fum_td', label: 'Fumble Return TD (team)' },
      { key: 'def_ff',   label: 'Forced Fumble (team)' },
      { key: 'blk_kick_ret_td', label: 'Blocked Kick Return TD' },
      { key: 'kr_td',    label: 'Kickoff Return TD' },
      { key: 'pr_td',    label: 'Punt Return TD' },
    ],
  },
  {
    label: 'Team DST — Points Allowed',
    stats: [
      { key: 'pts_allow',       label: 'Pts Allowed (per pt)', note: 'rate; alternative to tier brackets' },
      { key: 'pts_allow_0',     label: 'Pts Allowed: 0 (shutout)' },
      { key: 'pts_allow_1_6',   label: 'Pts Allowed: 1–6' },
      { key: 'pts_allow_7_13',  label: 'Pts Allowed: 7–13' },
      { key: 'pts_allow_14_17', label: 'Pts Allowed: 14–17' },
      { key: 'pts_allow_18_21', label: 'Pts Allowed: 18–21' },
      { key: 'pts_allow_22_27', label: 'Pts Allowed: 22–27' },
      { key: 'pts_allow_14_20', label: 'Pts Allowed: 14–20' },
      { key: 'pts_allow_21_27', label: 'Pts Allowed: 21–27' },
      { key: 'pts_allow_28_34', label: 'Pts Allowed: 28–34' },
      { key: 'pts_allow_35_45', label: 'Pts Allowed: 35–45' },
      { key: 'pts_allow_46p',   label: 'Pts Allowed: 46+' },
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
      { key: 'tkl_3',            label: 'Every 3 Tackles (team)' },
      { key: 'tkl_5',            label: 'Every 5 Tackles (team)' },
      { key: 'tkl_loss',         label: 'Tackle for Loss (team)' },
      { key: 'qb_hit',           label: 'QB Hit (team)' },
      { key: 'def_pass_def',     label: 'Pass Deflection (team)' },
      { key: 'def_3_and_out',    label: '3-and-Out Forced' },
      { key: 'def_4_and_stop',   label: '4th Down Stop' },
      { key: 'def_forced_punts', label: 'Forced Punt' },
      { key: 'def_st_tkl_solo',  label: 'ST Solo Tackle (team)' },
      { key: 'def_kr_yd',        label: 'Kick Return Yards (team)', note: 'pts / yd' },
      { key: 'def_kr_yd_10',     label: 'Every 10 Kick Return Yards (team)' },
      { key: 'def_kr_yd_25',     label: 'Every 25 Kick Return Yards (team)' },
      { key: 'def_pr_yd',        label: 'Punt Return Yards (team)', note: 'pts / yd' },
      { key: 'def_pr_yd_10',     label: 'Every 10 Punt Return Yards (team)' },
      { key: 'def_pr_yd_25',     label: 'Every 25 Punt Return Yards (team)' },
    ],
  },
];

export default function CompanionScoring() {
  const {
    platform, scoringSettings, setScoringSettings, league,
    leaguesBySeason, setScoringOverride, scoringOverride, clearScoringOverride,
  } = useSleeperLeague();
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const [expandedSeason, setExpandedSeason] = useState(null);
  const settings = getFlatScoringSettings(scoringSettings);
  const espnAudit = useMemo(
    () => (platform === 'espn' ? getEspnScoringImportAudit(scoringSettings) : null),
    [platform, scoringSettings],
  );

  const handleImportLeague = () => {
    if (!league?.scoring_settings) return;
    if (league.scoring_settings.provider === 'espn') {
      setScoringSettings(normalizeScoringProfile(league.scoring_settings, 'espn'));
      return;
    }
    const imported = importLeagueScoring(league.scoring_settings);
    setScoringSettings({ ...DEFAULT_SCORING, ...imported });
  };

  const handlePickLeague = useCallback(async (leagueId, leagueName, season) => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const fetched = await getLeague(leagueId);
      if (!fetched?.scoring_settings) throw new Error('No scoring settings found for this league.');
      const overrideSettings = { ...DEFAULT_SCORING, ...importLeagueScoring(fetched.scoring_settings) };
      setScoringOverride({ settings: overrideSettings, leagueName, leagueId, season });
    } catch (err) {
      setPickerError(err.message ?? 'Failed to load league scoring.');
    } finally {
      setPickerLoading(false);
    }
  }, [setScoringOverride]);

  const pickerSeasons = platform === 'espn' ? [] : Object.keys(leaguesBySeason ?? {})
    .filter(s => (leaguesBySeason[s]?.length ?? 0) > 0)
    .sort((a, b) => Number(b) - Number(a));

  // Filter groups/stats based on toggle
  const visibleGroups = STAT_GROUPS.map(group => ({
    ...group,
    stats: group.stats.filter((s) => {
      if (s.espnOnly && platform !== 'espn') return false;
      if (showActiveOnly && (settings[s.key] ?? 0) === 0) return false;
      return true;
    }),
  })).filter(group => group.stats.length > 0);

  return (
    <div className="pb-6">
      {/* Import from league + toggle row */}
      <div className="px-4 pt-2 pb-4 flex items-center gap-3">
        {league?.scoring_settings ? (
          <CompanionSelectorButton
            onClick={handleImportLeague}
            className="flex-1"
            size="md"
            variant="action"
          >
            Sync from {league.name}
          </CompanionSelectorButton>
        ) : (
          <p className="flex-1 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
            Connect a league to view its scoring settings.
          </p>
        )}
        <CompanionSegmentedControl
          value={showActiveOnly}
          options={[
            { label: 'Active', value: true },
            { label: 'All', value: false },
          ]}
          onChange={setShowActiveOnly}
          ariaLabel="Scoring visibility"
          className="shrink-0"
        />
      </div>

      {/* Preview another league's scoring */}
      {pickerSeasons.length > 0 && (
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
            Preview Another League&apos;s Scoring
          </div>

          {scoringOverride && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 text-sm font-semibold"
              style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
            >
              <span className="flex-1 truncate">{scoringOverride.leagueName} ({scoringOverride.season})</span>
              <button
                onClick={clearScoringOverride}
                className="text-xs font-bold transition-opacity active:opacity-70"
                style={{ opacity: 0.8 }}
              >
                Reset
              </button>
            </div>
          )}

          <CompanionSelectorButton
            onClick={() => setPickerOpen(v => !v)}
            className="w-full justify-between"
            size="md"
          >
            <span>Browse leagues…</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </CompanionSelectorButton>

          {pickerOpen && (
            <div
              className="mt-1 rounded-xl overflow-hidden"
              style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-separator)' }}
            >
              {pickerLoading && (
                <div className="px-4 py-3 text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading…</div>
              )}
              {pickerError && (
                <div className="px-4 py-3 text-sm" style={{ color: 'var(--color-destructive, #EF4444)' }}>{pickerError}</div>
              )}
              {pickerSeasons.map((season, si) => {
                const seasonLeagues = leaguesBySeason[season] ?? [];
                const isExpanded = expandedSeason === season;
                return (
                  <div key={season} style={{ borderTop: si > 0 ? '1px solid var(--color-separator)' : 'none' }}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold"
                      style={{ color: 'var(--color-label)' }}
                      onClick={() => setExpandedSeason(isExpanded ? null : season)}
                    >
                      <span>{season} Season</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                          {seasonLeagues.length} {seasonLeagues.length === 1 ? 'league' : 'leagues'}
                        </span>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--color-label-tertiary)' }}
                        >
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </span>
                    </button>
                    {isExpanded && seasonLeagues.map((lg) => {
                      const isActive = scoringOverride?.leagueId === String(lg.league_id);
                      return (
                        <button
                          key={lg.league_id}
                          disabled={pickerLoading}
                          onClick={() => handlePickLeague(lg.league_id, lg.name, season)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-opacity active:opacity-70 disabled:opacity-50"
                          style={{
                            borderTop: '1px solid var(--color-separator)',
                            background: isActive ? 'rgba(245,183,0,0.12)' : 'transparent',
                            color: isActive ? 'var(--color-signature)' : 'var(--color-label)',
                          }}
                        >
                          <span className="truncate text-left flex-1">{lg.name}</span>
                          {isActive && (
                            <span className="text-xs font-bold ml-2" style={{ color: 'var(--color-signature)' }}>Active</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {platform === 'espn' && espnAudit?.rows?.length > 0 && (
        <div className="px-4 pb-4">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
              ESPN Import Audit
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
              ID → imported setting
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div
              className="hidden gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest sm:grid sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_90px]"
              style={{ color: 'var(--color-label-tertiary)', borderBottom: '1px solid var(--color-separator)' }}
            >
              <span>Stat ID</span>
              <span>ESPN Value</span>
              <span>GridShift Key</span>
              <span>Imported</span>
            </div>
            {espnAudit.rows.map((row, index) => {
              const overrideText = Object.entries(row.espnPositionOverrides ?? {})
                .map(([position, value]) => `${position} ${value}`)
                .join(', ');
              const isUnmapped = row.status === 'unmapped';
              return (
                <div
                  key={`${row.statId}-${index}`}
                  className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_90px]"
                  style={{ borderTop: index > 0 ? '1px solid var(--color-separator)' : 'none' }}
                >
                  <span className="font-mono" style={{ color: isUnmapped ? 'var(--color-accent-red)' : 'var(--color-label)' }}>
                    <span className="sm:hidden" style={{ color: 'var(--color-label-tertiary)' }}>Stat ID </span>
                    #{row.statId ?? '--'}
                  </span>
                  <span className="min-w-0 truncate" style={{ color: 'var(--color-label-secondary)' }}>
                    <span className="sm:hidden" style={{ color: 'var(--color-label-tertiary)' }}>ESPN Value </span>
                    {row.espnPoints ?? '--'}{overrideText ? ` (${overrideText})` : ''}
                  </span>
                  <span className="min-w-0 truncate" style={{ color: isUnmapped ? 'var(--color-accent-red)' : 'var(--color-label)' }}>
                    <span className="sm:hidden" style={{ color: 'var(--color-label-tertiary)' }}>GridShift Key </span>
                    {row.gridshiftKey ?? 'Unmapped'}
                  </span>
                  <span className="font-mono tabular-nums text-right sm:text-left" style={{ color: 'var(--color-label)' }}>
                    <span className="sm:hidden" style={{ color: 'var(--color-label-tertiary)' }}>Imported </span>
                    {row.gridshiftKey ? formatScoringSettingValue(row.gridshiftKey, row.gridshiftValue ?? 0, { compact: true }) : '--'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
