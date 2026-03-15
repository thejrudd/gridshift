import { useEffect, useMemo } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { DEFAULT_SCORING } from '../../utils/scoringEngine';
import { formatWeather } from '../../api/weatherApi';

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
  // Bonuses
  bonus_pass_yd_300: '300+ Pass Yd Bonus',
  bonus_pass_yd_400: '400+ Pass Yd Bonus',
  bonus_rush_yd_100: '100+ Rush Yd Bonus',
  bonus_rush_yd_200: '200+ Rush Yd Bonus',
  bonus_rec_yd_100:  '100+ Rec Yd Bonus',
  bonus_rec_yd_200:  '200+ Rec Yd Bonus',
  // IDP
  idp_tkl:      'Tackle',
  idp_tkl_solo: 'Solo Tackle',
  idp_tkl_ast:  'Assisted Tackle',
  idp_tkl_loss: 'Tackle for Loss',
  idp_sack:     'Sack',
  idp_int:      'Interception (def)',
  idp_ff:       'Forced Fumble',
  idp_fr:       'Fumble Recovery',
  idp_pd:       'Pass Deflection',
  idp_qbhit:    'QB Hit',
  idp_safety:   'Safety',
  idp_int_td:   'INT Return TD',
  idp_fr_td:    'Fumble Return TD',
  idp_def_td:   'Defensive TD',
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
  xpm:          'Extra Point Made',
  xpmiss:       'Extra Point Missed',
};

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

export default function PlayerMatchupBreakdown({ playerId, week, projection, enrichedPlayer, onClose }) {
  const { players, weeklyStats, scoringSettings } = useSleeper();

  const player = players?.[playerId];
  const weekEntry = weeklyStats?.[playerId]?.find(w => w.week === week) ?? null;

  const breakdown = useMemo(() => {
    if (!weekEntry) return [];
    const settings = { ...DEFAULT_SCORING, ...scoringSettings };

    return Object.entries(STAT_LABELS)
      .map(([statKey, label]) => {
        const statVal = weekEntry[statKey];
        if (!statVal) return null;
        const multiplier = settings[statKey] ?? 0;
        if (multiplier === 0) return null;
        const pts = Math.round(statVal * multiplier * 100) / 100;
        return { label, statKey, statVal, multiplier, pts };
      })
      .filter(Boolean)
      .sort((a, b) => b.pts - a.pts);
  }, [weekEntry, scoringSettings]);

  const total = Math.round(breakdown.reduce((s, r) => s + r.pts, 0) * 100) / 100;
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
  const oppFactor  = projection?.factors?.oppFactor ?? null;

  let defLabel = null, defBg = null, defText = null;
  if (oppFactor !== null) {
    if (oppFactor >= 1.10)      { defLabel = 'Easy'; defBg = 'rgba(34,197,94,0.18)';  defText = '#22c55e'; }
    else if (oppFactor <= 0.90) { defLabel = 'Hard'; defBg = 'rgba(239,68,68,0.18)';  defText = '#ef4444'; }
    else                        { defLabel = 'Avg';  defBg = 'rgba(120,120,128,0.16)'; defText = 'var(--color-label-tertiary)'; }
  }

  const projMin = projection?.min ?? null;
  const projMax = projection?.max ?? null;

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: 'var(--color-bg-secondary)',
            maxWidth: '480px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
          aria-modal="true"
        >
          {/* Player header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <img
              src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
              alt={player?.full_name}
              className="w-12 h-12 rounded-full object-cover shrink-0"
              style={{ background: 'var(--color-fill)' }}
              onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base truncate" style={{ color: 'var(--color-label)' }}>
                {player?.full_name ?? 'Unknown Player'}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                {player?.position} · {player?.team ?? 'FA'} · Week {week}
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
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
                  const posPlural = pos ? `${pos}s` : 'this position';
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
                        {def.ptsAllowedPerGame.toFixed(1)} average points allowed to {posPlural}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
                        ({def.gamesAnalyzed} games)
                      </span>
                    </InfoRow>
                  );
                })()}
                {projectedScore !== null && (
                  <InfoRow label="Projection">
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-signature)' }}>
                      {projectedScore.toFixed(1)} pts
                    </span>
                    {projMin != null && projMax != null && (
                      <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
                        · range {projMin}–{projMax}
                      </span>
                    )}
                  </InfoRow>
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
                      {Number.isInteger(row.statVal) ? row.statVal : row.statVal.toFixed(1)}
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
      </div>
    </>
  );
}
