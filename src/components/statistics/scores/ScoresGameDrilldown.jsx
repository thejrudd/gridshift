import { Fragment, useEffect, useMemo, useState } from 'react';
import { getStatisticsScoresGameDetail, getStatisticsScoresStory } from '../../../api/statisticsScoresApi';
import { useTheme } from '../../../context/ThemeContext';
import { getTeamColorKey } from '../../../data/teamColors';
import { getTeamVisualTheme, pickReadableForeground } from '../../../utils/teamVisualTheme';
import { buildScoreDetailFromGame } from '../../../utils/balldontlieNflScoreboard';
import { buildGameRecap } from '../../../utils/statisticsGameRecap.js';
import { getStatisticsPlayerKey } from '../../../utils/statisticsPlayerQuarterStats';
import { TEAM_STAT_BREAKDOWN_BY_LABEL, buildTeamStatBreakdown } from '../../../utils/statisticsTeamStatBreakdown.js';
import { buildPlayStatGroups, mergeStatGroups } from '../../../utils/statisticsScoresPlayStats.js';
import {
  getDefaultStatisticsPlayerSort,
  normalizeStatisticsPlayerSort,
  sortStatisticsPlayerRows,
} from '../../../utils/statisticsPlayerSort';
import { getNflTeamLogoUrl } from '../../../utils/companionAssetVisuals';
import { getScoreNetworkLabel } from '../../../utils/statisticsBroadcasts';
import { formatPlayerMeasurements } from '../../../utils/playerMeasurements.js';
import { deriveEspnEventId, fetchGameParticipants } from '../../../utils/nflPlays/participants.js';
import { lookupPlayerByName } from '../../../utils/nflPlays/playerNameIndex.js';
import { PlayerAvatar } from '../../shared/PlayerAvatar.jsx';
import { LivePosChip } from '../../companion/live/LiveAtoms.jsx';
import { getDriveNetYards, isFieldFlipped, isNonSnapPlay, teamLogo } from '../../../utils/nflPlays/fieldGeometry.js';
import { DriveField } from '../../nflPlays/DriveField.jsx';
import { PlayCard } from './PlayCard.jsx';
import StoryStatsPanel from './StoryStatsPanel.jsx';
import ScoresOverview, { DetailUnavailable, DrivePanel, SectionHeading } from './ScoresOverview.jsx';
import { PlayerSeasonCard, PregameOverview, SeasonGameLog } from './ScoresPregame.jsx';
import { getTeamSeason } from '../../../api/teamSeasonApi.js';
import { fetchRoster } from '../../../utils/playerApi.js';
import { nameKey } from '../../../utils/teamSeason/teamDashboardModel.js';
import { buildMatchupRanks, buildPlayerSeasonCard, buildRecentForm, buildSeasonLeaders, buildSeasonStatGroups, buildSeasonStatLookup, seasonRecord } from '../../../utils/statisticsScoresSeasonContext.js';
import { detailCoverageMessage, driveMeta, playClockLabel, playSentence, quarterLabel } from './scoresDetailFormat.js';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team Stats' },
  { id: 'players', label: 'Players' },
  { id: 'plays', label: 'Play-by-Play' },
  { id: 'story', label: 'Game Story' },
];
// The server keeps team/player detail on its longer cache while projecting the
// canonical play snapshot every eight seconds. Refreshing the envelope at the
// play cadence keeps this feed aligned without multiplying upstream box-score
// work.
const LIVE_DETAIL_REFRESH_INTERVAL_MS = 8_000;
// Plays from the dev fixture carry no provider id; the clock and text identify them.
const playFilterKey = (play) => play.id ?? `${play.period}-${play.time}-${play.description}`;

// A play earns the "Big plays" filter when it scores, changes possession on a
// turnover, gains 20 or more yards, or moves win probability by 6 points.
function bigPlayIds(drives) {
  const ids = new Set();
  let previous = null;
  for (const play of drives.flatMap((drive) => drive.plays)) {
    const probability = Number.isFinite(play.homeWinProbability) ? play.homeWinProbability : null;
    const swing = probability != null && previous != null ? Math.abs(probability - previous) : 0;
    if (probability != null) previous = probability;
    const text = `${play.type ?? ''} ${play.description ?? ''}`;
    const turnover = /intercept/i.test(text) || /fumble/i.test(text) && /recovered by/i.test(text);
    const gain = Number(play.statYardage);
    if (play.scoring || turnover || gain >= 20 || swing >= 0.06) ids.add(playFilterKey(play));
  }
  return ids;
}
const STORY_STATS_PREGAME_WINDOW_MS = 60 * 60_000;
const STORY_STATS_LIVE_STATUSES = new Set(['live', 'halftime', 'delayed']);

function resolveStoryStatsContext({ provider, bdlGameId, status, kickoff, livePeriod }, gameKey, nowMs = Date.now()) {
  if (provider !== 'balldontlie' || !bdlGameId) {
    return { key: `${gameKey}:unavailable`, phase: null, shouldRequest: false, status: 'unavailable' };
  }

  if (status === 'scheduled') {
    const kickoffMs = Date.parse(kickoff ?? '');
    if (!Number.isFinite(kickoffMs)) {
      return { key: `${gameKey}:pregame`, phase: 'pregame', shouldRequest: false, status: 'idle' };
    }
    const openAtMs = kickoffMs - STORY_STATS_PREGAME_WINDOW_MS;
    return {
      key: `${gameKey}:pregame`,
      phase: 'pregame',
      shouldRequest: nowMs >= openAtMs,
      waitMs: Math.max(0, openAtMs - nowMs),
      status: 'idle',
    };
  }

  if (status === 'final') {
    return { key: `${gameKey}:postgame`, phase: 'postgame', shouldRequest: true, status: 'idle' };
  }

  if (STORY_STATS_LIVE_STATUSES.has(status)) {
    const period = Number(livePeriod);
    return {
      key: `${gameKey}:live:${Number.isInteger(period) && period > 0 ? period : 'current'}`,
      phase: 'live',
      period: Number.isInteger(period) && period > 0 ? period : null,
      shouldRequest: true,
      status: 'idle',
    };
  }

  return { key: `${gameKey}:unavailable`, phase: null, shouldRequest: false, status: 'unavailable' };
}

