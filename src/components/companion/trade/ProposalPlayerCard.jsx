import { useSleeperLeague } from '../../../context/SleeperContext';
import { useTheme } from '../../../context/ThemeContext';
import { fmtKtcValue } from '../../../utils/ktcApi';
import { normalizeIDPPos } from '../../../utils/idpEngine';
import useCardGlow from '../../../hooks/useCardGlow.jsx';
import { teamPalette } from './tradeUiHelpers';

// Position-specific season stat definitions for desktop card breakdown.
const CARD_STAT_DEFS = {
  QB: [
    { key: 'pass_yd', label: 'Pass Yds' }, { key: 'pass_td', label: 'Pass TD' },
    { key: 'pass_int', label: 'INT' }, { key: 'pass_cmp', label: 'Comp' },
    { key: 'rush_yd', label: 'Rush Yds' }, { key: 'rush_td', label: 'Rush TD' },
  ],
  RB: [
    { key: 'rush_yd', label: 'Rush Yds' }, { key: 'rush_td', label: 'Rush TD' },
    { key: 'rush_att', label: 'Carries' }, { key: 'rec', label: 'Rec' },
    { key: 'rec_yd', label: 'Rec Yds' }, { key: 'rec_td', label: 'Rec TD' },
  ],
  WR: [
    { key: 'rec', label: 'Rec' }, { key: 'rec_yd', label: 'Rec Yds' },
    { key: 'rec_td', label: 'Rec TD' }, { key: 'rush_yd', label: 'Rush Yds' },
    { key: 'rush_td', label: 'Rush TD' },
  ],
  TE: [
    { key: 'rec', label: 'Rec' }, { key: 'rec_yd', label: 'Rec Yds' },
    { key: 'rec_td', label: 'Rec TD' },
  ],
  K: [
    { key: 'fgm', label: 'FGM' }, { key: 'fgmiss', label: 'FG Miss' },
    { key: 'xpm', label: 'XPM' }, { key: 'xpmiss', label: 'XP Miss' },
  ],
  DL: [
    { key: 'idp_tkl', label: 'Tackles' }, { key: 'idp_sack', label: 'Sacks' },
    { key: 'idp_int', label: 'INT' }, { key: 'idp_ff', label: 'FF' },
    { key: 'idp_pd', label: 'PD' }, { key: 'idp_qbhit', label: 'QB Hits' },
  ],
  LB: [
    { key: 'idp_tkl', label: 'Tackles' }, { key: 'idp_sack', label: 'Sacks' },
    { key: 'idp_int', label: 'INT' }, { key: 'idp_ff', label: 'FF' },
    { key: 'idp_pd', label: 'PD' }, { key: 'idp_qbhit', label: 'QB Hits' },
  ],
  DB: [
    { key: 'idp_tkl', label: 'Tackles' }, { key: 'idp_int', label: 'INT' },
    { key: 'idp_pd', label: 'PD' }, { key: 'idp_ff', label: 'FF' },
    { key: 'idp_sack', label: 'Sacks' }, { key: 'idp_qbhit', label: 'QB Hits' },
  ],
};

