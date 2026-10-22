import { useMemo, useState } from 'react';
import {
  fmt,
  isCatch,
  isDropback,
  isInterception,
  isKick,
  isPassAttempt,
  isRun,
  isSackTaken,
  isTarget,
  kickAgg,
  movedChains,
  ordinal,
  passAgg,
  recAgg,
  runAgg,
} from '../../../utils/playerSeason/dashboardModel.js';
import { FilterChip, RateRows, SectionHead, Segmented, ShareTree, SplitTable, Tween, ZoneField } from './DashboardParts.jsx';
import { LANES, tipAttrs, ZONES } from './dashboardUi.js';
import { FieldMap } from './FieldMap.jsx';
import { PlayListBlock } from './PlayList.jsx';

const zoneLabel = (key) => key.replace('-', ' ');
const zoneOf = (play) => `${play.pd}-${play.pdir}`;
const scoreBefore = (play) => (play.bm ?? 0) - (play.bo ?? 0);

function situationGroups(team, { formation = true } = {}) {
  return [
    ['By down', [['1st down', (p) => p.dn === 1], ['2nd down', (p) => p.dn === 2], ['3rd down', (p) => p.dn === 3], ['4th down', (p) => p.dn === 4]]],
    ['By quarter', [['1st quarter', (p) => p.q === 1], ['2nd quarter', (p) => p.q === 2], ['3rd quarter', (p) => p.q === 3], ['4th quarter', (p) => p.q === 4], ['Overtime', (p) => p.q >= 5]]],
    ['By field position', [[`${team} side`, (p) => p.xs != null && p.xs < 50], ['Opponent side', (p) => p.xs != null && p.xs >= 50 && p.xs < 80], ['Red zone', (p) => p.xs != null && p.xs >= 80]]],
    ['By score before the snap', [['Leading', (p) => scoreBefore(p) > 0], ['Tied', (p) => scoreBefore(p) === 0], ['Trailing', (p) => scoreBefore(p) < 0]]],
    ...(formation ? [['By formation', [['Shotgun', (p) => p.sg], ['Under center', (p) => !p.sg], ['No huddle', (p) => p.nh]]]] : []),
  ];
}

function SelectionList({ label, count, onClear, ...listProps }) {
  return (
    <div className="player-dash-block">
      <SectionHead title={`${label} · ${count}`}>
        <button type="button" className="player-dash-link" onClick={onClear}>Clear selection</button>
      </SectionHead>
      <PlayListBlock {...listProps} />
    </div>
  );
}

/* ---------- Passing (QB) ---------- */

const DROPBACK_KINDS = [['Completion', 'is-c1'], ['Scramble', 'is-c2'], ['Sack', 'is-c3'], ['Incompletion', 'is-c4'], ['Interception', 'is-c5']];
const dropbackKind = (play) => (isSackTaken(play) ? 'Sack' : isRun(play) ? 'Scramble' : isInterception(play) ? 'Interception' : isCatch(play) ? 'Completion' : 'Incompletion');

function targetCounts(passes) {
  const targets = {};
  for (const play of passes) {
    if (!isPassAttempt(play) || play.tgt == null) continue;
    const entry = (targets[play.tgt] ??= { key: play.tgt, t: 0, c: 0, y: 0, td: 0 });
    entry.t += 1;
    if (isCatch(play)) { entry.c += 1; entry.y += play.y ?? 0; }
    if (play.t === 'passing-touchdown') entry.td += 1;
  }
  return targets;
}

function FilterChips({ filters, hint }) {
  return (
    <span className="player-dash-filter-chips">
      {filters.length
        ? filters.map((filter) => <FilterChip key={filter.label} label={filter.label} onClear={filter.clear} />)
        : <span className="player-dash-meta">{hint}</span>}
    </span>
  );
}

