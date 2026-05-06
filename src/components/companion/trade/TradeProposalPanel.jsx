/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { memo, useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { useSleeperStats } from '../../../context/SleeperContext';
import { useTheme } from '../../../context/ThemeContext';
import { fmtKtcValue } from '../../../utils/ktcApi';
import { compareDraftPickAssets } from '../../../utils/draftPickDisplay';
import useMediaQuery from '../../../hooks/useMediaQuery.js';
import CompanionAssetRow from '../CompanionAssetRow.jsx';
import { CompanionSelectorButton, CompanionSelectorRail } from '../CompanionSelectorControls.jsx';
import ProposalPlayerCard from './ProposalPlayerCard';
import Spinner from './Spinner';
import {
  teamPalette,
  normalizeRosterId,
  scheduleDeferredTradeTask,
} from './tradeUiHelpers';

const TRADE_LOGO_SIDE_THEME_OPTIONS = { logoSide: 'end' };

function AssetBadge({ asset }) {
  const isPlayer = asset.type === 'player';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium"
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label)' }}
    >
      <span>{asset.label ?? asset.name}</span>
      {isPlayer && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}
        >
          {asset.position}
        </span>
      )}
    </span>
  );
}

function getProposalPickIdentity(pick) {
  if (!pick) return 'Draft Pick';
  const roundNumber = Number(pick.round);
  const hasRound = Number.isFinite(roundNumber) && roundNumber > 0;
  const compactPickNumberLabel = pick.pickNumberLabel ?? pick.pickRangeLabel ?? null;
  const parsedPickSlot = typeof compactPickNumberLabel === 'string'
    ? Number(compactPickNumberLabel.match(/^\d+\.(\d+)$/)?.[1])
    : null;
  const lockedPickSlot = Number(pick.lockedSlot ?? parsedPickSlot);
  const hasLockedPickSlot = Number.isFinite(lockedPickSlot) && lockedPickSlot > 0;
  const compactRoundLabel = hasRound ? `Round ${roundNumber}` : null;
  const compactPickSlotLabel = hasLockedPickSlot ? `Pick ${lockedPickSlot}` : compactPickNumberLabel;

  return [
    pick.year,
    compactRoundLabel,
    compactPickSlotLabel,
  ].filter(Boolean).join(' · ') || pick.label || 'Draft Pick';
}

function ProposalAssetRow({ asset, darkMode, onOpenPlayer }) {
  if (!asset) return null;

  const isPlayer = asset.type === 'player';
  const isInteractive = isPlayer && !!onOpenPlayer;
  const value = asset.value ?? asset.val;

  if (!isPlayer) {
    const quality = asset.displayQuality ?? asset.quality ?? null;
    const metaSegments = [quality, asset.pickRangeLabel].filter(Boolean);
    return (
      <CompanionAssetRow
        asset={{ ...asset, label: getProposalPickIdentity(asset) }}
        darkMode={darkMode}
        className="trade-selection-row--proposal"
        teamThemeOptions={TRADE_LOGO_SIDE_THEME_OPTIONS}
        metaSegments={metaSegments.length ? metaSegments : [asset.cardHeadline || 'Draft pick']}
        valueKicker="Value"
        valueLabel={value != null ? fmtKtcValue(value) : '—'}
      />
    );
  }

  const rankLabel = asset.rank?.posLabel ? `${asset.rank.posLabel}${asset.rank.rank}` : null;
  const metaSegments = [
    [asset.position, asset.team].filter(Boolean).join(' · '),
    rankLabel,
    asset.ppg > 0 ? `${asset.ppg.toFixed(1)} PPG` : null,
  ].filter(Boolean);

  return (
    <CompanionAssetRow
      asset={{ ...asset, label: asset.name }}
      darkMode={darkMode}
      className="trade-selection-row--proposal"
      teamThemeOptions={TRADE_LOGO_SIDE_THEME_OPTIONS}
      interactive={isInteractive}
      title={[asset.name, ...metaSegments, `Value ${fmtKtcValue(value)}`].join(' · ')}
      ariaLabel={isInteractive ? `Open player stats for ${asset.name}` : undefined}
      metaSegments={metaSegments.length ? metaSegments : ['Player']}
      valueKicker="Value"
      valueLabel={value != null ? fmtKtcValue(value) : '—'}
      onClick={isInteractive ? onOpenPlayer : null}
    />
  );
}

function fmtPpg(value) {
  return Number.isFinite(value) ? Number(value).toFixed(1) : '0.0';
}

