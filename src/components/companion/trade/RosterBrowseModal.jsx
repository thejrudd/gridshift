/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { fmtKtcValue } from '../../../utils/ktcApi';
import { getPicksForRoster, valueDraftPick } from '../../../utils/tradeEngine';
import { compareDraftPickAssets } from '../../../utils/draftPickDisplay';
import { computeTradePlayerValueDetail } from '../../../utils/tradeValue';
import Modal from '../../Modal';
import CompanionPlayerRow, {
  CompanionPlayerAction,
  CompanionPlayerMetric,
  CompanionPlayerStatus,
} from '../CompanionPlayerRow.jsx';
import {
  ROSTER_BROWSE_OFFENSE_POSITIONS,
} from './tradeUiHelpers';

const TRADE_LOGO_SIDE_THEME_OPTIONS = { logoSide: 'end' };

export default function RosterBrowseModal({
  roster, partnerName,
  sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, leagueType,
  rosterPicks, slots, season, league, drafts, pickValueMap, rosters, ownerNameByRosterId,
  seasonStats, scoringSettings, positionalAvgPPG, positionalValuePerPPG, rankMap, playerTradeValueDetailsMap,
  theirPlayers, theirPicks, theirSideItems,
  mergedIDPMap, hasIDP, hasDST,
  onAddPlayer, onAddPick, onClose,
}) {
  const { darkMode } = useTheme();
  const rosterBrowsePlayerCacheRef = useRef(new Map());

  const addedPlayerIds = useMemo(() => new Set(theirPlayers), [theirPlayers]);
  const addedPickKeys  = useMemo(() => new Set(theirPicks.map(p => p.key)), [theirPicks]);
  const theirSideItemMap = useMemo(
    () => new Map((theirSideItems ?? []).map((item) => [item.id, item])),
    [theirSideItems],
  );

  useEffect(() => {
    rosterBrowsePlayerCacheRef.current.clear();
  }, [
    roster?.roster_id,
    sleeperPlayers,
    adjustedKtcPlayers,
    adjustedDynastyKtcPlayers,
    mergedIDPMap,
    leagueType,
    theirSideItemMap,
    seasonStats,
    scoringSettings,
    positionalAvgPPG,
    positionalValuePerPPG,
    rankMap,
    playerTradeValueDetailsMap,
  ]);

  const getRosterBrowsePlayerMeta = useCallback((id) => {
    const cached = rosterBrowsePlayerCacheRef.current.get(id);
    if (cached) return cached;

    const sp = sleeperPlayers[id];
    if (!sp) return null;
    const enriched = theirSideItemMap.get(id);
    const sharedTradeValue = playerTradeValueDetailsMap?.get(id) ?? null;
    let dynastyFallback = sharedTradeValue?.dynastyFallback ?? false;
    let idpFallback = sharedTradeValue?.isEstimated ?? false;
    let val;
    if (enriched?.adjVal != null) {
      val = enriched.adjVal;
      dynastyFallback = enriched.dynastyFallback ?? false;
    } else if (sharedTradeValue) {
      val = sharedTradeValue.value;
      dynastyFallback = sharedTradeValue.dynastyFallback;
      idpFallback = sharedTradeValue.isEstimated ?? false;
    } else {
      const detail = computeTradePlayerValueDetail({
        id,
        players: sleeperPlayers,
        adjustedKtcPlayers,
        adjustedDynastyKtcPlayers,
        leagueType,
        seasonStats,
        scoringSettings,
        positionalAvgPPG,
        positionalValuePerPPG,
        rankMap,
        mergedIDPMap,
        blendWeight: 0.50,
      });
      if (detail) {
        val = detail.value;
        dynastyFallback = detail.dynastyFallback;
        idpFallback = detail.isEstimated;
      }
    }

    const next = {
      id,
      name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
      position: sp.position ?? '',
      team: sp.team ?? '',
      val,
      isEstimated: sharedTradeValue?.isEstimated ?? idpFallback,
      dynastyFallback,
    };
    rosterBrowsePlayerCacheRef.current.set(id, next);
    return next;
  }, [sleeperPlayers, theirSideItemMap, playerTradeValueDetailsMap, seasonStats, scoringSettings, adjustedKtcPlayers, leagueType, adjustedDynastyKtcPlayers, mergedIDPMap, positionalValuePerPPG, positionalAvgPPG, rankMap]);

  // Player list sorted by adjusted value descending
  const players = useMemo(() => {
    if (!roster || !sleeperPlayers) return [];
    const ids = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
    return ids.map((id) => getRosterBrowsePlayerMeta(id)).filter(Boolean).sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
  }, [roster, sleeperPlayers, getRosterBrowsePlayerMeta]);

  const playerSections = useMemo(() => {
    if (!players.length) return [];

    const offense = [];
    const defense = [];
    for (const player of players) {
      if (ROSTER_BROWSE_OFFENSE_POSITIONS.has(player.position)) offense.push(player);
      else defense.push(player);
    }

    const showSections = (hasIDP || hasDST) && offense.length > 0 && defense.length > 0;
    if (!showSections) return [{ label: 'Players', items: players }];
    return [
      { label: 'Offense', items: offense },
      { label: 'Defense', items: defense },
    ];
  }, [hasDST, hasIDP, players]);

  // Pick list — enriched with quality label and value
  const picks = useMemo(() => {
    if (!roster || !rosterPicks || !slots) return [];
    return getPicksForRoster(roster.roster_id, rosterPicks, slots).map(pick => {
      const { val, displayInfo, quality, valueQuality } = valueDraftPick(pick, {
        rosters,
        ktcPlayers: adjustedKtcPlayers,
        leagueType,
        pickValueMap,
        currentSeason: season,
        league,
        drafts,
      });
      const fromOwner = pick.isOwn ? null : (ownerNameByRosterId?.get(pick.fromRosterId) ?? null);
      return {
        ...pick,
        quality,
        valueQuality,
        label: displayInfo.label,
        val,
        fromOwner,
        displayMode: displayInfo.displayMode,
        lockedSlot: displayInfo.lockedSlot ?? null,
        pickNumberLabel: displayInfo.pickNumberLabel ?? null,
        pickRangeLabel: displayInfo.pickRangeLabel ?? null,
        cardHeadline: displayInfo.cardHeadline ?? null,
        cardMetaLabel: displayInfo.cardMetaLabel ?? null,
        sortSlot: displayInfo.sortSlot ?? null,
      };
    }).sort(compareDraftPickAssets);
  }, [roster, rosterPicks, slots, rosters, adjustedKtcPlayers, leagueType, league, drafts, pickValueMap, season, ownerNameByRosterId]);

  return (
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', maxWidth: 520, height: '72vh', maxHeight: 640 }}
      mobileSheet
      ariaLabel={`${partnerName}'s roster`}
    >

        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <div>
            <span className="font-bold text-base" style={{ color: 'var(--color-label)' }}>
              {partnerName}&apos;s Roster
            </span>
            <span className="text-xs ml-2" style={{ color: 'var(--color-label-tertiary)' }}>
              Tap + to add to trade
            </span>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--color-label-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">

          {/* Players — split into Offense/Defense sections for IDP/D/ST leagues */}
          {playerSections.length > 0 && (() => {
            const renderPlayerRow = (p) => {
              const isAdded = addedPlayerIds.has(p.id);
              const valuePrefix = (p.isEstimated || p.dynastyFallback) ? '~' : '';
              return (
                <CompanionPlayerRow
                  key={p.id}
                  player={p}
                  name={p.name}
                  darkMode={darkMode}
                  selected={isAdded}
                  disabled={isAdded}
                  compact
                  teamThemeOptions={TRADE_LOGO_SIDE_THEME_OPTIONS}
                  metaSegments={[p.team].filter(Boolean)}
                  columns={[
                    <CompanionPlayerMetric
                      key="value"
                      value={`${valuePrefix}${fmtKtcValue(p.val)}`}
                      kicker={p.dynastyFallback ? 'DYN est.' : null}
                      title={p.isEstimated ? 'Estimated from season production (no KTC data)' : undefined}
                    />,
                  ]}
                  actions={isAdded ? (
                    <CompanionPlayerStatus tone="positive" title="Already added">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </CompanionPlayerStatus>
                  ) : (
                    <CompanionPlayerAction
                      label={`Add ${p.name}`}
                      onClick={() => onAddPlayer(p.id)}
                      title={`Add ${p.name}`}
                    >
                      +
                    </CompanionPlayerAction>
                  )}
                  gridTemplate="auto auto minmax(0,1fr) auto auto auto"
                  style={{
                    borderBottom: '1px solid var(--color-separator)',
                    borderRight: 0,
                    borderTop: 0,
                    borderRadius: 0,
                    minHeight: 76,
                    contentVisibility: 'auto',
                    containIntrinsicSize: '76px',
                  }}
                />
              );
            };

            const SectionHeader = ({ label }) => (
              <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em', borderBottom: '1px solid var(--color-separator)', zIndex: 1 }}>
                {label}
              </div>
            );

            return playerSections.map((section) => (
              <div key={section.label}>
                <SectionHeader label={section.label} />
                {section.items.map(renderPlayerRow)}
              </div>
            ));
          })()}

          {/* Picks */}
          {picks.length > 0 && (
            <div>
              <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em', borderBottom: '1px solid var(--color-separator)', zIndex: 1 }}>
                Draft Capital
              </div>
              {picks.map(pick => {
                const isAdded = addedPickKeys.has(pick.key);
                return (
                  <div key={pick.key}
                    className="flex items-center px-4 py-3 gap-3"
                    style={{ borderBottom: '1px solid var(--color-separator)', opacity: isAdded ? 0.5 : 1, contentVisibility: 'auto', containIntrinsicSize: '76px' }}>
                    <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}>
                      {pick.round}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{pick.label}</div>
                      {pick.fromOwner && (
                        <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>from {pick.fromOwner}</div>
                      )}
                    </div>
                    {pick.val != null && (
                      <span className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: 'var(--color-label-secondary)' }}>
                        {fmtKtcValue(pick.val)}
                      </span>
                    )}
                    {isAdded ? (
                      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(0,168,68,0.15)', color: 'var(--color-accent-green)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    ) : (
                      <button onClick={() => onAddPick(pick)}
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors active:opacity-60"
                        style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', fontSize: '20px', lineHeight: 1 }}>
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {players.length === 0 && picks.length === 0 && (
            <div className="py-12 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              No players or picks found.
            </div>
          )}
        </div>
    </Modal>
  );
}
