// DriveField.jsx — the whole drive on one field.
//
// Every play is a lane on the same 120-yard canvas the play strips use, stacked
// oldest at the top. Read down the field and the shape of the drive is legible
// before you read a single description: steady chunks, a stalled series of
// short bars, the one explosive play, where a sack pushed it back.

import { useState } from 'react';
import { fieldX, getDriveNetYards, getPlayTrajectory, playColor } from '../../utils/nflPlays/fieldGeometry.js';
import { DrivePlayback } from './DrivePlayback.jsx';
import {
  EndZone,
  FieldLegend,
  FieldLines,
  OutcomeMark,
  RedZones,
  TypeGlyph,
  YardAxis,
} from './fieldPrimitives.jsx';
import './NflPlays.css';

const LANE_HEIGHT = 22;
const FIELD_PAD = 14;

const TYPE_ORDER = ['rush', 'pass', 'kick', 'penalty'];

/** "2 rush, 6 pass" — what the drive was made of. */
function playMix(trajectories) {
  const counts = trajectories.reduce((totals, geometry) => {
    totals[geometry.type] = (totals[geometry.type] ?? 0) + 1;
    return totals;
  }, {});
  return TYPE_ORDER.filter((type) => counts[type]).map((type) => `${counts[type]} ${type}`).join(', ');
}

/**
 * @param plays      The drive's plays in chronological order.
 * @param drive      The drive itself, for the header line.
 * @param homeTeam   Home abbreviation — fixes the field orientation.
 * @param awayTeam   Away abbreviation.
 * @param awayTheme  Team visual themes for the two end zones.
 * @param homeTheme
 * @param barColor   The attacking team's colour.
 * @param playLabel  Builds the per-lane tooltip from a play.
 * @param flipped    Mirror the canvas — the quarter's teams changed ends.
 * @param participants Box-score name index, passed through to playback so it
 *                     can expand abbreviated names and attach headshots.
 */
export function DriveField({
  plays = [], drive, homeTeam, awayTeam, awayTheme, homeTheme, barColor, playLabel, flipped = false,
  participants = null,
}) {
  // The stacked overview is the default: it answers "what shape was this drive"
  // in one look. Playback answers "what happened, in order" and costs time, so
  // it is opt-in rather than the thing you land on.
  const [mode, setMode] = useState('overview');

  const trajectories = plays.map((play) => ({ play, geometry: getPlayTrajectory(play, { homeTeam, awayTeam }) }));
  const lanes = trajectories.filter(({ geometry }) => geometry.drawable);
  if (lanes.length < 2) return null;

  // The drive's own team, not its first drawable play: the feed files a kickoff
  // under the receiving team, so the opening lane can run the other way.
  const attacksRight = drive?.team != null ? drive.team !== homeTeam : lanes[0].geometry.dir > 0;
  const attacking = attacksRight ? awayTeam : homeTeam;
  const defending = attacksRight ? homeTeam : awayTeam;
  // Everything below this line is in canvas space, where a flipped quarter has
  // already swapped the ends: the direction hint, the end zones and the axis
  // all have to agree with the lanes.
  const drawsRight = flipped ? !attacksRight : attacksRight;
  const leftTeam = flipped ? homeTeam : awayTeam;
  const rightTeam = flipped ? awayTeam : homeTeam;
  const leftTheme = flipped ? homeTheme : awayTheme;
  const rightTheme = flipped ? awayTheme : homeTheme;
  const yards = getDriveNetYards(plays, { homeTeam, awayTeam });
  const snaps = drive?.playCount ?? plays.length;
  const mix = playMix(lanes.map(({ geometry }) => geometry));

  return (
    <section className="df">
      <header className="df-head">
        <div>
          <strong>Drive</strong>
          <span>
            {snaps} {snaps === 1 ? 'play' : 'plays'}
            {yards != null ? ` · ${yards} yds` : ''}
            {mix ? ` · ${mix}` : ''}
          </span>
        </div>
        <div className="df-headactions">
          <b className="df-dirhint" data-dir={drawsRight ? 'r' : 'l'}>{attacking} attacking {defending}</b>
          <button
            type="button"
            className="df-playtoggle"
            aria-pressed={mode === 'playback'}
            onClick={() => setMode((value) => (value === 'playback' ? 'overview' : 'playback'))}
          >
            <span aria-hidden="true">{mode === 'playback' ? '▤' : '▶'}</span>
            {mode === 'playback' ? 'Overview' : 'Play drive'}
          </button>
        </div>
      </header>

      {mode === 'playback' ? (
        <DrivePlayback
          plays={plays}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          awayTheme={awayTheme}
          homeTheme={homeTheme}
          barColor={barColor}
          participants={participants}
          flipped={flipped}
        />
      ) : (
        <>

        <div className="df-fieldwrap">
          <div className="df-field" style={{ height: `${lanes.length * LANE_HEIGHT + FIELD_PAD}px` }}>
            <RedZones />
            <FieldLines />
            <EndZone side="left" team={leftTeam} theme={leftTheme} />
            <EndZone side="right" team={rightTeam} theme={rightTheme} />
            <div className="df-lanes" style={{ '--laneH': `${LANE_HEIGHT}px` }}>
              {lanes.map(({ play, geometry }, index) => (
                <DriveLane
                  key={play.id ?? index}
                  play={play}
                  geometry={geometry}
                  barColor={barColor}
                  flipped={flipped}
                  top={index * LANE_HEIGHT}
                  height={LANE_HEIGHT}
                  label={playLabel?.(play) ?? play.description}
                />
              ))}
            </div>
          </div>
          <YardAxis leftTeam={leftTeam} rightTeam={rightTeam} />
        </div>

        <FieldLegend barColor={barColor} />
        </>
      )}

      <p className="df-sr">
        {drive?.result ?? 'Drive'}: {snaps} plays{yards != null ? `, ${yards} net yards` : ''}, {attacking} attacking {defending}.
      </p>
    </section>
  );
}

