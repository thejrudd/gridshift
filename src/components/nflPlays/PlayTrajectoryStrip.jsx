// PlayTrajectoryStrip.jsx — one play, drawn the way a coach would draw it.
//
// Every play type gets its own silhouette, so the shape alone tells you what
// happened before you read a word: passes arc off the line of scrimmage, runs
// travel on the ground, kicks fly, sacks get dragged backwards into a wall.
//
// The canvas is the shared 120-yard field, so this strip lines up yard for yard
// with the drive field above it.

import {
  fieldX,
  getPlayTrajectory,
  playColor,
} from '../../utils/nflPlays/fieldGeometry.js';
import {
  EndZone,
  FieldLines,
  OutcomeMark,
  RedZones,
  TypeGlyph,
} from './fieldPrimitives.jsx';
import './NflPlays.css';

// 10 view units per yard across; the ground line sits at 74.
const VIEW_W = 1200;
const VIEW_H = 100;
const GROUND_Y = 74;

const viewX = (absoluteYardline, flipped = false) => (fieldX(absoluteYardline, flipped) / 100) * VIEW_W;

/**
 * @param play       One normalized play.
 * @param homeTeam   Home abbreviation — fixes the orientation of the field.
 * @param awayTeam   Away abbreviation.
 * @param awayTheme  Team visual themes, used for the end zones and the play colour.
 * @param homeTheme
 * @param barColor   The attacking team's colour.
 * @param flipped    Mirror the canvas — the quarter's teams changed ends. It
 *                   comes from the drive, not the play, so a strip can never
 *                   face the other way from the drive field above it.
 */
