import { useState } from 'react';
import { headshot } from '../../../utils/playerApi.js';
import { fmt } from '../../../utils/playerSeason/dashboardModel.js';
import {
  depthStanding,
  FANTASY_ROLES,
  LEADER_SPECS,
  lastName,
  lineFor,
  linePoints,
  unitOf,
} from '../../../utils/teamSeason/teamDashboardModel.js';
import { Segmented } from '../player/DashboardParts.jsx';
import { SparkBars } from './TeamCharts.jsx';

const z = (value) => Number(value) || 0;

function Avatar({ espnId, name, size }) {
  const [failed, setFailed] = useState(false);
  const initials = String(name ?? '?').split(' ').filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  if (!espnId || failed) {
    return <span className="team-dash-avatar is-initials" style={{ width: size, height: size }} aria-hidden="true">{initials}</span>;
  }
  return (
    <img
      className="team-dash-avatar"
      src={headshot(espnId)}
      alt=""
      width={size}
      height={size}
      // Inline size beats the base `img { height: auto }` rule, which would squash ESPN's 4:3 headshots into ovals.
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/* ---------- Position leaders ---------- */

// The Scores player table each card's chart stat lives in.
const SCORES_GROUP = { QB: 'passing', RB: 'rushing', WR: 'receiving', TE: 'receiving', K: 'kicking', P: 'punting' };

function LeaderCard({ role, tag, entry, games, link, fantasy, onOpenGame }) {
  const spec = LEADER_SPECS[role];
  if (!entry) return <div className="team-dash-leader is-empty">No {spec.label.toLowerCase()} stats yet</div>;
  const useFantasy = Boolean(fantasy && FANTASY_ROLES.has(role) && entry.fp != null);
  const value = useFantasy ? entry.fp : entry[spec.stat];
  const dp = useFantasy ? 1 : spec.dp ?? 0;
  const unit = useFantasy ? `${fantasy.label} pts` : spec.unit;
  // League names can be long, so fantasy cards show "pts" by the number and the league on its own clipped line.
  const shortUnit = useFantasy ? 'pts' : spec.unit;
  const points = games.map((game) => {
    const line = lineFor(game, entry.id);
    let v = 0;
    if (useFantasy) v = linePoints(line, entry.pos, fantasy) ?? 0;
    else if (spec.stat === 'punt_avg') v = line?.punts ? line.punt_yards / line.punts : 0;
    else v = line?.[spec.stat] ?? 0;
    return { game, v };
  });
  const standing = link.standing;
  const content = (
    <>
      <span className="team-dash-leader__top">
        <Avatar espnId={link.player?.id} name={entry.n} size={64} />
        <span className="team-dash-leader__role">{tag || role}</span>
        <span className="team-dash-leader__jersey">{entry.j}</span>
      </span>
      <span className="team-dash-leader__body">
        <span className="team-dash-leader__name">{entry.n}</span>
        <span className="team-dash-leader__pos">{spec.label}</span>
        <span className={`team-dash-leader__depth ${standing.backup ? 'is-backup' : ''}`}>
          {standing.backup && <b>Backup</b>} {standing.text}
        </span>
        <span className="team-dash-leader__value"><b>{fmt(value, dp)}</b><span>{shortUnit}</span></span>
        {useFantasy && <span className="team-dash-leader__league" title={fantasy.label}>{fantasy.label} scoring</span>}
        <span className="team-dash-leader__line">{useFantasy ? `${fmt(entry.fp / entry.gp, 1)} per game · ` : ''}{spec.line(entry)}</span>
        <SparkBars
          points={points}
          format={(v) => fmt(v, dp)}
          label={unit}
          subject={entry.n}
          selectHint="Select to open this game by quarter"
          onSelect={onOpenGame ? (game) => onOpenGame(game, 'players', { playerGroup: SCORES_GROUP[role] ?? 'defense', playerId: entry.id }) : undefined}
        />
      </span>
    </>
  );
  const label = `${spec.label}: ${entry.n}, ${fmt(value, dp)} ${unit}. ${standing.backup ? 'Backup, ' : ''}${standing.text}`;
  return link.player
    ? <button type="button" className="team-dash-leader" aria-label={`${label}. Open player page`} onClick={() => link.onOpen(link.player)}>{content}</button>
    : <div className="team-dash-leader" aria-label={label}>{content}</div>;
}

export function PositionLeaders({ totals, games, depth, resolve, fantasy, onOpenGame }) {
  const withRole = totals.map((entry) => ({ ...entry, role: resolve(entry).role }));
  // League scoring leaves kickers unscored (no kick distances), so they rank by their stats instead.
  const scoreOf = (role, entry) => (fantasy && FANTASY_ROLES.has(role) && entry.fp != null ? entry.fp : LEADER_SPECS[role].score(entry));
  const pick = (role, count) => withRole
    .filter((entry) => entry.role === role && scoreOf(role, entry) > 0)
    .sort((a, b) => scoreOf(role, b) - scoreOf(role, a))
    .slice(0, count);
  // Top three receivers by production, labeled and ordered by their depth-chart spot:
  // a starter at WR2 is 2; a backup sorts after the starters.
  const wrRank = (entry) => {
    const slot = resolve(entry).slots.filter((entry2) => /^wr\d?$/.test(entry2.k)).sort((a, b) => a.rank - b.rank)[0];
    if (!slot) return 99;
    if (slot.k === 'wr') return slot.rank;
    const spot = Number(slot.k.slice(2));
    return slot.rank === 1 ? spot : 10 + spot;
  };
  const receivers = pick('WR', 3).sort((a, b) => wrRank(a) - wrRank(b));
  // The interceptions leader can play any spot, so his card reads his depth standing at his own role.
  const ballHawk = withRole
    .filter((entry) => z(entry.defensive_interceptions) > 0)
    .sort((a, b) => z(b.defensive_interceptions) - z(a.defensive_interceptions) || z(b.passes_defended) - z(a.passes_defended))[0];
  const card = (role, entry, tag) => {
    const link = entry ? resolve(entry) : null;
    const standingRole = role === 'INT' ? link?.role : role;
    return (
      <LeaderCard
        key={`${role}-${tag ?? ''}-${entry?.id ?? 'none'}`}
        role={role}
        tag={tag}
        entry={entry}
        games={games}
        fantasy={fantasy}
        onOpenGame={onOpenGame}
        link={entry ? { ...link, standing: depthStanding(link.slots, standingRole, depth.slotAthletes) } : null}
      />
    );
  };
  return (
    <section className="player-dash-block" aria-labelledby="team-dash-leaders">
      <div className="player-dash-section-head">
        <h2 id="team-dash-leaders" className="player-dash-heading">Position leaders</h2>
      </div>
      {fantasy && (
        <p className="player-dash-coverage">Offense and kicker cards show the top {fantasy.label} fantasy scorer at each spot. Defense and punter cards keep their stats.</p>
      )}
      <div className="team-dash-leader-groups">
        <div className="team-dash-leader-row">
          <span className="player-dash-eyebrow">Offense</span>
          <div className="team-dash-leader-grid is-offense">
            {card('QB', pick('QB', 1)[0])}
            {card('RB', pick('RB', 1)[0])}
            {[0, 1, 2].map((index) => {
              const entry = receivers[index];
              const rank = entry ? wrRank(entry) : 99;
              return card('WR', entry, rank < 10 ? `WR${rank}` : 'WR');
            })}
            {card('TE', pick('TE', 1)[0])}
          </div>
        </div>
        <div className="team-dash-leader-row">
          <span className="player-dash-eyebrow">Defense</span>
          <div className="team-dash-leader-grid is-defense">
            {['EDGE', 'DL', 'LB', 'CB', 'S'].map((role) => card(role, pick(role, 1)[0]))}
            {ballHawk && card('INT', ballHawk, 'INT')}
          </div>
        </div>
        <div className="team-dash-leader-row">
          <span className="player-dash-eyebrow">Special teams</span>
          <div className="team-dash-leader-grid is-special">{card('K', pick('K', 1)[0])}{card('P', pick('P', 1)[0])}</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Depth chart ---------- */

const DEPTH_ORDER = {
  off: ['qb', 'rb', 'fb', 'wr1', 'wr2', 'wr3', 'wr', 'te', 'lt', 'lg', 'c', 'rg', 'rt'],
  def: ['wlb', 'lde', 'nt', 'ldt', 'rdt', 'rde', 'slb', 'lilb', 'mlb', 'rilb', 'lcb', 'nb', 'rcb', 'ss', 'fs'],
  st: ['pk', 'p', 'h', 'ls', 'kr', 'pr'],
};
const UNIT_LABEL = { off: 'Offense', def: 'Defense', st: 'Special teams' };
// Row groups per unit, by slot key (`wr` covers ESPN's single ranked receiver column). Special teams has none.
const DEPTH_GROUPS = {
  off: [['Backfield', ['qb', 'rb', 'fb']], ['Receivers', ['wr1', 'wr2', 'wr3', 'wr', 'te']], ['Offensive line', ['lt', 'lg', 'c', 'rg', 'rt']]],
  def: [['Defensive line', ['lde', 'nt', 'ldt', 'rdt', 'rde']], ['Linebackers', ['wlb', 'slb', 'lilb', 'mlb', 'rilb']], ['Secondary', ['lcb', 'rcb', 'nb', 'ss', 'fs']]],
};

export function DepthChart({ units, rosterById, onOpenPlayer }) {
  const [unitKey, setUnitKey] = useState(() => {
    try { return localStorage.getItem('gridshift.statistics.teamDepthUnit') || 'off'; } catch { return 'off'; }
  });
  const byUnit = Object.fromEntries(units.map((unit) => [unitOf(unit.name), unit]));
  const unit = byUnit[unitKey] ?? byUnit.off;
  if (!unit) return null;
  const slotMap = Object.fromEntries(unit.slots.map((slot) => [slot.key, slot]));
  const order = (DEPTH_ORDER[unitKey] ?? []).filter((key) => slotMap[key])
    .concat(unit.slots.map((slot) => slot.key).filter((key) => !(DEPTH_ORDER[unitKey] ?? []).includes(key)));
  const choose = (key) => {
    setUnitKey(key);
    try { localStorage.setItem('gridshift.statistics.teamDepthUnit', key); } catch { /* storage is optional */ }
  };

  const person = (athlete, rank) => {
    const player = rosterById[athlete.id];
    const body = (
      <>
        <Avatar espnId={athlete.id} name={athlete.name} size={28} />
        <span className="team-dash-depth-cell__name">
          <span className="is-full">{athlete.name}</span>
          <span className="is-last">{lastName(athlete.name)}</span>
        </span>
        {player?.jersey && <small className="team-dash-depth-cell__number">#{player.jersey}</small>}
      </>
    );
    const className = `team-dash-depth-cell ${rank === 0 ? 'is-starter' : ''}`;
    return player
      ? <button type="button" className={className} onClick={() => onOpenPlayer(player)} aria-label={`${athlete.name}${player.jersey ? `, number ${player.jersey}` : ''}. Open player page`}>{body}</button>
      : <span className={className}>{body}</span>;
  };

  const rows = order.flatMap((key) => {
    const slot = slotMap[key];
    // ESPN lists every receiver in one ranked column; the first three start in a 3-receiver set.
    if (key === 'wr') {
      return [0, 1, 2].filter((index) => slot.athletes[index]).map((index) => ({
        key: `wr${index}`, group: 'wr', abbr: `WR${index + 1}`, name: 'Wide receiver', list: [slot.athletes[index], ...(index === 2 ? slot.athletes.slice(3) : [])],
      }));
    }
    return [{ key, group: key, abbr: slot.abbr, name: slot.name, list: slot.athletes }];
  });
  const columns = Math.min(4, Math.max(2, ...rows.map((row) => row.list.length)));
  // Position groups label the rows; a slot outside every group joins the unit's last one.
  const groupDefs = DEPTH_GROUPS[unitKey] ?? [];
  const groups = groupDefs.length
    ? groupDefs.map(([label, keys], index) => ({
      label,
      rows: rows.filter((row) => keys.includes(row.group) || (index === groupDefs.length - 1 && !groupDefs.some(([, all]) => all.includes(row.group)))),
    })).filter((group) => group.rows.length)
    : [{ label: null, rows }];

  return (
    <section className="player-dash-block" aria-labelledby="team-dash-depth">
      <div className="player-dash-section-head">
        <h2 id="team-dash-depth" className="player-dash-heading">Depth chart</h2>
        <Segmented label="Unit" value={unitKey} onChange={choose} options={['off', 'def', 'st'].filter((key) => byUnit[key]).map((key) => ({ id: key, label: UNIT_LABEL[key] }))} />
      </div>
      <div className="team-dash-depth-wrap">
        <table className="team-dash-depth-table" aria-label={`${UNIT_LABEL[unitKey]} depth chart`}>
          <thead>
            <tr>
              <th scope="col"><abbr title="Position">Pos</abbr></th>
              {Array.from({ length: columns }, (_, index) => <th key={index} scope="col">{index === 0 ? 'Starter' : ['', '2nd', '3rd', '4th'][index]}</th>)}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.label ?? 'all'}>
              {group.label && (
                <tr className="team-dash-depth-group">
                  <th scope="rowgroup" colSpan={columns + 1}>{group.label}</th>
                </tr>
              )}
              {group.rows.map((row) => (
                <tr key={row.key} className="team-dash-depth-row">
                  <th scope="row"><abbr className="team-dash-slot" title={row.name}>{row.abbr}</abbr></th>
                  {Array.from({ length: columns }, (_, index) => (
                    <td key={index}>
                      {row.list[index] ? person(row.list[index], index) : <span className="team-dash-depth-empty" aria-label="None listed">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
