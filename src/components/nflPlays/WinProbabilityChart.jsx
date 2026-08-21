// WinProbabilityChart.jsx — the game's momentum in one line.
//
// BALLDONTLIE reports a home win probability on every play, so the swing of a
// game is already in the data. Plotted end to end it says something the box
// score can't: whether a final margin was ever in doubt.
//
// This is derived game state, not a betting market — no odds, no lines.

import { useMemo } from 'react';
import './NflPlays.css';

const WIDTH = 100;
const HEIGHT = 34;

export function WinProbabilityChart({ plays = [], homeTeam, awayTeam, homeColor = null }) {
  const points = useMemo(() => (
    plays
      .filter((play) => play.homeWinProbability != null)
      .map((play, index, all) => ({
        x: all.length === 1 ? WIDTH : (index / (all.length - 1)) * WIDTH,
        y: HEIGHT - Math.min(1, Math.max(0, play.homeWinProbability)) * HEIGHT,
        probability: play.homeWinProbability,
        period: play.period,
        play,
      }))
  ), [plays]);

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
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
  const final = points[points.length - 1];
  const leader = final.probability >= 0.5 ? homeTeam : awayTeam;
  const leaderShare = Math.round((final.probability >= 0.5 ? final.probability : 1 - final.probability) * 100);

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
        aria-label={`Win probability across the game, ending at ${leaderShare} percent for ${leader}`}
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
            x={biggestSwing.point.x - 0.5}
            y={biggestSwing.point.y - 1.2}
            width="1"
            height="2.4"
          />
        )}
      </svg>

      <span className="nfp-wp__side" aria-hidden="true">{awayTeam} favored</span>

      <p className="nfp-wp__caption">
        Win probability finished at <b>{leaderShare}% {leader}</b>
        {biggestSwing ? `. Biggest single-play swing: ${Math.round(biggestSwing.delta * 100)} points.` : '.'}
      </p>
    </div>
  );
}

export default WinProbabilityChart;
