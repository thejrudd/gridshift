import { useMemo, useState } from 'react';
import { calcPoints } from '../../../utils/scoringEngine.js';
import {
  fmt,
  isTouchdown,
  KIND_FILTERS,
  ordinal,
  playKind,
  quarterName,
} from '../../../utils/playerSeason/dashboardModel.js';
import { Switch, TeamMark } from './DashboardParts.jsx';
import { tipAttrs } from './dashboardUi.js';

const STAT_LABELS = {
  pass_att: 'Pass attempt', pass_cmp: 'Completion', pass_yd: 'Passing yards', pass_cmp_40p: '40+ yard completion',
  pass_fd: 'Passing first down', pass_inc: 'Incompletion', pass_td: 'Passing touchdown', pass_td_40p: '40+ yard passing touchdown',
  pass_td_50p: '50+ yard passing touchdown', pass_int: 'Interception thrown', pass_sack: 'Sacked', pass_2pt: 'Two-point pass',
  rush_att: 'Carry', rush_yd: 'Rushing yards', rush_40p: '40+ yard run', rush_fd: 'Rushing first down', rush_td: 'Rushing touchdown',
  rush_td_40p: '40+ yard rushing touchdown', rush_td_50p: '50+ yard rushing touchdown', rush_2pt: 'Two-point run',
  rec: 'Reception', rec_yd: 'Receiving yards', rec_40p: '40+ yard catch', rec_fd: 'Receiving first down', rec_td: 'Receiving touchdown',
  rec_td_40p: '40+ yard receiving touchdown', rec_td_50p: '50+ yard receiving touchdown', rec_2pt: 'Two-point catch',
  fum_lost: 'Fumble lost', fgm: 'Field goal', fgm_yds: 'Field goal yards', fgm_yds_over_30: 'Field goal yards over 30',
  fgmiss: 'Missed field goal', xpm: 'Extra point', xpmiss: 'Missed extra point', kr_yd: 'Kick return yards', pr_yd: 'Punt return yards',
  ret_td: 'Return touchdown', idp_tkl: 'Tackle', idp_sack: 'Sack', idp_sack_yd: 'Sack yards', idp_int: 'Interception', idp_ff: 'Forced fumble',
  idp_fr: 'Fumble recovery', idp_pd: 'Pass defensed', idp_safety: 'Safety', idp_def_td: 'Defensive touchdown',
};

function fantasyBreakdown(play, scoring, position) {
  const lines = [];
  for (const [key, value] of Object.entries(play.fs ?? {})) {
    const points = calcPoints({ [key]: value }, scoring, position);
    if (Math.abs(points) < 0.005) continue;
    lines.push(`${STAT_LABELS[key] ?? key}${/_yd|_yds/.test(key) ? ` (${value})` : ''}: ${points > 0 ? '+' : '−'}${fmt(Math.abs(points), 2)}`);
  }
  return lines;
}

function spotLabel(team, game, x) {
  if (x == null) return '';
  if (x === 50) return 'Midfield';
  return x < 50 ? `${team} ${Math.round(x)}` : `${game.opp} ${Math.round(100 - x)}`;
}

function downLabel(team, game, play) {
  // Field position here is from the player's team's goal line, so a defender's
  // rows read the opponent's drive from his own side of the field.
  if (!play.dn) return spotLabel(team, game, play.xs);
  const goal = play.ytez != null && play.ds != null && play.ds >= play.ytez;
  return `${ordinal(play.dn)} & ${goal ? 'Goal' : play.ds} at ${spotLabel(team, game, play.xs)}`;
}

