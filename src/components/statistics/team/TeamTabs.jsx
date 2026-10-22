import { useState } from 'react';
import { fmt, ordinal, passerRating } from '../../../utils/playerSeason/dashboardModel.js';
import { gameWon, quarterPoints, scoringBreakdown, scoringPartsOf } from '../../../utils/teamSeason/teamDashboardModel.js';
import { FilterChip, RankStrips, SectionHead, TeamMark } from '../player/DashboardParts.jsx';
import { tipAttrs } from '../player/dashboardUi.js';
import { DriveBars, QuarterBars, ResultsTape, TrendTiles } from './TeamCharts.jsx';

const z = (value) => Number(value) || 0;
const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

/* ---------- Season ---------- */

export function SeasonTab({ data, team, teamName, darkMode, onOpenGame }) {
  const [pickQuarter, setPickQuarter] = useState(null);
  const [pickType, setPickType] = useState(null);
  const games = data.games;
  const teams = data.teams ?? {};
  const me = teams[team] ?? {};
  const rank = (key) => data.ranks.find((entry) => entry.key === key)?.vals.find((entry) => entry.t === team);
  // Each figure's hover lists the game-by-game values behind the average.
  const signed = (v, dp) => `${v > 0 ? '+' : ''}${fmt(v, dp)}`;
  const rate = (made, tries) => (tries ? (100 * z(made)) / tries : null);
  const kpis = [
    ['Points per game', 'pts', (game) => game.pf, (v) => `${fmt(v)} points`],
    ['Allowed per game', 'ptsA', (game) => game.pa, (v) => `${fmt(v)} points allowed`],
    ['Yards per game', 'yds', (game) => game.ts.me?.total_yards, (v) => `${fmt(v)} yards`],
    ['Yards allowed per game', 'ydsA', (game) => game.ts.opp?.total_yards, (v) => `${fmt(v)} yards allowed`],
    ['Point differential', 'diff', (game) => game.pf - game.pa, (v) => `${signed(v)} points`],
    ['Turnover differential', 'tod', (game) => (game.ts.me ? z(game.ts.opp?.turnovers) - z(game.ts.me.turnovers) : null), (v) => `${signed(v)} turnovers`],
    ['Third-down rate', 'td3', (game) => rate(game.ts.me?.third_down_conversions, game.ts.me?.third_down_attempts), (v) => `${fmt(v)}%`],
    ['Red-zone scoring', 'rz', (game) => rate(game.ts.me?.red_zone_scores, game.ts.me?.red_zone_attempts), (v) => `${fmt(v)}%`],
  ].map(([label, key, valueOf, perGame]) => {
    const metric = data.ranks.find((entry) => entry.key === key);
    return { label, key, valueOf, perGame, metric, entry: rank(key), count: metric?.vals.length ?? 32 };
  });
  // Differentials read with a sign; rates carry their suffix.
  const kpiFigure = ({ key, metric, entry }) => (key === 'diff' || key === 'tod' ? signed(entry.v, metric.dp) : `${fmt(entry.v, metric.dp)}${metric.suffix}`);
  const kpiTip = (kpi) => tipAttrs(`${kpi.label} · by game`, [
    ...games.filter((game) => kpi.valueOf(game) != null).map((game) => `W${game.week} ${game.home ? 'vs' : '@'} ${game.opp} · ${kpi.perGame(kpi.valueOf(game))} · ${gameWon(game) ? 'W' : game.pf === game.pa ? 'T' : 'L'} ${game.pf}–${game.pa}`),
    kpi.entry ? `${kpi.key === 'tod' ? 'Season' : 'Average'} ${kpiFigure(kpi)} · ${ordinal(kpi.entry.r)} of ${kpi.count}` : null,
  ]);

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

  // Points by quarter and How they scored filter each other: a quarter narrows
  // the scoring rows, and a way of scoring narrows the quarter bars.
  const parts = scoringPartsOf(games);
  const hasOvertime = quarterPoints(parts).some((quarter) => quarter.q === 'OT' && (quarter.f || quarter.a));
  const quarters = quarterPoints(parts, pickType).filter((quarter) => quarter.q !== 'OT' || hasOvertime);
  const scored = scoringBreakdown(parts, pickQuarter);
  const scoredMax = Math.max(...scored.map((row) => row.pts), 1);

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
      <div className="player-dash-rail team-dash-kpis">
        {kpis.map((kpi) => {
          const { label, key, entry, count } = kpi;
          return (
          <div key={key} className="player-dash-kpi team-dash-kpi-tip" tabIndex={0} {...kpiTip(kpi)}>
            <span className="player-dash-eyebrow">{label}</span>
            <span className="player-dash-kpi__value">{entry ? kpiFigure(kpi) : '–'}</span>
            <span className="player-dash-kpi__rank">{entry ? <><b>{ordinal(entry.r)}</b> of {count}</> : 'Not ranked yet'}</span>
          </div>
          );
        })}
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

      <div className="player-dash-grid">
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
        </div>
        <div className="player-dash-block">
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
            <QuarterBars
              quarters={quarters}
              teamName={teamName}
              selected={pickQuarter}
              onSelect={(quarter) => setPickQuarter((current) => (current === quarter ? null : quarter))}
              filter={pickType ? <FilterChip label={pickType} onClear={() => setPickType(null)} /> : <span>Select a quarter to see how those points were scored</span>}
            />
          </div>
          <div className="player-dash-block">
            <h3 className="player-dash-subhead">How they scored</h3>
            <div className="player-dash-surface">
              <div className="player-dash-legend team-dash-filter-row">
                {pickQuarter ? <FilterChip label={pickQuarter} onClear={() => setPickQuarter(null)} /> : <span>Select a way of scoring to see it by quarter</span>}
              </div>
              <div className="player-dash-splits is-bare">
                {scored.map((row) => (
                  <button
                    key={row.type}
                    type="button"
                    className={`player-dash-split team-dash-scored team-dash-pick ${pickType === row.type ? 'is-picked' : pickType ? 'is-dim' : ''}`}
                    aria-pressed={pickType === row.type}
                    onClick={() => setPickType((current) => (current === row.type ? null : row.type))}
                  >
                    <span>{row.type}</span>
                    <span className="team-dash-scored__track"><i style={{ width: `${(row.pts / scoredMax) * 100}%` }} /></span>
                    <span className="team-dash-scored__value"><b>{row.pts}</b> <span className="player-dash-meta">pts · {row.attempts != null ? `${row.made} of ${row.attempts}` : row.plays}</span></span>
                  </button>
                ))}
              </div>
              <p className="player-dash-coverage">Touchdowns count 6 points; the extra point or two-point try after each is its own row, made of attempted. Defensive scores are defensive touchdowns and safeties.</p>
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

export function PlayersTab({ totals, fantasy, openByEntry, leaders }) {
  const tables = fantasy ? [FANTASY_TABLE, ...TABLES] : TABLES;
  return (
    <div className="player-dash-panel">
      {leaders}
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
