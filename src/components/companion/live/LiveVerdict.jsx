// LiveVerdict.jsx — one sentence of verdict under the hero: who is ahead, who
// the pace says wins, and the tension when those two disagree.

import { firstWordOf } from './liveVisuals.js';
import { formatWinProbabilityPair } from '../../../utils/liveWinProbability.js';

function shortLabel(side) {
  return side.isMine ? 'You' : (firstWordOf(side.name) || side.name);
}

export default function LiveVerdict({ left, right, verdict, winProbA, settled = false }) {
  if (!left || !right || !verdict) return null;

  const byKey = { a: left, b: right };
  const leader = byKey[verdict.leaderKey];
  const projectedWinner = byKey[verdict.projectedWinnerKey];
  const probabilityLabels = Number.isFinite(Number(winProbA))
    ? formatWinProbabilityPair(Number(winProbA), { settled })
    : null;
  const winnerPct = probabilityLabels?.[verdict.projectedWinnerKey] ?? null;

  return (
    <div className="fl-verdict">
      {verdict.tied ? (
        <>
          <span>Level at <span className="fl-verdict__n">{left.pace.total.toFixed(1)}</span></span>
          <span className="fl-verdict__muted">
            — {shortLabel(projectedWinner)} {projectedWinner.isMine ? 'project' : 'projects'}{' '}
            <span className="fl-verdict__n">+{verdict.projectedLead.toFixed(1)}</span> at this pace
          </span>
        </>
      ) : verdict.flip ? (
        <>
          <span>
            {shortLabel(leader)} {leader.isMine ? 'lead' : 'leads'}{' '}
            <span className="fl-verdict__n" style={{ color: leader.palette[0] }}>{verdict.lead.toFixed(1)}</span>
          </span>
          <span className="fl-verdict__muted" aria-hidden="true">—</span>
          <span className="fl-verdict__flip">
            {shortLabel(projectedWinner)} still {projectedWinner.isMine ? 'project' : 'projects'}{' '}
            <span className="fl-verdict__n">+{verdict.projectedLead.toFixed(1)}</span>
          </span>
        </>
      ) : (
        <>
          <span>{shortLabel(projectedWinner)} {projectedWinner.isMine ? 'are' : 'is'} pulling away</span>
          <span className="fl-verdict__muted">
            — by <span className="fl-verdict__n">{verdict.projectedLead.toFixed(1)}</span> at this pace
          </span>
        </>
      )}
      {winnerPct != null && (
        <span className="fl-verdict__right">
          <span className="fl-verdict__n" style={{ color: projectedWinner.palette[0] }}>{winnerPct}</span>
          {' '}{shortLabel(projectedWinner)}
        </span>
      )}
    </div>
  );
}
