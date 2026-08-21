// fieldPrimitives.jsx — the pieces every field graphic is built from.
//
// One idea holds the whole play-by-play section together: the drive field and
// the play strips underneath it share a single 120-yard canvas — two 10-yard
// end zones plus 100 playing yards. Because both map through `fieldX`, a play
// strip lines up with the drive field above it yard for yard, and a 3-yard run
// at your own 12 is drawn where it actually happened.
//
// Everything here is absolutely positioned inside a canvas element that owns
// `position: relative`; nothing measures, so the graphics stay correct at any
// width.

import { fieldX, END_ZONE_WIDTH_PCT, PLAY_TYPE_LABEL, teamLogo } from '../../utils/nflPlays/fieldGeometry.js';

/** Yard lines every 10 yards, with the majors picked out more brightly. */
export function FieldLines({ step = 10 }) {
  const lines = [];
  for (let yard = step; yard < 100; yard += step) {
    lines.push(
      <i key={yard} className="fv-line" data-major={yard % 10 === 0 ? 'true' : 'false'} style={{ left: `${fieldX(yard)}%` }} />,
    );
  }
  return lines;
}

/** The 20-yard wash in front of each goal line. */
export function RedZones() {
  return (
    <>
      <i className="fv-rz is-left" style={{ left: `${fieldX(0)}%`, width: `${fieldX(20) - fieldX(0)}%` }} />
      <i className="fv-rz is-right" style={{ left: `${fieldX(80)}%`, width: `${fieldX(100) - fieldX(80)}%` }} />
    </>
  );
}

/**
 * An end zone, painted with the team's identity gradient so the field reads the
 * same way as the score hero at the top of the drilldown.
 */
export function EndZone({ side, team, theme, logo = true }) {
  return (
    <div
      className={`fv-ez is-${side}`}
      style={{ width: `${END_ZONE_WIDTH_PCT}%`, background: theme?.gradient ?? 'var(--color-fill)', color: theme?.gradientFullForeground ?? 'var(--color-label)' }}
    >
      {logo ? <img src={teamLogo(team)} alt="" loading="lazy" /> : <span>{String(team ?? '').toUpperCase()}</span>}
    </div>
  );
}

/**
 * `G 10 20 30 40 50 40 30 20 10 G`, with the teams named at the ends they
 * defend. The numbers are symmetric, so a flipped quarter only swaps the two
 * team labels — the caller decides which team is on which side.
 */
export function YardAxis({ leftTeam, rightTeam }) {
  const marks = [[0, 'G'], [10, '10'], [20, '20'], [30, '30'], [40, '40'], [50, '50'], [60, '40'], [70, '30'], [80, '20'], [90, '10'], [100, 'G']];
  return (
    <div className="fv-axis" aria-hidden="true">
      {marks.map(([yard, label]) => (
        <span key={yard} style={{ left: `${fieldX(yard)}%` }} data-goal={label === 'G' ? 'true' : 'false'}>{label}</span>
      ))}
      <span className="fv-axis-team is-left">{String(leftTeam ?? '').toUpperCase()}</span>
      <span className="fv-axis-team is-right">{String(rightTeam ?? '').toUpperCase()}</span>
    </div>
  );
}

/**
 * The play-type mark: rush is a triangle pointing the way the play went, pass a
 * ring, kick a diamond, penalty a filled square.
 */
export function TypeGlyph({ type, dir = 1, color, size = 10, title }) {
  return (
    <i
      className="fv-glyph"
      data-type={type}
      data-dir={dir > 0 ? 'r' : 'l'}
      title={title ?? PLAY_TYPE_LABEL[type]}
      style={{ '--g': color, '--gs': `${size}px` }}
      aria-hidden="true"
    />
  );
}

/**
 * What the play ended in, drawn just past the end spot.
 *
 * Anything that scored is gold. A kick keeps its diamond so the shape still
 * says how the points came, and a defensive return or a two-point try takes the
 * touchdown post — the mark answers "did this score" before it answers "how".
 */
export function OutcomeMark({ flag, scoring = false }) {
  if (!flag && !scoring) return null;
  if (flag === 'sack') return null;
  if (flag === 'td') return <i className="fv-mark is-td" title="Touchdown" aria-hidden="true" />;
  if (flag === 'fg') {
    return scoring
      ? <i className="fv-mark is-kick is-scoring" title="Field goal is good" aria-hidden="true" />
      : <i className="fv-mark is-kick" title="No good" aria-hidden="true" />;
  }
  if (scoring) return <i className="fv-mark is-td" title="Score" aria-hidden="true" />;
  if (flag === 'int' || flag === 'fumble') return <i className="fv-mark is-turn" title="Turnover" aria-hidden="true" />;
  if (flag === 'incomplete') return <i className="fv-mark is-inc" title="Incomplete" aria-hidden="true" />;
  if (flag === 'punt') return <i className="fv-mark is-kick" title="Punt" aria-hidden="true" />;
  if (flag === 'penalty') return <i className="fv-mark is-pen" title="Penalty" aria-hidden="true" />;
  return null;
}

export function FieldLegend({ barColor }) {
  const swatches = [
    ['Gain', barColor, ''],
    ['Loss', 'var(--color-accent-red)', ''],
    ['Score', 'var(--color-signature)', ''],
    ['Penalty', 'var(--color-signature)', 'is-penalty'],
  ];
  return (
    <div className="fv-legend">
      {swatches.map(([label, color, variant]) => (
        <span key={label}><i className={variant} style={{ background: color }} />{label}</span>
      ))}
      <span><TypeGlyph type="rush" color="var(--color-label-secondary)" />Rush</span>
      <span><TypeGlyph type="pass" color="var(--color-label-secondary)" />Pass</span>
      <span><TypeGlyph type="kick" color="var(--color-label-secondary)" />Kick</span>
      <span className="fv-legend-sack"><TypeGlyph type="rush" dir={-1} color="var(--color-accent-red)" /><i />Sack</span>
      <span><i className="fv-mark is-inc" />Incomplete</span>
      <span className="fv-legend-fd"><i />To gain</span>
    </div>
  );
}