export function PassingTab({ plays, box, team, people, initialZone, listProps }) {
  const [zone, setZone] = useState(initialZone ?? null);
  const [metric, setMetric] = useState('ya');
  const [target, setTarget] = useState(null);
  const [result, setResult] = useState(null);
  const [down, setDown] = useState(null);
  const passes = useMemo(() => plays.filter((play) => isPassAttempt(play) || isSackTaken(play)), [plays]);
  const dropbacks = useMemo(() => plays.filter(isDropback), [plays]);

  // Cross-filter: each chart counts the plays that pass every other chart's selection,
  // so its own selection stays visible against the rest of its options.
  const tests = {
    zone: (play) => !zone || zoneOf(play) === zone,
    target: (play) => target == null || play.tgt === target,
    result: (play) => !result || dropbackKind(play) === result,
    down: (play) => !down || play.dn === down,
  };
  const except = (skip) => (play) => Object.entries(tests).every(([key, test]) => key === skip || test(play));

  const zonePasses = passes.filter(except('zone'));
  const zones = Object.fromEntries(ZONES.map((key) => {
    const agg = passAgg(zonePasses.filter((play) => zoneOf(play) === key));
    const value = metric === 'ya' ? agg.ya : metric === 'pct' ? agg.pct : agg.att;
    const big = metric === 'ya' ? fmt(agg.ya, 1) : metric === 'pct' ? (agg.pct == null ? '–' : `${fmt(agg.pct)}%`) : fmt(agg.att);
    return [key, {
      value,
      big,
      small: `${agg.cmp}/${agg.att} · ${agg.td} TD${agg.int ? ` · ${agg.int} INT` : ''}`,
      tip: [`${agg.cmp}/${agg.att} · ${agg.y} yds · ${agg.td} TD · ${agg.int} INT`, `Rating ${fmt(agg.rate, 1)}`],
    }];
  }));
  const charted = passAgg(passes);

  // Rows keep the season order; a filter shrinks or empties them in place.
  const seasonOrder = useMemo(() => targetCounts(passes), [passes]);
  const targets = targetCounts(passes.filter(except('target')));
  const targetTotal = Object.values(targets).reduce((total, entry) => total + entry.t, 0);
  const treeRows = Object.values(seasonOrder).sort((a, b) => b.t - a.t || b.y - a.y).map(({ key }) => {
    const entry = targets[key] ?? { t: 0, c: 0, y: 0, td: 0 };
    return {
      key,
      name: people?.[key]?.n ?? 'Unknown',
      sub: people?.[key]?.pos ?? '',
      outer: entry.t,
      inner: entry.c,
      value: entry.y,
      detail: `yds · ${entry.c}/${entry.t}${entry.td ? ` · ${entry.td} TD` : ''}`,
      tip: `${entry.t} targets (${fmt((100 * entry.t) / (targetTotal || 1))}% of charted) · ${entry.c} caught`,
      empty: !entry.t,
    };
  });

  const resultPlays = dropbacks.filter(except('result'));
  const counts = Object.fromEntries(DROPBACK_KINDS.map(([kind]) => [kind, resultPlays.filter((play) => dropbackKind(play) === kind).length]));
  const downPlays = dropbacks.filter(except('down'));
  const downRows = [1, 2, 3, 4].map((d) => {
    const subset = downPlays.filter((play) => play.dn === d);
    const agg = passAgg(subset);
    const moved = subset.filter(movedChains).length;
    // Downs the season never reached stay hidden; a filter that empties one keeps the row at zero.
    if (!dropbacks.some((play) => play.dn === d)) return null;
    return {
      key: d,
      label: ordinal(d),
      fill: subset.length ? (100 * moved) / subset.length : 0,
      value: subset.length ? `${fmt((100 * moved) / subset.length)}%` : '–',
      detail: `moved chains · ${subset.length} plays`,
      tipTitle: `${ordinal(d)} down`,
      tip: [`${moved} of ${subset.length} dropbacks gained a first down or scored`, `${agg.cmp}/${agg.att} passing · ${fmt(agg.ya, 1)} yds per attempt · ${agg.sk} sacks`],
    };
  }).filter(Boolean);

  const selected = dropbacks.filter(except(null));
  const filters = [
    zone && { label: zoneLabel(zone), clear: () => setZone(null) },
    target != null && { label: people?.[target]?.n ?? 'Unknown', clear: () => setTarget(null) },
    result && { label: `${result}s`, clear: () => setResult(null) },
    down && { label: `${ordinal(down)} down`, clear: () => setDown(null) },
  ].filter(Boolean);
  const selectionLabel = filters.map((filter) => filter.label).join(' · ');
  const clear = () => { setZone(null); setTarget(null); setResult(null); setDown(null); };

  const groups = situationGroups(team).map(([label, rows]) => ({
    label,
    rows: rows.map(([rowLabel, test]) => {
      const subset = plays.filter(test);
      const pass = passAgg(subset);
      const run = runAgg(subset);
      if (!pass.att && !run.n && !pass.sk) return { label: rowLabel, cells: null };
      return {
        label: rowLabel,
        strong: 7,
        cells: [`${pass.cmp}/${pass.att}`, pass.pct == null ? '–' : `${fmt(pass.pct)}%`, pass.y, fmt(pass.ya, 1), pass.td, pass.int, pass.sk, fmt(pass.rate, 1), run.n ? `${run.n} for ${run.y}${run.td ? `, ${run.td} TD` : ''}` : '–'],
      };
    }),
  }));

  return (
    <div className="player-dash-panel">
      <div className="player-dash-grid is-wide-left">
        <div className="player-dash-block">
          <SectionHead title="Passing chart">
            <FilterChips filters={filters} hint="Select a zone, result, down, or receiver to filter every chart" />
          </SectionHead>
          <ZoneField
            zones={zones}
            selected={zone}
            onSelect={setZone}
            metricControl={(
              <div className="player-dash-filter-row">
                <Segmented label="Zone metric" value={metric} onChange={setMetric} options={[{ id: 'ya', label: 'Yards per attempt' }, { id: 'pct', label: 'Completion rate' }, { id: 'att', label: 'Attempts' }]} />
                <span className="player-dash-ramp">Lower<i />Higher</span>
              </div>
            )}
            footnote={`${charted.att} of ${box.passing_attempts ?? charted.att} attempts charted · select a zone to filter the other charts`}
          />
          <SectionHead title="Dropback results" />
          <div className="player-dash-stackbar" role="group" aria-label="Dropback results">
            {DROPBACK_KINDS.map(([kind, tone]) => (
              <button
                key={kind}
                type="button"
                className={`player-dash-stackbar__seg ${tone} ${counts[kind] ? '' : 'is-empty'}`}
                style={{ flexGrow: counts[kind] }}
                aria-pressed={result === kind}
                aria-label={`${kind}s: ${counts[kind]}`}
                tabIndex={counts[kind] || result === kind ? undefined : -1}
                onClick={() => setResult(result === kind ? null : kind)}
                {...tipAttrs(`${kind}s`, [`${counts[kind]} of ${resultPlays.length} dropbacks (${fmt((100 * counts[kind]) / (resultPlays.length || 1))}%)`, 'Select to filter the other charts'])}
              >
                {counts[kind] / (resultPlays.length || 1) >= 0.07 ? <Tween text={counts[kind]} /> : ''}
              </button>
            ))}
          </div>
          <div className="player-dash-legend">
            {DROPBACK_KINDS.map(([kind, tone]) => <span key={kind}><i className={tone} />{kind} <Tween text={counts[kind]} /></span>)}
          </div>
          <SectionHead title="By down" />
          <RateRows rows={downRows} selected={down} onSelect={(key) => setDown(down === key ? null : key)} />
        </div>
        <div className="player-dash-block">
          <SectionHead title="Target tree" />
          <ShareTree rows={treeRows} selected={target} onSelect={(key) => setTarget(target === key ? null : key)} innerLabel="Caught" outerLabel="Targeted" />
        </div>
      </div>
      {selectionLabel && (
        <SelectionList label={selectionLabel} count={selected.length} onClear={clear} plays={selected} {...listProps} />
      )}
      <div className="player-dash-block">
        <SectionHead title="Splits" />
        <SplitTable
          columns={['Situation', 'C/ATT', 'PCT', 'YDS', 'Y/A', 'TD', 'INT', 'SACK', 'RATE', 'RUSH']}
          groups={groups}
          note="Splits come from the plays in play-by-play. Score is the margin before the snap. Rush is carries for yards, kneels excluded."
        />
      </div>
    </div>
  );
}

