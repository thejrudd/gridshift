/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_SCORING } from '../../utils/scoringEngine';
import { formatWeather } from '../../api/weatherApi';
import { formatStatisticsScoresLocalKickoff } from '../../utils/statisticsScoresTime.js';
import { getNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import { STATISTICS_MODES } from '../../utils/playerDrilldown';
import { buildFantasyScoringBreakdown, mergeOfficialFantasyTotal } from '../../utils/fantasyBreakdownRows.js';
import { isEspnFantasyGameLogPosition, loadEspnFantasyGameLogWeekRow } from '../../utils/espnFantasyGameLogRows.js';
import Modal from '../Modal';
import PlayerAvatar from '../shared/PlayerAvatar.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
import {
  buildPlayerProjectionBreakdown,
  getPaceAdjustedProjection,
  getPlayerPerformanceTarget,
  getPlayerMatchupPhase,
  matchupNumber,
  resolvePlayerDisplayProjection,
} from '../../utils/playerMatchupPresentation.js';
import { buildPlayerDefensePerformance } from '../../utils/playerDefensePerformance.js';
import { computeWeeklyPositionalRanks } from '../../utils/projectionEngine.js';
import { buildPlayerMatchupBenchOption } from '../../utils/playerMatchupBenchOption.js';
import {
  DRILLDOWN_FORM_WEEKS,
  buildDrilldownStatLine,
  buildDrilldownWeeks,
  buildNextWeekPreview,
  buildProjectionBridge,
  buildScoringPace,
  buildWeekCategoryShift,
  getDrilldownElapsedFraction,
  getStatLinePoints,
  selectDrilldownStatKeys,
} from '../../utils/playerDrilldownModel.js';
import { BridgeChart, CategoryShiftChart, OutlookChart, PaceChart, RankStrip, Ring, StatLineBars, TierChart, WeekColumns } from './drilldown/DrilldownCharts.jsx';
import { fmt, sgn, statTone } from './drilldown/drilldownChartUtils.js';
import { usePlayerMatchupTimeline } from '../../hooks/usePlayerMatchupTimeline.js';
import { DRILLDOWN_DEV_SLOTS_ENABLED } from '../../utils/drilldownDevSlots.js';
import './PlayerMatchupBreakdown.css';

function HeaderActionButton({ label, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="matchup-header-action"
    >
      <span>{label}</span>
      {icon}
    </button>
  );
}

// Human-readable labels for every stat key we score
export const STAT_LABELS = {
  // Passing
  pass_yd:   'Pass Yards',
  pass_td:   'Pass TD',
  pass_int:  'Interception (thrown)',
  pass_2pt:  '2-Pt Pass Conv',
  pass_sack: 'Sack',
  pass_cmp:  'Completion',
  pass_att:  'Pass Attempt',
  pass_inc:  'Incomplete Pass',
  pass_fd:   'First Down (pass)',
  // Rushing
  rush_yd:   'Rush Yards',
  rush_td:   'Rush TD',
  rush_2pt:  '2-Pt Rush Conv',
  rush_fd:   'First Down (rush)',
  rush_att:  'Rush Attempt',
  // Receiving
  rec:       'Reception',
  rec_yd:    'Rec Yards',
  rec_td:    'Rec TD',
  rec_2pt:   '2-Pt Rec Conv',
  rec_fd:    'First Down (rec)',
  // Misc
  fum:       'Fumble',
  fum_lost:  'Fumble Lost',
  fum_rec:   'Fumble Recovery',
  fum_ret_td:'Fumble Rec TD',
  st_td:     'Special Teams TD',
  ret_td:    'Return TD',
  team_win:  'Team Win',
  team_loss: 'Team Loss',
  team_tie:  'Team Tie',
  kr_td:     'Kickoff Return TD',
  pr_td:     'Punt Return TD',
  blk_kick:  'Blocked Kick',
  blk_kick_ret_td: 'Blocked Kick Return TD',
  // Pick 6
  pass_int_td:          'Pick 6 (thrown)',
  // Big-play bonuses
  bonus_pass_td_40p:    '40+ Yd Pass TD Bonus',
  bonus_pass_td_50p:    '50+ Yd Pass TD Bonus',
  bonus_pass_cmp_40p:   '40+ Yd Completion Bonus',
  bonus_rush_td_40p:    '40+ Yd Rush TD Bonus',
  bonus_rush_td_50p:    '50+ Yd Rush TD Bonus',
  bonus_rec_td_40p:     '40+ Yd Rec TD Bonus',
  bonus_rec_td_50p:     '50+ Yd Rec TD Bonus',
  bonus_rec_40p:        '40+ Yd Reception Bonus',
  bonus_rush_40p:       '40+ Yd Rush Bonus',
  // Game-threshold bonuses
  bonus_pass_cmp_25:    '25+ Completion Bonus',
  bonus_rush_att_20:    '20+ Rush Att Bonus',
  // Yardage-milestone bonuses
  bonus_pass_yd_300:    '300+ Pass Yd Bonus',
  bonus_pass_yd_400:    '400+ Pass Yd Bonus',
  bonus_rush_yd_100:    '100+ Rush Yd Bonus',
  bonus_rush_yd_200:    '200+ Rush Yd Bonus',
  bonus_rec_yd_100:     '100+ Rec Yd Bonus',
  bonus_rec_yd_200:     '200+ Rec Yd Bonus',
  bonus_rush_rec_yd_100:'100+ Rush+Rec Yd Bonus',
  bonus_rush_rec_yd_200:'200+ Rush+Rec Yd Bonus',
  // Tiered reception distance
  rec_0_4:   'Short Reception (0–4 yd)',
  rec_5_9:   'Reception (5–9 yd)',
  rec_10_19: 'Reception (10–19 yd)',
  rec_20_29: 'Reception (20–29 yd)',
  rec_30_39: 'Reception (30–39 yd)',
  // Special teams
  kr_yd:           'Kick Return Yards',
  pr_yd:           'Punt Return Yards',
  st_tkl_solo:     'Special Teams Tackle',
  blk_kick_ret_yd: 'Blocked Kick Return Yards',
  fg_ret_yd:       'Missed FG Return Yards',
  fum_ret_yd:      'Fumble Return Yards',
  // IDP
  idp_tkl:      'Tackle',
  idp_tkl_solo: 'Solo Tackle',
  idp_tkl_ast:  'Assisted Tackle',
  idp_tkl_loss: 'Tackle for Loss',
  idp_sack:         'Sack',
  idp_sack_yd:      'Sack Yards',
  idp_int:          'Interception (def)',
  idp_int_ret_yd:   'Interception Return Yards',
  idp_ff:           'Forced Fumble',
  idp_fr:           'Fumble Recovery',
  idp_fr_yd:        'Fumble Return Yards',
  idp_pd:           'Pass Deflection',
  idp_qbhit:        'QB Hit',
  idp_qb_hit:       'QB Hit',
  idp_safety:       'Safety',
  idp_safe:         'Safety',
  idp_int_td:       'INT Return TD',
  idp_fr_td:        'Fumble Return TD',
  idp_def_td:    'Defensive TD',
  idp_blk_kick:  'Blocked Kick',
  // IDP threshold bonuses
  bonus_sack_2p:        '2+ Sack Bonus',
  bonus_tkl_10p:        '10+ Tackle Bonus',
  idp_pass_def_3p:      '3+ Pass Def Bonus',
  // IDP big-play bonuses
  bonus_def_fum_td_50p: '50+ Yd Fumble Return TD Bonus',
  bonus_def_int_td_50p: '50+ Yd INT Return TD Bonus',
  // Kicker
  fgm:          'FG Made',
  fgm_0_19:     'FG Made (0–19 yd)',
  fgm_20_29:    'FG Made (20–29 yd)',
  fgm_30_39:    'FG Made (30–39 yd)',
  fgm_0_39:     'FG Made (0–39 yd)',
  fgm_40_49:    'FG Made (40–49 yd)',
  fgm_50_59:    'FG Made (50–59 yd)',
  fgm_60p:      'FG Made (60+ yd)',
  fgmiss:       'FG Missed',
  fgmiss_0_19:  'FG Missed (0–19 yd)',
  fgmiss_20_29: 'FG Missed (20–29 yd)',
  fgmiss_30_39: 'FG Missed (30–39 yd)',
  fgmiss_0_39:  'FG Missed (0–39 yd)',
  fgmiss_40_49: 'FG Missed (40–49 yd)',
  fgmiss_50_59: 'FG Missed (50–59 yd)',
  fgmiss_60p:   'FG Missed (60+ yd)',
  xpm:               'Extra Point Made',
  xpmiss:            'Extra Point Missed',
  fgm_yds:           'FG Yards Bonus',
  fgm_yds_over_30:   'FG Yards Over 30 Bonus',
  // Team DST
  def_td:            'Defensive TD (DST)',
  def_2pt:           '2-Pt Return Conv (DST)',
  def_1pt_safe:      '1-Pt Safety (DST)',
  def_int_td:        'INT Return TD (DST)',
  def_fum_td:        'Fumble Return TD (DST)',
  def_ff:            'Forced Fumble (DST)',
  def_3_and_out:     '3-and-Out Forced',
  def_4_and_stop:    '4th Down Stop',
  def_forced_punts:  'Forced Punt',
  def_pass_def:      'Pass Deflection (DST)',
  def_st_tkl_solo:   'ST Solo Tackle (DST)',
  def_kr_yd:         'Kick Return Yards (DST)',
  def_pr_yd:         'Punt Return Yards (DST)',
  sack:              'Sack (DST)',
  sack_half:         'Half Sack (DST)',
  sack_yd:           'Sack Yards (DST)',
  int:               'Interception (DST)',
  int_ret_yd:        'INT Return Yards (DST)',
  safe:              'Safety (DST)',
  tkl:               'Tackle (DST)',
  tkl_solo:          'Solo Tackle (DST)',
  tkl_ast:           'Assisted Tackle (DST)',
  tkl_3:             'Every 3 Tackles (DST)',
  tkl_5:             'Every 5 Tackles (DST)',
  tkl_loss:          'Tackle for Loss (DST)',
  qb_hit:            'QB Hit (DST)',
  def_kr_yd_10:      'Every 10 Kick Return Yards (DST)',
  def_kr_yd_25:      'Every 25 Kick Return Yards (DST)',
  def_pr_yd_10:      'Every 10 Punt Return Yards (DST)',
  def_pr_yd_25:      'Every 25 Punt Return Yards (DST)',
  pts_allow:         'Points Allowed (per pt)',
  pts_allow_0:       'Shutout',
  pts_allow_1_6:     '1–6 Points Allowed',
  pts_allow_7_13:    '7–13 Points Allowed',
  pts_allow_14_17:   '14–17 Points Allowed',
  pts_allow_18_21:   '18–21 Points Allowed',
  pts_allow_22_27:   '22–27 Points Allowed',
  pts_allow_14_20:   '14–20 Points Allowed',
  pts_allow_21_27:   '21–27 Points Allowed',
  pts_allow_28_34:   '28–34 Points Allowed',
  pts_allow_35_45:   '35–45 Points Allowed',
  pts_allow_46p:     '46+ Points Allowed',
  pts_allow_35p:     '35+ Points Allowed',
  yds_allow:         'Yards Allowed (per yd)',
  yds_allow_0_100:   '0–100 Yards Allowed',
  yds_allow_100_199: '100–199 Yards Allowed',
  yds_allow_200_299: '200–299 Yards Allowed',
  yds_allow_300_349: '300–349 Yards Allowed',
  yds_allow_350_399: '350–399 Yards Allowed',
  yds_allow_400_449: '400–449 Yards Allowed',
  yds_allow_450_499: '450–499 Yards Allowed',
  yds_allow_500_549: '500–549 Yards Allowed',
  yds_allow_550p:    '550+ Yards Allowed',
};

export const formatNumber = (value, digits = 1) => value == null ? '—' : Number(value).toFixed(digits);
export const formatStat = value => value == null ? '—' : Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
export const signed = value => value == null ? '—' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}`;
const formatMatchupGameDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
// A date-only fallback ("2025-11-23") is a calendar day, not UTC midnight, so
// it is read in local time. One outside the league season (Sep–Feb) is a
// placeholder from another year and is not shown.
const formatSeasonGameDate = (value, season) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const seasonYear = Number(season);
  if (Number.isFinite(seasonYear) && !(year === seasonYear || (year === seasonYear + 1 && month <= 2))) return null;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
export const formatOrdinal = value => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th');
  return `${number}${suffix}`;
};

export function getSeasonBenchmark({ player, peerModel, projection }) {
  if (matchupNumber(peerModel?.overall?.ppg) != null && (peerModel?.overall?.games ?? 0) > 0) {
    return {
      value: peerModel.overall.ppg,
      label: 'Season average',
      source: `${peerModel.overall.games} qualifying ${peerModel.overall.games === 1 ? 'game' : 'games'}`,
    };
  }
  const playerAverage = matchupNumber(player?.avgPPG);
  if (playerAverage != null && playerAverage > 0) {
    return { value: playerAverage, label: 'Season average', source: 'Current season' };
  }
  const projectionAverage = matchupNumber(projection?.factors?.seasonBase);
  if (projectionAverage != null) {
    const prior = projection?.factors?.source === 'prior-season';
    return {
      value: projectionAverage,
      label: prior ? 'Prior-season average' : 'Projection baseline',
      source: prior ? 'Used until current-season form is established' : 'Projection model input',
    };
  }
  return { value: null, label: 'Season average', source: 'Not established' };
}

export function getOpponentEvidenceLabel(context) {
  if (!context) return 'Opponent context unavailable';
  if (context.evidenceKind === 'blended') {
    return `Early-season blend · ${Math.round(context.currentWeight * 100)}% current`;
  }
  if (context.evidenceKind === 'prior') return 'Prior-season context';
  return `Current season · ${context.currentGames} ${context.currentGames === 1 ? 'game' : 'games'}`;
}


// Shared with PlayerMatchupCompare.jsx.
export function getChartMaximum(...values) {
  const finiteValues = values.flat().map(matchupNumber).filter(value => value != null && value >= 0);
  const maximum = finiteValues.length ? Math.max(...finiteValues) : 0;
  return Math.max(10, Math.ceil(maximum * 1.15));
}

export function getChartPosition(value, maximum) {
  const numeric = matchupNumber(value);
  if (numeric == null || !Number.isFinite(maximum) || maximum <= 0) return null;
  return Math.max(0, Math.min(100, numeric / maximum * 100));
}

/* ── drilldown body ──
   Claude Design "Player Drilldown Dashboard": one hero row (key number +
   phase chart), then evidence sections in a two-column grid at wide widths.
   Game phase alone selects the content; there is no view switcher. */

export const ACCENT = 'var(--color-accent)';
export const POSITIVE = 'var(--color-accent-green)';
export const NEGATIVE = 'var(--color-accent-red)';
export const CAUTION = 'var(--color-accent-orange)';

const TIER_LABELS = { strong: 'Strong', middle: 'Average', weak: 'Weak' };
const SHORT_STAT_LABELS = {
  rec: 'rec', rec_yd: 'rec yds', rec_td: 'rec TD', rush_yd: 'rush yds', rush_td: 'rush TD', rush_att: 'att',
  pass_yd: 'pass yds', pass_td: 'pass TD', pass_int: 'INT', pass_cmp: 'cmp', fgm: 'FG', xpm: 'XP', fum_lost: 'fum lost',
};

const formatCount = value => value == null ? '—' : Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1);
const matchupLabel = (opponent, isHome) => opponent ? `${isHome === false ? 'at' : 'vs'} ${opponent}` : 'Opponent unavailable';
const mean = values => {
  const finite = values.filter(value => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};

function Section({ title, meta, proposed = false, span = false, slot, children, label }) {
  return <section className={`pdd-sec${span ? ' is-span' : ''}`} data-slot={slot} aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
    <h3 className="pdd-sec__h">
      <span>{title}{proposed && <span className="pdd-tag">Preview</span>}</span>
      {meta && <span className="pdd-sec__m">{meta}</span>}
    </h3>
    {children}
  </section>;
}

function Legend({ items }) {
  return <div className="pdd-lg">{items.filter(Boolean).map(item => <span key={item.label}><i className={item.kind} style={item.style} />{item.label}</span>)}</div>;
}

function PlayList({ events }) {
  return <div className="pmd-plays">
    {events.map(event => <div className={`pmd-play${event.kind === 'td' ? ' is-td' : ''}`} key={event.id}>
      <div className="pmd-play__t pmd-num">{event.glance?.clock || '—'}</div>
      <div className="pmd-play__d">{event.desc}</div>
      <div className={`pmd-play__p pmd-num ${event.pts < 0 ? 'pmd-down' : 'pmd-up'}`}>{signed(event.pts)}</div>
    </div>)}
  </div>;
}

function Plays({ model }) {
  if (!model || model.status === 'idle') return null;
  const events = (model.events ?? []).slice().sort((left, right) => (right.order ?? 0) - (left.order ?? 0));
  return <Section title="Scoring plays" meta={events.length ? `${events.length} ${events.length === 1 ? 'play' : 'plays'}` : null} label="Estimated play contributions" span>
    {model.status === 'loading'
      ? <p className="matchup-performance-note">Loading scoring plays…</p>
      : events.length > 0
        ? <PlayList events={events} />
        : <p className="matchup-performance-note">{model.message ?? 'Scoring plays are unavailable for this game.'}</p>}
  </Section>;
}

function Swap({ option, onView }) {
  if (!option || !onView) return null;
  const candidate = option.player;
  const name = candidate?.full_name ?? candidate?.name ?? 'Bench player';
  return <Section title="Better bench option" span label="Better bench option">
    <button type="button" className="pmd-swap__b" onClick={() => onView(candidate.id)} aria-label={`View ${name} bench comparison`}>
      <PlayerAvatar player={candidate} name={name} size={40} />
      <span className="pmd-swap__identity">
        <span className="pmd-swap__n">{name}</span>
        <span className="pmd-swap__s">{[candidate.position, candidate.team, option.slot].filter(Boolean).join(' · ')}</span>
      </span>
      {candidate.availabilityStatus && <PlayerStatusBadge status={candidate.availabilityStatus} compact />}
      <span className="pmd-swap__v">
        <strong className="pmd-num">{formatNumber(option.projected)}</strong>
        <small>+{formatNumber(option.improvement)}</small>
      </span>
    </button>
  </Section>;
}

function DevSlot({ items }) {
  if (!DRILLDOWN_DEV_SLOTS_ENABLED || !items?.length) return null;
  return <div className="pdd-sec is-span" data-slot="slot">
    <div className="pmd-slot">
      <div className="pmd-slot__l">{'// not wired yet'}</div>
      <div className="pmd-slot__i">{items.map(item => <div key={item}>{item}</div>)}</div>
    </div>
  </div>;
}

function DiscRow({ label, children }) {
  if (!children) return null;
  return <details>
    <summary>{label}</summary>
    <div className="pmd-disc__body">{children}</div>
  </details>;
}

function buildHeroModel({ phase, total, projectionView, seasonBenchmark, performanceTarget = null }) {
  const projected = matchupNumber(projectionView?.projection?.projected);
  const season = matchupNumber(seasonBenchmark?.value);

  if (phase === 'pregame') {
    if (projected == null) return null;
    const difference = season != null ? projected - season : null;
    return {
      overline: 'Projected fantasy points',
      value: projected,
      tone: 'flat',
      delta: difference == null ? null : {
        v: signed(difference),
        l: `vs ${formatNumber(season)} ${seasonBenchmark.label.toLowerCase()}`,
        tone: difference >= 0 ? 'up' : 'down',
      },
    };
  }

  const scored = matchupNumber(total);
  const target = phase === 'live' ? matchupNumber(performanceTarget) : projected;
  const difference = scored != null && target != null ? scored - target : null;
  return {
    overline: phase === 'final' ? 'Final fantasy points' : 'Fantasy points so far',
    value: scored,
    digits: 2,
    tone: difference == null ? 'flat' : difference >= 0 ? 'up' : 'down',
    note: scored == null ? 'Actual scoring has not been reported for this player.' : null,
    delta: difference == null ? null : {
      v: signed(difference),
      l: `vs ${formatNumber(target)} ${phase === 'final' ? 'projected' : 'expected pace'}`,
      tone: difference >= 0 ? 'up' : 'down',
    },
  };
}

function buildRankModel({ phase, rank, weekRank, position, week }) {
  // weekRank is only populated once the NFL week has fully concluded, so live
  // games fall back to the season-points rank rather than inventing a live one.
  const useWeek = phase === 'final' && weekRank?.rank != null;
  const source = useWeek ? weekRank : rank;
  const rankValue = matchupNumber(source?.rank);
  const peerCount = matchupNumber(source?.posCount);
  const label = source?.posLabel ?? position ?? '';
  const rankAudience = {
    QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs', K: 'kickers',
    DEF: 'defenses', DL: 'defensive linemen', LB: 'linebackers', DB: 'defensive backs',
  }[String(label).toUpperCase()] ?? `${label || 'position'} players`;
  const title = useWeek ? `Week ${week} finish` : 'Season rank';
  if (rankValue == null) return { title, value: '—', detail: 'Not established' };
  return {
    title,
    value: `${label}${rankValue}`,
    detail: peerCount != null && peerCount > 0 ? `of ${peerCount}` : `${formatOrdinal(rankValue)} among ${rankAudience}`,
  };
}

function KeyTiles({ tiles }) {
  const visible = tiles.filter(Boolean);
  if (!visible.length) return null;
  return <div className="pdd-mk">
    {visible.map(tile => {
      const content = <>
        <span className="pmd-eyebrow">{tile.label}</span>
        <b className={`pmd-num${tile.tone ? ` pdd-${tile.tone}` : ''}`}>{tile.value}{tile.em && <em className={`pdd-${tile.em.tone}`}>{tile.em.text}</em>}</b>
        {tile.detail && <span>{tile.detail}</span>}
      </>;
      return tile.onClick
        ? <button key={tile.label} type="button" className="pdd-mk__btn" aria-label={tile.ariaLabel} title={tile.title} onClick={tile.onClick}>{content}</button>
        : <div key={tile.label}>{content}</div>;
    })}
  </div>;
}

function PointsPopover({ title, line }) {
  if (!line) return null;
  const rows = [
    ...line.items.filter(item => item.pts !== 0 || item.value),
    ...(line.other != null ? [{ key: 'other', label: 'Other scoring', value: null, pts: line.other }] : []),
  ];
  return <div className="pdd-tip pdd-tip--bd" role="dialog" aria-label={title}>
    <b>{title}</b>
    <div className="pdd-bdt">
      {rows.map(row => <span key={row.key} className="pdd-bdt__r">
        <span>{row.label}</span>
        <span className="pdd-bdt__s pmd-num">{row.value == null ? '' : formatCount(row.value)}</span>
        <span className="pdd-bdt__p pmd-num">{row.pts < 0 ? signed(row.pts) : formatNumber(row.pts)}</span>
      </span>)}
      <span className="pdd-bdt__r is-total"><span>Total</span><span /><span className="pdd-bdt__p pmd-num">{formatNumber(line.total)}</span></span>
    </div>
  </div>;
}

function Hero({ model, popover, tiles }) {
  const [open, setOpen] = useState(false);
  const pointer = useRef('mouse');
  if (!model) return <div className="pdd-k"><KeyTiles tiles={tiles} /></div>;
  const digits = model.digits ?? 1;
  const bigClass = `pmd-big pmd-num pmd-${model.tone}`;
  // Hover reveals the breakdown with a mouse; touch toggles it with a tap and
  // keyboard focus opens it, matching the design's tooltip behavior.
  return <div className="pdd-k">
    <span className="pmd-eyebrow">{model.overline}</span>
    {popover && model.value != null
      ? <button
        type="button"
        className={`${bigClass} pdd-big--btn`}
        aria-expanded={open}
        aria-label={`${formatNumber(model.value, digits)} points. Show where the points come from.`}
        onPointerDown={(event) => { pointer.current = event.pointerType; }}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setOpen(true); }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setOpen(false); }}
        onClick={() => { if (pointer.current !== 'mouse') setOpen(current => !current); else setOpen(true); }}
        onFocus={(event) => { if (event.currentTarget.matches?.(':focus-visible')) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      >{formatNumber(model.value, digits)}<small>PTS</small></button>
      : <strong className={bigClass}>{formatNumber(model.value, digits)}<small>PTS</small></strong>}
    {open && popover}
    {model.delta && <span className={`pdd-dl pmd-${model.delta.tone}`}><span className="pmd-num">{model.delta.v}</span> <span>{model.delta.l}</span></span>}
    {model.note && <p className="matchup-performance-note">{model.note}</p>}
    <KeyTiles tiles={tiles} />
  </div>;
}

function averageLine(lines) {
  const valid = lines.filter(Boolean);
  if (!valid.length) return null;
  const first = valid[0];
  return {
    items: first.items.map((item, index) => ({
      ...item,
      value: mean(valid.map(line => matchupNumber(line.items[index]?.value))),
      pts: mean(valid.map(line => line.items[index]?.pts ?? 0)) ?? 0,
    })),
    other: mean(valid.map(line => line.other ?? 0)),
    total: mean(valid.map(line => line.total)),
  };
}

function statRows(line, reference = null) {
  if (!line) return [];
  const rows = line.items.map((item, index) => ({
    key: item.key,
    label: item.label,
    small: item.value == null ? null : formatCount(Math.round(item.value * 10) / 10),
    pts: item.pts,
    tone: statTone(index, item.pts),
    ref: reference ? reference.items[index]?.pts ?? null : null,
  }));
  if (line.other != null || reference?.other) {
    rows.push({ key: 'other', label: 'Other scoring', small: null, pts: line.other ?? 0, tone: 'var(--color-label-tertiary)', ref: reference ? reference.other ?? 0 : null });
  }
  return rows;
}

function lineSummary(line) {
  return line?.items
    .filter(item => item.value)
    .slice(0, 3)
    .map(item => `${formatCount(item.value)} ${SHORT_STAT_LABELS[item.key] ?? item.label}`)
    .join(' · ') || null;
}

function NextWeekSection({ playerId, players, weeklyStats, scheduleMap, scoring, week, position }) {
  const nextWeek = useMemo(
    () => buildNextWeekPreview({ playerId, players, weeklyStats, scheduleMap, scoringSettings: scoring, week }),
    [playerId, players, weeklyStats, scheduleMap, scoring, week],
  );
  if (!nextWeek) return null;
  const next = nextWeek.opponentContext;
  return <Section title="Next week" meta={nextWeek.bye ? `W${nextWeek.week} · bye` : `W${nextWeek.week} · ${matchupLabel(nextWeek.opponent, nextWeek.isHome)}`}>
    {nextWeek.bye
      ? <p className="matchup-performance-note">Bye week — no game scheduled.</p>
      : <>
        <KeyTiles tiles={[
          { label: 'Early estimate', value: formatNumber(nextWeek.projected), detail: 'GridShift model' },
          next?.rank != null && { label: `${nextWeek.opponent} vs ${position}`, value: `#${next.rank}`, detail: `of ${next.teamCount} · ${formatNumber(next.ptsAllowedPerGame)} pts allowed/game` },
        ]} />
        {next?.rank != null && <RankStrip
          rank={next.rank}
          teamCount={next.teamCount}
          caption={next.rank <= next.teamCount / 2 ? 'Tougher than avg' : 'Softer than avg'}
          ariaLabel={`${nextWeek.opponent} ranks ${next.rank} of ${next.teamCount} by fantasy points allowed to ${position}s.`}
        />}
      </>}
  </Section>;
}

