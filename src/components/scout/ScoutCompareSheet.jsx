import { useEffect } from 'react';
import {
  FANTASY_POSITION_GROUPS,
  formatDraftSlot,
  formatForty,
  formatRank,
  gradeFromPercentile,
  gradeColor,
  positionColor,
  tierColor,
  tierFg,
  getCombineStatus,
  combineStatusColor,
} from './scoutUtils';

function useScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}

function CompareHeader({ player }) {
  const posColor = positionColor(player.position, player.positionGroup);
  const tc = tierColor(player.tier);
  const tfg = tierFg(player.tier);
  const combineStatus = getCombineStatus(player);
  return (
    <div className="scout-cmp-header">
      <div className="scout-cmp-name">{player.name}</div>
      <div className="scout-cmp-meta">
        <span className="scout-cmp-pos" style={{ color: posColor, borderLeftColor: posColor }}>
          {player.position}
        </span>
        <span className="scout-cmp-college">{player.college}</span>
      </div>
      <div className="scout-cmp-badges">
        <span className="scout-cmp-tier" style={{ background: tc, color: tfg }}>{player.tier}</span>
        <span className="scout-cmp-status" style={{ borderColor: combineStatusColor(combineStatus), color: combineStatusColor(combineStatus) }}>
          {combineStatus}
        </span>
        <span className="scout-cmp-pick">{formatDraftSlot(player)}</span>
      </div>
    </div>
  );
}