/* ---------- Rushing (QB, RB, and anyone with carries) ---------- */

export function RushingTab({ plays, box, group, team, jersey, listProps }) {
  const [lane, setLane] = useState(null);
  const runs = plays.filter((play) => isRun(play));
  const nonKneel = runs.filter((play) => !play.kn);
  const lanes = LANES.map(([key, label]) => {
    const subset = nonKneel.filter((play) => play.gap === key);
    return { k: key, l: label, n: subset.length, y: subset.reduce((total, play) => total + (play.y ?? 0), 0), td: subset.filter((play) => play.t === 'rushing-touchdown').length };
  });
  const summary = group === 'QB'
    ? [['Designed runs', runs.filter((play) => !play.scr && !play.kn)], ['Scrambles', runs.filter((play) => play.scr)], ['Kneels', runs.filter((play) => play.kn)]]
    : [['All carries', runs], ['Runs of 10+ yards', runs.filter((play) => (play.y ?? 0) >= 10)], ['Stuffed (no gain or loss)', runs.filter((play) => (play.y ?? 0) <= 0)],
      ['Red zone', runs.filter((play) => play.xs != null && play.xs >= 80)], ['Goal to go, 5 yards or less', runs.filter((play) => play.ytez != null && play.ytez <= 5)],
      ['3rd or 4th and 2 or less', runs.filter((play) => play.dn >= 3 && play.ds != null && play.ds <= 2)]];
  const sorted = nonKneel.filter((play) => !lane || play.gap === lane).sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
  const yards = sorted.map((play) => play.y ?? 0);
  const lo = Math.min(0, ...yards);
  const hi = Math.max(...yards, 1);
  const zero = ((0 - lo) / (hi - lo)) * 80;
  const touchdowns = nonKneel.filter((play) => play.t === 'rushing-touchdown');
  const laneName = lane ? LANES.find(([key]) => key === lane)?.[1] : null;

  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Rushing" meta={`${box.rushing_attempts ?? runs.length}-${fmt(box.rushing_yards ?? 0)} · ${box.rushing_touchdowns ?? 0} TD`} />
        <div className="player-dash-splits">
          {summary.map(([label, subset]) => {
            const agg = runAgg(subset);
            const count = subset.length;
            const total = subset.reduce((sum, play) => sum + (play.y ?? 0), 0);
            return (
              <div key={label} className="player-dash-split">
                <span>{label}</span>
                <span className="player-dash-meta">{count ? fmt(total / count, 1) : '–'} per carry · {agg.fd} first downs · {agg.td} TD</span>
                <span className="player-dash-split__value">{count} for {total < 0 ? `−${Math.abs(total)}` : total}</span>
              </div>
            );
          })}
        </div>
        <p className="player-dash-coverage">{runs.length} of {box.rushing_attempts ?? runs.length} carries appear in play-by-play.</p>
      </div>
      <div className="player-dash-grid">
        <div className="player-dash-block">
          <SectionHead title="Where he ran" />
          <FieldMap mode="routes" lanes={lanes} selected={lane} onSelect={setLane} jersey={jersey} ariaLabel="Where he ran, by gap" />
          <div className="player-dash-legend">
            <span>Route width = carries · arrow depth = yards per carry</span>
            <span><i className="is-td-dot" />Touchdown</span>
            {lane
              ? <button type="button" className="player-dash-link" onClick={() => setLane(null)}>Show all carries</button>
              : <span>Select a gap to filter the carries below</span>}
          </div>
        </div>
        <div className="player-dash-block">
          <SectionHead title={`Rushing touchdowns · ${touchdowns.length}`} />
          <PlayListBlock plays={touchdowns} emptyLabel="No rushing touchdowns yet." {...listProps} />
        </div>
      </div>
      <div className="player-dash-block">
        <SectionHead title={`${laneName ? `${laneName} carries` : 'Every carry'}, longest first`} />
        <div className="player-dash-surface">
          <div className="player-dash-carries">
            {sorted.map((play) => {
              const y = play.y ?? 0;
              const x = ((y - lo) / (hi - lo)) * 80;
              const tone = play.t === 'rushing-touchdown' ? 'is-td' : y < 0 ? 'is-loss' : 'is-gain';
              return (
                <button
                  key={`${play.g.id}-${play.i}`}
                  type="button"
                  className="player-dash-carry"
                  onClick={() => listProps.onOpenGame(play.g, 'plays')}
                  {...tipAttrs(`Week ${play.g.week} · ${play.g.opp} · Q${Math.min(play.q, 4)} ${play.c}`, [play.s, 'Select to open the play-by-play'])}
                >
                  <span className="player-dash-meta">Wk {play.g.week} {group === 'QB' ? (play.scr ? 'scramble' : 'run') : (play.dn ? `${ordinal(play.dn)} & ${play.ds}` : '')}</span>
                  <span className="player-dash-carry__track">
                    <span className="player-dash-carry__zero" style={{ left: `${zero}%` }} />
                    <span className={`player-dash-carry__bar ${tone}`} style={{ left: `${Math.min(x, zero)}%`, width: `${Math.max(0.6, Math.abs(x - zero))}%` }} />
                    <span className="player-dash-carry__label" style={{ left: `calc(${Math.max(x, zero)}% + 6px)` }}>{y}{play.t === 'rushing-touchdown' ? ' · TD' : ''}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="player-dash-legend">
            <span><i className="is-gain" />Gain</span>
            <span><i className="is-td" />Touchdown</span>
            <span><i className="is-loss" />Loss</span>
            <span>Select a carry to open its play-by-play</span>
          </div>
        </div>
      </div>
      {group !== 'QB' && (
        <div className="player-dash-block">
          <SectionHead title="Splits" />
          <SplitTable
            columns={['Situation', 'CAR', 'YDS', 'Y/C', 'TD', '1ST', '10+', 'REC', 'REC YDS']}
            groups={situationGroups(team).map(([label, rows]) => ({
              label,
              rows: rows.map(([rowLabel, test]) => {
                const subset = plays.filter(test);
                const run = runAgg(subset);
                const rec = recAgg(subset);
                if (!run.n && !rec.tgt) return { label: rowLabel, cells: null };
                return { label: rowLabel, strong: 1, cells: [run.n, run.y, fmt(run.ypc, 1), run.td, run.fd, run.big, `${rec.rec}/${rec.tgt}`, rec.y] };
              }),
            }))}
            note="Splits come from the plays in play-by-play. Score is the margin before the snap."
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Receiving (RB, WR, TE) ---------- */

export function ReceivingTab({ plays, season, box, team, people, listProps }) {
  const [zone, setZone] = useState(null);
  const [metric, setMetric] = useState('ypt');
  const [passer, setPasser] = useState(null);
  const targets = plays.filter(isTarget);
  // Cross-filter: the target map counts the selected passer's throws; the passer rows count the selected zone's.
  const passerOf = (play) => play.qb ?? 'unknown';
  const zoneTargets = targets.filter((play) => passer == null || passerOf(play) === passer);
  const zones = Object.fromEntries(ZONES.map((key) => {
    const agg = recAgg(zoneTargets.filter((play) => zoneOf(play) === key));
    const value = metric === 'ypt' ? agg.ypt : metric === 'pct' ? agg.pct : agg.tgt;
    const big = !agg.tgt ? '–' : metric === 'ypt' ? fmt(agg.ypt, 1) : metric === 'pct' ? `${fmt(agg.pct)}%` : fmt(agg.tgt);
    return [key, { value: agg.tgt ? value : null, big, small: `${agg.rec}/${agg.tgt}${agg.td ? ` · ${agg.td} TD` : ''}`, tip: `${agg.rec}/${agg.tgt} caught · ${agg.y} yds${agg.td ? ` · ${agg.td} TD` : ''}` }];
  }));
  const overall = recAgg(plays);

  const shareRows = (season?.games ?? []).map((game) => {
    const mine = targets.filter((play) => play.g.id === game.id).length;
    const rate = game.teamPassAtt ? mine / game.teamPassAtt : 0;
    return { game, mine, rate };
  });
  const maxShare = Math.max(...shareRows.map((row) => row.rate), 0.1);

  const passerCounts = (subset) => {
    const passers = {};
    for (const play of subset) {
      const entry = (passers[passerOf(play)] ??= { key: passerOf(play), t: 0, c: 0, y: 0 });
      entry.t += 1;
      if (isCatch(play)) { entry.c += 1; entry.y += play.y ?? 0; }
    }
    return passers;
  };
  const passers = passerCounts(targets.filter((play) => !zone || zoneOf(play) === zone));
  const passerRows = Object.values(passerCounts(targets)).sort((a, b) => b.t - a.t).map(({ key }) => {
    const entry = passers[key] ?? { t: 0, c: 0, y: 0 };
    return {
      key,
      name: people?.[key]?.n ?? 'Unknown passer',
      sub: people?.[key]?.pos ?? '',
      outer: entry.t,
      inner: entry.c,
      value: entry.y,
      detail: `yds · ${entry.c}/${entry.t}`,
      tip: `${entry.t} targets · ${entry.c} caught · ${entry.y} yds`,
      empty: !entry.t,
    };
  });
  const selected = targets.filter((play) => (!zone || zoneOf(play) === zone) && (passer == null || passerOf(play) === passer));
  const filters = [
    zone && { label: zoneLabel(zone), clear: () => setZone(null) },
    passer != null && { label: people?.[passer]?.n ?? 'Unknown passer', clear: () => setPasser(null) },
  ].filter(Boolean);
  const selectionLabel = filters.map((filter) => filter.label).join(' · ');

  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Receiving" meta={`${box.receptions ?? overall.rec}/${box.receiving_targets ?? overall.tgt} · ${box.receiving_yards ?? overall.y} yds · ${box.receiving_touchdowns ?? overall.td} TD · ${overall.fd} first downs`} />
      </div>
      <div className="player-dash-grid is-wide-left">
        <div className="player-dash-block">
          <SectionHead title="Target map">
            <FilterChips filters={filters} hint="Select a zone or passer to filter both charts" />
          </SectionHead>
          <ZoneField
            zones={zones}
            selected={zone}
            onSelect={setZone}
            metricControl={(
              <div className="player-dash-filter-row">
                <Segmented label="Zone metric" value={metric} onChange={setMetric} options={[{ id: 'ypt', label: 'Yards per target' }, { id: 'pct', label: 'Catch rate' }, { id: 't', label: 'Targets' }]} />
                <span className="player-dash-ramp">Lower<i />Higher</span>
              </div>
            )}
            footnote={`${targets.length} of ${box.receiving_targets ?? targets.length} targets charted · select a zone for its plays`}
          />
        </div>
        <div className="player-dash-block">
          <SectionHead title="Target share" />
          <RateRows
            rows={shareRows.map((row) => ({
              key: row.game.id,
              label: `Wk ${row.game.week}`,
              fill: (row.rate / maxShare) * 100,
              value: `${fmt(100 * row.rate)}%`,
              detail: `${row.mine} of ${row.game.teamPassAtt}`,
              tipTitle: `Week ${row.game.week} · ${team} ${row.game.home ? 'v' : '@'} ${row.game.opp}`,
              tip: [`${row.mine} of ${team}'s ${row.game.teamPassAtt} pass attempts (${fmt(100 * row.rate)}%)`, 'Select to open the game'],
            }))}
            onSelect={(gameId) => listProps.onOpenGame(season.games.find((game) => game.id === gameId), 'team')}
          />
          <SectionHead title="Who threw to him" />
          <ShareTree rows={passerRows} selected={passer} onSelect={(key) => setPasser(passer === key ? null : key)} innerLabel="Caught" outerLabel="Targeted" />
        </div>
      </div>
      {selectionLabel && (
        <SelectionList label={selectionLabel} count={selected.length} onClear={() => { setZone(null); setPasser(null); }} plays={selected} {...listProps} />
      )}
      <div className="player-dash-block">
        <SectionHead title="Splits" />
        <SplitTable
          columns={['Situation', 'TGT', 'REC', 'YDS', 'Y/T', 'TD', '1ST', 'CATCH %']}
          groups={situationGroups(team, { formation: true }).map(([label, rows]) => ({
            label,
            rows: rows.map(([rowLabel, test]) => {
              const rec = recAgg(plays.filter(test));
              if (!rec.tgt) return { label: rowLabel, cells: null };
              return { label: rowLabel, strong: 2, cells: [rec.tgt, rec.rec, rec.y, fmt(rec.ypt, 1), rec.td, rec.fd, `${fmt(rec.pct)}%`] };
            }),
          }))}
          note="Splits come from the targets in play-by-play. Score is the margin before the snap."
        />
      </div>
      <div className="player-dash-block">
        <SectionHead title={`Every target · ${targets.length}`} />
        <PlayListBlock plays={targets} {...listProps} />
      </div>
    </div>
  );
}

/* ---------- Kicking (K) ---------- */

const DISTANCES = [['Under 30', (d) => d < 30], ['30–39', (d) => d >= 30 && d < 40], ['40–49', (d) => d >= 40 && d < 50], ['50+', (d) => d >= 50]];

export function KickingTab({ plays, box, listProps }) {
  const [bucket, setBucket] = useState(null);
  const kicks = plays.filter(isKick);
  const fieldGoals = kicks.filter((play) => /field-goal/.test(play.t));
  const totals = kickAgg(plays);
  const rows = DISTANCES.map(([label, test], index) => {
    const subset = fieldGoals.filter((play) => play.fg != null && test(play.fg));
    const made = subset.filter((play) => /good/.test(play.t)).length;
    return {
      key: index,
      label,
      fill: subset.length ? (100 * made) / subset.length : 0,
      value: subset.length ? `${fmt((100 * made) / subset.length)}%` : '–',
      detail: `${made} of ${subset.length}`,
      tipTitle: `Field goals, ${label} yards`,
      tip: [`${made} made of ${subset.length} tries`, 'Select to list them'],
    };
  });
  const selected = bucket == null ? fieldGoals : fieldGoals.filter((play) => play.fg != null && DISTANCES[bucket][1](play.fg));
  return (
    <div className="player-dash-panel">
      <div className="player-dash-block">
        <SectionHead title="Kicking" meta={`${box.field_goals_made ?? totals.fgm}/${box.field_goal_attempts ?? totals.fga} field goals · long ${totals.long || '–'} · ${totals.xpm}/${totals.xpa} extra points charted`} />
      </div>
      <div className="player-dash-grid">
        <div className="player-dash-block">
          <SectionHead title="Field goals by distance" />
          <RateRows rows={rows} selected={bucket} onSelect={(key) => setBucket(bucket === key ? null : key)} />
          <p className="player-dash-coverage">Distance comes from the play text of each kick in play-by-play.</p>
        </div>
        <div className="player-dash-block">
          <SectionHead title={`${bucket == null ? 'Every field goal' : `Field goals, ${DISTANCES[bucket][0]} yards`} · ${selected.length}`} />
          <PlayListBlock plays={selected} emptyLabel="No field goals charted." {...listProps} />
        </div>
      </div>
      <div className="player-dash-block">
        <SectionHead title={`Every kick · ${kicks.length}`} />
        <PlayListBlock plays={kicks} {...listProps} />
      </div>
    </div>
  );
}

