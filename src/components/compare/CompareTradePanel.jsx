// ── CompareTradePanel ─────────────────────────────────────────────────────────
// v5.5 — Trade Agent: live KeepTradeCut values for the two compared players.

import { useEffect, useState } from 'react';
import { fetchKtcPlayers, findKtcPlayer, getKtcValue, fmtKtcValue } from '../../utils/ktcApi';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { TEAM_COLORS } from '../../data/teamColors';

// Derive league format and type from Sleeper league settings (mirrors CompanionTrade)
function detectLeagueFormat(league) {
  return league?.settings?.type === 2 ? 'dynasty' : 'redraft';
}

function detectLeagueType(league) {
  return (league?.roster_positions ?? []).includes('SUPER_FLEX') ? 'sf' : '1qb';
}

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

const ESPN_TEAM_MAP = { lar: 'la', was: 'wsh' };
function toTeamKey(espnTeamId) {
  if (!espnTeamId) return '';
  const lower = espnTeamId.toLowerCase();
  return ESPN_TEAM_MAP[lower] ?? lower;
}

// ── CompareTradePanel ─────────────────────────────────────────────────────────

export default function CompareTradePanel({ playerA, playerB, sleeperPlayerA, sleeperPlayerB, onBuildTrade }) {
  const { league, hasLeague } = useSleeper();
  const { darkMode } = useTheme();
  const [ktcPlayers, setKtcPlayers] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const format     = detectLeagueFormat(league);
  const leagueType = detectLeagueType(league);
  const hasAny     = playerA || playerB;

  useEffect(() => {
    if (!hasAny) return;
    setLoading(true);
    setError(null);
    fetchKtcPlayers(format)
      .then((players) => { setKtcPlayers(players); setLoading(false); })
      .catch((err)    => { setError(err.message);  setLoading(false); });
  }, [format, hasAny]);

  // Empty state — no players selected
  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 gap-3">
        <TradeIcon />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
          Select players to see trade values
        </span>
      </div>
    );
  }

  const ktcA = ktcPlayers ? findKtcPlayer(playerA, ktcPlayers, sleeperPlayerA) : null;
  const ktcB = ktcPlayers ? findKtcPlayer(playerB, ktcPlayers, sleeperPlayerB) : null;
  const valA = getKtcValue(ktcA, leagueType);
  const valB = getKtcValue(ktcB, leagueType);

  const bothKnown = valA != null && valB != null;
  const maxVal    = bothKnown ? Math.max(valA, valB) : null;
  const gap       = bothKnown ? Math.abs(valA - valB) : null;
  const pct       = bothKnown && maxVal > 0 ? Math.round((gap / maxVal) * 100) : null;

  const leader = bothKnown
    ? (valA > valB ? 'A' : valA < valB ? 'B' : 'equal')
    : null;

  const leaderName = leader === 'A' ? playerA?.displayName
    : leader === 'B' ? playerB?.displayName
    : null;

  const trailerName = leader === 'A' ? playerB?.displayName
    : leader === 'B' ? playerA?.displayName
    : null;

  return (
    <div className="px-4 py-4 flex flex-col gap-5">

      {/* ── Loading / error ────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-8 gap-3"
          style={{ color: 'var(--color-label-tertiary)' }}>
          <Spinner />
          <span className="text-sm">Loading KTC data…</span>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-xl px-4 py-4 flex flex-col gap-1.5"
          style={{ background: 'var(--color-fill)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            KTC data unavailable
          </span>
          <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
            The KeepTradeCut proxy could not be reached. This feature requires the Docker
            deployment — it is not available in local dev mode without the nginx proxy.
          </span>
          <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>
            {error}
          </span>
        </div>
      )}

      {/* ── Value cards ────────────────────────────────────────────────── */}
      {!loading && !error && (
        <>
          <div className="flex gap-3">
            <ValueCard
              player={playerA}
              ktcEntry={ktcA}
              val={valA}
              maxVal={maxVal}
              isLeader={leader === 'A'}
              side="A"
              darkMode={darkMode}
            />

            <div
              className="flex items-center justify-center shrink-0 text-xs font-bold"
              style={{ color: 'var(--color-label-quaternary)', width: 24 }}
            >
              vs
            </div>

            <ValueCard
              player={playerB}
              ktcEntry={ktcB}
              val={valB}
              maxVal={maxVal}
              isLeader={leader === 'B'}
              side="B"
              darkMode={darkMode}
            />
          </div>

          {/* ── Trade analysis ──────────────────────────────────────────── */}
          {bothKnown && (
            <div
              className="rounded-xl px-4 py-4 flex flex-col gap-2"
              style={{ background: 'var(--color-fill)' }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}
              >
                Trade Analysis
              </span>

              {leader === 'equal' ? (
                <p className="text-sm" style={{ color: 'var(--color-label)' }}>
                  These players have roughly equal trade value — a straight swap is fair.
                </p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
                    <span className="font-semibold">{leaderName}</span> has{' '}
                    <span className="font-semibold">{fmtKtcValue(gap)}</span> more value
                    {pct != null && pct > 0 && (
                      <span style={{ color: 'var(--color-label-secondary)' }}> ({pct}%)</span>
                    )}
                    .
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                    To trade <span className="font-medium" style={{ color: 'var(--color-label)' }}>{trailerName}</span> for{' '}
                    <span className="font-medium" style={{ color: 'var(--color-label)' }}>{leaderName}</span>,
                    the {trailerName?.split(' ').pop()} side needs to add roughly{' '}
                    <span className="font-semibold" style={{ color: 'var(--color-label)' }}>{fmtKtcValue(gap)}</span> in
                    additional asset value to balance the trade.
                  </p>
                </>
              )}
            </div>
          )}

          {/* One player selected but not the other */}
          {!playerA && playerB && (
            <div className="text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              Select Player 1 to compare trade values.
            </div>
          )}
          {playerA && !playerB && (
            <div className="text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              Select Player 2 to compare trade values.
            </div>
          )}

          {/* Build Full Trade button — only enabled when exactly one player is on own roster */}
          {hasLeague && (playerA || playerB) && (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={onBuildTrade ?? undefined}
                disabled={!onBuildTrade}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: onBuildTrade ? 'var(--color-signature)' : 'var(--color-fill)',
                  color: onBuildTrade ? 'var(--color-signature-fg)' : 'var(--color-label-quaternary)',
                  cursor: onBuildTrade ? 'pointer' : 'default',
                }}
              >
                Build Full Trade
              </button>
              {!onBuildTrade && (
                <p className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
                  One player must be on your roster to build a trade.
                </p>
              )}
            </div>
          )}

          {/* KTC attribution */}
          <div className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Values from{' '}
            <span className="font-medium" style={{ color: 'var(--color-label-tertiary)' }}>
              KeepTradeCut
            </span>{' '}
            · {format === 'dynasty' ? 'Dynasty' : 'Redraft'} · {leagueType === 'sf' ? 'Superflex' : '1QB'}
          </div>
        </>
      )}
    </div>
  );
}