function CmpRow({ label, valA, valB, pctA, pctB }) {
  const gradeA = gradeFromPercentile(pctA);
  const gradeB = gradeFromPercentile(pctB);
  const aWins = pctA != null && pctB != null && pctA > pctB;
  const bWins = pctA != null && pctB != null && pctB > pctA;

  return (
    <div className="scout-cmp-row">
      <div className="scout-cmp-cell scout-cmp-cell-a">
        <span style={{ color: aWins ? 'var(--color-accent-green)' : 'var(--color-label)', fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
          {valA ?? '—'}
        </span>
        {gradeA && <span className="scout-cmp-grade" style={{ color: gradeColor(gradeA) }}>{gradeA}</span>}
      </div>
      <span className="scout-cmp-label">{label}</span>
      <div className="scout-cmp-cell scout-cmp-cell-b">
        {gradeB && <span className="scout-cmp-grade" style={{ color: gradeColor(gradeB) }}>{gradeB}</span>}
        <span style={{ color: bWins ? 'var(--color-accent-green)' : 'var(--color-label)', fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
          {valB ?? '—'}
        </span>
      </div>
    </div>
  );
}

function CmpSection({ label }) {
  return (
    <div className="scout-cmp-section-label">
      <div className="scout-cmp-section-rule" />
      <span>{label}</span>
      <div className="scout-cmp-section-rule" />
    </div>
  );
}

function DraftRows({ a, b }) {
  return (
    <>
      <CmpRow label="Draft Slot" valA={formatDraftSlot(a)} valB={formatDraftSlot(b)} />
      <CmpRow label="Dynasty ADP"  valA={a.dynastyAdp?.toFixed(1)} valB={b.dynastyAdp?.toFixed(1)} />
      <CmpRow label="Big Board"    valA={formatRank(a.bigBoardRank)} valB={formatRank(b.bigBoardRank)} />
      <CmpRow label="NFL Grade"    valA={a.nflGrade?.toFixed(2)} valB={b.nflGrade?.toFixed(2)} />
    </>
  );
}

function CollegeRows({ a, b }) {
  if (!FANTASY_POSITION_GROUPS.has(a.positionGroup) && !FANTASY_POSITION_GROUPS.has(b.positionGroup)) {
    return <div className="scout-cmp-empty-note">College production is shown for fantasy positions as verified data is added.</div>;
  }

  const pos = a.position;
  if (pos === 'QB') {
    const pctA = a.collegeStats?.completions && a.collegeStats?.attempts
      ? `${((a.collegeStats.completions / a.collegeStats.attempts) * 100).toFixed(0)}%` : null;
    const pctB = b.collegeStats?.completions && b.collegeStats?.attempts
      ? `${((b.collegeStats.completions / b.collegeStats.attempts) * 100).toFixed(0)}%` : null;
    return (
      <>
        <CmpRow label="Comp %" valA={pctA} valB={pctB} />
        <CmpRow label="Pass Yds" valA={a.collegeStats?.passYards?.toLocaleString()} valB={b.collegeStats?.passYards?.toLocaleString()} />
        <CmpRow label="Pass TDs" valA={a.collegeStats?.passTDs} valB={b.collegeStats?.passTDs} />
        <CmpRow label="INTs" valA={a.collegeStats?.interceptions} valB={b.collegeStats?.interceptions} />
      </>
    );
  }
  if (pos === 'RB') {
    return (
      <>
        <CmpRow label="Rush Yds" valA={a.collegeStats?.rushYards?.toLocaleString()} valB={b.collegeStats?.rushYards?.toLocaleString()} />
        <CmpRow label="Carries" valA={a.collegeStats?.carries} valB={b.collegeStats?.carries} />
        <CmpRow label="Rush TDs" valA={a.collegeStats?.rushTDs} valB={b.collegeStats?.rushTDs} />
        <CmpRow label="Rec Yds" valA={a.collegeStats?.recYards?.toLocaleString()} valB={b.collegeStats?.recYards?.toLocaleString()} />
      </>
    );
  }
  return (
    <>
      <CmpRow label="Targets" valA={a.collegeStats?.recTargets} valB={b.collegeStats?.recTargets} />
      <CmpRow label="Rec Yds" valA={a.collegeStats?.recYards?.toLocaleString()} valB={b.collegeStats?.recYards?.toLocaleString()} />
      <CmpRow label="Receptions" valA={a.collegeStats?.receptions} valB={b.collegeStats?.receptions} />
      <CmpRow label="Rec TDs" valA={a.collegeStats?.recTDs} valB={b.collegeStats?.recTDs} />
    </>
  );
}

function CombineRows({ a, b }) {
  return (
    <>
      <CmpRow
        label="40-Yd Dash"
        valA={a.combine?.fortyYard != null ? `${formatForty(a.combine.fortyYard)}s` : null}
        valB={b.combine?.fortyYard != null ? `${formatForty(b.combine.fortyYard)}s` : null}
        pctA={a.combinePercentiles?.fortyYard}
        pctB={b.combinePercentiles?.fortyYard}
      />
      <CmpRow
        label="Vertical"
        valA={a.combine?.vertical != null ? `${a.combine.vertical}"` : null}
        valB={b.combine?.vertical != null ? `${b.combine.vertical}"` : null}
        pctA={a.combinePercentiles?.vertical}
        pctB={b.combinePercentiles?.vertical}
      />
      <CmpRow
        label="Broad Jump"
        valA={a.combine?.broadJump != null ? `${a.combine.broadJump}"` : null}
        valB={b.combine?.broadJump != null ? `${b.combine.broadJump}"` : null}
        pctA={a.combinePercentiles?.broadJump}
        pctB={b.combinePercentiles?.broadJump}
      />
      <CmpRow
        label="3-Cone"
        valA={a.combine?.threeCone != null ? `${a.combine.threeCone}s` : null}
        valB={b.combine?.threeCone != null ? `${b.combine.threeCone}s` : null}
        pctA={a.combinePercentiles?.threeCone}
        pctB={b.combinePercentiles?.threeCone}
      />
      <CmpRow
        label="Bench Press"
        valA={a.combine?.benchPress != null ? `${a.combine.benchPress} reps` : null}
        valB={b.combine?.benchPress != null ? `${b.combine.benchPress} reps` : null}
        pctA={a.combinePercentiles?.benchPress}
        pctB={b.combinePercentiles?.benchPress}
      />
    </>
  );
}

export default function ScoutCompareSheet({ playerA, playerB, onClose }) {
  useScrollLock();

  return (
    <>
      <div className="scout-cmp-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compare prospects"
        className="scout-cmp-sheet"
      >
        {/* Header */}
        <div className="scout-cmp-sheet-header">
          <div className="scout-sheet-handle" />
          <span className="scout-cmp-sheet-title">Compare</span>
          <button
            onClick={onClose}
            aria-label="Close compare"
            className="scout-sheet-close scout-cmp-close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="scout-cmp-body">
          {/* Player name headers */}
          <div className="scout-cmp-headers">
            <CompareHeader player={playerA} />
            <CompareHeader player={playerB} />
          </div>

          <CmpSection label="Draft" />
          <DraftRows a={playerA} b={playerB} />

          <CmpSection label="College Production" />
          <CollegeRows a={playerA} b={playerB} />

          <CmpSection label="NFL Combine" />
          <CombineRows a={playerA} b={playerB} />
        </div>
      </div>
    </>
  );
}
