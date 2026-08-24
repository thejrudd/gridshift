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
} from './scoutUtils';
import { nflLogoUrl, collegeLogoUrl } from './scoutTeamLogos';
import { buildCollegeRowGradient, getCollegePalette, getCollegeForegrounds } from '../../data/collegeColors';

function isDarkMode() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
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

function RosterRow({ player, isSelected, compareAId, onSelectPlayer, onCompare, useTeamColors, dark }) {
  const posColor = positionColor(player.position, player.positionGroup);
  const draftSlot = formatScoutSlot(player);
  const combineStatus = getCombineStatus(player);

  // Optional opaque college team-color gradient on the row, matching the
  // NFL pick-row treatment in Scout Results / Statistics
  // (primary → darken(primary) → secondary at 135deg). When on, we also
  // set --scout-row-fg so the row's text inverts for legibility on the tint.
  const teamGradient = useTeamColors ? buildCollegeRowGradient(player.college, dark) : null;
  const teamPalette = useTeamColors ? getCollegePalette(player.college) : null;
  const teamPrimary = teamPalette
    ? (dark ? teamPalette.darkPrimary : teamPalette.primary)
    : null;
  // Per-side foregrounds: --scout-row-fg-left covers elements over the
  // secondary half of the gradient (rank, name, college, combine chip);
  // --scout-row-fg-right covers elements over the primary half (selection
  // metadata). --scout-row-fg keeps the left value as a default
  // for any inherited text we haven't tagged explicitly.
  const teamFgs = useTeamColors ? getCollegeForegrounds(player.college, dark) : null;

  const rowStyle = teamGradient
    ? {
      background: teamGradient,
      '--scout-row-fg': teamFgs.left,
      '--scout-row-fg-left': teamFgs.left,
      '--scout-row-fg-right': teamFgs.right,
      color: teamFgs.left,
    }
    : undefined;
  const posBarStyle = { background: teamPrimary || posColor };

  return (
    <div
      className={`scout-roster-row${isSelected ? ' is-selected' : ''}${teamGradient ? ' has-team-tint' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelectPlayer(player)}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectPlayer(player)}
      aria-selected={isSelected}
      aria-label={`${player.name}, ${player.position}, ${player.college}, ${draftSlot}`}
      style={rowStyle}
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
        {/* Left-edge color bar — position color by default, college primary when team colors are on */}
        <div className="scout-row-pos-bar" style={posBarStyle} />
      </div>

      {/* Name + meta */}
      <div className="scout-row-identity">
        <div className="scout-row-name-line">
          <span className="scout-row-name">{player.name}</span>
          <span
            className="scout-result-position"
            style={{ background: posColor }}
            aria-label={`Position ${player.position ?? 'unknown'}`}
          >
            {player.position ?? '—'}
          </span>
          {player.college && (
            <span className="scout-row-college">{player.college}</span>
          )}
          {collegeLogoUrl(player.college) && (
            <img
              src={collegeLogoUrl(player.college)}
              alt=""
              className="scout-inline-logo scout-row-college-logo"
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
        <div className="scout-row-meta">
          <div className="scout-row-meta-line">
            <CombineStatusChip status={combineStatus} />
            <DraftSelectionMeta player={player} />
          </div>
        </div>
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

export default function ScoutRosterList({ players, selectedPlayerId, compareAId, onSelectPlayer, onCompare, useTeamColors = false }) {
  const dark = isDarkMode();
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
          useTeamColors={useTeamColors}
          dark={dark}
        />
      ))}
    </div>
  );
}
