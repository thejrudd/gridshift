/* eslint-disable react-hooks/static-components */
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { fmtKtcValue } from '../../../utils/ktcApi';
import { getPicksForRoster } from '../../../utils/tradeEngine';
import CompanionAssetRow from '../CompanionAssetRow.jsx';
import { CompanionSelectorButton, CompanionSelectorRail } from '../CompanionSelectorControls.jsx';
import Spinner from './Spinner';
import {
  POSITION_COLORS,
} from './tradeUiHelpers';

const TRADE_LOGO_SIDE_THEME_OPTIONS = { logoSide: 'end' };

function getTradeAssetMetaSegments(item) {
  if (item.type === 'pick') {
    const segments = [
      item.year,
      item.round != null ? `Round ${item.round}` : null,
      item.pickNumberLabel ?? item.pickRangeLabel,
      item.quality,
    ];
    if (item.cardMetaLabel && item.pickRangeLabel && item.cardMetaLabel !== item.pickRangeLabel) {
      segments.push(`${item.cardMetaLabel}: ${item.pickRangeLabel}`);
    }
    return segments.filter(Boolean);
  }

  const segments = [
    [item.position, item.team].filter(Boolean).join(' · '),
    item.rankInfo ? `#${item.rankInfo.rank} ${item.rankInfo.posLabel}` : null,
    item.avgPPG != null ? `${item.avgPPG.toFixed(1)} avg` : null,
    item.dynastyFallback ? 'DYN est.' : item.idpFallback ? 'est.' : null,
  ];
  return segments.filter(Boolean);
}


function TradeSideAssetRow({ item, darkMode, onOpenPlayer, onRemove }) {
  const isInteractive = item.type === 'player' && !!onOpenPlayer;
  const metaSegments = getTradeAssetMetaSegments(item);
  const value = item.adjVal ?? item.val;
  const valueIsEstimated = item.dynastyFallback || item.idpFallback;
  const valueKicker = item.type === 'player' && item.avgPPG != null ? `${item.avgPPG.toFixed(1)} avg` : 'Value';

  return (
    <CompanionAssetRow
      asset={item}
      darkMode={darkMode}
      selected
      showSelectionMark
      teamThemeOptions={TRADE_LOGO_SIDE_THEME_OPTIONS}
      interactive={isInteractive}
      dataTestId={`trade-side-asset-${item.type}-${item.id}`}
      metaPrefix={item.type === 'pick' ? 'Draft Pick' : ''}
      metaSegments={metaSegments}
      valueKicker={valueKicker}
      valueLabel={`${valueIsEstimated ? '~' : ''}${fmtKtcValue(value)}`}
      valueTitle={item.idpFallback ? 'Estimated from season production (no KTC data)' : undefined}
      onClick={isInteractive ? onOpenPlayer : null}
      onRemove={onRemove}
      removeLabel={`Remove ${item.label}`}
      loading="eager"
      ariaLabel={isInteractive ? `Open player stats for ${item.label}` : undefined}
    />
  );
}