// ── ValueCard ─────────────────────────────────────────────────────────────────

function ValueCard({ player, ktcEntry, val, maxVal, isLeader, side, darkMode }) {
  const barWidth = maxVal > 0 && val != null ? Math.round((val / maxVal) * 100) : 0;

  const teamKey   = player ? toTeamKey(player.teamId) : '';
  const palette   = teamKey ? (TEAM_COLORS[teamKey] ?? null) : null;
  const teamColor = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const isLight   = teamColor ? hexLuminance(teamColor) > 0.35 : false;
  const tintBg    = teamColor ? `${teamColor}${isLight ? '18' : '22'}` : 'var(--color-fill)';

  return (
    <div
      className="flex-1 rounded-xl px-3 py-3 flex flex-col gap-2 min-w-0 relative overflow-hidden"
      style={{
        background: tintBg,
        borderLeft: teamColor ? `3px solid ${teamColor}` : '3px solid var(--color-separator)',
        outline: isLeader ? '1.5px solid var(--color-signature)' : 'none',
      }}
    >
      {/* Logo watermark */}
      {teamKey && (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
          className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none select-none"
          style={{ width: 56, height: 56, objectFit: 'contain', opacity: 0.10 }}
          onError={e => { e.target.style.display = 'none'; }}
          alt=""
        />
      )}

      {/* Value */}
      <div
        className="text-2xl font-bold tabular-nums leading-none"
        style={{ color: isLeader ? 'var(--color-signature)' : (player ? 'var(--color-label)' : 'var(--color-label-quaternary)') }}
      >
        {player ? fmtKtcValue(val) : '—'}
      </div>
      {!player && (
        <div className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
          Player {side} not selected
        </div>
      )}

      {/* Not found label */}
      {player && ktcEntry === null && (
        <div className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
          Not in KTC data
        </div>
      )}

      {/* Value bar */}
      {val != null && (
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-separator)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${barWidth}%`,
              background: isLeader ? 'var(--color-signature)' : 'var(--color-accent)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── TradeIcon ─────────────────────────────────────────────────────────────────

function TradeIcon() {
  return (
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
      style={{ background: 'var(--color-fill)' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--color-label-tertiary)' }}>
        <path d="M7 16V4m0 0L3 8m4-4l4 4" />
        <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    </div>
  );
}
