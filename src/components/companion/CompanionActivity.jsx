import { useEffect, useMemo, useState } from 'react';
import { useLeagueSource } from '../../context/LeagueSourceContext.js';
import { useFantasyStats } from '../../context/SleeperContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useGridShiftActivity } from '../../hooks/useGridShiftLeague.js';
import useLeagueHistoryData from '../../hooks/useLeagueHistoryData.js';
import {
  getCompanionInitials,
  getCompanionPlayerImageUrls,
  getNflTeamLogoUrl,
  getSleeperAvatarUrl,
} from '../../utils/companionAssetVisuals.js';
import { matchesGridShiftActivityFilter } from '../../utils/gridshiftActivity.js';
import { LEAGUE_PROVIDER_IDS } from '../../utils/leagueProviderContract.js';
import { buildSleeperActivityModel } from '../../utils/sleeperLeagueAdapter.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import EmptyState from '../ui/EmptyState.jsx';
import LeagueHistoryIcon from './LeagueHistoryIcon.jsx';
import LeagueHistoryState from './LeagueHistoryState.jsx';

// One League Activity view for both providers (Stage 5.2): a Sleeper league's
// entries come from the Sleeper adapter (unchanged output), a GridShift
// league's from the platform activity feed (src/utils/gridshiftActivity.js),
// which adds settings (roster lock and freeze included), adjustments, draft,
// and commissioner roster changes with before/after. Lineup and IR-slot moves
// are not activity (user decision, 2026-10-29).
const TYPE_META = {
  trade: { label: 'Trade', tone: 'signature', icon: 'swap' },
  pick: { label: 'Draft capital', tone: 'orange', icon: 'diamond' },
  waiver: { label: 'Waiver', tone: 'blue', icon: 'plus' },
  free_agent: { label: 'Free agent', tone: 'green', icon: 'plus' },
  commissioner: { label: 'Commissioner', tone: 'neutral', icon: 'diamond' },
  // GridShift-league events.
  draft: { label: 'Draft', tone: 'orange', icon: 'diamond' },
  adjustment: { label: 'Score', tone: 'blue', icon: 'target' },
  settings: { label: 'Settings', tone: 'neutral', icon: 'diamond' },
  league: { label: 'League', tone: 'neutral', icon: 'diamond' },
};

const MOVE_META = {
  add: { label: 'Added to', tone: 'green', icon: 'plus' },
  drop: { label: 'Dropped by', tone: 'red', icon: 'minus' },
  trade: { label: 'Traded to', tone: 'signature', icon: 'swap' },
  pick: { label: 'Sent to', tone: 'orange', icon: 'diamond' },
  draft: { label: 'Drafted by', tone: 'orange', icon: 'diamond' },
};

const COLLAPSE_THRESHOLD = 4;
const COLLAPSED_MOVE_COUNT = 3;

