/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react';
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
import { CompanionSegmentedControl } from './CompanionSelectorControls.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
import {
  buildPlayerHeadlineParts,
  buildPlayerOutlook,
  buildPlayerProjectionBreakdown,
  getNoteworthyWeather,
  getPlayerPerformanceTarget,
  getPlayerMatchupPhase,
  groupFantasyBreakdownRows,
  matchupNumber,
  resolvePlayerDisplayProjection,
} from '../../utils/playerMatchupPresentation.js';
import { buildPlayerDefensePerformance } from '../../utils/playerDefensePerformance.js';
import { buildPlayerMatchupBenchOption } from '../../utils/playerMatchupBenchOption.js';
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
export const formatOrdinal = value => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th');
  return `${number}${suffix}`;
};

function PerformanceTable({ rows, projected = false }) {
  return (
    <table className="matchup-performance-table">
      <caption>{projected ? 'Projected stat line' : 'Fantasy scoring breakdown'}</caption>
      <thead><tr><th scope="col">Stat</th><th scope="col">Value</th><th scope="col">Fantasy pts</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key ?? row.statKey}>
        <th scope="row">{row.label}</th><td>{formatStat(row.statVal)}</td>
        <td className={row.pts < 0 ? 'matchup-negative' : undefined}>{formatNumber(row.pts, 2)}</td>
      </tr>)}</tbody>
    </table>
  );
}


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






function ProjectionOpponentDetails({ player, position }) {
  const opponentContext = player?.opponentFantasyContext ?? (player?.defStrength ? {
    ...player.defStrength,
    team: player?.oppTeam,
    position,
    currentGames: player.defStrength.gamesAnalyzed,
    evidenceKind: 'current',
  } : null);
  if (!opponentContext) return null;
  return <details className="matchup-opponent-details"><summary>Opponent sample and ranking methodology</summary>
    <p>{getOpponentEvidenceLabel(opponentContext)}. Rank 1 is the fewest fantasy points allowed to this position under the active league scoring.</p>
    {opponentContext.evidenceKind === 'blended' && <p>Current season: {formatNumber(opponentContext.currentPtsAllowedPerGame)} across {opponentContext.currentGames} games · Prior season: {formatNumber(opponentContext.priorPtsAllowedPerGame)} across {opponentContext.priorGames} games. The prior-season share phases out after four current games.</p>}
    {opponentContext.evidenceKind === 'prior' && <p>This estimate uses {opponentContext.priorGames} prior-season games because current-season evidence is not yet established.</p>}
  </details>;
}

function EvidenceGames({ rows = [] }) {
  if (!rows.length) return null;
  return <table className="matchup-performance-table matchup-performance-table--evidence">
    <caption>Contributing games</caption><thead><tr><th scope="col">Week</th><th scope="col">Opponent</th><th scope="col">Fantasy pts</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.week}><th scope="row">{row.week}</th><td>{row.opponent ?? row.opp}</td><td>{formatNumber(row.points, 2)}</td></tr>)}</tbody>
  </table>;
}

/* ── projected stat line ──
   Claude Design "Player Drilldown — Splits Rework": the table stays, but the
   rows are grouped and each one carries a proportional bar so the composition
   of the projection is visible without reading every decimal. */

const signedPoints = value => `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}`;

