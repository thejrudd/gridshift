import { useMemo, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, DEFAULT_SCORING, STAT_TO_SCORING_KEY } from '../../utils/scoringEngine';
import { formatWeather } from '../../api/weatherApi';
import { getTeamPalette } from '../../data/teamColors.js';
import { STATISTICS_MODES } from '../../utils/playerDrilldown';
import Modal from '../Modal';

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function HeaderActionButton({ label, onClick, heroBg, heroOnBg, icon }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 flex items-center gap-1 cursor-pointer"
      style={{
        background: heroBg
          ? (isHovered ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.15)')
          : (isHovered ? 'var(--color-fill)' : 'transparent'),
        border: heroBg ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--color-separator)',
        color: heroBg ? heroOnBg : 'var(--color-accent)',
      }}
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
  blk_kick:  'Blocked Kick',
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
  fgm_40_49:    'FG Made (40–49 yd)',
  fgm_50_59:    'FG Made (50–59 yd)',
  fgm_60p:      'FG Made (60+ yd)',
  fgmiss:       'FG Missed',
  fgmiss_0_19:  'FG Missed (0–19 yd)',
  fgmiss_20_29: 'FG Missed (20–29 yd)',
  fgmiss_30_39: 'FG Missed (30–39 yd)',
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
  def_3_and_out:     '3-and-Out Forced',
  def_4_and_stop:    '4th Down Stop',
  def_forced_punts:  'Forced Punt',
  def_pass_def:      'Pass Deflection (DST)',
  def_st_tkl_solo:   'ST Solo Tackle (DST)',
  def_kr_yd:         'Kick Return Yards (DST)',
  def_pr_yd:         'Punt Return Yards (DST)',
  sack:              'Sack (DST)',
  sack_yd:           'Sack Yards (DST)',
  int:               'Interception (DST)',
  int_ret_yd:        'INT Return Yards (DST)',
  safe:              'Safety (DST)',
  tkl:               'Tackle (DST)',
  tkl_solo:          'Solo Tackle (DST)',
  tkl_ast:           'Assisted Tackle (DST)',
  tkl_loss:          'Tackle for Loss (DST)',
  qb_hit:            'QB Hit (DST)',
  pts_allow:         'Points Allowed (per pt)',
  pts_allow_0:       'Shutout',
  pts_allow_1_6:     '1–6 Points Allowed',
  pts_allow_7_13:    '7–13 Points Allowed',
  pts_allow_14_20:   '14–20 Points Allowed',
  pts_allow_21_27:   '21–27 Points Allowed',
  pts_allow_28_34:   '28–34 Points Allowed',
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

const POINT_EPSILON = 0.005;

function roundPoints(value) {
  return Math.round(Number(value) * 100) / 100;
}

function addBreakdownRow(rows, { statKey, label, statVal, pts }) {
  if (!Number.isFinite(pts) || Math.abs(pts) < POINT_EPSILON) return;
  rows.push({
    statKey,
    label,
    statVal,
    pts: roundPoints(pts),
  });
}

