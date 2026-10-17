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
import { tipAttrs } from '../player/dashboardUi.js';
import { Segmented } from '../player/DashboardParts.jsx';
import { SparkBars } from './TeamCharts.jsx';

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
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/* ---------- Position leaders ---------- */

function LeaderCard({ role, tag, entry, games, link, fantasy }) {
  const spec = LEADER_SPECS[role];
  if (!entry) return <div className="team-dash-leader is-empty">No {spec.label.toLowerCase()} stats yet</div>;
  const useFantasy = Boolean(fantasy && FANTASY_ROLES.has(role) && entry.fp != null);
  const value = useFantasy ? entry.fp : entry[spec.stat];
  const dp = useFantasy ? 1 : spec.dp ?? 0;
  const unit = useFantasy ? `${fantasy.label} pts` : spec.unit;
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
        <span className="team-dash-leader__value"><b>{fmt(value, dp)}</b><span>{unit}</span></span>
        <span className="team-dash-leader__line">{useFantasy ? `${fmt(entry.fp / entry.gp, 1)} per game · ` : ''}{spec.line(entry)}</span>
        <SparkBars points={points} format={(v) => fmt(v, dp)} label={unit} />
      </span>
    </>
  );
  const label = `${spec.label}: ${entry.n}, ${fmt(value, dp)} ${unit}. ${standing.backup ? 'Backup, ' : ''}${standing.text}`;
  return link.player
    ? <button type="button" className="team-dash-leader" aria-label={`${label}. Open player page`} onClick={() => link.onOpen(link.player)}>{content}</button>
    : <div className="team-dash-leader" aria-label={label}>{content}</div>;
}

