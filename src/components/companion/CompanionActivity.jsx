import { useEffect, useMemo, useState } from 'react';
import { useFantasyStats } from '../../context/SleeperContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import useLeagueHistoryData from '../../hooks/useLeagueHistoryData.js';
import {
  getCompanionInitials,
  getCompanionPlayerImageUrls,
  getNflTeamLogoUrl,
  getSleeperAvatarUrl,
} from '../../utils/companionAssetVisuals.js';
import { buildActivitySeasonGroups } from '../../utils/leagueHistory.js';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import LeagueHistoryIcon from './LeagueHistoryIcon.jsx';
import LeagueHistoryState from './LeagueHistoryState.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'trade', label: 'Trades' },
  { id: 'pick', label: 'Picks' },
  { id: 'waiver', label: 'Waivers' },
  { id: 'free_agent', label: 'Free agents' },
];

const TYPE_META = {
  trade: { label: 'Trade', tone: 'signature', icon: 'swap' },
  pick: { label: 'Draft capital', tone: 'orange', icon: 'diamond' },
  waiver: { label: 'Waiver', tone: 'blue', icon: 'plus' },
  free_agent: { label: 'Free agent', tone: 'green', icon: 'plus' },
  commissioner: { label: 'Commissioner', tone: 'neutral', icon: 'diamond' },
};

const MOVE_META = {
  add: { label: 'Added to', tone: 'green', icon: 'plus' },
  drop: { label: 'Dropped by', tone: 'red', icon: 'minus' },
  trade: { label: 'Traded to', tone: 'signature', icon: 'swap' },
  pick: { label: 'Sent to', tone: 'orange', icon: 'diamond' },
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
      kind: entry.type === 'trade' ? 'trade' : 'add',
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
  const imageUrls = useMemo(() => getCompanionPlayerImageUrls({
    id: asset.playerId,
    sleeperId: asset.playerId,
    espnId: asset.espnId,
  }), [asset.espnId, asset.playerId]);
  const [failedImageCount, setFailedImageCount] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const imageUrl = imageUrls[failedImageCount] ?? null;
  const theme = getTeamVisualTheme(asset.nflTeam, darkMode, { logoSide: 'end' });
  const logoUrl = getNflTeamLogoUrl(theme.logoKey);
  const isDrillable = Boolean(asset.playerId && typeof onViewPlayer === 'function');
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
      onClick={isDrillable ? () => onViewPlayer(asset.playerId) : undefined}
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
        <strong>{asset.playerName}</strong>
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
        <strong>{move.team.teamName}</strong>
      </span>
      {move.kind === 'trade' && move.sourceTeam && (
        <small>from {move.sourceTeam.teamName}</small>
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
        ) : (
          <p>{entry.teams.length ? entry.teams.map((team) => team.teamName).join(' · ') : 'League settings or roster state changed.'}</p>
        )}
      </div>
    </article>
  );
}

export default function CompanionActivity({ onViewPlayer = null }) {
  const history = useLeagueHistoryData();
  const { darkMode } = useTheme();
  const { players, loadPlayers } = useFantasyStats();
  const [filter, setFilter] = useState('all');
  const [showCommissioner, setShowCommissioner] = useState(false);
  useEffect(() => { if (!players) void loadPlayers(); }, [loadPlayers, players]);
  const groups = useMemo(() => buildActivitySeasonGroups(history.snapshots ?? [], players ?? {}), [history.snapshots, players]);
  const selectedGroup = groups.find((group) => group.season === history.season) ?? null;
  const entries = selectedGroup?.entries ?? [];
  const commissionerCount = entries.filter((entry) => entry.type === 'commissioner').length;
  const publicEntryCount = entries.length - commissionerCount;
  const visibleEntries = entries.filter((entry) => (
    (entry.type !== 'commissioner' || showCommissioner)
    && matchesFilter(entry, filter)
  ));
  const state = <LeagueHistoryState platform={history.platform} loading={history.loading} error={history.error} empty={entries.length === 0} noun="League activity" season={history.season} priorSeasonCount={Math.max(0, history.eligibleLeagueHistory.length - 1)} onRetry={history.retry} />;
  if (history.platform !== 'sleeper' || history.loading || history.error || entries.length === 0) {
    return <div className="league-history-page league-history-page--state">{state}</div>;
  }
  return (
    <div className="league-history-page league-activity-page" data-tour="league-activity-content">
      <header className="league-history-heading">
        <div><span className="league-history-eyebrow">League ledger</span><h1>Activity</h1><p><strong>{publicEntryCount} completed move{publicEntryCount === 1 ? '' : 's'}</strong> in the <strong>{history.season}</strong> league year — trades, waivers, signings, and draft capital changing hands.</p></div>
      </header>
      <div className="league-activity-filters" role="group" aria-label="Activity filters">
        {FILTERS.map((item) => (
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
