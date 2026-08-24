// WinProbabilityChart.jsx — the game's momentum in one line.
//
// BALLDONTLIE reports a home win probability on every play, so the swing of a
// game is already in the data. Plotted end to end it says something the box
// score can't: whether a final margin was ever in doubt.
//
// This is derived game state, not a betting market — no odds, no lines.

import { useMemo } from 'react';
import { buildWinProbabilityTimeline } from '../../utils/winProbability.js';
import './NflPlays.css';

const WIDTH = 100;
const HEIGHT = 34;

export function WinProbabilityChart({ plays = [], homeTeam, awayTeam, homeColor = null, gameStatus = null }) {
  const timeline = useMemo(
    () => buildWinProbabilityTimeline(plays, { gameStatus }),
    [gameStatus, plays],
  );
  const { complete, points } = timeline;

  const biggestSwing = useMemo(() => {
    let best = null;
    for (let i = 1; i < points.length; i += 1) {
      const delta = Math.abs(points[i].probability - points[i - 1].probability);
      if (!best || delta > best.delta) best = { delta, point: points[i] };
    }
    return best && best.delta >= 0.1 ? best : null;
  }, [points]);

  if (points.length < 3) return null;

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const final = points[points.length - 1];
  const area = `${line} L${final.x.toFixed(2)} ${HEIGHT} L0 ${HEIGHT} Z`;
  const leader = final.probability >= 0.5 ? homeTeam : awayTeam;
  const leaderShare = Math.round((final.probability >= 0.5 ? final.probability : 1 - final.probability) * 100);
  const stateLabel = complete ? 'finished' : 'currently sits';

  // Quarter boundaries, so the shape can be read against game time.
  const quarterMarks = points
    .map((point, index) => ({ point, index }))
    .filter(({ point, index }) => index > 0 && point.period !== points[index - 1].period)
    .map(({ point }) => point.x);

  return (
    <div className="nfp-wp">
      <span className="nfp-wp__side" aria-hidden="true">{homeTeam} favored</span>

      <svg
        className="nfp-wp__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Win probability across the game, ${stateLabel} at ${leaderShare} percent for ${leader}`}
        data-complete={complete ? 'true' : 'false'}
        data-progress={(final.x / WIDTH).toFixed(3)}
        style={{ height: '72px', '--nfp-wp-stroke': homeColor ?? undefined, '--nfp-wp-fill': homeColor ?? undefined }}
      >
        <line className="nfp-wp__midline" x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} />
        {quarterMarks.map((x) => (
          <line key={x} className="nfp-wp__quarter" x1={x} y1="0" x2={x} y2={HEIGHT} />
        ))}
        <path className="nfp-wp__area" d={area} />
        <path className="nfp-wp__line" d={line} vectorEffect="non-scaling-stroke" />
        {biggestSwing && (
          <rect
            className="nfp-wp__swing"
            x={Math.max(0, biggestSwing.point.x - 0.5)}
            y={biggestSwing.point.y - 1.2}
            width="1"
            height="2.4"
          />
        )}
      </svg>

      <span className="nfp-wp__side" aria-hidden="true">{awayTeam} favored</span>

      <p className="nfp-wp__caption">
        Win probability {complete ? 'finished' : 'currently sits'} at <b>{leaderShare}% {leader}</b>
        {biggestSwing ? `. Biggest single-play swing: ${Math.round(biggestSwing.delta * 100)} points.` : '.'}
      </p>
    </div>
  );
}

export default WinProbabilityChart;