function fmtSignedPpg(value) {
  if (!Number.isFinite(value)) return '0.0';
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)}`;
}

function getProposalAssetDisplayName(asset, fallback = 'Asset') {
  if (!asset) return fallback;
  if (asset.type === 'pick') return getProposalPickIdentity(asset);
  return asset.label ?? asset.name ?? fallback;
}

function buildIntelligenceProposalTitle(proposal) {
  const incoming = proposal?.incomingAssets ?? [];
  const outgoing = proposal?.outgoingAssets ?? [];
  const incomingPrimary = getProposalAssetDisplayName(incoming[0], 'incoming asset');
  const outgoingPrimary = getProposalAssetDisplayName(outgoing[0], 'outgoing asset');
  const incomingExtra = incoming.length > 1 ? ` + ${incoming.length - 1}` : '';
  const outgoingExtra = outgoing.length > 1 ? ` + ${outgoing.length - 1}` : '';

  if (!incoming.length && !outgoing.length) return 'Suggested deal package';
  if (!incoming.length) return `Send ${outgoingPrimary}${outgoingExtra}`;
  if (!outgoing.length) return `Get ${incomingPrimary}${incomingExtra}`;
  return `${incomingPrimary}${incomingExtra} for ${outgoingPrimary}${outgoingExtra}`;
}

const TRADE_PROPOSAL_CARD_GAP_PX = 10;
const TRADE_PROPOSAL_VISIBLE_CARD_LIMIT = 3;

function getProposalCardSlotStyle(cardCount, isWideTradeProposalLayout, sharedSizingCardCount = cardCount) {
  if (!isWideTradeProposalLayout) {
    return {
      width: 'min(76vw, 30vh, 14rem)',
      maxWidth: '100%',
      flex: '0 0 auto',
    };
  }

  const visibleCards = Math.min(Math.max(sharedSizingCardCount || cardCount || 1, 1), TRADE_PROPOSAL_VISIBLE_CARD_LIMIT);
  const availableCardWidth = `calc((100% - ${(visibleCards - 1) * TRADE_PROPOSAL_CARD_GAP_PX}px) / ${visibleCards})`;
  const cardWidth = `min(15rem, ${availableCardWidth})`;

  return {
    width: cardWidth,
    flex: `1 1 ${cardWidth}`,
    minWidth: 0,
    maxWidth: cardWidth,
  };
}

function getTradeProposalListTransitionStyle({ isStale }) {
  return {
    opacity: 1,
    filter: 'none',
    transform: 'none',
    transition: 'none',
    pointerEvents: isStale ? 'none' : undefined,
  };
}

function useEqualizedCardHeight(enabled, measureKey) {
  const containerRef = useRef(null);
  const cardRefs = useRef(new Map());
  const frameRef = useRef(null);
  const [equalizedCardHeight, setEqualizedCardHeight] = useState(null);

  const registerCardRef = useCallback((slotId, node) => {
    if (!slotId) return;
    if (node) cardRefs.current.set(slotId, node);
    else cardRefs.current.delete(slotId);
  }, []);

  const scheduleMeasurement = useCallback(() => {
    if (!enabled) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      let tallest = 0;
      for (const node of cardRefs.current.values()) {
        if (!node) continue;
        tallest = Math.max(tallest, node.offsetHeight || 0);
      }
      const nextHeight = tallest ? Math.ceil(tallest) : null;
      setEqualizedCardHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      cardRefs.current.clear();
      setEqualizedCardHeight(null);
      return;
    }

    scheduleMeasurement();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [enabled, measureKey, scheduleMeasurement]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onResize = () => scheduleMeasurement();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, scheduleMeasurement]);

  useEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      scheduleMeasurement();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [enabled, measureKey, scheduleMeasurement]);

  return {
    containerRef,
    registerCardRef,
    equalizedCardHeight,
  };
}

const EMPTY_PROPOSAL_ASSET_BUCKET = {
  players: [],
  picks: [],
  playerCount: 0,
  pickCount: 0,
};

const EMPTY_PROPOSAL_ASSET_SUMMARY = {
  incoming: EMPTY_PROPOSAL_ASSET_BUCKET,
  outgoing: EMPTY_PROPOSAL_ASSET_BUCKET,
  totalPlayerCount: 0,
};

const proposalAssetSummaryCache = new WeakMap();

function partitionProposalAssets(assets = []) {
  const players = [];
  const picks = [];

  for (const asset of assets) {
    if (asset?.type === 'player') players.push(asset);
    else if (asset?.type === 'pick') picks.push(asset);
  }

  return {
    players,
    picks,
    playerCount: players.length,
    pickCount: picks.length,
  };
}

function getProposalAssetSummary(proposal) {
  if (!proposal || typeof proposal !== 'object') return EMPTY_PROPOSAL_ASSET_SUMMARY;
  const cached = proposalAssetSummaryCache.get(proposal);
  if (cached) return cached;

  const incoming = partitionProposalAssets(proposal.incomingAssets);
  const outgoing = partitionProposalAssets(proposal.outgoingAssets);
  const summary = {
    incoming,
    outgoing,
    totalPlayerCount: incoming.playerCount + outgoing.playerCount,
  };
  proposalAssetSummaryCache.set(proposal, summary);
  return summary;
}

function sortProposalPickAssets(picks = []) {
  return [...picks].sort(compareDraftPickAssets);
}

function buildProposalCardAssets(bucket, renderAllAssetsAsCards) {
  const sortedPicks = sortProposalPickAssets(bucket.picks);
  if (renderAllAssetsAsCards) return [...bucket.players, ...sortedPicks];
  return bucket.playerCount ? bucket.players : sortedPicks;
}

function sumProposalAssetValues(assets = []) {
  return Math.round((assets ?? []).reduce((sum, asset) => sum + Number(asset?.value ?? asset?.val ?? 0), 0));
}

function countProposalAssets(proposal) {
  return (proposal?.incomingAssets?.length ?? 0) + (proposal?.outgoingAssets?.length ?? 0);
}

function getProposalUpgradeDelta(proposal) {
  const contextDelta = Number(proposal?.context?.myUpgradeDelta);
  if (Number.isFinite(contextDelta)) return contextDelta;
  const proposalDelta = Number(proposal?.upgradeDelta);
  return Number.isFinite(proposalDelta) ? proposalDelta : 0;
}

function getProposalOutgoingValue(proposal) {
  return sumProposalAssetValues(proposal?.outgoingAssets ?? []);
}

function getManagerInitials(managerName) {
  const parts = String(managerName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function getRosterRecordText(roster) {
  const settings = roster?.settings ?? {};
  const wins = settings.wins ?? settings.win;
  const losses = settings.losses ?? settings.loss;
  const ties = settings.ties ?? settings.tie;
  if (!Number.isFinite(Number(wins)) || !Number.isFinite(Number(losses))) return null;
  return `${Number(wins)}-${Number(losses)}${Number(ties) > 0 ? `-${Number(ties)}` : ''}`;
}

function getRosterFantasyPoints(roster) {
  const settings = roster?.settings ?? {};
  const points = Number(settings.fpts ?? 0);
  const decimal = Number(settings.fpts_decimal ?? 0);
  return points + (decimal / 100);
}

function getOrdinal(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const mod100 = numeric % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${numeric}th`;
  switch (numeric % 10) {
    case 1:
      return `${numeric}st`;
    case 2:
      return `${numeric}nd`;
    case 3:
      return `${numeric}rd`;
    default:
      return `${numeric}th`;
  }
}

function buildRosterStandingMap(rosters = []) {
  return new Map(
    [...(rosters ?? [])]
      .sort((a, b) => {
        const aSettings = a?.settings ?? {};
        const bSettings = b?.settings ?? {};
        return Number(bSettings.wins ?? 0) - Number(aSettings.wins ?? 0)
          || Number(aSettings.losses ?? 0) - Number(bSettings.losses ?? 0)
          || getRosterFantasyPoints(b) - getRosterFantasyPoints(a);
      })
      .map((roster, index) => [normalizeRosterId(roster?.roster_id), getOrdinal(index + 1)]),
  );
}

function getUpgradeNeedMeta(proposals = []) {
  const proposal = proposals.find((item) => item?.context?.theirNeedPosition || item?.theirNeedPosition) ?? proposals[0] ?? null;
  const position = proposal?.context?.theirNeedPosition ?? proposal?.theirNeedPosition ?? null;
  if (!position) return 'Upgrade fit';
  const starterGain = Number(proposal?.context?.theirUpgradeDelta ?? 0);
  return starterGain >= 0.3 ? `Needs ${position} help` : `Needs ${position} depth`;
}

function buildManagerMetaLine({ roster, standingMap, rosterId, proposals }) {
  const pieces = [
    getRosterRecordText(roster),
    standingMap?.get(normalizeRosterId(rosterId)),
    getUpgradeNeedMeta(proposals),
  ].filter(Boolean);
  return pieces.length ? pieces.join(' · ') : 'Upgrade fit';
}

function sortUpgradeResultGroups(groups = [], sortMode = 'manager') {
  const prepared = groups.map((entry) => ({
    ...entry,
    group: {
      ...entry.group,
      proposals: [...(entry.group?.proposals ?? [])],
    },
  }));

  if (sortMode === 'best_delta') {
    return prepared
      .map((entry) => ({
        ...entry,
        group: {
          ...entry.group,
          proposals: entry.group.proposals.sort((a, b) => getProposalUpgradeDelta(b) - getProposalUpgradeDelta(a)
            || (b.plausibilityScore ?? 0) - (a.plausibilityScore ?? 0)),
        },
      }))
      .sort((a, b) => getProposalUpgradeDelta(b.group.proposals[0]) - getProposalUpgradeDelta(a.group.proposals[0])
        || (b.group.proposals[0]?.plausibilityScore ?? 0) - (a.group.proposals[0]?.plausibilityScore ?? 0));
  }

  if (sortMode === 'lightest_package') {
    return prepared
      .map((entry) => ({
        ...entry,
        group: {
          ...entry.group,
          proposals: entry.group.proposals.sort((a, b) => getProposalOutgoingValue(a) - getProposalOutgoingValue(b)
            || countProposalAssets(a) - countProposalAssets(b)
            || getProposalUpgradeDelta(b) - getProposalUpgradeDelta(a)),
        },
      }))
      .sort((a, b) => getProposalOutgoingValue(a.group.proposals[0]) - getProposalOutgoingValue(b.group.proposals[0])
        || countProposalAssets(a.group.proposals[0]) - countProposalAssets(b.group.proposals[0])
        || getProposalUpgradeDelta(b.group.proposals[0]) - getProposalUpgradeDelta(a.group.proposals[0]));
  }

  return prepared;
}

function cloneProposalAsset(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  return {
    ...asset,
    pickData: asset.pickData && typeof asset.pickData === 'object'
      ? { ...asset.pickData }
      : asset.pickData,
  };
}

function cloneTradeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return proposal;
  return {
    ...proposal,
    incomingAssets: (proposal.incomingAssets ?? []).map(cloneProposalAsset),
    outgoingAssets: (proposal.outgoingAssets ?? []).map(cloneProposalAsset),
  };
}

