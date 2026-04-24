import {
  formatScoutSlot,
  positionColor,
  tierColor,
  tierFg,
  playerPhotoUrl,
  photoFallback,
  getCombineStatus,
  combineStatusColor,
  getCombineStatusDescription,
  getTierDescription,
  getCollegeProductionSummary,
} from './scoutUtils';
import { nflLogoUrl } from './scoutTeamLogos';

function CollegeStatSummary({ player }) {
  const summary = getCollegeProductionSummary(player);
  if (summary) return <span className="scout-row-stat-text">{summary}</span>;
  return player.nflGrade != null
    ? <span className="scout-row-stat-text">NFL {player.nflGrade.toFixed(2)}</span>
    : <span className="scout-row-no-stats">—</span>;
}

function CompareButton({ player, compareAId, onCompare }) {
  const isPending = compareAId === player.id;
  return (
    <button
      onClick={e => { e.stopPropagation(); onCompare(player); }}
      aria-label={isPending ? 'Pending — select another player' : `Compare ${player.name}`}
      title={isPending ? 'Select a second player to compare' : 'Compare this prospect'}
      className="scout-compare-btn"
      style={{
        borderColor: isPending ? 'var(--color-accent)' : 'var(--color-separator)',
        background: isPending ? 'rgba(90,173,255,0.10)' : 'var(--color-fill)',
        color: isPending ? 'var(--color-accent)' : 'var(--color-label-tertiary)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="8" height="18" rx="1" />
        <rect x="13" y="3" width="8" height="18" rx="1" />
      </svg>
    </button>
  );
}

function CombineStatusChip({ status }) {
  return (
    <span
      className="scout-card-status-chip scout-row-combine-chip"
      style={{ color: combineStatusColor(status) }}
      title={getCombineStatusDescription(status)}
    >
      {status}
    </span>
  );
}

function DraftSelectionMeta({ player }) {
  if (player.draftStatus !== 'drafted' || player.draftRound == null || player.draftPick == null) {
    return <span className="scout-row-pick">Not drafted yet</span>;
  }

  const teamLogo = nflLogoUrl(player.draftTeam || player.draftTeamName);
  const roundPickLabel = `Round ${player.draftRound}, Pick ${player.draftPick}`;

  return (
    <span className="scout-row-selection" title={`${roundPickLabel} · ${player.draftTeamName ?? 'Drafted team'}`}>
      <span className="scout-row-selection-copy">
        <span className="scout-row-selection-prefix">Selected</span>
        <span className="scout-row-selection-round">{roundPickLabel}</span>
      </span>
      {teamLogo && (
        <img
          src={teamLogo}
          alt=""
          className="scout-inline-logo scout-row-selection-logo"
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      {player.draftTeamName && (
        <span className="scout-row-selection-team">{player.draftTeamName}</span>
      )}
    </span>
  );
}

function RosterRow({ player, isSelected, compareAId, onSelectPlayer, onCompare }) {
  const posColor = positionColor(player.position, player.positionGroup);
  const draftSlot = formatScoutSlot(player);
  const combineStatus = getCombineStatus(player);

  return (
    <div
      className={`scout-roster-row${isSelected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelectPlayer(player)}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectPlayer(player)}
      aria-selected={isSelected}
      aria-label={`${player.name}, ${player.position}, ${player.college}, ${draftSlot}`}
    >
      {/* Rank */}
      <span className="scout-row-rank">{player.rank}</span>

      {/* Avatar */}
      <div className="scout-row-avatar-wrap">
        <img
          src={playerPhotoUrl(player)}
          onError={photoFallback}
          alt={player.name}
          className="scout-row-avatar"
        />
        {/* Position color bar on left edge of avatar */}
        <div className="scout-row-pos-bar" style={{ background: posColor }} />
      </div>

      {/* Name + meta */}
      <div className="scout-row-identity">
        <div className="scout-row-name">{player.name}</div>
        <div className="scout-row-meta">
          <div className="scout-row-meta-line">
            <span className="scout-row-pos-label" style={{ color: posColor }}>{player.position}</span>
            <span className="scout-row-college">{player.college}</span>
          </div>
          <div className="scout-row-meta-line">
            <CombineStatusChip status={combineStatus} />
            <DraftSelectionMeta player={player} />
          </div>
        </div>
      </div>

      {/* Production — hidden on compact phones */}
      <div className="scout-row-stats">
        <CollegeStatSummary player={player} />
        {player.combine?.fortyYard != null && (
          <div className="scout-row-forty">{player.combine.fortyYard.toFixed(2)}s 40</div>
        )}
      </div>

      {/* Tier badge — shown at sm+ */}
      <span
        className="scout-tier-badge"
        style={{ background: tierColor(player.tier), color: tierFg(player.tier) }}
        title={getTierDescription(player.tier)}
      >
        {player.tier}
      </span>

      {/* Compare */}
      <CompareButton player={player} compareAId={compareAId} onCompare={onCompare} />
    </div>
  );
}

export default function ScoutRosterList({ players, selectedPlayerId, compareAId, onSelectPlayer, onCompare }) {
  if (!players.length) {
    return (
      <div className="scout-empty">No prospects match your filters.</div>
    );
  }

  return (
    <div className="scout-roster-list" role="list" aria-label="Prospect rankings">
      {/* Column headers */}
      <div className="scout-list-header">
        <span className="scout-list-header-rank">#</span>
        <span style={{ width: 40, flexShrink: 0 }} />
        <span className="scout-list-header-label">Prospect</span>
        <span className="scout-list-header-prod scout-row-stats">Production</span>
        <span style={{ width: 28, flexShrink: 0 }} aria-hidden="true" />
      </div>

      {players.map(player => (
        <RosterRow
          key={player.id}
          player={player}
          isSelected={selectedPlayerId === player.id}
          compareAId={compareAId}
          onSelectPlayer={onSelectPlayer}
          onCompare={onCompare}
        />
      ))}
    </div>
  );
}
