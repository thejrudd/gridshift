import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AVAILABLE_SLEEPER_SEASONS,
  useSleeperLeague,
  useSleeperStats,
} from '../../context/SleeperContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import HorizontalScrollCue from '../HorizontalScrollCue.jsx';
import useHorizontalScrollCue from '../../hooks/useHorizontalScrollCue.js';
import {
  CompanionSearchField,
  CompanionSelectorButton,
  CompanionSelectorRail,
} from './CompanionSelectorControls.jsx';
import {
  getCompanionInitials,
  getNflTeamLogoUrl,
  getSleeperAvatarUrl,
  getSleeperPlayerImageUrl,
} from '../../utils/companionAssetVisuals.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import {
  getLeagueTradeHistorySnapshot,
  getTradeHistoryAssetLabel,
  getTradeHistoryFaabTotal,
  normalizeTradeHistorySeason,
  tradeHistoryMatches,
} from '../../utils/tradeHistory.js';

const LOAD_CONCURRENCY = 2;

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function formatTradeDate(timestamp) {
  if (!timestamp) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function ManagerAvatar({ manager }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = !failed ? getSleeperAvatarUrl(manager?.avatarHash) : null;
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      className="trade-history-manager-avatar"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="trade-history-manager-avatar trade-history-manager-avatar--fallback" aria-hidden="true">
      {getCompanionInitials(manager?.name)}
    </span>
  );
}

