// PlayCard.jsx — one play in the Statistics play-by-play feed.
//
// The line reads left to right the way a play is called: down and distance,
// where the ball was, what happened, when. Underneath it, the trajectory strip
// draws the same play on the field, so the sentence and the picture always
// agree. Expanded, the card breaks the play into each player's action in order
// and shows the official NFL description.
//
// When the narrative parser isn't confident about a play, the card degrades to
// the raw description with no faces. A wrong name attached to a real player's
// photo is a much worse failure than a plain line of text.

import { useState } from 'react';
import { PlayerAvatar } from '../../shared/PlayerAvatar.jsx';
import { PlayTrajectoryStrip } from '../../nflPlays/PlayTrajectoryStrip.jsx';
import { formatFieldSpot, getPlayTrajectory } from '../../../utils/nflPlays/fieldGeometry.js';
import { parsePlayNarrative, getRoleLabel } from '../../../utils/nflPlays/playNarrative.js';
import { lookupPlayerByName } from '../../../utils/nflPlays/playerNameIndex.js';

const MAX_FACES = 3;

function resolveActors(actors, participants, teamAbbr) {
  return actors.map((actor) => {
    const player = participants ? lookupPlayerByName(participants, actor.name, { team: teamAbbr }) : null;
    return { ...actor, player, displayName: player?.name ?? actor.name };
  });
}

/**
 * The one tag that matters most on this play, or null.
 *
 * Only one is ever shown: a play that both gained a first down and scored is a
 * touchdown, and saying so twice would just crowd the line.
 */
function playTag(play, geometry) {
  const yards = geometry.yards;
  if (geometry.flag === 'td') return ['td', 'Touchdown'];
  if (geometry.scoring && geometry.type === 'kick') return ['td', 'Good'];
  if (geometry.flag === 'fg') return ['loss', 'No good'];
  if (geometry.flag === 'int') return ['loss', 'Intercepted'];
  if (geometry.flag === 'fumble') return ['loss', 'Fumble'];
  // Incompletions and penalties are named before yardage is: a penalty
  // enforcement can leave an incomplete pass with a negative net, and "-22 yds"
  // on a ball that was never caught reads as a loss the offense actually took.
  if (geometry.flag === 'incomplete') return ['', 'Incomplete'];
  if (geometry.flag === 'penalty') return ['', 'Penalty'];
  if (gainedFirstDown(play, geometry)) return ['fd', '1st down'];
  if (yards != null && yards < 0 && geometry.type !== 'kick') return ['loss', `${yards} yds`];
  return null;
}

function gainedFirstDown(play, geometry) {
  const startDown = Number(play?.startDown);
  const distance = Number(play?.startDistance);
  if (geometry.flag || !Number.isFinite(startDown) || startDown < 1) return false;
  if (Number(play?.endDown) !== 1) return false;
  return Number.isFinite(distance) && geometry.yards != null && geometry.yards >= distance;
}

export function PlayCard({ play, participants, homeTeam, awayTeam, awayTheme, homeTheme, barColor, flipped = false }) {
  const [expanded, setExpanded] = useState(false);
  const narrative = parsePlayNarrative(play);

  if (narrative.administrative) {
    return (
      <div className="scores-play is-admin">
        <p className="scores-play__admin-text">{narrative.sentence}</p>
        <time className="scores-play__clock">{play.time}</time>
      </div>
    );
  }

  const geometry = getPlayTrajectory(play, { homeTeam, awayTeam });
  const actors = narrative.confident ? resolveActors(narrative.actors, participants, play.team) : [];
  const faces = actors.filter((actor) => actor.player).slice(0, MAX_FACES);
  const canExpand = narrative.confident && actors.length > 0;
  const tag = playTag(play, geometry);
  // `flag === 'fg'` covers a miss as well as a make, so the scoreboard answer is
  // the only one that can tell them apart.
  const scoring = geometry.scoring;
  const sentence = narrative.confident ? narrative.sentence : play.description;
  // The spot is read off the same geometry the strip draws, so the label and
  // the picture can't disagree. The provider's own `spot` falls back to the
  // *end* of the play whenever it omits the start, and on a kick it is written
  // from the receiving team's frame — either one would name a yard line the
  // graphic below doesn't show.
  const spot = (geometry.drawable && formatFieldSpot(geometry.start, { homeTeam, awayTeam })) || play.spot;

  return (
    <div className="scores-play" data-scoring={scoring ? 'true' : 'false'} style={{ '--play-rule': barColor }}>
      <div className="scores-play__line">
        <span className="scores-play__dd">{play.down}</span>
        <span className="scores-play__spot">{spot}</span>
        <span className="scores-play__text">
          {faces.length > 0 && (
            <span className="scores-play__faces">
              {faces.map((actor) => (
                <PlayerAvatar
                  key={`${actor.role}-${actor.displayName}`}
                  player={actor.player}
                  name={actor.displayName}
                  size={22}
                  className="scores-play__face"
                />
              ))}
            </span>
          )}
          {sentence}
          {tag && <span className="scores-play__tag" data-k={tag[0]}>{tag[1]}</span>}
        </span>
        <span className="scores-play__clock">{play.quarter} {play.time}</span>
      </div>

      <PlayTrajectoryStrip
        play={play}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        awayTheme={awayTheme}
        homeTheme={homeTheme}
        barColor={barColor}
        flipped={flipped}
        label={`${play.down} · ${play.description}`}
      />

      {canExpand && (
        <button
          type="button"
          className="scores-play__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide breakdown' : 'Show breakdown'}
        </button>
      )}

      {expanded && (
        <div className="scores-play__breakdown">
          {actors.map((actor) => (
            <div key={`${actor.role}-${actor.displayName}`} className="scores-play__actor">
              <span className="scores-play__role">{getRoleLabel(actor.role)}</span>
              <PlayerAvatar player={actor.player ?? {}} name={actor.displayName} size={26} />
              <span className="scores-play__actor-name">
                {actor.displayName}
                {actor.detail && <i>{actor.detail}</i>}
              </span>
            </div>
          ))}
          <p className="scores-play__raw">{play.description}</p>
        </div>
      )}
    </div>
  );
}

export default PlayCard;