function ProjectionStatLine({ rows, total }) {
  const groups = groupFantasyBreakdownRows(rows);
  if (!groups.length) return null;
  // Deductions are part of the composition, so the stack is scaled by gross
  // points rather than by the positive groups alone. Sizing it on positives
  // only would draw a projection that scores more than its own total.
  const gains = groups.filter(group => group.sum > 0);
  const deductions = groups.filter(group => group.sum < 0);
  const stackGroups = [...gains, ...deductions];
  const grossTotal = stackGroups.reduce((sum, group) => sum + Math.abs(group.sum), 0);
  const widest = Math.max(...rows.map(row => Math.abs(row.pts)), 0.01);
  return (
    <div className="pmd-proj">
      <div className="pmd-proj__head">
        <span className="pmd-proj__eyebrow">Where the projected points come from</span>
        <span className="pmd-proj__meta">Per game</span>
      </div>
      {grossTotal > 0 && <>
        <div
          className="pmd-pstack"
          role="img"
          aria-label={`Projected points by group: ${stackGroups.map(group => `${group.label} ${signedPoints(group.sum)}`).join(', ')}.`}
        >
          {stackGroups.map(group => (
            <i
              key={group.id}
              data-group={group.id}
              data-negative={group.sum < 0 ? 'true' : undefined}
              style={{ width: `${(Math.abs(group.sum) / grossTotal) * 100}%` }}
            />
          ))}
        </div>
        <ul className="pmd-pkey">
          {groups.map(group => (
            <li key={group.id} data-negative={group.sum < 0 ? 'true' : undefined}>
              <i data-group={group.id} aria-hidden="true" />
              {group.label}
              <em className="pmd-num">{signedPoints(group.sum)}</em>
            </li>
          ))}
        </ul>
      </>}
      <table className="pmd-ptable">
        <caption className="sr-only">Projected stat line</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Stat</span></th>
            <th scope="col"><span className="sr-only">Value</span></th>
            <th scope="col"><span className="sr-only">Share of the projection</span></th>
            <th scope="col"><span className="sr-only">Fantasy points</span></th>
          </tr>
        </thead>
        {groups.map(group => (
          <tbody key={group.id} data-group={group.id}>
            <tr className="pmd-pgrp"><th scope="colgroup" colSpan={4}>{group.label}</th></tr>
            {group.rows.map(row => (
              <tr key={row.key ?? row.statKey}>
                <th scope="row">{row.label}</th>
                <td className="pmd-num">{formatStat(row.statVal)}</td>
                <td className="pmd-pbar" aria-hidden="true">
                  <i
                    className={row.pts < 0 ? 'is-neg' : undefined}
                    style={{ width: `${Math.max(2, (Math.abs(row.pts) / widest) * 100)}%` }}
                  />
                </td>
                <td className={`pmd-num${row.pts < 0 ? ' matchup-negative' : ''}`}>{formatNumber(row.pts, 2)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>Projected total</th>
            <td className="pmd-num">{formatNumber(total, 2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── season & defense splits ──
   One shared percentile axis for every rank instead of a stack of separate
   sliders, the defense tiers as a single comparable graphic, and the repeated
   qualifying-games caveat reduced to one line per section. */

const SPLIT_TIER_LABELS = { strong: 'Strong', middle: 'Average', weak: 'Weak' };

function getSplitPercentile(result) {
  if (result?.rank == null || !(result?.peerCount > 1)) return null;
  return (result.peerCount - result.rank) / (result.peerCount - 1);
}

function SplitRankRow({ label, value, result, peerLabel }) {
  const percentile = getSplitPercentile(result);
  const games = result?.games ?? 0;
  const tone = percentile == null ? '' : percentile >= 0.75 ? ' is-high' : percentile <= 0.25 ? ' is-low' : '';
  return (
    <div className="pmd-prow">
      <div className="pmd-prow__l">
        <span>{label}</span>
        <span className="pmd-num">{value}</span>
      </div>
      <div
        className={`pmd-prow__t${percentile == null ? ' is-dim' : ''}`}
        role="img"
        aria-label={percentile == null
          ? `${label}: rank unavailable on ${games} qualifying ${games === 1 ? 'game' : 'games'}.`
          : `${label}: rank ${result.rank} of ${result.peerCount} ${peerLabel}.`}
      >
        <u />
        {percentile != null && <i className={tone.trim()} style={{ left: `calc(${percentile * 100}% - 2px)` }} />}
      </div>
      <div className={`pmd-prow__r${percentile == null ? ' is-dim' : ' pmd-num'}`}>
        {percentile == null ? `${games} of 3 games` : `${result.rank} / ${result.peerCount}`}
      </div>
    </div>
  );
}

function SplitTiers({ metric, measureNoun }) {
  const opponentTier = metric?.opponent?.bucket ?? null;
  const highest = Math.max(...metric.buckets.map(bucket => bucket.ppg ?? 0), 1);
  return (
    <>
      <div className="pmd-tiers">
        {metric.buckets.map((bucket) => {
          const isOpponent = bucket.id === opponentTier;
          return (
            <div
              key={bucket.id}
              className={`pmd-tier${isOpponent ? ' is-on' : ''}${bucket.ppg == null ? ' is-empty' : ''}`}
            >
              <div className="pmd-tier__l">
                {SPLIT_TIER_LABELS[bucket.id] ?? bucket.label}
                {isOpponent && metric.opponent?.team ? ` · ${metric.opponent.team}` : ''}
              </div>
              <div className={`pmd-tier__v pmd-num${bucket.ppg == null ? ' is-dim' : ''}`}>
                {bucket.ppg == null ? '—' : formatNumber(bucket.ppg)}
              </div>
              <div className="pmd-tier__c">
                {bucket.ppg == null ? null : <i style={{ height: `${Math.max(8, (bucket.ppg / highest) * 100)}%` }} />}
              </div>
              <div className="pmd-tier__s">
                {bucket.games === 0 ? 'No games yet' : `${bucket.games} ${bucket.games === 1 ? 'game' : 'games'} · pts/g`}
              </div>
            </div>
          );
        })}
      </div>
      {metric.opponent?.rank != null && <p className="pmd-oppline">
        <span className="pmd-oppline__b">{metric.opponent.team} {(SPLIT_TIER_LABELS[metric.opponent.bucket] ?? '').toUpperCase()}</span>
        <span>
          <strong className="pmd-num">{metric.opponent.rank} of {metric.opponent.teamCount}</strong> defenses · {formatNumber(metric.opponent.perGame)} {measureNoun} allowed/game · {metric.opponent.games} {metric.opponent.games === 1 ? 'game' : 'games'}
        </span>
      </p>}
    </>
  );
}

function SplitPool({ opponent, measureNoun }) {
  if (opponent?.rank == null || !opponent?.teamCount) return null;
  const teamCount = opponent.teamCount;
  const edge = Math.ceil(teamCount / 4);
  const middle = teamCount - edge * 2;
  return (
    <>
      <div className="pmd-pool" role="img" aria-label={`${opponent.team} ranks ${opponent.rank} of ${teamCount} defenses by ${measureNoun} allowed per game.`}>
        {Array.from({ length: teamCount }, (unused, index) => index + 1).map((rank) => (
          <i
            key={rank}
            className={rank === opponent.rank ? 'is-me' : rank <= edge ? 'is-s' : rank > teamCount - edge ? 'is-w' : 'is-a'}
          />
        ))}
      </div>
      <div className="pmd-poollab" style={{ gridTemplateColumns: `${edge}fr ${middle}fr ${edge}fr` }}>
        <span>Strong · {edge}</span><span>Average · {middle}</span><span>Weak · {edge}</span>
      </div>
    </>
  );
}

function SplitTierGames({ metric, measureNoun }) {
  const teamCount = metric.opponent?.teamCount ?? null;
  const edge = teamCount ? Math.ceil(teamCount / 4) : null;
  const definition = {
    strong: edge ? `Top quarter — fewest ${measureNoun} allowed (${edge} defenses)` : `Top quarter — fewest ${measureNoun} allowed`,
    middle: edge ? `Middle half (${teamCount - edge * 2} defenses)` : 'Middle half',
    weak: edge ? `Bottom quarter — most ${measureNoun} allowed (${edge} defenses)` : `Bottom quarter — most ${measureNoun} allowed`,
  };
  return (
    <div className="pmd-exp">
      {metric.buckets.map(bucket => (
        <div className="pmd-exprow" key={bucket.id}>
          <div className="pmd-exprow__head">
            <span className="pmd-exprow__k">{SPLIT_TIER_LABELS[bucket.id] ?? bucket.label}</span>
            <span className={`pmd-exprow__v${bucket.ppg == null ? ' is-dim' : ' pmd-num'}`}>
              {bucket.ppg == null ? 'No games yet' : `${formatNumber(bucket.ppg)} pts/g`}
            </span>
          </div>
          <div className="pmd-exprow__d">{definition[bucket.id] ?? bucket.label}</div>
          {bucket.gameRows?.length > 0 && <details className="matchup-evidence">
            <summary className="matchup-evidence__hint">View contributing games</summary>
            <EvidenceGames rows={bucket.gameRows} />
          </details>}
        </div>
      ))}
    </div>
  );
}

function PlayerPeerContext({ model, season }) {
  const [metricId, setMetricId] = useState('receiving');
  const metric = model?.metrics?.find(item => item.id === metricId) ?? model?.metrics?.[0];
  const measureNoun = metric?.id === 'rushing' ? 'rushing yards' : 'receiving yards';
  if (!model?.completedThroughWeek) return <p className="matchup-performance-note">Current-season rankings will appear after a complete NFL week and its player stats are available.</p>;
  const rankRows = [
    { key: 'overall', label: 'Fantasy pts/game', value: formatNumber(model.overall?.ppg), result: model.overall },
    ...(model.statRanks ?? []).map(result => ({ key: result.key, label: result.label, value: formatNumber(result.ppg), result })),
  ];
  return (
    <section className="matchup-peer-context" aria-label="Season and opponent rankings">
      <div className="matchup-performance-section-heading">
        <h3>Among {model.peerLabel}</h3>
        <span>{season} · through Week {model.completedThroughWeek}</span>
      </div>
      <div className="pmd-peer">
        {rankRows.map(row => <SplitRankRow key={row.key} label={row.label} value={row.value} result={row.result} peerLabel={model.peerLabel} />)}
      </div>
      <div className="pmd-paxis"><span>Bottom of position</span><span>Median</span><span>Top</span></div>
      {model.overall?.rank == null && <p className="matchup-performance-note">
        {model.overall?.rankingUnavailableReason ?? 'Ranks unlock at 3 qualifying games.'} The per-game values are real; the placement is not yet.
      </p>}

      {!!model.metrics?.length && <>
        <h3>Scoring against defenses like this one</h3>
        <CompanionSegmentedControl
          value={metric?.id}
          options={model.metrics.map(item => ({ value: item.id, label: item.label }))}
          onChange={setMetricId}
          ariaLabel="Defense measure"
          columns={2}
        />
        {metric?.coverageReason
          ? <p className="matchup-performance-note">{metric.coverageReason}</p>
          : <>
            <SplitTiers metric={metric} measureNoun={measureNoun} />
            {metric.buckets.find(bucket => bucket.id === metric.opponent?.bucket)?.ppg == null && <p className="matchup-performance-note">
              No qualifying games against a {SPLIT_TIER_LABELS[metric.opponent?.bucket]?.toLowerCase() ?? 'comparable'} defense yet this season. The tier split needs games before it can say anything.
            </p>}

            <h3>How the defense tiers are built</h3>
            <p className="matchup-performance-note">{metric.definition} The strongest quarter is Strong, the middle half is Average and the weakest quarter is Weak; that current-season classification is applied to every opponent already faced this season.</p>
            <SplitPool opponent={metric.opponent} measureNoun={measureNoun} />

            <h3>Games in each tier</h3>
            <SplitTierGames metric={metric} measureNoun={measureNoun} />
            <p className="matchup-performance-note">Game counts describe the sample size, not statistical confidence.</p>
          </>}
      </>}
    </section>
  );
}




function ProjectionDetails({ projection }) {
  const factors = projection?.factors;
  if (!factors) return null;
  const source = factors.source === 'balldontlie' ? 'BALLDONTLIE projection' : factors.source === 'prior-season' ? 'GridShift projection using prior-season history' : 'GridShift projection';
  const adjustments = [
    ['Matchup', factors.oppFactor], ['Home / away', factors.locationFactor],
    ['Weather', factors.weatherFactor],
    ['Availability', factors.availabilityFactor],
  ].filter(([, value]) => matchupNumber(value) != null);
  return <div className="matchup-projection-details__content">
    <h3>Projection source and expected range</h3>
    <p>{source}. {factors.source === 'balldontlie' ? 'Available projected stats are translated using the active league scoring.' : 'Historical scoring is adjusted for the available matchup, venue, weather, and availability inputs.'}</p>
    <p>The expected range applies this projection to the player’s historical 25th-to-75th-percentile scoring profile. It describes a likely band, not a guaranteed floor or ceiling.</p>
    {adjustments.length > 0 && <dl>{adjustments.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatNumber(value, 2)}×</dd></div>)}</dl>}
    {(factors.recentBase != null || factors.seasonBase != null) && <p>Recent average: {formatNumber(factors.recentBase)} · Season average: {formatNumber(factors.seasonBase)}</p>}
  </div>;
}

/* ── design slots ──
   One slot order at every width, selected entirely by game phase. There is no
   performance view switcher: pregame shows the projection briefing, live shows
   accumulating points and play contributions, final shows the settled result. */

export const ACCENT = 'var(--color-accent)';
export const POSITIVE = 'var(--color-accent-green)';
export const NEGATIVE = 'var(--color-accent-red)';
export const CAUTION = 'var(--color-accent-orange)';

function Emphasis({ parts }) {
  if (!parts?.length) return null;
  return <p className="pmd-headline">
    {parts.map((part, index) => (part.emphasis
      ? <em key={index}>{part.text}</em>
      : <span key={index}>{part.text}</span>))}
  </p>;
}

function BulletBar({ value, tick, tickLabel, band, bandLabel, tone }) {
  const maximum = getChartMaximum(value, tick, band?.[1]);
  const valuePosition = getChartPosition(value, maximum);
  const tickPosition = getChartPosition(tick, maximum);
  const lowPosition = getChartPosition(band?.[0], maximum);
  const highPosition = getChartPosition(band?.[1], maximum);
  const hasBand = lowPosition != null && highPosition != null && highPosition > lowPosition;
  if (valuePosition == null && tickPosition == null) return null;
  return <>
    <div className="pmd-bb" aria-hidden="true">
      {hasBand && <span className="pmd-bb__band" style={{ left: `${lowPosition}%`, width: `${highPosition - lowPosition}%` }} />}
      {valuePosition != null && <span className="pmd-bb__fill" style={{ width: `${valuePosition}%`, background: tone }} />}
      {tickPosition != null && <span className="pmd-bb__tick" style={{ left: `${tickPosition}%` }} />}
    </div>
    <div className="pmd-legend">
      {tickPosition != null && tickLabel && <span><i className="is-tick" />{tickLabel}</span>}
      {hasBand && bandLabel && <span><i className="is-band" />{bandLabel}</span>}
    </div>
  </>;
}

function Hero({ model }) {
  if (!model) return null;
  return <section className="pmd-sec" data-slot="hero" aria-label={model.overline}>
    <div className="pmd-eyebrow">{model.overline}</div>
    <div className="pmd-hero__top">
      <strong className={`pmd-big pmd-num ${model.delta ? `pmd-${model.delta.tone}` : 'pmd-flat'}`}>{formatNumber(model.value, model.digits ?? 1)}</strong>
      <span className="pmd-unit pmd-cond">PTS</span>
      {model.delta && <div className="pmd-delta">
        <div className={`pmd-delta__v pmd-num pmd-${model.delta.tone}`}>{model.delta.v}</div>
        <div className="pmd-delta__l">{model.delta.l}</div>
      </div>}
    </div>
    <BulletBar {...model.bar} />
    {model.note && <p className="matchup-performance-note">{model.note}</p>}
  </section>;
}

function RankSlot({ model }) {
  if (!model) return null;
  return <section className="pmd-sec" data-slot="rank" aria-label={model.ariaLabel}>
    <div className="pmd-rank__row">
      <div className="pmd-rank__v pmd-num">{model.value}</div>
      <div className="pmd-rank__meta">{model.title}{model.detail && <> · <strong>{model.detail}</strong></>}{model.note && <><br />{model.note}</>}</div>
    </div>
    {model.position != null && <>
      <div className="pmd-rail" role="img" aria-label={model.ariaLabel}>
        <span className="pmd-rail__mark" style={{ left: `calc(${model.position}% - 2px)` }} />
      </div>
      <div className="pmd-rail__ends"><span>Best in position</span><span>Worst</span></div>
    </>}
  </section>;
}

function Cells({ cells }) {
  if (!cells?.length) return null;
  return <div className="pmd-cells" data-slot="cells" style={{ '--pmd-cells': cells.length }}>
    {cells.map(cell => <div className="pmd-cell" key={cell.label}>
      <div className="pmd-cell__l">{cell.label}</div>
      <div className="pmd-cell__v pmd-num">{cell.value}</div>
      <div className="pmd-cell__s">{cell.detail}</div>
      {cell.bar != null && <div className="pmd-mbar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(1, cell.bar)) * 100}%`, background: cell.tone }} />
      </div>}
    </div>)}
  </div>;
}

function Ladder({ model }) {
  if (!model?.rows?.length) return null;
  const maximum = getChartMaximum(model.rows.flatMap(row => [row.points, row.target]), model.average);
  const averagePosition = getChartPosition(model.average, maximum);
  return <section className="pmd-sec" data-slot="ladder" aria-label={model.title}>
    <div className="pmd-eyebrow">{model.title}</div>
    <div className="pmd-ladder">
      {model.rows.map(row => {
        const points = matchupNumber(row.points);
        const position = getChartPosition(points, maximum);
        const target = matchupNumber(row.target);
        const targetPosition = getChartPosition(target, maximum);
        const benchmark = target ?? matchupNumber(model.average);
        const above = benchmark == null || points == null ? null : points >= benchmark;
        return <div className="pmd-lrow" key={`${row.week}-${row.opponent ?? row.opp ?? ''}`}>
          <div className="pmd-lrow__k">Wk {row.week} · {row.opponent ?? row.opp ?? '—'}</div>
          <div className="pmd-lrow__t" aria-hidden="true">
            {position != null && <i style={{ width: `${position}%`, background: above == null ? ACCENT : above ? POSITIVE : NEGATIVE }} />}
            {averagePosition != null && <u className="is-average" style={{ left: `${averagePosition}%` }} />}
            {targetPosition != null && <u className="is-target" style={{ left: `${targetPosition}%` }} />}
          </div>
          <div className={`pmd-lrow__v pmd-num ${above == null ? '' : above ? 'pmd-up' : 'pmd-down'}`} data-benchmark={benchmark == null ? undefined : formatNumber(benchmark)}>{formatNumber(points)}</div>
        </div>;
      })}
    </div>
    {(model.average != null || model.targetLabel) && <div className="pmd-legend">
      {model.average != null && <span><i className="is-tick" style={{ background: 'var(--color-label-tertiary)' }} />{model.averageLabel}</span>}
      {model.targetLabel && <span><i className="is-target" />{model.targetLabel}</span>}
    </div>}
  </section>;
}

function Plays({ model }) {
  if (!model || model.status === 'idle') return null;
  const events = model.events ?? [];
  return <section className="pmd-sec" data-slot="plays" aria-label="Estimated play contributions">
    <div className="pmd-eyebrow">What earned the points{model.stale ? ' · latest available play data' : ''}</div>
    {model.status === 'loading'
      ? <p className="matchup-performance-note">Loading estimated play contributions…</p>
      : events.length > 0
        ? <div className="pmd-plays">
          {events.map(event => <div className="pmd-play" key={event.id}>
            <div className="pmd-play__t pmd-num">{event.glance?.clock ?? '—'}</div>
            <div className="pmd-play__d">{event.desc}</div>
            <div className={`pmd-play__p pmd-num ${event.pts < 0 ? 'pmd-down' : 'pmd-up'}`}>{signed(event.pts)}</div>
          </div>)}
        </div>
        : <p className="matchup-performance-note">{model.message ?? 'Estimated play contributions are unavailable for this game.'}</p>}
    <p className="matchup-performance-note">Estimated play contributions; bonuses, corrections and missing plays can differ from the official total.</p>
  </section>;
}

function Swap({ option, onView }) {
  if (!option || !onView) return null;
  const candidate = option.player;
  const name = candidate?.full_name ?? candidate?.name ?? 'Bench player';
  return <div className="pmd-wrap" data-slot="swap">
    <section className="pmd-swap" aria-label="Higher projected bench option">
      <div className="pmd-swap__h">Higher projected option on your bench</div>
      <button type="button" className="pmd-swap__b" onClick={() => onView(candidate.id)} aria-label={`View ${name} bench comparison`}>
        <PlayerAvatar player={candidate} name={name} size={34} />
        <span className="pmd-swap__identity">
          <span className="pmd-swap__n">{name}</span>
          <span className="pmd-swap__s">{[candidate.position, candidate.team, option.slot].filter(Boolean).join(' · ')}</span>
        </span>
        {candidate.availabilityStatus && <PlayerStatusBadge status={candidate.availabilityStatus} compact />}
        <span className="pmd-swap__v">
          <strong className="pmd-num">{formatNumber(option.projected)}</strong>
          <small>+{formatNumber(option.improvement)} projected pts</small>
        </span>
      </button>
    </section>
  </div>;
}

function DevSlot({ items }) {
  if (!DRILLDOWN_DEV_SLOTS_ENABLED || !items?.length) return null;
  return <div className="pmd-wrap" data-slot="slot">
    <div className="pmd-slot">
      <div className="pmd-slot__l">{'// not wired yet'}</div>
      <div className="pmd-slot__i">{items.map(item => <div key={item}>{item}</div>)}</div>
    </div>
  </div>;
}

function DiscRow({ label, hint, children }) {
  if (!children) return null;
  return <details>
    <summary>{label}{hint && <span className="pmd-disc__hint">{hint}</span>}</summary>
    <div className="pmd-disc__body">{children}</div>
  </details>;
}

function buildHeroModel({ phase, total, projectionView, seasonBenchmark, performanceTarget = null }) {
  const projected = matchupNumber(projectionView?.projection?.projected);
  const low = matchupNumber(projectionView?.projection?.min);
  const high = matchupNumber(projectionView?.projection?.max);
  const band = low != null && high != null && high > low ? [low, high] : null;
  const bandLabel = band ? `Likely range ${formatNumber(low)}–${formatNumber(high)}` : null;
  const season = matchupNumber(seasonBenchmark?.value);

  if (phase === 'pregame') {
    if (projected == null) return null;
    return {
      overline: 'Projected fantasy points',
      value: projected,
      delta: null,
      bar: {
        value: projected,
        tick: season,
        tickLabel: season != null ? `${seasonBenchmark.label} ${formatNumber(season)}` : null,
        band,
        bandLabel,
        tone: ACCENT,
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
    note: scored == null ? 'Actual scoring has not been reported for this player.' : null,
    delta: difference == null ? null : {
      v: signed(difference),
      l: `vs ${formatNumber(target)} ${phase === 'final' ? 'projected' : 'expected pace'}`,
      tone: difference >= 0 ? 'up' : 'down',
    },
    bar: {
      value: scored,
      tick: projected,
      tickLabel: projected != null ? `${projectionView.label} ${formatNumber(projected)}` : null,
      band,
      bandLabel,
      tone: difference == null ? ACCENT : difference >= 0 ? POSITIVE : NEGATIVE,
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
  if (rankValue == null) {
    return {
      value: '—',
      title: useWeek ? `Week ${week} finish` : 'Season points rank',
      detail: 'Not established',
      note: 'A rank appears once positional scoring data is available.',
      position: null,
      ariaLabel: 'Rank not established',
    };
  }
  return {
    value: `${label}${rankValue}`,
    title: useWeek ? `Week ${week} finish` : 'Season points rank',
    detail: peerCount != null && peerCount > 0 ? `${formatOrdinal(rankValue)} of ${peerCount}` : `${formatOrdinal(rankValue)} among ${rankAudience}`,
    note: useWeek ? null : 'by total season fantasy points',
    position: peerCount > 1 ? Math.max(0, Math.min(100, (rankValue - 1) / (peerCount - 1) * 100)) : null,
    ariaLabel: `${useWeek ? `Week ${week} finish` : 'Season points rank'} ${rankValue}${peerCount > 0 ? ` of ${peerCount}` : ''} ${label} players.`,
  };
}

function buildPregameCells({ player, position, seasonBenchmark, opponentContext, noteworthyWeather }) {
  const allowed = matchupNumber(opponentContext?.ptsAllowedPerGame);
  const leagueAllowed = matchupNumber(opponentContext?.leagueAveragePtsAllowed);
  const rank = matchupNumber(opponentContext?.rank);
  const teamCount = matchupNumber(opponentContext?.teamCount);
  const difference = allowed != null && leagueAllowed != null ? allowed - leagueAllowed : null;
  const season = matchupNumber(seasonBenchmark?.value);
  const wind = matchupNumber(player?.weather?.wind_kph);
  const weather = player?.weather;
  const hasWeatherData = weather != null && ['temp_c', 'wind_kph', 'precipitation_mm']
    .some((key) => matchupNumber(weather[key]) != null);
  const indoor = player?.isIndoor === true;
  const cells = [
    {
      label: player?.oppTeam ? `${player.oppTeam} vs ${position}` : `Opponent vs ${position}`,
      value: rank != null ? `#${rank}` : formatNumber(allowed),
      detail: allowed != null
        ? `${formatNumber(allowed)} pts allowed/game${leagueAllowed != null ? ` · ${formatNumber(leagueAllowed)} league average` : ''}`
        : getOpponentEvidenceLabel(opponentContext),
      bar: rank != null && teamCount ? rank / teamCount : null,
      tone: difference == null ? ACCENT : difference >= 0 ? POSITIVE : NEGATIVE,
    },
    {
      label: seasonBenchmark.label,
      value: formatNumber(season),
      detail: seasonBenchmark.source,
      bar: season != null ? Math.min(1, season / getChartMaximum(season)) : null,
      tone: ACCENT,
    },
  ];
  if (indoor) {
    cells.push({ label: 'Conditions', value: 'Indoor', detail: 'Weather not applied', bar: 0, tone: ACCENT });
  } else if (noteworthyWeather) {
    cells.push({
      label: 'Weather risk',
      value: wind != null ? String(Math.round(wind)) : 'Flagged',
      detail: wind != null ? 'km/h wind — flagged by model' : noteworthyWeather.label,
      bar: 0.72,
      tone: CAUTION,
    });
  } else {
    const formatted = hasWeatherData ? formatWeather(weather, false) : null;
    cells.push({
      label: 'Conditions',
      value: formatted ?? 'Outdoor',
      detail: formatted ? 'No significant weather impact' : 'Weather data unavailable',
      bar: formatted ? 0.25 : null,
      tone: ACCENT,
    });
  }
  return cells;
}

function buildFinalCells(rows) {
  const scoring = rows.filter(row => matchupNumber(row.pts) != null && row.pts !== 0);
  if (!scoring.length) return null;
  const ranked = [...scoring].sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).slice(0, 3);
  const maximum = Math.max(...ranked.map(row => Math.abs(row.pts)));
  return ranked.map(row => ({
    label: row.label,
    value: formatStat(row.statVal),
    detail: `${signed(row.pts)} pts`,
    bar: maximum > 0 ? Math.abs(row.pts) / maximum : null,
    tone: row.pts < 0 ? NEGATIVE : row.pts > 0 ? POSITIVE : ACCENT,
  }));
}

export default function PlayerMatchupBreakdown({ playerId, week, projection, baseline = null, enrichedPlayer, onClose, onViewStats, benchComparison = null, onViewBenchPlayer }) {
  const { platform, players, weeklyStats, activeScoringSettings, espnIdOverrides, season, scheduleMap, selectedLeagueId } = useSleeperBase();
  const { darkMode } = useTheme();
  const [espnDerivedWeekEntryState, setEspnDerivedWeekEntryState] = useState({ key: '', row: null });

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
    const scoringSettings = activeScoringSettings ?? DEFAULT_SCORING;
    const result = buildFantasyScoringBreakdown(weekEntry, scoringSettings, position, {
      preferRawStats: Boolean(espnDerivedWeekEntry),
      adjustmentLabel: platform === 'espn' ? 'Official Scoring Adjustment' : 'Scoring Adjustment',
    });
    return { breakdown: result.rows, total: result.total };
  }, [weekEntry, activeScoringSettings, position, espnDerivedWeekEntry, platform]);

  const projectionView = useMemo(() => resolvePlayerDisplayProjection({ isPregame, projection, baseline }), [baseline, isPregame, projection]);
  const displayProjection = projectionView.projection;
  const projectedBreakdown = useMemo(() => buildPlayerProjectionBreakdown(displayProjection, activeScoringSettings ?? DEFAULT_SCORING, position), [displayProjection, activeScoringSettings, position]);
  const peerModel = useMemo(() => buildPlayerDefensePerformance({ playerId, oppTeam: enrichedPlayer?.oppTeam, weeklyStats, players, scheduleMap, currentWeek: week, scoringSettings: activeScoringSettings ?? DEFAULT_SCORING }), [playerId, enrichedPlayer?.oppTeam, weeklyStats, players, scheduleMap, week, activeScoringSettings]);
  const timeline = usePlayerMatchupTimeline({
    enabled: phase === 'live',
    phase,
    leagueId: selectedLeagueId,
    platform,
    season,
    week,
    playerId,
    players,
    team: player?.team,
    opponent: enrichedPlayer?.oppTeam,
    scoringSettings: activeScoringSettings ?? DEFAULT_SCORING,
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
  const noteworthyWeather = getNoteworthyWeather({ weather: enrichedPlayer?.weather, isIndoor: enrichedPlayer?.isIndoor, position });
  const outlook = buildPlayerOutlook({
    projection: displayProjection?.projected,
    seasonAverage: seasonBenchmark.value,
    opponentContext,
    availabilityStatus: enrichedPlayer?.availabilityStatus,
    noteworthyWeather,
  });

  const performanceTarget = getPlayerPerformanceTarget({
    phase,
    total,
    projected: displayProjection?.projected,
    scheduleEntry,
    now,
  });
  const hero = buildHeroModel({ phase, total, projectionView, seasonBenchmark, performanceTarget });
  const headline = buildPlayerHeadlineParts({
    phase,
    total,
    projected: displayProjection?.projected,
    performanceTarget,
    seasonAverage: seasonBenchmark.value,
    opponentContext,
    outlook,
  });
  const rankModel = buildRankModel({ phase, rank: enrichedPlayer?.rank, weekRank: enrichedPlayer?.weekRank, position, week });
  const cells = isPregame
    ? buildPregameCells({ player: enrichedPlayer, position, seasonBenchmark, opponentContext, noteworthyWeather })
    : phase === 'final' ? buildFinalCells(breakdown) : null;
  const formRows = peerModel?.overall?.gameRows?.slice(-5).reverse() ?? [];
  const recordedTarget = !isPregame && projectionView.recorded
    ? matchupNumber(displayProjection?.projected)
    : null;
  const ladderRows = formRows.map(row => (
    recordedTarget != null && Number(row.week) === Number(week)
      ? { ...row, target: recordedTarget }
      : row
  ));
  const hasVisibleRecordedTarget = ladderRows.some(row => matchupNumber(row.target) != null);
  const ladder = formRows.length ? {
    title: phase === 'pregame' ? 'Last 5 games vs season average' : 'Season to date vs season average',
    rows: ladderRows,
    average: matchupNumber(peerModel?.overall?.ppg),
    averageLabel: `Season average ${formatNumber(peerModel?.overall?.ppg)}`,
    targetLabel: hasVisibleRecordedTarget ? `Recorded pregame projection ${formatNumber(recordedTarget)}` : null,
  } : null;

  const weather = enrichedPlayer ? formatWeather(enrichedPlayer.weather, enrichedPlayer.isIndoor ?? false) : null;
  const teamScore = matchupNumber(enrichedPlayer?.scheduleEntry?.ptsFor);
  const opponentScore = matchupNumber(enrichedPlayer?.scheduleEntry?.ptsAgainst);
  const finalScore = phase === 'final' && teamScore != null && opponentScore != null
    ? { team: player?.team ?? enrichedPlayer?.team, teamScore, opponent: enrichedPlayer?.oppTeam, opponentScore }
    : null;
  // A settled game does not need its kickoff time, only the day it was played.
  const kickoff = (finalScore ? formatMatchupGameDate(enrichedPlayer?.scheduleEntry?.kickoff) : null)
    ?? formatStatisticsScoresLocalKickoff(enrichedPlayer?.scheduleEntry?.kickoff)
    ?? enrichedPlayer?.gameDate
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

  const hasProjectedStatLine = projectedBreakdown?.rows?.some(row => row.statVal != null);

  return (
    <Modal onClose={onClose} mobileSheet ariaLabel="Player matchup breakdown"
      containerClassName="matchup-breakdown-dialog gridshift-reveal w-full flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-separator)', maxWidth: '1280px', maxHeight: '90dvh' }}>
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
        <div className="pmd-strip__row">
          <span className="pmd-logo">
            {opponentLogo && <img src={opponentLogo} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.hidden = true; }} />}
          </span>
          {finalScore
            ? <span className="pmd-ctx">
              {finalScore.teamScore >= finalScore.opponentScore
                ? <><strong>{finalScore.team} {finalScore.teamScore}</strong> · {finalScore.opponent} {finalScore.opponentScore}</>
                : <>{finalScore.team} {finalScore.teamScore} · <strong>{finalScore.opponent} {finalScore.opponentScore}</strong></>}
            </span>
            : <span className="pmd-ctx">{opponentLine}</span>}
        </div>
      </div>

      <div className="pmd-body gridshift-reveal gridshift-reveal--auto" data-game-phase={phase}>
        <Hero model={hero} />
        {headline && <section className="pmd-sec" data-slot="headline"><Emphasis parts={headline} /></section>}
        <RankSlot model={rankModel} />
        <Cells cells={cells} />
        {phase === 'live' && <Plays model={timeline} />}
        <Ladder model={ladder} />
        {isPregame && <Swap option={benchOption} onView={onViewBenchPlayer} />}
        {!isPregame && <DevSlot items={phase === 'live'
          ? ['Remaining opportunity estimate', 'Teammate cannibalization — who else is eating', 'Live positional rank and movement since kickoff']
          : ['Snap share and usage rate', 'What this means for next week', 'Per-week projection history for the form ladder']} />}

        <div className="pmd-disc" data-slot="disc">
          {isPregame ? <>
            <DiscRow label="Projected stat line" hint={hasProjectedStatLine ? undefined : 'Unavailable'}>
              {displayProjection && <>
                {hasProjectedStatLine
                  ? <ProjectionStatLine rows={projectedBreakdown.rows} total={projectedBreakdown.total} />
                  : <p className="matchup-performance-note">Detailed projected stats are unavailable for this projection source.</p>}
                <ProjectionDetails projection={displayProjection} />
              </>}
            </DiscRow>
            <DiscRow label="Opponent sample & method" hint={opponentContext ? getOpponentEvidenceLabel(opponentContext) : undefined}>
              {opponentContext && <ProjectionOpponentDetails player={enrichedPlayer} position={position} />}
            </DiscRow>
          </> : <>
            <DiscRow label="Full scoring breakdown" hint={breakdown.length ? `${breakdown.length} scoring lines` : undefined}>
              {breakdown.length ? <PerformanceTable rows={breakdown} /> : null}
            </DiscRow>
            <DiscRow
              label={projectionView.recorded ? 'Pregame projection & range' : 'Projection & expected range'}
              hint={matchupNumber(displayProjection?.projected) != null ? formatNumber(displayProjection.projected) : undefined}
            >
              {displayProjection && <>
                <p className="matchup-performance-note">
                  {projectionView.recorded
                    ? `Recorded before kickoff · ${new Date(baseline.capturedAt).toLocaleString()}`
                    : 'Available estimate; the original pregame projection was not recorded.'}
                </p>
                <ProjectionDetails projection={displayProjection} />
              </>}
            </DiscRow>
          </>}
          <DiscRow label="Season performance & defense splits">
            <PlayerPeerContext model={peerModel} season={season} />
          </DiscRow>
        </div>
      </div>
    </Modal>
  );
}