function HistoryAssetCard({ asset, darkMode, destinationName = null, onViewPlayer = null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isPlayer = asset.type === 'player';
  const isPick = asset.type === 'pick';
  const isDrillable = isPlayer && Boolean(asset.id) && typeof onViewPlayer === 'function';
  const theme = isPlayer ? getTeamVisualTheme(asset.team, darkMode, { logoSide: 'end' }) : null;
  const playerImageUrl = isPlayer && !imageFailed ? getSleeperPlayerImageUrl(asset.id) : null;
  const logoUrl = isPlayer ? getNflTeamLogoUrl(theme?.logoKey) : null;
  const label = getTradeHistoryAssetLabel(asset);
  const CardTag = isDrillable ? 'button' : 'article';

  return (
    <CardTag
      type={isDrillable ? 'button' : undefined}
      className={`trade-history-asset-card trade-history-asset-card--${asset.type}`}
      style={isPlayer ? {
        '--trade-history-card-bg': theme?.gradient ?? 'var(--color-fill)',
        '--trade-history-card-overlay': theme?.gradientOverlay ?? 'none',
        '--trade-history-card-fg': theme?.gradientForeground ?? 'var(--color-label)',
        '--trade-history-card-muted': theme?.gradientMuted ?? 'var(--color-label-secondary)',
      } : undefined}
      aria-label={isDrillable ? `Open ${label} statistics` : label}
      onClick={isDrillable ? () => onViewPlayer(asset.id) : undefined}
    >
      <div className="trade-history-asset-card__visual">
        {isPlayer && <span className="trade-history-asset-card__overlay" aria-hidden="true" />}
        {playerImageUrl ? (
          <img
            src={playerImageUrl}
            alt=""
            className="trade-history-asset-card__player"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : isPlayer ? (
          <span className="trade-history-asset-card__initials" aria-hidden="true">
            {getCompanionInitials(asset.label)}
          </span>
        ) : isPick ? (
          <>
            <span className="trade-history-asset-card__hero">{Number.isFinite(asset.round) ? asset.round : '-'}</span>
            <span className="trade-history-asset-card__hero-label">Round</span>
          </>
        ) : (
          <>
            <span className="trade-history-asset-card__hero">${asset.amount}</span>
            <span className="trade-history-asset-card__hero-label">FAAB</span>
          </>
        )}
        {isPlayer && logoUrl && (
          <span className="trade-history-asset-card__logo-badge" style={{ background: theme.logoBadgeBg, borderColor: theme.logoBadgeBorder }}>
            <img src={logoUrl} alt="" loading="lazy" decoding="async" />
          </span>
        )}
      </div>
      <div className="trade-history-asset-card__body">
        <div className="trade-history-asset-card__name">{label}</div>
        <div className="trade-history-asset-card__meta">
          {isPlayer
            ? [asset.team, asset.position].filter(Boolean).join(' - ')
            : isPick
              ? 'Draft pick'
              : 'Waiver budget'}
        </div>
        {destinationName && (
          <div className="trade-history-asset-card__destination">To {destinationName}</div>
        )}
      </div>
    </CardTag>
  );
}

function AssetRail({ assets, sides, darkMode, onViewPlayer }) {
  const railRef = useRef(null);
  const cue = useHorizontalScrollCue(railRef, [assets]);
  const isMultiManager = sides.length > 2;
  const managerByRosterId = useMemo(
    () => new Map(sides.map((side) => [side.rosterId, side.manager])),
    [sides],
  );

  return (
    <div className="trade-history-asset-rail-shell">
      <div ref={railRef} className="trade-history-asset-rail">
        {assets.map((asset, index) => (
          <HistoryAssetCard
            key={`${asset.type}:${asset.id ?? asset.year ?? asset.amount}:${index}`}
            asset={asset}
            darkMode={darkMode}
            destinationName={isMultiManager ? managerByRosterId.get(asset.toRosterId)?.name : null}
            onViewPlayer={onViewPlayer}
          />
        ))}
      </div>
      <HorizontalScrollCue
        left={cue.left}
        right={cue.right}
        targetRef={railRef}
        label="trade assets"
      />
    </div>
  );
}

function TradeSide({ side, sides, darkMode, onViewPlayer }) {
  const otherManagers = sides.filter((candidate) => candidate.rosterId !== side.rosterId);
  const recipientLabel = otherManagers.length === 1 ? ` to ${otherManagers[0].manager.name}` : '';
  return (
    <div className="trade-history-side">
      <div className="trade-history-side__header">
        <ManagerAvatar manager={side.manager} />
        <div className="min-w-0">
          <div className="trade-history-side__sent">{side.manager.name} sent{recipientLabel}</div>
          <div className="trade-history-side__team">{side.manager.teamName}</div>
        </div>
      </div>
      {side.assets.length > 0 ? (
        <AssetRail assets={side.assets} sides={sides} darkMode={darkMode} onViewPlayer={onViewPlayer} />
      ) : (
        <div className="trade-history-side__empty">No outgoing assets recorded.</div>
      )}
    </div>
  );
}

function summarizeSide(side) {
  const first = getTradeHistoryAssetLabel(side.assets[0]);
  if (!first) return 'No assets';
  return side.assets.length > 1 ? `${first} +${side.assets.length - 1}` : first;
}

function TradeRow({ trade, expanded, onToggle, darkMode, onViewPlayer }) {
  const faabTotal = getTradeHistoryFaabTotal(trade);
  const managerNames = trade.sides.map((side) => side.manager.name);
  const teamNames = trade.sides.map((side) => side.manager.teamName);
  const isTwoPartyTrade = trade.sides.length === 2;
  const managerSummary = managerNames.join(isTwoPartyTrade ? ' ↔ ' : ' · ');
  const assetSummary = trade.sides.map(summarizeSide).join(isTwoPartyTrade ? ' for ' : ' · ');
  return (
    <article className={`trade-history-transaction${expanded ? ' is-open' : ''}`} data-testid={`trade-history-transaction-${trade.id}`}>
      <button
        type="button"
        className="trade-history-transaction__summary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="trade-history-transaction__when">
          <span className="trade-history-transaction__date">{formatTradeDate(trade.timestamp)}</span>
          <span className="trade-history-transaction__week">{trade.isRegularSeason && trade.week ? `Week ${trade.week}` : 'Pre-season'}</span>
        </span>
        <span className="trade-history-transaction__who">
          <span className="trade-history-transaction__managers">{managerSummary}</span>
          <span className="trade-history-transaction__teams">{teamNames.join(' - ')}</span>
          <span className="trade-history-transaction__assets">{assetSummary}</span>
        </span>
        <span className="trade-history-transaction__actions">
          {faabTotal > 0 && <span className="trade-history-faab-badge">${faabTotal} FAAB</span>}
          <svg className="trade-history-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="trade-history-transaction__detail">
          <div className={`trade-history-exchange${trade.sides.length > 2 ? ' is-multi' : ''}`}>
            {trade.sides.map((side) => (
              <TradeSide
                key={side.rosterId}
                side={side}
                sides={trade.sides}
                darkMode={darkMode}
                onViewPlayer={onViewPlayer}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function HistoryState({ title, message, actionLabel = null, onAction = null }) {
  return (
    <div className="trade-history-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && (
        <button type="button" onClick={onAction} className="trade-history-state__action">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="trade-history-skeleton" aria-label="Loading trade history">
      {[0, 1].map((group) => (
        <div key={group} className="trade-history-skeleton__group">
          <span className="trade-history-skeleton__heading" />
          {[0, 1, 2].map((row) => <span key={row} className="trade-history-skeleton__row" />)}
        </div>
      ))}
    </div>
  );
}

export default function TradeHistory({ onViewPlayer = null }) {
  const {
    season,
    linkedLeagueHistory,
  } = useSleeperLeague();
  const { players, loadPlayers } = useSleeperStats();
  const { darkMode } = useTheme();
  const [snapshots, setSnapshots] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState('');
  const [managerId, setManagerId] = useState('all');
  const [openSeasons, setOpenSeasons] = useState(() => new Set([String(season)]));
  const [expandedTrades, setExpandedTrades] = useState(() => new Set());

  const eligibleLeagueHistory = useMemo(() => (
    (linkedLeagueHistory ?? [])
      .filter((entry) => Number(entry.season) <= Number(season))
      .sort((left, right) => Number(right.season) - Number(left.season))
  ), [linkedLeagueHistory, season]);

  useEffect(() => {
    if (!players) void loadPlayers();
  }, [loadPlayers, players]);

  useEffect(() => {
    let cancelled = false;
    const latestSeason = AVAILABLE_SLEEPER_SEASONS[0];

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setSnapshots(null);
      setLoadError('');
      if (eligibleLeagueHistory.length === 0) {
        setSnapshots([]);
        return;
      }

      try {
        const nextSnapshots = await mapWithConcurrency(
          eligibleLeagueHistory,
          LOAD_CONCURRENCY,
          (entry) => getLeagueTradeHistorySnapshot({
            leagueId: entry.league.league_id,
            season: entry.season,
            completed: Number(entry.season) < Number(latestSeason),
          }),
        );
        if (!cancelled) setSnapshots(nextSnapshots);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message ?? 'Trade history could not be loaded.');
          setSnapshots([]);
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [eligibleLeagueHistory, retryToken]);

  const seasonGroups = useMemo(() => (
    (snapshots ?? []).map((snapshot) => ({
      season: String(snapshot.season),
      trades: normalizeTradeHistorySeason(snapshot, players ?? {}),
    })).sort((left, right) => Number(right.season) - Number(left.season))
  ), [players, snapshots]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setOpenSeasons(new Set([String(season)]));
      const firstCurrentTrade = seasonGroups.find((group) => group.season === String(season))?.trades?.[0];
      setExpandedTrades(firstCurrentTrade ? new Set([firstCurrentTrade.id]) : new Set());
      setManagerId('all');
      setQuery('');
    });
    return () => { cancelled = true; };
  }, [season, seasonGroups]);

  const managerOptions = useMemo(() => {
    const managers = new Map();
    seasonGroups.forEach((group) => group.trades.forEach((trade) => trade.sides.forEach((side) => {
      if (!managers.has(side.manager.id)) managers.set(side.manager.id, side.manager);
    })));
    return [...managers.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [seasonGroups]);

  const filtering = Boolean(query.trim()) || managerId !== 'all';
  const visibleGroups = useMemo(() => seasonGroups.map((group) => ({
    ...group,
    visibleTrades: group.trades.filter((trade) => tradeHistoryMatches(trade, query, managerId)),
  })).filter((group) => !filtering || group.visibleTrades.length > 0), [filtering, managerId, query, seasonGroups]);
  const totalTrades = seasonGroups.reduce((sum, group) => sum + group.trades.length, 0);
  const visibleTrades = visibleGroups.reduce((sum, group) => sum + group.visibleTrades.length, 0);
  const loading = snapshots == null || (snapshots.length > 0 && !players);

  const clearFilters = () => {
    setQuery('');
    setManagerId('all');
  };

  return (
    <div className="trade-history-page" data-testid="trade-history-page" data-tour="trade-history-content">
      <header className="trade-history-header">
        <h1>Trade History</h1>
        <p>Linked league - {season} season and earlier - finalized only</p>
      </header>

      <div className="trade-history-toolbar">
        <CompanionSearchField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search managers, teams, players, picks, FAAB"
          inputProps={{ 'aria-label': 'Search trade history' }}
        />
        <CompanionSelectorRail ariaLabel="Filter trade history by manager">
          <CompanionSelectorButton active={managerId === 'all'} onClick={() => setManagerId('all')}>
            All Managers
          </CompanionSelectorButton>
          {managerOptions.map((manager) => (
            <CompanionSelectorButton
              key={manager.id}
              active={managerId === manager.id}
              onClick={() => setManagerId((current) => current === manager.id ? 'all' : manager.id)}
            >
              {manager.name}
            </CompanionSelectorButton>
          ))}
        </CompanionSelectorRail>
      </div>

      {loading && <HistorySkeleton />}
      {!loading && loadError && (
        <HistoryState
          title="Couldn't load history"
          message="Something went wrong while loading this league's finalized trades. Your league data is unaffected."
          actionLabel="Retry"
          onAction={() => setRetryToken((value) => value + 1)}
        />
      )}
      {!loading && !loadError && totalTrades === 0 && (
        <HistoryState
          title="No trades yet"
          message="No finalized trades were found in this linked league history. Completed trades will appear here automatically."
        />
      )}
      {!loading && !loadError && totalTrades > 0 && filtering && visibleTrades === 0 && (
        <HistoryState
          title="No matches"
          message="No finalized trades match your search or manager filter."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      )}

      {!loading && !loadError && visibleTrades > 0 && (
        <div className="trade-history-seasons">
          {visibleGroups.map((group) => {
            const forcedOpen = filtering;
            const isOpen = forcedOpen || openSeasons.has(group.season);
            const countLabel = filtering
              ? `${group.visibleTrades.length} of ${group.trades.length} finalized ${group.trades.length === 1 ? 'trade' : 'trades'}`
              : `${group.trades.length} finalized ${group.trades.length === 1 ? 'trade' : 'trades'}`;
            return (
              <section key={group.season} className="trade-history-season" data-testid={`trade-history-season-${group.season}`}>
                <button
                  type="button"
                  className={`trade-history-season__header${isOpen ? ' is-open' : ''}`}
                  onClick={() => setOpenSeasons((current) => {
                    const next = new Set(current);
                    if (next.has(group.season)) next.delete(group.season);
                    else next.add(group.season);
                    return next;
                  })}
                  aria-expanded={isOpen}
                >
                  <span className="trade-history-season__year">{group.season}</span>
                  <span className="trade-history-season__count">{countLabel}</span>
                  <svg className="trade-history-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="trade-history-season__rows">
                    {group.visibleTrades.length === 0 ? (
                      <div className="trade-history-season__empty">
                        No finalized trades in this season.
                      </div>
                    ) : group.visibleTrades.map((trade) => (
                      <TradeRow
                        key={trade.id}
                        trade={trade}
                        darkMode={darkMode}
                        expanded={expandedTrades.has(trade.id)}
                        onToggle={() => setExpandedTrades((current) => {
                          const next = new Set(current);
                          if (next.has(trade.id)) next.delete(trade.id);
                          else next.add(trade.id);
                          return next;
                        })}
                        onViewPlayer={onViewPlayer}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