export default function PlayerMatchupBreakdown({ playerId, week, projection, baseline = null, enrichedPlayer, onClose, onViewStats, onViewScheduleGame = null, onOpenInjuries = null, benchComparison = null, onViewBenchPlayer }) {
  const { platform, players, weeklyStats, activeScoringSettings, espnIdOverrides, season, scheduleMap, selectedLeagueId } = useSleeperBase();
  const { darkMode } = useTheme();
  const [espnDerivedWeekEntryState, setEspnDerivedWeekEntryState] = useState({ key: '', row: null });
  // `source` is the chart that picked the week: only a Recent form pick also
  // swaps the projection build for that week's scoring.
  const [link, setLink] = useState({ week: null, stat: null, use: null, source: null });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const player = players?.[playerId];
  const scheduleEntry = enrichedPlayer?.scheduleEntry ?? scheduleMap?.[week]?.[player?.team] ?? null;
  const phase = getPlayerMatchupPhase({ scheduleEntry, gameStarted: enrichedPlayer?.gameStarted, now });
  const isPregame = phase === 'pregame';
  const position = player?.position ?? enrichedPlayer?.position ?? null;
  const espnId = player?.espn_id ?? espnIdOverrides?.[playerId];
  const scoring = activeScoringSettings ?? DEFAULT_SCORING;

  const teamTheme = getTeamVisualTheme(player?.team, darkMode);
  const headerStyle = {
    background: teamTheme?.gradient ?? 'var(--color-bg-secondary)',
    '--matchup-header-fg': teamTheme?.gradientForeground ?? 'var(--color-label)',
    '--matchup-header-muted': teamTheme?.gradientMuted ?? 'var(--color-label-secondary)',
    '--matchup-header-subtle': teamTheme?.gradientSubtle ?? 'var(--color-fill-secondary)',
    '--matchup-header-accent': teamTheme?.accentColor ?? 'var(--color-accent)',
  };
  const baseWeekEntry = useMemo(() => {
    if (isPregame) return null;
    const entry = weeklyStats?.[playerId]?.find(w => w.week === week) ?? null;
    const fallbackPoints = matchupNumber(enrichedPlayer?.weekPts);
    if (entry) {
      if (!Number.isFinite(fallbackPoints)) return entry;
      if (entry._fantasyPoints != null || entry.fantasy_points != null || entry.appliedTotal != null) return entry;
      return { ...entry, _fantasyPoints: fallbackPoints, fantasy_points: fallbackPoints };
    }
    if (!Number.isFinite(fallbackPoints)) return null;
    return { week, _fantasyPoints: fallbackPoints, fantasy_points: fallbackPoints };
  }, [isPregame, enrichedPlayer?.weekPts, playerId, week, weeklyStats]);
  const shouldLoadEspnDerivedBreakdown = !isPregame && platform === 'espn'
    && isEspnFantasyGameLogPosition(position)
    && Boolean(espnId)
    && Number.isFinite(Number(week));
  const espnDerivedWeekEntryKey = shouldLoadEspnDerivedBreakdown
    ? [season, espnId, week, position].join('|')
    : '';
  const espnDerivedWeekEntry = espnDerivedWeekEntryState.key === espnDerivedWeekEntryKey
    ? espnDerivedWeekEntryState.row
    : null;

  useEffect(() => {
    if (!espnDerivedWeekEntryKey) return undefined;
    let cancelled = false;
    void loadEspnFantasyGameLogWeekRow({
      playerId: espnId,
      player: { ...(player ?? {}), espn_id: espnId, position, team: player?.team ?? enrichedPlayer?.team ?? null },
      season,
      scoringSettings: activeScoringSettings,
      week,
    })
      .then((row) => { if (!cancelled) setEspnDerivedWeekEntryState({ key: espnDerivedWeekEntryKey, row: row ?? null }); })
      .catch(() => { if (!cancelled) setEspnDerivedWeekEntryState({ key: espnDerivedWeekEntryKey, row: null }); });
    return () => { cancelled = true; };
  }, [activeScoringSettings, enrichedPlayer?.team, espnId, espnDerivedWeekEntryKey, player, position, season, week]);

  const weekEntry = useMemo(() => (
    isPregame ? null : espnDerivedWeekEntry
      ? mergeOfficialFantasyTotal(baseWeekEntry, espnDerivedWeekEntry)
      : baseWeekEntry
  ), [baseWeekEntry, espnDerivedWeekEntry, isPregame]);

  const { breakdown, total } = useMemo(() => {
    if (!weekEntry) return { breakdown: [], total: null };
    const result = buildFantasyScoringBreakdown(weekEntry, scoring, position, {
      preferRawStats: Boolean(espnDerivedWeekEntry),
      adjustmentLabel: platform === 'espn' ? 'Official Scoring Adjustment' : 'Scoring Adjustment',
    });
    return { breakdown: result.rows, total: result.total };
  }, [weekEntry, scoring, position, espnDerivedWeekEntry, platform]);

  const projectionView = useMemo(() => resolvePlayerDisplayProjection({ isPregame, projection, baseline }), [baseline, isPregame, projection]);
  const displayProjection = projectionView.projection;
  const projectedValue = matchupNumber(displayProjection?.projected);
  const projectedBreakdown = useMemo(() => buildPlayerProjectionBreakdown(displayProjection, scoring, position), [displayProjection, scoring, position]);
  const peerModel = useMemo(() => buildPlayerDefensePerformance({ playerId, oppTeam: enrichedPlayer?.oppTeam, weeklyStats, players, scheduleMap, currentWeek: week, scoringSettings: scoring }), [playerId, enrichedPlayer?.oppTeam, weeklyStats, players, scheduleMap, week, scoring]);
  const timeline = usePlayerMatchupTimeline({
    enabled: phase === 'live' || phase === 'final',
    phase,
    leagueId: selectedLeagueId,
    platform,
    season,
    week,
    playerId,
    players,
    team: player?.team,
    opponent: enrichedPlayer?.oppTeam,
    scoringSettings: scoring,
  });
  const benchOption = buildPlayerMatchupBenchOption({ context: benchComparison, now });

  const seasonBenchmark = getSeasonBenchmark({ player: enrichedPlayer, peerModel, projection: displayProjection });
  const opponentContext = enrichedPlayer?.opponentFantasyContext ?? (enrichedPlayer?.defStrength ? {
    ...enrichedPlayer.defStrength,
    team: enrichedPlayer?.oppTeam,
    position,
    currentGames: enrichedPlayer.defStrength.gamesAnalyzed,
    evidenceKind: 'current',
  } : null);
  const performanceTarget = getPlayerPerformanceTarget({ phase, total, projected: projectedValue, scheduleEntry, now });
  const hero = buildHeroModel({ phase, total, projectionView, seasonBenchmark, performanceTarget });
  const rankModel = buildRankModel({ phase, rank: enrichedPlayer?.rank, weekRank: enrichedPlayer?.weekRank, position, week });

  /* ── weekly evidence: one set of rows feeds the form chart, the stat line and the bridge ── */
  const tierMetric = peerModel?.metrics?.find(metric => metric.id === (position === 'RB' ? 'rushing' : 'receiving')) ?? peerModel?.metrics?.[0] ?? null;
  const tierByWeek = useMemo(() => new Map((tierMetric?.buckets ?? []).flatMap(bucket => (bucket.gameRows ?? []).map(row => [Number(row.week), bucket.id]))), [tierMetric]);
  const settledPoints = phase === 'final' ? matchupNumber(total) : null;
  const weeks = useMemo(() => buildDrilldownWeeks({
    gameRows: peerModel?.overall?.gameRows ?? [],
    weeklyEntries: weeklyStats?.[playerId] ?? [],
    scoringSettings: scoring,
    position,
    currentWeek: week,
    current: settledPoints == null ? null : { points: settledPoints, rows: breakdown, entry: weekEntry, opponent: enrichedPlayer?.oppTeam ?? null, isHome: enrichedPlayer?.isHome ?? null },
    tierByWeek,
  }), [peerModel, weeklyStats, playerId, scoring, position, week, settledPoints, breakdown, weekEntry, enrichedPlayer?.oppTeam, enrichedPlayer?.isHome, tierByWeek]);
  const recent = useMemo(() => weeks.prior.slice(-(DRILLDOWN_FORM_WEEKS - 1)), [weeks]);
  const currentRows = weeks.current?.rows ?? breakdown;
  const projectedRows = projectedBreakdown?.rows;
  const statKeys = useMemo(() => selectDrilldownStatKeys([
    ...recent.map(row => row.rows),
    projectedRows ?? [],
    currentRows,
  ]), [recent, projectedRows, currentRows]);
  const lineByWeek = new Map([...weeks.prior, ...(weeks.current ? [weeks.current] : [])]
    .map(row => [row.week, buildDrilldownStatLine({ rows: row.rows, entry: row.entry, statKeys, total: row.points })]));
  const projectedLine = projectedBreakdown?.rows?.length
    ? buildDrilldownStatLine({ rows: projectedBreakdown.rows, entry: displayProjection?.projectedStats, statKeys, total: projectedValue })
    : null;
  const actualLine = !isPregame && weekEntry ? buildDrilldownStatLine({ rows: breakdown, entry: weekEntry, statKeys, total }) : null;
  const seasonLine = averageLine(weeks.prior.map(row => lineByWeek.get(row.week)));
  const bridge = isPregame ? buildProjectionBridge({ projection: displayProjection, projectedRows: projectedBreakdown?.rows ?? [], priorWeeks: weeks.prior }) : null;

  const elapsed = getDrilldownElapsedFraction({ phase, scheduleEntry, total, now });
  const estimate = getPaceAdjustedProjection({ phase, total, projected: projectedValue, scheduleEntry, now });
  const pace = phase === 'pregame' ? null : buildScoringPace({
    events: timeline.events,
    phase,
    elapsed,
    total,
    projected: projectedValue,
    low: displayProjection?.min,
    high: displayProjection?.max,
    estimate,
  });

  const weather = enrichedPlayer ? formatWeather(enrichedPlayer.weather, enrichedPlayer.isIndoor ?? false) : null;
  const teamScore = matchupNumber(enrichedPlayer?.scheduleEntry?.ptsFor);
  const opponentScore = matchupNumber(enrichedPlayer?.scheduleEntry?.ptsAgainst);
  const finalScore = phase === 'final' && teamScore != null && opponentScore != null
    ? { team: player?.team ?? enrichedPlayer?.team, teamScore, opponent: enrichedPlayer?.oppTeam, opponentScore }
    : null;
  // A settled game does not need its kickoff time, only the day it was played.
  const kickoff = (finalScore ? formatMatchupGameDate(enrichedPlayer?.scheduleEntry?.kickoff) : null)
    ?? formatStatisticsScoresLocalKickoff(enrichedPlayer?.scheduleEntry?.kickoff)
    ?? formatSeasonGameDate(enrichedPlayer?.gameDate, season)
    ?? null;
  const opponentLogo = enrichedPlayer?.oppTeam ? getNflTeamLogoUrl(String(enrichedPlayer.oppTeam).toLowerCase()) : null;
  const opponentLine = [
    enrichedPlayer?.isHome == null
      ? (enrichedPlayer?.oppTeam ? `vs ${enrichedPlayer.oppTeam}` : enrichedPlayer?.isBye ? 'Bye week' : 'Opponent unavailable')
      : enrichedPlayer.isHome ? `Home vs ${enrichedPlayer.oppTeam}` : `Away at ${enrichedPlayer.oppTeam}`,
    enrichedPlayer?.stadium?.name,
    enrichedPlayer?.stadium?.city,
    enrichedPlayer?.isIndoor === true ? 'Indoor' : weather,
  ].filter(Boolean).join(' · ');

  const canOpenStatistics = Boolean(onViewStats && espnId);
  const openStatisticsMode = (statisticsMode) => {
    if (!canOpenStatistics) return;
    onClose();
    onViewStats(String(espnId), {
      displayName: player?.full_name, teamId: player?.team?.toUpperCase(), position,
      experience: player?.years_exp != null ? player.years_exp + 1 : undefined,
    }, { mode: statisticsMode });
  };

  // The phase strip's matchup opens the same NFL game on Statistics › Schedule.
  const scheduleTeam = player?.team ? String(player.team).toUpperCase() : null;
  const scheduleOpponent = enrichedPlayer?.oppTeam ? String(enrichedPlayer.oppTeam).toUpperCase() : null;
  const scheduleIsHome = typeof enrichedPlayer?.isHome === 'boolean' ? enrichedPlayer.isHome
    : typeof enrichedPlayer?.scheduleEntry?.home === 'boolean' ? enrichedPlayer.scheduleEntry.home : null;
  const scheduleGameId = season && week != null && scheduleTeam && scheduleOpponent && scheduleIsHome != null
    ? `${season}-W${week}-${scheduleIsHome ? scheduleOpponent : scheduleTeam}-${scheduleIsHome ? scheduleTeam : scheduleOpponent}`
    : null;
  const canOpenScheduleGame = Boolean(onViewScheduleGame && scheduleGameId);
  const openScheduleGame = () => {
    if (!canOpenScheduleGame) return;
    onClose();
    onViewScheduleGame({ week: Number(week), gameId: scheduleGameId });
  };

  // An injury designation opens the player's entry on Fantasy › Injuries.
  const availabilityStatus = enrichedPlayer?.availabilityStatus ?? null;
  const canOpenInjuries = Boolean(onOpenInjuries && availabilityStatus && playerId != null);
  const openInjuries = () => {
    if (!canOpenInjuries) return;
    onClose();
    onOpenInjuries(playerId);
  };

  /* ── linked week chart + stat line ── */
  const weekResult = (row) => {
    const entry = scheduleMap?.[row.week]?.[row.entry?.team ?? player?.team] ?? null;
    const own = matchupNumber(entry?.ptsFor);
    const other = matchupNumber(entry?.ptsAgainst);
    if (own == null || other == null) return null;
    return `${own > other ? 'W' : own < other ? 'L' : 'T'} ${own}–${other}`;
  };
  const columnsSource = isPregame ? recent : phase === 'final' ? [...recent, ...(weeks.current ? [weeks.current] : [])] : [];
  const selectedWeek = link.week ?? Number(week);
  const metricFor = row => (link.use === 'snaps' ? row.snapShare : getStatLinePoints(lineByWeek.get(row.week), link.stat));
  const columns = columnsSource.map(row => ({
    week: row.week,
    opp: row.opponent,
    value: metricFor(row),
    current: phase === 'final' && row.week === Number(week),
    ariaLabel: `Week ${row.week} ${matchupLabel(row.opponent, row.isHome)}${phase === 'final' && row.week === Number(week) ? ', this week' : ''}`,
  }));
  if (isPregame && projectedValue != null) {
    columns.push({
      week: Number(week),
      opp: enrichedPlayer?.oppTeam ?? null,
      value: link.use ? null : projectedLine ? getStatLinePoints(projectedLine, link.stat) : link.stat ? null : projectedValue,
      ghost: true,
      ariaLabel: `Week ${week} ${matchupLabel(enrichedPlayer?.oppTeam, enrichedPlayer?.isHome)}, projected`,
    });
  }
  const columnAverage = link.use === 'snaps'
    ? mean(weeks.prior.map(row => row.snapShare))
    : mean(weeks.prior.map(row => getStatLinePoints(lineByWeek.get(row.week), link.stat)));
  const statLabel = link.stat === 'other' ? 'Other scoring' : statKeys.find(key => key.key === link.stat)?.label;
  const formMeta = link.use === 'snaps' ? 'snap share by week' : statLabel ? `${statLabel} pts by week` : isPregame ? `last ${recent.length} + this week` : `last ${columns.length} ${columns.length === 1 ? 'game' : 'games'}`;
  const selectedRow = [...weeks.prior, ...(weeks.current ? [weeks.current] : [])].find(row => row.week === selectedWeek) ?? null;
  const selectedIsProjection = isPregame && selectedWeek === Number(week);
  const selectedIsCurrent = phase === 'final' && selectedWeek === Number(week);
  const selectedLine = selectedIsProjection ? projectedLine : selectedIsCurrent ? actualLine ?? lineByWeek.get(selectedWeek) : lineByWeek.get(selectedWeek) ?? null;
  const referenceLine = phase === 'final' ? (selectedIsCurrent ? projectedLine : seasonLine) : null;
  const lineMax = Math.max(
    ...columnsSource.map(row => lineByWeek.get(row.week)?.total ?? 0),
    projectedLine?.total ?? 0,
    referenceLine?.total ?? 0,
    1,
  );
  const selectWeek = weekNumber => setLink(current => ({ ...current, week: weekNumber, source: 'form' }));
  // Likely outcome games toggle: picking the selected game again returns to this week.
  const pickGame = source => weekNumber => setLink(current => (
    current.week === weekNumber ? { ...current, week: null, source: null } : { ...current, week: weekNumber, source }
  ));
  const selectStat = key => setLink(current => ({ ...current, stat: !key || current.stat === key ? null : key, use: null }));
  const selectUse = key => setLink(current => ({ ...current, use: current.use === key ? null : key, stat: null }));
  // Before kickoff, a played week picked in Recent form or Likely outcome
  // drives the hero, rank and outcome views, and the tier chart highlights
  // that week's defense tier.
  const pastRow = isPregame && !selectedIsProjection ? selectedRow : null;
  const pastWeek = pastRow?.week ?? null;
  // computeWeeklyPositionalRanks caches each week's ranks itself.
  const pastWeekRank = pastWeek == null ? null : computeWeeklyPositionalRanks(weeklyStats, players, scoring, pastWeek)?.[playerId] ?? null;
  const selectedMeta = selectedIsProjection
    ? `W${week} · ${matchupLabel(enrichedPlayer?.oppTeam, enrichedPlayer?.isHome)}`
    : selectedRow ? [`W${selectedRow.week}`, matchupLabel(selectedRow.opponent, selectedRow.isHome), weekResult(selectedRow)].filter(Boolean).join(' · ') : null;

  /* ── hero tiles and popover ── */
  const priorAverage = mean(weeks.prior.map(row => row.points));
  // The settled season average is the same benchmark as the season-average figures elsewhere.
  const withCurrentAverage = weeks.current ? matchupNumber(seasonBenchmark.value) ?? mean([...weeks.prior.map(row => row.points), weeks.current.points]) : null;
  const shownRank = pastRow ? buildRankModel({ phase: 'final', rank: null, weekRank: pastWeekRank, position, week: pastRow.week }) : rankModel;
  const rankTile = { label: shownRank.title, value: shownRank.value, detail: shownRank.detail };
  const benchmarkValue = matchupNumber(seasonBenchmark.value);
  const pastDifference = pastRow && benchmarkValue != null ? pastRow.points - benchmarkValue : null;
  const heroModel = pastRow ? {
    overline: `Week ${pastRow.week} fantasy points`,
    value: pastRow.points,
    tone: 'flat',
    delta: pastDifference == null ? null : {
      v: signed(pastDifference),
      l: `vs ${formatNumber(benchmarkValue)} ${seasonBenchmark.label.toLowerCase()}`,
      tone: pastDifference >= 0 ? 'up' : 'down',
    },
  } : hero;
  const tiles = isPregame ? [
    rankTile,
    {
      label: 'Status',
      value: availabilityStatus ?? 'Active',
      tone: availabilityStatus ? 'caution' : 'up',
      detail: availabilityStatus ? 'Injury designation' : 'No injury tag',
      ...(canOpenInjuries && {
        onClick: openInjuries,
        ariaLabel: `Status ${availabilityStatus}. View ${player?.full_name ?? 'this player'} in Fantasy Injuries`,
        title: 'View in Fantasy Injuries',
      }),
    },
  ] : phase === 'live' ? [
    estimate != null && { label: 'Est. finish', value: formatNumber(estimate), detail: 'pace-adjusted' },
  ] : [
    rankTile,
    withCurrentAverage != null && priorAverage != null && {
      label: 'Season avg',
      value: formatNumber(withCurrentAverage),
      em: { text: `${withCurrentAverage >= priorAverage ? '▲' : '▼'}${formatNumber(Math.abs(withCurrentAverage - priorAverage))}`, tone: withCurrentAverage >= priorAverage ? 'up' : 'down' },
      detail: `was ${formatNumber(priorAverage)}`,
    },
  ];
  const popoverLine = pastRow ? lineByWeek.get(pastRow.week) : isPregame ? projectedLine : actualLine;
  const popover = popoverLine
    ? <PointsPopover line={popoverLine} title={pastRow ? `Where the Week ${pastRow.week} points came from` : isPregame ? 'Where the projection comes from' : phase === 'final' ? 'Where the points came from' : 'Where the live points come from'} />
    : null;

  /* ── chart beside the hero ── */
  const outlookGames = recent.map((row) => {
    const line = lineByWeek.get(row.week);
    const tier = row.tier ? `${TIER_LABELS[row.tier]} defense` : null;
    const result = weekResult(row);
    return {
      week: row.week,
      points: row.points,
      title: `W${row.week} · ${matchupLabel(row.opponent, row.isHome)}`,
      lines: [lineSummary(line), [tier, result].filter(Boolean).join(' · ')].filter(Boolean),
      ariaLabel: `Week ${row.week} ${matchupLabel(row.opponent, row.isHome)}: ${formatNumber(row.points)} points${tier ? `, ${tier.toLowerCase()}` : ''}${result ? `, ${result}` : ''}. Select to filter by this game.`,
    };
  });
  const low = matchupNumber(displayProjection?.min);
  const high = matchupNumber(displayProjection?.max);
  const band = low != null && high != null && high > low;
  const seasonValue = matchupNumber(seasonBenchmark.value);
  // Without a play feed (no provider key, or the feed is down) every point is
  // unmatched, so play-only cues stay hidden instead of reading as stat updates.
  const playsLoaded = timeline.status === 'ready' || timeline.status === 'empty';
  const paceLegend = pace && [
    { label: 'Points', kind: 'ln' },
    projectedValue != null && { label: 'Projection pace', kind: 'dash' },
    phase === 'live' && pace.low != null && pace.high != null && { label: 'Likely range', kind: 'sw', style: { background: 'var(--color-drilldown-band)' } },
    playsLoaded && { label: 'TD', kind: 'dot', style: { background: 'var(--color-accent)' } },
  ];
  let heroChart = null;
  let outcomeSection = null;
  // With no past games and no likely range the outcome scale would only repeat
  // the hero's projection-vs-average line, so it is left out.
  if (isPregame && projectedValue != null && (outlookGames.length > 0 || band)) {
    outcomeSection = <Section key="outcome" title="Likely outcome" meta={outlookGames.length ? 'Select a game to filter' : null}>
      <OutlookChart
        games={outlookGames}
        projected={projectedValue}
        average={seasonValue}
        low={low}
        high={high}
        selectedWeek={pastWeek}
        onSelect={pickGame('outcome')}
        ariaLabel={`Projection ${formatNumber(projectedValue)}${band ? `, likely range ${formatNumber(low)} to ${formatNumber(high)}` : ''}${seasonValue != null ? `, ${seasonBenchmark.label.toLowerCase()} ${formatNumber(seasonValue)}` : ''}`}
      />
      <Legend items={[
        outlookGames.length > 0 && { label: 'Past games', kind: 'dot', style: { background: 'var(--color-label-tertiary)' } },
        band && { label: `Likely range ${formatNumber(low)}–${formatNumber(high)}`, kind: 'sw', style: { background: 'var(--color-drilldown-band)' } },
        seasonValue != null && { label: `${seasonBenchmark.label} ${formatNumber(seasonValue)}`, kind: 'dash' },
      ]} />
    </Section>;
  } else if (phase === 'live') {
    heroChart = <Section title="Scoring pace" meta={projectedValue != null ? `proj ${formatNumber(projectedValue)}` : null}>
      {pace
        ? <PaceChart pace={pace} ariaLabel={`${formatNumber(total)} points${projectedValue != null ? ` against a ${formatNumber(projectedValue)} projection` : ''}`} />
        : <p className="matchup-performance-note">{timeline.status === 'loading' ? 'Loading the scoring pace…' : 'The scoring pace needs a projection or play data for this game.'}</p>}
      {paceLegend && <Legend items={paceLegend} />}
      {playsLoaded && pace?.unexplained ? <p className="matchup-performance-note">{signed(pace.unexplained)} pts at now are stat updates not matched to a play.</p> : null}
    </Section>;
  } else if (phase === 'final') {
    heroChart = <Section title="Game flow" meta={projectedValue != null ? `proj ${formatNumber(projectedValue)}` : null}>
      {pace?.marks?.length
        ? <PaceChart pace={pace} ariaLabel={`Finished with ${formatNumber(total)} points${projectedValue != null ? ` against a ${formatNumber(projectedValue)} projection` : ''}`} />
        : <p className="matchup-performance-note">{timeline.status === 'loading' ? 'Loading the game flow…' : timeline.message ?? 'Play-by-play is unavailable for this game.'}</p>}
      {pace?.marks?.length > 0 && <Legend items={paceLegend} />}
      {pace?.marks?.length > 0 && pace.unexplained ? <p className="matchup-performance-note">{signed(pace.unexplained)} pts are stat corrections not matched to a play.</p> : null}
    </Section>;
  }

  /* ── stat rings (live / final) ── */
  const ringItems = !isPregame && projectedLine && actualLine
    ? projectedLine.items.map((item, index) => ({ item, actual: actualLine.items[index] })).filter(({ item }) => item.value > 0).slice(0, 4)
    : [];

  /* ── evidence sections ── */
  const sections = [];
  let buildSection = null;
  const weekShift = pastRow && link.source === 'form' ? buildWeekCategoryShift({ week: pastRow, priorWeeks: weeks.prior }) : null;
  if (weekShift) {
    const column = `W${pastRow.week}`;
    buildSection = <Section key="build" title={`Week ${pastRow.week} build`} meta={`season avg → ${column} pts`}>
      <CategoryShiftChart
        categories={weekShift.categories}
        average={weekShift.average}
        projected={weekShift.projected}
        columns={{ average: 'Avg', projected: column }}
        ariaLabel={[
          ...weekShift.categories.map(category => `${category.label} ${formatNumber(category.average)} average, ${formatNumber(category.projected)} in week ${pastRow.week}`),
          `Total ${formatNumber(weekShift.average)} average, ${formatNumber(weekShift.projected)} in week ${pastRow.week}`,
        ].join('; ')}
      />
      <Legend items={[
        { label: 'Season avg', kind: 'dot', style: { background: 'var(--color-label-secondary)' } },
        { label: 'Above avg', kind: 'dot', style: { background: 'var(--color-accent-green)' } },
        { label: 'Below avg', kind: 'dot', style: { background: 'var(--color-accent-red)' } },
      ]} />
    </Section>;
  } else if (isPregame && bridge) {
    buildSection = (bridge.kind === 'provider' && bridge.categories?.length
      ? <Section key="build" title="Projection build" meta="season avg → projected pts">
        <CategoryShiftChart
          categories={bridge.categories}
          average={bridge.average}
          projected={bridge.projected}
          ariaLabel={[
            ...bridge.categories.map(category => `${category.label} ${formatNumber(category.average)} average, ${formatNumber(category.projected)} projected`),
            `Total ${formatNumber(bridge.average)} average, ${formatNumber(bridge.projected)} projected`,
          ].join('; ')}
        />
        <Legend items={[
          { label: 'Season avg', kind: 'dot', style: { background: 'var(--color-label-secondary)' } },
          { label: 'Projected higher', kind: 'dot', style: { background: 'var(--color-accent-green)' } },
          { label: 'Projected lower', kind: 'dot', style: { background: 'var(--color-accent-red)' } },
        ]} />
      </Section>
      : <Section key="build" title="Projection build" meta={bridge.kind === 'provider' ? null : bridge.sourceLabel}>
        <BridgeChart steps={bridge.steps} ariaLabel={bridge.steps.map(step => `${step.label} ${step.kind ? formatNumber(step.value) : signed(step.value)}`).join(', ')} />
      </Section>);
  }
  // Tiers with no games in any of them would draw three empty columns.
  const tiersAvailable = Boolean(tierMetric && !tierMetric.coverageReason && tierMetric.buckets?.some(bucket => bucket.games > 0));
  let tierSection = null;
  if (isPregame && (tiersAvailable || opponentContext?.rank != null)) {
    const opponentName = enrichedPlayer?.oppTeam ?? 'Opponent';
    tierSection = (<Section key="tiers" title="Vs defense tier" meta={tiersAvailable ? `pts per game · ${tierMetric.label.toLowerCase()}` : null}>
      {tiersAvailable && <TierChart
        buckets={tierMetric.buckets.map((bucket) => {
          const label = TIER_LABELS[bucket.id] ?? bucket.label;
          const games = bucket.gameRows ?? [];
          return {
            id: bucket.id,
            label,
            ppg: bucket.ppg,
            games: bucket.games,
            tipTitle: `${label} defenses · ${bucket.games} ${bucket.games === 1 ? 'game' : 'games'}`,
            tipValue: bucket.ppg == null ? null : `${formatNumber(bucket.ppg)} pts per game`,
            lines: games.map(row => `W${row.week} ${matchupLabel(row.opponent, row.isHome)} · ${formatNumber(row.points)} pts`),
            ariaLabel: `${label} defenses: ${bucket.ppg == null ? 'no games' : `${formatNumber(bucket.ppg)} points per game`}${games.length ? `. ${games.map(row => `Week ${row.week} ${matchupLabel(row.opponent, row.isHome)} ${formatNumber(row.points)}`).join(', ')}` : ''}`,
          };
        })}
        highlight={pastRow ? pastRow.tier ?? tierByWeek.get(pastRow.week) ?? null : tierMetric.opponent?.bucket}
        highlightTeam={pastRow ? pastRow.opponent : tierMetric.opponent?.team}
        ariaLabel={tierMetric.buckets.map(bucket => `${TIER_LABELS[bucket.id] ?? bucket.label} defenses ${bucket.ppg == null ? 'no games' : formatNumber(bucket.ppg)}`).join(', ')}
      />}
      {opponentContext?.rank != null && <>
        <RankStrip
          rank={opponentContext.rank}
          teamCount={opponentContext.teamCount}
          caption={`${opponentName} ${formatOrdinal(opponentContext.rank)} of ${opponentContext.teamCount} vs ${position}`}
          ariaLabel={`${opponentName} ranks ${opponentContext.rank} of ${opponentContext.teamCount} by fantasy points allowed to ${position}s.`}
        />
      </>}
    </Section>);
  }
  // A form chart needs at least one played game; the projected column alone
  // repeats the hero number.
  const formSection = columnsSource.length > 0 && <Section key="form" slot="form" title={isPregame ? 'Recent form' : 'Season trend'} meta={formMeta}>
    <WeekColumns
      columns={columns}
      average={columnAverage}
      format={link.use ? (value => `${Math.round(value)}%`) : fmt}
      yMax={link.use ? 100 : null}
      selectedWeek={selectedWeek}
      onSelect={selectWeek}
      ariaLabel={`${isPregame ? 'Recent games and this week’s projection' : 'Recent games including this week'} against the season average. Select a week to see its stat line.`}
    />
    <Legend items={[
      { label: 'Above avg', kind: 'sw', style: { background: 'var(--color-accent-green)' } },
      { label: 'Below', kind: 'sw', style: { background: 'var(--color-accent-red)' } },
      isPregame ? { label: 'Projected', kind: 'sw is-ghost' } : { label: 'This week', kind: 'sw is-current' },
      { label: 'Select a week or stat to filter', kind: 'none' },
    ]} />
  </Section>;
  const statTitle = isPregame ? (selectedIsProjection ? 'Projected stat line' : 'Stat line') : selectedIsCurrent ? (referenceLine ? 'Points vs projection' : 'Stat line') : 'Points vs season avg';
  const statSection = selectedLine && (isPregame || phase === 'final') && <Section key="statline" title={statTitle} meta={selectedMeta}>
    <StatLineBars
      rows={statRows(selectedLine, referenceLine)}
      total={{ pts: selectedLine.total, ref: referenceLine?.total ?? null }}
      max={lineMax}
      selected={link.stat}
      onSelect={selectStat}
      ticks={Boolean(referenceLine)}
      ariaLabel={`${statTitle}. Select a stat to show it by week.`}
    />
    {referenceLine && <Legend items={[
      { label: 'Actual', kind: 'sw', style: { background: 'var(--color-drilldown-stat-1)' } },
      { label: selectedIsCurrent ? 'Projected' : 'Season avg', kind: 'tick' },
    ]} />}
  </Section>;
  if (isPregame) {
    // The projected stat line leads beside the hero number, then the outcome,
    // form and opponent evidence, with the projection build after them.
    heroChart = statSection || null;
    sections.push(outcomeSection, formSection, tierSection, buildSection);
  } else if (phase === 'final') sections.push(statSection, formSection);
  else sections.push(formSection, statSection);

  const allWeeks = [...weeks.prior, ...(weeks.current ? [weeks.current] : [])];
  if (phase === 'final' && allWeeks.some(row => row.snapShare != null)) {
    const share = selectedRow?.snapShare ?? null;
    const average = mean(weeks.prior.map(row => row.snapShare));
    const difference = share != null && average != null ? share - average : null;
    const near = difference != null && Math.abs(difference) < 1;
    const versus = difference == null ? 'no season average' : near ? 'at avg' : `${sgn(difference, 0)} vs avg`;
    const tone = difference == null || near ? 'var(--color-signature)' : difference > 0 ? POSITIVE : NEGATIVE;
    sections.push(<Section key="usage" title="Usage" meta={`W${selectedWeek} · vs season avg`}>
      <div className={`pdd-rings${link.use ? ' is-filtered' : ''}`}>
        <button
          type="button"
          className="pdd-rt pdd-rt--btn"
          aria-pressed={link.use === 'snaps'}
          onClick={() => selectUse('snaps')}
          aria-label={`Snaps: ${share == null ? 'unavailable' : `${share}%`} snap share, ${versus}, week ${selectedWeek}. ${link.use === 'snaps' ? 'Showing' : 'Show'} by week.`}
        >
          <Ring value={share ?? 0} max={100} text={share == null ? '—' : `${share}%`} tone={tone} />
          <span><span className="pdd-rt__l">Snaps</span><span className="pdd-rt__s">snap share · {versus}</span></span>
        </button>
      </div>
      <Legend items={[
        { label: 'Above avg', kind: 'sw', style: { background: POSITIVE } },
        { label: 'Near avg', kind: 'sw', style: { background: 'var(--color-signature)' } },
        { label: 'Below', kind: 'sw', style: { background: NEGATIVE } },
      ]} />
    </Section>);
  }
  if (phase === 'final') {
    sections.push(<NextWeekSection key="next" playerId={playerId} players={players} weeklyStats={weeklyStats} scheduleMap={scheduleMap} scoring={scoring} week={week} position={position} />);
  }
  if (phase === 'live') sections.push(<Plays key="plays" model={timeline} />);
  if (isPregame && benchOption && onViewBenchPlayer) sections.push(<Swap key="swap" option={benchOption} onView={onViewBenchPlayer} />);
  const visibleSections = sections.filter(Boolean);
  const devItems = phase === 'live'
    ? ['Live positional rank and movement since kickoff', 'Teammate target share — who else is eating', 'Remaining opportunity estimate']
    : phase === 'final' ? ['Route and target share by week', 'Per-week projection history for the season trend'] : null;
  const projectionSource = displayProjection?.factors?.source;
  const projectionMethod = <>
    <p>{projectedValue == null
      ? 'No projection is available for this player this week.'
      : projectionSource === 'balldontlie'
      ? 'BALLDONTLIE’s projected stat line, scored with your league’s scoring.'
      : projectionSource === 'sleeper'
        ? 'Sleeper’s projected stat line, scored with your league’s scoring.'
        : 'Season scoring adjusted for recent form, matchup, weather and availability, using your league’s scoring.'}</p>
    {band && <p>The likely range is the 25th–75th percentile outcome, not a floor or ceiling.</p>}
    {bridge && <p>{bridge.kind === 'provider'
      ? 'Projection build compares the season-average points in each scoring category with the projected points. Turnovers cost points, so they sit below zero; a smaller deduction is an improvement.'
      : 'Projection build applies the adjustments in order; each bar is the change at that step.'}</p>}
  </>;
  const opponentAllowed = matchupNumber(opponentContext?.ptsAllowedPerGame);
  const opponentLeague = matchupNumber(opponentContext?.leagueAveragePtsAllowed);
  const tierEdge = tierMetric?.opponent?.teamCount ? Math.ceil(tierMetric.opponent.teamCount / 4) : null;
  const opponentMethod = opponentContext || tiersAvailable ? <>
    {opponentContext && <p>{enrichedPlayer?.oppTeam ?? 'Opponent'}, {getOpponentEvidenceLabel(opponentContext).toLowerCase()}.{opponentAllowed != null ? ` ${formatNumber(opponentAllowed)} pts allowed per game to ${position}s${opponentLeague != null ? ` against a ${formatNumber(opponentLeague)} league average` : ''}.` : ''}</p>}
    {tiersAvailable && <p>Tiers split the league into the toughest {tierEdge ?? 'quarter'}, middle {tierEdge ? tierMetric.opponent.teamCount - tierEdge * 2 : 'half'} and easiest {tierEdge ?? 'quarter'} defenses by {tierMetric.label.toLowerCase()}.</p>}
  </> : null;
  const sortedEvents = (timeline.events ?? []).slice().sort((left, right) => (right.order ?? 0) - (left.order ?? 0));

  return (
    <Modal onClose={onClose} mobileSheet ariaLabel="Player matchup breakdown"
      containerClassName="matchup-breakdown-dialog gridshift-reveal w-full flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-separator)', maxWidth: '1100px', maxHeight: '90dvh' }}>
      <header className="pmd-hd" style={headerStyle}>
        <PlayerAvatar
          player={{ ...player, ...enrichedPlayer, id: playerId }}
          name={player?.full_name ?? enrichedPlayer?.name}
          size={48}
          className="pmd-hd__avatar"
          background="var(--matchup-header-subtle)"
        />
        <div className="pmd-hd__identity">
          <div className="pmd-hd__name">
            <strong>{player?.full_name ?? 'Unknown Player'}</strong>
            {enrichedPlayer?.availabilityStatus && <PlayerStatusBadge status={enrichedPlayer.availabilityStatus} localContrast={false} />}
          </div>
          <span className="pmd-hd__meta">{player?.position} · {player?.team ?? 'FA'} · Week {week}</span>
        </div>
        {canOpenStatistics && <nav className="pmd-hd__actions" aria-label="Player statistics">
          <HeaderActionButton
            label="Fantasy Value"
            onClick={() => openStatisticsMode(STATISTICS_MODES.FANTASY)}
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>}
          />
          <HeaderActionButton
            label="Game Stats"
            onClick={() => openStatisticsMode(STATISTICS_MODES.GAME)}
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>}
          />
        </nav>}
        <button type="button" onClick={onClose} aria-label="Close player matchup breakdown" className="pmd-hd__close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="pmd-strip">
        <div className="pmd-strip__row">
          <span className={`pmd-phase pmd-cond${phase === 'live' ? ' is-live' : ''}`}>
            {phase === 'pregame' ? 'Pregame' : phase === 'final' ? 'Final' : 'Live'}
          </span>
          {kickoff && <span className="pmd-ctx pmd-ctx--lead pmd-num">{kickoff}</span>}
        </div>
        {(() => {
          const matchup = <>
            {opponentLogo && <span className="pmd-logo">
              <img src={opponentLogo} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.hidden = true; }} />
            </span>}
            {finalScore
              ? <span className="pmd-ctx">
                {finalScore.teamScore >= finalScore.opponentScore
                  ? <><strong>{finalScore.team} {finalScore.teamScore}</strong> · {finalScore.opponent} {finalScore.opponentScore}</>
                  : <>{finalScore.team} {finalScore.teamScore} · <strong>{finalScore.opponent} {finalScore.opponentScore}</strong></>}
              </span>
              : <span className="pmd-ctx">{opponentLine}</span>}
          </>;
          return canOpenScheduleGame
            ? <button type="button" className="pmd-strip__row pmd-strip__link" onClick={openScheduleGame}>
              {matchup}
              <span className="sr-only">Open this game in Statistics Schedule</span>
              <svg className="pmd-strip__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            : <div className="pmd-strip__row">{matchup}</div>;
        })()}
      </div>

      <div className="pmd-body gridshift-reveal gridshift-reveal--auto" data-game-phase={phase}>
        <div className="pdd-bd">
          <div className={`pdd-hero${heroChart ? '' : ' is-solo'}`}>
            <Hero model={heroModel} popover={popover} tiles={tiles} />
            {heroChart}
          </div>
          {ringItems.length > 0 && <>
            <div className="pdd-rule" />
            <div className="pdd-rings" role="list" aria-label="Stat line against the projection">
              {ringItems.map(({ item, actual }) => {
                const value = actual?.value ?? 0;
                const target = Math.round(item.value * 10) / 10;
                const tone = phase === 'final' ? (value >= item.value ? POSITIVE : NEGATIVE) : 'var(--color-signature)';
                return <div className="pdd-rt" role="listitem" key={item.key} aria-label={`${item.label}: ${formatCount(value)} of ${formatCount(target)} projected`}>
                  <Ring value={value} max={item.value} text={formatCount(value)} tone={tone} />
                  <span><span className="pdd-rt__l">{item.label}</span><span className="pdd-rt__s">of {formatCount(target)} proj</span></span>
                </div>;
              })}
            </div>
          </>}
          {visibleSections.length > 0 && <>
            <div className="pdd-rule" />
            <div className="pdd-cols">{visibleSections}<DevSlot items={devItems} /></div>
          </>}

          <div className="pmd-disc" data-slot="disc">
            {isPregame ? <>
              <DiscRow label="How projections work">{projectionMethod}</DiscRow>
              {opponentMethod && <DiscRow label="Opponent sample">{opponentMethod}</DiscRow>}
            </> : <>
              {phase === 'final' && sortedEvents.length > 0 && <DiscRow label={`All scoring plays · ${sortedEvents.length}`}>
                <PlayList events={sortedEvents} />
              </DiscRow>}
              {projectedValue != null && <DiscRow label={`${projectionView.recorded ? 'Pregame projection' : 'Available estimate'} · ${formatNumber(projectedValue)}`}>
                <p>{projectionView.recorded
                  ? `Recorded before kickoff · ${new Date(baseline.capturedAt).toLocaleString()}.`
                  : 'Available estimate; the original pregame projection was not recorded.'}</p>
                {projectionMethod}
              </DiscRow>}
              {phase === 'live' && <DiscRow label="About play points">
                <p>Play points are estimates. Bonuses and stat corrections can change the official total.</p>
              </DiscRow>}
            </>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
