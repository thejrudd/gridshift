// GridShift-league League Activity (Stage 5.2): maps the platform's activity
// feed (`GET /api/leagues/:id/activity`) into the entry shape League Activity
// renders for Sleeper (`normalizeActivityTransaction` in leagueHistory.js),
// plus the platform-only events: settings (including roster-lock and freeze
// changes), score adjustments, draft, and commissioner roster changes, with
// before/after where the platform records it.
//
// Only platform data goes in (team and player names come from the platform);
// the optional catalog index links a player to core's own player page.
//
// Not shown: lineup changes, including commissioner-set lineups and IR-slot
// moves (user decision 2026-10-29: Activity is for roster adds, drops, and
// changes, not for moving players in and out of slots); trade proposals,
// declines, and cancellations (negotiation, not a completed move); and
// waiver-claim failures and run summaries (claims are private until awarded;
// Plan: "private pending claims ... must not appear").

import { getLineupSlotLabel } from './gridshiftLineup.js';
import { matchCatalogPlayerId } from './gridshiftLeagueAdapter.js';

export const GRIDSHIFT_ACTIVITY_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'trade', label: 'Trades' },
  { id: 'waiver', label: 'Waivers' },
  { id: 'free_agent', label: 'Free agents' },
  { id: 'draft', label: 'Draft' },
  { id: 'adjustment', label: 'Scores' },
  { id: 'settings', label: 'Settings' },
  { id: 'commissioner', label: 'Commissioner' },
]);

const SKIPPED_KINDS = new Set([
  'lineup.set_by_commissioner',
  'trade.proposed', 'trade.declined', 'trade.cancelled',
  'waiver.claim_failed', 'waivers.processed',
]);

const POLICY_LABELS = {
  lock_roster_moves: 'Lock roster moves',
  restrict_acquisitions: 'Restrict acquisitions',
  warn_only: 'Warn only',
};
const ROLE_LABELS = { commissioner: 'Commissioner', manager: 'Manager' };

const SETTING_LABELS = {
  name: 'League name',
  startWeek: 'Start week',
  timezone: 'Time zone',
  'settings.injury.allowQuestionable': 'IR: Questionable eligible',
  'settings.injury.allowDoubtful': 'IR: Doubtful eligible',
  'settings.injury.allowSuspended': 'IR: Suspended eligible',
  'settings.injury.ineligiblePolicy': 'IR policy',
  'settings.rosterLock.allowLineupChanges': 'Lineup changes while roster locked',
  'settings.freezeStartedPlayers': 'Freeze started players',
  'settings.trades.deadlineWeek': 'Trade deadline',
  'settings.trades.review.enabled': 'Trade review',
  'settings.trades.review.windowHours': 'Trade review window',
  'settings.waivers.mode': 'Waiver order',
  'settings.waivers.clearHour': 'Waivers clear at',
  'settings.waivers.periodDays': 'Waiver period',
  'settings.roster.maxSize': 'Roster size',
};

function finite(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (prefix) {
    out[prefix] = value;
  }
  return out;
}

function humanizePath(path) {
  const last = path.split('.').slice(-2).join(' ');
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b[a-z]/, (letter) => letter.toUpperCase());
}

function settingLabel(path) {
  if (SETTING_LABELS[path]) return SETTING_LABELS[path];
  const slot = path.match(/^settings\.roster\.slots\.(\w+)$/);
  if (slot) return `${getLineupSlotLabel(slot[1])} slots`;
  const cap = path.match(/^settings\.roster\.positionCaps\.(\w+)$/);
  if (cap) return `${cap[1]} limit`;
  return humanizePath(path.replace(/^settings\./, ''));
}