function buildFantasyBreakdownRows(weekEntry, settings, position, authoritativeTotal) {
  const rows = [];
  const seen = new Set();

  for (const [statKey, scoringKey] of Object.entries(STAT_TO_SCORING_KEY)) {
    if (seen.has(scoringKey)) continue;
    const statVal = weekEntry[statKey];
    if (!statVal) continue;
    const multiplier = settings[scoringKey] ?? 0;
    if (multiplier === 0) continue;
    seen.add(scoringKey);
    addBreakdownRow(rows, {
      statKey,
      label: STAT_LABELS[statKey] ?? STAT_LABELS[scoringKey] ?? statKey,
      statVal,
      pts: Number(statVal) * multiplier,
    });
  }

  if (position && weekEntry.rec) {
    const rec = Number(weekEntry.rec);
    if (position === 'TE' && settings.bonus_rec_te) {
      addBreakdownRow(rows, { statKey: 'bonus_rec_te', label: 'TE Reception Bonus', statVal: rec, pts: rec * settings.bonus_rec_te });
    }
    if (position === 'RB' && settings.bonus_rec_rb) {
      addBreakdownRow(rows, { statKey: 'bonus_rec_rb', label: 'RB Reception Bonus', statVal: rec, pts: rec * settings.bonus_rec_rb });
    }
    if (position === 'WR' && settings.bonus_rec_wr) {
      addBreakdownRow(rows, { statKey: 'bonus_rec_wr', label: 'WR Reception Bonus', statVal: rec, pts: rec * settings.bonus_rec_wr });
    }
  }

  if (position === 'RB' && weekEntry.rush_att && settings.bonus_rush_att) {
    const rushAtt = Number(weekEntry.rush_att);
    addBreakdownRow(rows, { statKey: 'bonus_rush_att', label: 'Carry Bonus', statVal: rushAtt, pts: rushAtt * settings.bonus_rush_att });
  }

  if (position === 'QB' && settings.bonus_fd_qb) {
    const firstDowns = Number(weekEntry.pass_fd ?? 0) + Number(weekEntry.rush_fd ?? 0);
    addBreakdownRow(rows, { statKey: 'bonus_fd_qb', label: 'QB First Down Bonus', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_qb });
  }
  if (position === 'RB' && settings.bonus_fd_rb) {
    const firstDowns = Number(weekEntry.rush_fd ?? 0) + Number(weekEntry.rec_fd ?? 0);
    addBreakdownRow(rows, { statKey: 'bonus_fd_rb', label: 'RB First Down Bonus', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_rb });
  }
  if (position === 'WR' && weekEntry.rec_fd && settings.bonus_fd_wr) {
    const firstDowns = Number(weekEntry.rec_fd);
    addBreakdownRow(rows, { statKey: 'bonus_fd_wr', label: 'WR First Down Bonus', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_wr });
  }
  if (position === 'TE' && weekEntry.rec_fd && settings.bonus_fd_te) {
    const firstDowns = Number(weekEntry.rec_fd);
    addBreakdownRow(rows, { statKey: 'bonus_fd_te', label: 'TE First Down Bonus', statVal: firstDowns, pts: firstDowns * settings.bonus_fd_te });
  }

  const rowTotal = roundPoints(rows.reduce((sum, row) => sum + row.pts, 0));
  const adjustment = roundPoints(authoritativeTotal - rowTotal);

  if (rows.length === 0 && Math.abs(authoritativeTotal) >= POINT_EPSILON) {
    addBreakdownRow(rows, {
      statKey: 'sleeper_points_total',
      label: 'Sleeper Scoring Total',
      statVal: null,
      pts: authoritativeTotal,
    });
  } else if (Math.abs(adjustment) >= 0.01) {
    addBreakdownRow(rows, {
      statKey: 'scoring_adjustment',
      label: 'Scoring Adjustment',
      statVal: null,
      pts: adjustment,
    });
  }

  return rows.sort((a, b) => b.pts - a.pts);
}