// Portrait trading card for one asset in a proposal side.
export default function ProposalPlayerCard({ player = null, palette = null, pick = null, side, seasonStats, showSideBadge = true, forcedHeight = null, cardRef = null, topRightSlot = null, onClick = null, compactTradeCard = false }) {
  const primary = player ?? null;
  const primaryPalette = palette ?? null;
  const primaryPick = pick ?? null;
  const { darkMode, favoriteTeam } = useTheme();
  const { rosters } = useSleeperLeague();

  const teamColor = primaryPalette?.color ?? null;
  const teamGradient = primaryPalette?.gradient ?? null;
  const teamGradientOverlay = primaryPalette?.gradientOverlay ?? null;
  const sideBadgeForeground = '#FFFFFF';
  const cardBg = teamGradient
    ? teamGradient
    : 'var(--color-fill)';
  const cardBorder = teamColor ? `${teamColor}88` : 'var(--color-separator)';
  const cardHighlight = teamColor
    ? `4px solid ${teamColor}`
    : `4px solid ${darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(12,15,20,0.14)'}`;
  // Gradient fade applied behind the player image (visible when photo doesn't fully cover)
  const photoFade = teamColor
    ? 'linear-gradient(to bottom, transparent 18%, rgba(12,15,20,0.08) 68%, rgba(12,15,20,0.24) 100%)'
    : 'linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.7) 100%)';

  // Desktop: position-specific season stats
  const playerStats = primary ? seasonStats?.[primary.id] : null;
  const statPosition = primary ? (normalizeIDPPos(primary.position) ?? primary.position) : null;
  const statDefs = statPosition ? (CARD_STAT_DEFS[statPosition] ?? []) : [];
  const visibleStatDefs = compactTradeCard ? statDefs.slice(0, 2) : statDefs;

  const fmtStat = (v) => v == null ? '—' : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  const playerImageSrc = primary
    ? `https://sleepercdn.com/content/nfl/players/thumb/${primary.id}.jpg`
    : null;
  const isInteractive = !!(primary && onClick);
  // Use the team's vivid primary color for the glow, not the contrast-adjusted accent.
  const interactiveGlowColor = teamColor ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isInteractive,
    color: interactiveGlowColor,
    cardColor: teamColor,
    darkMode,
  });
  const baseShadow = darkMode ? '0 8px 20px rgba(0,0,0,0.12)' : '0 8px 18px rgba(12,15,20,0.10)';
  const cardBoxShadow = glowShadow
    ? `${glowShadow}, ${baseShadow}`
    : baseShadow;

  // ── Pick-only card ──────────────────────────────────────────────────────
  if (!primary && primaryPick) {
    const pickOrdinals = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
    const roundNumber = Number(primaryPick.round);
    const hasRound = Number.isFinite(roundNumber) && roundNumber > 0;
    const roundOrd = hasRound ? (pickOrdinals[roundNumber] ?? `${roundNumber}th`) : null;
    const roundHeroParts = roundOrd?.match(/^(\d+)(\D+)$/);
    const quality = primaryPick.displayQuality ?? primaryPick.quality ?? '';
    const qualityLabel = quality === 'Early' ? 'Early' : quality === 'Mid' ? 'Middle' : quality === 'Late' ? 'Late' : '';
    const r = hasRound ? roundNumber : 1;
    // Dynamic pick range based on league size
    const teamCount = rosters?.length || 12;
    const earlyEnd = Math.floor(teamCount / 3);
    const midEnd = Math.floor((2 * teamCount) / 3);
    const QUALITY_SLOTS = {
      Early: [1, earlyEnd],
      Mid:   [earlyEnd + 1, midEnd],
      Late:  [midEnd + 1, teamCount],
    };
    const slots = QUALITY_SLOTS[quality];
    const pickRange = slots
      ? `${r}.${String(slots[0]).padStart(2, '0')} – ${r}.${String(slots[1]).padStart(2, '0')}`
      : null;
    const cardHeadline = primaryPick.cardHeadline
      ?? (qualityLabel && roundOrd ? `${roundOrd} Round · ${qualityLabel}` : `Round ${primaryPick.round ?? '—'}`);
    const pickMetaLabel = primaryPick.cardMetaLabel ?? (primaryPick.displayMode === 'future' ? null : 'Projected Range');
    const pickMetaValue = primaryPick.pickRangeLabel ?? pickRange;
    const showPickMeta = Boolean(pickMetaLabel && pickMetaValue);
    const compactPickNumberLabel = primaryPick.pickNumberLabel ?? primaryPick.pickRangeLabel ?? null;
    const parsedPickSlot = typeof compactPickNumberLabel === 'string'
      ? Number(compactPickNumberLabel.match(/^\d+\.(\d+)$/)?.[1])
      : null;
    const lockedPickSlot = Number(primaryPick.lockedSlot ?? parsedPickSlot);
    const hasLockedPickSlot = Number.isFinite(lockedPickSlot) && lockedPickSlot > 0;
    const compactRoundLabel = hasRound ? `Round ${roundNumber}` : null;
    const compactPickSlotLabel = hasLockedPickSlot ? `Pick ${lockedPickSlot}` : compactPickNumberLabel;
    const compactPickIdentity = [
      primaryPick.year,
      compactRoundLabel,
      compactPickSlotLabel,
    ].filter(Boolean).join(' · ') || primaryPick.label || 'Draft Pick';

    // Derive color theme: My Team > dark gold > light gold
    const favPalette = favoriteTeam ? teamPalette(favoriteTeam, darkMode) : null;
    const favColor = favPalette?.color ?? null;

    let pt; // pickTheme
    if (favColor) {
      pt = {
        bg: darkMode
          ? `linear-gradient(160deg, ${favColor}cc 0%, ${favColor}55 35%, #141418 70%, #0a0a0c 100%)`
          : `linear-gradient(160deg, ${favColor}55 0%, ${favColor}28 50%, #ffffff 100%)`,
        border: `${favColor}88`,
        watermark: `${favColor}12`,
        yearBg: `${favColor}18`,
        yearBorder: `${favColor}35`,
        divider: `${favColor}88`,
        subLabel: `${favColor}cc`,
        yearText: darkMode ? 'white' : '#0c0f14',
        bannerBg: `linear-gradient(90deg, transparent 0%, ${favColor}22 15%, ${favColor}28 50%, ${favColor}22 85%, transparent 100%)`,
        bannerBorder: `${favColor}44`,
        glassBg: darkMode ? 'rgba(10,10,12,0.65)' : 'rgba(255,255,255,0.65)',
        glassBorder: `${favColor}22`,
        accent: favColor,
        accentMuted: darkMode ? `${favColor}bb` : `${favColor}cc`,
        labelText: darkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)',
      };
    } else if (darkMode) {
      // Stitch-inspired dark gold
      pt = {
        bg: 'linear-gradient(160deg, #1c1508 0%, #141418 45%, #0a0a0c 100%)',
        border: 'rgba(212,175,55,0.45)',
        watermark: 'rgba(212,175,55,0.08)',
        yearBg: 'rgba(212,175,55,0.07)',
        yearBorder: 'rgba(212,175,55,0.2)',
        divider: 'rgba(212,175,55,0.45)',
        subLabel: 'rgba(212,175,55,0.7)',
        yearText: 'white',
        bannerBg: 'linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.1) 15%, rgba(212,175,55,0.14) 50%, rgba(212,175,55,0.1) 85%, transparent 100%)',
        bannerBorder: 'rgba(212,175,55,0.28)',
        glassBg: 'rgba(10,8,2,0.72)',
        glassBorder: 'rgba(212,175,55,0.12)',
        accent: '#D4AF37',
        accentMuted: 'rgba(212,175,55,0.65)',
        labelText: 'rgba(255,255,255,0.82)',
      };
    } else {
      // Light mode: white + deep gold (less yellow, more amber-brown)
      pt = {
        bg: 'linear-gradient(160deg, #fdf6e8 0%, #f0d98a 45%, #e8cc72 75%, #faf4e4 100%)',
        border: 'rgba(148,102,8,0.5)',
        watermark: 'rgba(148,102,8,0.09)',
        yearBg: 'rgba(148,102,8,0.07)',
        yearBorder: 'rgba(148,102,8,0.22)',
        divider: 'rgba(148,102,8,0.45)',
        subLabel: 'rgba(110,72,4,0.7)',
        yearText: '#1c1000',
        bannerBg: 'linear-gradient(90deg, transparent 0%, rgba(148,102,8,0.12) 15%, rgba(148,102,8,0.16) 50%, rgba(148,102,8,0.12) 85%, transparent 100%)',
        bannerBorder: 'rgba(148,102,8,0.3)',
        glassBg: 'rgba(248,238,200,0.82)',
        glassBorder: 'rgba(148,102,8,0.18)',
        accent: '#7a5500',
        accentMuted: 'rgba(110,72,4,0.65)',
        labelText: 'rgba(25,16,0,0.78)',
      };
    }

    return (
        <div
          ref={cardRef}
          className="w-full aspect-[5/7] rounded-xl flex flex-col overflow-hidden relative"
          style={{
            background: compactTradeCard ? 'var(--color-bg-secondary)' : pt.bg,
            border: compactTradeCard ? '0' : `2px solid ${pt.border}`,
            borderLeft: compactTradeCard ? undefined : `4px solid ${pt.accent}`,
            minHeight: !compactTradeCard && forcedHeight ? `${forcedHeight}px` : undefined,
          }}
        >
        <div className="relative w-full overflow-hidden" style={{ flexShrink: 0, height: compactTradeCard ? '50%' : '56%' }}>
          <div className="absolute inset-0" style={{ background: compactTradeCard ? 'var(--color-fill)' : pt.bg }} />
          {compactTradeCard ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-3 py-4 pointer-events-none select-none overflow-hidden">
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(48px, 30%, 78px)',
                  fontWeight: 900,
                  color: 'var(--color-signature)',
                  lineHeight: 0.92,
                  letterSpacing: 0,
                }}
              >
                {roundHeroParts ? (
                  <span className="inline-flex items-start justify-center">
                    <span>{roundHeroParts[1]}</span>
                    <span
                      style={{
                        fontSize: '0.56em',
                        lineHeight: 1,
                        marginLeft: '0.04em',
                        marginTop: '0.08em',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {roundHeroParts[2]}
                    </span>
                  </span>
                ) : (
                  roundOrd ?? '?'
                )}
              </span>
              <span
                className="mt-1 text-center text-[11px] font-bold uppercase leading-none"
                style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.16em' }}
              >
                {primaryPick.year ?? '—'} Pick
              </span>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(150px, 80%, 220px)',
                  fontWeight: 900,
                  color: pt.watermark,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
              >
                {primaryPick.round ?? '?'}
              </span>
            </div>
          )}
          {showSideBadge && (
            <div className="absolute top-1.5 left-1.5 lg:top-2 lg:left-2 z-10">
              <span
                className="text-[8px] lg:text-[10px] font-bold uppercase tracking-widest px-1.5 lg:px-2 py-0.5 lg:py-1 rounded"
                style={{
                  background: darkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)',
                  color: darkMode ? 'white' : '#0c0f14',
                  letterSpacing: '0.08em',
                  border: `1px solid ${pt.border}`,
                  textShadow: darkMode ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                {side === 'give' ? 'Give' : 'Get'}
              </span>
            </div>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
            {!compactTradeCard && (
              <>
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: '10px',
                    fontWeight: 700,
                    color: pt.accentMuted,
                    letterSpacing: '0.35em',
                    textTransform: 'uppercase',
                  }}
                >
                  Draft Pick
                </span>
                <span
                  className="mt-2"
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 'clamp(34px, 4vw, 48px)',
                    fontWeight: 300,
                    color: pt.yearText,
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  {primaryPick.year ?? '—'}
                </span>
              </>
            )}
          </div>
        </div>

        {compactTradeCard ? (
          <div
            className="flex flex-1 flex-col justify-between px-3 pb-3 pt-3 min-h-0"
            style={{ background: 'var(--color-bg-secondary)' }}
          >
            <div className="min-w-0">
              <div
                className="truncate whitespace-nowrap text-left text-base font-bold uppercase leading-none lg:text-[17px] xl:text-lg"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.01em' }}
              >
                {compactPickIdentity}
              </div>
              <div
                className="mt-7 truncate whitespace-nowrap text-left text-[11px] font-bold uppercase leading-none lg:text-[13px] xl:text-sm"
                style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.16em' }}
              >
                Draft Pick
              </div>
            </div>

            <div className="mt-4">
              <div
                className="tabular-nums text-2xl font-bold leading-none"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
              >
                {primaryPick.value != null ? fmtKtcValue(primaryPick.value) : '—'}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-none lg:text-[12px]"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.14em' }}
              >
                Value
              </div>
            </div>
          </div>
        ) : (
        <>
        <div
          className="relative px-2 lg:px-3 py-1 lg:py-1.5 text-center shrink-0"
          style={{
            background: pt.bannerBg,
            borderTop: `1px solid ${pt.bannerBorder}`,
            borderBottom: `1px solid ${pt.bannerBorder}`,
          }}
        >
          <div
            className="text-[11px] lg:text-sm font-bold leading-tight tracking-wide uppercase whitespace-nowrap"
            style={{
              color: pt.yearText,
              textShadow: darkMode ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {cardHeadline}
          </div>
        </div>

        <div className="flex flex-col flex-1 px-2 pb-2 min-h-0 items-center overflow-hidden" style={{ background: pt.glassBg }}>
          <div className="flex items-center justify-center py-1 lg:py-1.5 shrink-0">
            <span
              className="text-sm lg:text-[18px] font-bold tabular-nums leading-tight"
              style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
            >
              {primaryPick.value != null ? fmtKtcValue(primaryPick.value) : '—'}
            </span>
          </div>

          {showPickMeta && (
          <div className={compactTradeCard ? 'hidden' : 'hidden min-[420px]:flex gap-1 w-full lg:hidden min-h-0 overflow-hidden'}>
            <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.22)' }}>
              <span className="text-[7px] font-bold uppercase tracking-wide mb-0.5" style={{ color: pt.accentMuted }}>{pickMetaLabel}</span>
              <span className="text-[9px] font-semibold tabular-nums" style={{ color: pt.labelText }}>
                {pickMetaValue}
              </span>
            </div>
          </div>
          )}

          {showPickMeta && (
          <div className="hidden lg:flex gap-1.5 w-full min-h-0 overflow-hidden">
            <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.22)' }}>
              <span className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: pt.accentMuted }}>{pickMetaLabel}</span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: pt.labelText }}>
                {pickMetaValue}
              </span>
            </div>
          </div>
          )}
        </div>
        </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="w-full aspect-[5/7] rounded-xl flex flex-col overflow-hidden relative"
      style={{
        background: cardBg,
        border: compactTradeCard ? '0' : `2px solid ${cardBorder}`,
        borderLeft: compactTradeCard ? undefined : cardHighlight,
        minHeight: !compactTradeCard && forcedHeight ? `${forcedHeight}px` : undefined,
        cursor: isInteractive ? 'pointer' : undefined,
        boxShadow: cardBoxShadow,
        transition: 'box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onClick={isInteractive ? () => onClick(primary) : undefined}
      {...glowHandlers}
      onFocus={isInteractive ? glowHandlers.onMouseEnter : undefined}
      onBlur={isInteractive ? glowHandlers.onMouseLeave : undefined}
      onKeyDown={isInteractive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(primary);
        }
      } : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? `Open player stats for ${primary.name}` : undefined}
    >
      {/* Mouse-tracking border glow */}
      {borderOverlay}
      {/* ── Photo area (~45% of card height) ──────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ flexShrink: 0, height: compactTradeCard ? '50%' : '56%' }}>
        {/* Background fill + gradient fade (behind the player image) */}
        <div className="absolute inset-0"
          style={{ background: teamGradient ?? (teamColor ? `${teamColor}44` : 'var(--color-fill)') }} />
        {teamGradientOverlay && <div className="absolute inset-0" style={{ background: teamGradientOverlay }} />}
        <div className="absolute inset-0" style={{ background: photoFade }} />

        {primary ? (
          <img
            src={playerImageSrc}
            alt=""
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
            loading="eager"
            decoding="async"
            onError={e => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>📋</span>
            <span className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.5)' }}>Draft Pick</span>
          </div>
        )}

        {/* Give / Get badge — top left */}
        {showSideBadge && (
          <div className="absolute top-1.5 left-1.5 lg:top-2 lg:left-2 z-10">
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-widest px-1.5 lg:px-2 py-0.5 lg:py-1 rounded"
              style={{
                background: 'rgba(0,0,0,0.7)',
                color: sideBadgeForeground,
                letterSpacing: '0.08em',
                border: `1px solid ${teamColor ? `${teamColor}88` : 'rgba(255,255,255,0.2)'}`,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}>
              {side === 'give' ? 'Give' : 'Get'}
            </span>
          </div>
        )}

        {/* Team logo badge — top right */}
        {topRightSlot ? (
          <div className="absolute top-1.5 right-1.5 lg:top-2 lg:right-2 z-10">
            {topRightSlot}
          </div>
        ) : primaryPalette?.logoKey ? (
          <div className="absolute top-1.5 right-1.5 lg:top-2 lg:right-2 z-10">
            <span
              className="w-6 h-6 lg:w-8 lg:h-8 rounded-full flex items-center justify-center"
              style={{
                background: primaryPalette.logoBadgeBg,
                border: `1px solid ${primaryPalette.logoBadgeBorder}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.28)',
              }}
            >
              <img
                src={`https://a.espncdn.com/i/teamlogos/nfl/500/${primaryPalette.logoKey}.png`}
                aria-hidden="true"
                className="pointer-events-none select-none w-4 h-4 lg:w-6 lg:h-6"
                style={{ objectFit: 'contain', opacity: 0.96, filter: darkMode ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }}
                loading="eager"
                decoding="async"
                onError={e => { e.target.style.display = 'none'; }}
              />
            </span>
          </div>
        ) : null}
      </div>

      {compactTradeCard && primary ? (
        <div
          className="flex flex-1 flex-col justify-between px-3 pb-3 pt-3 min-h-0"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
            <div className="min-w-0">
              <div
                className="truncate whitespace-nowrap text-left text-base font-bold uppercase leading-none lg:text-[17px] xl:text-lg"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.01em' }}
              >
                {primary.name}
              </div>
              <div
                className="mt-1 truncate whitespace-nowrap text-left text-[11px] font-bold uppercase leading-none lg:text-[13px] xl:text-sm"
                style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}
              >
                {primary.rank?.posLabel ? `${primary.rank.posLabel}${primary.rank.rank}` : [primary.team, primary.position].filter(Boolean).join(' · ')}
              </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div
                className="tabular-nums text-2xl font-bold leading-none"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
              >
                {primary.value != null ? fmtKtcValue(primary.value) : '—'}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-none lg:text-[12px]"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.14em' }}
              >
                Value
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="tabular-nums text-2xl font-bold leading-none"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
              >
                {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-none lg:text-[12px]"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.14em' }}
              >
                PPG
              </div>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* ── Name banner ──────────────────────────────────────── */}
      <div className="relative px-2 lg:px-3 py-1 lg:py-1.5 text-center shrink-0"
        style={{
          background: darkMode
            ? 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.58) 15%, rgba(0,0,0,0.66) 50%, rgba(0,0,0,0.58) 85%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(12,15,20,0.58) 15%, rgba(12,15,20,0.66) 50%, rgba(12,15,20,0.58) 85%, transparent 100%)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
        <div className="text-[11px] lg:text-[15px] xl:text-base font-bold leading-tight tracking-wide uppercase whitespace-nowrap"
          style={{ color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.6)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {primary?.name ?? primaryPick?.label ?? '—'}
        </div>
        {primary && (
          <div className="text-[8px] lg:text-[12px] xl:text-[13px] font-medium tracking-wider uppercase mt-0.5 whitespace-nowrap"
            style={{ color: 'rgba(255,255,255,0.55)' }}>
            {[primary.team, primary.position].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* ── Card details ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 px-2 pb-2 min-h-0 items-center overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.25)' }}>

        {/* ── Featured trade value ─── */}
        {primary?.value != null && (
          <div className="flex items-center justify-center py-1 lg:py-1.5 shrink-0">
            <span className="text-sm lg:text-[18px] font-bold tabular-nums leading-tight"
              style={{ color: 'var(--color-label)' }}>
              {fmtKtcValue(primary.value)}
            </span>
          </div>
        )}

        {primary ? (
          <>
            {/* ── MOBILE stat boxes (lg:hidden) ─── */}
            <div className="flex flex-1 min-h-0 gap-1 w-full lg:hidden overflow-hidden">
              <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                {primary?.ppg > 0 ? (
                  <>
                    <span className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: 'white' }}>
                      {primary.ppg.toFixed(1)}
                    </span>
                    <span className="text-[7px] font-medium leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>PPG</span>
                  </>
                ) : (
                  <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>
                )}
              </div>
              {primary?.rank?.posLabel && (
                <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                  <span className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {primary.rank.posLabel}{primary.rank.rank}
                  </span>
                  <span className="text-[7px] font-medium leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>Rank</span>
                </div>
              )}
            </div>

            {/* ── DESKTOP stat boxes (hidden lg:flex) ─── */}
            <div className="hidden lg:flex flex-1 min-h-0 gap-1.5 w-full overflow-hidden">
              {compactTradeCard ? (
                <>
                  <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <span className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'white' }}>
                      {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
                    </span>
                    <span className="text-[8px] lg:text-[10px] font-medium leading-tight uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.52)' }}>PPG</span>
                  </div>
                  <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <span className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
                      {primary.rank?.posLabel ? `${primary.rank.posLabel}${primary.rank.rank}` : '—'}
                    </span>
                    <span className="text-[8px] lg:text-[10px] font-medium leading-tight uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.52)' }}>Rank</span>
                  </div>
                </>
              ) : (
              <>
              {/* Left: Game Stats */}
              <div className="flex-1 rounded-lg p-2 flex flex-col gap-0.5" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Figtree', sans-serif" }}
                >
                  Stats
                </span>
                {visibleStatDefs.length > 0 && playerStats ? (
                  visibleStatDefs.map(sd => (
                    <div key={sd.key} className="flex justify-between items-baseline">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {sd.label}
                      </span>
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: 'white', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {fmtStat(playerStats[sd.key])}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Figtree', sans-serif" }}>—</span>
                )}
              </div>

              {/* Right: Fantasy Stats */}
              <div className="flex-1 rounded-lg p-2 flex flex-col gap-0.5" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Figtree', sans-serif" }}
                >
                  Fantasy
                </span>
                {primary ? (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                      >
                        PPG
                      </span>
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: 'white', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
                      </span>
                    </div>
                    {primary.rank?.posLabel && (
                      <div className="flex justify-between items-baseline">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                        >
                          Rank
                        </span>
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'rgba(255,255,255,0.9)', fontFamily: "'Figtree', sans-serif" }}
                        >
                          {primary.rank.posLabel}{primary.rank.rank}
                        </span>
                      </div>
                    )}
                    {!compactTradeCard && primary.seasonPts > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                        >
                          Season
                        </span>
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'white', fontFamily: "'Figtree', sans-serif" }}
                        >
                          {primary.seasonPts.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Figtree', sans-serif" }}>—</span>
                )}
              </div>
              </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 w-full" aria-hidden="true" />
        )}
      </div>
      </>
      )}
    </div>
  );
}
