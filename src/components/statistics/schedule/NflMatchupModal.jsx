import { useEffect, useMemo, useState } from 'react';
import Modal from '../../Modal';
import useMediaQuery from '../../../hooks/useMediaQuery.js';
import { useTheme } from '../../../context/ThemeContext';
import { useSleeperBase, useSleeperStatsEnhancing } from '../../../context/SleeperContext';
import { getNflTeamSeasonStats } from '../../../api/statisticsScoresApi';
import { fetchEspnGameSummary } from '../../../utils/playerApi';
import { getTeamVisualTheme } from '../../../utils/teamVisualTheme';
import { fantasyHeroGradient, fantasyTeamInk } from '../../../utils/fantasyTeamIdentity.js';
import { getCompanionPlayerImageUrls, getNflTeamLogoUrl } from '../../../utils/companionAssetVisuals.js';
import { getScoreNetworkLabel } from '../../../utils/statisticsBroadcasts';
import { buildUnitMatchupTable } from '../../../utils/defenseRankings.js';
import { isNflRegularSeasonStarted } from '../../../utils/seasonAvailability.js';
import {
  buildGameLeaders,
  buildGameTeamStatRows,
  buildGameTrackerPanel,
  buildMatchupKeys,
  buildSeasonGlanceRows,
  buildTeamSeasonLeaders,
  buildTeamSeasonSummary,
  buildUnitPanel,
  formatRecord,
  formatSigned,
  formatUnitValue,
  getRankTier,
  normalizeEspnGameSummary,
  resolveMatchupPhase,
} from '../../../utils/nflMatchupModel.js';
import { SkeletonRows } from '../../ui/LoadingSwap.jsx';
import { Skeleton, SkeletonCard } from '../../ui/Skeleton';
import './NflMatchupModal.css';

/**
 * Statistics › Schedule NFL matchup drill-in. Opens from a single team's
 * schedule; that team is always the left column. Three states share one
 * frame: before kickoff (season comparison and unit ranks), live (score,
 * situation, pace against each defense) and final (result and how each unit
 * did against the defense's average entering the week). NFL-only: no fantasy
 * points and no betting lines.
 */

const LIVE_REFRESH_MS = 30_000;
const SUMMARY_WINDOW_MS = 30 * 60_000;
const POSITION_TONE = { PASS: 'unit', RUN: 'unit', QB: 'qb', RB: 'rb', WR: 'wr', TE: 'te', K: 'st' };
const ESPN_LOGO_KEY = { WAS: 'wsh' };
const VERDICT_LABEL = { above: 'Above avg', under: 'Held under', par: 'On par' };
// The body holds back until every source has settled so it enters as one
// beat. This caps the wait: a source still loading after it (usually a cold
// league stats load) keeps its own in-place skeleton instead of holding the
// rest of the drill-in hostage.
const REVEAL_MAX_WAIT_MS = 2500;

const teamLogoUrl = (team) => getNflTeamLogoUrl((ESPN_LOGO_KEY[team] ?? String(team ?? '')).toLowerCase());
const getEventId = (game) => game?.espnEventId ?? game?.eventId ?? null;
const getScoreRouteId = (game) => game?.espnEventId ?? game?.eventId ?? game?.id ?? null;

function formatKickoff(value) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return 'Kickoff TBD';
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function formatVenue(value) {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/, USA$/, '') : null;
}