function DriveLane({ geometry, barColor, top, height, label, flipped = false }) {
  const { dir, start, end, kick, firstDown, zero, yards, type, flag, scoring } = geometry;
  const color = playColor(geometry, barColor);
  const span = (a, b) => ({ left: `${Math.min(a, b)}%`, width: `${Math.max(Math.abs(b - a), 0.6)}%` });
  // `x` is the only place the mirror is applied; `drawDir` is the arrow the
  // mirrored lane points, which is the play's direction reversed.
  const x = (yard) => fieldX(yard, flipped);
  const drawDir = flipped ? -dir : dir;

  return (
    <div className="df-lane" style={{ top: `${top}px`, height: `${height}px` }} title={label}>
      {firstDown != null && <i className="df-fd" style={{ left: `${x(firstDown)}%` }} />}

      {kick ? (
        <>
          <i className="df-bar" data-type="kick" data-dir={drawDir > 0 ? 'r' : 'l'}
            style={{ ...span(x(start), x(kick.land)), '--c': color }} />
          {kick.returnYards > 0 && (
            <i className="df-ret" data-dir={drawDir > 0 ? 'l' : 'r'} style={span(x(kick.land), x(kick.finish))} />
          )}
        </>
      ) : zero ? (
        <i className="df-zero" style={{ left: `${x(start)}%`, '--c': color }} />
      ) : (
        <i className="df-bar" data-type={type} data-dir={drawDir > 0 ? 'r' : 'l'} data-loss={(yards ?? 0) < 0 ? 'true' : 'false'}
          style={{ ...span(x(start), x(end)), '--c': color }} />
      )}

      <i className="df-ball" style={{ left: `${x(start)}%` }} />
      <span className="df-glyph" style={{ left: `${x(start)}%` }}>
        <TypeGlyph type={type} dir={drawDir} color={color} size={9} />
      </span>
      <span className="df-end" style={{ left: `${x(kick ? kick.finish : end)}%` }}><OutcomeMark flag={flag} scoring={scoring} /></span>
    </div>
  );
}

export default DriveField;