function formatDate(timestamp) {
  if (!timestamp) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function activityDisplayType(entry) {
  if (entry.type === 'trade' && entry.draftPicks.length > 0 && entry.adds.length === 0 && entry.drops.length === 0) return 'pick';
  return entry.type;
}

function matchesFilter(entry, filter) {
  if (Array.isArray(entry.tags)) return matchesGridShiftActivityFilter(entry, filter);
  if (filter === 'all') return true;
  if (filter === 'pick') return entry.draftPicks.length > 0;
  return entry.type === filter;
}

function buildActivityMoves(entry) {
  const moves = [];
  const tradedPlayerIds = new Set();
  const dropsByPlayerId = new Map(entry.drops.map((asset) => [asset.playerId, asset]));

  entry.adds.forEach((asset) => {
    const source = dropsByPlayerId.get(asset.playerId) ?? null;
    if (entry.type === 'trade') tradedPlayerIds.add(asset.playerId);
    moves.push({
      id: `${entry.id}:add:${asset.playerId}`,
      kind: entry.type === 'trade' ? 'trade' : entry.type === 'draft' ? 'draft' : 'add',
      asset,
      sourceTeam: source?.team ?? null,
      team: asset.team,
    });
  });

  entry.drops.forEach((asset) => {
    if (tradedPlayerIds.has(asset.playerId)) return;
    moves.push({ id: `${entry.id}:drop:${asset.playerId}`, kind: 'drop', asset, team: asset.team });
  });

  entry.draftPicks.forEach((pick, index) => {
    moves.push({
      id: `${entry.id}:pick:${pick.season}:${pick.round}:${index}`,
      kind: 'pick',
      pick,
      team: pick.team,
      sourceTeam: pick.originalTeam,
    });
  });

  return moves;
}

function FantasyTeamAvatar({ team }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = !failed ? getSleeperAvatarUrl(team?.avatarHash) : null;
  if (!avatarUrl) return null;
  return (
    <img
      className="league-activity-team-avatar"
      src={avatarUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function ActivityPlayerVisual({ asset, darkMode, onViewPlayer }) {
  // GridShift assets carry a matched core catalog id ('' when unmatched).
  const sleeperId = asset.sleeperId ?? asset.playerId;
  const imageUrls = useMemo(() => getCompanionPlayerImageUrls({
    id: sleeperId,
    sleeperId,
    espnId: asset.espnId,
  }), [asset.espnId, sleeperId]);
  const [failedImageCount, setFailedImageCount] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const imageUrl = imageUrls[failedImageCount] ?? null;
  const theme = getTeamVisualTheme(asset.nflTeam, darkMode, { logoSide: 'end' });
  const logoUrl = getNflTeamLogoUrl(theme.logoKey);
  const drillId = asset.drillId !== undefined ? asset.drillId : asset.playerId;
  const isDrillable = Boolean(drillId && typeof onViewPlayer === 'function');
  const PlayerVisualTag = isDrillable ? 'button' : 'div';

  return (
    <PlayerVisualTag
      type={isDrillable ? 'button' : undefined}
      className={`league-activity-player${isDrillable ? ' is-drillable' : ''}`}
      style={{
        '--activity-player-bg': theme.gradient ?? 'var(--color-fill)',
        '--activity-player-overlay': theme.gradientOverlay ?? 'none',
        '--activity-player-fg': theme.gradientForeground ?? 'var(--color-label)',
        '--activity-player-muted': theme.gradientMuted ?? 'var(--color-label-secondary)',
      }}
      aria-label={isDrillable ? `Open ${asset.playerName} statistics` : undefined}
      onClick={isDrillable ? () => onViewPlayer(drillId) : undefined}
    >
      <span className="league-activity-player__overlay" aria-hidden="true" />
      <span className="league-activity-player__portrait" aria-hidden="true">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedImageCount((count) => count + 1)}
          />
        ) : getCompanionInitials(asset.playerName)}
      </span>
      <span className="league-activity-player__identity">
        <strong title={asset.playerName}>{asset.playerName}</strong>
        <small>{[asset.position, asset.nflTeam].filter(Boolean).join(' · ') || 'NFL player'}</small>
      </span>
      {(logoUrl || asset.nflTeam) && (
        <span
          className="league-activity-player__team-logo"
          aria-hidden="true"
        >
          {logoUrl && !logoFailed ? (
            <img src={logoUrl} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)} />
          ) : (
            <span className="league-activity-player__team-logo-fallback">{asset.nflTeam}</span>
          )}
        </span>
      )}
    </PlayerVisualTag>
  );
}

function ActivityTeamDestination({ move, meta }) {
  if (!move.team) return <span className="league-activity-move__destination is-unassigned">Roster unavailable</span>;
  return (
    <span className="league-activity-move__destination">
      <span className={`league-activity-move__verb tone-${meta.tone}`}>
        <LeagueHistoryIcon name={meta.icon} tone={meta.tone} size="sm" />
        {meta.label}
      </span>
      <span className="league-activity-move__team">
        <FantasyTeamAvatar team={move.team} />
        <strong title={move.team.teamName}>{move.team.teamName}</strong>
      </span>
      {move.kind === 'trade' && move.sourceTeam && (
        <small title={move.sourceTeam.teamName}>from {move.sourceTeam.teamName}</small>
      )}
    </span>
  );
}