function ProjectionMath({ baseAvg, factors, projected, projMin, projMax, oppTeam, locationStr, weatherStr, defLabel }) {
  const displayFont = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  function fc(f) {
    if (f > 1.02) return '#22c55e';
    if (f < 0.98) return '#ef4444';
    return 'var(--color-label-secondary)';
  }
  function fmt(f) { return `${f.toFixed(2)}×`; }
  function impactText(f) {
    const pct = Math.round((f - 1) * 100);
    if (pct > 0) return `+${pct}%`;
    if (pct < 0) return `${pct}%`;
    return 'Even';
  }

  const opp    = factors.oppFactor ?? 1;
  const loc    = factors.locationFactor ?? 1;
  const wth    = factors.weatherFactor ?? 1;
  const snap   = factors.snapFactor ?? 1;
  const floor  = factors.floorBase ?? null;
  const ceil   = factors.ceilingBase ?? null;
  const recent = factors.recentBase ?? null;
  const season = factors.seasonBase ?? null;

  // Detail line for the Base row: show recent vs season avg when they differ meaningfully
  const baseDetail = recent != null && season != null && Math.abs(recent - season) >= 0.5
    ? `${recent.toFixed(1)} recent · ${season.toFixed(1)} season`
    : null;

  const snapDetail = (() => {
    if (snap > 1.05) return 'Usage ↑';
    if (snap < 0.95) return 'Usage ↓';
    return 'On trend';
  })();

  const showLocation = Math.abs(loc - 1) >= 0.01;
  const factorsList = [
    {
      label: 'Base average',
      detail: baseDetail,
      value: baseAvg != null ? baseAvg.toFixed(1) : '—',
      meta: 'Starting point',
      color: 'var(--color-label)',
    },
    ...(showLocation ? [{
      label: 'Home/Away',
      detail: locationStr ?? 'Neutral',
      value: fmt(loc),
      meta: impactText(loc),
      color: fc(loc),
    }] : []),
    {
      label: 'Matchup',
      detail: oppTeam ? `vs ${oppTeam}${defLabel ? ` · ${defLabel}` : ''}` : 'No data',
      value: fmt(opp),
      meta: impactText(opp),
      color: fc(opp),
    },
    {
      label: 'Weather',
      detail: weatherStr || 'Indoor / N/A',
      value: fmt(wth),
      meta: impactText(wth),
      color: fc(wth),
    },
    {
      label: 'Snap use',
      detail: snapDetail,
      value: fmt(snap),
      meta: impactText(snap),
      color: fc(snap),
    },
  ];
  const range = [
    { label: 'Floor', value: projMin, source: floor },
    { label: 'Projection', value: projected, source: baseAvg },
    { label: 'Ceiling', value: projMax, source: ceil },
  ];

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--color-label-secondary)', fontFamily: displayFont }}
          >
            Projection Math
          </div>
          <div className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--color-label)' }}>
            Base scoring adjusted by matchup, venue, weather, and recent usage.
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--color-label-secondary)', fontFamily: displayFont }}
          >
            Proj
          </div>
          <div className="text-2xl font-black tabular-nums leading-none" style={{ color: 'var(--color-signature)', fontFamily: displayFont }}>
            {projected != null ? projected.toFixed(1) : '—'}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-md overflow-hidden" style={{ border: '1px solid var(--color-separator)', background: 'var(--color-bg-tertiary)' }}>
        {factorsList.map((row, i) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5"
            style={{
              background: i % 2 === 0 ? 'var(--color-fill-secondary)' : 'transparent',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-separator)',
            }}
          >
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight" style={{ color: 'var(--color-label)', fontFamily: displayFont }}>{row.label}</div>
              {row.detail && (
                <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--color-label-secondary)' }}>{row.detail}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-base font-black tabular-nums leading-tight" style={{ color: row.color, fontFamily: displayFont }}>{row.value}</div>
              <div className="text-[11px] tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>{row.meta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {range.map(item => (
          <div key={item.label} className="rounded-md px-2.5 py-2.5" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-separator)' }}>
            <div
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-secondary)', fontFamily: displayFont }}
            >
              {item.label}
            </div>
            <div className="mt-1 text-xl font-black tabular-nums leading-none" style={{ color: item.label === 'Projection' ? 'var(--color-signature)' : 'var(--color-label)', fontFamily: displayFont }}>
              {item.value != null ? item.value.toFixed(1) : '—'}
            </div>
            {item.source != null && (
              <div className="mt-1 text-[10px] tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                from {item.source.toFixed(1)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
        Matchup uses fantasy points per game allowed to the position group in prior weeks. Floor and ceiling start from this player's 25th and 75th percentile games, then receive a lighter matchup adjustment.
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div
      className="px-5 pt-4 pb-1.5"
      style={{ borderBottom: '1px solid var(--color-separator)' }}
    >
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
        {label}
      </span>
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-center px-5 py-2" style={{ borderBottom: '1px solid var(--color-separator)' }}>
      <span className="w-28 shrink-0 text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{label}</span>
      <div className="flex-1 flex items-center gap-1.5 flex-wrap">
        {children}
      </div>
    </div>
  );
}

function getPositionGroupShortLabel(pos) {
  const key = String(pos ?? '').toUpperCase();
  return {
    QB: 'QBs',
    RB: 'RBs',
    WR: 'WRs',
    TE: 'TEs',
  }[key] ?? (key ? `${key}s` : 'position group');
}