export function PlayRow({ play, team, group, darkMode, showGame = true, fantasy, onOpenGame, people }) {
  const [open, setOpen] = useState(false);
  const game = play.g;
  const kind = playKind(play, group);
  const start = Math.min(play.xs ?? 0, play.xe ?? 0);
  const end = Math.max(play.xs ?? 0, play.xe ?? 0);
  const showYards = play.y != null && !/kickoff|punt|field-goal|extra-point/.test(play.t);
  const winNow = play.wp != null ? Math.round(play.wp * 100) : null;
  const winBefore = play.wb != null ? Math.round(play.wb * 100) : null;
  const winDelta = winNow != null && winBefore != null ? winNow - winBefore : 0;
  const points = fantasy ? Math.round(calcPoints(play.fs ?? {}, fantasy.scoring, fantasy.position) * 100) / 100 : null;
  const target = play.r === 'passer' && play.tgt != null ? people?.[play.tgt]?.n : null;
  const ownBall = play.o === team;
  const tags = [
    play.sc ? { key: 'score', label: 'Score', strong: true } : null,
    { key: 'kind', label: kind },
    play.pd ? { key: 'depth', label: `${play.pd} ${play.pdir}` } : null,
    target ? { key: 'target', label: `to ${target}` } : null,
  ].filter(Boolean);

  return (
    <div className={`player-dash-play ${play.sc ? 'is-score' : ''}`}>
      <button type="button" className="player-dash-play__main" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="player-dash-play__clock">
          {showGame && (
            <span className="player-dash-play__game"><TeamMark abbr={game.opp} darkMode={darkMode} size={14} />Wk {game.week}</span>
          )}
          {quarterName(play.q)} {play.c}
          <small>{play.o}</small>
        </span>
        <span className="player-dash-play__body">
          <span className="player-dash-play__down">{downLabel(team, game, play)}</span>
          <span className="player-dash-play__text">{play.s}</span>
          {play.xs != null && (
            <span className="player-dash-play__traj" aria-hidden="true">
              <i className={ownBall ? 'is-me' : 'is-opp'} style={{ left: `${start}%`, width: `${Math.max(0.5, end - start)}%` }} />
              <b style={{ left: `calc(${play.xe ?? play.xs}% - 1.5px)` }} />
            </span>
          )}
          <span className="player-dash-tags">
            {tags.map((tag) => <span key={tag.key} className={`player-dash-tag ${tag.strong ? 'is-strong' : ''}`}>{tag.label}</span>)}
          </span>
        </span>
        <span className="player-dash-play__yards">
          {showYards && (
            <span {...tipAttrs('Yards gained', play.y === 0 ? 'No gain on the play' : `${play.y > 0 ? 'Gained' : 'Lost'} ${Math.abs(play.y)} yard${Math.abs(play.y) === 1 ? '' : 's'} on the play`)}>
              {play.y > 0 ? '+' : play.y < 0 ? '−' : ''}{Math.abs(play.y)}<em>yds</em>
            </span>
          )}
          {winDelta !== 0 && (
            <small className={winDelta > 0 ? 'is-up' : 'is-down'} {...tipAttrs(`${team} win chance`, `${winBefore}% before the snap, ${winNow}% after`)}>
              Win {winDelta > 0 ? '+' : '−'}{Math.abs(winDelta)}%
            </small>
          )}
          {points != null && (
            <small
              className={points > 0 ? 'is-up' : points < 0 ? 'is-down' : ''}
              {...tipAttrs(`Fantasy points · ${fantasy.leagueName}`, [...fantasyBreakdown(play, fantasy.scoring, fantasy.position), `Total ${points > 0 ? '+' : ''}${fmt(points, 2)} pts`])}
            >
              {points > 0 ? '+' : points < 0 ? '−' : ''}{fmt(Math.abs(points), 2)} pts
            </small>
          )}
        </span>
      </button>
      {open && (
        <div className="player-dash-play__more">
          <div><b>Official:</b> {play.raw}</div>
          <div>Score after the play: {team} {play.ms ?? 0}, {game.opp} {play.os ?? 0}{winNow != null ? ` · ${team} win chance ${winNow}%` : ''}</div>
          {onOpenGame && (
            <button type="button" className="player-dash-link" onClick={() => onOpenGame(game, 'plays')}>Open this game's play-by-play ›</button>
          )}
        </div>
      )}
    </div>
  );
}

export function PlayListBlock({ plays, emptyLabel = 'No plays match.', ...rowProps }) {
  if (!plays.length) return <div className="player-dash-empty">{emptyLabel}</div>;
  return (
    <div className="player-dash-plays">
      {plays.map((play) => <PlayRow key={`${play.g.id}-${play.i}`} play={play} {...rowProps} />)}
    </div>
  );
}

// Each filter row works like radio buttons; Ctrl/⌘-click adds or removes a
// choice, and on touch screens the Select several switch does the same. An
// empty selection means All.
function toggleFilter(set, value, multi) {
  const next = new Set(set);
  if (value === 'all') return new Set();
  if (multi) {
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  }
  if (next.size === 1 && next.has(value)) return new Set();
  return new Set([value]);
}

