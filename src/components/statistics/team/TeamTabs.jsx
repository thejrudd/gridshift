import { useState } from 'react';
import { fmt, ordinal, passerRating } from '../../../utils/playerSeason/dashboardModel.js';
import { gameWon, lineFor } from '../../../utils/teamSeason/teamDashboardModel.js';
import { RankStrips, SectionHead, TeamMark } from '../player/DashboardParts.jsx';
import { DriveBars, QuarterBars, ResultsTape, SparkBars, TrendTiles } from './TeamCharts.jsx';

const z = (value) => Number(value) || 0;
const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtKickoff = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ---------- Season ---------- */

export function SeasonTab({ data, team, teamName, darkMode, onOpenGame }) {
  const games = data.games;
  const teams = data.teams ?? {};
  const me = teams[team] ?? {};
  const rank = (key) => data.ranks.find((entry) => entry.key === key)?.vals.find((entry) => entry.t === team);
  const kpis = [['Points per game', 'pts'], ['Allowed per game', 'ptsA'], ['Yards per game', 'yds'], ['Yards allowed per game', 'ydsA']]
    .map(([label, key]) => ({ label, key, entry: rank(key), count: data.ranks.find((entry) => entry.key === key)?.vals.length ?? 32 }));

  const divisionRows = data.standings
    .filter((row) => teams[row.t]?.conf === me.conf && teams[row.t]?.div === me.div)
    .sort((a, b) => b.w - a.w || a.l - b.l || (b.pf - b.pa) - (a.pf - a.pa));
  const divisionName = `${me.conf ?? ''} ${me.div ? me.div[0] + me.div.slice(1).toLowerCase() : ''}`.trim();

  const record = (list) => { const wins = list.filter(gameWon).length; return `${wins}–${list.length - wins}`; };
  const average = (list, valueOf) => (list.length ? fmt(sum(list.map(valueOf)) / list.length, 1) : '–');
  const splits = [
    ['Home', games.filter((game) => game.home)],
    ['Away', games.filter((game) => !game.home)],
    ['One-score games (8 or fewer)', games.filter((game) => Math.abs(game.pf - game.pa) <= 8)],
    ['Division games', games.filter((game) => teams[game.opp]?.div === me.div && teams[game.opp]?.conf === me.conf)],
    [`vs ${me.conf === 'AFC' ? 'NFC' : 'AFC'}`, games.filter((game) => teams[game.opp]?.conf && teams[game.opp]?.conf !== me.conf)],
    ['Won the turnover battle', games.filter((game) => z(game.ts.opp?.turnovers) > z(game.ts.me?.turnovers))],
  ].filter(([, list]) => list.length);

  const quarters = [0, 1, 2, 3, 4].map((index) => ({
    q: index < 4 ? `Q${index + 1}` : 'OT',
    f: sum(games.map((game) => game.qf[index])),
    a: sum(games.map((game) => game.qa[index])),
  })).filter((quarter) => quarter.q !== 'OT' || quarter.f || quarter.a);

  const scored = {};
  for (const game of games) {
    for (const play of game.scoring.filter((entry) => entry.side === 'me')) {
      const entry = (scored[play.type] ??= { n: 0, pts: 0 });
      entry.n += 1;
      entry.pts += play.pts;
    }
  }
  const scoredOrder = ['Passing TD', 'Rushing TD', 'Field goal', 'Defensive TD', 'Return TD', 'Safety', 'Other'].filter((type) => scored[type]);
  const scoredMax = Math.max(...scoredOrder.map((type) => scored[type].pts), 1);

  const bucket = (result) => (['Touchdown', 'Field goal', 'Downs', 'Turnover', 'Punt'].includes(result) ? result : 'Other');
  const driveRows = [[`${teamName} offense`, 'me'], ['Opponent offenses', 'opp']].map(([label, side]) => {
    const drives = games.flatMap((game) => game.drives.filter((drive) => drive.tm === side));
    const counts = {};
    for (const drive of drives) counts[bucket(drive.r)] = (counts[bucket(drive.r)] ?? 0) + 1;
    return { label, n: drives.length, counts };
  });

  const trendDefs = [
    ['Total yards', (game) => game.ts.me?.total_yards, (v) => fmt(v), 'avg'],
    ['Yards allowed', (game) => game.ts.opp?.total_yards, (v) => fmt(v), 'avg'],
    ['Third-down rate', (game) => (game.ts.me?.third_down_attempts ? (100 * z(game.ts.me.third_down_conversions)) / game.ts.me.third_down_attempts : null), (v) => `${fmt(v)}%`, 'avg'],
    ['Turnover margin', (game) => (game.ts.me ? z(game.ts.opp?.turnovers) - z(game.ts.me.turnovers) : null), (v) => `${v > 0 ? '+' : ''}${fmt(v)}`, 'sum'],
  ];
  const trends = trendDefs.map(([label, valueOf, format, mode]) => {
    const points = games.map((game) => ({ game, v: valueOf(game) })).filter((point) => point.v != null);
    const values = points.map((point) => point.v);
    return { label, format, mode, points, head: values.length ? (mode === 'sum' ? sum(values) : sum(values) / values.length) : null };
  });

  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Team stats" meta={`League ranks from ${data.leagueGames} finished games`} />
        <div className="player-dash-rail team-dash-kpis">
          {kpis.map(({ label, key, entry, count }) => (
            <div key={key} className="player-dash-kpi">
              <span className="player-dash-eyebrow">{label}</span>
              <span className="player-dash-kpi__value">{entry ? fmt(entry.v, 1) : '–'}</span>
              <span className="player-dash-kpi__rank">{entry ? <><b>{ordinal(entry.r)}</b> of {count}</> : 'Not ranked yet'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="player-dash-block">
        <SectionHead title="Game results">
          <div className="player-dash-legend">
            <span><i className="is-win-dot" />Win</span>
            <span><i className="is-loss" />Loss</span>
            <span>Bars show the final margin · select a game to open it</span>
          </div>
        </SectionHead>
        <ResultsTape games={games} schedule={data.schedule} teamName={teamName} darkMode={darkMode} onOpenGame={onOpenGame} />
      </div>

      <div className="player-dash-grid is-wide-left">
        <div className="player-dash-block">
          <SectionHead title="Schedule & results" meta={`${games.length} played · ${data.schedule.length} to go`} />
          <div className="team-dash-log">
            {games.map((game) => {
              const mine = game.ts.me ?? {};
              const theirs = game.ts.opp ?? {};
              const line = mine.total_yards
                ? `${fmt(mine.total_yards)} yds to ${fmt(theirs.total_yards)} · ${z(mine.turnovers)} giveaway${z(mine.turnovers) === 1 ? '' : 's'}, ${z(theirs.turnovers)} takeaway${z(theirs.turnovers) === 1 ? '' : 's'}`
                : '';
              return (
                <button key={game.id} type="button" className="team-dash-log__row" onClick={() => onOpenGame(game, 'team')}>
                  <span className="team-dash-log__week">Wk {game.week}<small>{fmtDate(game.date)}</small></span>
                  <span className="team-dash-log__who"><span className="player-dash-faint">{game.home ? 'vs' : '@'}</span><TeamMark abbr={game.opp} darkMode={darkMode} size={20} /><span>{teams[game.opp]?.name ?? game.opp}</span></span>
                  <span className="team-dash-log__result">
                    <span className={`player-dash-pill ${gameWon(game) ? 'is-win' : 'is-loss'}`}>{gameWon(game) ? 'W' : game.pf === game.pa ? 'T' : 'L'}</span>
                    {game.pf}–{game.pa}{game.ot ? <small> OT</small> : null}
                  </span>
                  <span className="team-dash-log__line">{[line, game.summary].filter(Boolean).join(' · ')}</span>
                </button>
              );
            })}
            {data.schedule.map((game, index) => (
              <div key={game.id} className="team-dash-log__row is-upcoming">
                <span className="team-dash-log__week">Wk {game.week}<small>{fmtDate(game.date)}</small></span>
                <span className="team-dash-log__who"><span className="player-dash-faint">{game.home ? 'vs' : '@'}</span><TeamMark abbr={game.opp} darkMode={darkMode} size={20} /><span>{teams[game.opp]?.name ?? game.opp}</span></span>
                <span className="team-dash-log__result">{index === 0 ? <span className="player-dash-tag is-strong">Next</span> : <span className="player-dash-faint">Upcoming</span>}</span>
                <span className="team-dash-log__line">{fmtKickoff(game.date)}{game.venue ? ` · ${game.venue}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="player-dash-block">
          <SectionHead title="Division standings" meta="Regular season" />
          <div className="player-dash-table-wrap">
            <table className="player-dash-table">
              <thead><tr><th scope="col">{divisionName}</th><th scope="col">W</th><th scope="col">L</th><th scope="col">Div</th><th scope="col">PF</th><th scope="col">PA</th><th scope="col">Diff</th></tr></thead>
              <tbody>
                {divisionRows.map((row) => (
                  <tr key={row.t} className={row.t === team ? 'is-me' : ''}>
                    <th scope="row"><span className="team-dash-team"><TeamMark abbr={row.t} darkMode={darkMode} size={16} />{teams[row.t]?.name ?? row.t}</span></th>
                    <td>{row.w}</td><td>{row.l}</td><td>{row.dw}–{row.dl}</td><td>{row.pf}</td><td>{row.pa}</td>
                    <td>{row.pf - row.pa > 0 ? '+' : ''}{row.pf - row.pa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionHead title="Splits" />
          <div className="player-dash-splits">
            {splits.map(([label, list]) => (
              <div key={label} className="player-dash-split">
                <span>{label}</span>
                <span className="player-dash-meta">{average(list, (game) => game.pf)}–{average(list, (game) => game.pa)} avg</span>
                <span className="player-dash-split__value">{record(list)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="player-dash-block">
        <SectionHead title="Scoring and drives" />
        <div className="player-dash-grid">
          <div className="player-dash-block">
            <h3 className="player-dash-subhead">Points by quarter</h3>
            <QuarterBars quarters={quarters} teamName={teamName} />
          </div>
          <div className="player-dash-block">
            <h3 className="player-dash-subhead">How they scored</h3>
            <div className="player-dash-surface">
              <div className="player-dash-splits is-bare">
                {scoredOrder.map((type) => (
                  <div key={type} className="player-dash-split team-dash-scored">
                    <span>{type}</span>
                    <span className="team-dash-scored__track"><i style={{ width: `${(scored[type].pts / scoredMax) * 100}%` }} /></span>
                    <span className="team-dash-scored__value"><b>{scored[type].pts}</b> <span className="player-dash-meta">pts · {scored[type].n}</span></span>
                  </div>
                ))}
              </div>
              <p className="player-dash-coverage">Points include the extra point or two-point try that followed. Count is the number of scoring plays.</p>
            </div>
          </div>
        </div>
        <h3 className="player-dash-subhead">How drives ended</h3>
        <DriveBars rows={driveRows} />
        <h3 className="player-dash-subhead">Game-by-game trends</h3>
        <TrendTiles trends={trends} onOpenGame={onOpenGame} />
      </div>
    </div>
  );
}

/* ---------- Player stats ---------- */

const rating = (a) => passerRating(z(a.passing_completions), z(a.passing_attempts), z(a.passing_yards), z(a.passing_touchdowns), z(a.passing_interceptions));
// [header, value, decimals, sort key]
const TABLES = [
  { key: 'pass', title: 'Passing', has: (a) => z(a.passing_attempts) >= 5, sort: 2, cols: [['G', (a) => a.gp], ['CMP', (a) => z(a.passing_completions)], ['ATT', (a) => z(a.passing_attempts)], ['YDS', (a) => z(a.passing_yards)], ['PCT', (a) => (a.passing_attempts ? (100 * z(a.passing_completions)) / a.passing_attempts : null), 1], ['Y/A', (a) => (a.passing_attempts ? z(a.passing_yards) / a.passing_attempts : null), 1], ['TD', (a) => z(a.passing_touchdowns)], ['INT', (a) => z(a.passing_interceptions)], ['SCK', (a) => z(a.sacks)], ['RATE', (a) => rating(a), 1]] },
  { key: 'rush', title: 'Rushing', has: (a) => z(a.rushing_attempts) > 0, sort: 2, cols: [['G', (a) => a.gp], ['CAR', (a) => z(a.rushing_attempts)], ['YDS', (a) => z(a.rushing_yards)], ['AVG', (a) => (a.rushing_attempts ? z(a.rushing_yards) / a.rushing_attempts : null), 1], ['TD', (a) => z(a.rushing_touchdowns)], ['LONG', (a) => a.long_rushing ?? null], ['FUM LOST', (a) => z(a.fumbles_lost)]] },
  { key: 'rec', title: 'Receiving', has: (a) => z(a.receptions) > 0 || z(a.receiving_targets) > 0, sort: 3, cols: [['G', (a) => a.gp], ['TGT', (a) => z(a.receiving_targets)], ['REC', (a) => z(a.receptions)], ['YDS', (a) => z(a.receiving_yards)], ['AVG', (a) => (a.receptions ? z(a.receiving_yards) / a.receptions : null), 1], ['TD', (a) => z(a.receiving_touchdowns)], ['LONG', (a) => a.long_reception ?? null]] },
  { key: 'def', title: 'Defense', has: (a) => z(a.total_tackles) > 0 || z(a.defensive_sacks) > 0 || z(a.defensive_interceptions) > 0 || z(a.passes_defended) > 0, sort: 1, cols: [['G', (a) => a.gp], ['TKL', (a) => z(a.total_tackles)], ['SOLO', (a) => z(a.solo_tackles)], ['SACK', (a) => z(a.defensive_sacks), 1], ['TFL', (a) => z(a.tackles_for_loss)], ['PD', (a) => z(a.passes_defended)], ['QB HIT', (a) => z(a.qb_hits)], ['INT', (a) => z(a.defensive_interceptions)], ['TD', (a) => z(a.interception_touchdowns)]] },
  { key: 'kick', title: 'Kicking', has: (a) => z(a.field_goal_attempts) > 0 || z(a.extra_points_made) > 0, sort: 6, cols: [['G', (a) => a.gp], ['FGM', (a) => z(a.field_goals_made)], ['FGA', (a) => z(a.field_goal_attempts)], ['PCT', (a) => (a.field_goal_attempts ? (100 * z(a.field_goals_made)) / a.field_goal_attempts : null), 1], ['LONG', (a) => a.long_field_goal_made ?? null], ['XP', (a) => z(a.extra_points_made)], ['PTS', (a) => z(a.total_points)]] },
  { key: 'punt', title: 'Punting', has: (a) => z(a.punts) > 0, sort: 1, cols: [['G', (a) => a.gp], ['PUNTS', (a) => z(a.punts)], ['YDS', (a) => z(a.punt_yards)], ['AVG', (a) => (a.punts ? z(a.punt_yards) / a.punts : null), 1], ['IN 20', (a) => z(a.punts_inside_20)], ['LONG', (a) => a.long_punt ?? null]] },
  { key: 'ret', title: 'Returns', has: (a) => z(a.kick_returns) > 0 || z(a.punt_returns) > 0, sort: 2, cols: [['G', (a) => a.gp], ['KR', (a) => z(a.kick_returns)], ['KR YDS', (a) => z(a.kick_return_yards)], ['PR', (a) => z(a.punt_returns)], ['PR YDS', (a) => z(a.punt_return_yards)], ['TD', (a) => z(a.kick_return_touchdowns) + z(a.punt_return_touchdowns)]] },
];
const FANTASY_TABLE = { key: 'fant', title: 'Fantasy points', has: (a) => a.fp != null, sort: 1, cols: [['G', (a) => a.gp], ['FPTS', (a) => a.fp, 1], ['PER GAME', (a) => a.fp / a.gp, 1], ['PASS YDS', (a) => z(a.passing_yards)], ['RUSH YDS', (a) => z(a.rushing_yards)], ['REC', (a) => z(a.receptions)], ['REC YDS', (a) => z(a.receiving_yards)], ['TD', (a) => z(a.passing_touchdowns) + z(a.rushing_touchdowns) + z(a.receiving_touchdowns)], ['FG', (a) => z(a.field_goals_made)]] };

function SortableTable({ table, rows, title, onOpen }) {
  const [sort, setSort] = useState({ index: table.sort, dir: -1 });
  const column = table.cols[sort.index];
  const sorted = [...rows].sort((a, b) => ((column[1](b) ?? -1e9) - (column[1](a) ?? -1e9)) * -sort.dir || a.n.localeCompare(b.n));
  const toggle = (index) => setSort((previous) => ({ index, dir: previous.index === index ? -previous.dir : -1 }));
  return (
    <div className="player-dash-block">
      <SectionHead title={title} meta={`${rows.length} player${rows.length === 1 ? '' : 's'}`} />
      <div className="player-dash-table-wrap">
        <table className="player-dash-table team-dash-sortable">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {table.cols.map(([header], index) => (
                <th key={header} scope="col" aria-sort={index === sort.index ? (sort.dir < 0 ? 'descending' : 'ascending') : undefined}>
                  <button type="button" onClick={() => toggle(index)}>{header}{index === sort.index ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  {onOpen(row) ? (
                    <button type="button" className="team-dash-player-link" onClick={onOpen(row)}>{row.n}</button>
                  ) : row.n}
                  <span className="player-dash-faint"> {row.pos}</span>
                </th>
                {table.cols.map(([header, valueOf, dp], index) => (
                  <td key={header} className={index === sort.index ? 'is-strong' : ''}>{fmt(valueOf(row), dp ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlayersTab({ totals, games, fantasy, openByEntry }) {
  const top = (key) => totals.filter((entry) => entry[key]).sort((a, b) => b[key] - a[key])[0];
  const leaders = [
    ['Passing yards', 'passing_yards', (a) => `${fmt(a.passing_completions)}/${fmt(a.passing_attempts)} · ${z(a.passing_touchdowns)} TD · ${z(a.passing_interceptions)} INT`],
    ['Rushing yards', 'rushing_yards', (a) => `${fmt(a.rushing_attempts)} carries · ${fmt(z(a.rushing_yards) / (a.rushing_attempts || 1), 1)} avg · ${z(a.rushing_touchdowns)} TD`],
    ['Receiving yards', 'receiving_yards', (a) => `${fmt(a.receptions)} catches on ${fmt(a.receiving_targets)} targets · ${z(a.receiving_touchdowns)} TD`],
    ['Tackles', 'total_tackles', (a) => `${z(a.solo_tackles)} solo · ${z(a.tackles_for_loss)} for loss`],
    ['Sacks', 'defensive_sacks', (a) => `${z(a.qb_hits)} QB hits · ${z(a.tackles_for_loss)} for loss`],
    ['Interceptions', 'defensive_interceptions', (a) => `${z(a.interception_yards)} return yards · ${z(a.passes_defended)} passes defended`],
  ];
  const tables = fantasy ? [FANTASY_TABLE, ...TABLES] : TABLES;
  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Team leaders" meta="Select a player for his stats page" />
        <div className="team-dash-leaders">
          {leaders.map(([category, key, sub]) => {
            const entry = top(key);
            if (!entry) return null;
            const dp = key === 'defensive_sacks' ? 1 : 0;
            const open = openByEntry(entry);
            const body = (
              <>
                <span className="player-dash-eyebrow">{category}</span>
                <span className="team-dash-leaders__value">{fmt(entry[key], dp)}</span>
                <span className="team-dash-leaders__who">{entry.n} <span className="player-dash-faint">{entry.pos}</span></span>
                <span className="player-dash-meta">{sub(entry)}</span>
                <SparkBars points={games.map((game) => ({ game, v: lineFor(game, entry.id)?.[key] ?? 0 }))} format={(v) => fmt(v, dp)} label={category} />
              </>
            );
            return open
              ? <button key={key} type="button" className="team-dash-leaders__cell" onClick={open}>{body}</button>
              : <div key={key} className="team-dash-leaders__cell">{body}</div>;
          })}
        </div>
      </div>
      {tables.map((table) => {
        const rows = totals.filter(table.has);
        if (!rows.length) return null;
        return <SortableTable key={table.key} table={table} rows={rows} title={table.key === 'fant' ? `Fantasy points · ${fantasy.label}` : table.title} onOpen={openByEntry} />;
      })}
    </div>
  );
}

/* ---------- League ranks ---------- */

export function RanksTab({ data, team, teamName }) {
  const teams = data.teams ?? {};
  const toStrips = (unit) => data.ranks.filter((rank) => rank.unit === unit).map((rank) => ({
    ...rank,
    vals: rank.vals.map((entry) => ({ id: entry.t, n: teams[entry.t]?.name ?? entry.t, t: entry.t, v: entry.v, r: entry.r })),
  }));
  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="League ranks" meta="Each dot is a team · better is always to the right" />
        <p className="player-dash-coverage">Ranks come from all {data.leagueGames} finished {data.season} games. Teams have played different numbers of games, so most stats are per game.</p>
      </div>
      {[['off', 'Offense'], ['def', 'Defense'], ['all', 'Overall']].map(([unit, label]) => (
        <div key={unit} className="player-dash-block">
          <h3 className="player-dash-subhead">{label}</h3>
          <RankStrips ranks={toStrips(unit)} playerId={team} playerName={teamName} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Full roster ---------- */

const ROSTER_GROUPS = [
  ['Quarterbacks', ['QB']], ['Running backs', ['RB', 'FB', 'HB']], ['Wide receivers', ['WR']], ['Tight ends', ['TE']],
  ['Offensive line', ['OT', 'OG', 'C', 'G', 'T', 'OL']], ['Defensive line', ['DE', 'DT', 'NT', 'DL', 'ED', 'EDGE']],
  ['Linebackers', ['LB', 'ILB', 'OLB', 'MLB']], ['Defensive backs', ['CB', 'S', 'SS', 'FS', 'DB']], ['Specialists', ['K', 'P', 'LS', 'PK']],
];

function keyLine(entry, fantasy) {
  const parts = [];
  if (entry.passing_attempts) parts.push(`${fmt(entry.passing_yards)} pass yds, ${z(entry.passing_touchdowns)} TD`);
  if (z(entry.rushing_attempts) >= 3) parts.push(`${fmt(entry.rushing_yards)} rush yds`);
  if (entry.receptions) parts.push(`${entry.receptions} rec, ${fmt(entry.receiving_yards)} yds`);
  if (entry.total_tackles) parts.push(`${entry.total_tackles} tkl`);
  if (entry.defensive_sacks) parts.push(`${fmt(entry.defensive_sacks, 1)} sacks`);
  if (entry.defensive_interceptions) parts.push(`${entry.defensive_interceptions} INT`);
  if (entry.field_goal_attempts) parts.push(`${z(entry.field_goals_made)}/${entry.field_goal_attempts} FG`);
  if (entry.punts) parts.push(`${entry.punts} punts, ${fmt(z(entry.punt_yards) / entry.punts, 1)} avg`);
  const line = parts.slice(0, 2).join(' · ') || 'Appeared in the box score';
  return fantasy && entry.fp != null ? `${fmt(entry.fp, 1)} fantasy pts · ${line}` : line;
}

export function RosterTab({ roster, totalsByEspnId, depthText, fantasy, season, onOpenPlayer }) {
  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Full roster" meta={`${roster.length} players · current roster`} />
        <p className="player-dash-coverage">From ESPN&apos;s current roster. Stat lines cover {season} box scores; players without one show their depth-chart spot.</p>
      </div>
      {ROSTER_GROUPS.map(([label, positions]) => {
        const players = roster.filter((player) => positions.includes(String(player.position ?? '').toUpperCase()))
          .sort((a, b) => (Number(a.jersey) || 99) - (Number(b.jersey) || 99));
        if (!players.length) return null;
        return (
          <div key={label} className="player-dash-block">
            <SectionHead title={label} meta={String(players.length)} />
            <div className="team-dash-roster">
              {players.map((player) => {
                const entry = totalsByEspnId[player.id];
                const depth = depthText(player.id);
                return (
                  <button key={player.id} type="button" className="team-dash-roster__card" onClick={() => onOpenPlayer(player)}>
                    <span className="team-dash-roster__name">{player.displayName} <span className="player-dash-faint">#{player.jersey}</span></span>
                    <span className="player-dash-meta">
                      {[player.position, [player.height, player.weight].filter(Boolean).join(', '), player.experience ? `${ordinal(player.experience + 1)} season` : 'Rookie'].filter(Boolean).join(' · ')}
                    </span>
                    <span className="team-dash-roster__line">
                      {entry ? keyLine(entry, fantasy) : depth ? `Depth chart: ${depth}` : <span className="player-dash-faint">No stats yet</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

