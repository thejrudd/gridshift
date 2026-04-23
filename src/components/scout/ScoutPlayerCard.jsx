import {
  FANTASY_POSITION_GROUPS,
  positionColor, tierColor, tierFg,
  formatHeight, formatForty, gradeFromPercentile, gradeColor,
  draftRoundLabel, formatDraftSelection, formatDraftSlot, formatRank, playerPhotoUrl, photoFallback,
  getCombineStatus, combineStatusColor,
} from './scoutUtils';

// ── Shared primitives ─────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div className="scout-card-section-label">{children}</div>
  );
}

function DataRow({ label, value }) {
  if (value == null) return null;
  return (
    <div className="scout-card-data-row">
      <span className="scout-card-data-label">{label}</span>
      <span className="scout-card-data-value">{value}</span>
    </div>
  );
}

function CombineRow({ label, value, pct }) {
  if (value == null) return null;
  const grade = gradeFromPercentile(pct);
  return (
    <div className="scout-card-combine-row">
      <div className="scout-card-combine-top">
        <span className="scout-card-data-label">{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="scout-card-data-value">{value}</span>
          {grade && (
            <span className="scout-card-grade" style={{ color: gradeColor(grade) }}>{grade}</span>
          )}
        </div>
      </div>
      {pct != null && (
        <div className="scout-card-pct-bar-track">
          <div
            className="scout-card-pct-bar-fill"
            style={{ width: `${pct}%`, background: gradeColor(grade) }}
          />
        </div>
      )}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────

function DraftSection({ player }) {
  return (
    <div className="scout-card-section">
      <SectionLabel>Draft</SectionLabel>
      <DataRow label="Status" value={player.draftStatus === 'drafted' ? 'Drafted' : 'Not drafted yet'} />
      <DataRow label="Team" value={player.draftTeamName} />
      <DataRow label="Selection" value={formatDraftSelection(player)} />
      <DataRow label="Round / Pick" value={draftRoundLabel(player.draftRound, player.draftPick)} />
      <DataRow label="Big Board" value={formatRank(player.bigBoardRank)} />
      <DataRow label="NFL Grade" value={player.nflGrade?.toFixed(2)} />
      <DataRow label="Dynasty ADP" value={player.dynastyAdp?.toFixed(1)} />
    </div>
  );
}

function CollegeSection({ player }) {
  const { position, collegeStats: s, college } = player;
  if (!s || !FANTASY_POSITION_GROUPS.has(player.positionGroup)) return null;

  let rows = [];
  if (position === 'QB') {
    const pct = s.completions && s.attempts
      ? `${((s.completions / s.attempts) * 100).toFixed(1)}%`
      : null;
    rows = [
      { label: 'Completion %', value: pct },
      { label: 'Pass Yards', value: s.passYards?.toLocaleString() },
      { label: 'Pass TDs', value: s.passTDs },
      { label: 'Interceptions', value: s.interceptions },
      { label: 'Rush Yards', value: s.rushYards?.toLocaleString() },
      { label: 'Rush TDs', value: s.rushTDs },
    ];
  } else if (position === 'RB') {
    rows = [
      { label: 'Rush Yards', value: s.rushYards?.toLocaleString() },
      { label: 'Carries', value: s.carries },
      { label: 'Rush TDs', value: s.rushTDs },
      { label: 'Receptions', value: s.receptions },
      { label: 'Rec Yards', value: s.recYards?.toLocaleString() },
      { label: 'Rec TDs', value: s.recTDs },
    ];
  } else {
    rows = [
      { label: 'Targets', value: s.recTargets },
      { label: 'Receptions', value: s.receptions },
      { label: 'Rec Yards', value: s.recYards?.toLocaleString() },
      { label: 'Rec TDs', value: s.recTDs },
    ];
  }

  return (
    <div className="scout-card-section">
      <SectionLabel>College — {college}</SectionLabel>
      {rows.some(r => r.value != null) ? (
        rows.filter(r => r.value != null).map(r => (
          <DataRow key={r.label} label={r.label} value={r.value} />
        ))
      ) : (
        <p className="scout-card-empty-note">College production will be filled as verified prospect data is added.</p>
      )}
    </div>
  );
}

function CombineSection({ player }) {
  const { combine: c, combinePercentiles: p } = player;
  if (!c && !player.combineInvite) return null;
  const hasVerifiedMeasure = Object.values(c).some(value => value != null);
  const status = getCombineStatus(player);
  if (!hasVerifiedMeasure && status === 'No Combine') return null;

  return (
    <div className="scout-card-section">
      <SectionLabel>NFL Combine</SectionLabel>
      <DataRow label="Status" value={status} />
      <DataRow label="Height" value={formatHeight(c.heightIn)} />
      <DataRow label="Weight" value={c.weightLbs ? `${c.weightLbs} lbs` : null} />
      <CombineRow label="40-Yard Dash"  value={c.fortyYard  != null ? `${formatForty(c.fortyYard)}s`  : null} pct={p?.fortyYard} />
      <CombineRow label="Vertical Jump" value={c.vertical   != null ? `${c.vertical}"`                : null} pct={p?.vertical} />
      <CombineRow label="Broad Jump"    value={c.broadJump  != null ? `${c.broadJump}"`               : null} pct={p?.broadJump} />
      <CombineRow label="3-Cone Drill"  value={c.threeCone  != null ? `${c.threeCone}s`               : null} pct={p?.threeCone} />
      <CombineRow label="20-Yd Shuttle" value={c.shuttle    != null ? `${c.shuttle}s`                 : null} pct={p?.shuttle} />
      <CombineRow label="Bench Press"   value={c.benchPress != null ? `${c.benchPress} reps`          : null} pct={p?.benchPress} />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────

export default function ScoutPlayerCard({ player, onCompare, compareAId }) {
  const posColor = positionColor(player.position, player.positionGroup);
  const tc = tierColor(player.tier);
  const tfg = tierFg(player.tier);
  const isPendingCompare = compareAId === player.id;
  const draftSlot = formatDraftSlot(player);
  const combineStatus = getCombineStatus(player);
  const combineStatusStyle = { borderColor: combineStatusColor(combineStatus), color: combineStatusColor(combineStatus) };

  return (
    <div className="scout-player-card">
      {/* Identity block */}
      <div className="scout-card-identity" style={{ borderLeftColor: posColor }}>
        {/* Photo */}
        <div className="scout-card-photo-wrap">
          <img
            src={playerPhotoUrl(player)}
            onError={photoFallback}
            alt={player.name}
            className="scout-card-photo"
          />
        </div>

        {/* Text identity */}
        <div className="scout-card-identity-text">
          <div className="scout-card-player-name">{player.name}</div>
          <div className="scout-card-player-meta">
            <span className="scout-card-pos" style={{ color: posColor }}>{player.position}</span>
            <span className="scout-card-college">{player.college}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span
              className="scout-card-tier"
              style={{ background: tc, color: tfg }}
            >
              {player.tier}
            </span>
            <span className="scout-card-status-chip" style={combineStatusStyle}>
              {combineStatus}
            </span>
            <span className="scout-card-pick">{draftSlot}</span>
          </div>
        </div>
      </div>

      {/* Compare trigger */}
      {onCompare && (
        <button
          onClick={() => onCompare(player)}
          className="scout-card-compare-btn"
          style={{
            borderColor: isPendingCompare ? 'var(--color-accent)' : 'var(--color-separator)',
            background: isPendingCompare ? 'rgba(90,173,255,0.10)' : 'var(--color-fill)',
            color: isPendingCompare ? 'var(--color-accent)' : 'var(--color-label-secondary)',
          }}
          aria-label={isPendingCompare ? 'Waiting — select a second player' : `Compare ${player.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="8" height="18" rx="1" />
            <rect x="13" y="3" width="8" height="18" rx="1" />
          </svg>
          {isPendingCompare ? 'Select a second player to compare' : 'Compare'}
        </button>
      )}

      {/* Data sections */}
      <DraftSection player={player} />
      <CollegeSection player={player} />
      <CombineSection player={player} />
    </div>
  );
}
