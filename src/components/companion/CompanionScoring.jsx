import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import {
  DEFAULT_SCORING, getEspnScoringImportAudit, getFlatScoringSettings, importLeagueScoring,
} from '../../utils/scoringEngine';
import { getLeague } from '../../api/sleeperApi';
import { formatScoringSettingValue } from '../../utils/scoringDisplay';
import {
  SCORING_GAME_EXAMPLE_OPTIONS, SCORING_PLAY_TYPES, filterScoringGroups, getPositionStrengthRanking, getPreviousLeagueScoringOptions, getScoringGameExample, getScoringGameExampleCandidates, getScoringProfile, isNonStandardScoringSetting, isScoringRuleRosterEligible, pickRandomScoringGameExample, pickRandomScoringGameExampleId,
} from '../../utils/scoringGuide';
import {
  CompanionMenuChevron, CompanionMenuSelectionMark, CompanionMenuTrigger, CompanionSelectorButton, CompanionSelectorRail, CompanionSegmentedControl,
} from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, { CompanionPlayerMetric } from './CompanionPlayerRow.jsx';
import { getNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import Spinner from '../ui/Spinner';

function formatExampleStatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function formatExamplePoints(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const formatted = Number.isInteger(number) ? number.toFixed(1) : String(Number(number.toFixed(2)));
  return number > 0 ? `+${formatted}` : formatted;
}

function formatPositionStrengthValue(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

const POSITION_STRENGTH_COLUMNS = [
  { key: 'rank', label: 'Rank' },
  { key: 'position', label: 'Position' },
  { key: 'top8', label: 'Top 8' },
  { key: 'nineTo16', label: '9–16' },
  { key: 'seventeenTo32', label: '17–32' },
];

const STAT_GROUPS = [
  {
    label: 'Passing',
    family: 'Offense',
    tone: 'offense',
    stats: [
      { key: 'pass_yd',   label: 'Passing Yards' },
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
    family: 'Offense',
    tone: 'offense',
    stats: [
      { key: 'rush_yd',        label: 'Rushing Yards' },
      { key: 'rush_td',        label: 'Rushing TD' },
      { key: 'rush_2pt',       label: '2-Pt Conversion Rush' },
      { key: 'rush_fd',        label: 'First Down (rush)' },
      { key: 'rush_att',       label: 'Rushing Attempt' },
      { key: 'bonus_rush_att', label: 'Carry Bonus', note: 'extra pts/carry (RBs only)' },
    ],
  },
  {
    label: 'Receiving',
    family: 'Offense',
    tone: 'offense',
    stats: [
      { key: 'rec',          label: 'Reception' },
      { key: 'rec_yd',       label: 'Receiving Yards' },
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
    family: 'Reception premiums',
    tone: 'premium',
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
    family: 'Position premiums',
    tone: 'premium',
    stats: [
      { key: 'bonus_fd_qb', label: 'QB First Down Bonus', note: 'extra pts/FD (pass + rush)' },
      { key: 'bonus_fd_rb', label: 'RB First Down Bonus', note: 'extra pts/FD (rush + rec)' },
      { key: 'bonus_fd_wr', label: 'WR First Down Bonus', note: 'extra pts/FD (rec)' },
      { key: 'bonus_fd_te', label: 'TE First Down Bonus', note: 'extra pts/FD (rec)' },
    ],
  },
  {
    label: 'Misc / Fumbles',
    family: 'Ball security',
    tone: 'situational',
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
    family: 'Returns & coverage',
    tone: 'special',
    stats: [
      { key: 'kr_yd',          label: 'Kick Return Yards' },
      { key: 'pr_yd',          label: 'Punt Return Yards' },
      { key: 'st_tkl_solo',    label: 'ST Solo Tackle' },
      { key: 'blk_kick_ret_yd', label: 'Blocked Kick Return Yds' },
      { key: 'fg_ret_yd',      label: 'Missed FG Return Yards' },
      { key: 'fum_ret_yd',     label: 'Fumble Return Yards (player)' },
    ],
  },
  {
    label: 'Yardage Bonuses',
    family: 'Performance bonuses',
    tone: 'bonus',
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
    family: 'Performance bonuses',
    tone: 'bonus',
    stats: [
      { key: 'bonus_pass_cmp_25', label: '25+ Completions (game)' },
      { key: 'bonus_rush_att_20', label: '20+ Carries (game)' },
    ],
  },
  {
    label: 'Big-Play Bonuses',
    family: 'Performance bonuses',
    tone: 'bonus',
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
    family: 'Individual defense',
    tone: 'defense',
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
    family: 'Individual defense',
    tone: 'defense',
    stats: [
      { key: 'idp_sack',        label: 'Sack' },
      { key: 'idp_sack_yd',     label: 'Sack Yards' },
      { key: 'bonus_sack_2p',   label: '2+ Sack Game Bonus' },
      { key: 'idp_int',         label: 'Interception (def)' },
      { key: 'idp_int_ret_yd',  label: 'INT Return Yards' },
      { key: 'idp_int_td',      label: 'INT Return TD' },
      { key: 'idp_ff',          label: 'Forced Fumble' },
      { key: 'idp_fr',          label: 'Fumble Recovery' },
      { key: 'idp_fr_yd',       label: 'Fumble Return Yards' },
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
    family: 'Kicking',
    tone: 'special',
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
      { key: 'fgm_yds',          label: 'FG Yards Scored', note: 'all FG yds' },
      { key: 'fgm_yds_over_30',  label: 'FG Yards Over 30', note: 'yds beyond 30 only' },
    ],
  },
  {
    label: 'Kicker — Misses',
    family: 'Kicking',
    tone: 'special',
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
    family: 'Team defense',
    tone: 'defense',
    stats: [
      { key: 'sack',     label: 'Sack (team)' },
      { key: 'sack_half', label: 'Half Sack (team)' },
      { key: 'sack_yd',  label: 'Sack Yards (team)' },
      { key: 'int',      label: 'Interception (team)' },
      { key: 'int_ret_yd', label: 'INT Return Yards (team)' },
      { key: 'safe',     label: 'Safety (team)' },
      { key: 'def_td',   label: 'Defensive TD (team)' },
      { key: 'def_2pt',  label: 'Defensive 2-Pt Return' },
      { key: 'def_1pt_safe', label: 'Defensive 1-Pt Safety' },
      { key: 'def_int_td', label: 'INT Return TD (team)' },
      { key: 'def_fum_td', label: 'Fumble Return TD (team)' },
      { key: 'def_ff',   label: 'Forced Fumble (team)' },
    ],
  },
  {
    label: 'Team DST — Points Allowed',
    family: 'Team defense',
    tone: 'defense',
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
    family: 'Team defense',
    tone: 'defense',
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
    family: 'Team defense',
    tone: 'defense',
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
      { key: 'def_kr_yd',        label: 'Kick Return Yards (team)' },
      { key: 'def_kr_yd_10',     label: 'Every 10 Kick Return Yards (team)' },
      { key: 'def_kr_yd_25',     label: 'Every 25 Kick Return Yards (team)' },
      { key: 'def_pr_yd',        label: 'Punt Return Yards (team)' },
      { key: 'def_pr_yd_10',     label: 'Every 10 Punt Return Yards (team)' },
      { key: 'def_pr_yd_25',     label: 'Every 25 Punt Return Yards (team)' },
    ],
  },
];

export default function CompanionScoring() {
  const { darkMode } = useTheme();
  const {
    platform, scoringSettings, activeScoringSettings, league, season,
    linkedLeagueHistory, setScoringOverride, scoringOverride, clearScoringOverride,
  } = useSleeperLeague();
  const { players, statsBySeason, loadPlayers, loadStatsForSeason } = useSleeperStats();
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [highlightNonStandard, setHighlightNonStandard] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedExample, setSelectedExample] = useState(null);
  const [selectedExampleCandidate, setSelectedExampleCandidate] = useState(null);
  const [selectedPlayType, setSelectedPlayType] = useState('ALL');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const [positionStrengthLoading, setPositionStrengthLoading] = useState(false);
  const [positionStrengthSort, setPositionStrengthSort] = useState({ key: 'top8', direction: 'desc' });
  const effectiveScoringSettings = activeScoringSettings ?? scoringSettings;
  const settings = getFlatScoringSettings(effectiveScoringSettings);
  const displayRosterPositions = scoringOverride?.rosterPositions ?? league?.roster_positions;
  const scoringSeason = String(league?.season ?? season ?? '').trim();
  const productionSeason = Number.isFinite(Number(scoringSeason))
    ? String(Number(scoringSeason) - 1)
    : null;
  const productionStats = platform === 'sleeper' && productionSeason
    ? statsBySeason?.[productionSeason]?.seasonStats
    : null;
  const scoringProfile = useMemo(
    () => getScoringProfile(effectiveScoringSettings, displayRosterPositions),
    [effectiveScoringSettings, displayRosterPositions],
  );
  const scoringExampleOptions = useMemo(() => ({
    allowTeamExample: scoringProfile.hasTeamSpecialTeamsRoster,
    rosterPositions: displayRosterPositions,
  }), [displayRosterPositions, scoringProfile.hasTeamSpecialTeamsRoster]);
  const exampleOptions = useMemo(() => {
    const availableIds = new Set(scoringProfile.availableExampleIds);
    return SCORING_GAME_EXAMPLE_OPTIONS.filter((option) => (
      availableIds.has(option.id)
      && getScoringGameExampleCandidates(option.id, effectiveScoringSettings, scoringExampleOptions).length > 0
    ));
  }, [effectiveScoringSettings, scoringExampleOptions, scoringProfile.availableExampleIds]);
  const selectedExampleCandidates = useMemo(
    () => getScoringGameExampleCandidates(selectedExample, effectiveScoringSettings, scoringExampleOptions),
    [effectiveScoringSettings, scoringExampleOptions, selectedExample],
  );
  const playTypeOptions = useMemo(() => {
    const availableIds = new Set(scoringProfile.availablePlayTypeIds);
    return SCORING_PLAY_TYPES.filter((option) => option.id === 'ALL' || availableIds.has(option.id));
  }, [scoringProfile.availablePlayTypeIds]);
  const positionStrength = useMemo(
    () => getPositionStrengthRanking({
      seasonStats: productionStats,
      players,
      scoring: activeScoringSettings,
      rosterPositions: displayRosterPositions,
    }),
    [activeScoringSettings, displayRosterPositions, players, productionStats],
  );
  const sortedPositionStrength = useMemo(() => [...positionStrength].sort((left, right) => {
    const { key, direction } = positionStrengthSort;
    let comparison;
    if (key === 'position') {
      comparison = left.position.localeCompare(right.position);
    } else {
      const leftValue = left[key];
      const rightValue = right[key];
      if (!Number.isFinite(leftValue)) return 1;
      if (!Number.isFinite(rightValue)) return -1;
      comparison = leftValue - rightValue;
    }
    return direction === 'asc' ? comparison : -comparison;
  }), [positionStrength, positionStrengthSort]);

  const handlePositionStrengthSort = useCallback((key) => {
    setPositionStrengthSort((current) => ({
      key,
      direction: current.key === key
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : (key === 'position' || key === 'rank' ? 'asc' : 'desc'),
    }));
  }, []);

  useEffect(() => {
    if (platform !== 'sleeper' || !productionSeason || productionStats) return undefined;
    let cancelled = false;
    setPositionStrengthLoading(true);
    loadStatsForSeason(productionSeason)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setPositionStrengthLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadStatsForSeason, platform, productionSeason, productionStats]);
  useEffect(() => {
    if (platform !== 'sleeper' || players) return;
    void loadPlayers().catch(() => null);
  }, [loadPlayers, platform, players]);
  useEffect(() => {
    if (selectedExample) window.sessionStorage.setItem('gridshift-scoring-example-id', selectedExample);
  }, [selectedExample]);
  useEffect(() => {
    if (selectedExample && selectedExampleCandidate) {
      window.sessionStorage.setItem(
        `gridshift-scoring-example-candidate-id-${selectedExample}`,
        selectedExampleCandidate,
      );
    }
  }, [selectedExample, selectedExampleCandidate]);
  useEffect(() => {
    if (exampleOptions.length === 0) {
      setSelectedExample(null);
      setSelectedExampleCandidate(null);
      return;
    }

    if (!exampleOptions.some((option) => option.id === selectedExample)) {
      const previousId = window.sessionStorage.getItem('gridshift-scoring-example-id');
      setSelectedExample(pickRandomScoringGameExampleId(
        exampleOptions.map((option) => option.id),
        { previousId },
      ));
      setSelectedExampleCandidate(null);
      return;
    }

    if (!selectedExampleCandidates.some((candidate) => candidate.id === selectedExampleCandidate)) {
      const previousCandidateId = window.sessionStorage.getItem(
        `gridshift-scoring-example-candidate-id-${selectedExample}`,
      );
      const nextCandidate = pickRandomScoringGameExample(selectedExample, effectiveScoringSettings, {
        ...scoringExampleOptions,
        previousCandidateId,
      });
      setSelectedExampleCandidate(nextCandidate?.id ?? null);
    }
  }, [
    effectiveScoringSettings,
    exampleOptions,
    scoringExampleOptions,
    selectedExample,
    selectedExampleCandidate,
    selectedExampleCandidates,
  ]);
  useEffect(() => {
    if (!playTypeOptions.some((option) => option.id === selectedPlayType)) {
      setSelectedPlayType('ALL');
    }
  }, [playTypeOptions, selectedPlayType]);

  const handleSelectExamplePhase = useCallback((phaseId) => {
    const previousCandidateId = window.sessionStorage.getItem(
      `gridshift-scoring-example-candidate-id-${phaseId}`,
    );
    const nextCandidate = pickRandomScoringGameExample(phaseId, effectiveScoringSettings, {
      ...scoringExampleOptions,
      previousCandidateId,
    });
    setSelectedExample(phaseId);
    setSelectedExampleCandidate(nextCandidate?.id ?? null);
  }, [effectiveScoringSettings, scoringExampleOptions]);

  const featuredGame = useMemo(
    () => getScoringGameExample(selectedExample, effectiveScoringSettings, {
      ...scoringExampleOptions,
      candidateId: selectedExampleCandidate,
    }),
    [effectiveScoringSettings, scoringExampleOptions, selectedExample, selectedExampleCandidate],
  );
  const featuredPoints = Number(featuredGame?.points);
  const featuredPointsLabel = Number.isFinite(featuredPoints) ? featuredPoints.toFixed(1) : '—';
  const espnAudit = useMemo(
    () => (platform === 'espn' ? getEspnScoringImportAudit(effectiveScoringSettings) : null),
    [effectiveScoringSettings, platform],
  );

  const handlePickLeague = useCallback(async (leagueId, leagueName, season) => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const fetched = await getLeague(leagueId);
      if (!fetched?.scoring_settings) throw new Error('No scoring settings found for this league.');
      const overrideSettings = { ...DEFAULT_SCORING, ...importLeagueScoring(fetched.scoring_settings) };
      setScoringOverride({ settings: overrideSettings, leagueName, leagueId, season, rosterPositions: fetched.roster_positions ?? [] });
      setPickerOpen(false);
    } catch (err) {
      setPickerError(err.message ?? 'Failed to load league scoring.');
    } finally {
      setPickerLoading(false);
    }
  }, [setScoringOverride]);

  const previousScoringOptions = useMemo(() => {
    if (platform === 'espn') return [];
    return getPreviousLeagueScoringOptions(linkedLeagueHistory, league?.season);
  }, [league?.season, linkedLeagueHistory, platform]);

  const handleResetPreview = useCallback(() => {
    clearScoringOverride();
    setPickerOpen(false);
    setPickerError(null);
  }, [clearScoringOverride]);

  const visibleGroups = useMemo(() => filterScoringGroups(STAT_GROUPS, {
    position: 'ALL',
    playType: selectedPlayType,
    showActiveOnly,
    includeIDP: scoringProfile.hasIDPScoring,
    rosterPositions: displayRosterPositions,
    scoring: effectiveScoringSettings,
  }), [displayRosterPositions, effectiveScoringSettings, selectedPlayType, showActiveOnly, scoringProfile.hasIDPScoring]);

  return (
    <div className="page-frame-workbench companion-scoring-page pb-6">
      <section className="companion-scoring-overview px-4 pt-4 pb-5" aria-labelledby="scoring-profile-title">
        <header className="companion-scoring-profile-header">
          <div className="companion-scoring-profile-header__eyebrow">League scoring blueprint</div>
          <h1 id="scoring-profile-title">{scoringProfile.title}</h1>
          <p>{scoringProfile.summary}</p>
          <div className="companion-scoring-profile-facts" aria-label="Scoring profile facts">
            {scoringProfile.facts.map((fact) => <span key={fact}>{fact}</span>)}
            <span>{scoringProfile.activeBonusCount} bonus categor{scoringProfile.activeBonusCount === 1 ? 'y' : 'ies'} active</span>
          </div>
          {scoringOverride && (
            <button
              type="button"
              onClick={handleResetPreview}
              className="companion-scoring-reset mt-3"
              title="Restore this league’s current scoring"
            >
              Reset preview
            </button>
          )}
        </header>

        <div className="companion-scoring-blueprint">
          <section className="companion-scoring-core" data-tone="core" aria-labelledby="scoring-core-title">
            <div className="companion-scoring-section-heading">
              <div>
                <span>01</span>
                <h2 id="scoring-core-title">Core scoring</h2>
              </div>
              <p>The values that shape every weekly total.</p>
            </div>
            <dl className="companion-scoring-core-grid">
              {scoringProfile.coreRules.map((rule) => (
                <div key={rule.id} data-emphasis={rule.emphasis ? 'true' : undefined}>
                  <dt>{rule.label}</dt>
                  <dd>{rule.value}</dd>
                  <span>{rule.detail}</span>
                </div>
              ))}
            </dl>
          </section>

          <section className="companion-scoring-units" data-tone="units" aria-labelledby="scoring-units-title">
            <div className="companion-scoring-section-heading">
              <div>
                <span>02</span>
                <h2 id="scoring-units-title">Scoring units</h2>
              </div>
              <p>How each part of the lineup earns points.</p>
            </div>
            <div className="companion-scoring-unit-ledger">
              {scoringProfile.units.map((unit) => (
                <div key={unit.id} data-state={unit.state}>
                  <span className="companion-scoring-unit-ledger__marker" aria-hidden="true" />
                  <strong>{unit.label}</strong>
                  <span className="companion-scoring-unit-ledger__status">{unit.status}</span>
                  <p>{unit.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="companion-scoring-position-strength" data-tone="position" aria-labelledby="scoring-position-strength-title">
            <div className="companion-scoring-section-heading">
              <div>
                <span>03</span>
                <h2 id="scoring-position-strength-title">Position strength</h2>
              </div>
              <p>{productionSeason ? `${productionSeason} production · current rules` : 'Prior-season production · current rules'}</p>
            </div>
            {positionStrength.length > 0 ? (
              <div className="companion-scoring-position-strength__table" role="table" aria-label="Position strength by average fantasy points per game">
                <div className="companion-scoring-position-strength__header" role="row">
                  {POSITION_STRENGTH_COLUMNS.map((column) => {
                    const isActive = positionStrengthSort.key === column.key;
                    return (
                      <span key={column.key} role="columnheader" aria-sort={isActive ? (positionStrengthSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => handlePositionStrengthSort(column.key)}>
                          {column.label}<span aria-hidden="true">{isActive ? (positionStrengthSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </span>
                    );
                  })}
                </div>
                {sortedPositionStrength.map((row) => (
                  <div key={row.position} className="companion-scoring-position-strength__row" role="row">
                    <span role="cell" className="companion-scoring-position-strength__rank">{row.rank}</span>
                    <strong role="cell">{row.position}</strong>
                    <span role="cell">{formatPositionStrengthValue(row.top8)}</span>
                    <span role="cell">{formatPositionStrengthValue(row.nineTo16)}</span>
                    <span role="cell">{formatPositionStrengthValue(row.seventeenTo32)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="companion-scoring-position-strength__empty">
                {positionStrengthLoading ? 'Loading prior-season production…' : 'Prior-season production is not available for this league yet.'}
              </p>
            )}
          </section>
        </div>

        <aside className="companion-scoring-overview__example" aria-labelledby="scoring-example-title">
          <div className="companion-scoring-example-heading">
            <div>
              <span>2025 game sample</span>
              <h2 id="scoring-example-title">See it scored</h2>
            </div>
          </div>
          <CompanionSelectorRail ariaLabel="Scoring phase examples" className="companion-scoring-position-rail">
            {exampleOptions.map((option) => (
              <CompanionSelectorButton key={option.id} active={selectedExample === option.id} onClick={() => handleSelectExamplePhase(option.id)}>
                {option.label}
              </CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>
          <CompanionPlayerRow
            player={featuredGame?.isTeam
              ? { ...featuredGame, imageUrl: getNflTeamLogoUrl(featuredGame.logoKey) }
              : featuredGame}
            darkMode={darkMode}
            compact
            showTeamLogo={!featuredGame?.isTeam}
            showSelectionMark={false}
            metaSegments={[featuredGame?.opponent]}
            gridTemplate={featuredGame?.isTeam
              ? '34px 26px minmax(0, 1fr) minmax(68px, auto)'
              : '34px 26px minmax(0, 1fr) 30px minmax(68px, auto)'}
            columnGridTemplate="minmax(68px, auto)"
            columns={<CompanionPlayerMetric value={featuredPointsLabel} label={featuredGame?.pointsLabel} compact />}
            className="companion-scoring-example-player"
          />
          <div className="companion-scoring-example-game">
            <strong>{featuredGame?.result}</strong>
            <span>{featuredGame?.date}</span>
          </div>
          <div className="companion-scoring-example-breakdown">
            <div className="companion-scoring-example-breakdown__heading">
              <strong>League scoring breakdown</strong>
              <span>Value</span>
              <span>Pts</span>
            </div>
            <div className="companion-scoring-example-breakdown__rows" role="table" aria-label={`${featuredGame?.name ?? 'Player'} scoring breakdown`}>
              {featuredGame?.breakdown.map((row) => (
                <div key={row.key ?? row.statKey} role="row">
                  <span role="cell">{row.label}</span>
                  <span role="cell">{formatExampleStatValue(row.statVal)}</span>
                  <strong role="cell" data-value-state={row.pts < 0 ? 'negative' : 'positive'}>{formatExamplePoints(row.pts)}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <div className="px-4">
        <button type="button" className="companion-scoring-detail-toggle" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen}>
          <span className="companion-scoring-detail-toggle__copy">
            <span>Scoring reference</span>
            <strong>Detailed scoring</strong>
            <small>Browse every scoring value by phase.</small>
          </span>
          <span className="companion-scoring-detail-toggle__action">
            {detailsOpen ? 'Hide' : 'View'}
            <CompanionMenuChevron open={detailsOpen} />
          </span>
        </button>
      </div>

      {detailsOpen && <>
      <div className="companion-scoring-control-deck px-4 py-4">
        <div className="companion-scoring-detail-controls">
          <CompanionSelectorRail label="Phase" ariaLabel="Scoring phase">
            {playTypeOptions.map((option) => (
              <CompanionSelectorButton key={option.id} active={selectedPlayType === option.id} onClick={() => setSelectedPlayType(option.id)}>{option.label}</CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>
        </div>

        <aside className="companion-scoring-utility" aria-label="Scoring utilities">
          <CompanionSegmentedControl
            title="Values shown"
            value={showActiveOnly}
            options={[
              { label: 'Active', value: true },
              { label: 'All', value: false },
            ]}
            onChange={setShowActiveOnly}
            ariaLabel="Scoring visibility"
          />

          <CompanionSegmentedControl
            title="Highlight custom"
            value={highlightNonStandard}
            options={[
              { label: 'On', value: true },
              { label: 'Off', value: false },
            ]}
            onChange={setHighlightNonStandard}
            ariaLabel="Highlight non-standard fantasy scoring"
          />

          {previousScoringOptions.length > 0 && (
            <div className="companion-scoring-preview-tool">
              <div className="companion-scoring-preview-tool__header">
                <span>Scoring preview</span>
                {scoringOverride && (
                  <button
                    type="button"
                    onClick={handleResetPreview}
                    className="companion-scoring-reset"
                    title="Restore this league’s current scoring"
                  >
                    Reset preview
                  </button>
                )}
              </div>
              <CompanionMenuTrigger
                value={scoringOverride ? `${scoringOverride.season} scoring` : 'Preview previous season'}
                open={pickerOpen}
                engaged={Boolean(scoringOverride)}
                onClick={() => setPickerOpen(v => !v)}
                aria-label="Preview this league's scoring from a previous season"
              />

              {pickerOpen && (
                <div className="companion-scoring-preview-tool__menu">
                  {pickerLoading && (
                    <div className="px-4 py-3 text-sm flex items-center gap-2" style={{ color: 'var(--color-label-secondary)' }}>
                      <Spinner size="sm" />
                      Loading leagues…
                    </div>
                  )}
                  {pickerError && (
                    <div className="px-4 py-3 text-sm" style={{ color: 'var(--color-accent-red)' }}>{pickerError}</div>
                  )}
                  {previousScoringOptions.map(({ season, league: previousLeague }, index) => {
                    const isActive = scoringOverride?.leagueId === String(previousLeague.league_id);
                    return (
                      <button
                        key={previousLeague.league_id}
                        type="button"
                        disabled={pickerLoading}
                        aria-pressed={isActive}
                        onClick={() => handlePickLeague(previousLeague.league_id, previousLeague.name, season)}
                        className={`companion-menu-item w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left disabled:opacity-50${isActive ? ' is-checked' : ''}`}
                        style={{ borderTop: index > 0 ? '1px solid var(--color-separator)' : 'none' }}
                      >
                        <CompanionMenuSelectionMark checked={isActive} mode="single" />
                        <span className="min-w-0 flex-1">
                          <strong className="block">{season} season</strong>
                          <span className="block truncate text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{previousLeague.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {platform === 'espn' && espnAudit?.rows?.length > 0 && (
        <div className="px-4 pb-4">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
              ESPN Import Audit
            </div>
            <div className="text-[length:var(--type-label)] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
              ID → imported setting
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div
              className="hidden gap-3 px-4 py-2 text-[length:var(--type-label)] font-bold uppercase tracking-widest sm:grid sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_90px]"
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

      {/* Scoring values — read-only */}
      <div className="companion-scoring-workbench px-4">
        <div className="companion-scoring-groups">
      {visibleGroups.map((group, groupIndex) => (
        <section
          key={group.label}
          className="companion-scoring-group"
          data-tone={group.tone}
        >
          <header className="companion-scoring-group__header">
            <span className="companion-scoring-group__index">
              {String(groupIndex + 1).padStart(2, '0')}
            </span>
            <div>
              <span className="companion-scoring-group__family">{group.family}</span>
              <h2 className="companion-scoring-group__title">{group.label}</h2>
            </div>
          </header>
          <div className="companion-scoring-value-list">
            {group.stats.map((stat) => {
              const val = settings[stat.key] ?? 0;
              const isNonStandard = isNonStandardScoringSetting(stat.key, val);
              const isRosterEligible = isScoringRuleRosterEligible(stat.key, displayRosterPositions);
              return (
                <div
                  key={stat.key}
                  className="companion-scoring-value-row"
                  data-custom={highlightNonStandard && isNonStandard ? 'true' : undefined}
                >
                  <div className="companion-scoring-value-row__copy">
                    <span>{stat.label}</span>
                    {stat.note && (
                      <small>{stat.note}</small>
                    )}
                    {!showActiveOnly && Number(val) !== 0 && !isRosterEligible && (
                      <small>Configured, but no eligible roster slot</small>
                    )}
                    {highlightNonStandard && isNonStandard && (
                      <span className="companion-scoring-custom-badge">Custom</span>
                    )}
                  </div>
                  <span
                    className="companion-scoring-value-row__value"
                    data-value-state={val < 0 ? 'negative' : val === 0 ? 'zero' : 'positive'}
                  >
                    {formatScoringSettingValue(stat.key, val)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
        </div>
      </div>
      </>}
    </div>
  );
}