function storiesFromPayload(payload) {
  if (Array.isArray(payload?.stories)) return payload.stories;
  if (payload?.story && typeof payload.story === 'object') return [payload.story];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
function getNumericRatio(stat, side) {
  const ratio = side === 'away' ? stat.awayRatio : stat.homeRatio;
  if (Number.isFinite(ratio)) return ratio;
  const value = side === 'away' ? stat.away : stat.home;
  return Number.isFinite(value) ? value : 0;
}

function statWinner(stat) {
  if (stat.direction === 'neutral') return null;
  const away = getNumericRatio(stat, 'away');
  const home = getNumericRatio(stat, 'home');
  if (away === home) return null;
  if (stat.direction === 'lower') return away < home ? 'away' : 'home';
  return away > home ? 'away' : 'home';
}

function StatAdvantageRail({ stat, awayId, homeId, awayColor, homeColor, expanded = null, onToggle = null }) {
  const awayValue = Math.max(0, getNumericRatio(stat, 'away'));
  const homeValue = Math.max(0, getNumericRatio(stat, 'home'));
  const combinedValue = awayValue + homeValue;
  const awayShare = combinedValue > 0 ? (awayValue / combinedValue) * 100 : 50;
  const homeShare = 100 - awayShare;
  const winner = statWinner(stat);

  const expandable = typeof onToggle === 'function';
  const Rail = expandable ? 'button' : 'div';
  return (
    <Rail
      className={`scores-stat-rail${expandable ? ' is-expandable' : ''}`}
      {...(expandable ? { type: 'button', 'aria-expanded': Boolean(expanded), onClick: onToggle } : {})}
    >
      <span className="scores-stat-rail-values">
        <strong className={winner === 'away' ? 'is-advantage' : winner === 'home' ? 'is-dimmed' : ''}>{stat.away}</strong>
        <span>{stat.label}{expandable && <i className="scores-stat-rail-chevron" aria-hidden="true">{expanded ? '−' : '+'}</i>}</span>
        <strong className={winner === 'home' ? 'is-advantage' : winner === 'away' ? 'is-dimmed' : ''}>{stat.home}</strong>
      </span>
      <span
        className="scores-stat-rail-track"
        role="img"
        aria-label={`${stat.label}: ${awayId} ${stat.away}, ${Math.round(awayShare)} percent; ${homeId} ${stat.home}, ${Math.round(homeShare)} percent`}
      >
        <span className="is-away" style={{ width: `${awayShare}%`, background: awayColor }} />
        <span className="is-home" style={{ width: `${homeShare}%`, background: homeColor }} />
      </span>
      {stat.note && <small>{stat.note}</small>}
    </Rail>
  );
}

// "Tampa Bay Buccaneers" reads as "Buccaneers" in the hero; every NFL nickname
// is the final word, and the full name stays available to assistive tech.
function teamNickname(name) {
  const words = String(name ?? '').trim().split(/\s+/);
  return words.length > 1 ? words.at(-1) : name;
}

function DetailTeam({ team, score, side, record, loser, possession, timeouts = null, onOpenTeam = null }) {
  const hasBall = possession === team.id;
  // With a team route available the whole side opens that team's stats page.
  const Root = onOpenTeam ? 'button' : 'div';
  return (
    <Root
      className={`scores-detail-team is-${side}${loser ? ' is-loser' : ''}${onOpenTeam ? ' is-link' : ''}`}
      {...(onOpenTeam ? { type: 'button', onClick: () => onOpenTeam(team), title: `Open ${team.name} team stats` } : {})}
    >
      <img src={teamLogo(team.id)} alt="" />
      <div>
        <span>{side === 'away' ? 'Away' : 'Home'}</span>
        <strong title={team.name} aria-label={team.name}>{teamNickname(team.name)}</strong>
        <b>{team.id}{record ? ` · ${record}` : ''}</b>
        {(hasBall || Number.isFinite(timeouts)) && (
          <span className="scores-detail-team-state">
            {Number.isFinite(timeouts) && (
              <span className="scores-detail-timeouts" role="img" aria-label={`${timeouts} timeouts left`}>
                {[0, 1, 2].map((index) => <i key={index} className={index < timeouts ? '' : 'is-used'} />)}
              </span>
            )}
            {hasBall && <span className="scores-detail-ball" role="img" aria-label={`${team.name} have the ball`} />}
          </span>
        )}
      </div>
      {score != null && <em>{score}</em>}
    </Root>
  );
}

function ScoreHero({ game, detail, awayTheme, homeTheme, records = null, onOpenTeam = null }) {
  const final = detail.status === 'final';
  const awayLoser = final && detail.score.away < detail.score.home;
  const homeLoser = final && detail.score.home < detail.score.away;
  const possession = detail.status === 'live' ? detail.possession : null;
  const centerForeground = pickReadableForeground([awayTheme?.gradientEnd, homeTheme?.gradientStart].filter(Boolean));
  const network = getScoreNetworkLabel({ ...game, network: detail.network }, { fallback: true });

  return (
    <section
      className="scores-detail-hero"
      style={{
        '--scores-away-gradient': `${awayTheme?.gradientOverlay}, ${awayTheme?.gradient}`,
        '--scores-home-gradient': `${homeTheme?.gradientOverlay}, ${homeTheme?.gradient}`,
        '--scores-away-fg': awayTheme?.gradientFullForeground,
        '--scores-away-muted': awayTheme?.gradientFullMuted,
        '--scores-home-fg': homeTheme?.gradientFullForeground,
        '--scores-home-muted': homeTheme?.gradientFullMuted,
        '--scores-center-fg': centerForeground,
      }}
    >
      <div className="scores-detail-hero-halves" aria-hidden="true"><span /><span /></div>
      <div className="scores-detail-hero-scan" aria-hidden="true" />
      <div className="scores-detail-scoreboard">
        <DetailTeam
          team={detail.away}
          score={detail.score.away}
          side="away"
          record={game.records?.away ?? records?.away}
          loser={awayLoser}
          possession={possession}
          timeouts={detail.status === 'live' ? game.live?.awayTimeouts : null}
          onOpenTeam={onOpenTeam}
        />
        <div className="scores-detail-status">
          {detail.status === 'live' && <span className="scores-live-dot" aria-hidden="true" />}
          <strong>{detail.statusLabel}</strong>
          {game.live?.downDistance && <span>{game.live.downDistance} · {game.live.fieldPosition}</span>}
          {game.live?.redZone && <b>Red Zone</b>}
        </div>
        <DetailTeam
          team={detail.home}
          score={detail.score.home}
          side="home"
          record={game.records?.home ?? records?.home}
          loser={homeLoser}
          possession={possession}
          timeouts={detail.status === 'live' ? game.live?.homeTimeouts : null}
          onOpenTeam={onOpenTeam}
        />
      </div>
      <footer>
        <span>{detail.venue}</span>
        {network && <><span>·</span><span>{network}</span></>}
        <span>·</span><span>{game.dateLabel}</span>
      </footer>
    </section>
  );
}

// Box-score groups to try, in order, when a Team Stats player opens Players.
const TEAM_STAT_PLAYER_GROUPS = {
  totalYards: ['rushing', 'receiving'],
  passingYards: ['receiving', 'passing'],
  rushingYards: ['rushing'],
  firstDowns: ['rushing', 'receiving'],
  thirdDown: ['rushing', 'receiving', 'passing'],
  fourthDown: ['rushing', 'receiving', 'passing'],
  offensivePlays: ['rushing', 'receiving', 'passing'],
  successRate: ['rushing', 'receiving', 'passing'],
  explosivePasses: ['receiving'],
  explosiveRuns: ['rushing'],
  goalToGo: ['receiving', 'rushing'],
  fieldGoals: ['kicking'],
  kickReturns: ['returns', 'receiving', 'rushing'],
  puntReturns: ['returns', 'receiving', 'rushing'],
  netPunting: ['punting'],
  redZone: ['receiving', 'rushing', 'kicking'],
  sacks: ['defense'],
  takeaways: ['defense'],
  turnovers: ['passing', 'rushing', 'receiving'],
  penalties: ['defense', 'receiving', 'rushing', 'passing'],
};

function boxScoreRoster(detail) {
  const roster = new Map();
  for (const group of detail.playerGroups ?? []) {
    for (const row of group.rows ?? []) {
      const key = playerRowKey(row);
      if (!roster.has(key)) roster.set(key, { key, name: row.player, team: row.team, position: row.position ?? null, groups: [] });
      roster.get(key).groups.push(group.id);
    }
  }
  return roster;
}

function TeamStatPlayers({ id, breakdown, detail, roster, participants, awayColor, homeColor, onOpenPlayer, season = null }) {
  const sides = [['away', detail.away, awayColor], ['home', detail.home, homeColor]];
  const all = sides.flatMap(([, team]) => breakdown?.[team.id] ?? []);
  const max = Math.max(1, ...all.map((row) => Math.abs(row.sort)));
  return (
    <div className="scores-stat-players" data-tour="statistics-scores-team-breakdown">
      {sides.map(([side, team, color]) => {
        const rows = breakdown?.[team.id] ?? [];
        return (
          <div key={side} className={`scores-stat-players-team is-${side}`}>
            <div className="scores-stat-players-head">
              <img src={teamLogo(team.id)} alt="" />{team.name}
              {season?.[team.id] && (
                <span className="scores-stat-players-season">
                  Season {season[team.id].average}
                  {season[team.id].rank != null && <span className={`scores-rank-chip${season[team.id].rank <= 10 ? ' is-top' : ''}`}>#{season[team.id].rank} in NFL</span>}
                </span>
              )}
            </div>
            {rows.length ? rows.map((row) => {
              const info = roster.get(row.key);
              // Players missing from the box score arrive with the official text's
              // abbreviated name; the game's participant index spells it out.
              const participant = participants && (info?.name || row.name)
                ? lookupPlayerByName(participants, info?.name ?? row.name, { team: info?.team ?? row.key.split(':')[0] })
                : null;
              const name = info?.name ?? participant?.name ?? row.name ?? row.key.split(':')[1];
              const position = info?.position ?? participant?.position ?? null;
              const group = (TEAM_STAT_PLAYER_GROUPS[id] ?? []).find((entry) => info?.groups.includes(entry)) ?? info?.groups[0] ?? null;
              const content = (
                <>
                  <PlayerAvatar player={participant ? { imageUrl: participant.imageUrl, espnId: participant.espnId } : {}} name={name} size={30} className="scores-player-face" />
                  <span className="scores-stat-players-name">
                    <strong title={name}>{name}</strong>
                    <small>{position && <LivePosChip position={position} />}{row.detail && <span>{row.detail}</span>}</small>
                  </span>
                  <b>{row.value}</b>
                  <span className="scores-stat-players-bar" aria-hidden="true"><i style={{ width: `${(Math.abs(row.sort) / max) * 100}%`, background: color }} /></span>
                </>
              );
              return group ? (
                <button key={row.key} type="button" className="scores-stat-players-row" onClick={() => onOpenPlayer(group, row.key)}>{content}</button>
              ) : (
                <div key={row.key} className="scores-stat-players-row">{content}</div>
              );
            }) : <p className="scores-stat-players-none">None</p>}
          </div>
        );
      })}
    </div>
  );
}

function TeamStats({ detail, awayTheme, homeTheme, participants = null, onOpenPlayer = null, seasonGroups = null, seasonLookup = null, onOpenGame = null, initialOpenStat = null }) {
  const [openStat, setOpenStat] = useState(initialOpenStat);
  const played = detail.status !== 'scheduled';
  const roster = useMemo(() => boxScoreRoster(detail), [detail]);
  const breakdown = useMemo(() => (played ? buildTeamStatBreakdown({
    plays: detail.drives.flatMap((drive) => drive.plays.map((play) => ({ ...play, driveId: drive.id }))),
    roster: [...roster.values()],
    homeTeam: detail.home.id,
    awayTeam: detail.away.id,
  }) : null), [detail, roster, played]);
  // Rows the score feed does not carry, counted from the play-by-play.
  const liveGroups = useMemo(() => (played ? mergeStatGroups(detail.statGroups, buildPlayStatGroups({
    drives: detail.drives,
    roster: [...roster.values()],
    homeTeam: detail.home.id,
    awayTeam: detail.away.id,
  })) : detail.statGroups), [detail, roster, played]);
  const awayColor = awayTheme?.borderColor ?? awayTheme?.color;
  const homeColor = homeTheme?.borderColor ?? homeTheme?.color;
  // Before kickoff the rows are season averages, and a row opens its game log.
  const pregame = !played && seasonGroups?.length > 0;
  const groups = pregame ? seasonGroups : liveGroups;
  if (!groups.length) {
    return <DetailUnavailable>{detailCoverageMessage(detail, 'Team statistics are not included in this score feed.')}</DetailUnavailable>;
  }
  return (
    <div className="scores-team-stats">
      <h2 className="scores-visually-hidden">Team Stats</h2>
      <div className="scores-team-stat-groups">
        {groups.map((group) => (
          <section key={group.id} className="scores-team-stat-group">
            <h3>{group.label}</h3>
            {group.stats.map((stat) => {
              // Expandable only when the play-by-play credited someone, so a row
              // never opens onto two empty lists.
              const candidate = breakdown ? TEAM_STAT_BREAKDOWN_BY_LABEL[stat.label] : null;
              const id = pregame
                ? (stat.season ? stat.label : null)
                : candidate && Object.values(breakdown[candidate] ?? {}).some((rows) => rows.length) ? candidate : null;
              const open = Boolean(id) && openStat === id;
              return (
                <Fragment key={stat.label}>
                  <StatAdvantageRail
                    stat={stat}
                    awayId={detail.away.id}
                    homeId={detail.home.id}
                    awayColor={awayColor}
                    homeColor={homeColor}
                    expanded={open}
                    onToggle={id ? () => setOpenStat(open ? null : id) : null}
                  />
                  {open && pregame && (
                    <SeasonGameLog stat={stat} detail={detail} awayColor={awayColor} homeColor={homeColor} onOpenGame={onOpenGame} />
                  )}
                  {open && !pregame && (
                    <TeamStatPlayers
                      id={id}
                      breakdown={breakdown[id]}
                      detail={detail}
                      roster={roster}
                      participants={participants}
                      awayColor={awayColor}
                      homeColor={homeColor}
                      onOpenPlayer={(groupId, key) => onOpenPlayer?.(groupId, key)}
                      season={seasonLookup?.get(stat.label) ?? null}
                    />
                  )}
                </Fragment>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

// The newest play, directly under the hero, while the game is on or just ended.
function LatestPlay({ detail, onSelectPlay }) {
  if (detail.status === 'scheduled') return null;
  const play = detail.drives.flatMap((drive) => drive.plays).filter((entry) => entry.id && !isNonSnapPlay(entry)).at(-1);
  if (!play) return null;
  return (
    <div className="scores-detail-latest">
      <span>{detail.status === 'final' ? 'Final play' : 'Latest play'}</span>
      <button type="button" onClick={() => onSelectPlay(play.id)}>
        <time>{playClockLabel(play)}</time>
        <img src={teamLogo(play.team)} alt="" />
        <span>{playSentence(play)}</span>
      </button>
    </div>
  );
}

function FocusChip({ detail, selection, onClear }) {
  let label = null;
  if (selection.playId) {
    const play = detail.drives.flatMap((drive) => drive.plays).find((entry) => entry.id === selection.playId);
    if (play) label = playClockLabel(play);
  } else if (selection.driveId) {
    const drive = detail.drives.find((entry) => entry.id === selection.driveId);
    if (drive) label = `${drive.team} drive${drive.plays[0] ? `, ${playClockLabel(drive.plays[0]).split(' ')[0]}` : ''}`;
  }
  if (!label) return null;
  return (
    <div className="scores-focus-chip" role="status">
      <span>Viewing {label}</span>
      <button type="button" onClick={onClear}>{detail.status === 'live' ? 'Back to live' : 'Clear'}</button>
    </div>
  );
}

function playerRowKey(row) {
  return row.key ?? getStatisticsPlayerKey({
    player: { full_name: row.player },
    team: { abbreviation: row.team },
  });
}

function playerDetailId(group, row) {
  return `scores-player-quarter-${group.id}-${playerRowKey(row).replace(/[^a-z0-9]+/gi, '-')}`;
}

function PlayerTeamIdentity({ row }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const teamKey = getTeamColorKey(row.team);
  const logoUrl = teamKey && teamKey !== 'NFL' ? getNflTeamLogoUrl(teamKey) : null;
  const teamName = row.teamName ?? row.team;
  return (
    <span className="scores-player-team-identity" title={teamName}>
      <span className="scores-player-team-logo-slot" aria-hidden="true">
        {logoUrl && !logoFailed && (
          <img src={logoUrl} alt="" onError={() => setLogoFailed(true)} />
        )}
      </span>
      <span className="scores-player-team-code">{row.team}</span>
    </span>
  );
}

// The box score names players but carries no image ids, so faces come from the
// same per-game ESPN participant index the play feed uses. Only the headshot
// fields are passed through: when a photo fails the avatar falls back to
// initials rather than repeating the team logo that already leads the row.
function PlayerFace({ row, size = 34 }) {
  const participant = row.participant;
  const player = participant ? { imageUrl: participant.imageUrl, espnId: participant.espnId } : {};
  return <PlayerAvatar player={player} name={row.player} size={size} className="scores-player-face" />;
}

function PlayerQuarterDetail({ row, group }) {
  const split = row.quarterValues;
  if (!split?.periods?.length) {
    return (
      <div className="scores-player-quarter-detail scores-player-quarter-detail--unavailable">
        <strong>Quarter split unavailable</strong>
        <p>{split?.message ?? 'This player is in the full-game totals, but the play feed does not provide a reliable quarter split.'}</p>
      </div>
    );
  }

  return (
    <div className="scores-player-quarter-detail">
      <div className="scores-player-quarter-table-shell">
        <table className="scores-player-quarter-table" aria-label={`${row.player} ${group.label} by quarter`}>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {group.columns.map((column) => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {split.periods.map((period) => (
              <tr key={period.label}>
                <th scope="row">{period.label}</th>
                {period.values.map((value, index) => <td key={`${period.label}-${group.columns[index]}`}>{value}</td>)}
              </tr>
            ))}
            <tr className="is-total">
              <th scope="row">Total</th>
              {row.values.map((value, index) => <td key={`total-${group.columns[index]}`}>{value}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Desktop drill-in: the quarter rows sit in the player table itself so each
// period lines up under the same column as the player's full-game total.
function PlayerQuarterRows({ row, group, detailId }) {
  const split = row.quarterValues;
  const colSpan = group.columns.length + 1;
  if (!split?.periods?.length) {
    return (
      <tr id={detailId} className="scores-player-detail-row">
        <td colSpan={colSpan}><PlayerQuarterDetail row={row} group={group} /></td>
      </tr>
    );
  }
  return (
    <>
      <tr id={detailId} className="scores-player-detail-row scores-player-quarter-row is-heading">
        <th scope="col">Period</th>
        {group.columns.map((column) => <th key={column} scope="col">{column}</th>)}
      </tr>
      {split.periods.map((period) => (
        <tr key={period.label} className="scores-player-detail-row scores-player-quarter-row">
          <th scope="row">{period.label}</th>
          {period.values.map((value, index) => <td key={`${period.label}-${group.columns[index]}`}>{value}</td>)}
        </tr>
      ))}
      <tr className="scores-player-detail-row scores-player-quarter-row is-total">
        <th scope="row">Total</th>
        {row.values.map((value, index) => <td key={`total-${group.columns[index]}`}>{value}</td>)}
      </tr>
    </>
  );
}

function PlayerStats({ detail, participants = null, selectedGroup = null, onGroupChange = null, focus = null }) {
  const playerGroups = detail.playerGroups ?? [];
  const [localActiveGroup, setLocalActiveGroup] = useState(() => playerGroups[0]?.id ?? '');
  const [sortByGroup, setSortByGroup] = useState(() => Object.fromEntries(
    playerGroups.map((entry) => [entry.id, getDefaultStatisticsPlayerSort(entry)]),
  ));
  // A route focus names only the provider player id; the row key adds the team.
  const focusKey = focus?.key ?? (focus?.playerId
    ? playerGroups.flatMap((entry) => entry.rows).find((row) => row.key?.endsWith(`:id-${focus.playerId}`))?.key ?? null
    : null);
  const [expandedPlayer, setExpandedPlayer] = useState(focusKey);
  // Rows can arrive after Players mounts; expand the focus once it resolves.
  const [appliedFocusKey, setAppliedFocusKey] = useState(focusKey);
  if (focusKey && focusKey !== appliedFocusKey) {
    setAppliedFocusKey(focusKey);
    setExpandedPlayer(focusKey);
  }
  // A player opened from Overview, Team Stats, or a team dashboard chart
  // arrives expanded (Players remounts on every tab switch, so the initial
  // state carries the focus); this only brings that row into view.
  useEffect(() => {
    if (!focusKey) return;
    // The table row and the phone card share the key; scroll the visible one.
    const nodes = typeof document !== 'undefined' ? document.querySelectorAll(`[data-player-key="${CSS.escape(focusKey)}"]`) : [];
    const node = [...nodes].find((entry) => entry.getClientRects().length > 0);
    node?.scrollIntoView?.({ block: 'center' });
  }, [focus, focusKey]);
  const activeGroup = selectedGroup ?? localActiveGroup;
  const group = playerGroups.find((entry) => entry.id === activeGroup) ?? playerGroups[0];
  const effectiveActiveGroup = group?.id ?? '';
  const teamNames = new Map([detail.away, detail.home].filter(Boolean).map((team) => [team.id, team.name]));
  const visibleRows = group
    ? group.rows.map((row) => {
      const participant = participants ? lookupPlayerByName(participants, row.player, { team: row.team }) : null;
      return {
        ...row,
        teamName: row.teamName ?? teamNames.get(row.team) ?? row.team,
        position: row.position ?? (participant?.position || null),
        participant,
      };
    })
    : [];
  const currentSort = group
    ? normalizeStatisticsPlayerSort(group, sortByGroup[effectiveActiveGroup])
    : null;
  const sortedRows = group ? sortStatisticsPlayerRows(visibleRows, group, currentSort) : [];

  const setSortColumn = (columnIndex) => {
    if (!group) return;
    setSortByGroup((current) => {
      const previous = normalizeStatisticsPlayerSort(group, current[effectiveActiveGroup]);
      const direction = previous.columnIndex === columnIndex
        ? (previous.direction === 'desc' ? 'asc' : 'desc')
        : 'desc';
      return { ...current, [effectiveActiveGroup]: { columnIndex, direction } };
    });
  };

  const setSortDirection = (direction) => {
    if (!group) return;
    setSortByGroup((current) => ({
      ...current,
      [effectiveActiveGroup]: { ...currentSort, direction },
    }));
  };

  if (!group) {
    return (
      <section className="scores-player-stats">
        <SectionHeading title="Player Statistics" meta="Complete box score" />
        <DetailUnavailable>{detailCoverageMessage(detail, 'Player statistics are not included in this score feed.')}</DetailUnavailable>
      </section>
    );
  }
  const activeSortColumn = group.columns[currentSort.columnIndex];
  const activeSortDirection = currentSort.direction === 'desc' ? 'descending' : 'ascending';
  return (
    <section className="scores-player-stats">
      <h2 className="scores-visually-hidden">Player Statistics</h2>
      <div className="scores-player-category-rail" role="tablist" aria-label="Player statistic categories">
        {playerGroups.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === effectiveActiveGroup}
            className={entry.id === effectiveActiveGroup ? 'is-active' : ''}
            onClick={() => {
              if (selectedGroup == null) setLocalActiveGroup(entry.id);
              setExpandedPlayer(null);
              onGroupChange?.(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="scores-player-sort-mobile">
        <label htmlFor={`scores-player-sort-${group.id}`}>Sort by</label>
        <select
          id={`scores-player-sort-${group.id}`}
          value={String(currentSort.columnIndex)}
          onChange={(event) => setSortColumn(Number(event.target.value))}
        >
          {group.columns.map((column, index) => <option key={column} value={index}>{column}</option>)}
        </select>
        <button
          type="button"
          className="scores-player-sort-direction"
          aria-label={`Sort ${group.label} by ${activeSortColumn} ${currentSort.direction === 'desc' ? 'ascending' : 'descending'}`}
          title={`Sorted ${activeSortDirection}. Click to reverse.`}
          onClick={() => setSortDirection(currentSort.direction === 'desc' ? 'asc' : 'desc')}
        >
          <span aria-hidden="true">{currentSort.direction === 'desc' ? '↓' : '↑'}</span>
        </button>
      </div>
      <div className="scores-player-table-shell">
        <table className="scores-player-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {group.columns.map((column, index) => {
                const active = currentSort.columnIndex === index;
                const nextDirection = active && currentSort.direction === 'desc' ? 'ascending' : 'descending';
                return (
                  <th key={column} scope="col" aria-sort={active ? activeSortDirection : 'none'}>
                    <button
                      type="button"
                      className="scores-player-sort-button"
                      data-active={active}
                      aria-label={`Sort ${group.label} by ${column} ${nextDirection}`}
                      title={active ? `Sorted ${activeSortDirection}. Click to reverse.` : `Sort by ${column} ${nextDirection}.`}
                      onClick={() => setSortColumn(index)}
                    >
                      <span>{column}</span>
                      <span className="scores-player-sort-indicator" aria-hidden="true">{active ? (currentSort.direction === 'desc' ? '↓' : '↑') : '↕'}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const key = playerRowKey(row);
              const expanded = expandedPlayer === key;
              const detailId = playerDetailId(group, row);
              const measurements = formatPlayerMeasurements(row, { compact: true });
              return (
                <Fragment key={key}>
                  <tr className={expanded ? 'is-expanded' : ''} data-player-key={key}>
                    <th scope="row">
                      <button
                        type="button"
                        className="scores-player-row-toggle"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.player} ${row.teamName ?? row.team} ${group.label} stats`}
                        onClick={() => setExpandedPlayer(expanded ? null : key)}
                      >
                        <PlayerTeamIdentity row={row} />
                        <PlayerFace row={row} />
                        <span className="scores-player-row-name">
                          <strong>{row.player}</strong>
                          <small>{row.position && <LivePosChip position={row.position} />}{row.teamName ?? row.team}</small>
                          {measurements && <small className="scores-player-measurements">{measurements}</small>}
                        </span>
                        <span className="scores-player-row-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
                      </button>
                    </th>
                    {row.values.map((value, index) => <td key={`${key}-${group.columns[index]}`}>{value}</td>)}
                  </tr>
                  {expanded && <PlayerQuarterRows row={row} group={group} detailId={detailId} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="scores-player-cards">
        {sortedRows.map((row) => {
          const key = playerRowKey(row);
          const expanded = expandedPlayer === key;
          const detailId = playerDetailId(group, row);
          const measurements = formatPlayerMeasurements(row, { compact: true });
          return (
            <article key={`mobile-${key}`} className={expanded ? 'is-expanded' : ''} data-player-key={key}>
              <header>
                <button
                  type="button"
                  className="scores-player-card-toggle"
                  aria-expanded={expanded}
                  aria-controls={`${detailId}-mobile`}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.player} ${row.teamName ?? row.team} ${group.label} stats`}
                  onClick={() => setExpandedPlayer(expanded ? null : key)}
                >
                  <PlayerTeamIdentity row={row} />
                  <PlayerFace row={row} size={30} />
                  <span className="scores-player-card-name">
                    <span className="scores-player-card-name__main">
                      {row.position && <LivePosChip position={row.position} />}
                      <strong>{row.player}</strong>
                    </span>
                    {measurements && <small className="scores-player-card-measurements">{measurements}</small>}
                  </span>
                  <b>{group.columns[0]} {row.values[0]}</b>
                  <span className="scores-player-row-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
              </header>
              <p>{group.columns.slice(1).map((column, index) => `${column} ${row.values[index + 1]}`).join(' · ')}</p>
              {expanded && (
                <div id={`${detailId}-mobile`}><PlayerQuarterDetail row={row} group={group} /></div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlayByPlay({ detail, participants, selection = null, onSelectDrive = () => {} }) {
  const { darkMode } = useTheme();
  const [filter, setFilter] = useState('all');
  const [bigOnly, setBigOnly] = useState(false);
  const bigPlays = useMemo(() => bigPlayIds(detail.drives), [detail.drives]);
  // The kickoff-first order the design specifies is right for a game you're
  // reading back. While a game is in progress the newest play is the one you
  // came for, so the feed flips rather than making you scroll to the bottom.
  const live = detail.status === 'live';
  const [expanded, setExpanded] = useState(() => new Set());

  const awayTheme = getTeamVisualTheme(detail.away.id, darkMode);
  const homeTheme = getTeamVisualTheme(detail.home.id, darkMode);

  if (detail.coverage && detail.coverage.plays !== true) {
    const message = detail.coverage?.playsStatus === 'loading'
      ? 'Loading play-by-play from BALLDONTLIE…'
      : detail.coverage?.playsStatus === 'error'
        ? detail.coverage.playsError ?? 'BALLDONTLIE play-by-play could not be loaded.'
      : detail.provider === 'espn'
        ? 'Play-by-play requires a BALLDONTLIE API key for this league.'
        : 'Play-by-play requires BALLDONTLIE play access for this league.';
    return (
      <section className="scores-play-feed">
        <SectionHeading title="Play Feed" meta="Provider coverage" />
        <DetailUnavailable>{message}</DetailUnavailable>
      </section>
    );
  }

  const context = { homeTeam: detail.home.id, awayTeam: detail.away.id };
  // The drive panel above the feed follows the same focus as Overview's.
  const panelDrives = detail.drives.map((drive) => ({ ...drive, netYards: getDriveNetYards(drive.plays, context) }));
  const liveDriveId = live ? panelDrives.at(-1)?.id ?? null : null;
  const shownDriveId = (selection?.playId
    ? panelDrives.find((drive) => drive.plays.some((play) => play.id === selection.playId))?.id
    : selection?.driveId) ?? panelDrives.at(-1)?.id ?? null;
  const playFiltered = bigOnly;
  const keepPlay = (play) => bigPlays.has(playFilterKey(play));
  const drives = (filter === 'all' ? detail.drives : detail.drives.filter((drive) => drive.team === filter))
    .map((drive) => ({ ...drive, netYards: getDriveNetYards(drive.plays, context), shownPlays: playFiltered ? drive.plays.filter(keepPlay) : drive.plays }))
    .filter((drive) => !playFiltered || drive.shownPlays.length);
  const displayedDrives = live ? [...drives].reverse() : drives;

  const toggleDrive = (driveId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  };

  // Quarter markers only make sense against an unbroken chronology, so they are
  // suppressed once a team filter cuts the other side's drives out, or once the
  // feed flips to newest-first for a live game.
  const markers = new Map();
  if (!live && filter === 'all') {
    let lastQuarter = null;
    displayedDrives.forEach((drive) => {
      const label = quarterLabel(drive.plays[0]);
      if (label && label !== lastQuarter) markers.set(drive.id, label);
      if (label) lastQuarter = label;
    });
  }

  return (
    <>
      {panelDrives.length > 0 && (
        <DrivePanel
          detail={detail}
          drives={panelDrives}
          shownDriveId={shownDriveId}
          liveDriveId={liveDriveId}
          participants={participants}
          themes={{ away: awayTheme, home: homeTheme }}
          onSelectDrive={onSelectDrive}
        />
      )}
    <section className="scores-play-feed" data-tour="statistics-scores-play-by-play">
      <SectionHeading
        title="Play Feed"
        meta={`${live ? 'Most recent first' : 'Kickoff first'} · ${drives.length} ${drives.length === 1 ? 'drive' : 'drives'}`}
      />
      <div className="scores-play-filter" role="group" aria-label="Filter drives by team">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        {[detail.away, detail.home].map((team) => (
          <button key={team.id} type="button" aria-pressed={filter === team.id} onClick={() => setFilter(team.id)}>
            <img src={teamLogo(team.id)} alt="" />{team.id}
          </button>
        ))}
        <span className="scores-play-filter-gap" aria-hidden="true" />
        <button type="button" aria-pressed={bigOnly} onClick={() => setBigOnly((value) => !value)}>Big plays</button>
      </div>
      {playFiltered && !drives.length && <p className="scores-detail-unavailable">No plays match these filters.</p>}
      <div className="scores-drive-list">
        {displayedDrives.map((drive) => {
          const open = playFiltered || expanded.has(drive.id);
          const attacking = drive.team === detail.home.id ? homeTheme : awayTheme;
          const barColor = attacking.accentColor ?? attacking.color ?? 'var(--color-accent)';
          const marker = markers.get(drive.id);
          const plays = live ? [...drive.shownPlays].reverse() : drive.shownPlays;
          // Teams change ends every quarter. The drive's opening play settles
          // the orientation for the whole drive, including a drive that runs
          // across a quarter break, so the field and its play strips agree.
          const flipped = isFieldFlipped(drive.plays[0]?.period);

          return (
            <Fragment key={drive.id}>
              {marker && <div className="scores-drive-quarter">{marker}</div>}
              <article className={`scores-drive${drive.score ? ' is-scoring' : ''}`}>
                <button type="button" className="scores-drive-header" aria-expanded={open} onClick={() => toggleDrive(drive.id)}>
                  <img src={teamLogo(drive.team)} alt="" />
                  <strong>{drive.result}</strong>
                  <span>{driveMeta(drive)}</span>
                  <b>{drive.score}</b>
                  <i aria-hidden="true">{open ? '−' : '+'}</i>
                </button>
                {open && (
                  <div className="scores-drive-plays">
                    <DriveField
                      plays={drive.plays}
                      drive={drive}
                      homeTeam={detail.home.id}
                      awayTeam={detail.away.id}
                      awayTheme={awayTheme}
                      homeTheme={homeTheme}
                      barColor={barColor}
                      flipped={flipped}
                      participants={participants}
                      playLabel={(play) => `${play.down} · ${play.description}`}
                    />
                    <div className="scores-drive-playlist">
                      {plays.map((play) => (
                        <PlayCard
                          key={play.id ?? `${drive.id}-${play.time}-${play.down}`}
                          play={play}
                          participants={participants}
                          homeTeam={detail.home.id}
                          awayTeam={detail.away.id}
                          awayTheme={awayTheme}
                          homeTheme={homeTheme}
                          barColor={barColor}
                          flipped={flipped}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </Fragment>
          );
        })}
        {detail.terminal?.kind === 'ended-with-time-remaining' && (
          <div className="scores-game-terminal" role="status" aria-label="End of game">
            <strong>End of game</strong>
            <span>Game ended with {detail.terminal.clock} remaining</span>
          </div>
        )}
      </div>
    </section>
    </>
  );
}

export default function ScoresGameDrilldown({
  game,
  fixtureDetail = null,
  onBack,
  initialSection = 'overview',
  selectedSection = null,
  selectedPlayerGroup = null,
  focusPlayerId = null,
  onSectionChange = null,
  onPlayerGroupChange = null,
  season = null,
  onOpenGame = null,
  onOpenStatisticsPlayer = null,
  onOpenStatisticsTeam = null,
  // Tour previews: both teams' season payloads instead of the season route,
  // and a Team Stats row to open on arrival.
  fixtureSeasons = null,
  initialTeamStat = null,
}) {
  const fixtureData = game.provider === 'fixture' || String(game.id).startsWith('fixture-');
  const detailsProvider = game.detailsProvider ?? game.provider;
  const [localSection, setLocalSection] = useState(initialSection);
  const section = selectedSection ?? localSection;
  const changeSection = (nextSection) => {
    if (selectedSection == null) setLocalSection(nextSection);
    onSectionChange?.(nextSection);
  };
  const gameKey = `${game.provider ?? 'espn'}:${game.bdlGameId ?? game.providerGameId ?? game.id}`;
  const [detailState, setDetailState] = useState({
    key: gameKey,
    status: detailsProvider === 'balldontlie' ? 'loading' : 'unavailable',
    data: null,
    error: null,
  });
  const visibleDetailState = useMemo(() => detailState.key === gameKey
    ? detailState
    : {
      key: gameKey,
      status: detailsProvider === 'balldontlie' ? 'loading' : 'unavailable',
      data: null,
      error: null,
    }, [detailState, detailsProvider, gameKey]);
  const { darkMode } = useTheme();
  const [storyNow, setStoryNow] = useState(() => Date.now());
  const storyProvider = game.provider;
  const storyGameId = game.bdlGameId;
  const storyStatus = game.status;
  const storyKickoff = game.kickoff;
  const storyLivePeriod = game.live?.period;
  const storyContext = useMemo(
    () => resolveStoryStatsContext({
      provider: storyProvider,
      bdlGameId: storyGameId,
      status: storyStatus,
      kickoff: storyKickoff,
      livePeriod: storyLivePeriod,
    }, gameKey, storyNow),
    [gameKey, storyGameId, storyKickoff, storyLivePeriod, storyNow, storyProvider, storyStatus],
  );
  const [storyRetry, setStoryRetry] = useState(0);
  const [storyState, setStoryState] = useState({
    key: storyContext.key,
    status: storyContext.status,
    stories: [],
    error: null,
    quota: null,
  });
  const visibleStoryState = storyState.key === storyContext.key
    ? storyState
    : {
      key: storyContext.key,
      status: storyContext.status,
      stories: [],
      error: null,
      quota: null,
  };

  useEffect(() => {
    // StoryStats is an optional, request-metered enrichment. Only spend a
    // provider call when the user opens its dedicated drilldown section; the
    // score, detail, and play-by-play tabs remain independent of the story
    // budget.
    if (section !== 'story') return undefined;

    let timerId = null;
    if (!storyContext.shouldRequest) {
      setStoryState((current) => current.key === storyContext.key
        ? { ...current, status: storyContext.status }
        : {
          key: storyContext.key,
          status: storyContext.status,
          stories: [],
          error: null,
          quota: null,
        });
      if (storyContext.waitMs > 0) {
        timerId = window.setTimeout(() => setStoryNow(Date.now()), storyContext.waitMs + 50);
      }
      return () => {
        if (timerId) window.clearTimeout(timerId);
      };
    }

    const controller = new AbortController();
    let stopped = false;
    setStoryState((current) => ({
      key: storyContext.key,
      status: 'loading',
      stories: current.key.startsWith(gameKey) ? current.stories : [],
      error: null,
      quota: current.key.startsWith(gameKey) ? current.quota : null,
    }));

    async function loadStory() {
      try {
        const payload = await getStatisticsScoresStory(storyGameId, storyContext.phase, {
          signal: controller.signal,
        });
        if (stopped || controller.signal.aborted) return;
        setStoryState({
          key: storyContext.key,
          status: 'ready',
          stories: storiesFromPayload(payload),
          error: null,
          quota: payload.quota ?? payload.storyStats ?? payload.accounting ?? null,
        });
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted || stopped) return;
        setStoryState((current) => current.key === storyContext.key
          ? { ...current, status: 'error', error: error.message }
          : {
            key: storyContext.key,
            status: 'error',
            stories: [],
            error: error.message,
            quota: null,
          });
      }
    }

    void loadStory();
    return () => {
      stopped = true;
      controller.abort();
      if (timerId) window.clearTimeout(timerId);
    };
  }, [gameKey, section, storyContext, storyRetry, storyGameId]);

  useEffect(() => {
    if (fixtureData || detailsProvider !== 'balldontlie' || !game.bdlGameId) return undefined;
    const controller = new AbortController();
    const refreshesLiveDetail = ['live', 'halftime', 'delayed'].includes(game.status);
    let stopped = false;
    let requestInFlight = false;
    let timeoutId = null;

    const scheduleRefresh = () => {
      if (!refreshesLiveDetail || stopped || document.visibilityState === 'hidden' || !navigator.onLine) return;
      timeoutId = window.setTimeout(loadDetail, LIVE_DETAIL_REFRESH_INTERVAL_MS);
    };

    async function loadDetail() {
      if (stopped || requestInFlight || document.visibilityState === 'hidden' || !navigator.onLine) return;
      requestInFlight = true;
      try {
        const payload = await getStatisticsScoresGameDetail(game.bdlGameId, {
          phase: game.phase,
          signal: controller.signal,
        });
        if (stopped || controller.signal.aborted) return;
        setDetailState({ key: gameKey, status: 'ready', data: payload, error: null });
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted || stopped) return;
        setDetailState((current) => current.key === gameKey && current.data
          ? { ...current, error: error.message }
          : { key: gameKey, status: 'error', data: null, error: error.message });
      } finally {
        requestInFlight = false;
        scheduleRefresh();
      }
    }

    const refreshNow = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
      void loadDetail();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNow();
      else if (timeoutId) window.clearTimeout(timeoutId);
    };
    const handleOffline = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', refreshNow);
    window.addEventListener('offline', handleOffline);
    void loadDetail();
    return () => {
      stopped = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', refreshNow);
      window.removeEventListener('offline', handleOffline);
    };
  }, [detailsProvider, fixtureData, game.bdlGameId, game.phase, game.status, gameKey]);
  // Player photos for the play feed and box score. Best-effort and entirely non-blocking:
  // if ESPN is unreachable or the event id can't be derived, plays still render,
  // just without faces.
  const [participants, setParticipants] = useState(null);
  const providerPlays = visibleDetailState.data?.plays;
  const espnEventId = useMemo(() => deriveEspnEventId(providerPlays ?? []), [providerPlays]);
  useEffect(() => {
    setParticipants(null);
    if (!espnEventId) return undefined;
    let cancelled = false;
    fetchGameParticipants(espnEventId, {
      teams: [game.away?.id, game.home?.id].filter(Boolean),
      isFinal: game.status === 'final',
    }).then((resolved) => {
      if (!cancelled) setParticipants(resolved);
    });
    return () => { cancelled = true; };
  }, [espnEventId, game.away?.id, game.home?.id, game.status]);

  const detail = useMemo(
    () => fixtureData
      ? fixtureDetail
      : buildScoreDetailFromGame(game, {
        providerDetail: visibleDetailState.data,
        detailStatus: visibleDetailState.status,
        detailError: visibleDetailState.error,
      }),
    [fixtureData, fixtureDetail, game, visibleDetailState],
  );
  const recap = useMemo(() => (section === 'story' ? buildGameRecap(detail) : null), [detail, section]);
  // One play or drive in focus across the Overview sections. It belongs to the
  // matchup, so opening a different game starts unfocused.
  const [selection, setSelection] = useState({ key: gameKey, playId: null, driveId: null });
  const visibleSelection = selection.key === gameKey ? selection : { key: gameKey, playId: null, driveId: null };
  const selectPlay = (playId) => setSelection((current) => ({
    key: gameKey,
    playId: current.key === gameKey && current.playId === playId ? null : playId,
    driveId: null,
  }));
  const selectDrive = (driveId) => setSelection({ key: gameKey, playId: null, driveId });
  const clearSelection = () => setSelection({ key: gameKey, playId: null, driveId: null });
  const [playerFocus, setPlayerFocus] = useState(() => (focusPlayerId ? { playerId: focusPlayerId, at: 0 } : null));
  const seasonYear = season ?? game.season ?? null;
  const pregameSeason = game.status === 'scheduled';
  // Before kickoff the season drives the Overview and Team Stats; once the game
  // is on, it only adds season averages and ranks to Team Stats, so it waits
  // until that tab opens.
  const seasonEligible = !fixtureData && game.phase !== 'preseason' && Boolean(seasonYear) && Boolean(game.away?.id && game.home?.id);
  const [seasonWanted, setSeasonWanted] = useState(null);
  const seasonKeyCandidate = fixtureSeasons
    ? `fixture:${game.id}`
    : seasonEligible ? `${seasonYear}:${game.away.id}:${game.home.id}` : null;
  if (seasonKeyCandidate && !pregameSeason && section === 'team' && seasonWanted !== seasonKeyCandidate) setSeasonWanted(seasonKeyCandidate);
  const seasonKey = seasonKeyCandidate && (pregameSeason || seasonWanted === seasonKeyCandidate) ? seasonKeyCandidate : null;
  const [fetchedSeasonState, setSeasonState] = useState({ key: null, status: 'idle', away: null, home: null, error: null });
  const seasonState = useMemo(() => (fixtureSeasons
    ? { key: seasonKey, status: 'ready', away: fixtureSeasons.away, home: fixtureSeasons.home, error: null }
    : fetchedSeasonState), [fixtureSeasons, seasonKey, fetchedSeasonState]);
  useEffect(() => {
    if (!seasonKey || fixtureSeasons) return undefined;
    const controller = new AbortController();
    Promise.all([
      getTeamSeason({ season: seasonYear, team: game.away.id, signal: controller.signal }),
      getTeamSeason({ season: seasonYear, team: game.home.id, signal: controller.signal }),
    ]).then(([away, home]) => {
      setSeasonState({ key: seasonKey, status: 'ready', away, home, error: null });
    }).catch((error) => {
      if (error.name === 'AbortError') return;
      setSeasonState({ key: seasonKey, status: 'error', away: null, home: null, error: error.message });
    });
    return () => controller.abort();
  }, [seasonKey, fixtureSeasons, seasonYear, game.away?.id, game.home?.id]);
  const seasonContext = useMemo(() => {
    if (!seasonKey || !pregameSeason) return null;
    if (seasonState.key !== seasonKey) return { status: 'loading' };
    if (seasonState.status !== 'ready') return { status: seasonState.status, error: seasonState.error };
    const input = { away: game.away.id, home: game.home.id, awaySeason: seasonState.away, homeSeason: seasonState.home };
    return {
      status: 'ready',
      ranks: buildMatchupRanks(input),
      form: { [game.away.id]: buildRecentForm(seasonState.away), [game.home.id]: buildRecentForm(seasonState.home) },
      leaders: buildSeasonLeaders(input),
      statGroups: buildSeasonStatGroups(input),
      records: { away: seasonRecord(seasonState.away, game.away.id), home: seasonRecord(seasonState.home, game.home.id) },
      seasons: { [game.away.id]: seasonState.away, [game.home.id]: seasonState.home },
    };
  }, [seasonKey, pregameSeason, seasonState, game.away?.id, game.home?.id]);
  const seasonLookup = useMemo(() => {
    if (!seasonKey || pregameSeason || seasonState.key !== seasonKey || seasonState.status !== 'ready') return null;
    return buildSeasonStatLookup(
      { away: game.away.id, home: game.home.id, awaySeason: seasonState.away, homeSeason: seasonState.home },
      { excludeGameId: game.bdlGameId ?? null },
    );
  }, [seasonKey, pregameSeason, seasonState, game.away?.id, game.home?.id, game.bdlGameId]);
  const openSeasonGame = (entry) => onOpenGame?.({ gameId: entry.id, week: entry.week });
  // ESPN rosters before kickoff: season leaders' photos and the ESPN id the
  // Statistics player page is keyed by. Best-effort; leaders show initials and
  // no "Full stats" link without them.
  const [espnRosters, setEspnRosters] = useState({ key: null, byTeam: {} });
  useEffect(() => {
    if (!seasonKey || !pregameSeason || fixtureSeasons) return undefined;
    let cancelled = false;
    const teams = [game.away.id, game.home.id];
    Promise.all(teams.map((team) => fetchRoster(team).catch(() => []))).then((rosters) => {
      if (cancelled) return;
      const byTeam = Object.fromEntries(teams.map((team, index) => [
        team,
        new Map((rosters[index] ?? []).map((player) => [nameKey(player.displayName), player])),
      ]));
      setEspnRosters({ key: seasonKey, byTeam });
    });
    return () => { cancelled = true; };
  }, [seasonKey, pregameSeason, fixtureSeasons, game.away?.id, game.home?.id]);
  const espnFor = (team, name) => (espnRosters.key === seasonKey ? espnRosters.byTeam[team]?.get(nameKey(name)) ?? null : null);
  const [cardPlayer, setCardPlayer] = useState(null);
  const playerCard = useMemo(() => {
    if (!cardPlayer || seasonContext?.status !== 'ready') return null;
    return buildPlayerSeasonCard(seasonContext.seasons[cardPlayer.team], cardPlayer.id);
  }, [cardPlayer, seasonContext]);
  // One route update: the group change already lands on Players, and a second
  // section change would rebuild the route from the stale Overview state and
  // drop the group.
  const openPlayers = (groupId, playerKey = null) => {
    setPlayerFocus(playerKey ? { key: playerKey, at: Date.now() } : null);
    if (onPlayerGroupChange) {
      if (selectedSection == null) setLocalSection('players');
      onPlayerGroupChange(groupId);
    } else {
      changeSection('players');
    }
  };
  if (!detail) {
    return <p className="statistics-scores-state">Loading fixture comparison…</p>;
  }
  const awayTheme = getTeamVisualTheme(detail.away.id, darkMode, { logoSide: 'start' });
  const homeTheme = getTeamVisualTheme(detail.home.id, darkMode, { logoSide: 'end' });

  return (
    <div className="statistics-scores-detail page-frame-data">
      <div className="scores-detail-topbar">
        <button type="button" className="scores-detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to Scores
        </button>
      </div>

      <ScoreHero game={game} detail={detail} awayTheme={awayTheme} homeTheme={homeTheme} records={seasonContext?.records ?? null} onOpenTeam={fixtureData ? null : onOpenStatisticsTeam} />
      <LatestPlay detail={detail} onSelectPlay={(playId) => { changeSection('overview'); selectPlay(playId); }} />

      <div className="scores-detail-tabs-shell">
        <nav className="scores-detail-tabs" role="tablist" aria-label="Game detail sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={section === entry.id}
              className={section === entry.id ? 'is-active' : ''}
              onClick={() => changeSection(entry.id)}
            >{entry.label}</button>
          ))}
        </nav>
      </div>

      {section === 'overview' && seasonContext && (
        <PregameOverview
          detail={detail}
          context={seasonContext}
          colors={{
            away: awayTheme?.borderColor ?? awayTheme?.color ?? 'var(--color-label-secondary)',
            home: homeTheme?.borderColor ?? homeTheme?.color ?? 'var(--color-label)',
          }}
          onOpenGame={openSeasonGame}
          espnFor={espnFor}
          onOpenPlayer={(entry) => setCardPlayer({ id: entry.id, team: entry.team, name: entry.name })}
        />
      )}
      {playerCard && (
        <PlayerSeasonCard
          card={playerCard}
          team={cardPlayer.team}
          teamName={cardPlayer.team === detail.away.id ? detail.away.name : detail.home.name}
          espnPlayer={espnFor(cardPlayer.team, cardPlayer.name)}
          onClose={() => setCardPlayer(null)}
          onOpenGame={openSeasonGame}
          onOpenStatistics={onOpenStatisticsPlayer ? (player) => {
            setCardPlayer(null);
            onOpenStatisticsPlayer({ id: player.id, displayName: player.displayName, position: player.position, team: cardPlayer.team });
          } : null}
        />
      )}
      {section === 'overview' && !seasonContext && (
        <>
          <FocusChip detail={detail} selection={visibleSelection} onClear={clearSelection} />
          <ScoresOverview
            detail={detail}
            awayTheme={awayTheme}
            homeTheme={homeTheme}
            participants={participants}
            selection={visibleSelection}
            onSelectPlay={selectPlay}
            onSelectDrive={selectDrive}
            onOpenPlayers={openPlayers}
          />
        </>
      )}
      {section === 'team' && (
        <TeamStats
          detail={detail}
          awayTheme={awayTheme}
          homeTheme={homeTheme}
          participants={participants}
          onOpenPlayer={openPlayers}
          seasonGroups={seasonContext?.statGroups ?? null}
          seasonLookup={seasonLookup}
          initialOpenStat={initialTeamStat}
          onOpenGame={openSeasonGame}
        />
      )}
      {section === 'players' && (
        <PlayerStats
          detail={detail}
          participants={participants}
          focus={playerFocus}
          selectedGroup={selectedPlayerGroup}
          onGroupChange={onPlayerGroupChange}
        />
      )}
      {section === 'plays' && <PlayByPlay detail={detail} participants={participants} selection={visibleSelection} onSelectDrive={selectDrive} />}
      {section === 'story' && (
        <StoryStatsPanel
          stories={visibleStoryState.stories}
          status={visibleStoryState.status}
          error={visibleStoryState.error}
          phase={storyContext.phase}
          gameStatus={game.status}
          statusLabel={detail.statusLabel}
          quota={visibleStoryState.quota}
          onRetry={() => setStoryRetry((current) => current + 1)}
          recap={recap}
        />
      )}
    </div>
  );
}
