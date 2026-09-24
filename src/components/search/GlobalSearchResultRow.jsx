// A single global search result, which expands in place when it is the active
// one.
//
// Team colour and logo treatment comes from getTeamVisualTheme, the same helper
// the rest of the app uses — result rows must not grow their own copy of team
// gradient or contrast logic. Player headshots come from the shared
// PlayerAvatar, which already owns the headshot → team mark → initials chain.
//
// Every kind gets its own mark, and that is the point rather than decoration:
// searching "seattle seahawks" used to return a column of identical Seahawks
// logos, where the avatar carried no information at all and the eye had nothing
// to sort the list by. Now a player is a round face, a team is its squared mark,
// a game is the two crests that play it, and a destination is a glyph — so the
// shape alone says what kind of thing a row is before any text is read.

import GlobalSearchDetail from './GlobalSearchDetail.jsx';
import PlayerAvatar from '../shared/PlayerAvatar.jsx';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import { getCompanionInitials } from '../../utils/companionAssetVisuals.js';
import {
  KIND_APP_VIEW,
  KIND_COMMAND,
  KIND_FANTASY_TEAM,
  KIND_GAME,
  KIND_NFL_TEAM,
  KIND_PLAYER,
} from '../../utils/globalSearch/entities/record.js';

function TeamMark({ teamId, darkMode, className = '' }) {
  const theme = getTeamVisualTheme(teamId, darkMode);
  return (
    <span
      className={`global-search-row__avatar global-search-row__avatar--team ${className}`}
      style={{ background: theme?.gradient ?? 'var(--color-fill)' }}
      aria-hidden="true"
    >
      <img
        src={`/logos/${teamId}.png`}
        alt=""
        className="global-search-row__logo"
        loading="lazy"
      />
    </span>
  );
}

/**
 * Both crests of a game, away over home, in the order the label reads.
 */
function GameMark({ record, darkMode }) {
  const { awayTeam, homeTeam } = record.meta ?? {};
  if (!awayTeam || !homeTeam) {
    return <TeamMark teamId={awayTeam ?? homeTeam} darkMode={darkMode} />;
  }

  return (
    <span className="global-search-row__avatar-pair" aria-hidden="true">
      <TeamMark teamId={awayTeam} darkMode={darkMode} className="is-away" />
      <TeamMark teamId={homeTeam} darkMode={darkMode} className="is-home" />
    </span>
  );
}

// One glyph per destination section, so "Go to" rows are told apart by their
// icon rather than by a first letter that repeats across half the list.
const VIEW_GLYPHS = {
  Fantasy: 'M4 19h4V9H4zM10 19h4V4h-4zM16 19h4v-7h-4z',
  Statistics: 'M4 19h16M7 16V9M12 16V5M17 16v-4',
  League: 'M5 5h14v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM9 19h6M12 14v5',
  Trade: 'M8 7h11M8 17h11M13 4l3 3-3 3M13 14l3 3-3 3',
  Draft: 'M12 4v10M8 10l4 4 4-4M5 19h14',
  Scout: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM16 16l4 4',
  Predictions: 'M4 16l5-6 4 4 7-8',
};

const COMMAND_GLYPH = 'M5 12h14M12 5v14';

function GlyphMark({ record }) {
  const path = record.kind === KIND_COMMAND
    ? COMMAND_GLYPH
    : VIEW_GLYPHS[record.meta?.section] ?? COMMAND_GLYPH;

  return (
    <span
      className={`global-search-row__avatar global-search-row__avatar--${record.kind}`}
      aria-hidden="true"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d={path}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Avatar({ record, darkMode }) {
  const meta = record.meta ?? {};

  if (record.kind === KIND_PLAYER) {
    const theme = meta.team ? getTeamVisualTheme(meta.team, darkMode) : null;
    return (
      <PlayerAvatar
        className="global-search-row__headshot"
        // The record already carries every id PlayerAvatar's fallback chain
        // needs, so the palette never touches the Sleeper player directory to
        // draw a face.
        player={{
          id: record.id,
          sleeperId: meta.sleeperId,
          espnId: meta.espnId,
          team: meta.team,
        }}
        name={record.label}
        size={38}
        background={theme?.gradient ?? 'var(--color-fill)'}
      />
    );
  }

  if (record.kind === KIND_NFL_TEAM && meta.teamId) {
    return <TeamMark teamId={meta.teamId} darkMode={darkMode} />;
  }

  if (record.kind === KIND_GAME && !meta.isWeekIndex) {
    return <GameMark record={record} darkMode={darkMode} />;
  }

  if (record.kind === KIND_APP_VIEW || record.kind === KIND_COMMAND) {
    return <GlyphMark record={record} />;
  }

  return (
    <span
      className={`global-search-row__avatar global-search-row__avatar--${record.kind}`}
      aria-hidden="true"
    >
      {getCompanionInitials(record.label)}
    </span>
  );
}

function badgeFor(record) {
  if (record.kind === KIND_COMMAND) return 'Action';
  if (record.kind === KIND_FANTASY_TEAM) return 'My league';
  if (record.kind === KIND_PLAYER && record.meta?.jersey) return `#${record.meta.jersey}`;
  if (record.kind === KIND_GAME && record.meta?.week) return `Wk ${record.meta.week}`;
  return null;
}

export default function GlobalSearchResultRow({
  entry,
  active = false,
  resolving = false,
  detail = null,
  darkMode = false,
  onSelect,
  onRoute,
  id,
}) {
  const { record } = entry;
  const badge = badgeFor(record);
  const hasDetail = active
    && Boolean(detail?.facts?.length || detail?.stats || detail?.fantasy);

  return (
    <div className={`global-search-row-shell${active ? ' is-active' : ''}`}>
      <button
        type="button"
        id={id}
        role="option"
        aria-selected={active}
        className={`global-search-row${active ? ' is-active' : ''}${resolving ? ' is-resolving' : ''}`}
        aria-busy={resolving || undefined}
        onClick={() => onSelect(entry)}
      >
        <Avatar record={record} darkMode={darkMode} />
        <span className="global-search-row__text">
          <span className="global-search-row__label">{record.label}</span>
          {record.sublabel ? (
            <span className="global-search-row__sublabel">{record.sublabel}</span>
          ) : null}
        </span>
        {resolving ? (
          <span className="global-search-row__spinner" aria-hidden="true" />
        ) : badge ? (
          <span className="global-search-row__badge">{badge}</span>
        ) : null}
      </button>

      {/* Rendered only while active. The height is not animated — see the
          interaction note in GlobalSearchPalette. */}
      {hasDetail ? <GlobalSearchDetail detail={detail} onRoute={onRoute} /> : null}
    </div>
  );
}