function initials(name) {
  return String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

function useTeamColors(teamId, darkMode, degrees) {
  return useMemo(() => {
    const theme = getTeamVisualTheme(teamId, darkMode);
    const accent = theme?.accentColor ?? theme?.color ?? null;
    return {
      accent: accent ?? 'var(--color-accent)',
      ink: accent && accent.startsWith('#') ? fantasyTeamInk(accent) : 'var(--color-label)',
      background: theme?.primary
        ? fantasyHeroGradient(theme.primary, theme.secondary ?? theme.primary, degrees)
        : 'var(--color-fill-secondary)',
    };
  }, [teamId, darkMode, degrees]);
}

// ── Data hooks ───────────────────────────────────────────────────────────────

/**
 * ESPN's game summary, fetched from 30 minutes before kickoff (or for a final
 * game) and refreshed every 30 seconds while the game is in progress and the
 * page is visible.
 */
function useGameSummary(game) {
  const eventId = getEventId(game);
  const kickoffMs = Date.parse(game?.kickoff ?? '');
  const scheduleFinal = resolveMatchupPhase(game) === 'final';
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [now, setNow] = useState(() => Date.now());
  const opensAt = Number.isFinite(kickoffMs) ? kickoffMs - SUMMARY_WINDOW_MS : Infinity;
  const shouldLoad = Boolean(eventId) && (scheduleFinal || now >= opensAt);

  useEffect(() => {
    if (shouldLoad || !Number.isFinite(opensAt)) return undefined;
    const wait = Math.min(Math.max(1000, opensAt - Date.now() + 250), 2 ** 31 - 1);
    const timer = window.setTimeout(() => setNow(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [opensAt, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return undefined;
    const controller = new AbortController();
    let stopped = false;
    let timer = null;

    async function load() {
      if (stopped || document.visibilityState === 'hidden') return;
      let keepPolling = false;
      try {
        const raw = await fetchEspnGameSummary(eventId, { signal: controller.signal });
        if (stopped) return;
        const data = normalizeEspnGameSummary(raw);
        keepPolling = data?.status?.state === 'in' || data?.status?.state === 'pre';
        setState({ key: eventId, data, error: null });
      } catch (error) {
        if (stopped || error?.name === 'AbortError') return;
        keepPolling = !scheduleFinal;
        setState((current) => ({ key: eventId, data: current.key === eventId ? current.data : null, error: error.message }));
      } finally {
        if (!stopped && keepPolling) timer = window.setTimeout(load, LIVE_REFRESH_MS);
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) window.clearTimeout(timer);
      void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    void load();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [eventId, scheduleFinal, shouldLoad]);

  // Settled = nothing more to wait for before the first paint: the first
  // response (or error) is in, or the summary window has not opened yet.
  const current = state.key === eventId ? state : { key: eventId, data: null, error: null };
  const settled = !shouldLoad || current.data != null || current.error != null;
  return { ...current, settled };
}

function useTeamSeasonStats(left, right, season) {
  const key = `${season}:${left}:${right}`;
  const [state, setState] = useState({ key: null, byTeam: {}, status: 'loading' });
  useEffect(() => {
    if (!season || !left || !right) return undefined;
    const controller = new AbortController();
    Promise.all([left, right].map((team) => getNflTeamSeasonStats({ team, season, signal: controller.signal })
      .then((payload) => [team, payload?.stats ?? {}])
      .catch(() => [team, null])))
      .then((entries) => {
        if (controller.signal.aborted) return;
        setState({ key, byTeam: Object.fromEntries(entries), status: 'ready' });
      });
    return () => controller.abort();
  }, [key, left, right, season]);
  if (!season || !left || !right) return { key, byTeam: {}, status: 'ready' };
  return state.key === key ? state : { key, byTeam: {}, status: 'loading' };
}

/**
 * Unit ranks come from the connected league's season player stats — the same
 * data Fantasy › Defenses ranks. `before` covers weeks before this game,
 * `after` includes it.
 */
function useUnitTables(season, week) {
  const {
    hasLeague,
    season: leagueSeason,
    players,
    weeklyStats,
    scheduleMap,
    statsLoading,
    loadPlayers,
    loadSeasonStats,
  } = useSleeperBase();
  const statsEnhancing = useSleeperStatsEnhancing();
  const sameSeason = Boolean(hasLeague) && String(leagueSeason) === String(season);
  const seasonStarted = isNflRegularSeasonStarted(season);

  useEffect(() => {
    if (sameSeason && !players) loadPlayers?.();
  }, [sameSeason, players, loadPlayers]);
  useEffect(() => {
    if (sameSeason && seasonStarted && (!weeklyStats || !scheduleMap) && !statsLoading) loadSeasonStats?.();
  }, [sameSeason, seasonStarted, weeklyStats, scheduleMap, statsLoading, loadSeasonStats]);

  const ready = Boolean(sameSeason && seasonStarted && players && weeklyStats && scheduleMap && !statsLoading);
  const teams = useMemo(() => {
    const set = new Set();
    Object.values(scheduleMap ?? {}).forEach((weekData) => Object.keys(weekData ?? {}).forEach((team) => set.add(team.toUpperCase())));
    return [...set].sort();
  }, [scheduleMap]);
  const before = useMemo(
    () => (ready ? buildUnitMatchupTable({ weeklyStats, players, scheduleMap, teams, throughWeek: week - 1 }) : null),
    [players, ready, scheduleMap, teams, week, weeklyStats],
  );
  const after = useMemo(
    () => (ready ? buildUnitMatchupTable({ weeklyStats, players, scheduleMap, teams, throughWeek: week }) : null),
    [players, ready, scheduleMap, teams, week, weeklyStats],
  );

  let status = 'ready';
  if (!hasLeague) status = 'no-league';
  else if (!sameSeason) status = 'other-season';
  else if (!seasonStarted) status = 'not-started';
  else if (!ready || statsEnhancing) status = 'loading';
  return { status, before, after, players, weeklyStats };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Eyebrow({ children, note }) {
  return (
    <div className="matchup-preview__eyebrow">
      {children}
      {note && <span className="matchup-preview__note">{note}</span>}
    </div>
  );
}

/** Mirrored comparison row: shared with the Fantasy Matchup preview's styling. */
function CompareRow({ row, index }) {
  const { aValue, bValue } = row;
  let leadsA = false;
  let leadsB = false;
  if (aValue != null && bValue != null && aValue !== bValue) {
    leadsA = row.lowerWins ? aValue < bValue : aValue > bValue;
    leadsB = !leadsA;
  }
  const max = Math.max(Math.abs(aValue ?? 0), Math.abs(bValue ?? 0)) || 1;
  const cell = (side, display, leads, value) => (
    <div
      className={`matchup-preview-cmp__value is-${side}${leads ? ' is-leading' : ''}`}
      style={{ '--matchup-preview-bar': `${Math.round((Math.abs(value ?? 0) / max) * 100)}%`, '--matchup-preview-index': index }}
    >
      <div className="matchup-preview-cmp__number tabular-nums"><span>{display}</span></div>
    </div>
  );
  return (
    <div className="matchup-preview-cmp__row">
      {cell('a', row.a, leadsA, aValue)}
      <div className="matchup-preview-cmp__label">{row.label}</div>
      {cell('b', row.b, leadsB, bValue)}
    </div>
  );
}

function RankChip({ rank, after = null }) {
  if (rank == null) return null;
  const chip = (value) => (
    <span className="nfl-matchup-rank tabular-nums" data-tier={getRankTier(value)}>#{value}</span>
  );
  if (after == null || after === rank) return chip(rank);
  return (
    <span className="nfl-matchup-rank-move" aria-label={`Rank ${rank} before this game, ${after} after`}>
      {chip(rank)}<span aria-hidden="true">→</span>{chip(after)}
    </span>
  );
}

function EdgeTag({ label, colorSet }) {
  if (!label) return null;
  return (
    <span
      className={`nfl-matchup-edge${colorSet ? '' : ' is-even'}`}
      style={colorSet ? { background: colorSet.accent, color: colorSet.ink } : undefined}
    >
      {label}
    </span>
  );
}

function UnitLink({ unit, defenseTeam, onOpen }) {
  const tone = POSITION_TONE[unit.id] ?? 'unit';
  if (!onOpen) {
    return (
      <span className="nfl-matchup-unit__name">
        <i className="nfl-matchup-unit__dot" data-tone={tone} aria-hidden="true" />{unit.label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="nfl-matchup-unit__name is-link"
      onClick={() => onOpen(unit.defense, defenseTeam)}
      aria-label={`Open ${defenseTeam} defense against ${unit.label} in Fantasy Defenses`}
    >
      <i className="nfl-matchup-unit__dot" data-tone={tone} aria-hidden="true" />{unit.label}
      <span aria-hidden="true" className="nfl-matchup-unit__arrow">↗</span>
    </button>
  );
}

function PanelHead({ left, right, leftIsOffense, colors, defenseTeam, onOpenDefense }) {
  return (
    <div className="nfl-matchup-panel__head">
      <span className="nfl-matchup-team-chip" style={{ background: colors[left].accent, color: colors[left].ink }}>{left}</span>
      <span className="nfl-matchup-panel__role">{leftIsOffense ? 'Offense' : 'Defense'}</span>
      <span className="nfl-matchup-panel__vs">vs</span>
      <span className="nfl-matchup-team-chip" style={{ background: colors[right].accent, color: colors[right].ink }}>{right}</span>
      <span className="nfl-matchup-panel__role">{leftIsOffense ? 'Defense' : 'Offense'}</span>
      {onOpenDefense && (
        <button
          type="button"
          className="nfl-matchup-panel__link"
          onClick={() => onOpenDefense({ position: 'ALL', stat: 'total_yd' }, defenseTeam)}
          aria-label={`Open ${defenseTeam} defense in Fantasy Defenses`}
        >
          {defenseTeam} defense <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  );
}

function PanelColumns({ leftLabel, rightLabel, middle }) {
  return (
    <div className="nfl-matchup-panel__cols" aria-hidden="true">
      <span>{leftLabel}</span>
      <span>{middle}</span>
      <span>{rightLabel}</span>
    </div>
  );
}

/**
 * Pregame unit panel from buildUnitPanel(offense, defense). The selected team
 * is always the left column, so on its defensive panel the defense is left.
 */
function UnitPanel({ rows, leftTeam, colors, onOpenDefense }) {
  if (!rows.length) return null;
  const offenseTeam = rows[0].offense.team;
  const defenseTeam = rows[0].defense.team;
  const leftIsOffense = offenseTeam === leftTeam;
  const right = leftIsOffense ? defenseTeam : offenseTeam;
  return (
    <div className="nfl-matchup-panel">
      <PanelHead left={leftTeam} right={right} leftIsOffense={leftIsOffense} colors={colors} defenseTeam={defenseTeam} onOpenDefense={onOpenDefense} />
      <PanelColumns
        leftLabel={leftIsOffense ? `${leftTeam} produces` : `${leftTeam} allows`}
        middle="Unit · edge"
        rightLabel={leftIsOffense ? `${right} allows` : `${right} produces`}
      />
      <div className="matchup-preview-cmp nfl-matchup-cmp">
        {rows.map((row, index) => {
          const a = leftIsOffense ? row.offense : row.defense;
          const b = leftIsOffense ? row.defense : row.offense;
          const leadsA = a.rank != null && b.rank != null && a.rank < b.rank;
          const leadsB = a.rank != null && b.rank != null && b.rank < a.rank;
          const edgeTeam = row.edge === 'offense' ? offenseTeam : row.edge === 'defense' ? defenseTeam : null;
          const cell = (side, entry, leads) => (
            <div
              className={`matchup-preview-cmp__value is-${side}${leads ? ' is-leading' : ''}`}
              style={{ '--matchup-preview-bar': entry.rank != null ? `${Math.round(((33 - entry.rank) / 32) * 100)}%` : '0%', '--matchup-preview-index': index }}
            >
              <div className="matchup-preview-cmp__number tabular-nums"><span>{formatUnitValue(row.unit.id, entry.avg)}</span></div>
              <div className="matchup-preview-cmp__sub nfl-matchup-cmp__sub"><RankChip rank={entry.rank} /></div>
            </div>
          );
          return (
            <div className="matchup-preview-cmp__row" key={row.unit.id}>
              {cell('a', a, leadsA)}
              <div className="matchup-preview-cmp__label nfl-matchup-unit">
                <UnitLink unit={row.unit} defenseTeam={defenseTeam} onOpen={onOpenDefense} />
                <small>{row.unit.sub}</small>
                <EdgeTag
                  label={row.edge == null ? null : edgeTeam ? `Edge ${edgeTeam}` : 'Even'}
                  colorSet={edgeTeam ? colors[edgeTeam] : null}
                />
              </div>
              {cell('b', b, leadsB)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Live/final unit panel: one offense's game output against a defense's average. */
function TrackerPanel({ rows, leftTeam, colors, live, onOpenDefense }) {
  if (!rows.length) return null;
  const { offenseTeam, defenseTeam } = rows[0];
  const leftIsOffense = offenseTeam === leftTeam;
  const right = leftIsOffense ? defenseTeam : offenseTeam;
  return (
    <div className="nfl-matchup-panel">
      <PanelHead left={leftTeam} right={right} leftIsOffense={leftIsOffense} colors={colors} defenseTeam={defenseTeam} onOpenDefense={onOpenDefense} />
      <PanelColumns
        leftLabel={leftIsOffense ? `${leftTeam} this game` : `${leftTeam} allowed / game`}
        middle="Unit · vs avg"
        rightLabel={leftIsOffense ? `${right} allowed / game` : `${right} this game`}
      />
      <div className="matchup-preview-cmp nfl-matchup-cmp">
        {rows.map((row, index) => {
          const compare = live ? (row.pace ?? row.value) : row.value;
          const max = Math.max(compare ?? 0, row.defenseAvg ?? 0) || 1;
          const gameCell = (side) => (
            <div
              className={`matchup-preview-cmp__value is-${side} is-leading`}
              style={{ '--matchup-preview-bar': `${Math.round(((compare ?? 0) / max) * 100)}%`, '--matchup-preview-index': index }}
            >
              <div className="matchup-preview-cmp__number tabular-nums"><span>{row.unit.id === 'K' ? row.value : Math.round(row.value)}</span></div>
              <div className="matchup-preview-cmp__sub">
                {live ? (row.pace != null ? `On pace for ${Math.round(row.pace)}` : 'Pace after 5 minutes') : 'This game'}
              </div>
            </div>
          );
          const avgCell = (side) => (
            <div
              className={`matchup-preview-cmp__value is-${side}`}
              style={{ '--matchup-preview-bar': `${Math.round(((row.defenseAvg ?? 0) / max) * 100)}%`, '--matchup-preview-index': index }}
            >
              <div className="matchup-preview-cmp__number tabular-nums"><span>{formatUnitValue(row.unit.id, row.defenseAvg)}</span></div>
              <div className="matchup-preview-cmp__sub nfl-matchup-cmp__sub">
                <RankChip rank={row.defenseRank} after={live ? null : row.defenseRankAfter} />
              </div>
            </div>
          );
          const verdictTeam = row.verdict === 'above' ? offenseTeam : row.verdict === 'under' ? defenseTeam : null;
          return (
            <div className="matchup-preview-cmp__row" key={row.unit.id}>
              {leftIsOffense ? gameCell('a') : avgCell('a')}
              <div className="matchup-preview-cmp__label nfl-matchup-unit">
                <UnitLink unit={row.unit} defenseTeam={defenseTeam} onOpen={onOpenDefense} />
                <small>{row.ratio != null ? `${formatSigned(row.ratio * 100)}% vs avg` : row.unit.sub}</small>
                <EdgeTag
                  label={row.verdict ? (verdictTeam ? `${verdictTeam} ${VERDICT_LABEL[row.verdict]}` : VERDICT_LABEL.par) : null}
                  colorSet={verdictTeam ? colors[verdictTeam] : null}
                />
              </div>
              {leftIsOffense ? avgCell('b') : gameCell('b')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Headshot with the shared fallback chain (explicit URL → ESPN → Sleeper), then initials. */
function PlayerAvatar({ player }) {
  const urls = useMemo(() => getCompanionPlayerImageUrls({
    imageUrl: player.imageUrl ?? null,
    espnId: player.espnId ?? null,
    sleeperId: player.sleeperId ?? null,
  }), [player.espnId, player.imageUrl, player.sleeperId]);
  const [failed, setFailed] = useState(0);
  const url = urls[failed] ?? null;
  return (
    <span className="nfl-matchup-player__avatar" data-tone={POSITION_TONE[player.position] ?? 'unit'} aria-hidden="true">
      {url ? (
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed((current) => current + 1)}
        />
      ) : initials(player.name)}
    </span>
  );
}

function Leaders({ columns, onOpenPlayer }) {
  return (
    <div className="matchup-preview-watch nfl-matchup-leaders">
      {columns.map((column) => (
        <div className="matchup-preview-watch__col" key={column.team} style={{ '--matchup-preview-accent': column.accent }}>
          <div className="matchup-preview-watch__head"><b>{column.name}</b></div>
          <div className="matchup-preview-watch__list">
            {column.players.length ? column.players.map((player) => {
              const linked = Boolean(onOpenPlayer && (player.sleeperId || player.espnId));
              const Row = linked ? 'button' : 'div';
              return (
                <Row
                  key={player.id}
                  className={`nfl-matchup-player${linked ? ' is-link' : ''}`}
                  {...(linked ? {
                    type: 'button',
                    onClick: () => onOpenPlayer({ ...player, team: column.team }),
                    'aria-label': `Open ${player.name} player statistics`,
                  } : {})}
                >
                  <PlayerAvatar player={player} />
                  <span className="nfl-matchup-player__copy">
                    <b>{player.name}</b>
                    <span>{player.meta}</span>
                  </span>
                  <span className="nfl-matchup-player__stat tabular-nums">
                    <b>{player.big}</b>
                    <span>{player.bigLabel}</span>
                  </span>
                  {linked && <span className="nfl-matchup-player__chevron" aria-hidden="true">›</span>}
                </Row>
              );
            }) : <p className="matchup-preview__empty">No stats yet.</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function LineScore({ game, left, right, colors }) {
  const a = game?.teams?.[left];
  const b = game?.teams?.[right];
  if (!a?.linescores?.length && !b?.linescores?.length) return null;
  const periods = Math.max(4, a?.linescores?.length ?? 0, b?.linescores?.length ?? 0);
  const labels = Array.from({ length: periods }, (_, index) => (index < 4 ? String(index + 1) : periods === 5 ? 'OT' : `OT${index - 3}`));
  const row = (team, entry) => (
    <tr key={team}>
      <th scope="row"><span className="nfl-matchup-linescore__team" style={{ borderColor: colors[team].accent }}>{team}</span></th>
      {labels.map((label, index) => <td key={label}>{entry?.linescores?.[index] ?? '–'}</td>)}
      <td className="is-total">{entry?.score ?? '–'}</td>
    </tr>
  );
  return (
    <table className="nfl-matchup-linescore tabular-nums">
      <thead><tr><th scope="col">Team</th>{labels.map((label) => <th key={label} scope="col">{label}</th>)}<th scope="col">T</th></tr></thead>
      <tbody>{row(left, a)}{row(right, b)}</tbody>
    </table>
  );
}

function parseSpot(text) {
  const match = String(text ?? '').match(/([A-Z]{2,3})\s+(\d{1,2})\s*$/);
  return match ? { team: match[1] === 'WSH' ? 'WAS' : match[1], line: Number(match[2]) } : null;
}

/** Field strip: the left end zone belongs to the left team. */
function FieldStrip({ situation, drive, left, right, colors }) {
  const spot = parseSpot(situation?.possessionText) ?? parseSpot(situation?.downDistanceText);
  const offense = situation?.possessionTeam;
  const fieldPct = (yardsFromLeftGoal) => 100 / 12 + (yardsFromLeftGoal / 100) * (1000 / 12);
  let ball = null;
  let marker = null;
  if (spot && (spot.team === left || spot.team === right)) {
    const fromLeft = spot.team === left ? spot.line : 100 - spot.line;
    ball = fieldPct(fromLeft);
    const distance = Number(String(situation?.downDistanceText ?? '').match(/&\s*(\d+)/)?.[1]);
    if (Number.isFinite(distance) && offense) {
      const target = offense === left ? fromLeft + distance : fromLeft - distance;
      if (target > 0 && target < 100) marker = fieldPct(target);
    }
  }
  const driveText = drive
    ? [drive.plays != null ? `${drive.plays} plays` : null, drive.yards != null ? `${drive.yards} yds` : null, drive.time].filter(Boolean).join(' · ')
    : '—';
  return (
    <div className="nfl-matchup-situation">
      <div className="nfl-matchup-situation__down">
        <span>{offense ? `${offense} ball` : 'Situation'}</span>
        <b className="tabular-nums">{situation?.downDistanceText ?? '—'}</b>
      </div>
      <div
        className="nfl-matchup-field"
        role="img"
        aria-label={situation?.downDistanceText ? `${offense ?? ''} ball, ${situation.downDistanceText}` : 'Field position unavailable'}
      >
        <i className="nfl-matchup-field__zone is-left" style={{ background: colors[left].accent }} />
        <i className="nfl-matchup-field__zone is-right" style={{ background: colors[right].accent }} />
        <i className="nfl-matchup-field__mid" />
        {marker != null && <i className="nfl-matchup-field__marker" style={{ left: `${marker}%` }} />}
        {ball != null && <i className="nfl-matchup-field__ball" style={{ left: `${ball}%` }} />}
      </div>
      <div className="nfl-matchup-situation__drive">
        <span>This drive</span>
        <b className="tabular-nums">{driveText}</b>
      </div>
    </div>
  );
}

function UnitsUnavailable({ status }) {
  if (status === 'loading') return <SkeletonRows count={4} height="3rem" />;
  const copy = {
    'no-league': 'Connect a fantasy league to see unit-vs-unit ranks. GridShift builds them from the same season player stats as Fantasy › Defenses.',
    'other-season': 'Unit ranks follow your connected league’s season, which is different from this schedule.',
    'not-started': 'Unit ranks appear once the regular season has games to measure.',
  }[status];
  return copy ? <p className="matchup-preview__empty">{copy}</p> : null;
}

/**
 * Latches true once every source has settled (or REVEAL_MAX_WAIT_MS passes)
 * and stays true for this game, so live polling never replays the entrance.
 */
function useCoalescedReveal(ready, resetKey) {
  const [state, setState] = useState({ key: resetKey, revealed: ready });
  if (state.key !== resetKey) setState({ key: resetKey, revealed: ready });
  else if (ready && !state.revealed) setState({ key: resetKey, revealed: true });
  const revealed = state.key === resetKey ? state.revealed : ready;

  useEffect(() => {
    if (revealed) return undefined;
    const timer = window.setTimeout(() => setState({ key: resetKey, revealed: true }), REVEAL_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [resetKey, revealed]);
  return revealed;
}

/**
 * Static stand-in while the sources settle. `.gs-section-skeleton` holds it
 * invisible for SHOW AFTER, so a drill-in whose data is cached paints no
 * placeholder at all. Deliberately outside `.gridshift-reveal`: nothing
 * animates in until the real body mounts.
 */
function MatchupBodySkeleton() {
  const side = (align) => (
    <div className={`flex flex-col justify-center gap-3 px-[clamp(14px,3vw,36px)] py-[18px] ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2 ${align === 'end' ? 'flex-row-reverse' : ''}`}>
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-3 w-24 max-w-full rounded" />
      </div>
      <Skeleton className="h-10 w-24 rounded" />
      <Skeleton className="h-2.5 w-36 max-w-full rounded" />
    </div>
  );
  return (
    <div className="gs-section-skeleton" aria-hidden="true">
      <div className="matchup-preview__title">
        {side('start')}
        <div className="flex items-center justify-center"><Skeleton className="h-4 w-8 rounded" /></div>
        {side('end')}
      </div>
      {[0, 1].map((index) => (
        <div className="matchup-preview__section" key={index}>
          <Skeleton className="h-3 w-32 rounded mb-3" />
          <SkeletonCard height="9rem" />
        </div>
      ))}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export default function NflMatchupModal({
  game,
  week,
  teamId,
  opponentId,
  isAway = false,
  teamsById,
  schedule,
  season,
  onClose,
  onOpenDefenses = null,
  onViewGameStats = null,
  onOpenPlayer = null,
}) {
  const isCompact = useMediaQuery('(max-width: 640px)');
  const isWide = useMediaQuery('(min-width: 1024px)');
  const { darkMode } = useTheme();
  const size = isCompact ? 'compact' : isWide ? 'wide' : 'regular';
  const left = teamId;
  const right = opponentId;
  const leftColors = useTeamColors(left, darkMode, 135);
  const rightColors = useTeamColors(right, darkMode, 225);
  const colors = useMemo(() => ({ [left]: leftColors, [right]: rightColors }), [left, leftColors, right, rightColors]);
  const leftTeam = teamsById?.get(left) ?? null;
  const rightTeam = teamsById?.get(right) ?? null;
  const leftName = leftTeam?.name ?? left;
  const rightName = rightTeam?.name ?? right;

  const summary = useGameSummary(game);
  const live = summary.data;
  const phase = resolveMatchupPhase(game, live);
  const kickoffMs = Date.parse(game?.kickoff ?? '');
  const canOpenScores = phase !== 'pre'
    || (Number.isFinite(kickoffMs) && kickoffMs <= Date.now());
  const teamStats = useTeamSeasonStats(left, right, season);
  const units = useUnitTables(season, week);
  const revealed = useCoalescedReveal(
    summary.settled && teamStats.status !== 'loading' && units.status !== 'loading',
    `${season}:${week}:${left}:${right}:${getEventId(game) ?? ''}`,
  );

  const recordBefore = useMemo(() => ({
    [left]: buildTeamSeasonSummary(schedule, left, { beforeWeek: week }),
    [right]: buildTeamSeasonSummary(schedule, right, { beforeWeek: week }),
  }), [left, right, schedule, week]);
  const recordAfter = useMemo(() => ({
    [left]: buildTeamSeasonSummary(schedule, left, { throughWeek: week }),
    [right]: buildTeamSeasonSummary(schedule, right, { throughWeek: week }),
  }), [left, right, schedule, week]);

  const glance = useMemo(() => buildSeasonGlanceRows({
    left: { summary: recordBefore[left], stats: teamStats.byTeam[left] },
    right: { summary: recordBefore[right], stats: teamStats.byTeam[right] },
  }), [left, recordBefore, right, teamStats.byTeam]);

  const unitPanels = useMemo(() => (units.before ? [
    buildUnitPanel(units.before, left, right),
    buildUnitPanel(units.before, right, left),
  ] : []), [left, right, units.before]);
  const keys = useMemo(
    () => buildMatchupKeys(unitPanels, { [left]: leftName, [right]: rightName }),
    [left, leftName, right, rightName, unitPanels],
  );

  const trackerPanels = useMemo(() => {
    if (!live || phase === 'pre' || !units.before) return [];
    const isLive = phase === 'live';
    const tableAfter = isLive ? null : units.after;
    return [
      buildGameTrackerPanel({ game: live, table: units.before, tableAfter, offenseTeam: left, defenseTeam: right, live: isLive }),
      buildGameTrackerPanel({ game: live, table: units.before, tableAfter, offenseTeam: right, defenseTeam: left, live: isLive }),
    ];
  }, [left, live, phase, right, units.after, units.before]);

  const openDefense = onOpenDefenses && units.status === 'ready'
    ? (defense, defenseTeam) => onOpenDefenses({ ...defense, defenseTeam, pinnedTeams: [left, right] })
    : null;

  const network = getScoreNetworkLabel(game ?? {}, { fallback: false });
  const venue = formatVenue(game?.location ?? game?.venue);
  const weekLabel = `Week ${week}`;
  const scoreFor = (team) => live?.teams?.[team]?.score ?? null;
  const headerChip = phase === 'final'
    ? `Final · ${weekLabel}`
    : phase === 'live'
      ? `Live · ${live?.status?.detail ?? 'In progress'}`
      : `${weekLabel} preview`;
  const headerLine = phase === 'pre'
    ? [formatKickoff(game?.kickoff), network, venue].filter(Boolean).join(' · ')
    : [weekLabel, network, venue].filter(Boolean).join(' · ');
  const axisLabel = phase === 'final'
    ? 'Final'
    : phase === 'live'
      ? (live?.status?.period ? (live.status.period > 4 ? 'OT' : `Q${live.status.period}`) : 'Live')
      : (isAway ? '@' : 'VS');

  const renderSide = (key, team, colorSet, align) => {
    const record = phase === 'final' ? recordAfter[key] : recordBefore[key];
    const homeAway = key === left ? (isAway ? 'Away' : 'Home') : (isAway ? 'Home' : 'Away');
    const identity = [team?.division, homeAway].filter(Boolean).join(' · ');
    const showScore = phase !== 'pre' && scoreFor(key) != null;
    const otherScore = scoreFor(key === left ? right : left);
    const lost = phase === 'final' && showScore && otherScore != null && scoreFor(key) < otherScore;
    const hasBall = phase === 'live' && live?.situation?.possessionTeam === key;
    const timeouts = phase === 'live'
      ? (live?.teams?.[key]?.homeAway === 'home' ? live?.situation?.homeTimeouts : live?.situation?.awayTimeouts)
      : null;
    const result = phase === 'final' ? record.results.find((entry) => entry.week === week)?.result ?? null : null;
    const line = phase === 'pre'
      ? `PF ${record.pointsFor} · PA ${record.pointsAgainst} · Diff ${formatSigned(record.pointsFor - record.pointsAgainst)}`
      : phase === 'final'
        ? `Now ${formatRecord(record)}${result ? ` · ${result}` : ''}`
        : `Season ${formatRecord(record)}`;
    return (
      <div
        className={`matchup-preview__side companion-matchup-masthead__side nfl-matchup-side is-${align === 'start' ? 'a is-mine' : 'b is-opponent'}`}
        style={{ '--matchup-preview-accent': colorSet.accent, background: colorSet.background }}
      >
        <div className="matchup-preview__seed nfl-matchup-side__seed">
          <img
            src={teamLogoUrl(key)}
            alt=""
            className="nfl-matchup-side__logo"
            loading="lazy"
            decoding="async"
            onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
          />
          <span className="nfl-matchup-side__names">
            <b>{team?.name ?? key}</b>
            {identity && <small>{identity}</small>}
          </span>
          {hasBall && <span className="nfl-matchup-side__ball">Ball</span>}
        </div>
        <div className={`matchup-preview__big${lost ? ' nfl-matchup-side__big--dim' : ''}`}>
          <b className="tabular-nums">{showScore ? scoreFor(key) : formatRecord(record)}</b>
          <span>{showScore ? 'Score' : 'Record'}</span>
        </div>
        <span className="nfl-matchup-side__line tabular-nums">
          {line}
          {Number.isFinite(timeouts) && (
            <span className="nfl-matchup-timeouts" role="img" aria-label={`${timeouts} timeouts left`}>
              {[0, 1, 2].map((index) => <i key={index} className={index < timeouts ? 'is-left' : ''} />)}
            </span>
          )}
        </span>
      </div>
    );
  };

  let revealIndex = 0;
  const reveal = () => ({ '--matchup-preview-index': revealIndex++ });

  const leaderColumns = phase === 'pre'
    ? (units.status === 'ready' ? [
      { team: left, name: leftName, accent: leftColors.accent, players: buildTeamSeasonLeaders({ weeklyStats: units.weeklyStats, players: units.players, teamId: left, throughWeek: week - 1 }) },
      { team: right, name: rightName, accent: rightColors.accent, players: buildTeamSeasonLeaders({ weeklyStats: units.weeklyStats, players: units.players, teamId: right, throughWeek: week - 1 }) },
    ] : null)
    : (live ? [
      { team: left, name: leftName, accent: leftColors.accent, players: buildGameLeaders(live, left) },
      { team: right, name: rightName, accent: rightColors.accent, players: buildGameLeaders(live, right) },
    ] : null);
  const gameStatRows = phase !== 'pre' && live ? buildGameTeamStatRows(live, left, right) : [];
  const leftIsHome = live?.teams?.[left]?.homeAway ? live.teams[left].homeAway === 'home' : !isAway;
  const scoreLine = (play) => (leftIsHome
    ? `${play.homeScore ?? '–'}–${play.awayScore ?? '–'}`
    : `${play.awayScore ?? '–'}–${play.homeScore ?? '–'}`);

  return (
    <Modal
      onClose={onClose}
      mobileSheet={isCompact}
      ariaLabel={`${leftName} versus ${rightName}, ${weekLabel}`}
      containerClassName={`matchup-preview-modal nfl-matchup-modal is-${size}`}
      containerStyle={{
        maxWidth: '900px',
        maxHeight: '90dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        '--matchup-preview-left-accent': leftColors.accent,
        '--matchup-preview-right-accent': rightColors.accent,
      }}
    >
      <header className="matchup-preview__header">
        <span className={`matchup-preview__chip${phase === 'live' ? ' is-live' : ''}`}>{headerChip}</span>
        <span className="matchup-preview__when">{headerLine}</span>
        <button type="button" className="matchup-preview__close" onClick={onClose} aria-label="Close matchup">×</button>
      </header>

      {!revealed ? (
        <div className="matchup-preview__body" role="status" aria-busy="true" aria-label="Loading matchup">
          <MatchupBodySkeleton />
        </div>
      ) : (
        <div className="matchup-preview__body gridshift-reveal">
          <div className="matchup-preview__title companion-matchup-masthead__score-grid">
            {renderSide(left, leftTeam, leftColors, 'start')}
            <div className="matchup-preview__axis companion-matchup-masthead__axis">
              <span className="companion-matchup-masthead__axis-label">{axisLabel}</span>
              <em>{phase === 'live' ? (live?.status?.clock ?? '') : `WK ${week}`}</em>
            </div>
            {renderSide(right, rightTeam, rightColors, 'end')}
          </div>

          {summary.error && phase !== 'pre' && !live && (
            <p className="matchup-preview__notice" role="status">Live game data from ESPN is unavailable right now.</p>
          )}

          {phase === 'live' && live?.situation && (
            <div className="gridshift-reveal__item" style={reveal()}>
              <FieldStrip situation={live.situation} drive={live.currentDrive} left={left} right={right} colors={colors} />
            </div>
          )}

          {canOpenScores && onViewGameStats && getScoreRouteId(game) && (
            <div className="nfl-matchup-actions gridshift-reveal__item" style={reveal()}>
              <button type="button" className="nfl-matchup-primary" onClick={() => onViewGameStats(game)}>
                Open in Scores <span aria-hidden="true">›</span>
              </button>
            </div>
          )}

          {phase !== 'pre' && live && (
            <section className="matchup-preview__section nfl-matchup-scoring gridshift-reveal__item" style={reveal()}>
              <div>
                <Eyebrow>Scoring by quarter</Eyebrow>
                <LineScore game={live} left={left} right={right} colors={colors} />
              </div>
              {phase === 'final' && live.scoringPlays.length > 0 && (
                <div>
                  <Eyebrow>Scoring summary</Eyebrow>
                  <ol className="nfl-matchup-plays">
                    {live.scoringPlays.map((play) => (
                      <li key={play.id} className="nfl-matchup-play">
                        <span className="nfl-matchup-play__when">{`Q${play.period ?? '–'} ${play.clock ?? ''}`}</span>
                        {play.team && colors[play.team] ? (
                          <span className="nfl-matchup-team-chip" style={{ background: colors[play.team].accent, color: colors[play.team].ink }}>{play.team}</span>
                        ) : <span />}
                        <span className="nfl-matchup-play__text">{play.text}</span>
                        <span className="nfl-matchup-play__score tabular-nums">{scoreLine(play)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          {phase === 'live' && live?.recentPlays?.length > 0 && (
            <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
              <Eyebrow note="Newest first · updates every 30 seconds">Latest plays</Eyebrow>
              <ol className="nfl-matchup-plays is-feed">
                {live.recentPlays.map((play) => (
                  <li key={play.id} className={`nfl-matchup-play${play.scoring ? ' is-scoring' : ''}`}>
                    <span className="nfl-matchup-play__when">{`Q${play.period ?? '–'} ${play.clock ?? ''}`}</span>
                    <span className="nfl-matchup-play__down">{play.downDistanceText ?? play.type ?? ''}</span>
                    <span className="nfl-matchup-play__text">{play.text}</span>
                    <span className={`nfl-matchup-play__yards tabular-nums${play.yards > 0 ? ' is-gain' : play.yards < 0 ? ' is-loss' : ''}`}>
                      {play.scoring ? scoreLine(play) : play.yards != null ? formatSigned(play.yards) : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {phase === 'pre' && units.status === 'ready' && keys.length > 0 && (
            <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
              <Eyebrow note="NFL unit stats · per game">Where it tilts</Eyebrow>
              <div className="matchup-preview__keys">
                {keys.map((key, index) => (
                  <div className="matchup-preview__key" key={key.id}>
                    <i className="tabular-nums" aria-hidden="true">{index + 1}</i>
                    <div>
                      <div className="matchup-preview__key-tag">{key.tag}</div>
                      <p className="matchup-preview__key-text">
                        {key.parts.map((part, partIndex) => (
                          part.emphasis ? <em key={partIndex}>{part.text}</em> : <span key={partIndex}>{part.text}</span>
                        ))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {phase === 'pre' && glance.length > 0 && (
            <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
              <Eyebrow note={teamStats.status === 'loading' ? 'Loading ESPN team stats…' : 'Season to date · leader’s bar in team color'}>
                Season at a glance
              </Eyebrow>
              <div className="matchup-preview-cmp">
                {glance.map((row, index) => <CompareRow key={row.id} row={row} index={index} />)}
              </div>
            </section>
          )}

          {gameStatRows.length > 0 && (
            <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
              <Eyebrow note={phase === 'final' ? 'Final' : 'This game'}>Team stats</Eyebrow>
              <div className="matchup-preview-cmp">
                {gameStatRows.map((row, index) => <CompareRow key={row.id} row={row} index={index} />)}
              </div>
            </section>
          )}

          <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
            <Eyebrow
              note={phase === 'pre'
                ? 'NFL rank of 32 · #1 = strongest unit · edge = gap of 8+'
                : phase === 'live'
                  ? 'Pace = this game scaled to 60 minutes, against each defense’s average entering the week'
                  : 'This game against each defense’s average entering the week · rank before → after'}
            >
              {phase === 'pre' ? 'Unit vs unit' : phase === 'live' ? 'Matchup tracker' : 'How the matchup played out'}
            </Eyebrow>
            {units.status !== 'ready' ? (
              <UnitsUnavailable status={units.status} />
            ) : phase === 'pre' ? (
              <div className="nfl-matchup-panels">
                {unitPanels.map((rows) => (
                  <UnitPanel key={rows[0]?.offense.team ?? 'empty'} rows={rows} leftTeam={left} colors={colors} onOpenDefense={openDefense} />
                ))}
              </div>
            ) : trackerPanels.some((rows) => rows.length) ? (
              <div className="nfl-matchup-panels">
                {trackerPanels.map((rows) => (
                  <TrackerPanel key={rows[0]?.offenseTeam ?? 'empty'} rows={rows} leftTeam={left} colors={colors} live={phase === 'live'} onOpenDefense={openDefense} />
                ))}
              </div>
            ) : (
              <p className="matchup-preview__empty">Unit numbers appear once the box score has stats.</p>
            )}
          </section>

          {leaderColumns && (
            <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
              <Eyebrow note={phase === 'pre' ? 'Season totals' : phase === 'live' ? 'Live' : 'Final'}>
                {phase === 'pre' ? 'Top performers' : 'Game leaders'}
              </Eyebrow>
              <Leaders columns={leaderColumns} onOpenPlayer={onOpenPlayer} />
            </section>
          )}

          {phase === 'pre' && (recordBefore[left].results.length > 0 || recordBefore[right].results.length > 0) && (
            <section className="matchup-preview__section gridshift-reveal__item" style={reveal()}>
              <Eyebrow>Results so far</Eyebrow>
              <div className="matchup-preview-watch nfl-matchup-results">
                {[[left, leftName], [right, rightName]].map(([team, name]) => (
                  <div className="matchup-preview-watch__col" key={team} style={{ '--matchup-preview-accent': colors[team].accent }}>
                    <div className="matchup-preview-watch__head">
                      <b>{name}</b>
                      <span>{formatRecord(recordBefore[team])}</span>
                    </div>
                    <ol className="nfl-matchup-results__list">
                      {recordBefore[team].results.map((result) => (
                        <li key={result.week}>
                          <span className="nfl-matchup-results__week">Wk {result.week}</span>
                          <span className="nfl-matchup-results__wl" data-result={result.result}>{result.result}</span>
                          <span className="nfl-matchup-results__opp">{`${result.isHome ? 'vs' : '@'} ${result.opponent}`}</span>
                          <b className="tabular-nums">{`${result.pointsFor}–${result.pointsAgainst}`}</b>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