export function PlayTrajectoryStrip({ play, homeTeam, awayTeam, awayTheme, homeTheme, barColor, label, flipped = false }) {
  const geometry = getPlayTrajectory(play, { homeTeam, awayTeam });
  if (!geometry.drawable) return null;

  const { dir, start, end, flag, type, dist, firstDown, kick, scoring } = geometry;
  const color = playColor(geometry, barColor);
  // Yard lines stay absolute; `x`/`vx` are the only mirror, and `drawDir` is
  // the direction the mirrored drawing travels.
  const x = (yard) => fieldX(yard, flipped);
  const vx = (yard) => viewX(yard, flipped);
  const drawDir = flipped ? -dir : dir;
  const leftTeam = flipped ? homeTeam : awayTeam;
  const rightTeam = flipped ? awayTeam : homeTeam;
  const leftTheme = flipped ? homeTheme : awayTheme;
  const rightTheme = flipped ? awayTheme : homeTheme;
  const x0 = vx(start);
  const x1 = vx(end);

  const paths = [];
  const marks = [];

  if (type === 'kick' && kick) {
    // The kick advances in the offense's direction; the return comes back the
    // other way. Both come from the one shared helper so the drive field can
    // never draw the same punt differently.
    const xLand = vx(kick.land);
    const xFinish = vx(kick.finish);
    paths.push(
      <path key="kick" className="pv-path" data-type="kick" style={{ stroke: color }} fill="none" vectorEffect="non-scaling-stroke"
        d={`M${x0} ${GROUND_Y} Q ${(x0 + xLand) / 2} 6 ${xLand} ${GROUND_Y}`} />,
    );
    if (kick.returnYards > 0) {
      paths.push(
        <path key="return" className="pv-return" fill="none" vectorEffect="non-scaling-stroke"
          d={`M${xLand} ${GROUND_Y} L ${xFinish} ${GROUND_Y}`} />,
      );
    }
    marks.push(
      <span key="land" className="pv-endwrap is-route" style={{ left: `${x(kick.land)}%` }}>
        <i className={`fv-mark is-kick${scoring ? ' is-scoring' : ''}`} title={scoring ? 'Field goal is good' : 'Kick lands'} />
      </span>,
    );
    if (kick.returnYards > 0) {
      marks.push(
        <span key="finish" className="pv-endwrap is-route" style={{ left: `${x(kick.finish)}%` }}>
          <i className="fv-mark is-ret" data-dir={drawDir > 0 ? 'l' : 'r'} title="Return" />
        </span>,
      );
    }
  } else if (flag === 'sack') {
    // Dragged backwards, then stopped dead — the wall is what makes a sack read
    // as a sack without needing the plays around it for context.
    paths.push(
      <path key="drag" className="pv-path is-sack" fill="none" vectorEffect="non-scaling-stroke"
        d={`M${x0} ${GROUND_Y} L ${x1 + 9 * drawDir} ${GROUND_Y}`} />,
    );
    paths.push(
      <line key="wall" className="pv-sackwall" x1={x1} y1={GROUND_Y - 13} x2={x1} y2={GROUND_Y + 13} vectorEffect="non-scaling-stroke" />,
    );
    marks.push(
      <span key="glyph" className="pv-glyphwrap is-route" style={{ left: `${x(end)}%`, marginLeft: `${drawDir > 0 ? 5 : -5}px` }}>
        <TypeGlyph type="rush" dir={-drawDir} color="var(--color-accent-red)" title="Sack" />
      </span>,
    );
  } else if (flag === 'incomplete') {
    // The ball travels to the target and hits the turf. No team colour anywhere,
    // so an incompletion can never be misread as a gain.
    const target = Math.min(100, Math.max(0, start + Math.max(6, dist || 8) * dir));
    const xTarget = vx(target);
    paths.push(
      <path key="air" className="pv-path is-inc" fill="none" vectorEffect="non-scaling-stroke"
        d={`M${x0} ${GROUND_Y} Q ${(x0 + xTarget) / 2} ${GROUND_Y - 36} ${xTarget} ${GROUND_Y}`} />,
    );
    marks.push(
      <span key="mark" className="pv-endwrap is-route" style={{ left: `${x(target)}%` }}>
        <i className="fv-mark is-inc" title="Incomplete" />
      </span>,
    );
  } else if (type === 'pass') {
    const air = Math.min(46, Math.abs(geometry.yards ?? 0) * 1.6 + 10);
    paths.push(
      <path key="arc" className="pv-path" data-type="pass" style={{ stroke: color }} fill="none" vectorEffect="non-scaling-stroke"
        d={geometry.zero
          ? `M${x0} ${GROUND_Y} Q ${x0 + 16 * drawDir} ${GROUND_Y - 26} ${x0 + 30 * drawDir} ${GROUND_Y - 6}`
          : `M${x0} ${GROUND_Y} Q ${(x0 + x1) / 2} ${GROUND_Y - air} ${x1} ${GROUND_Y}`} />,
    );
    marks.push(
      <span key="glyph" className="pv-glyphwrap is-route" style={{ left: `${x(end)}%` }}>
        <TypeGlyph type="pass" dir={drawDir} color={color} />
      </span>,
    );
    if (flag || scoring) {
      marks.push(
        <span key="outcome" className="pv-endwrap is-route is-off" style={{ left: `${x(end)}%` }}><OutcomeMark flag={flag} scoring={scoring} /></span>,
      );
    }
  } else {
    // On the ground. The line stops short so the arrowhead lands on the spot.
    const tip = Math.abs(x1 - x0) > 10 ? x1 - 8 * drawDir : x0;
    paths.push(
      <path key="ground" className="pv-path" data-type={type} data-loss={(geometry.yards ?? 0) < 0 ? 'true' : 'false'}
        style={{ stroke: color }} fill="none" vectorEffect="non-scaling-stroke" d={`M${x0} ${GROUND_Y} L ${tip} ${GROUND_Y}`} />,
    );
    marks.push(
      <span key="glyph" className="pv-glyphwrap is-route" style={{ left: `${x(end)}%`, marginLeft: `${drawDir > 0 ? -4 : 4}px` }}>
        <TypeGlyph type={type} dir={drawDir} color={color} />
      </span>,
    );
    if (flag || scoring) {
      marks.push(
        <span key="outcome" className="pv-endwrap is-route is-off" style={{ left: `${x(end)}%` }}><OutcomeMark flag={flag} scoring={scoring} /></span>,
      );
    }
  }

  return (
    <div className="pv" data-dir={drawDir > 0 ? 'r' : 'l'} title={label ?? undefined}>
      <div className="pv-canvas is-route" role="img" aria-label={label ?? play?.description ?? 'Play field position'}>
        <RedZones />
        <FieldLines />
        <EndZone side="left" team={leftTeam} theme={leftTheme} />
        <EndZone side="right" team={rightTeam} theme={rightTheme} />
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="pv-svg" aria-hidden="true">
          <line x1={x0} y1={10} x2={x0} y2={GROUND_Y + 12} className="pv-los" vectorEffect="non-scaling-stroke" />
          {firstDown != null && (
            <line x1={vx(firstDown)} y1={16} x2={vx(firstDown)} y2={GROUND_Y + 12} className="pv-fdline" vectorEffect="non-scaling-stroke" />
          )}
          <line x1={viewX(-10)} y1={GROUND_Y} x2={viewX(110)} y2={GROUND_Y} className="pv-ground" vectorEffect="non-scaling-stroke" />
          {paths}
        </svg>
        <i className="pv-ball is-route" style={{ left: `${x(start)}%` }} />
        {marks}
      </div>
    </div>
  );
}

export default PlayTrajectoryStrip;