export default function PlayerMatchupBreakdown({ playerId, week, projection, enrichedPlayer, onClose, onViewStats }) {
  const { players, weeklyStats, activeScoringSettings, espnIdOverrides } = useSleeperBase();
  const { darkMode } = useTheme();

  const player = players?.[playerId];

  // Team color palette
  const palette = getTeamPalette(player?.team);
  const heroBg = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary) : null;
  const heroOnBg = heroBg && hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroOnBgMuted = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.60)';
  const weekEntry = weeklyStats?.[playerId]?.find(w => w.week === week) ?? null;

  const { breakdown, total } = useMemo(() => {
    if (!weekEntry) return { breakdown: [], total: 0 };
    const settings = { ...DEFAULT_SCORING, ...activeScoringSettings };
    const position = player?.position ?? enrichedPlayer?.position ?? null;
    const nextTotal = calcPoints(weekEntry, settings, position);
    return {
      breakdown: buildFantasyBreakdownRows(weekEntry, settings, position, nextTotal),
      total: nextTotal,
    };
  }, [weekEntry, activeScoringSettings, player?.position, enrichedPlayer?.position]);
  const projectedScore = projection?.projected ?? null;
  const diff = projectedScore !== null ? Math.round((total - projectedScore) * 10) / 10 : null;
  const metProjection = diff !== null ? diff >= 0 : null;

  // ── Rankings ─────────────────────────────────────────────────────────────────
  const ssnRank = enrichedPlayer?.rank ? `${enrichedPlayer.rank.posLabel}${enrichedPlayer.rank.rank}` : null;
  const wkRank  = enrichedPlayer?.weekRank ? `${enrichedPlayer.weekRank.posLabel}${enrichedPlayer.weekRank.rank}` : null;
  const avgPPG  = enrichedPlayer?.avgPPG > 0 ? enrichedPlayer.avgPPG : null;
  const hasRankings = ssnRank || wkRank || avgPPG;

  // ── Game context ──────────────────────────────────────────────────────────────
  const oppTeam    = enrichedPlayer?.oppTeam ?? null;
  const locationStr = enrichedPlayer?.isHome === true ? 'Home' : enrichedPlayer?.isHome === false ? 'Away' : null;
  const stadium    = enrichedPlayer?.stadium ?? null;
  const weatherStr = enrichedPlayer ? formatWeather(enrichedPlayer.weather, enrichedPlayer.isIndoor ?? false) : null;
  const def        = enrichedPlayer?.defStrength ?? null;
  const defPercentile = enrichedPlayer?.defPercentile ?? null;

  let defLabel = null, defBg = null, defText = null;
  if (defPercentile !== null) {
    if (defPercentile <= 0.20)      { defLabel = 'Difficult';   defBg = 'rgba(239,68,68,0.18)';   defText = '#ef4444'; }
    else if (defPercentile <= 0.40) { defLabel = 'Challenging'; defBg = 'rgba(249,115,22,0.18)';  defText = '#f97316'; }
    else if (defPercentile <= 0.60) { defLabel = 'Average';     defBg = 'rgba(120,120,128,0.16)'; defText = 'var(--color-label-tertiary)'; }
    else if (defPercentile <= 0.80) { defLabel = 'Favorable';   defBg = 'rgba(132,204,22,0.18)';  defText = '#84cc16'; }
    else                            { defLabel = 'Easy';         defBg = 'rgba(34,197,94,0.18)';   defText = '#22c55e'; }
  }

  const projMin = projection?.min ?? null;
  const projMax = projection?.max ?? null;
  const factors = projection?.factors ?? null;
  const espnId = player?.espn_id ?? espnIdOverrides?.[playerId];
  const canOpenStatistics = Boolean(onViewStats && espnId);
  const openStatisticsMode = (mode) => {
    if (!canOpenStatistics) return;
    onClose();
    const yearsExp = player?.years_exp;
    onViewStats(String(espnId), {
      displayName: player?.full_name,
      teamId: player?.team?.toUpperCase(),
      position: player?.position,
      experience: yearsExp != null ? yearsExp + 1 : undefined,
    }, { mode });
  };

  // Projection math reveal: persistent side rail on desktop, explicit toggle on smaller screens.
  const [mathPinned, setMathPinned] = useState(false);
  const [closeHover, setCloseHover] = useState(false);
  const mathVisible = mathPinned;

  // Season avg base back-calculated from projected (excludes floor/ceiling bases)
  const baseAvg = useMemo(() => {
    if (!projectedScore || !factors) return null;
    const denom = (factors.locationFactor ?? 1) * (factors.oppFactor ?? 1) *
                  (factors.weatherFactor ?? 1) * (factors.snapFactor ?? 1);
    return denom > 0 ? Math.round((projectedScore / denom) * 10) / 10 : null;
  }, [projectedScore, factors]);

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Player matchup breakdown"
      containerClassName="matchup-breakdown-dialog w-full flex flex-col xl:flex-row"
      containerStyle={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-separator)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        maxWidth: factors ? '860px' : '480px',
        maxHeight: '80vh',
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col xl:max-w-[480px]">
          {/* Player header */}
          <div
            className="px-5 pt-4 pb-3 shrink-0 relative"
            style={{
              background: heroBg
                ? `linear-gradient(135deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.32)} 100%)`
                : 'var(--color-bg-secondary)',
              borderBottom: heroBg ? 'none' : '1px solid var(--color-separator)',
              borderLeft: heroAccent ? `4px solid ${heroAccent}` : undefined,
            }}
          >
            {/* Top row: avatar + name + close */}
            <div className="flex items-center gap-3">
              <img
                src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
                alt={player?.full_name}
                className="w-12 h-12 rounded-full object-cover shrink-0"
                style={{
                  background: heroBg ? 'rgba(255,255,255,0.15)' : 'var(--color-fill)',
                  border: heroBg ? `2px solid ${heroAccent ?? 'rgba(255,255,255,0.25)'}` : 'none',
                }}
                onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base" style={{ color: heroBg ? heroOnBg : 'var(--color-label)' }}>
                  {player?.full_name ?? 'Unknown Player'}
                </div>
                <div className="text-xs mt-0.5" style={{ color: heroBg ? heroOnBgMuted : 'var(--color-label-tertiary)' }}>
                  {player?.position} · {player?.team ?? 'FA'} · Week {week}
                </div>
              </div>
              <button
                onClick={onClose}
                onMouseEnter={() => setCloseHover(true)}
                onMouseLeave={() => setCloseHover(false)}
                onFocus={() => setCloseHover(true)}
                onBlur={() => setCloseHover(false)}
                className="shrink-0 p-2 rounded-lg transition-colors duration-150 cursor-pointer"
                style={{
                  color: heroBg ? heroOnBgMuted : 'var(--color-label-secondary)',
                  background: closeHover
                    ? (heroBg ? 'rgba(255,255,255,0.14)' : 'var(--color-fill)')
                    : 'transparent',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {/* Action buttons row */}
            {canOpenStatistics && (
              <div className="flex items-center gap-2 mt-2" style={{ paddingLeft: '60px' }}>
                <HeaderActionButton
                  label="Fantasy Value"
                  onClick={() => openStatisticsMode(STATISTICS_MODES.FANTASY)}
                  heroBg={heroBg}
                  heroOnBg={heroOnBg}
                  icon={(
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  )}
                />
                <HeaderActionButton
                  label="Game Stats"
                  onClick={() => openStatisticsMode(STATISTICS_MODES.GAME)}
                  heroBg={heroBg}
                  heroOnBg={heroOnBg}
                  icon={(
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  )}
                />
              </div>
            )}
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1">

            {/* ── Rankings ──────────────────────────────────────────────────── */}
            {hasRankings && (
              <>
                <SectionHeader label="Rankings" />
                <div className="flex gap-6 px-5 py-3" style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {wkRank && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-label-tertiary)' }}>Week {week}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-signature)' }}>{wkRank}</div>
                    </div>
                  )}
                  {ssnRank && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-label-tertiary)' }}>Season</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-label)' }}>{ssnRank}</div>
                    </div>
                  )}
                  {avgPPG && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-label-tertiary)' }}>Avg PPG</div>
                      <div className="text-sm tabular-nums" style={{ color: 'var(--color-label)' }}>{avgPPG.toFixed(1)}</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Game context ──────────────────────────────────────────────── */}
            {oppTeam && (
              <>
                <SectionHeader label="Game Context" />
                <InfoRow label="Opponent">
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>vs {oppTeam}</span>
                  {locationStr && (
                    <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>· {locationStr}</span>
                  )}
                </InfoRow>
                {(stadium || weatherStr) && (
                  <InfoRow label="Venue">
                    {stadium?.name && (
                      <span className="text-xs" style={{ color: 'var(--color-label)' }}>{stadium.name}</span>
                    )}
                    {weatherStr && (
                      <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                        {stadium?.name ? '· ' : ''}{weatherStr}
                      </span>
                    )}
                  </InfoRow>
                )}
                {def && (() => {
                  const pos = player?.position ?? enrichedPlayer?.position ?? '';
                  const posGroupLabel = getPositionGroupShortLabel(pos);
                  return (
                    <InfoRow label="Defense">
                      {defLabel && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: defBg, color: defText }}
                        >
                          {defLabel}
                        </span>
                      )}
                      <span className="text-xs tabular-nums" style={{ color: 'var(--color-label)' }}>
                        Opposing {posGroupLabel} combine for {def.ptsAllowedPerGame.toFixed(1)} points per game
                      </span>
                    </InfoRow>
                  );
                })()}
                {projectedScore !== null && (
                  <div>
                    <InfoRow label="Projection">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-signature)' }}>
                        {projectedScore.toFixed(1)} pts
                      </span>
                      {projMin != null && projMax != null && (
                        <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
                          · range {projMin}–{projMax}
                        </span>
                      )}
                      {factors && (
                        <button
                          type="button"
                          className="ml-auto shrink-0 text-[11px] font-bold w-5 h-5 rounded-full flex xl:hidden items-center justify-center transition-colors"
                          style={{
                            background: mathVisible ? 'var(--color-accent)' : 'var(--color-fill-secondary)',
                            color: mathVisible ? '#fff' : 'var(--color-label-tertiary)',
                          }}
                          onClick={() => setMathPinned(v => !v)}
                          aria-expanded={mathVisible}
                          aria-label="Show projection formula"
                        >
                          i
                        </button>
                      )}
                    </InfoRow>
                    {mathPinned && factors && (
                      <div className="xl:hidden" style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <ProjectionMath
                          baseAvg={baseAvg}
                          factors={factors}
                          projected={projectedScore}
                          projMin={projMin}
                          projMax={projMax}
                          oppTeam={oppTeam}
                          locationStr={locationStr}
                          weatherStr={weatherStr}
                          defLabel={defLabel}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Week stats ────────────────────────────────────────────────── */}
            {!weekEntry ? (
              <div className="flex items-center justify-center py-16">
                <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                  No stats available for Week {week}.
                </span>
              </div>
            ) : breakdown.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                  No fantasy points scored in Week {week}.
                </span>
              </div>
            ) : (
              <>
                <SectionHeader label={`Week ${week} Fantasy Score`} />

                {/* Column headers */}
                <div
                  className="flex items-center px-5 py-2 sticky top-0"
                  style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
                >
                  <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Stat</span>
                  <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Value</span>
                  <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
                </div>

                {breakdown.map(row => (
                  <div
                    key={row.statKey}
                    className="flex items-center px-5 py-2.5"
                    style={{ borderBottom: '1px solid var(--color-separator)' }}
                  >
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>{row.label}</span>
                    <span className="w-14 text-right text-sm tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                      {row.statVal == null ? '—' : Number.isInteger(row.statVal) ? row.statVal : row.statVal.toFixed(1)}
                    </span>
                    <span
                      className="w-16 text-right text-sm font-semibold tabular-nums"
                      style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}
                    >
                      {row.pts > 0 ? `+${row.pts.toFixed(2)}` : row.pts.toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Total row */}
                <div
                  className="flex items-center px-5 py-4"
                  style={{ background: 'var(--color-fill-secondary)', borderTop: '1px solid var(--color-separator)' }}
                >
                  <div className="flex-1">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-label)' }}>Total</span>
                    {projectedScore !== null && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                        Proj: {projectedScore.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {diff !== null && (
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded tabular-nums"
                        style={{
                          background: metProjection ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          color: metProjection ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                      </span>
                    )}
                    <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-signature)' }}>
                      {total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
      </div>

      {factors && projectedScore !== null && (
        <aside
          className="hidden xl:block w-[380px] shrink-0 overflow-y-auto"
          style={{
            borderLeft: '1px solid var(--color-separator)',
            background: 'var(--color-bg-secondary)',
          }}
          aria-label="Projection formula"
        >
          <ProjectionMath
            baseAvg={baseAvg}
            factors={factors}
            projected={projectedScore}
            projMin={projMin}
            projMax={projMax}
            oppTeam={oppTeam}
            locationStr={locationStr}
            weatherStr={weatherStr}
            defLabel={defLabel}
          />
        </aside>
      )}
    </Modal>
  );
}
