import {
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
import { collegeLogoUrl, nflLogoUrl } from './scoutTeamLogos';

const MAX_SPOTLIGHT_CARDS = 6;

function SpotlightMetric({ label, value }) {
  if (value == null) return null;
  return (
    <div className="scout-spotlight-stat">
      <span className="scout-spotlight-stat-value">{value}</span>
      <span className="scout-spotlight-stat-label">{label}</span>
    </div>
  );
}

function keyStatsForPlayer(player) {
  const summary = getCollegeProductionSummary(player);
  if (summary) {
    return summary.split(' · ').slice(0, 3).map((part, index) => {
      const [value, ...labelParts] = part.split(' ');
      return {
        key: `${player.id}-summary-${index}`,
        value,
        label: labelParts.join(' ') || 'Stat',
      };
    });
  }

  if (player.nflGrade != null) {
    return [{
      key: `${player.id}-grade`,
      value: player.nflGrade.toFixed(2),
      label: 'NFL Grade',
    }];
  }

  return [];
}

function DraftSelectionMeta({ player }) {
  if (player.draftStatus !== 'drafted' || player.draftRound == null || player.draftPick == null) {
    return <span className="scout-spotlight-selection-empty">Not drafted yet</span>;
  }

  const teamLogo = nflLogoUrl(player.draftTeam || player.draftTeamName);
  const selectionLabel = `Selected Round ${player.draftRound}, Pick ${player.draftPick}`;

  return (
    <div className="scout-spotlight-selection" title={`${selectionLabel} · ${player.draftTeamName ?? 'Drafted team'}`}>
      <span className="scout-spotlight-selection-copy">{selectionLabel}</span>
      {teamLogo && (
        <img
          src={teamLogo}
          alt=""
          className="scout-spotlight-selection-logo"
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      {player.draftTeamName && (
        <span className="scout-spotlight-selection-team">{player.draftTeamName}</span>
      )}
    </div>
  );
}

function SpotlightCard({ player, onSelectPlayer }) {
  const posColor = positionColor(player.position, player.positionGroup);
  const tierBg = tierColor(player.tier);
  const tierText = tierFg(player.tier);
  const combineStatus = getCombineStatus(player);
  const collegeLogo = collegeLogoUrl(player.college);
  const metrics = keyStatsForPlayer(player);

  return (
    <button
      className="scout-spotlight-card"
      onClick={() => onSelectPlayer(player)}
      aria-label={`View ${player.name} prospect profile`}
    >
      <div className="scout-spotlight-card-header">
        <span className="scout-spotlight-pos" style={{ color: posColor, borderColor: posColor }}>
          {player.position}
        </span>
        <span
          className="scout-spotlight-tier"
          style={{ background: tierBg, color: tierText }}
          title={getTierDescription(player.tier)}
        >
          {player.tier}
        </span>
      </div>

      <div className="scout-spotlight-body">
        <div className="scout-spotlight-photo-wrap" style={{ borderColor: posColor }}>
          <img
            src={playerPhotoUrl(player)}
            onError={photoFallback}
            alt={player.name}
            className="scout-spotlight-photo"
          />
        </div>

        <div className="scout-spotlight-copy">
          <div className="scout-spotlight-name">{player.name}</div>
          <div className="scout-spotlight-college-row">
            <span className="scout-spotlight-college-text">{player.college}</span>
            {collegeLogo && (
              <img
                src={collegeLogo}
                alt=""
                className="scout-inline-logo scout-spotlight-college-logo"
                onError={event => { event.currentTarget.style.display = 'none'; }}
              />
            )}
          </div>

          <div className="scout-spotlight-meta-row">
            <span
              className="scout-card-status-chip scout-spotlight-status-chip"
              style={{ color: combineStatusColor(combineStatus) }}
              title={getCombineStatusDescription(combineStatus)}
            >
              {combineStatus}
            </span>
            <DraftSelectionMeta player={player} />
          </div>

          {metrics.length > 0 && (
            <div className="scout-spotlight-stats">
              {metrics.map(({ key, label, value }) => (
                <SpotlightMetric key={key} label={label} value={value} />
              ))}
            </div>
          )}

          {player.combine?.fortyYard != null && (
            <div className="scout-spotlight-forty">
              <span className="scout-spotlight-forty-label">40-Yard Dash</span>
              <span className="scout-spotlight-forty-value">{player.combine.fortyYard.toFixed(2)}s</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function buildSpotlightPlayers(players) {
  return players.slice(0, MAX_SPOTLIGHT_CARDS);
}

export default function ScoutPositionalSpotlight({ players, onSelectPlayer }) {
  const spotlightPlayers = buildSpotlightPlayers(players);
  const spotlightSlots = [
    ...spotlightPlayers.map((player) => ({ type: 'player', player, key: player.id })),
    ...Array.from({ length: Math.max(0, MAX_SPOTLIGHT_CARDS - spotlightPlayers.length) }, (_, index) => ({
      type: 'placeholder',
      key: `placeholder-${index}`,
    })),
  ];

  if (!spotlightSlots.length) return null;

  return (
    <section className="scout-spotlight-section" aria-label="Top prospects">
      <div className="scout-section-header">
        <h2 className="scout-section-title">Top Prospects</h2>
        <div className="scout-section-rule" />
        <span className="scout-section-subtitle">Current Board • Current Sort</span>
      </div>

      <div className="scout-spotlight-grid">
        {spotlightSlots.map((slot) => (
          slot.type === 'player'
            ? <SpotlightCard key={slot.key} player={slot.player} onSelectPlayer={onSelectPlayer} />
            : <div key={slot.key} className="scout-spotlight-card scout-spotlight-card-placeholder" aria-hidden="true" />
        ))}
      </div>
    </section>
  );
}