function buildProposalFilterEntry(proposal) {
  const clonedProposal = cloneTradeProposal(proposal);
  const summary = getProposalAssetSummary(clonedProposal);

  return {
    proposal: clonedProposal,
    outgoingPlayers: summary.outgoing.playerCount,
    incomingPlayers: summary.incoming.playerCount,
    outgoingPicks: summary.outgoing.pickCount,
    incomingPicks: summary.incoming.pickCount,
  };
}

function getProposalDesktopSpan(proposal) {
  const summary = getProposalAssetSummary(proposal);
  const incomingAssetCount = summary.incoming.playerCount + summary.incoming.pickCount;
  const outgoingAssetCount = summary.outgoing.playerCount + summary.outgoing.pickCount;
  return Math.max(incomingAssetCount, outgoingAssetCount) > 1 || summary.totalPlayerCount >= 3 ? 2 : 1;
}

function buildFilteredProposalLayout(entries = [], filters) {
  const filteredProposals = [];
  const desktopRows = [];
  const rowUsage = [];

  for (const entry of entries) {
    if (!matchesProposalFilters(entry, filters)) continue;
    const proposal = entry.proposal;
    filteredProposals.push(proposal);

    const span = getProposalDesktopSpan(proposal);
    let targetRowIndex = -1;
    for (let i = 0; i < rowUsage.length; i += 1) {
      if ((rowUsage[i] + span) <= 2) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      desktopRows.push([{ proposal, span }]);
      rowUsage.push(span);
      continue;
    }

    desktopRows[targetRowIndex].push({ proposal, span });
    rowUsage[targetRowIndex] += span;
  }

  return { filteredProposals, desktopRows };
}

function useDeferredContentReady(deferContent) {
  const [ready, setReady] = useState(() => !deferContent);

  useEffect(() => {
    if (!deferContent) {
      setReady(true);
      return undefined;
    }

    setReady(false);
    const cancelTask = scheduleDeferredTradeTask(() => {
      setReady(true);
    }, 120);
    return () => cancelTask?.();
  }, [deferContent]);

  return ready;
}