function ActivityMove({ move, darkMode, onViewPlayer }) {
  const meta = MOVE_META[move.kind];
  if (move.kind === 'pick') {
    return (
      <li className="league-activity-move league-activity-move--pick">
        <div className="league-activity-pick-asset">
          <LeagueHistoryIcon name="diamond" tone="orange" variant="solid" size="sm" />
          <span><strong>{move.pick.season} Round {move.pick.round}</strong><small>Draft pick</small></span>
        </div>
        <ActivityTeamDestination move={move} meta={meta} />
      </li>
    );
  }

  return (
    <li className={`league-activity-move league-activity-move--${move.kind}`}>
      <ActivityPlayerVisual asset={move.asset} darkMode={darkMode} onViewPlayer={onViewPlayer} />
      <ActivityTeamDestination move={move} meta={meta} />
    </li>
  );
}

// Before/after rows for GridShift-league events (settings, adjustments, locks,
// IR moves, commissioner changes).
function ActivityChanges({ changes }) {
  return (
    <ul className="league-activity-changes">
      {changes.map((change, index) => (
        <li key={`${change.label}:${index}`}>
          <span className="league-activity-changes__label" title={change.label}>{change.label}</span>
          <span className="league-activity-changes__values">
            <span className="league-activity-changes__before" title={change.before}>{change.before}</span>
            <span className="league-activity-changes__arrow" aria-label="changed to">→</span>
            <strong className="league-activity-changes__after" title={change.after}>{change.after}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActivityEntry({ entry, darkMode, onViewPlayer }) {
  const [expanded, setExpanded] = useState(false);
  const displayType = activityDisplayType(entry);
  const meta = TYPE_META[displayType] ?? TYPE_META.commissioner;
  const moves = useMemo(() => buildActivityMoves(entry), [entry]);
  const collapsible = moves.length > COLLAPSE_THRESHOLD;
  const visibleMoves = collapsible && !expanded ? moves.slice(0, COLLAPSED_MOVE_COUNT) : moves;
  const hiddenCount = moves.length - visibleMoves.length;
  const regionId = `activity-moves-${entry.id}`;

  return (
    <article className={`league-activity-entry tone-${meta.tone}`}>
      <div className="league-activity-entry__rail" aria-hidden="true">
        <span className="league-activity-entry__node"><LeagueHistoryIcon name={meta.icon} tone={meta.tone} variant="solid" size="sm" /></span>
      </div>
      <div className="league-activity-entry__body">
        <div className="league-activity-entry__meta">
          <span className={`league-activity-entry__badge tone-${meta.tone}`}>{meta.label}</span>
          <span>{formatDate(entry.timestamp)}{entry.week ? ` · Week ${entry.week}` : ''}</span>
        </div>
        <div className="league-activity-entry__heading">
          <strong>{entry.label}</strong>
          {moves.length > 0 && <span>{moves.length} move{moves.length === 1 ? '' : 's'}</span>}
        </div>
        {moves.length > 0 ? (
          <>
            <ul id={regionId} className="league-activity-moves">
              {visibleMoves.map((move) => <ActivityMove key={move.id} move={move} darkMode={darkMode} onViewPlayer={onViewPlayer} />)}
            </ul>
            {collapsible && (
              <button
                type="button"
                className="league-activity-entry__expand"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => setExpanded((value) => !value)}
              >
                <span>{expanded ? 'Show fewer moves' : `Show ${hiddenCount} more move${hiddenCount === 1 ? '' : 's'}`}</span>
                <span aria-hidden="true">⌄</span>
              </button>
            )}
          </>
        ) : entry.changes?.length ? null : (
          <p>{entry.description ?? (entry.teams.length ? entry.teams.map((team) => team.teamName).join(' · ') : 'League settings or roster state changed.')}</p>
        )}
        {entry.changes?.length > 0 && <ActivityChanges changes={entry.changes} />}
        {entry.changes?.length > 0 && (entry.description || entry.teams.length > 0) && (
          <p>{entry.description ?? entry.teams.map((team) => team.teamName).join(' · ')}</p>
        )}
        {moves.length > 0 && entry.description && <p>{entry.description}</p>}
      </div>
    </article>
  );
}

export default function CompanionActivity({ onViewPlayer = null }) {
  const { gridshiftLeague } = useLeagueSource();
  return gridshiftLeague
    ? <GridShiftActivity league={gridshiftLeague} onViewPlayer={onViewPlayer} />
    : <SleeperActivity onViewPlayer={onViewPlayer} />;
}

function SleeperActivity({ onViewPlayer }) {
  const history = useLeagueHistoryData();
  const { players, loadPlayers } = useFantasyStats();
  useEffect(() => { if (!players) void loadPlayers(); }, [loadPlayers, players]);
  const model = useMemo(() => buildSleeperActivityModel(history, players), [history, players]);
  const state = <LeagueHistoryState platform={history.platform} loading={history.loading} error={history.error} empty={model.entries.length === 0} noun="League activity" season={history.season} priorSeasonCount={Math.max(0, history.eligibleLeagueHistory.length - 1)} onRetry={history.retry} />;
  return <ActivityView model={model} stateView={state} onViewPlayer={onViewPlayer} />;
}

function GridShiftActivity({ league, onViewPlayer }) {
  // Core's NFL player catalog, only to match portraits and player pages.
  const { players, loadPlayers } = useFantasyStats();
  useEffect(() => { if (!players) void loadPlayers(); }, [loadPlayers, players]);
  const model = useGridShiftActivity(league.leagueId, league.season, players);
  return <ActivityView model={model} stateView={<GridShiftActivityState model={model} />} onViewPlayer={onViewPlayer} />;
}

function GridShiftActivityState({ model }) {
  if (model.status === 'loading') return <EmptyState title="Loading league activity..." />;
  if (model.status === 'signed-out') return <EmptyState title="Sign in to view this league." />;
  if (model.status === 'error') {
    return (
      <EmptyState
        title="League activity is unavailable right now."
        hint={model.error}
        action={<button type="button" className="league-history-state-action" onClick={model.retry}>Try again</button>}
      />
    );
  }
  return <EmptyState title={`No activity recorded for ${model.season || 'this league year'} yet.`} />;
}

function ActivityView({ model, stateView, onViewPlayer }) {
  const { darkMode } = useTheme();
  const [filter, setFilter] = useState('all');
  const [showCommissioner, setShowCommissioner] = useState(false);
  const entries = model.entries;
  const hidesCommissioner = model.hideCommissionerByDefault;
  const commissionerCount = hidesCommissioner ? entries.filter((entry) => entry.type === 'commissioner').length : 0;
  const publicEntryCount = entries.length - commissionerCount;
  const visibleEntries = entries.filter((entry) => (
    (!hidesCommissioner || entry.type !== 'commissioner' || showCommissioner)
    && matchesFilter(entry, filter)
  ));
  if (model.status !== 'ready') {
    return <div className="league-history-page league-history-page--state">{stateView}</div>;
  }
  return (
    <div className="league-history-page league-activity-page" data-tour="league-activity-content">
      <header className="league-history-heading">
        {model.provider === LEAGUE_PROVIDER_IDS.SLEEPER
          ? <div><span className="league-history-eyebrow">League ledger</span><h1>Activity</h1><p><strong>{publicEntryCount} completed move{publicEntryCount === 1 ? '' : 's'}</strong> in the <strong>{model.season}</strong> league year — trades, waivers, signings, and draft capital changing hands.</p></div>
          : <div><span className="league-history-eyebrow">League ledger</span><h1>Activity</h1><p><strong>{entries.length} event{entries.length === 1 ? '' : 's'}</strong> in the <strong>{model.season}</strong> season.</p></div>}
      </header>
      <div className="league-activity-filters" role="group" aria-label="Activity filters">
        {model.filters.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}</button>
        ))}
        {commissionerCount > 0 && (
          <button type="button" className={`league-activity-filters__commissioner${showCommissioner ? ' is-active' : ''}`} onClick={() => setShowCommissioner((value) => !value)} aria-pressed={showCommissioner}>
            Commissioner{showCommissioner ? '' : ` · ${commissionerCount} hidden`}
          </button>
        )}
      </div>
      <div className="league-activity-feed">
        {visibleEntries.length ? visibleEntries.map((entry) => <ActivityEntry key={entry.id} entry={entry} darkMode={darkMode} onViewPlayer={onViewPlayer} />) : <p className="league-history-inline-empty">No completed events match this filter.</p>}
      </div>
    </div>
  );
}