export function EveryPlayTab({ plays, games, group, team, darkMode, fantasy, onOpenGame, people }) {
  const [filters, setFilters] = useState({ game: new Set(), kind: new Set(), down: new Set(), quarter: new Set() });
  const [text, setText] = useState('');
  const [multi, setMulti] = useState(false);
  const [showFantasy, setShowFantasy] = useState(false);
  const kinds = KIND_FILTERS[group] ?? [];

  const filtered = useMemo(() => plays.filter((play) => (
    (!filters.game.size || filters.game.has(String(play.g.id)))
    && (!filters.kind.size || filters.kind.has(playKind(play, group)))
    && (!filters.down.size || filters.down.has(String(play.dn)))
    && (!filters.quarter.size || filters.quarter.has(String(Math.min(play.q, 5))))
    && (!text || `${play.s} ${play.raw}`.toLowerCase().includes(text.toLowerCase()))
  )), [filters, group, plays, text]);

  const chip = (field, value, label) => {
    const active = value === 'all' ? filters[field].size === 0 : filters[field].has(String(value));
    return (
      <button
        key={`${field}-${value}`}
        type="button"
        className="player-dash-chip"
        aria-pressed={active}
        onClick={(event) => setFilters((previous) => ({
          ...previous,
          [field]: toggleFilter(previous[field], String(value), multi || event.ctrlKey || event.metaKey),
        }))}
      >
        {label}
      </button>
    );
  };
  const fantasyTotal = showFantasy && fantasy
    ? filtered.reduce((total, play) => total + calcPoints(play.fs ?? {}, fantasy.scoring, fantasy.position), 0)
    : null;
  const touchdowns = filtered.filter(isTouchdown).length;

  return (
    <div className="player-dash-block">
      <div className="player-dash-section-head">
        <h3 className="player-dash-subhead">Every play</h3>
        <span className="player-dash-meta">{plays.length} plays</span>
      </div>
      <div className="player-dash-filters">
        <div className="player-dash-filter-row" role="group" aria-label="Game">
          <span className="player-dash-eyebrow">Game</span>
          {chip('game', 'all', 'All')}
          {games.map((game) => chip('game', game.id, `Wk ${game.week} ${game.opp}`))}
        </div>
        <div className="player-dash-filter-row" role="group" aria-label="Play result">
          <span className="player-dash-eyebrow">Result</span>
          {chip('kind', 'all', 'All')}
          {kinds.map((kind) => chip('kind', kind, kind))}
        </div>
        <div className="player-dash-filter-row" role="group" aria-label="Down and quarter">
          <span className="player-dash-eyebrow">Down</span>
          {chip('down', 'all', 'Any')}
          {[1, 2, 3, 4].map((down) => chip('down', down, ordinal(down)))}
          <span className="player-dash-eyebrow is-spaced">Quarter</span>
          {chip('quarter', 'all', 'All')}
          {[1, 2, 3, 4, 5].map((quarter) => chip('quarter', quarter, quarter === 5 ? 'OT' : `Q${quarter}`))}
        </div>
        <div className="player-dash-filter-row">
          <input
            type="search"
            className="player-dash-search"
            placeholder="Search play text, e.g. a teammate's name"
            aria-label="Search play text"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {fantasy && <Switch checked={showFantasy} onChange={setShowFantasy} label="Fantasy points" />}
          <span className="player-dash-faint player-dash-on-hover">Ctrl or ⌘-click to pick several</span>
          <Switch className="player-dash-on-touch" checked={multi} onChange={setMulti} label="Select several" />
        </div>
      </div>
      <p className="player-dash-meta">
        {filtered.length} plays · {touchdowns} touchdown{touchdowns === 1 ? '' : 's'}
        {fantasyTotal != null && (
          <span {...tipAttrs('Fantasy points', `Points from these plays in ${fantasy.leagueName} scoring. Game-level bonuses, like 300+ passing yards, aren't tied to one play.`)}>
            {' · '}<b>{fmt(fantasyTotal, 2)} fantasy pts</b> ⓘ
          </span>
        )}
      </p>
      <PlayListBlock
        plays={filtered}
        team={team}
        group={group}
        darkMode={darkMode}
        fantasy={showFantasy ? fantasy : null}
        onOpenGame={onOpenGame}
        people={people}
      />
    </div>
  );
}