function settingValue(path, value) {
  if (value === undefined) return 'Not set';
  if (value === null) return path.endsWith('deadlineWeek') ? 'None' : 'Not set';
  if (path.endsWith('ineligiblePolicy')) return POLICY_LABELS[value] ?? String(value);
  if (path.endsWith('allowLineupChanges')) return value ? 'Allowed' : 'Blocked';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (path.endsWith('deadlineWeek') || path === 'startWeek') return `Week ${value}`;
  if (path.endsWith('windowHours')) return `${value} h`;
  if (path.endsWith('periodDays')) return `${value} day${Number(value) === 1 ? '' : 's'}`;
  if (path.endsWith('clearHour')) return `${String(value).padStart(2, '0')}:00`;
  if (path.endsWith('waivers.mode')) return value === 'reverse_standings' ? 'Reverse standings' : 'Rolling';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/** Changed settings as `[{ label, before, after }]`, plus which areas changed. */
export function diffGridShiftSettings(before, after) {
  const left = flatten(before ?? {});
  const right = flatten(after ?? {});
  const paths = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((path) => JSON.stringify(left[path]) !== JSON.stringify(right[path]))
    .sort();
  return {
    changes: paths.map((path) => ({ label: settingLabel(path), before: settingValue(path, left[path]), after: settingValue(path, right[path]) })),
    lock: paths.some((path) => path.startsWith('settings.rosterLock') || path === 'settings.freezeStartedPlayers'),
    ir: paths.some((path) => path.startsWith('settings.injury')),
    onlyLock: paths.length > 0 && paths.every((path) => path.startsWith('settings.rosterLock') || path === 'settings.freezeStartedPlayers'),
  };
}

function formatPickClock(seconds) {
  const value = finite(seconds, null);
  if (value == null) return '—';
  if (value >= 3600 && value % 3600 === 0) return `${value / 3600} h`;
  if (value >= 60 && value % 60 === 0) return `${value / 60} min`;
  return `${value} s`;
}

/**
 * League Activity entries for one GridShift league, newest first.
 *
 * @param {object} input
 * @param {object} input.activity  `GET …/activity` body
 * @param {object} input.teams     `GET …/teams` body
 * @param {Map} [input.players]    `mapGridShiftPlayers` result (names, positions, NFL teams, catalog ids)
 * @param {Map} [input.catalogIndex] `buildPlayerCatalogIndex` result, for players no longer rostered
 * @param {string} input.season
 */
export function buildGridShiftActivityEntries({ activity, teams, players = new Map(), catalogIndex = null, season = '' }) {
  const rows = [...(activity?.activity ?? [])].filter((row) => row?.kind && row?.payload);
  const teamName = new Map((teams?.teams ?? []).map((team) => [String(team.id), String(team.name ?? 'Team')]));
  const playerNames = new Map();
  for (const [id, player] of players) playerNames.set(id, player.name);
  const learnName = (id, name) => { if (id && name && !playerNames.has(String(id))) playerNames.set(String(id), String(name)); };
  for (const { payload } of rows) {
    learnName(payload.playerId, payload.playerName);
    for (const move of payload.moves ?? []) learnName(move.playerId, move.playerName);
    for (const side of [payload.before, payload.after]) {
      learnName(side?.playerId, side?.playerName);
      for (const entry of side?.players ?? []) learnName(entry.playerId, entry.playerName);
    }
  }
  const nameOfPlayer = (id) => playerNames.get(String(id)) ?? 'Player';
  const teamRef = (teamId) => (teamId ? { teamId: String(teamId), teamName: teamName.get(String(teamId)) ?? 'Team', avatarHash: null } : null);
  const asset = (playerId, name, teamId) => {
    const known = players.get(String(playerId)) ?? null;
    const playerName = known?.name ?? name ?? nameOfPlayer(playerId);
    const sleeperId = known?.sleeperId || matchCatalogPlayerId(catalogIndex, { name: playerName, nflTeam: known?.nflTeam, position: known?.position }) || '';
    return {
      playerId: String(playerId),
      playerName,
      position: known?.position ?? null,
      nflTeam: known?.nflTeam ?? null,
      espnId: null,
      // Portrait and player page only through a catalog match; platform ids never reach core's catalog.
      sleeperId,
      drillId: sleeperId || null,
      rosterId: teamId ? String(teamId) : null,
      team: teamRef(teamId),
    };
  };
  const userName = (row, userId) => (userId ? row.names?.[userId] ?? 'A former member' : 'No manager');

  const byClaim = new Map();
  const byTrade = new Map();
  const freeAgentDrops = [];
  const entries = [];
  const draftPicks = [];
  for (const row of rows) {
    const { kind, payload } = row;
    if (kind === 'roster.player_dropped' && payload.via === 'waiver_claim' && payload.claimId) {
      byClaim.set(payload.claimId, row);
    } else if (kind === 'roster.player_dropped' && payload.via === 'trade' && payload.tradeId) {
      if (!byTrade.has(payload.tradeId)) byTrade.set(payload.tradeId, []);
      byTrade.get(payload.tradeId).push(row);
    } else if (kind === 'roster.player_dropped' && payload.via === 'free_agent_move') {
      freeAgentDrops.push(row);
    }
  }
  const usedDrops = new Set();

  const base = (row, type, label, extra = {}) => ({
    id: String(row.id),
    season: String(season),
    type,
    label,
    timestamp: Date.parse(row.createdAt) || 0,
    week: finite(row.payload.week, null),
    teams: [],
    adds: [],
    drops: [],
    draftPicks: [],
    tags: [type],
    changes: [],
    description: null,
    actorName: row.actorUsername ?? null,
    ...extra,
  });

  for (const row of rows) {
    const { kind, payload } = row;
    if (SKIPPED_KINDS.has(kind)) continue;
    if (kind === 'roster.player_dropped') {
      if (payload.via !== 'free_agent_move') continue;
      const pairedAdd = rows.some((other) => other.kind === 'roster.free_agent_added' && other.payload.droppedPlayerId === payload.playerId && other.payload.teamId === payload.teamId);
      if (pairedAdd) continue;
      usedDrops.add(row.id);
      entries.push(base(row, 'free_agent', 'Player dropped', {
        teams: [teamRef(payload.teamId)].filter(Boolean),
        drops: [asset(payload.playerId, payload.playerName, payload.teamId)],
        tags: ['free_agent', ...(payload.byCommissioner ? ['commissioner'] : [])],
        description: payload.after?.state === 'waivers' ? 'On waivers' : 'Free agent',
      }));
      continue;
    }
    if (kind === 'draft.pick') {
      draftPicks.push(row);
      continue;
    }
    switch (kind) {
      case 'roster.free_agent_added': {
        const drop = freeAgentDrops.find((other) => !usedDrops.has(other.id) && other.payload.playerId === payload.droppedPlayerId && other.payload.teamId === payload.teamId);
        if (drop) usedDrops.add(drop.id);
        entries.push(base(row, 'free_agent', 'Free-agent move', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          adds: [asset(payload.playerId, payload.playerName, payload.teamId)],
          drops: drop ? [asset(drop.payload.playerId, drop.payload.playerName, drop.payload.teamId)] : [],
          tags: ['free_agent', ...(payload.byCommissioner ? ['commissioner'] : [])],
        }));
        break;
      }
      case 'waiver.claim_awarded': {
        const drop = byClaim.get(payload.claimId);
        entries.push(base(row, 'waiver', 'Waiver claim awarded', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          adds: [asset(payload.playerId, payload.playerName, payload.teamId)],
          drops: drop ? [asset(drop.payload.playerId, drop.payload.playerName, drop.payload.teamId)] : [],
        }));
        break;
      }
      case 'trade.accepted':
      case 'trade.executed': {
        const moves = payload.moves ?? [];
        const extraDrops = (byTrade.get(payload.tradeId) ?? []).map((drop) => asset(drop.payload.playerId, drop.payload.playerName, drop.payload.teamId));
        entries.push(base(row, 'trade', 'Trade completed', {
          teams: [teamRef(payload.proposerTeamId), teamRef(payload.receiverTeamId)].filter(Boolean),
          adds: moves.map((move) => asset(move.playerId, move.playerName, move.toTeamId)),
          drops: [...moves.map((move) => asset(move.playerId, move.playerName, move.fromTeamId)), ...extraDrops],
          tags: ['trade', ...(payload.byCommissioner ? ['commissioner'] : [])],
          description: payload.via === 'commissioner_approval' ? 'Approved by the commissioner' : payload.via === 'review_window' ? 'Review window ended' : null,
        }));
        break;
      }
      case 'trade.under_review': {
        const moves = payload.moves ?? [];
        entries.push(base(row, 'trade', 'Trade under review', {
          teams: [teamRef(payload.proposerTeamId), teamRef(payload.receiverTeamId)].filter(Boolean),
          changes: moves.map((move) => ({ label: move.playerName ?? nameOfPlayer(move.playerId), before: teamName.get(String(move.fromTeamId)) ?? 'Team', after: teamName.get(String(move.toTeamId)) ?? 'Team' })),
          description: payload.reviewEndsAt ? `Review ends ${new Date(payload.reviewEndsAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : null,
        }));
        break;
      }
      case 'trade.vetoed':
      case 'trade.failed':
      case 'trade.voided':
      case 'trade.expired':
      case 'trade.execution_deferred': {
        const labels = { 'trade.vetoed': 'Trade vetoed', 'trade.failed': 'Trade failed', 'trade.voided': 'Trade voided', 'trade.expired': 'Trade expired', 'trade.execution_deferred': 'Trade delayed' };
        const commissioner = kind === 'trade.vetoed';
        entries.push(base(row, commissioner ? 'commissioner' : 'trade', labels[kind], {
          teams: [teamRef(payload.proposerTeamId), teamRef(payload.receiverTeamId)].filter(Boolean),
          tags: commissioner ? ['commissioner', 'trade'] : ['trade'],
          description: payload.reason && kind === 'trade.vetoed' ? payload.reason : payload.message ?? payload.reason ?? null,
        }));
        break;
      }
      case 'trade.reversed': {
        const before = new Map((payload.before?.players ?? []).map((entry) => [entry.playerId, entry.teamId]));
        entries.push(base(row, 'commissioner', 'Trade reversed', {
          teams: [teamRef(payload.proposerTeamId), teamRef(payload.receiverTeamId)].filter(Boolean),
          tags: ['commissioner', 'trade'],
          changes: (payload.after?.players ?? []).map((entry) => ({
            label: nameOfPlayer(entry.playerId),
            before: teamName.get(String(before.get(entry.playerId))) ?? 'Team',
            after: teamName.get(String(entry.teamId)) ?? 'Team',
          })),
          description: payload.reason ?? null,
        }));
        break;
      }
      case 'roster.player_assigned':
        entries.push(base(row, 'commissioner', 'Player assigned', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          adds: [asset(payload.playerId, payload.playerName, payload.teamId)],
        }));
        break;
      case 'roster.player_removed':
        entries.push(base(row, 'commissioner', 'Player removed', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          drops: [asset(payload.playerId, payload.playerName, payload.teamId)],
          description: payload.after?.state === 'waivers' ? 'Placed on waivers' : 'Now a free agent',
        }));
        break;
      case 'score.adjusted': {
        const points = finite(payload.points, 0);
        const team = teamName.get(String(payload.teamId)) ?? 'Team';
        entries.push(base(row, 'adjustment', 'Score adjusted', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          tags: ['adjustment', 'commissioner'],
          changes: [{ label: `${team} total`, before: Number(payload.before?.total ?? 0).toFixed(2), after: Number(payload.after?.total ?? 0).toFixed(2) }],
          description: `${points > 0 ? '+' : ''}${points.toFixed(2)} points${payload.reason ? ` · ${payload.reason}` : ''}`,
        }));
        break;
      }
      case 'league.settings_changed': {
        const { changes, lock, ir, onlyLock } = diffGridShiftSettings(payload.before, payload.after);
        entries.push(base(row, 'settings', onlyLock ? 'Roster lock changed' : 'League settings changed', {
          tags: ['settings', 'commissioner', ...(lock ? ['lock'] : []), ...(ir ? ['ir'] : [])],
          changes,
          description: changes.length ? null : 'No visible change',
        }));
        break;
      }
      case 'scoring.changed': {
        const { changes } = diffGridShiftSettings(payload.before, payload.after);
        entries.push(base(row, 'settings', 'Scoring changed', {
          tags: ['settings', 'commissioner'],
          changes,
          description: payload.effectiveWeek ? `From week ${payload.effectiveWeek}` : null,
        }));
        break;
      }
      case 'member.role_changed':
        entries.push(base(row, 'commissioner', 'Role changed', {
          changes: [{ label: userName(row, payload.userId), before: ROLE_LABELS[payload.before?.role] ?? payload.before?.role ?? '—', after: ROLE_LABELS[payload.after?.role] ?? payload.after?.role ?? '—' }],
        }));
        break;
      case 'member.removed':
        entries.push(base(row, 'commissioner', 'Member removed', { description: `${userName(row, payload.userId)} was removed from the league` }));
        break;
      case 'team.manager_changed':
        entries.push(base(row, 'commissioner', 'Team manager changed', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          changes: [{ label: teamName.get(String(payload.teamId)) ?? 'Team', before: userName(row, payload.before?.managerUserId), after: userName(row, payload.after?.managerUserId) }],
        }));
        break;
      case 'team.renamed':
        entries.push(base(row, 'league', 'Team renamed', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          changes: [{ label: 'Name', before: payload.before?.name ?? '—', after: payload.after?.name ?? '—' }],
        }));
        break;
      case 'member.joined':
        entries.push(base(row, 'league', 'Member joined', { teams: [teamRef(payload.teamId)].filter(Boolean), description: `${userName(row, payload.userId)} joined the league` }));
        break;
      case 'member.left':
        entries.push(base(row, 'league', 'Member left', { description: `${userName(row, payload.userId)} left the league` }));
        break;
      case 'league.created':
        entries.push(base(row, 'league', 'League created', { description: [payload.name, payload.season].filter(Boolean).join(' · ') || null }));
        break;
      case 'schedule.generated':
        entries.push(base(row, 'league', 'Schedule set', {
          tags: ['league', 'commissioner'],
          description: `Weeks ${payload.startWeek}–${payload.regularSeasonEndWeek}, championship week ${payload.championshipWeek}`,
        }));
        break;
      case 'week.finalized':
        entries.push(base(row, 'league', `Week ${payload.week} final`, { description: 'Results are official' }));
        break;
      case 'championship.set':
        entries.push(base(row, 'league', 'Championship set', {
          teams: [teamRef(payload.homeTeamId), teamRef(payload.awayTeamId)].filter(Boolean),
        }));
        break;
      case 'draft.configured': {
        const describe = (value) => ({
          orderType: value?.orderType === 'linear' ? 'Linear' : 'Snake',
          pickClock: formatPickClock(value?.pickSeconds),
          rounds: value?.rounds == null ? '—' : String(value.rounds),
          teamOrder: (value?.teamOrder ?? []).map((id) => teamName.get(String(id)) ?? 'Team').join(', '),
          scheduledStart: value?.scheduledStart ? new Date(value.scheduledStart).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled',
        });
        const after = describe(payload.after);
        const labels = { orderType: 'Order', pickClock: 'Pick clock', rounds: 'Rounds', teamOrder: 'Draft order', scheduledStart: 'Start' };
        const before = payload.before ? describe(payload.before) : null;
        entries.push(base(row, 'draft', before ? 'Draft settings changed' : 'Draft set up', {
          tags: ['draft', 'commissioner'],
          changes: before ? Object.keys(labels).filter((key) => before[key] !== after[key]).map((key) => ({ label: labels[key], before: before[key], after: after[key] })) : [],
          description: before ? null : `${after.orderType} order · ${after.rounds} rounds · ${after.pickClock} per pick`,
        }));
        break;
      }
      case 'draft.started':
        entries.push(base(row, 'draft', 'Draft started', { description: [payload.rounds ? `${payload.rounds} rounds` : null, payload.orderType === 'linear' ? 'Linear order' : 'Snake order'].filter(Boolean).join(' · ') }));
        break;
      case 'draft.paused':
        entries.push(base(row, 'draft', 'Draft paused', { tags: ['draft', 'commissioner'], description: `At pick ${payload.pickNumber}` }));
        break;
      case 'draft.resumed':
        entries.push(base(row, 'draft', 'Draft resumed', { tags: ['draft', 'commissioner'], description: `At pick ${payload.pickNumber}` }));
        break;
      case 'draft.stalled':
      case 'draft.scheduled_start_failed':
        entries.push(base(row, 'draft', kind === 'draft.stalled' ? 'Draft stalled' : 'Draft did not start', { description: payload.reason ?? null }));
        break;
      case 'draft.pick_undone':
        entries.push(base(row, 'commissioner', 'Draft pick undone', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          tags: ['commissioner', 'draft'],
          changes: [{ label: `Pick ${payload.pickNumber}`, before: payload.before?.playerName ?? 'Player', after: 'Open' }],
        }));
        break;
      case 'draft.pick_replaced':
        entries.push(base(row, 'commissioner', 'Draft pick replaced', {
          teams: [teamRef(payload.teamId)].filter(Boolean),
          tags: ['commissioner', 'draft'],
          changes: [{ label: `Pick ${payload.pickNumber}`, before: payload.before?.playerName ?? 'Player', after: payload.after?.playerName ?? 'Player' }],
        }));
        break;
      case 'draft.completed':
        entries.push(base(row, 'draft', 'Draft complete', { description: `${finite(payload.picks, 0)} picks` }));
        break;
      default:
        entries.push(base(row, 'league', 'League update', { description: null }));
    }
  }

  // Draft picks: one entry holding every pick, attached to "Draft complete" when there is one.
  if (draftPicks.length) {
    const ordered = [...draftPicks].sort((left, right) => finite(left.payload.pickNumber, 0) - finite(right.payload.pickNumber, 0));
    const adds = ordered.map((row) => asset(row.payload.playerId, row.payload.playerName, row.payload.teamId));
    const completed = entries.find((entry) => entry.type === 'draft' && entry.label === 'Draft complete');
    if (completed) {
      completed.adds = adds;
    } else {
      const latest = draftPicks[0];
      entries.push(base(latest, 'draft', 'Draft picks', { adds, description: `${adds.length} pick${adds.length === 1 ? '' : 's'} so far` }));
    }
  }

  return entries.sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id));
}

/** Whether an entry belongs under a GridShift activity filter. */
export function matchesGridShiftActivityFilter(entry, filter) {
  if (filter === 'all') return true;
  if (filter === 'settings') return entry.tags.includes('settings');
  return entry.tags.includes(filter) || entry.type === filter;
}
