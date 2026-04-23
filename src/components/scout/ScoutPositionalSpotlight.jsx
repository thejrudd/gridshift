import {
  formatDraftSlot,
  positionColor,
  tierColor,
  tierFg,
  playerPhotoUrl,
  photoFallback,
  getCombineStatus,
} from './scoutUtils';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function KeyStats({ player }) {
  const { position, collegeStats: s } = player;
  if (!s) return null;

  let stats = [];
  if (position === 'QB') {
    const pct = s.completions && s.attempts
      ? ((s.completions / s.attempts) * 100).toFixed(0) + '%'
      : null;
    stats = [
      { label: 'Comp%', value: pct },
      { label: 'Pass YDS', value: s.passYards?.toLocaleString() },
      { label: 'TDs', value: s.passTDs },
    ];
  } else if (position === 'RB') {
    stats = [
      { label: 'Rush YDS', value: s.rushYards?.toLocaleString() },
      { label: 'Carries', value: s.carries },
      { label: 'TDs', value: s.rushTDs },
    ];
  } else {
    stats = [
      { label: 'Rec YDS', value: s.recYards?.toLocaleString() },
      { label: 'Rec', value: s.receptions },
      { label: 'TDs', value: s.recTDs },
    ];
  }

  return (
    <div className="scout-spotlight-stats">
      {stats.filter(s => s.value != null).map(({ label, value }) => (
        <div key={label} className="scout-spotlight-stat">
          <span className="scout-spotlight-stat-value">{value}</span>
          <span className="scout-spotlight-stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function SpotlightCard({ player, onSelectPlayer }) {
  const posColor = positionColor(player.position, player.positionGroup);
  const tc = tierColor(player.tier);
  const tfg = tierFg(player.tier);
  const combineStatus = getCombineStatus(player);

  return (
    <button
      className="scout-spotlight-card"
      onClick={() => onSelectPlayer(player)}
      aria-label={`View ${player.name} prospect profile`}
    >
      {/* Position stripe + tier badge */}
      <div className="scout-spotlight-card-header">
        <span className="scout-spotlight-pos" style={{ color: posColor, borderColor: posColor }}>
          {player.position}
        </span>
        <span className="scout-spotlight-tier" style={{ background: tc, color: tfg }}>
          {player.tier}
        </span>
      </div>

      {/* Photo */}
      <div className="scout-spotlight-photo-wrap" style={{ borderColor: posColor }}>
        <img
          src={playerPhotoUrl(player)}
          onError={photoFallback}
          alt={player.name}
          className="scout-spotlight-photo"
        />
      </div>

      {/* Name + college */}
      <div className="scout-spotlight-name">{player.name}</div>
      <div className="scout-spotlight-meta">
        <span>{player.college}</span>
        <span>{combineStatus}</span>
        <span className="scout-spotlight-pick">{formatDraftSlot(player)}</span>
      </div>

      {/* Key college stats */}
      <KeyStats player={player} />

      {/* Combine 40 */}
      {player.combine?.fortyYard != null && (
        <div className="scout-spotlight-forty">
          <span className="scout-spotlight-forty-label">40-Yard Dash</span>
          <span className="scout-spotlight-forty-value">{player.combine.fortyYard.toFixed(2)}s</span>
        </div>
      )}
    </button>
  );
}

function buildSpotlightByPosition(players) {
  return POSITIONS.reduce((acc, pos) => {
    acc[pos] = players.find(player => player.positionGroup === pos) ?? null;
    return acc;
  }, {});
}

export default function ScoutPositionalSpotlight({ players, onSelectPlayer }) {
  const spotlightByPosition = buildSpotlightByPosition(players);

  return (
    <section className="scout-spotlight-section" aria-label="Top prospects by position">
      <div className="scout-section-header">
        <h2 className="scout-section-title">Top Prospects</h2>
        <div className="scout-section-rule" />
        <span className="scout-section-subtitle">By Position</span>
      </div>

      <div className="scout-spotlight-grid">
        {POSITIONS.map(pos => {
          const player = spotlightByPosition[pos];
          if (!player) return null;
          return <SpotlightCard key={pos} player={player} onSelectPlayer={onSelectPlayer} />;
        })}
      </div>
    </section>
  );
}