const TradeProposalItem = memo(function TradeProposalItem({
  proposal,
  darkMode,
  seasonStats,
  onApplyProposal,
  onOpenPlayer,
  containerClassName = '',
  renderAllAssetsAsCards = false,
  deferInsights = false,
  resultVariant = '',
}) {
  const isUpgradeResult = resultVariant === 'upgrade';
  const isIntelligenceResult = resultVariant === 'intelligence';
  const isWorkspaceResult = isUpgradeResult || isIntelligenceResult;
  const {
    incomingCardAssets,
    outgoingCardAssets,
    incomingAssetsForCallout,
    outgoingAssetsForCallout,
    incomingMobilePickCards,
    outgoingMobilePickCards,
  } = useMemo(() => {
    const summary = getProposalAssetSummary(proposal);
    const incomingMixedPackage = summary.incoming.playerCount > 0 && summary.incoming.pickCount > 0;
    const outgoingMixedPackage = summary.outgoing.playerCount > 0 && summary.outgoing.pickCount > 0;
    const renderIncomingAssetsAsCards = renderAllAssetsAsCards || incomingMixedPackage;
    const renderOutgoingAssetsAsCards = renderAllAssetsAsCards || outgoingMixedPackage;
    const incomingCardAssets = buildProposalCardAssets(summary.incoming, renderIncomingAssetsAsCards);
    const outgoingCardAssets = buildProposalCardAssets(summary.outgoing, renderOutgoingAssetsAsCards);
    const incomingCalloutAssets = renderIncomingAssetsAsCards
      ? []
      : (summary.incoming.playerCount ? sortProposalPickAssets(summary.incoming.picks) : []);
    const outgoingCalloutAssets = renderOutgoingAssetsAsCards
      ? []
      : (summary.outgoing.playerCount ? sortProposalPickAssets(summary.outgoing.picks) : []);

    return {
      incomingCardAssets,
      outgoingCardAssets,
      incomingAssetsForCallout: incomingCalloutAssets,
      outgoingAssetsForCallout: outgoingCalloutAssets,
      incomingMobilePickCards: incomingCalloutAssets,
      outgoingMobilePickCards: outgoingCalloutAssets,
    };
  }, [proposal, renderAllAssetsAsCards]);
  const isWideTradeProposalLayout = useMediaQuery('(min-width: 1536px)');
  const isUpgradeSideBySideLayout = useMediaQuery('(min-width: 1200px)');
  const useSideFittedCardSlots = isWideTradeProposalLayout || (isWorkspaceResult && isUpgradeSideBySideLayout);
  const sharedProposalSizingCardCount = useSideFittedCardSlots
    ? Math.max(outgoingCardAssets.length, incomingCardAssets.length)
    : null;
  const proposalCardMeasureKey = `${proposal.id}:${incomingCardAssets.length}:${outgoingCardAssets.length}:${incomingMobilePickCards.length}:${outgoingMobilePickCards.length}:${seasonStats ? 'ready' : 'idle'}:${isWideTradeProposalLayout ? 'wide' : 'compact'}`;
  const {
    containerRef: proposalCardsContainerRef,
    registerCardRef,
  } = useEqualizedCardHeight(false, proposalCardMeasureKey);
  const outgoingCardSlotStyle = getProposalCardSlotStyle(outgoingCardAssets.length, useSideFittedCardSlots, sharedProposalSizingCardCount);
  const incomingCardSlotStyle = getProposalCardSlotStyle(incomingCardAssets.length, useSideFittedCardSlots, sharedProposalSizingCardCount);
  const outgoingMobilePickCardSlotStyle = getProposalCardSlotStyle(outgoingMobilePickCards.length, false);
  const incomingMobilePickCardSlotStyle = getProposalCardSlotStyle(incomingMobilePickCards.length, false);
  const insightsReady = useDeferredContentReady(deferInsights);
  const [isHovered, setIsHovered] = useState(false);
  const proposalShadow = isHovered
    ? '0 10px 24px rgba(12,15,20,0.12), 0 3px 8px rgba(12,15,20,0.08)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
  const outgoingTotal = sumProposalAssetValues(proposal?.outgoingAssets ?? []);
  const incomingTotal = sumProposalAssetValues(proposal?.incomingAssets ?? []);

  if (isWorkspaceResult) {
    const summary = getUpgradeProposalSummary(proposal);
    const upgradeDelta = getProposalUpgradeDelta(proposal);
    const resultKicker = isUpgradeResult ? 'Upgrade Path' : 'Suggested Deal';
    const resultTitle = isUpgradeResult ? summary.yourUpgradeTitle : buildIntelligenceProposalTitle(proposal);
    const resultSubtext = isUpgradeResult
      ? 'Review package fit, then apply it to the Trade Agent.'
      : 'Review the package fit, then apply it to the Trade Agent.';
    const renderWorkspaceSide = ({ label, tone, assets, slotStyle, side }) => (
      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span
            className="inline-flex w-max items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: tone === 'give' ? 'var(--color-accent-red)' : 'var(--color-accent-green)',
              color: '#fff',
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {label}
          </span>
          <span
            className="shrink-0 text-lg font-bold tabular-nums leading-none"
            style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}
          >
            {fmtKtcValue(tone === 'give' ? outgoingTotal : incomingTotal)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 md:hidden">
          {assets.map((asset) => (
            <ProposalAssetRow
              key={`mobile:${side}:${asset.id}`}
              asset={asset}
              darkMode={darkMode}
              onOpenPlayer={asset.type === 'player' ? onOpenPlayer : null}
            />
          ))}
        </div>
        <div className="hidden flex-row flex-nowrap items-stretch justify-start gap-2.5 overflow-x-auto scrollbar-hide pb-1 md:flex min-[1200px]:justify-center">
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="max-w-full self-center flex"
              style={slotStyle}
            >
              <ProposalPlayerCard
                cardRef={(node) => registerCardRef(`${side}:${asset.id}:${index}`, node)}
                player={asset.type === 'player' ? asset : null}
                palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS) : null) : null}
                pick={asset.type === 'pick' ? asset : null}
                side={side}
                showSideBadge={false}
                seasonStats={seasonStats}
                compactTradeCard
                onClick={asset.type === 'player' ? onOpenPlayer : null}
              />
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <div
        className={`rounded-2xl overflow-hidden ${containerClassName}`}
        style={{
          background: 'var(--color-bg)',
          border: `1px solid ${isHovered ? 'var(--color-signature)' : 'var(--color-separator)'}`,
          boxShadow: proposalShadow,
          transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'border-color 160ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
      >
        <div
          ref={proposalCardsContainerRef}
          className="grid grid-cols-1 gap-3 p-4 min-[1200px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[1200px]:gap-4"
        >
          <div className="min-[1200px]:col-span-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
                {resultKicker}
              </div>
              <div className="mt-0.5 truncate text-[12px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                {resultTitle}
              </div>
              <div className="mt-1 hidden text-[11px] font-medium md:block" style={{ color: 'var(--color-label-tertiary)' }}>
                {resultSubtext}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApplyProposal?.(proposal)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
            >
              Apply
            </button>
          </div>

          {renderWorkspaceSide({
            label: 'You Give',
            tone: 'give',
            assets: outgoingCardAssets,
            slotStyle: outgoingCardSlotStyle,
            side: 'give',
          })}

          <div
            className="shrink-0 self-center justify-self-center text-2xl font-bold rotate-90 min-[1200px]:rotate-0"
            style={{ color: 'var(--color-label-quaternary)', fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            ⇄
          </div>

          {renderWorkspaceSide({
            label: 'You Get',
            tone: 'get',
            assets: incomingCardAssets,
            slotStyle: incomingCardSlotStyle,
            side: 'get',
          })}
        </div>

        <div
          className={isUpgradeResult
            ? 'grid grid-cols-1 gap-4 px-4 pb-4 pt-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
            : 'grid grid-cols-1 gap-4 px-4 pb-4 pt-3 md:grid-cols-2'}
          style={{ borderTop: '1px dashed var(--color-separator)' }}
        >
          {insightsReady ? (
            <>
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Why It Helps You
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsMe}
                </p>
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Why It Helps Them
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsThem}
                </p>
              </div>
              {isUpgradeResult && (
                <div className="md:min-w-[5rem] md:text-right">
                  <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: 'var(--color-accent-green)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {fmtSignedPpg(upgradeDelta)}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-label-tertiary)' }}>
                    Starter PPG
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="md:col-span-3 space-y-2">
              <div className="h-3 rounded-full" style={{ width: '52%', background: 'var(--color-fill)' }} />
              <div className="h-3 rounded-full" style={{ width: '82%', background: 'var(--color-fill)' }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl overflow-hidden ${containerClassName}`}
      style={{
        border: `1px solid ${isHovered ? 'var(--color-signature)' : 'var(--color-separator)'}`,
        boxShadow: proposalShadow,
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'border-color 160ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-tertiary)' }}>
            {isUpgradeResult ? 'Upgrade Path' : 'Suggested Deal'}
          </div>
          {isUpgradeResult && (
            <div className="mt-0.5 truncate text-[12px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
              Review package fit, then apply it to the Trade Agent.
            </div>
          )}
        </div>
        <button onClick={() => onApplyProposal?.(proposal)}
          className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0"
          style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
          Apply
        </button>
      </div>

      <div
        ref={proposalCardsContainerRef}
        className="flex flex-col 2xl:flex-row justify-center gap-2.5 px-3 py-3 min-w-0 items-stretch 2xl:items-start"
        style={{ background: 'var(--color-fill)' }}>
        <div className="w-full min-w-0 flex flex-col gap-1.5 2xl:flex-1">
          {isUpgradeResult ? (
            <div className="flex items-center gap-2 px-1 pb-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent-red)' }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-secondary)' }}>You give</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-1 pb-0.5 md:justify-center">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ background: 'var(--color-accent-red)', color: '#fff' }}>Give</span>
              <span className="text-sm font-bold tabular-nums md:hidden" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
                {fmtKtcValue(outgoingTotal)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 md:hidden">
            {outgoingCardAssets.map((asset) => (
              <ProposalAssetRow
                key={`mobile:give:${asset.id}`}
                asset={asset}
                darkMode={darkMode}
                onOpenPlayer={asset.type === 'player' ? onOpenPlayer : null}
              />
            ))}
          </div>
          <div className="hidden flex-row flex-nowrap items-stretch justify-start 2xl:justify-center gap-2.5 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex">
            {outgoingCardAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="max-w-full self-center 2xl:self-stretch flex"
                style={outgoingCardSlotStyle}
              >
                <ProposalPlayerCard
                  cardRef={(node) => registerCardRef(`give:${asset.id}:${index}`, node)}
                  player={asset.type === 'player' ? asset : null}
                  palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS) : null) : null}
                  pick={asset.type === 'pick' ? asset : null}
                  side="give"
                  showSideBadge={false}
                  seasonStats={seasonStats}
                  compactTradeCard
                  onClick={asset.type === 'player' ? onOpenPlayer : null}
                />
              </div>
            ))}
          </div>
          {outgoingMobilePickCards.length > 0 && (
            <div className="hidden flex-row flex-nowrap justify-start 2xl:justify-center gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex 2xl:hidden">
              {outgoingMobilePickCards.map((asset, index) => (
                <div
                  key={`give-mobile-pick:${asset.id}:${index}`}
                  className="max-w-full self-center flex"
                  style={outgoingMobilePickCardSlotStyle}
                >
                  <ProposalPlayerCard
                    cardRef={(node) => registerCardRef(`give-mobile-pick:${asset.id}:${index}`, node)}
                    player={null}
                    palette={null}
                    pick={asset}
                    side="give"
                    showSideBadge={false}
                    seasonStats={seasonStats}
                    compactTradeCard
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-base font-bold self-center rotate-90 2xl:rotate-0"
          style={{ color: 'var(--color-label-quaternary)' }}>
          ⇄
        </div>
        <div className="w-full min-w-0 flex flex-col gap-1.5 2xl:flex-1">
          {isUpgradeResult ? (
            <div className="flex items-center gap-2 px-1 pb-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent-green)' }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-secondary)' }}>You get</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-1 pb-0.5 md:justify-center">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ background: 'var(--color-accent-green)', color: '#fff' }}>Get</span>
              <span className="text-sm font-bold tabular-nums md:hidden" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
                {fmtKtcValue(incomingTotal)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 md:hidden">
            {incomingCardAssets.map((asset) => (
              <ProposalAssetRow
                key={`mobile:get:${asset.id}`}
                asset={asset}
                darkMode={darkMode}
                onOpenPlayer={asset.type === 'player' ? onOpenPlayer : null}
              />
            ))}
          </div>
          <div className="hidden flex-row flex-nowrap items-stretch justify-start 2xl:justify-center gap-2.5 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex">
            {incomingCardAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="max-w-full self-center 2xl:self-stretch flex"
                style={incomingCardSlotStyle}
              >
                <ProposalPlayerCard
                  cardRef={(node) => registerCardRef(`get:${asset.id}:${index}`, node)}
                  player={asset.type === 'player' ? asset : null}
                  palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS) : null) : null}
                  pick={asset.type === 'pick' ? asset : null}
                  side="get"
                  showSideBadge={false}
                  seasonStats={seasonStats}
                  compactTradeCard
                  onClick={asset.type === 'player' ? onOpenPlayer : null}
                />
              </div>
            ))}
          </div>
          {incomingMobilePickCards.length > 0 && (
            <div className="hidden flex-row flex-nowrap justify-start 2xl:justify-center gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex 2xl:hidden">
              {incomingMobilePickCards.map((asset, index) => (
                <div
                  key={`get-mobile-pick:${asset.id}:${index}`}
                  className="max-w-full self-center flex"
                  style={incomingMobilePickCardSlotStyle}
                >
                  <ProposalPlayerCard
                    cardRef={(node) => registerCardRef(`get-mobile-pick:${asset.id}:${index}`, node)}
                    player={null}
                    palette={null}
                    pick={asset}
                    side="get"
                    showSideBadge={false}
                    seasonStats={seasonStats}
                    compactTradeCard
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(outgoingAssetsForCallout.length > 0 || incomingAssetsForCallout.length > 0) && (
        <div className="hidden 2xl:flex items-start justify-center gap-2.5 px-3 pb-2"
          style={{ background: 'var(--color-fill)' }}>
          <div className="flex-1 flex flex-wrap justify-center gap-1.5 max-w-[680px]">
            {outgoingAssetsForCallout.map(asset => (
              <span key={asset.id} className="max-w-full">
                <AssetBadge asset={asset} />
              </span>
            ))}
          </div>
          <div className="shrink-0 text-base" style={{ visibility: 'hidden' }}>⇄</div>
          <div className="flex-1 flex flex-wrap justify-center gap-1.5 max-w-[680px]">
            {incomingAssetsForCallout.map(asset => (
              <span key={asset.id} className="max-w-full">
                <AssetBadge asset={asset} />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3"
        style={{ background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-separator-opaque)' }}>
        {insightsReady ? (
          isUpgradeResult ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-separator)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Why it helps you
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsMe}
                </p>
              </div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-separator)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Why it helps them
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsThem}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
                <span className="font-semibold" style={{ color: 'var(--color-label)' }}>You: </span>
                {proposal.whyItHelpsMe}
              </p>
              <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: 'var(--color-label)' }}>
                <span className="font-semibold" style={{ color: 'var(--color-label)' }}>Them: </span>
                {proposal.whyItHelpsThem}
              </p>
            </>
          )
        ) : (
          <div className="space-y-2">
            <div className="h-3.5 rounded-full" style={{ width: '68%', background: 'var(--color-fill)' }} />
            <div className="h-3.5 rounded-full" style={{ width: '92%', background: 'var(--color-fill)' }} />
          </div>
        )}
      </div>
    </div>
  );
});

TradeProposalItem.displayName = 'TradeProposalItem';

const PLAYER_COUNT_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

const PLAYER_COUNT_FILTER_OPTIONS_NO_ZERO = PLAYER_COUNT_FILTER_OPTIONS.filter((option) => option.value !== '0');

const PICK_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'without', label: 'No Picks' },
  { value: 'with', label: 'With Picks' },
];

const DEFAULT_PROPOSAL_FILTERS = Object.freeze({
  outgoingPlayers: 'any',
  incomingPlayers: 'any',
  outgoingPicks: 'any',
  incomingPicks: 'any',
});

const UPGRADE_RESULT_SORT_OPTIONS = [
  { id: 'manager', label: 'By Manager' },
  { id: 'best_delta', label: 'Best Delta' },
  { id: 'lightest_package', label: 'Lightest Package' },
];

const INTELLIGENCE_SORT_OPTIONS = [
  { id: 'best_fit', label: 'Best Fit' },
  { id: 'biggest_upgrade', label: 'Biggest Upgrade' },
  { id: 'lightest_cost', label: 'Lightest Cost' },
];

function sortIntelligenceProposals(proposals = [], sortMode = 'best_fit') {
  const indexed = (proposals ?? []).map((proposal, index) => ({ proposal, index }));

  if (sortMode === 'biggest_upgrade') {
    return indexed
      .sort((a, b) => getProposalUpgradeDelta(b.proposal) - getProposalUpgradeDelta(a.proposal)
        || (b.proposal?.plausibilityScore ?? 0) - (a.proposal?.plausibilityScore ?? 0)
        || a.index - b.index)
      .map(({ proposal }) => proposal);
  }

  if (sortMode === 'lightest_cost') {
    return indexed
      .sort((a, b) => getProposalOutgoingValue(a.proposal) - getProposalOutgoingValue(b.proposal)
        || countProposalAssets(a.proposal) - countProposalAssets(b.proposal)
        || getProposalUpgradeDelta(b.proposal) - getProposalUpgradeDelta(a.proposal)
        || a.index - b.index)
      .map(({ proposal }) => proposal);
  }

  return indexed.map(({ proposal }) => proposal);
}

function matchesProposalFilters(entry, filters) {
  if (filters.outgoingPlayers !== 'any' && entry.outgoingPlayers !== Number(filters.outgoingPlayers)) return false;
  if (filters.incomingPlayers !== 'any' && entry.incomingPlayers !== Number(filters.incomingPlayers)) return false;
  if (filters.outgoingPicks === 'with' && entry.outgoingPicks === 0) return false;
  if (filters.outgoingPicks === 'without' && entry.outgoingPicks > 0) return false;
  if (filters.incomingPicks === 'with' && entry.incomingPicks === 0) return false;
  if (filters.incomingPicks === 'without' && entry.incomingPicks > 0) return false;

  return true;
}

function nextProposalFilters(prev, key, value) {
  return {
    ...prev,
    [key]: prev[key] === value ? 'any' : value,
  };
}

const upgradeProposalSummaryCache = new WeakMap();

function getUpgradeProposalSummary(proposal) {
  if (!proposal) {
    return {
      yourUpgradeTitle: 'Current starter → Target',
      yourUpgradeMeta: '0.0 PPG → 0.0 PPG · +0.0',
      yourFallbackMeta: 'Closest fallback: None clear · Depth 0',
      theirSectionLabel: 'Their Benefit',
      theirNeedTitle: 'Need context unavailable',
      theirNeedStarterMeta: 'Starter context unavailable',
      theirNeedUpgradeMeta: 'Starter gain +0.0 PPG',
      fallbackLabel: 'Best Remaining Option After Trade',
      fallbackName: null,
      fallbackMeta: 'They would not have a clear same-position option after moving this player.',
    };
  }

  const cached = upgradeProposalSummaryCache.get(proposal);
  if (cached) return cached;

  const context = proposal.context ?? {};
  const theirUpgradeDelta = Number(context.theirUpgradeDelta ?? 0);
  const theirNeedRoomSizeBefore = context.theirNeedRoomSizeBefore ?? '—';
  const theirNeedRoomSizeAfter = context.theirNeedRoomSizeAfter ?? '—';
  const meaningfulStarterGain = theirUpgradeDelta >= 0.3;
  const shallowRoomBefore = Number.isFinite(context.theirNeedRoomSizeBefore) && Number(context.theirNeedRoomSizeBefore) <= 1;
  const outgoingPlayerAssets = (proposal?.outgoingAssets ?? []).filter((asset) => asset?.type === 'player');
  const outgoingPrimaryAsset = context.theirUpgradeWith ?? outgoingPlayerAssets[0] ?? null;
  const outgoingSamePosCount = Number(context.theirNeedIncomingPlayerCount ?? outgoingPlayerAssets.length);
  const theirStarterReferenceName = context.theirNeedStarter?.name ?? 'their weakest starter';
  const theirNeedPositionLabel = context.theirNeedPosition ?? proposal.theirNeedPosition ?? 'Position';
  const theirNeedUpgradeMetaParts = [];
  if (meaningfulStarterGain) {
    theirNeedUpgradeMetaParts.push(`Primary gain ${fmtSignedPpg(theirUpgradeDelta)} PPG vs ${theirStarterReferenceName}`);
  } else {
    theirNeedUpgradeMetaParts.push(`Starter gain ${fmtSignedPpg(theirUpgradeDelta)} PPG vs ${theirStarterReferenceName}`);
  }
  if (outgoingSamePosCount > 0) {
    theirNeedUpgradeMetaParts.push(`Adds ${outgoingSamePosCount} ${theirNeedPositionLabel}${outgoingSamePosCount === 1 ? '' : 's'} to the roster`);
  }
  theirNeedUpgradeMetaParts.push(`${theirNeedPositionLabel} roster ${theirNeedRoomSizeBefore} → ${theirNeedRoomSizeAfter}`);
  const fallbackDeltaReference = context.theirTradeAwayPlayer?.name ?? outgoingPrimaryAsset?.name ?? 'outgoing asset';
  const summary = {
    yourUpgradeTitle: `${context.myUpgradeFrom?.name ?? 'Current starter'} → ${context.myUpgradeTo?.name ?? 'Target'}`,
    yourUpgradeMeta: `${fmtPpg(context.myUpgradeFrom?.ppg ?? 0)} PPG → ${fmtPpg(context.myUpgradeTo?.ppg ?? 0)} PPG · +${fmtPpg(context.myUpgradeDelta ?? proposal.upgradeDelta ?? 0)} vs ${context.myUpgradeFrom?.name ?? 'current starter'}`,
    yourFallbackMeta: context.myNeedFallback
      ? `Closest fallback: ${context.myNeedFallback.name} · ${fmtPpg(context.myNeedFallback.ppg ?? 0)} PPG · Depth ${context.myNeedDepthCurrent ?? '—'}`
      : `Closest fallback: None clear · Depth ${context.myNeedDepthCurrent ?? 0}`,
    theirSectionLabel: meaningfulStarterGain
      ? 'Their Need'
      : shallowRoomBefore
        ? 'Their Depth Need'
        : 'Their Benefit',
    theirNeedTitle: context.theirNeedPosition ?? proposal.theirNeedPosition ?? 'Need context unavailable',
    theirNeedStarterMeta: context.theirNeedStarter
      ? `Weakest current starter: ${context.theirNeedStarter.name} · ${fmtPpg(context.theirNeedStarter.ppg ?? 0)} PPG`
      : 'Starter context unavailable',
    theirNeedUpgradeMeta: theirNeedUpgradeMetaParts.join(' · '),
    fallbackLabel: context.theirTradeAwayPosition ? `Best Remaining ${context.theirTradeAwayPosition} After Trade` : 'Best Remaining Option After Trade',
    fallbackName: context.theirTradeAwayFallback?.name ?? null,
    fallbackMeta: context.theirTradeAwayFallback
      ? `${fmtPpg(context.theirTradeAwayFallback.ppg ?? 0)} PPG · Change vs ${fallbackDeltaReference} ${fmtSignedPpg(context.theirTradeAwayDeltaVsOutgoing ?? 0)} PPG · Depth after ${context.theirTradeAwayDepthAfter ?? '—'}`
      : 'They would not have a clear same-position option after moving this player.',
  };

  upgradeProposalSummaryCache.set(proposal, summary);
  return summary;
}

const TRADE_RESULT_BLOCK_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '760px',
};

const UpgradeResultGroup = memo(function UpgradeResultGroup({
  group,
  managerName,
  initial,
  metaLine,
  darkMode,
  seasonStats,
  onApplyProposal,
  onOpenPlayer,
}) {
  return (
    <div
      className="pt-5 first:pt-0"
      style={{ borderTop: '1px solid var(--color-separator)', ...TRADE_RESULT_BLOCK_STYLE }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: 'var(--color-fill)', color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {initial}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-bold uppercase truncate" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>
              {managerName}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-label-secondary)' }}>
              {metaLine}
            </div>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] shrink-0" style={{ background: 'var(--color-fill)', color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {group.proposals.length} {group.proposals.length === 1 ? 'Path' : 'Paths'}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {group.proposals.map((proposal) => (
          <div key={proposal.id} style={TRADE_RESULT_BLOCK_STYLE}>
            <TradeProposalItem
              proposal={proposal}
              darkMode={darkMode}
              seasonStats={seasonStats}
              onApplyProposal={onApplyProposal}
              onOpenPlayer={onOpenPlayer}
              renderAllAssetsAsCards
              resultVariant="upgrade"

            />
          </div>
        ))}
      </div>
    </div>
  );
});

UpgradeResultGroup.displayName = 'UpgradeResultGroup';

function useStagedRender(items, initialCount, step = initialCount) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, items.length));
  const minimumVisibleCount = Math.min(initialCount, items.length);
  const effectiveVisibleCount = items.length > 0
    ? Math.min(items.length, Math.max(visibleCount, minimumVisibleCount))
    : 0;

  useEffect(() => {
    setVisibleCount((current) => {
      if (items.length === 0) return 0;
      if (current < minimumVisibleCount) return minimumVisibleCount;
      if (current > items.length) return items.length;
      return current;
    });
  }, [items.length, minimumVisibleCount]);

  useEffect(() => {
    if (effectiveVisibleCount >= items.length) return undefined;

    let cancelled = false;
    let handle = null;
    const schedule = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
      ? (callback) => window.requestIdleCallback(callback, { timeout: 180 })
      : (callback) => window.setTimeout(callback, 90);
    const cancel = typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
      ? (value) => window.cancelIdleCallback(value)
      : (value) => window.clearTimeout(value);

    const flushNext = () => {
      if (cancelled) return;
      setVisibleCount((current) => {
        if (current >= items.length) return current;
        const next = Math.min(items.length, current + step);
        if (next < items.length) {
          handle = schedule(flushNext);
        }
        return next;
      });
    };

    handle = schedule(flushNext);

    return () => {
      cancelled = true;
      if (handle != null) cancel(handle);
    };
  }, [effectiveVisibleCount, items.length, step]);

  return {
    visibleItems: items.slice(0, effectiveVisibleCount),
    visibleCount: effectiveVisibleCount,
    totalCount: items.length,
    hasMore: effectiveVisibleCount < items.length,
    showAll: () => setVisibleCount(items.length),
  };
}

function StagedRenderStatus({ visibleCount, totalCount, hasMore, onShowAll, label }) {
  if (!totalCount) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-label-tertiary)' }}>
        Showing {visibleCount} of {totalCount} {label}
      </span>
      {hasMore && (
        <button
          onClick={onShowAll}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            background: 'var(--color-fill)',
            color: 'var(--color-label-secondary)',
            border: '1px solid var(--color-separator)',
          }}
        >
          Show all
        </button>
      )}
    </div>
  );
}

function ManagerAvatar({ avatarHash, name, selected }) {
  if (avatarHash) {
    return (
      <img
        src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover"
        style={{ border: selected ? '2px solid var(--color-signature)' : '1px solid var(--color-separator)' }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black"
      style={{
        background: selected ? 'var(--color-signature)' : 'var(--color-fill)',
        color: selected ? 'var(--color-signature-fg)' : 'var(--color-label)',
        border: '1px solid var(--color-separator)',
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      {getManagerInitials(name)}
    </span>
  );
}

function TradeIntelligenceManagerSelector({
  partnerRosters = [],
  partnerRosterId,
  rosterById,
  standingMap,
  onPartnerChange,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const selectedRosterId = normalizeRosterId(partnerRosterId);
  const selectedEntry = selectedRosterId
    ? partnerRosters.find((entry) => normalizeRosterId(entry?.roster?.roster_id) === selectedRosterId) ?? null
    : null;
  const selectedEntryRosterId = normalizeRosterId(selectedEntry?.roster?.roster_id);
  const selectedRoster = selectedEntryRosterId ? (rosterById.get(selectedEntryRosterId) ?? selectedEntry?.roster ?? null) : null;
  const selectedMetaText = selectedEntry
    ? [getRosterRecordText(selectedRoster), standingMap.get(selectedEntryRosterId)].filter(Boolean).join(' · ') || 'League manager'
    : 'No trade partner selected';

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (mobileMenuRef.current?.contains(event.target)) return;
      setMobileMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <aside
      className="min-w-0 border-b p-4 xl:border-b-0 xl:border-r xl:p-5"
      data-testid="trade-intelligence-manager-selector"
      style={{ borderColor: 'var(--color-separator)', background: 'var(--color-bg-secondary)' }}
    >
      <div className="mb-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
          Trade Partner
        </div>
        <div className="mt-1 text-2xl font-black uppercase leading-none" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Managers
        </div>
      </div>

      {partnerRosters.length ? (
        <div className="relative xl:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors"
            style={{
              background: 'var(--color-fill)',
              borderColor: 'var(--color-signature)',
              color: 'var(--color-label)',
              boxShadow: '0 8px 20px color-mix(in srgb, var(--color-label) 8%, transparent)',
            }}
            aria-haspopup="listbox"
            aria-expanded={mobileMenuOpen}
            aria-label="Trade partner"
          >
            <ManagerAvatar avatarHash={selectedEntry?.avatarHash} name={selectedEntry?.displayName} selected />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold" style={{ color: 'var(--color-label)' }}>
                {selectedEntry?.displayName ?? 'Select Manager'}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                {selectedMetaText}
              </span>
            </span>
            {selectedEntry && (
              <span
                className="shrink-0 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]"
                style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
              >
                Active
              </span>
            )}
          </button>

          {mobileMenuOpen && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[min(360px,52vh)] overflow-y-auto rounded-xl border p-2 shadow-xl"
              style={{
                background: 'var(--color-bg)',
                borderColor: 'var(--color-separator)',
                boxShadow: '0 18px 40px color-mix(in srgb, var(--color-label) 16%, transparent)',
              }}
              role="listbox"
              aria-label="Trade partner"
            >
              {partnerRosters.map((entry) => {
                const rosterId = normalizeRosterId(entry?.roster?.roster_id);
                const roster = rosterById.get(rosterId) ?? entry?.roster ?? null;
                const selected = rosterId === selectedRosterId;
                const recordText = getRosterRecordText(roster);
                const standingText = standingMap.get(rosterId);
                const metaText = [recordText, standingText].filter(Boolean).join(' · ') || 'League manager';
                return (
                  <button
                    key={rosterId}
                    type="button"
                    onClick={() => {
                      onPartnerChange?.(rosterId);
                      setMobileMenuOpen(false);
                    }}
                    data-testid={`trade-intelligence-partner-mobile-${rosterId}`}
                    className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                    style={{
                      background: selected ? 'var(--color-fill-secondary)' : 'var(--color-bg)',
                      borderColor: selected ? 'var(--color-signature)' : 'transparent',
                      color: 'var(--color-label)',
                    }}
                    role="option"
                    aria-selected={selected}
                  >
                    <ManagerAvatar avatarHash={entry.avatarHash} name={entry.displayName} selected={selected} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold" style={{ color: 'var(--color-label)' }}>
                        {entry.displayName}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                        {metaText}
                      </span>
                    </span>
                    {selected && (
                      <span
                        className="shrink-0 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]"
                        style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
                      >
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="hidden gap-2 overflow-x-auto pb-1 scrollbar-hide xl:flex xl:flex-col xl:overflow-visible xl:pb-0">
        {partnerRosters.length ? partnerRosters.map((entry) => {
          const rosterId = normalizeRosterId(entry?.roster?.roster_id);
          const roster = rosterById.get(rosterId) ?? entry?.roster ?? null;
          const selected = rosterId === selectedRosterId;
          const recordText = getRosterRecordText(roster);
          const standingText = standingMap.get(rosterId);
          const metaText = [recordText, standingText].filter(Boolean).join(' · ') || 'League manager';

          return (
            <button
              key={rosterId}
              type="button"
              onClick={() => onPartnerChange?.(rosterId)}
              data-testid={`trade-intelligence-partner-${rosterId}`}
              aria-pressed={selected}
              className="flex min-w-[13.5rem] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors xl:min-w-0"
              style={{
                background: selected ? 'var(--color-fill)' : 'var(--color-bg)',
                borderColor: selected ? 'var(--color-signature)' : 'var(--color-separator)',
                color: 'var(--color-label)',
                boxShadow: selected ? '0 8px 20px color-mix(in srgb, var(--color-label) 8%, transparent)' : 'none',
              }}
            >
              <ManagerAvatar avatarHash={entry.avatarHash} name={entry.displayName} selected={selected} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold" style={{ color: 'var(--color-label)' }}>
                  {entry.displayName}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                  {metaText}
                </span>
              </span>
              {selected && (
                <span
                  className="shrink-0 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]"
                  style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
                >
                  Active
                </span>
              )}
            </button>
          );
        }) : (
          <div className="rounded-xl border px-3 py-4 text-sm" style={{ borderColor: 'var(--color-separator)', color: 'var(--color-label-secondary)' }}>
            No trade partners are available in this league.
          </div>
        )}
      </div>
    </aside>
  );
}

const TradeProposalPanel = memo(function TradeProposalPanel({
  partnerRosterId,
  partnerName,
  partnerRosters = [],
  rosters = [],
  ownerNameByRosterId = null,
  tradeProposals,
  surplusTradeProposals,
  activeMode,
  proposalFilters,
  onProposalFiltersChange,
  onModeChange,
  onPartnerChange,
  onApplyProposal,
  onOpenPlayer,
  isPreparingPartner = false,
  isShowingStaleResults = false,
}) {
  const { darkMode } = useTheme();
  const { seasonStats } = useSleeperStats();
  const [proposalSortMode, setProposalSortMode] = useState('best_fit');
  const deferredProposalFilters = useDeferredValue(proposalFilters);
  useEffect(() => {
    onProposalFiltersChange((prev) => {
      let next = prev;

      if (activeMode === 'needs' && prev.incomingPlayers === '0') {
        next = next === prev ? { ...next } : next;
        next.incomingPlayers = 'any';
      }

      if (activeMode === 'surplus' && prev.outgoingPlayers === '0') {
        next = next === prev ? { ...next } : next;
        next.outgoingPlayers = 'any';
      }

      return next;
    });
  }, [activeMode, onProposalFiltersChange]);
  const activeProposals = activeMode === 'surplus' ? surplusTradeProposals : tradeProposals;
  const sortedActiveProposals = useMemo(
    () => sortIntelligenceProposals(activeProposals, proposalSortMode),
    [activeProposals, proposalSortMode],
  );
  const proposalFilterEntries = useMemo(
    () => sortedActiveProposals.map(buildProposalFilterEntry),
    [sortedActiveProposals],
  );
  const { filteredProposals } = useMemo(
    () => buildFilteredProposalLayout(proposalFilterEntries, deferredProposalFilters),
    [proposalFilterEntries, deferredProposalFilters],
  );
  const stagedProposals = useStagedRender(filteredProposals, 5, 5);
  const rosterById = useMemo(() => new Map(
    (rosters ?? []).map((roster) => [normalizeRosterId(roster?.roster_id), roster]),
  ), [rosters]);
  const standingMap = useMemo(() => buildRosterStandingMap(rosters), [rosters]);
  const selectedPartnerName = partnerName
    ?? (partnerRosterId ? ownerNameByRosterId?.get?.(partnerRosterId) : null)
    ?? null;
  const hasActiveFilters = Object.values(proposalFilters).some((value) => value !== 'any');
  const activeEmptyText = activeMode === 'surplus'
    ? 'No surplus-driven trade ideas are available right now.'
    : 'No need-driven trade ideas are available right now.';
  const outgoingPlayerFilterDisabledValue = activeMode === 'surplus' ? '0' : null;
  const activeModeLabel = activeMode === 'surplus' ? 'Use Surplus' : 'Fix Needs';
  const resultCountLabel = filteredProposals.length === 1 ? 'idea' : 'ideas';
  const proposalListTransitionStyle = getTradeProposalListTransitionStyle({
    isDimmed: false,
    isStale: isShowingStaleResults,
  });

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      data-testid="trade-intelligence-workspace"
      style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-separator)' }}
    >
      <div className="grid min-w-0 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <TradeIntelligenceManagerSelector
          partnerRosters={partnerRosters}
          partnerRosterId={partnerRosterId}
          rosterById={rosterById}
          standingMap={standingMap}
          onPartnerChange={onPartnerChange}
        />

        <div className="min-w-0">
          <header className="border-b p-4 lg:p-5" style={{ borderColor: 'var(--color-separator)' }}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
                  Trade Intelligence
                </div>
                <h3 className="mt-1 text-3xl font-black uppercase leading-none" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {partnerRosterId ? `Ideas With ${selectedPartnerName || 'This Manager'}` : 'Choose A Trade Partner'}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  {partnerRosterId
                    ? 'Scan need-based and surplus-driven packages, then send the best fit into Agent for final tuning.'
                    : 'Pick a manager to generate partner-specific trade ideas from roster needs, surplus, and movable picks.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {partnerRosterId && (
                  <span
                    className="rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em]"
                    data-testid="trade-intelligence-result-count"
                    style={{ background: 'var(--color-fill)', color: 'var(--color-label)', border: '1px solid var(--color-separator)' }}
                  >
                    {filteredProposals.length} {resultCountLabel}
                  </span>
                )}
                {hasActiveFilters && (
                  <CompanionSelectorButton
                    onClick={() => onProposalFiltersChange(DEFAULT_PROPOSAL_FILTERS)}
                    data-testid="trade-intelligence-reset-filters"
                    size="sm"
                  >
                    Reset Filters
                  </CompanionSelectorButton>
                )}
              </div>
            </div>

            {partnerRosterId && (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <CompanionSelectorRail ariaLabel="Trade idea mode">
                    {[
                      { id: 'needs', label: 'Fix Needs' },
                      { id: 'surplus', label: 'Use Surplus' },
                    ].map((option) => {
                      const active = activeMode === option.id;
                      return (
                        <CompanionSelectorButton
                          key={option.id}
                          role="tab"
                          aria-selected={active}
                          active={active}
                          size="md"
                          onClick={() => onModeChange?.(option.id)}
                          data-testid={`trade-intelligence-mode-${option.id}`}
                        >
                          {option.label}
                        </CompanionSelectorButton>
                      );
                    })}
                  </CompanionSelectorRail>

                  <CompanionSelectorRail ariaLabel="Sort trade ideas">
                    {INTELLIGENCE_SORT_OPTIONS.map((option) => {
                      const active = proposalSortMode === option.id;
                      return (
                        <CompanionSelectorButton
                          key={option.id}
                          active={active}
                          onClick={() => setProposalSortMode(option.id)}
                          data-testid={`trade-intelligence-sort-${option.id}`}
                        >
                          {option.label}
                        </CompanionSelectorButton>
                      );
                    })}
                  </CompanionSelectorRail>
                </div>

                <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4" data-testid="trade-intelligence-filters">
                  {[
                    { key: 'outgoingPlayers', label: 'Players I Send', options: PLAYER_COUNT_FILTER_OPTIONS },
                    { key: 'incomingPlayers', label: 'Players I Get', options: activeMode === 'needs' ? PLAYER_COUNT_FILTER_OPTIONS_NO_ZERO : PLAYER_COUNT_FILTER_OPTIONS },
                    { key: 'outgoingPicks', label: 'Picks I Send', options: PICK_FILTER_OPTIONS },
                    { key: 'incomingPicks', label: 'Picks I Get', options: PICK_FILTER_OPTIONS },
                  ].map((group) => (
                    <div key={group.key} className="rounded-xl border px-3 py-2.5" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-separator)' }}>
                      <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--color-label-tertiary)' }}>
                        {group.label}
                      </span>
                      <div className="mt-2">
                      <CompanionSelectorRail ariaLabel={group.label}>
                        {group.options.map((option) => {
                          const active = proposalFilters[group.key] === option.value;
                          const disabled = group.key === 'outgoingPlayers' && option.value === outgoingPlayerFilterDisabledValue;
                          return (
                            <CompanionSelectorButton
                              key={option.value}
                              disabled={disabled}
                              active={active}
                              size="xs"
                              onClick={() => {
                                if (disabled) return;
                                onProposalFiltersChange((prev) => nextProposalFilters(prev, group.key, option.value));
                              }}
                              data-testid={`trade-intelligence-filter-${group.key}-${option.value}`}
                              title={disabled ? 'Pick-only outgoing packages are only available in Fix Needs.' : undefined}
                            >
                              {option.label}
                            </CompanionSelectorButton>
                          );
                        })}
                      </CompanionSelectorRail>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </header>

          <div className="p-4 lg:p-5">
            {!partnerRosterId ? (
              <div
                className="rounded-2xl border px-5 py-8 text-center"
                data-testid="trade-intelligence-empty"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-separator)', color: 'var(--color-label-secondary)' }}
              >
                <div className="text-lg font-black uppercase" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Choose A Manager
                </div>
                <div className="mt-1 text-sm">
                  Intelligence will build trade ideas after you pick a partner.
                </div>
              </div>
            ) : isPreparingPartner && !activeProposals.length ? (
              <div
                className="rounded-2xl border px-5 py-8"
                data-testid="trade-intelligence-loading"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-separator)' }}
              >
                <div className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                  <Spinner size="w-4 h-4" />
                  Preparing trade ideas for this manager...
                </div>
              </div>
            ) : !activeProposals.length ? (
              <div
                className="rounded-2xl border px-5 py-8 text-center text-sm"
                data-testid="trade-intelligence-no-ideas"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-separator)', color: 'var(--color-label-secondary)' }}
              >
                {activeEmptyText}
              </div>
            ) : !filteredProposals.length ? (
              <div
                className="rounded-2xl border px-5 py-8 text-center text-sm"
                data-testid="trade-intelligence-no-filtered-ideas"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-separator)', color: 'var(--color-label-secondary)' }}
              >
                No trade ideas match your current filters.
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--color-separator)' }}>
                  <div className="min-w-0">
                    <h4 className="flex flex-wrap items-center gap-2 text-2xl font-black uppercase leading-none" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      Trade Ideas
                      <span
                        className="rounded-md px-2 py-1 text-sm font-black tabular-nums"
                        style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {filteredProposals.length}
                      </span>
                    </h4>
                    <div className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                      {activeModeLabel} · {selectedPartnerName || 'Selected manager'} · sorted by {INTELLIGENCE_SORT_OPTIONS.find((option) => option.id === proposalSortMode)?.label ?? 'Best Fit'}
                    </div>
                  </div>

                  {(isPreparingPartner || isShowingStaleResults) && (
                    <div
                      className="inline-flex w-max items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold"
                      data-testid="trade-intelligence-refreshing"
                      style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}
                    >
                      <Spinner size="w-3.5 h-3.5" />
                      {isShowingStaleResults ? 'Updating manager...' : 'Refreshing ideas...'}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4" style={proposalListTransitionStyle}>
                  {stagedProposals.visibleItems.map((proposal, index) => (
                    <div key={proposal.id} style={TRADE_RESULT_BLOCK_STYLE}>
                      <TradeProposalItem
                        proposal={proposal}
                        darkMode={darkMode}
                        seasonStats={seasonStats}
                        onApplyProposal={onApplyProposal}
                        onOpenPlayer={onOpenPlayer}
                        containerClassName="w-full"
                        renderAllAssetsAsCards
                        deferInsights={index > 2}
                        resultVariant="intelligence"
                      />
                    </div>
                  ))}
                </div>

                <StagedRenderStatus
                  visibleCount={stagedProposals.visibleCount}
                  totalCount={stagedProposals.totalCount}
                  hasMore={stagedProposals.hasMore}
                  onShowAll={stagedProposals.showAll}
                  label="trade ideas"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});

TradeProposalPanel.displayName = 'TradeProposalPanel';


export {
  DEFAULT_PROPOSAL_FILTERS,
  TradeProposalItem,
  UpgradeResultGroup,
  useStagedRender,
  StagedRenderStatus,
  UPGRADE_RESULT_SORT_OPTIONS,
  getProposalUpgradeDelta,
  getProposalOutgoingValue,
  countProposalAssets,
  getManagerInitials,
  buildRosterStandingMap,
  buildManagerMetaLine,
  sortUpgradeResultGroups,
};

export default TradeProposalPanel;
