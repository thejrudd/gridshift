import Modal from '../Modal';
import {
  formatDraftSlot,
  formatProjectedPick,
  formatForty,
  formatRank,
  gradeFromPercentile,
  gradeColor,
  positionColor,
  tierColor,
  tierFg,
  getCombineStatus,
  combineStatusColor,
  getCombineStatusDescription,
  getTierDescription,
  getCollegeProductionRows,
} from './scoutUtils';

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
        <span
          className="scout-cmp-tier"
          style={{ background: tc, color: tfg }}
          title={getTierDescription(player.tier)}
        >
          {player.tier}
        </span>
        <span
          className="scout-cmp-status"
          style={{ borderColor: combineStatusColor(combineStatus), color: combineStatusColor(combineStatus) }}
          title={getCombineStatusDescription(combineStatus)}
        >
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
      <CmpRow label="Projected Pick" valA={formatProjectedPick(a)} valB={formatProjectedPick(b)} />
      <CmpRow label="Dynasty ADP"  valA={a.dynastyAdp?.toFixed(1)} valB={b.dynastyAdp?.toFixed(1)} />
      <CmpRow label="Prospect Rank" valA={formatRank(a.bigBoardRank)} valB={formatRank(b.bigBoardRank)} />
      <CmpRow label="NFL Grade"    valA={a.nflGrade?.toFixed(2)} valB={b.nflGrade?.toFixed(2)} />
    </>
  );
}

function CollegeRows({ a, b }) {
  const rowsA = getCollegeProductionRows(a);
  const rowsB = getCollegeProductionRows(b);
  const valuesA = new Map(rowsA.map((row) => [row.label, row.value]));
  const valuesB = new Map(rowsB.map((row) => [row.label, row.value]));
  const labels = [...new Set([...rowsA, ...rowsB].map((row) => row.label))];

  if (!labels.length) {
    return <div className="scout-cmp-empty-note">College production will appear as verified data is added.</div>;
  }

  return labels.map((label) => (
    <CmpRow key={label} label={label} valA={valuesA.get(label)} valB={valuesB.get(label)} />
  ));
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
  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Compare prospects"
      containerClassName="scout-cmp-sheet flex flex-col"
    >
        {/* Header */}
        <div className="scout-cmp-sheet-header">
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
    </Modal>
  );
}
