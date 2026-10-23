import { useEffect, useMemo, useState } from 'react';
import { useSleeperBase } from '../../context/SleeperContext';
import Modal from '../Modal';
import { CompanionSelectorButton } from './CompanionSelectorControls.jsx';
import { isEspnFantasyGameLogPosition, loadEspnFantasyGameLogWeekRow } from '../../utils/espnFantasyGameLogRows.js';
import { isTeamDefensePosition } from '../../utils/nflPlays/playerNameIndex.js';
import { buildTeamScoringDrilldownModel, TEAM_SCORING_GROUPS } from '../../utils/teamScoringDrilldownModel.js';
import './TeamScoringDrilldown.css';

/*
 * Team scoring drilldown — opened from a Fantasy Matchups team scorecard.
 * Claude Design study "Team Scoring Options": game state picks the layout
 * (Projection board → Scoreboard → Beat or missed); there are no phase tabs.
 * Selecting a scoring group or lineup spot only restyles the charts (classes,
 * widths), so bars keep their elements and never redraw. Numbers come from
 * teamScoringDrilldownModel.js — see docs/Fantasy Live.md.
 */

const EPS = 0.005;
const GROUP_LABEL = Object.fromEntries(TEAM_SCORING_GROUPS.map((group) => [group.id, group.label]));
const PHASE_LABEL = { pregame: 'Pregame', live: 'Live', final: 'Final' };
const STATE_LABEL = { pre: 'Yet to play', live: 'Playing', final: 'Final', bye: 'Bye', empty: 'Empty' };

const fmt = (value) => `${value < -EPS ? '−' : ''}${Math.abs(Number(value) || 0).toFixed(2)}`;
const signed = (value) => `${value > EPS ? '+' : value < -EPS ? '−' : ''}${Math.abs(Number(value) || 0).toFixed(2)}`;
const tone = (value) => (value > EPS ? 'is-up' : value < -EPS ? 'is-down' : '');
const pct = (value, max) => `${Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0)).toFixed(2)}%`;
const formatStat = (value) => (value == null ? '—' : Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : value.toFixed(1));
const spotName = (spot) => (spot ? `${spot.label} ${spot.player?.lastName ?? ''}`.trim() : '');

function Swatch({ group }) {
  return <i className="tsd-swatch" data-group={group} aria-hidden="true" />;
}

function FilterChip({ label, onClear, group = null }) {
  return (
    <button type="button" className="tsd-chip" data-group={group ?? undefined} onClick={onClear} aria-label={`Clear ${label} filter`}>
      {label} <span aria-hidden="true">×</span>
    </button>
  );
}

/* Positive groups stacked from zero; deductions hatched over the end, so the
   clean part of the bar is the net. `activeGroup` dims the other segments. */
function GroupStack({ byGroup, max, activeGroup = null }) {
  const gains = TEAM_SCORING_GROUPS
    .map((group) => [group.id, byGroup?.[group.id] ?? 0])
    .filter(([, value]) => value > EPS);
  const losses = TEAM_SCORING_GROUPS
    .map((group) => [group.id, byGroup?.[group.id] ?? 0])
    .filter(([, value]) => value < -EPS);
  const gross = gains.reduce((sum, [, value]) => sum + value, 0);
  const deduction = Math.min(gross, losses.reduce((sum, [, value]) => sum - value, 0));
  const lossActive = activeGroup && losses.some(([id]) => id === activeGroup);
  return (
    <span className="tsd-stack tsd-grow" style={{ width: pct(gross, max) }}>
      {gains.map(([id, value]) => (
        <i key={id} data-group={id} className={activeGroup && activeGroup !== id ? 'is-dim' : ''} style={{ flexGrow: value }} />
      ))}
      {deduction > EPS && (
        <em className={`tsd-stack__deduct${activeGroup && !lossActive ? ' is-dim' : ''}`} style={{ width: pct(deduction, gross) }} />
      )}
    </span>
  );
}