// ── getColorCommentary ─────────────────────────────────────────────────────────
// ── ShelfPartnerTab ────────────────────────────────────────────────────────────
function ShelfPartnerTab({ partnerRosters, value, onChange, label, active, disabled, onActivate, buttonStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = partnerRosters.find(r => r.roster.roster_id === value) ?? null;

  const Avatar = ({ hash, name, size = 22 }) => hash ? (
    <img src={`https://sleepercdn.com/avatars/thumbs/${hash}`} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={e => { e.target.style.display = 'none'; }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--color-fill-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontWeight: 700, color: 'var(--color-label-secondary)', flexShrink: 0 }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );

  return (
      <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => {
            if (!disabled) setOpen(v => !v);
          }}
          style={{
            ...buttonStyle,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {selected ? (
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.displayName}
              </span>
          ) : (
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || 'Select Partner'}</span>
          )}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={active ? 'currentColor' : 'var(--color-label-tertiary)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 50,
            width: 280, maxWidth: 'calc(100vw - 28px)',
            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
          }}>
            {/* Clear option */}
            {value && (
              <button
                onClick={() => { onChange(null); onActivate?.(); setOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'transparent', border: 0, borderBottom: '1px solid var(--color-separator)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--color-separator)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-label-tertiary)', fontFamily: df, letterSpacing: '0.06em' }}>CLEAR PARTNER</span>
              </button>
            )}
            {partnerRosters.map(({ roster, displayName, avatarHash }) => {
              const isSelected = roster.roster_id === value;
              return (
                <button
                  key={roster.roster_id}
                  onClick={() => { onChange(roster.roster_id); onActivate?.(); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                    background: isSelected ? 'var(--color-fill)' : 'transparent',
                    border: 0, borderBottom: '1px solid var(--color-separator)', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-fill-secondary)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Avatar hash={avatarHash} name={displayName} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--color-label)' : 'var(--color-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-signature)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
  );
}

function getColorCommentary(verdict, gap, partnerName) {
  if (!gap) return null;
  const pn = partnerName || 'your partner';
  const stablePick = (arr) => {
    const key = `${verdict}:${Math.round(gap / 25)}:${pn}`;
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return arr[Math.abs(hash) % arr.length];
  };

  if (verdict === 'fair') return stablePick([
    `Straight swap — values are close. Pull the trigger.`,
    `Both sides are roughly even. Hard to argue either way.`,
    `Balanced deal. If both managers like it, there's no wrong answer.`,
    `Numbers say this is fair. Now it comes down to fit.`,
    `Close enough to call it even. League won't bat an eye.`,
    `This one's a wash on paper. Go with your gut.`,
    `Fairly valued on both sides. The tiebreaker is roster need.`,
    `Value neutral. If you want the players, do it.`,
  ]);

  if (verdict === 'favors_you') return stablePick([
    `You're getting the better end here. ${pn} might push back.`,
    `The value tilts your way. Don't be surprised if ${pn} counters.`,
    `You're winning this trade on paper. ${pn} may want something added.`,
    `Looks good for you. ${pn} is leaving some value on the table.`,
    `Smart get — you're coming out ahead. See if ${pn} bites.`,
    `The numbers favor you. Send it before they change their mind.`,
    `You're extracting more than you're giving up here.`,
    `${pn} is undervaluing their side. Take advantage if they're willing.`,
    `Nice return for you. ${pn} may be overrating what they're getting.`,
    `Favorable gap. If ${pn} accepts as-is, that's a win for your roster.`,
  ]);

  if (verdict === 'favors_them') return stablePick([
    `You're giving up more than you're getting. Try sweetening your side.`,
    `The value gap goes ${pn}'s way. Adjust the package before sending.`,
    `You're overpaying here. Consider trimming their side or adding from yours.`,
    `${pn} is getting the better end. Think about what you could pull back.`,
    `This deal currently favors ${pn}. Rebalance before you lock it in.`,
    `You're leaving value on the table. Don't finalize without tweaking.`,
    `The numbers say you're giving up too much. Revisit the terms.`,
    `${pn} comes out ahead on this one. Worth renegotiating.`,
    `Losing trade as constructed. Either add to your return or trim the cost.`,
    `Gap isn't in your favor. See if ${pn} will accept less from you.`,
  ]);

  return null;
}

// ── BroadcastScoreboard ────────────────────────────────────────────────────────
function BroadcastScoreboard({ yourTotal, theirTotal, yourName, yourAvatar, partnerName, partnerAvatar, verdict, hasItems, onClear }) {
  const { verdict: v, pct = 0, gap = 0 } = verdict;
  const sign = v === 'favors_you' ? 1 : v === 'favors_them' ? -1 : 0;
  const angleDeg = hasItems ? sign * Math.min((pct / 100) * 72, 72) : 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 110; const cy = 112;
  const needleX = cx + 66 * Math.sin(angleRad);
  const needleY = cy - 66 * Math.cos(angleRad);
  const arcLen = 260;
  const amberLen = Math.max(0, Math.min(((90 + angleDeg) / 180) * arcLen, arcLen));
  const verdictText = !hasItems
    ? 'Build Trade'
    : v === 'fair'
      ? 'Fair Deal'
      : v === 'favors_you'
        ? 'Favors You'
        : 'Favors Them';
  const verdictFill = !hasItems ? 'rgba(255,255,255,0.52)' : v === 'fair' ? '#F5B700' : v === 'favors_you' ? '#22c55e' : '#ef4444';
  const detailText = !hasItems
    ? 'Add players or picks to compare values'
    : v === 'fair'
      ? 'Trade values are balanced'
      : `${fmtKtcValue(gap)} gap · ${pct}% ${v === 'favors_you' ? 'your way' : 'their way'}`;
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";
  const ticks = [-64, 0, 64].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x1: cx + 76 * Math.sin(rad),
      y1: cy - 76 * Math.cos(rad),
      x2: cx + 83 * Math.sin(rad),
      y2: cy - 83 * Math.cos(rad),
      emphasis: deg === 0,
    };
  });
  const Avatar = ({ hash, name, align = 'left' }) => hash ? (
    <img
      src={`https://sleepercdn.com/avatars/thumbs/${hash}`}
      alt=""
      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.18)' }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  ) : (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {(name || (align === 'right' ? 'P' : 'Y'))[0]?.toUpperCase()}
    </div>
  );
  const TeamBlock = ({ name, total, avatar, align = 'left' }) => (
    <div className={`trade-scoreboard__team trade-scoreboard__team--${align}`} style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: 10, minWidth: 0 }}>
      {align === 'left' && <Avatar hash={avatar} name={name} align={align} />}
      <div className="trade-scoreboard__team-copy" style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2, minWidth: 0, textAlign: align === 'right' ? 'right' : 'left' }}>
        <span className="trade-scoreboard__team-name" style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.1, color: 'rgba(255,255,255,0.78)', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span className="trade-scoreboard__team-total" style={{ fontFamily: df, fontWeight: 800, fontSize: 40, lineHeight: 0.92, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: '#fff' }}>
          {hasItems ? fmtKtcValue(total) : '0'}
        </span>
      </div>
      {align === 'right' && <Avatar hash={avatar} name={name} align={align} />}
    </div>
  );

  return (
    <div className="trade-scoreboard" style={{ background: '#0D1117', color: 'white', padding: '8px 20px 12px', flexShrink: 0, position: 'relative' }}>
      <div style={{ minHeight: 24, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        {hasItems ? (
          <button onClick={onClear} style={{ fontFamily: df, fontSize: 11, letterSpacing: '0.12em', color: '#F5B700', background: 'none', border: 0, cursor: 'pointer', fontWeight: 700, padding: '4px 0', textTransform: 'uppercase' }}>
            CLEAR
          </button>
        ) : <span aria-hidden="true" />}
      </div>
      <div className="trade-scoreboard__grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 24, alignItems: 'center' }}>
        <TeamBlock name={yourName || 'You'} total={yourTotal} avatar={yourAvatar} />
        <div className="trade-scoreboard__meter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <div className="trade-scoreboard__verdict" style={{ textAlign: 'center', marginBottom: -8, minHeight: 34 }}>
            <div className="trade-scoreboard__verdict-title" style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 800, fontSize: 15, lineHeight: 1.1, color: verdictFill }}>
              {verdictText}
            </div>
            <div className="trade-scoreboard__verdict-detail" style={{ marginTop: 3, fontFamily: "'Figtree', sans-serif", fontWeight: 600, fontSize: 11, lineHeight: 1.1, color: 'rgba(255,255,255,0.68)' }}>
              {detailText}
            </div>
          </div>
          <svg className="trade-scoreboard__svg" width="220" height="112" viewBox="0 0 220 112" style={{ overflow: 'visible', display: 'block' }}>
            <path d="M 26 112 A 84 84 0 0 1 194 112" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" strokeLinecap="round"/>
            <path d="M 26 112 A 84 84 0 0 1 194 112" fill="none" stroke="#F5B700" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${amberLen} ${arcLen}`}/>
            {ticks.map((tick, index) => (
              <line
                key={index}
                x1={tick.x1.toFixed(2)}
                y1={tick.y1.toFixed(2)}
                x2={tick.x2.toFixed(2)}
                y2={tick.y2.toFixed(2)}
                stroke={tick.emphasis ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.46)'}
                strokeWidth={tick.emphasis ? 2.4 : 1.6}
                strokeLinecap="round"
              />
            ))}
            <line x1={cx} y1={cy} x2={needleX.toFixed(2)} y2={needleY.toFixed(2)} stroke="white" strokeWidth="3.8" strokeLinecap="round"/>
            <circle cx={cx} cy={cy} r="7" fill="#F5B700" stroke="rgba(0,0,0,0.65)" strokeWidth="2.5"/>
          </svg>
        </div>
        <TeamBlock name={partnerName || 'Select Partner'} total={theirTotal} avatar={partnerAvatar} align="right" />
      </div>
    </div>
  );
}

// ── TradePlate ─────────────────────────────────────────────────────────────────
function TradePlate({ side, items, onRemovePlayer, onRemovePick, onAddPlayer, onAddPick, onOpenPlayer, shelfDragRef, onDropFromShelf }) {
  const { darkMode } = useTheme();
  // null | 'valid' | 'invalid'
  const [dragState, setDragState] = useState(null);
  const isYours = side === 'yours';
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";

  const dragBg = dragState === 'valid'
    ? 'rgba(34,197,94,0.08)'
    : dragState === 'invalid'
      ? 'rgba(239,68,68,0.08)'
      : undefined;
  const dragOutline = dragState === 'valid'
    ? '2px solid #22c55e'
    : dragState === 'invalid'
      ? '2px solid #ef4444'
      : undefined;

  return (
    <div
      className="trade-plate flex flex-col gap-2"
      data-testid={`trade-plate-${side}`}
      onDragOver={e => {
        e.preventDefault();
        const drag = shelfDragRef?.current;
        if (!drag) return;
        setDragState(drag.shelfTab === side ? 'valid' : 'invalid');
      }}
      onDragLeave={() => setDragState(null)}
      onDrop={e => {
        e.preventDefault();
        setDragState(null);
        const drag = shelfDragRef?.current;
        if (!drag) return;
        if (drag.shelfTab !== side) {
          // Wrong side — reject silently
          shelfDragRef.current = null;
          return;
        }
        onDropFromShelf?.(drag);
        shelfDragRef.current = null;
      }}
      style={{
        padding: '12px 14px 14px',
        borderTop: '1px solid var(--color-separator)',
        borderRight: isYours ? '1px solid var(--color-separator)' : undefined,
        background: dragBg,
        minHeight: 120,
        minWidth: 0,
        overflow: 'hidden',
        transition: 'background 100ms, outline 100ms',
        outline: dragOutline,
        outlineOffset: -2,
      }}
    >
      {items.map((item) => (
        <TradeSideAssetRow key={item.id} item={item} darkMode={darkMode} onOpenPlayer={onOpenPlayer} onRemove={() => item.type === 'player' ? onRemovePlayer(item.id) : onRemovePick(item.id)} />
      ))}
      {items.length === 0 && (
        <div
          className="hidden lg:flex flex-1 min-h-[92px] items-center justify-center text-center rounded-lg"
          style={{
            border: '1px dashed var(--color-separator)',
            color: dragState === 'valid' ? '#22c55e' : 'var(--color-label-quaternary)',
            background: dragState === 'valid' ? 'rgba(34,197,94,0.06)' : 'transparent',
            fontFamily: df,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <span>
            {dragState === 'valid'
              ? 'Drop here to add'
              : dragState === 'invalid'
                ? 'Wrong side'
                : 'Drop here from shelf'}
            {!dragState && (
              <span style={{ display: 'block', marginTop: 4, fontFamily: "'Figtree', sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--color-label-quaternary)' }}>
                {onAddPick ? 'or use + Player / + Pick' : 'or use + Player'}
              </span>
            )}
          </span>
        </div>
      )}
      <div className="flex gap-1.5" style={{ marginTop: items.length ? 4 : 0 }}>
        <button onClick={onAddPlayer} className="flex-1 py-2.5 rounded-lg font-medium"
          data-testid={`trade-plate-${side}-add-player`}
          style={{ fontSize: 13, border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)', background: 'transparent', cursor: 'pointer' }}>
          + Player
        </button>
        {onAddPick && (
          <button onClick={onAddPick} className="flex-1 py-2.5 rounded-lg font-medium"
            data-testid={`trade-plate-${side}-add-pick`}
            style={{ fontSize: 13, border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)', background: 'transparent', cursor: 'pointer' }}>
            + Pick
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shelf helpers ──────────────────────────────────────────────────────────────
const SHELF_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'IDP'];
const IDP_POSITIONS = new Set(['DE', 'DT', 'DL', 'LB', 'ILB', 'OLB', 'CB', 'S', 'SS', 'FS', 'DB', 'EDG', 'EDGE']);
function matchesShelfFilter(pos, posFilter) {
  if (posFilter === 'ALL') return true;
  if (posFilter === 'IDP') return IDP_POSITIONS.has(pos);
  return pos === posFilter;
}

function shelfPlayerName(player) {
  return player?.full_name
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || 'Player';
}

// ── RosterShelf ────────────────────────────────────────────────────────────────
function RosterShelf({
  myPlayers, partnerPlayers, yourTradePlayers, theirTradePlayers,
  sleeperPlayers, playerTradeValueMap, myName, partnerName, hasPartner,
  onAddToYours, onAddToTheirs,
  rosterPicks, slots, myRosterId, partnerRosterId: shelfPartnerRosterId,
  yourTradePicks, theirTradePicks, onAddPickToYours, onAddPickToTheirs,
  shelfDragRef, partnerRosters, onPartnerChange, picksEnabled = true,
}) {
  const [activeTab, setActiveTab] = useState('yours');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showPicks, setShowPicks] = useState(false);
  useEffect(() => {
    if (!picksEnabled) setShowPicks(false);
  }, [picksEnabled]);
  const roster = activeTab === 'yours' ? myPlayers : partnerPlayers;
  const inTradePlayers = activeTab === 'yours' ? yourTradePlayers : theirTradePlayers;
  const inTradePickKeys = new Set(
    (activeTab === 'yours' ? yourTradePicks : theirTradePicks).map(p => p.key)
  );

  const filteredPlayers = (roster ?? [])
    .filter(id => {
      const p = sleeperPlayers?.[id];
      return p && matchesShelfFilter(p.position, posFilter);
    })
    .sort((a, b) => (playerTradeValueMap?.get(b) ?? 0) - (playerTradeValueMap?.get(a) ?? 0));

  const rosterId = activeTab === 'yours' ? myRosterId : shelfPartnerRosterId;
  const shelfPicks = (picksEnabled && rosterPicks && slots && rosterId)
    ? (getPicksForRoster(rosterId, rosterPicks, slots) ?? [])
    : [];

  const handleDragStart = (type, id, pickData) => {
    if (shelfDragRef) shelfDragRef.current = { type, id, shelfTab: activeTab, pickData };
  };

  const tabButtonStyle = isActive => ({
    flex: 1,
    padding: '9px 4px',
    background: 'transparent',
    border: 0,
    borderBottom: `2.5px solid ${isActive ? 'var(--color-signature)' : 'transparent'}`,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0,
    color: isActive ? 'var(--color-label)' : 'var(--color-label-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });

  return (
    <div data-testid="trade-roster-shelf-desktop" style={{ width: 'clamp(300px, 24vw, 340px)', flexShrink: 0, borderRight: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, maxHeight: '100vh', alignSelf: 'flex-start', overflow: 'visible' }}>
      {/* YOU / PARTNER tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-separator)', position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 2 }}>
        <button onClick={() => setActiveTab('yours')}
          data-testid="trade-shelf-tab-yours"
          style={{ ...tabButtonStyle(activeTab === 'yours'), cursor: 'pointer' }}>
          {myName || 'YOU'}
        </button>
        <ShelfPartnerTab
          partnerRosters={partnerRosters}
          value={shelfPartnerRosterId}
          onChange={onPartnerChange}
          label={partnerName || 'Select Partner'}
          active={activeTab === 'theirs'}
          disabled={false}
          onActivate={() => setActiveTab('theirs')}
          buttonStyle={tabButtonStyle(activeTab === 'theirs')}
        />
      </div>
      {/* Filter chips */}
      <div style={{ padding: '7px 10px', position: 'sticky', top: 38, background: 'var(--color-bg-secondary)', zIndex: 1, borderBottom: '1px solid var(--color-separator)' }}>
        <CompanionSelectorRail ariaLabel="Trade shelf filters">
          {SHELF_POSITIONS.map(pos => (
            <CompanionSelectorButton key={pos} size="xs" active={!showPicks && posFilter === pos} onClick={() => { setShowPicks(false); setPosFilter(pos); }}>
              {pos}
            </CompanionSelectorButton>
          ))}
          {picksEnabled && (
            <CompanionSelectorButton size="xs" active={showPicks} onClick={() => setShowPicks(true)} data-testid="trade-shelf-filter-picks">
              PICKS
            </CompanionSelectorButton>
          )}
        </CompanionSelectorRail>
      </div>
      {/* List */}
      <div style={{ flex: 1, minHeight: 0, padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
        {showPicks ? (
          shelfPicks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12, color: 'var(--color-label-quaternary)' }}>
              {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No picks'}
            </div>
          ) : shelfPicks.map(pick => {
            const inTrade = inTradePickKeys.has(pick.key);
            const label = `${pick.year ?? ''} · Rd ${pick.round}`;
            return (
              <button key={pick.key}
                data-testid={`trade-shelf-${activeTab}-pick-${pick.key}`}
                draggable={!inTrade}
                onDragStart={() => handleDragStart('pick', pick.key, pick)}
                onClick={() => !inTrade && (activeTab === 'yours' ? onAddPickToYours(pick) : onAddPickToTheirs(pick))}
                disabled={inTrade}
                className="group"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, border: inTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: inTrade ? 0.35 : 1, cursor: inTrade ? 'default' : 'grab', textAlign: 'left', width: '100%' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: 'rgba(245,183,0,0.12)', color: '#F5B700', flexShrink: 0, letterSpacing: '0.04em' }}>PICK</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {!inTrade && (
                  <span className="hidden lg:inline-flex opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-signature)', flexShrink: 0 }}>ADD</span>
                )}
                {inTrade && (
                  <span className="hidden lg:inline-flex" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-label-quaternary)', flexShrink: 0 }}>ADDED</span>
                )}
              </button>
            );
          })
        ) : filteredPlayers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12, color: 'var(--color-label-quaternary)' }}>
            {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No players'}
          </div>
        ) : filteredPlayers.map(id => {
          const p = sleeperPlayers?.[id];
          if (!p) return null;
          const val = playerTradeValueMap?.get(id);
          const isInTrade = inTradePlayers.includes(id);
          const pos = p.position;
          const posColor = POSITION_COLORS[pos];
          return (
            <button key={id}
              data-testid={`trade-shelf-${activeTab}-player-${id}`}
              draggable={!isInTrade}
              onDragStart={() => handleDragStart('player', id, null)}
              onClick={() => !isInTrade && (activeTab === 'yours' ? onAddToYours(id) : onAddToTheirs(id))}
              disabled={isInTrade}
              className="group"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, border: isInTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: isInTrade ? 0.35 : 1, cursor: isInTrade ? 'default' : 'grab', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: posColor ? `${posColor}22` : 'var(--color-fill)', color: posColor ?? 'var(--color-label-tertiary)', flexShrink: 0, letterSpacing: '0.04em' }}>{pos}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shelfPlayerName(p)}
              </span>
              {val != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtKtcValue(val)}</span>
              )}
              {!isInTrade && (
                <span className="hidden lg:inline-flex opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-signature)', flexShrink: 0 }}>ADD</span>
              )}
              {isInTrade && (
                <span className="hidden lg:inline-flex" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-label-quaternary)', flexShrink: 0 }}>ADDED</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── MobileRosterShelf ──────────────────────────────────────────────────────────
function MobileRosterShelf({
  myPlayers, partnerPlayers, yourTradePlayers, theirTradePlayers,
  sleeperPlayers, playerTradeValueMap, myName, partnerName, hasPartner,
  onAddToYours, onAddToTheirs,
  rosterPicks, slots, myRosterId, partnerRosterId: shelfPartnerRosterId,
  yourTradePicks, theirTradePicks, onAddPickToYours, onAddPickToTheirs,
  partnerRosters, onPartnerChange, picksEnabled = true,
}) {
  const [activeTab, setActiveTab] = useState('yours');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showPicks, setShowPicks] = useState(false);
  useEffect(() => {
    if (!picksEnabled) setShowPicks(false);
  }, [picksEnabled]);
  const roster = activeTab === 'yours' ? myPlayers : partnerPlayers;
  const inTradePlayers = activeTab === 'yours' ? yourTradePlayers : theirTradePlayers;
  const inTradePickKeys = new Set(
    (activeTab === 'yours' ? yourTradePicks : theirTradePicks).map(p => p.key)
  );

  const filteredPlayers = (roster ?? [])
    .filter(id => {
      const p = sleeperPlayers?.[id];
      return p && matchesShelfFilter(p.position, posFilter);
    })
    .sort((a, b) => (playerTradeValueMap?.get(b) ?? 0) - (playerTradeValueMap?.get(a) ?? 0));

  const rosterId = activeTab === 'yours' ? myRosterId : shelfPartnerRosterId;
  const shelfPicks = (picksEnabled && rosterPicks && slots && rosterId)
    ? (getPicksForRoster(rosterId, rosterPicks, slots) ?? [])
    : [];

  const tabButtonStyle = isActive => ({
    flex: 1,
    padding: '7px 10px',
    borderRadius: 10,
    background: isActive ? 'var(--color-signature)' : 'var(--color-fill)',
    color: isActive ? 'var(--color-signature-fg)' : 'var(--color-label-tertiary)',
    border: '1px solid var(--color-separator)',
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0,
    textTransform: 'none',
    minHeight: 36,
  });

  return (
    <div data-testid="trade-roster-shelf-mobile" style={{ borderTop: '1.5px solid var(--color-separator)', background: 'var(--color-bg-secondary)', marginTop: 8 }}>
      {/* Team tabs */}
      <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-separator)' }}>
        <button onClick={() => setActiveTab('yours')}
          data-testid="trade-shelf-tab-yours"
          style={{ ...tabButtonStyle(activeTab === 'yours'), cursor: 'pointer' }}>
          {myName || 'YOU'}
        </button>
        <ShelfPartnerTab
          partnerRosters={partnerRosters}
          value={shelfPartnerRosterId}
          onChange={onPartnerChange}
          label={partnerName || 'Select Partner'}
          active={activeTab === 'theirs'}
          disabled={false}
          onActivate={() => setActiveTab('theirs')}
          buttonStyle={tabButtonStyle(activeTab === 'theirs')}
        />
      </div>
      {/* Filter chips */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-separator)' }}>
        <CompanionSelectorRail ariaLabel="Trade shelf filters" wrapOnDesktop={false}>
          {SHELF_POSITIONS.map(pos => (
            <CompanionSelectorButton key={pos} size="sm" active={!showPicks && posFilter === pos} onClick={() => { setShowPicks(false); setPosFilter(pos); }}>
              {pos}
            </CompanionSelectorButton>
          ))}
          {picksEnabled && (
            <CompanionSelectorButton size="sm" active={showPicks} onClick={() => setShowPicks(true)} data-testid="trade-shelf-filter-picks">
              PICKS
            </CompanionSelectorButton>
          )}
        </CompanionSelectorRail>
      </div>
      {/* Vertical player/pick list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 14px 12px', maxHeight: 280, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {showPicks ? (
          shelfPicks.length === 0 ? (
            <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-label-quaternary)', textAlign: 'center' }}>
              {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No picks'}
            </div>
          ) : shelfPicks.map(pick => {
            const inTrade = inTradePickKeys.has(pick.key);
            const label = `${pick.year ?? ''} · Rd ${pick.round}`;
            return (
              <button key={pick.key}
                data-testid={`trade-shelf-${activeTab}-pick-${pick.key}`}
                onClick={() => !inTrade && (activeTab === 'yours' ? onAddPickToYours(pick) : onAddPickToTheirs(pick))}
                disabled={inTrade}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: inTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: inTrade ? 0.4 : 1, cursor: inTrade ? 'default' : 'pointer', textAlign: 'left', width: '100%', minHeight: 44 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,183,0,0.12)', color: '#F5B700', flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em' }}>PICK</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-label)' }}>{label}</span>
              </button>
            );
          })
        ) : filteredPlayers.length === 0 ? (
          <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-label-quaternary)', textAlign: 'center' }}>
            {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No players'}
          </div>
        ) : filteredPlayers.map(id => {
          const p = sleeperPlayers?.[id];
          if (!p) return null;
          const val = playerTradeValueMap?.get(id);
          const isInTrade = inTradePlayers.includes(id);
          const pos = p.position;
          const posColor = POSITION_COLORS[pos];
          return (
            <button key={id}
              data-testid={`trade-shelf-${activeTab}-player-${id}`}
              onClick={() => !isInTrade && (activeTab === 'yours' ? onAddToYours(id) : onAddToTheirs(id))}
              disabled={isInTrade}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: isInTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: isInTrade ? 0.4 : 1, cursor: isInTrade ? 'default' : 'pointer', textAlign: 'left', width: '100%', minHeight: 44 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: posColor ? `${posColor}22` : 'var(--color-fill)', color: posColor ?? 'var(--color-label-tertiary)', flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em' }}>{pos}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shelfPlayerName(p)}
              </span>
              {val != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtKtcValue(val)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


export default function TradeProposalBuilder({
  addPlayer,
  partnerRosterId,
  addPick,
  myRosterData,
  rosterById,
  yourPlayers,
  theirPlayers,
  sleeperPlayers,
  playerTradeValueMap,
  getUserDisplayName,
  ownerNameByRosterId,
  rosterPicks,
  slots,
  picksEnabled = true,
  yourPicks,
  theirPicks,
  league,
  leagueUserById,
  partnerRosters,
  switchPartnerTradeContext,
  shelfDragRef,
  hasItems,
  verdict,
  handleSuggest,
  suggestions,
  applySuggestion,
  yourSide,
  theirSide,
  ktcLoading,
  ktcError,
  removePlayer,
  removePick,
  setPickerOpen,
  openStatsModalForPlayer,
  clearTrade,
}) {
            const handleShelfDrop = drag => {
              if (!drag) return;
              if (drag.type === 'player') {
                if (drag.shelfTab === 'yours') addPlayer('yours', drag.id);
                else if (partnerRosterId) addPlayer('theirs', { id: drag.id, rosterId: partnerRosterId });
              } else if (picksEnabled && drag.type === 'pick' && drag.pickData) {
                if (drag.shelfTab === 'yours') addPick('yours', drag.pickData);
                else addPick('theirs', drag.pickData);
              }
            };
            const sharedShelfProps = {
              myPlayers: myRosterData?.players ?? [],
              partnerPlayers: partnerRosterId ? (rosterById.get(partnerRosterId)?.players ?? []) : [],
              yourTradePlayers: yourPlayers,
              theirTradePlayers: theirPlayers,
              sleeperPlayers,
              playerTradeValueMap,
              myName: getUserDisplayName(myRosterData?.owner_id ?? ''),
              partnerName: partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? 'Select Partner') : 'Select Partner',
              hasPartner: !!partnerRosterId,
              onAddToYours: id => addPlayer('yours', id),
              onAddToTheirs: id => partnerRosterId ? addPlayer('theirs', { id, rosterId: partnerRosterId }) : null,
              rosterPicks,
              slots,
              picksEnabled,
              myRosterId: myRosterData?.roster_id,
              partnerRosterId,
              yourTradePicks: yourPicks,
              theirTradePicks: theirPicks,
              onAddPickToYours: picksEnabled ? (pick => addPick('yours', pick)) : null,
              onAddPickToTheirs: picksEnabled ? (pick => addPick('theirs', pick)) : null,
              league,
              myAvatar: leagueUserById.get(myRosterData?.owner_id ?? '')?.avatar ?? null,
              partnerAvatar: partnerRosterId
                ? (leagueUserById.get(rosterById.get(partnerRosterId)?.owner_id ?? '')?.avatar ?? null)
                : null,
              partnerRosters,
              onPartnerChange: id => {
                if (!id) { switchPartnerTradeContext(null); return; }
                if (id !== partnerRosterId) switchPartnerTradeContext(id);
              },
            };
            const sharedPlateProps = { shelfDragRef, onDropFromShelf: handleShelfDrop };
            const hasCompleteTrade = yourSide.items.length > 0 && theirSide.items.length > 0;
            const colorCommentary = hasCompleteTrade
              ? getColorCommentary(verdict.verdict, verdict.gap, ownerNameByRosterId.get(partnerRosterId) ?? null)
              : null;
            const SUGGEST_ACTION_META = {
              add:    { label: 'ADD',    bg: '#22c55e22', color: '#22c55e' },
              remove: { label: 'REMOVE', bg: '#f59e0b22', color: '#f59e0b' },
              swap:   { label: 'SWAP',   bg: 'rgba(90,173,255,0.13)', color: '#5AADFF' },
            };
            const suggestBlock = (
              <>
                {hasItems && verdict.verdict !== 'fair' && verdict.gap > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={handleSuggest}
                      className="py-2 px-4 font-semibold"
                      style={{ fontSize: 13, borderRadius: 8, background: 'var(--color-signature)', color: 'var(--color-signature-fg)', border: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Suggest Adjustment
                    </button>
                  </div>
                )}
                {suggestions && suggestions.options.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display,'Barlow Condensed',sans-serif)", fontWeight: 700, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-label-quaternary)' }}>SUGGESTIONS</span>
                    {suggestions.options.map((opt, i) => {
                      const absRemaining = Math.abs(opt.newGap);
                      const isNearEven = absRemaining < verdict.gap * 0.05;
                      const currentSurplusSide = opt.newGap > 0
                        ? (suggestions.deficitSide === 'yours' ? 'theirs' : 'yours')
                        : suggestions.deficitSide;
                      const favoredLabel = currentSurplusSide === 'theirs' ? 'You' : 'Them';
                      const remainingLabel = isNearEven ? 'Near-even trade' : `Favors ${favoredLabel} · ${fmtKtcValue(absRemaining)}`;
                      const smeta = SUGGEST_ACTION_META[opt.action] ?? SUGGEST_ACTION_META.add;
                      let descLine;
                      if (opt.action === 'add') descLine = `Add to ${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.items.map(it => it.label).join(' + ')}`;
                      else if (opt.action === 'remove') descLine = `Remove from ${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.items[0]?.label}`;
                      else descLine = `${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.remove?.label} → ${opt.add?.label}`;
                      return (
                        <div key={i} className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--color-fill)' }}>
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold px-1.5 py-0.5 rounded tracking-widest shrink-0" style={{ fontSize: 10, background: smeta.bg, color: smeta.color }}>{smeta.label}</span>
                              <span className="font-medium truncate" style={{ fontSize: 13, color: 'var(--color-label)' }}>{descLine}</span>
                            </div>
                            <span className="tabular-nums" style={{ fontSize: 12, color: 'var(--color-label-quaternary)' }}>{remainingLabel}</span>
                          </div>
                          <button onClick={() => applySuggestion(opt)} className="shrink-0 px-3 py-1.5 rounded-lg font-semibold"
                            style={{ fontSize: 13, background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
                            Apply
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {suggestions && suggestions.options.length === 0 && (
                  <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', fontSize: 12, textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                    No combinations found to close the gap.
                  </div>
                )}
              </>
            );
            return (
              <>
                {/* ── Desktop: shelf rail + main column ───────────────── */}
                <div className="hidden lg:flex" style={{ alignItems: 'flex-start' }}>
                  <RosterShelf {...sharedShelfProps} shelfDragRef={shelfDragRef} />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <BroadcastScoreboard
                      yourTotal={yourSide.total}
                      theirTotal={theirSide.total}
                      yourName={getUserDisplayName(myRosterData?.owner_id ?? '')}
                      yourAvatar={leagueUserById.get(myRosterData?.owner_id ?? '')?.avatar ?? null}
                      partnerName={partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? null) : null}
                      partnerAvatar={partnerRosterId
                        ? (leagueUserById.get(rosterById.get(partnerRosterId)?.owner_id ?? '')?.avatar ?? null)
                        : null}
                      verdict={verdict}
                      hasItems={hasItems}
                      onClear={clearTrade}
                    />
                    {!ktcLoading && !ktcError ? (
                      <>
                        <div className="trade-plates-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                          <TradePlate
                            side="yours"
                            items={yourSide.items}
                            total={yourSide.total}
                            onRemovePlayer={id => removePlayer('yours', id)}
                            onRemovePick={key => removePick('yours', key)}
                            onAddPlayer={() => setPickerOpen({ side: 'yours', type: 'player' })}
                            onAddPick={picksEnabled ? () => setPickerOpen({ side: 'yours', type: 'pick' }) : null}
                            onOpenPlayer={openStatsModalForPlayer}
                            {...sharedPlateProps}
                          />
                          <TradePlate
                            side="theirs"
                            items={theirSide.items}
                            total={theirSide.total}
                            onRemovePlayer={id => removePlayer('theirs', id)}
                            onRemovePick={key => removePick('theirs', key)}
                            onAddPlayer={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: !partnerRosterId })}
                            onAddPick={picksEnabled && partnerRosterId ? () => setPickerOpen({ side: 'theirs', type: 'pick' }) : null}
                            onOpenPlayer={openStatsModalForPlayer}
                            {...sharedPlateProps}
                          />
                        </div>
                        {colorCommentary && (
                          <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', background: 'var(--color-bg-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", fontWeight: 700, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-label-quaternary)', paddingTop: 2, flexShrink: 0 }}>COLOR COMMENTARY</span>
                            <span style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--color-label)', fontStyle: 'italic' }}>"{colorCommentary}"</span>
                          </div>
                        )}
                        {suggestBlock}
                      </>
                    ) : (
                      <div className="mx-4 mt-4 rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: 'var(--color-fill)' }}>
                        {ktcLoading ? (
                          <div className="flex items-center gap-2.5">
                            <Spinner />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-label-secondary)' }}>Loading trade values…</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>Trade values unavailable</span>
                            <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
                              The KeepTradeCut proxy could not be reached. Trade values require the nginx proxy in production.
                            </span>
                            <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>{ktcError}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Mobile: vertical stack ───────────────────────── */}
                <div className="lg:hidden flex flex-col">
                  <BroadcastScoreboard
                    yourTotal={yourSide.total}
                    theirTotal={theirSide.total}
                    yourName={getUserDisplayName(myRosterData?.owner_id ?? '')}
                    yourAvatar={leagueUserById.get(myRosterData?.owner_id ?? '')?.avatar ?? null}
                    partnerName={partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? null) : null}
                    partnerAvatar={partnerRosterId
                      ? (leagueUserById.get(rosterById.get(partnerRosterId)?.owner_id ?? '')?.avatar ?? null)
                      : null}
                    verdict={verdict}
                    hasItems={hasItems}
                    onClear={clearTrade}
                  />
                  {!ktcLoading && !ktcError ? (
                    <>
                      <TradePlate
                        side="yours"
                        items={yourSide.items}
                        total={yourSide.total}
                        onRemovePlayer={id => removePlayer('yours', id)}
                        onRemovePick={key => removePick('yours', key)}
                        onAddPlayer={() => setPickerOpen({ side: 'yours', type: 'player' })}
                        onAddPick={picksEnabled ? () => setPickerOpen({ side: 'yours', type: 'pick' }) : null}
                        onOpenPlayer={openStatsModalForPlayer}
                        {...sharedPlateProps}
                      />
                      <TradePlate
                        side="theirs"
                        items={theirSide.items}
                        total={theirSide.total}
                        onRemovePlayer={id => removePlayer('theirs', id)}
                        onRemovePick={key => removePick('theirs', key)}
                        onAddPlayer={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: !partnerRosterId })}
                        onAddPick={picksEnabled && partnerRosterId ? () => setPickerOpen({ side: 'theirs', type: 'pick' }) : null}
                        onOpenPlayer={openStatsModalForPlayer}
                        {...sharedPlateProps}
                      />
                      {colorCommentary && (
                        <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', background: 'var(--color-bg-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", fontWeight: 700, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-label-quaternary)', paddingTop: 2, flexShrink: 0 }}>COLOR COMMENTARY</span>
                          <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--color-label)', fontStyle: 'italic' }}>"{colorCommentary}"</span>
                        </div>
                      )}
                      {suggestBlock}
                      <MobileRosterShelf {...sharedShelfProps} />
                    </>
                  ) : (
                    <div className="mx-4 mt-4 rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: 'var(--color-fill)' }}>
                      {ktcLoading ? (
                        <div className="flex items-center gap-2.5">
                          <Spinner />
                          <span className="text-sm font-medium" style={{ color: 'var(--color-label-secondary)' }}>Loading trade values…</span>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>Trade values unavailable</span>
                          <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>{ktcError}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
}