export function PositionLeaders({ totals, games, depth, resolve, fantasy, season, lastWeek }) {
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
  const card = (role, entry, tag) => {
    const link = entry ? resolve(entry) : null;
    return (
      <LeaderCard
        key={`${role}-${tag ?? ''}-${entry?.id ?? 'none'}`}
        role={role}
        tag={tag}
        entry={entry}
        games={games}
        fantasy={fantasy}
        link={entry ? { ...link, standing: depthStanding(link.slots, role, depth.slotAthletes) } : null}
      />
    );
  };
  return (
    <section className="player-dash-block" aria-labelledby="team-dash-leaders">
      <div className="player-dash-section-head">
        <div>
          <span className="player-dash-eyebrow">{season} season{lastWeek ? ` · through Week ${lastWeek}` : ''}</span>
          <h2 id="team-dash-leaders" className="team-dash-heading">Position leaders</h2>
        </div>
        <span className="player-dash-meta">Select a player for his stats page</span>
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
        <div className="team-dash-leader-split">
          <div className="team-dash-leader-row">
            <span className="player-dash-eyebrow">Defense</span>
            <div className="team-dash-leader-grid is-defense">{['EDGE', 'DL', 'LB', 'CB', 'S'].map((role) => card(role, pick(role, 1)[0]))}</div>
          </div>
          <div className="team-dash-leader-row">
            <span className="player-dash-eyebrow">Special teams</span>
            <div className="team-dash-leader-grid is-special">{card('K', pick('K', 1)[0])}{card('P', pick('P', 1)[0])}</div>
          </div>
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
// Formation spots: [slot, index, x %, y %]. Offense faces up toward the line; defense lines up below its deep safeties.
const SPOTS = {
  off: { los: 22, at: [['wr1', 0, 6, 22], ['lt', 0, 31, 22], ['lg', 0, 40.5, 22], ['c', 0, 50, 22], ['rg', 0, 59.5, 22], ['rt', 0, 69, 22], ['te', 0, 79, 24], ['wr2', 0, 94, 22], ['wr3', 0, 17, 44], ['qb', 0, 50, 52], ['rb', 0, 50, 80]] },
  def: { los: 84, at: [['fs', 0, 62, 14], ['ss', 0, 38, 14], ['lcb', 0, 8, 48], ['rcb', 0, 92, 48], ['lilb', 0, 42, 46], ['rilb', 0, 58, 46], ['mlb', 0, 50, 46], ['wlb', 0, 22, 72], ['lde', 0, 38, 72], ['nt', 0, 50, 72], ['ldt', 0, 44, 72], ['rdt', 0, 56, 72], ['rde', 0, 62, 72], ['slb', 0, 78, 72]] },
};
const UNIT_LABEL = { off: 'Offense', def: 'Defense', st: 'Special teams' };
// Spots packed along the line of scrimmage; on phones they show only their position label.
const LINE_SLOTS = new Set(['lt', 'lg', 'c', 'rg', 'rt', 'te', 'lde', 'nt', 'rde', 'ldt', 'rdt']);

export function DepthChart({ units, rosterById, onOpenPlayer, season }) {
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

  const person = (athlete, { size = 30, className = 'team-dash-depth-cell', children } = {}) => {
    const player = rosterById[athlete.id];
    const body = (
      <>
        <Avatar espnId={athlete.id} name={athlete.name} size={size} />
        {children ?? (
          <span className="team-dash-depth-cell__name">
            <span className="is-full">{athlete.name}</span>
            <span className="is-last">{lastName(athlete.name)}</span>
            {player?.jersey && <small>#{player.jersey}</small>}
          </span>
        )}
      </>
    );
    return player
      ? <button type="button" className={className} onClick={() => onOpenPlayer(player)} aria-label={`${athlete.name}${player.jersey ? `, number ${player.jersey}` : ''}. Open player page`}>{body}</button>
      : <span className={className}>{body}</span>;
  };

  const spots = SPOTS[unitKey];
  const formation = spots ? spots.at.filter(([key, index]) => slotMap[key]?.athletes[index]) : [];
  const extras = spots ? unit.slots.filter((slot) => slot.athletes[0] && !spots.at.some(([key]) => key === slot.key) && slot.key !== 'fb') : [];

  const rows = order.flatMap((key) => {
    const slot = slotMap[key];
    // ESPN lists every receiver in one ranked column; the first three start in a 3-receiver set.
    if (key === 'wr') {
      return [0, 1, 2].filter((index) => slot.athletes[index]).map((index) => ({
        key: `wr${index}`, abbr: `WR${index + 1}`, name: 'Wide receiver', list: [slot.athletes[index], ...(index === 2 ? slot.athletes.slice(3) : [])],
      }));
    }
    return [{ key, abbr: slot.abbr, name: slot.name, list: slot.athletes }];
  });
  const columns = Math.min(4, Math.max(2, ...rows.map((row) => row.list.length)));

  return (
    <section className="player-dash-block" aria-labelledby="team-dash-depth">
      <div className="player-dash-section-head">
        <div>
          <span className="player-dash-eyebrow">Current depth chart · {unit.name}</span>
          <h2 id="team-dash-depth" className="team-dash-heading">Depth chart</h2>
        </div>
        <Segmented label="Unit" value={unitKey} onChange={choose} options={['off', 'def', 'st'].filter((key) => byUnit[key]).map((key) => ({ id: key, label: UNIT_LABEL[key] }))} />
      </div>
      {formation.length > 0 && (
        <div className="team-dash-formation" role="img" aria-label={`${unit.name} formation with starters`}>
          <div className="team-dash-formation__los" style={{ top: `${spots.los}%` }} />
          {formation.map(([key, index, x, y]) => {
            const slot = slotMap[key];
            const athlete = slot.athletes[index];
            const label = key === 'wr' ? `WR${index + 1}` : slot.abbr;
            const backups = key === 'wr'
              ? (index === 2 ? slot.athletes.slice(3).map((b) => lastName(b.name)).join(', ') : '')
              : slot.athletes.slice(1, 3).map((b) => lastName(b.name)).join(', ');
            return (
              // Edge spots stay inside the field; line spots drop their names on phones (the table lists them).
              <span
                key={`${key}-${index}`}
                className={`team-dash-formation__spot ${LINE_SLOTS.has(key) ? 'is-line' : ''}`}
                style={{ left: `${Math.min(89, Math.max(11, x))}%`, top: `${y}%` }}
                {...tipAttrs(`${label} · ${athlete.name}`, backups ? `Then ${backups}` : null)}
              >
                {person(athlete, {
                  size: 46,
                  className: 'team-dash-chip',
                  children: (
                    <>
                      <span className="team-dash-chip__label">{label}</span>
                      <span className="team-dash-chip__name">{lastName(athlete.name)}</span>
                    </>
                  ),
                })}
              </span>
            );
          })}
        </div>
      )}
      {formation.length > 0 && (
        <p className="player-dash-coverage">
          The blue line is the line of scrimmage; each spot lists its next two on the depth chart on hover or tap.
          {extras.length > 0 && ` The field shows the base 11. ${extras.map((slot) => `${slot.athletes[0].name} (${slot.name.toLowerCase()})`).join(', ')} comes on in sub packages and is listed below.`}
        </p>
      )}
      <div className="player-dash-table-wrap">
        <table className="team-dash-depth-table" aria-label={`${UNIT_LABEL[unitKey]} depth chart`}>
          <thead>
            <tr>
              <th scope="col">Position</th>
              {Array.from({ length: columns }, (_, index) => <th key={index} scope="col">{index === 0 ? 'Starter' : ['', '2nd', '3rd', '4th'][index]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" title={row.name}><span className="team-dash-slot">{row.abbr}</span> <span className="team-dash-slot-name">{row.name}</span></th>
                {Array.from({ length: columns }, (_, index) => (
                  <td key={index} className={index === 0 ? 'is-starter' : ''}>
                    {row.list[index] ? person(row.list[index]) : <span className="player-dash-faint">–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="player-dash-coverage">From ESPN&apos;s current depth chart{season ? `; stats above cover ${season}` : ''}. Select any player for his stats page.</p>
    </section>
  );
}