function GroupLegend({ groups, valueFor = null, activeGroup = null, onSelect = null }) {
  return (
    <div className="tsd-legend">
      {groups.map((group) => {
        const value = valueFor ? valueFor(group.id) : null;
        const content = (
          <>
            <Swatch group={group.id} />
            <span>{group.label}</span>
            {value != null && <b className={`tsd-num ${value < -EPS ? 'is-down' : ''}`}>{fmt(value)}</b>}
          </>
        );
        if (!onSelect) return <span key={group.id} className="tsd-legend__item">{content}</span>;
        const on = activeGroup === group.id;
        return (
          <button
            key={group.id}
            type="button"
            className={`tsd-legend__item${activeGroup && !on ? ' is-dim' : ''}`}
            aria-pressed={on}
            onClick={() => onSelect(group.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function SpotLabel({ spot }) {
  return (
    <span className="tsd-spot">
      <span className="tsd-spot__slot">{spot.label}</span>
      <span className="tsd-spot__name">{spot.empty ? 'Empty' : spot.player?.lastName}</span>
    </span>
  );
}

function SpotRow({ spot, selected, anySelected, onSelect, children, className = '' }) {
  if (spot.empty) {
    return <div className={`tsd-row is-empty ${className}`}><SpotLabel spot={spot} />{children}</div>;
  }
  return (
    <button
      type="button"
      className={`tsd-row ${className}${selected ? ' is-on' : ''}${anySelected && !selected ? ' is-faded' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(spot.key)}
    >
      <SpotLabel spot={spot} />
      {children}
    </button>
  );
}

function StatePill({ state }) {
  return <span className="tsd-pill" data-state={state}>{STATE_LABEL[state] ?? state}</span>;
}

/* One row per scoring category: projected stat and points summed across the
   given starters' rows. A missing stat on every row stays null. */
function sumCategoriesAcrossSpots(rows) {
  const byCategory = new Map();
  for (const row of rows) {
    const id = `${row.group}:${row.key}`;
    const total = byCategory.get(id);
    if (!total) {
      byCategory.set(id, { ...row, id });
      continue;
    }
    total.projectedPts += row.projectedPts;
    if (row.projectedStat != null) total.projectedStat = (total.projectedStat ?? 0) + row.projectedStat;
  }
  return [...byCategory.values()];
}

/* ── Pregame · Projection board ── */

function PregameBoard({ model, selection, toggleSpot, toggleGroup, clearSpot, clearGroup }) {
  const [showAll, setShowAll] = useState(false);
  const { totals, groups, spots, categories } = model;
  const selectedSpot = spots.find((spot) => spot.key === selection.spot) ?? null;
  // Fixed group order (offence, then defence, then deductions), not size order.
  const stripGroups = groups.filter((group) => group.projected > EPS);
  const legendGroups = groups.filter((group) => Math.abs(group.projected) > EPS);
  const max = Math.max(0.01, ...spots.map((spot) => Object.values(spot.projectedByGroup).reduce((sum, value) => sum + Math.max(0, value), 0)));
  const lead = stripGroups.reduce((top, group) => (!top || group.projected > top.projected ? group : top), null);
  // Unfiltered by spot, each category is the lineup's total, not one row per player.
  const rows = sumCategoriesAcrossSpots(categories
    .filter((row) => Math.abs(row.projectedPts) > EPS && row.spotKey)
    .filter((row) => (!selection.spot || row.spotKey === selection.spot) && (!selection.group || row.group === selection.group)))
    .filter((row) => Math.abs(row.projectedPts) > EPS)
    .sort((a, b) => (selection.group === 'negative' ? a.projectedPts - b.projectedPts : b.projectedPts - a.projectedPts));
  const filtered = Boolean(selection.spot || selection.group);
  const shown = filtered || showAll ? rows : rows.slice(0, 10);
  const title = [selectedSpot && spotName(selectedSpot), selection.group && GROUP_LABEL[selection.group]].filter(Boolean).join(' · ');

  return (
    <>
      <section className="tsd-hero">
        <div className="tsd-total">
          <div className="tsd-eyebrow">Projected total</div>
          <div className="tsd-num tsd-num--xl">{fmt(totals.projected)}</div>
          {lead && totals.projected > EPS && (
            <p className="tsd-note">{lead.label} carries {Math.round((lead.projected / totals.projected) * 100)}% of it.</p>
          )}
        </div>
        <div className="tsd-source">
          <div className="tsd-head">
            <span className="tsd-eyebrow">Where the projection comes from</span>
            {selectedSpot && <FilterChip label={spotName(selectedSpot)} onClear={clearSpot} />}
          </div>
          <div className={`tsd-strip${selectedSpot ? ' has-spot' : ''}`} role="group" aria-label="Projected points by scoring group">
            {stripGroups.map((group) => {
              const share = selectedSpot ? Math.max(0, selectedSpot.projectedByGroup[group.id] ?? 0) / group.projected : 1;
              const on = selection.group === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  data-group={group.id}
                  className={`tsd-strip__seg${selection.group && !on ? ' is-dim' : ''}`}
                  style={{ flexGrow: group.projected }}
                  aria-pressed={on}
                  aria-label={`${group.label}, ${fmt(group.projected)} projected points`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="tsd-strip__fill" style={{ width: pct(share, 1) }} />
                </button>
              );
            })}
          </div>
          <GroupLegend
            groups={legendGroups}
            valueFor={(id) => (selectedSpot ? selectedSpot.projectedByGroup[id] ?? 0 : groups.find((group) => group.id === id)?.projected ?? 0)}
            activeGroup={selection.group}
            onSelect={toggleGroup}
          />
        </div>
      </section>

      <div className="tsd-split">
        <section className="tsd-sec" aria-labelledby="tsd-pregame-positions">
          <div className="tsd-head">
            <h3 id="tsd-pregame-positions" className="tsd-title">By position</h3>
            {selection.group && <FilterChip label={GROUP_LABEL[selection.group]} group={selection.group} onClear={clearGroup} />}
          </div>
          <p className="tsd-note">Every lineup spot, split by scoring group. Hatched = expected deductions. Select a spot or group to cross-filter.</p>
          <GroupLegend groups={legendGroups} activeGroup={selection.group} onSelect={toggleGroup} />
          {spots.map((spot) => (
            <SpotRow key={spot.key} spot={spot} selected={selection.spot === spot.key} anySelected={Boolean(selection.spot)} onSelect={toggleSpot}>
              <span className="tsd-track">{!spot.empty && <GroupStack byGroup={spot.projectedByGroup} max={max} activeGroup={selection.group} />}</span>
              <span className="tsd-val tsd-num">{spot.empty ? '—' : fmt(selection.group ? spot.projectedByGroup[selection.group] ?? 0 : spot.projected)}</span>
            </SpotRow>
          ))}
        </section>

        <section className="tsd-sec" aria-labelledby="tsd-pregame-categories">
          <div className="tsd-head">
            <h3 id="tsd-pregame-categories" className="tsd-title">{title ? `${title} categories` : 'Top categories'}</h3>
            <span className="tsd-chips">
              {selectedSpot && <FilterChip label={spotName(selectedSpot)} onClear={clearSpot} />}
              {selection.group && <FilterChip label={GROUP_LABEL[selection.group]} group={selection.group} onClear={clearGroup} />}
            </span>
          </div>
          <p className="tsd-note">
            {selectedSpot ? 'Projected stat' : 'Projected lineup total for each stat'} and the points it is worth under your league scoring, largest first.
          </p>
          {shown.length ? (
            <table className="tsd-table">
              <thead><tr><th scope="col">Category</th><th scope="col" className="is-num">Proj value</th><th scope="col" className="is-num">Proj pts</th></tr></thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id}>
                    <th scope="row"><Swatch group={row.group} />{row.label}</th>
                    <td className="is-num tsd-num">{formatStat(row.projectedStat)}</td>
                    <td className={`is-num tsd-num tsd-strong ${row.projectedPts < -EPS ? 'is-down' : ''}`}>{fmt(row.projectedPts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="tsd-empty">No projected points for this filter.</p>}
          {!filtered && rows.length > 10 && (
            <button type="button" className="tsd-more" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length} categories`}
            </button>
          )}
        </section>
      </div>
    </>
  );
}

/* ── Live · Scoreboard ── */

function LiveBoard({ model, selection, toggleSpot, clearSpot }) {
  const { totals, groups, spots, categories, counts } = model;
  const selectedSpot = spots.find((spot) => spot.key === selection.spot) ?? null;
  const scale = Math.max(totals.paceFinal, totals.projected, 0.01) * 1.08;
  const max = Math.max(0.01, ...spots.map((spot) => Math.max(spot.projected, Object.values(spot.actualByGroup).reduce((sum, value) => sum + Math.max(0, value), 0)))) * 1.04;
  const scored = categories
    .filter((row) => Math.abs(row.actualPts) > EPS && (!selection.spot || row.spotKey === selection.spot))
    .sort((a, b) => (b.actualPts > 0) - (a.actualPts > 0) || Math.abs(b.actualPts) - Math.abs(a.actualPts));
  const shown = selection.spot ? scored : scored.slice(0, 7);
  const legendGroups = groups.filter((group) => Math.abs(group.actual) > EPS);
  const paceDiff = totals.paceFinal - totals.projected;

  return (
    <>
      <section className="tsd-hero">
        <div>
          <div className="tsd-eyebrow">Points so far</div>
          <div className="tsd-num tsd-num--xl">{fmt(totals.actual ?? 0)}</div>
        </div>
        <div className="tsd-source">
          <div className="tsd-stats">
            <span>On pace for <b className="tsd-num">{fmt(totals.paceFinal)}</b> <b className={`tsd-num ${tone(paceDiff)}`}>{signed(paceDiff)}</b></span>
            <span>Projected <b className="tsd-num">{fmt(totals.projected)}</b></span>
            <span>Still to come <b className="tsd-num">{fmt(totals.remaining)}</b></span>
            <span><b>{counts.live ?? 0}</b> playing · <b>{counts.pre ?? 0}</b> yet to play</span>
          </div>
          <div className="tsd-progress" aria-hidden="true">
            <span className="tsd-progress__scored tsd-grow" style={{ width: pct(totals.actual ?? 0, scale) }} />
            <span className="tsd-progress__left" style={{ left: pct(totals.actual ?? 0, scale), width: pct(totals.remaining, scale) }} />
            <span className="tsd-tick" style={{ left: pct(totals.projected, scale) }} />
          </div>
          <div className="tsd-legend">
            <span className="tsd-legend__item"><i className="tsd-swatch tsd-swatch--scored" />Scored</span>
            <span className="tsd-legend__item"><i className="tsd-swatch tsd-swatch--left" />Projected still to come</span>
            <span className="tsd-legend__item"><i className="tsd-swatch tsd-swatch--tick" />Pregame projection</span>
          </div>
        </div>
      </section>

      <div className="tsd-split tsd-split--wide">
        <section className="tsd-sec" aria-labelledby="tsd-live-positions">
          <div className="tsd-head">
            <h3 id="tsd-live-positions" className="tsd-title">By position</h3>
            <span className="tsd-note tsd-note--inline">Fill = scored, by group · line = projection</span>
          </div>
          <GroupLegend groups={legendGroups} />
          {spots.map((spot) => (
            <SpotRow key={spot.key} spot={spot} className="tsd-row--live" selected={selection.spot === spot.key} anySelected={Boolean(selection.spot)} onSelect={toggleSpot}>
              <StatePill state={spot.state} />
              <span className="tsd-track tsd-track--bg">
                {!spot.empty && <GroupStack byGroup={spot.actualByGroup} max={max} />}
                {!spot.empty && <span className="tsd-tick" style={{ left: pct(spot.projected, max) }} />}
              </span>
              <span className="tsd-val tsd-num">
                {spot.empty ? '—' : <><b className={spot.actual != null && spot.actual >= spot.projected ? 'is-up' : ''}>{fmt(spot.actual ?? 0)}</b> <span className="tsd-muted">/ {fmt(spot.projected)}</span></>}
              </span>
            </SpotRow>
          ))}
        </section>

        <section className="tsd-sec" aria-labelledby="tsd-live-categories">
          <div className="tsd-head">
            <h3 id="tsd-live-categories" className="tsd-title">{selectedSpot ? `${spotName(selectedSpot)} so far` : 'Biggest so far'}</h3>
            {selectedSpot && <FilterChip label={spotName(selectedSpot)} onClear={clearSpot} />}
          </div>
          {shown.length ? (
            <ul className={`tsd-list${selectedSpot ? ' tsd-list--one-player' : ''}`}>
              {shown.map((row) => (
                <li key={row.id} className="tsd-list__row">
                  <span className="tsd-strong"><Swatch group={row.group} />{row.label}</span>
                  {!selectedSpot && <span className="tsd-muted">{row.playerName ?? 'Team'}</span>}
                  <span className="tsd-num tsd-muted is-num">{formatStat(row.actualStat)}</span>
                  <b className={`tsd-num is-num ${row.actualPts < -EPS ? 'is-down' : ''}`}>{fmt(row.actualPts)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tsd-empty">{selectedSpot ? `No points yet for ${spotName(selectedSpot)}.` : 'No points yet.'}</p>
          )}
        </section>
      </div>
    </>
  );
}

/* ── Final · Beat or missed ──
   Every point is shown. The difference from projection sits under the final
   score; "Where the points came from" splits the final by scoring group and
   cross-filters with By position and the scoring table, as pregame does. The
   table lists only what was scored — no projection columns, so a missed
   projection never reads as negative points. */

function FinalBoard({ model, selection, toggleSpot, toggleGroup, clearSpot, clearGroup }) {
  const { totals, groups, spots, categories } = model;
  const selectedSpot = spots.find((spot) => spot.key === selection.spot) ?? null;
  const stripGroups = groups.filter((group) => group.actual > EPS);
  const legendGroups = groups.filter((group) => Math.abs(group.actual) > EPS);
  const gross = (byGroup) => Object.values(byGroup).reduce((sum, value) => sum + Math.max(0, value), 0);
  const max = Math.max(0.01, ...spots.map((spot) => Math.max(spot.projected, gross(spot.actualByGroup)))) * 1.04;
  const played = spots.filter((spot) => !spot.empty);
  const won = played.filter((spot) => (spot.actual ?? 0) - spot.projected > EPS).length;
  const rows = categories
    .filter((row) => Math.abs(row.actualPts) > EPS)
    .filter((row) => (!selection.spot || row.spotKey === selection.spot) && (!selection.group || row.group === selection.group))
    .sort((a, b) => (selection.group === 'negative' ? a.actualPts - b.actualPts : b.actualPts - a.actualPts));
  const title = [selectedSpot && spotName(selectedSpot), selection.group && GROUP_LABEL[selection.group]].filter(Boolean).join(' · ');
  const spotValue = (spot, field) => (selection.group ? spot[field][selection.group] ?? 0 : field === 'actualByGroup' ? spot.actual ?? 0 : spot.projected);

  return (
    <>
      <section className="tsd-hero">
        <div className="tsd-total">
          <div className="tsd-eyebrow">Final</div>
          <div className="tsd-num tsd-num--xl">{fmt(totals.actual ?? 0)}</div>
          <div className="tsd-verdict"><span className={tone(totals.diff)}>{signed(totals.diff)}</span> vs {fmt(totals.projected)} projected</div>
          <p className="tsd-note">Beat projection at {won} of {played.length} lineup spots.</p>
        </div>
        <div className="tsd-source">
          <div className="tsd-head">
            <span className="tsd-eyebrow">Where the points came from</span>
            {selectedSpot && <FilterChip label={spotName(selectedSpot)} onClear={clearSpot} />}
          </div>
          <div className={`tsd-strip${selectedSpot ? ' has-spot' : ''}`} role="group" aria-label="Final points by scoring group">
            {stripGroups.map((group) => {
              const share = selectedSpot ? Math.max(0, selectedSpot.actualByGroup[group.id] ?? 0) / group.actual : 1;
              const on = selection.group === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  data-group={group.id}
                  className={`tsd-strip__seg${selection.group && !on ? ' is-dim' : ''}`}
                  style={{ flexGrow: group.actual }}
                  aria-pressed={on}
                  aria-label={`${group.label}, ${fmt(group.actual)} points`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="tsd-strip__fill" style={{ width: pct(share, 1) }} />
                </button>
              );
            })}
          </div>
          <GroupLegend
            groups={legendGroups}
            valueFor={(id) => (selectedSpot ? selectedSpot.actualByGroup[id] ?? 0 : groups.find((group) => group.id === id)?.actual ?? 0)}
            activeGroup={selection.group}
            onSelect={toggleGroup}
          />
        </div>
      </section>

      <div className="tsd-split tsd-split--wide">
        <section className="tsd-sec" aria-labelledby="tsd-final-positions">
          <div className="tsd-head">
            <h3 id="tsd-final-positions" className="tsd-title">By position</h3>
            {selection.group && <FilterChip label={GROUP_LABEL[selection.group]} group={selection.group} onClear={clearGroup} />}
          </div>
          <p className="tsd-note">Every lineup spot&apos;s final points, split by scoring group; the line marks its projection. Select a spot or group to cross-filter.</p>
          <GroupLegend groups={legendGroups} activeGroup={selection.group} onSelect={toggleGroup} />
          {spots.map((spot) => {
            const actual = spotValue(spot, 'actualByGroup');
            const projected = spotValue(spot, 'projectedByGroup');
            const diff = actual - projected;
            return (
              <SpotRow key={spot.key} spot={spot} className="tsd-row--final" selected={selection.spot === spot.key} anySelected={Boolean(selection.spot)} onSelect={toggleSpot}>
                <span className="tsd-track tsd-track--bg">
                  {!spot.empty && <GroupStack byGroup={spot.actualByGroup} max={max} activeGroup={selection.group} />}
                  {!spot.empty && <span className="tsd-tick" style={{ left: pct(spot.projected, max) }} />}
                </span>
                <span className="tsd-val tsd-val--points tsd-num">
                  {spot.empty ? '—' : <><b>{fmt(actual)}</b> <span className="tsd-muted">/ {fmt(projected)}</span></>}
                </span>
                <span className={`tsd-val tsd-val--diff tsd-num ${spot.empty ? '' : tone(diff)}`}>{spot.empty ? '' : signed(diff)}</span>
              </SpotRow>
            );
          })}
        </section>

        <section className="tsd-sec" aria-labelledby="tsd-final-categories">
          <div className="tsd-head">
            <h3 id="tsd-final-categories" className="tsd-title">{title ? `${title} scoring` : 'Scoring categories'}</h3>
            <span className="tsd-chips">
              {selectedSpot && <FilterChip label={spotName(selectedSpot)} onClear={clearSpot} />}
              {selection.group && <FilterChip label={GROUP_LABEL[selection.group]} group={selection.group} onClear={clearGroup} />}
            </span>
          </div>
          <p className="tsd-note">Every category that scored, largest first.</p>
          {rows.length ? (
            <table className="tsd-table">
              <thead><tr><th scope="col">Category</th>{!selectedSpot && <th scope="col">Player</th>}<th scope="col" className="is-num">Stat</th><th scope="col" className="is-num">Pts</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row"><Swatch group={row.group} />{row.label}</th>
                    {!selectedSpot && <td className="tsd-muted">{row.playerName ?? 'Team'}</td>}
                    <td className="is-num tsd-num tsd-muted">{formatStat(row.actualStat)}</td>
                    <td className={`is-num tsd-num tsd-strong ${row.actualPts < -EPS ? 'is-down' : ''}`}>{fmt(row.actualPts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="tsd-empty">No points for this filter.</p>}
        </section>
      </div>
    </>
  );
}

export default function TeamScoringDrilldown({
  teamName,
  week,
  spots = [],
  settled = false,
  teamPoints = null,
  baselines = null,
  platformLabel = 'your league',
  onClose,
}) {
  const { platform, weeklyStats, activeScoringSettings, players, season } = useSleeperBase();
  const [selection, setSelection] = useState({ spot: null, group: null });
  const [espnRowsState, setEspnRowsState] = useState({ key: '', rowsByPlayerId: {} });

  const playerIds = useMemo(() => spots.map((spot) => spot?.player?.id).filter((id) => id && id !== '0'), [spots]);
  const playerIdsKey = playerIds.join('|');
  const espnKey = platform === 'espn' && players && week && playerIds.length ? [season, week, playerIdsKey].join('|') : '';
  const derivedRowsByPlayerId = useMemo(
    () => (espnRowsState.key === espnKey ? espnRowsState.rowsByPlayerId : {}),
    [espnKey, espnRowsState],
  );

  // ESPN exposes no weekly stat line on the matchup; derive one per starter
  // (carried over from the previous team scoring sheet).
  useEffect(() => {
    if (!espnKey) return undefined;
    const candidates = playerIds.filter((id) => {
      const player = players?.[id];
      return player
        && isEspnFantasyGameLogPosition(player.position)
        && (isTeamDefensePosition(player.position) ? player.team : (player.espn_id || player.sourceIds?.espn));
    });
    if (!candidates.length) return undefined;
    let cancelled = false;
    void Promise.all(candidates.map(async (id) => {
      try {
        const row = await loadEspnFantasyGameLogWeekRow({ playerId: id, player: players[id], season, scoringSettings: activeScoringSettings, week });
        return [id, row ?? null];
      } catch {
        return [id, null];
      }
    })).then((entries) => {
      if (!cancelled) setEspnRowsState({ key: espnKey, rowsByPlayerId: Object.fromEntries(entries.filter(([, row]) => row)) });
    });
    return () => { cancelled = true; };
  }, [activeScoringSettings, espnKey, playerIds, players, season, week]);

  const model = useMemo(() => buildTeamScoringDrilldownModel({
    spots,
    settled,
    teamPoints,
    week,
    weeklyStats,
    players,
    scoringSettings: activeScoringSettings,
    derivedRowsByPlayerId,
    baselines,
  }), [activeScoringSettings, baselines, derivedRowsByPlayerId, players, settled, spots, teamPoints, week, weeklyStats]);

  const toggleSpot = (key) => setSelection((current) => ({ ...current, spot: current.spot === key ? null : key }));
  const toggleGroup = (id) => setSelection((current) => ({ ...current, group: current.group === id ? null : id }));
  const clearSpot = () => setSelection((current) => ({ ...current, spot: null }));
  const clearGroup = () => setSelection((current) => ({ ...current, group: null }));
  const boardProps = { model, selection, toggleSpot, toggleGroup, clearSpot, clearGroup };
  const sources = model.projectionSources.length ? model.projectionSources.join(', ') : 'none available';

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel={`${teamName} scoring`}
      containerClassName="tsd-dialog gridshift-reveal w-full flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-separator)', maxWidth: '1100px', maxHeight: '90dvh' }}
    >
      <header className="tsd-hd">
        <div className="tsd-hd__identity">
          <div className="tsd-eyebrow">
            {model.phase === 'live' && <i className="tsd-live-dot" aria-hidden="true" />}
            <span className="tsd-hd__phase">{PHASE_LABEL[model.phase]}</span> · Week {week}
          </div>
          <h2 className="tsd-hd__title">{teamName}</h2>
        </div>
        <CompanionSelectorButton size="xs" variant="ghost" aria-label="Close team scoring" onClick={onClose} className="shrink-0" style={{ width: 30, height: 30, padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </CompanionSelectorButton>
      </header>

      <div className="tsd-body" data-testid="team-scoring-drilldown" data-phase={model.phase}>
        {model.phase === 'pregame' && <PregameBoard {...boardProps} />}
        {model.phase === 'live' && <LiveBoard {...boardProps} />}
        {model.phase === 'final' && <FinalBoard {...boardProps} />}
        <footer className="tsd-sourceline">
          Same lineup, projections and points as Matchups. Projections: {sources}. Points: {platformLabel}, scored with your league&apos;s settings.
        </footer>
      </div>
    </Modal>
  );
}
