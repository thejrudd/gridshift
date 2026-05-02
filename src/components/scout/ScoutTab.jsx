import { useState, useCallback, useEffect, useRef } from 'react';
import { ROOKIES_2026 } from '../../data/rookies';
import { DRAFT_ORDER_SOURCE_2026, DRAFT_PICKS_2026 } from '../../data/draftPicks';
import { DRAFT_RESULTS_2026, DRAFT_RESULTS_SOURCE_2026 } from '../../data/draftResults';
import { TEAM_NAMES, getTeamPalette } from '../../data/teamColors';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import { hasCombineData, playerPhotoUrl, photoFallback, positionColor } from './scoutUtils';
import { collegeLogoUrl, nflLogoUrl } from './scoutTeamLogos';
import ScoutPositionalSpotlight from './ScoutPositionalSpotlight';
import ScoutRosterList from './ScoutRosterList';
import ScoutPlayerSheet from './ScoutPlayerSheet';
import ScoutCompareSheet from './ScoutCompareSheet';
import ScoutStatisticsModal from './ScoutStatisticsModal';
import { scoutDebug, scoutDebugTable } from './scoutDebug';

const SORT_OPTIONS = [
  { value: 'projectedOverall', label: 'Projected Pick' },
  { value: 'bigBoardRank', label: 'Prospect Rank' },
  { value: 'nflGrade',     label: 'NFL Grade' },
  { value: 'dynastyAdp',   label: 'Dynasty ADP' },
  { value: 'fortyYard',    label: '40-Yard Dash' },
  { value: 'vertical',     label: 'Vertical Jump' },
  { value: 'broadJump',    label: 'Broad Jump' },
  { value: 'threeCone',    label: '3-Cone Drill' },
  { value: 'shuttle',      label: '20-Yard Shuttle' },
  { value: 'benchPress',   label: 'Bench Press' },
  { value: 'rushYards',    label: 'Rush Yards' },
  { value: 'recYards',     label: 'Rec Yards' },
];

const OFFENSE_POSITION_GROUPS = new Set(['QB', 'RB', 'WR', 'TE', 'OL']);
const DEFENSE_POSITION_GROUPS = new Set(['DL', 'LB', 'DB', 'ST']);
const POS_FILTERS = ['All', 'Offense', 'Defense', 'QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'OL', 'ST'];
const SCOUT_VIEWS = [
  { value: 'prospects', label: 'Prospects' },
  { value: 'picks', label: 'Picks' },
  { value: 'results', label: 'Results' },
];
const PICK_ROUND_FILTERS = ['Remaining', 'All', 1, 2, 3, 4, 5, 6, 7];
const TEAM_ID_BY_NAME = Object.fromEntries(
  Object.entries(TEAM_NAMES).map(([teamId, teamName]) => [teamName, teamId]),
);
const DRAFT_TEAM_OPTIONS = Object.values(TEAM_NAMES).sort((a, b) => a.localeCompare(b));
// ESPN's numeric NFL team IDs → display names. Used to resolve `pick.teamId` from the
// flat draft endpoint into a real team name. This ID reflects the team making the pick,
// so it is trade-correct in real time (e.g. if KC trades up, pick.teamId becomes KC's).
const ESPN_NFL_TEAM_BY_ID = {
  '1': 'Atlanta Falcons', '2': 'Buffalo Bills', '3': 'Chicago Bears', '4': 'Cincinnati Bengals',
  '5': 'Cleveland Browns', '6': 'Dallas Cowboys', '7': 'Denver Broncos', '8': 'Detroit Lions',
  '9': 'Green Bay Packers', '10': 'Tennessee Titans', '11': 'Indianapolis Colts',
  '12': 'Kansas City Chiefs', '13': 'Las Vegas Raiders', '14': 'Los Angeles Rams',
  '15': 'Miami Dolphins', '16': 'Minnesota Vikings', '17': 'New England Patriots',
  '18': 'New Orleans Saints', '19': 'New York Giants', '20': 'New York Jets',
  '21': 'Philadelphia Eagles', '22': 'Arizona Cardinals', '23': 'Pittsburgh Steelers',
  '24': 'Los Angeles Chargers', '25': 'San Francisco 49ers', '26': 'Seattle Seahawks',
  '27': 'Tampa Bay Buccaneers', '28': 'Washington Commanders', '29': 'Carolina Panthers',
  '30': 'Jacksonville Jaguars', '33': 'Baltimore Ravens', '34': 'Houston Texans',
};
// Internal team-id slugs (match keys in NFL_LOGO_IDS / teamColors TEAM_NAMES) keyed by
// ESPN's numeric team id. Used to populate pick.team (abbr) so logo helpers resolve.
const ESPN_NFL_ABBR_BY_ID = {
  '1': 'atl', '2': 'buf', '3': 'chi', '4': 'cin', '5': 'cle', '6': 'dal', '7': 'den',
  '8': 'det', '9': 'gb', '10': 'ten', '11': 'ind', '12': 'kc', '13': 'lv', '14': 'lar',
  '15': 'mia', '16': 'min', '17': 'ne', '18': 'no', '19': 'nyg', '20': 'nyj',
  '21': 'phi', '22': 'ari', '23': 'pit', '24': 'lac', '25': 'sf', '26': 'sea',
  '27': 'tb', '28': 'wsh', '29': 'car', '30': 'jax', '33': 'bal', '34': 'hou',
};
// Single flat endpoint for picks, results, and the banner — CORS-open, real-time
const ESPN_LIVE_DRAFT_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft';
const LIVE_DRAFT_PICKS_URL = import.meta.env?.VITE_SCOUT_DRAFT_PICKS_URL?.trim() || ESPN_LIVE_DRAFT_URL;
const LIVE_DRAFT_PICKS_INTERVAL_MS = Number(import.meta.env?.VITE_SCOUT_DRAFT_PICKS_INTERVAL_MS ?? 60_000);
const USE_ESPN_DRAFT_RESULTS = import.meta.env?.VITE_SCOUT_USE_ESPN_DRAFT_RESULTS !== 'false';
const LIVE_DRAFT_RESULTS_URL = import.meta.env?.VITE_SCOUT_DRAFT_RESULTS_URL?.trim()
  || (USE_ESPN_DRAFT_RESULTS ? ESPN_LIVE_DRAFT_URL : '');
const LIVE_DRAFT_RESULTS_INTERVAL_MS = Number(import.meta.env?.VITE_SCOUT_DRAFT_RESULTS_INTERVAL_MS ?? 30_000);
// Adaptive banner polling: snappy when a pick is about to land, calmer otherwise.
const LIVE_DRAFT_BANNER_INTERVAL_FAST_MS = 5_000;     // OTC clock under 30 s
const LIVE_DRAFT_BANNER_INTERVAL_NORMAL_MS = 15_000;  // OTC clock active (> 30 s)
const LIVE_DRAFT_BANNER_INTERVAL_IDLE_MS = 60_000;    // Draft not live
const LIVE_DRAFT_BANNER_FAST_THRESHOLD_MS = 30_000;
const DRAFT_SESSION_WINDOWS_2026 = [
  {
    label: 'Round 1',
    startAt: Date.parse('2026-04-23T20:00:00-04:00'),
    endAt: Date.parse('2026-04-23T23:00:00-04:00'),
  },
  {
    label: 'Rounds 2-3',
    startAt: Date.parse('2026-04-24T19:00:00-04:00'),
    endAt: Date.parse('2026-04-24T23:00:00-04:00'),
  },
  {
    label: 'Rounds 4-7',
    startAt: Date.parse('2026-04-25T12:00:00-04:00'),
    endAt: Date.parse('2026-04-25T19:00:00-04:00'),
  },
];

function darkenHex(hex, amount = 0.32) {
  const clean = String(hex ?? '').replace('#', '');
  if (clean.length !== 6) return hex;
  const n = parseInt(clean, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexLuminance(hex) {
  const clean = String(hex ?? '').replace('#', '');
  if (clean.length !== 6) return 0;
  const n = parseInt(clean, 16);
  const [r, g, b] = [((n >> 16) & 255), ((n >> 8) & 255), (n & 255)].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readableTeamSecondary(primary, secondary) {
  if (!secondary || hexLuminance(secondary) > 0.82) {
    return darkenHex(primary, 0.38);
  }
  return secondary;
}

function getDraftTeamMeta(teamName) {
  const teamId = TEAM_ID_BY_NAME[teamName] ?? null;
  const palette = getTeamPalette(teamId);
  let primary = palette?.darkPrimary ?? palette?.primary ?? 'var(--color-fill)';
  let secondary = readableTeamSecondary(primary, palette?.darkSecondary ?? palette?.secondary);
  let textColor = hexLuminance(primary) > 0.36 ? '#0C0F14' : '#FFFFFF';
  let gradient = `linear-gradient(135deg, ${primary} 0%, ${darkenHex(primary, 0.28)} 58%, ${secondary} 100%)`;

  if (teamId === 'nyj') {
    primary = '#FFFFFF';
    secondary = palette?.primary ?? '#125740';
    textColor = '#0C0F14';
    gradient = `linear-gradient(135deg, ${primary} 0%, ${primary} 48%, ${secondary} 100%)`;
  } else if (teamId === 'nyg') {
    gradient = `linear-gradient(315deg, ${primary} 0%, ${darkenHex(primary, 0.28)} 58%, ${secondary} 100%)`;
  }

  return {
    teamId,
    primary,
    secondary,
    textColor,
    mutedColor: textColor === '#FFFFFF' ? 'rgba(255,255,255,0.72)' : 'rgba(12,15,20,0.66)',
    gradient,
    logoUrl: teamId ? `https://a.espncdn.com/i/teamlogos/nfl/500/${teamId}.png` : null,
  };
}

function normalizeDraftPick(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const round = Number(raw.round ?? raw.draftRound);
  // ESPN flat endpoint uses `number` for overall pick slot
  const overall = Number(raw.number ?? raw.overall ?? raw.pick ?? raw.draftOverall);
  // ESPN flat endpoint provides team as an object; custom feeds may provide a plain string
  const teamName = typeof raw.team === 'object'
    ? (espnTeamName(raw.team) || espnTeamName(raw.franchise) || '')
    : String(raw.teamName ?? raw.draftTeamName ?? raw.team ?? '').trim();
  if (!Number.isFinite(round) || !Number.isFinite(overall) || !teamName) return null;

  return {
    round,
    overall,
    teamName,
    note: raw.note ?? raw.tradeNote ?? '',
    source: raw.source ?? raw.sourceUrl ?? DRAFT_ORDER_SOURCE_2026,
    playerName: raw.playerName ?? raw.name ?? raw.displayName ?? null,
    position: typeof raw.position === 'string' ? raw.position : (raw.position?.abbreviation ?? null),
    college: typeof raw.college === 'string' ? raw.college : (raw.college?.name ?? raw.college?.displayName ?? null),
  };
}

// onTheClockOverall: the overall slot number that is *actually* on the clock right now,
// derived from payload.current.pickId. ESPN marks ALL undrafted slots with status
// "ON_THE_CLOCK", so we must gate the note to the single authoritative slot number.
// When onTheClockOverall is null we fall back to the pick's own status string.
function normalizeEspnDraftPick(pick, roundNumber, onTheClockOverall = null) {
  if (!pick || typeof pick !== 'object') return null;

  const overall = Number(
    pick.number ?? pick.overall ?? pick.overallPickNumber ?? pick.pickNumber ?? pick.selection ?? pick.id,
  );
  const pickInRound = Number(pick.pick ?? pick.roundPickNumber ?? pick.pickInRound ?? pick.selection);
  const round = Number(pick.round ?? pick.roundNumber ?? roundNumber);
  const teamName = espnPickTeamName(pick, overall);

  if (!Number.isFinite(round) || !Number.isFinite(overall) || !teamName) return null;

  const statusName = firstString(
    typeof pick?.status === 'string' ? pick.status : null,
    pick?.status?.name,
    pick?.status?.type?.name,
  );

  // If we know which slot is authoritative, use exact match; otherwise fall back to status.
  const isOnTheClock = onTheClockOverall != null
    ? overall === onTheClockOverall
    : statusName === 'ON_THE_CLOCK';

  return {
    round,
    overall,
    teamName,
    note: isOnTheClock ? 'On the clock' : '',
    source: ESPN_LIVE_DRAFT_URL,
    playerName: espnPlayerName(pick) || null,
    position: espnPlayerPosition(pick) || null,
    college: espnPlayerCollege(pick) || null,
    team: (pick?.teamId != null ? ESPN_NFL_ABBR_BY_ID[String(pick.teamId)] : null)
      || firstString(pick?.team?.abbreviation, pick?.franchise?.abbreviation)
      || null,
    pick: Number.isFinite(pickInRound) ? pickInRound : overall,
  };
}

function normalizeEspnDraftPicksPayload(payload) {
  const rounds = Array.isArray(payload?.items) ? payload.items : [];
  const directPicks = Array.isArray(payload?.picks) ? payload.picks : [];

  // Resolve the one authoritative on-the-clock slot from payload.current so we don't
  // accidentally flag every undrafted pick as OTC (ESPN marks them all that way).
  const current = payload?.current ?? null;
  const onTheClockOverall = current?.pickId != null ? Number(current.pickId) : null;

  const picks = [
    ...directPicks.map(pick => normalizeEspnDraftPick(pick, payload?.number, onTheClockOverall)),
    ...rounds.flatMap(round => (
      Array.isArray(round?.picks)
        ? round.picks.map(pick => normalizeEspnDraftPick(pick, round.number, onTheClockOverall))
        : []
    )),
  ].filter(Boolean);

  return picks.sort((a, b) => a.overall - b.overall);
}

function normalizeDraftPicksPayload(payload) {
  const espnRows = normalizeEspnDraftPicksPayload(payload);
  if (espnRows.length) return espnRows;

  const rows = Array.isArray(payload) ? payload : payload?.picks;
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeDraftPick)
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
}

function normalizeDraftResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const round = Number(raw.round ?? raw.draftRound);
  const pick = Number(raw.pickInRound ?? raw.pick ?? raw.draftPick);
  const overall = Number(raw.overall ?? raw.draftOverall ?? raw.pick);
  const teamName = String(raw.teamName ?? raw.draftTeamName ?? raw.team ?? '').trim();
  const playerName = String(raw.playerName ?? raw.name ?? '').trim();
  if (!Number.isFinite(round) || !Number.isFinite(overall) || !teamName || !playerName) return null;

  return {
    round,
    pick: Number.isFinite(pick) ? pick : overall,
    overall,
    team: raw.teamAbbr ?? raw.draftTeam ?? null,
    teamName,
    playerId: raw.playerId ?? raw.rookieId ?? raw.id ?? null,
    playerName,
    position: raw.position ?? null,
    college: raw.college ?? null,
    source: raw.source ?? raw.sourceUrl ?? DRAFT_RESULTS_SOURCE_2026,
  };
}

function normalizeDraftResultsPayload(payload) {
  const espnRows = normalizeEspnDraftResultsPayload(payload);
  if (espnRows.length) return espnRows;

  const rows = Array.isArray(payload) ? payload : payload?.results ?? payload?.picks;
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeDraftResult)
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function espnTeamName(team) {
  const displayName = firstString(team?.displayName, team?.name);
  if (displayName) return displayName;

  const location = firstString(team?.location);
  const nickname = firstString(team?.nickname, team?.shortDisplayName);
  return [location, nickname].filter(Boolean).join(' ').trim();
}

function espnPickTeamName(pick, overall) {
  // Priority order for trade correctness:
  // 1. pick.teamId — the team that actually made/is making the pick in the flat endpoint.
  //    Trade-correct in real time. IMPORTANT: do NOT use pick.athlete.team — that's the
  //    player's COLLEGE team, not the NFL team.
  // 2. pick.franchise — for rounds-endpoint payloads that nest the franchise object.
  // 3. pick.team — only when it's a real object (some custom feeds).
  // 4. DRAFT_PICKS_2026 — static pre-draft fallback by overall slot.
  const byId = pick?.teamId != null ? ESPN_NFL_TEAM_BY_ID[String(pick.teamId)] : null;
  if (byId) return byId;
  const fromFranchise = espnTeamName(pick?.franchise);
  if (fromFranchise) return fromFranchise;
  if (pick?.team && typeof pick.team === 'object') {
    const fromTeam = espnTeamName(pick.team);
    if (fromTeam) return fromTeam;
  }
  return DRAFT_PICKS_2026.find(item => item.overall === overall)?.teamName ?? '';
}

function espnPlayerName(pick) {
  return firstString(
    pick?.displayName,
    pick?.fullName,
    pick?.athlete?.displayName,
    pick?.athlete?.fullName,
    pick?.player?.displayName,
    pick?.player?.fullName,
    pick?.prospect?.displayName,
    pick?.prospect?.fullName,
    pick?.selection?.athlete?.displayName,
    pick?.selection?.athlete?.fullName,
  );
}

function espnPlayerPosition(pick) {
  return firstString(
    pick?.athlete?.position?.abbreviation,
    pick?.player?.position?.abbreviation,
    pick?.prospect?.position?.abbreviation,
    pick?.position?.abbreviation,
    pick?.position,
  );
}

function espnPlayerCollege(pick) {
  return firstString(
    pick?.athlete?.college?.name,
    pick?.athlete?.college?.displayName,
    pick?.player?.college?.name,
    pick?.player?.college?.displayName,
    pick?.prospect?.college?.name,
    pick?.prospect?.college?.displayName,
    pick?.college?.name,
    pick?.college?.displayName,
    pick?.college,
  );
}

function normalizeEspnPick(pick, roundNumber) {
  if (!pick || typeof pick !== 'object') return null;
  // ESPN flat endpoint has pick.status as a plain string ("SELECTION_MADE" / "ON_THE_CLOCK");
  // other payloads nest it as an object.
  const statusName = firstString(
    typeof pick?.status === 'string' ? pick.status : null,
    pick?.status?.name,
    pick?.status?.type?.name,
  );
  const playerName = espnPlayerName(pick);
  if (statusName && statusName !== 'SELECTION_MADE' && !playerName) return null;

  const overall = Number(pick.number ?? pick.overall ?? pick.overallPickNumber ?? pick.pickNumber ?? pick.selection ?? pick.id);
  const pickInRound = Number(pick.pick ?? pick.roundPickNumber ?? pick.pickInRound ?? pick.selection);
  const round = Number(pick.round ?? pick.roundNumber ?? roundNumber);
  const teamName = espnPickTeamName(pick, overall);
  if (!Number.isFinite(round) || !Number.isFinite(overall) || !teamName || !playerName) return null;

  return {
    round,
    pick: Number.isFinite(pickInRound) ? pickInRound : overall,
    overall,
    team: (pick?.teamId != null ? ESPN_NFL_ABBR_BY_ID[String(pick.teamId)] : null)
      || firstString(pick?.team?.abbreviation, pick?.franchise?.abbreviation)
      || null,
    teamName,
    playerId: firstString(pick?.athlete?.id, pick?.player?.id, pick?.prospect?.id) || null,
    playerName,
    position: espnPlayerPosition(pick) || null,
    college: espnPlayerCollege(pick) || null,
    source: ESPN_LIVE_DRAFT_URL,
  };
}

function normalizeEspnDraftResultsPayload(payload) {
  const rounds = Array.isArray(payload?.items) ? payload.items : [];
  const directPicks = Array.isArray(payload?.picks) ? payload.picks : [];
  const picks = [
    ...directPicks.map(pick => normalizeEspnPick(pick, payload?.number)),
    ...rounds.flatMap(round => (
      Array.isArray(round?.picks)
        ? round.picks.map(pick => normalizeEspnPick(pick, round.number))
        : []
    )),
  ].filter(Boolean);

  return picks.sort((a, b) => a.overall - b.overall);
}

function normalizeEspnLiveDraftPayload(payload) {
  const statusState = firstString(payload?.status?.state, payload?.state);
  const isDraftLive = statusState === 'in';

  if (!isDraftLive) return { isDraftLive: false };

  const picks = Array.isArray(payload?.picks) ? payload.picks : [];
  const current = payload?.current ?? null;

  // Primary: locate the current pick via payload.current.pickId (most reliable)
  const currentPickNum = current?.pickId != null ? Number(current.pickId) : null;
  let onTheClock = Number.isFinite(currentPickNum)
    ? (picks.find(p => Number(p.overall ?? p.number ?? p.id) === currentPickNum) ?? null)
    : null;

  // Fallback: state-based matching (flat endpoint has status as a string)
  if (!onTheClock) {
    onTheClock = picks.find(p => {
      const s = firstString(
        typeof p?.status === 'string' ? p.status : null,
        p?.state,
        p?.status?.name,
        p?.status?.type?.name,
      );
      return s?.toUpperCase().replace(/[\s-]+/g, '_') === 'ON_THE_CLOCK';
    }) ?? null;
  }

  const overall = Number(
    onTheClock?.number ?? onTheClock?.overall ?? onTheClock?.overallPickNumber ?? currentPickNum,
  );
  const round = Number(
    onTheClock?.round ?? onTheClock?.roundNumber ?? current?.round,
  );
  const teamName = espnPickTeamName(onTheClock ?? {}, overall) || '';

  const expiresRaw = current?.expires ?? onTheClock?.expires ?? null;
  const expiresAt = expiresRaw ? new Date(expiresRaw).getTime() : null;
  const onTheClockStatus = firstString(
    typeof onTheClock?.status === 'string' ? onTheClock.status : null,
    onTheClock?.state,
    onTheClock?.status?.name,
    onTheClock?.status?.type?.name,
  )?.toUpperCase().replace(/[\s-]+/g, '_');
  const hasActiveClock = Boolean(
    Number.isFinite(overall)
    && teamName
    && (
      onTheClockStatus === 'ON_THE_CLOCK'
      || (expiresAt != null && expiresAt > Date.now())
    ),
  );

  const mapProspect = (p) => ({
    name: firstString(p?.displayName, p?.fullName, p?.name),
    position: firstString(p?.position?.abbreviation, p?.position),
  });

  // ESPN calls this `bestAvailablePicks` on the flat endpoint; older docs used `bestAvailable`.
  const bestAvailableSrc = Array.isArray(current?.bestAvailablePicks)
    ? current.bestAvailablePicks
    : (Array.isArray(current?.bestAvailable) ? current.bestAvailable : []);
  const bestAvailable = bestAvailableSrc.slice(0, 3).map(mapProspect).filter(p => p.name);

  const bestFitSrc = Array.isArray(current?.bestFitPicks)
    ? current.bestFitPicks
    : (Array.isArray(current?.bestFit) ? current.bestFit : []);
  const bestFit = bestFitSrc.slice(0, 3).map(mapProspect).filter(p => p.name);

  return {
    isDraftLive,
    overall: Number.isFinite(overall) ? overall : null,
    round: Number.isFinite(round) ? round : null,
    teamName: teamName || null,
    expiresAt,
    hasActiveClock,
    bestAvailable,
    bestFit,
  };
}

async function fetchJsonWithAbort(url, signal) {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchDraftResultsPayload(url, signal) {
  return fetchJsonWithAbort(url, signal);
}

function normalizeNameKey(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCollegeKey(college) {
  return normalizeNameKey(college)
    .replace(/\bst\b/g, 'state')
    .replace(/\bmiami fl\b/g, 'miami')
    .replace(/\bmiami florida\b/g, 'miami')
    .replace(/\btexas a m\b/g, 'texas am')
    .replace(/\but san antonio\b/g, 'utsa');
}

function normalizePositionKey(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (normalized === 'S') return 'SAF';
  if (normalized === 'OG' || normalized === 'IOL') return 'G';
  if (normalized === 'DE' || normalized === 'OLB') return 'EDGE';
  return normalized;
}

function buildPlayerDraftMatchIndex(players) {
  const byId = new Map(players.map(player => [player.id, player]));
  const byName = new Map();
  const byNameCollege = new Map();
  const byNamePosition = new Map();
  const byNamePositionCollege = new Map();
  const byProjectedOverall = new Map();
  const byBigBoardRank = new Map();

  for (const player of players) {
    const name = normalizeNameKey(player.name);
    const college = normalizeCollegeKey(player.college);
    const position = normalizePositionKey(player.position);

    byName.set(name, [...(byName.get(name) ?? []), player]);
    byNameCollege.set(`${name}|${college}`, player);
    byNamePosition.set(`${name}|${position}`, player);
    byNamePositionCollege.set(`${name}|${position}|${college}`, player);
    if (player.projectedOverall != null) byProjectedOverall.set(player.projectedOverall, player);
    if (player.bigBoardRank != null) byBigBoardRank.set(player.bigBoardRank, player);
  }

  return { byId, byName, byNameCollege, byNamePosition, byNamePositionCollege, byProjectedOverall, byBigBoardRank };
}

function findPlayerForDraftResult(result, index, { allowPickFallback = false } = {}) {
  if (result.playerId && index.byId.has(result.playerId)) {
    return index.byId.get(result.playerId);
  }

  const name = normalizeNameKey(result.playerName);
  const college = normalizeCollegeKey(result.college);
  const position = normalizePositionKey(result.position);

  return index.byNamePositionCollege.get(`${name}|${position}|${college}`)
    ?? index.byNameCollege.get(`${name}|${college}`)
    ?? index.byNamePosition.get(`${name}|${position}`)
    ?? ((index.byName.get(name)?.length === 1) ? index.byName.get(name)[0] : null)
    ?? (allowPickFallback ? index.byProjectedOverall.get(result.overall) : null)
    ?? (allowPickFallback ? index.byBigBoardRank.get(result.overall) : null);
}

function mergeDraftResultsWithPlayers(results, players) {
  const index = buildPlayerDraftMatchIndex(players);

  return results.map(result => {
    const player = findPlayerForDraftResult(result, index);

    return {
      ...result,
      playerId: result.playerId ?? player?.id ?? null,
      playerName: result.playerName || player?.name || 'Unknown prospect',
      position: result.position ?? player?.position ?? null,
      college: result.college ?? player?.college ?? null,
      player,
    };
  });
}

function draftDebugSummary(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    draftStatus: player.draftStatus,
    draftRound: player.draftRound,
    draftPick: player.draftPick,
    draftOverall: player.draftOverall,
    draftTeam: player.draftTeam,
    draftTeamName: player.draftTeamName,
    projectedOverall: player.projectedOverall,
    bigBoardRank: player.bigBoardRank,
  };
}

function resultDebugSummary(result) {
  if (!result) return null;
  return {
    overall: result.overall,
    round: result.round,
    pick: result.pick,
    team: result.team,
    teamName: result.teamName,
    playerId: result.playerId,
    playerName: result.playerName,
    position: result.position,
    college: result.college,
    source: result.source,
  };
}

function draftResultsFromPlayers(players) {
  return players
    .filter(player => player.draftStatus === 'drafted' && player.draftOverall != null)
    .map(player => ({
      round: player.draftRound,
      pick: player.draftPick,
      overall: player.draftOverall,
      team: player.draftTeam,
      teamName: player.draftTeamName ?? player.draftTeam,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      college: player.college,
      source: DRAFT_RESULTS_SOURCE_2026,
    }));
}

function applyDraftResultsToPlayers(players, results) {
  const playerMatchIndex = buildPlayerDraftMatchIndex(players);
  const resultByPlayerId = new Map();

  const identityMatched = results
    .map(result => ({ result, player: findPlayerForDraftResult(result, playerMatchIndex) }))
    .filter(item => item.player);

  for (const { result, player } of identityMatched) {
    resultByPlayerId.set(player.id, result);
  }

  const identityMatchedOverall = new Set(identityMatched.map(({ result }) => result.overall));
  const identityMatchedPlayerIds = new Set(identityMatched.map(({ player }) => player.id));

  for (const result of results) {
    if (identityMatchedOverall.has(result.overall)) continue;
    const player = findPlayerForDraftResult(result, playerMatchIndex, { allowPickFallback: true });
    if (player && !identityMatchedPlayerIds.has(player.id)) {
      resultByPlayerId.set(player.id, result);
    }
  }

  return players.map(player => {
    const result = resultByPlayerId.get(player.id);
    if (!result) return player;

    return {
      ...player,
      draftStatus: 'drafted',
      draftRound: result.round ?? player.draftRound,
      draftPick: result.pick ?? player.draftPick,
      draftOverall: result.overall ?? player.draftOverall,
      draftTeam: result.team ?? player.draftTeam,
      draftTeamName: result.teamName ?? player.draftTeamName,
    };
  });
}

function useScoutDraftResults(shouldPoll) {
  const staticResults = DRAFT_RESULTS_2026.length > 0
    ? DRAFT_RESULTS_2026
    : draftResultsFromPlayers(ROOKIES_2026);
  const [draftResults, setDraftResults] = useState(staticResults);
  const [liveFeedState, setLiveFeedState] = useState({
    enabled: Boolean(LIVE_DRAFT_RESULTS_URL),
    status: LIVE_DRAFT_RESULTS_URL ? 'loading' : 'static',
    updatedAt: null,
    error: null,
  });

  // Shared merge helper — used by both the internal poller and the
  // externally-driven `applyLivePayload` so the two stay in lockstep.
  const mergePayload = useCallback((payload) => {
    const liveResults = normalizeDraftResultsPayload(payload);
    const manualByPlayerId = new Map(DRAFT_RESULTS_2026.map(result => [result.playerId, result]).filter(([id]) => id));
    const manualByOverall = new Map(DRAFT_RESULTS_2026.map(result => [result.overall, result]));
    const nextResults = [
      ...liveResults.filter(result => !manualByPlayerId.has(result.playerId) && !manualByOverall.has(result.overall)),
      ...DRAFT_RESULTS_2026,
    ].sort((a, b) => a.overall - b.overall);
    if (nextResults.length === 0) throw new Error('No results in live feed');
    return nextResults;
  }, []);

  // Allow outside callers (the banner poller) to push the same payload they just
  // fetched so Results updates at the banner's adaptive cadence instead of
  // running a second, slower fetch loop.
  const applyLivePayload = useCallback((payload) => {
    if (!payload) return;
    try {
      const nextResults = mergePayload(payload);
      setDraftResults(nextResults);
      setLiveFeedState({
        enabled: true,
        status: 'live',
        updatedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      setLiveFeedState(prev => ({
        ...prev,
        status: prev.updatedAt ? 'stale' : 'fallback',
        error: error.message,
      }));
    }
  }, [mergePayload]);

  useEffect(() => {
    if (!shouldPoll || !LIVE_DRAFT_RESULTS_URL) return undefined;

    let stopped = false;
    let timeoutId = 0;
    let controller = null;
    const intervalMs = Math.max(10_000, LIVE_DRAFT_RESULTS_INTERVAL_MS);

    const clearScheduledLoad = () => {
      window.clearTimeout(timeoutId);
      timeoutId = 0;
    };

    const scheduleNextLoad = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      clearScheduledLoad();
      timeoutId = window.setTimeout(loadLiveResults, intervalMs);
    };

    const loadLiveResults = async () => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();

      try {
        setLiveFeedState(prev => ({ ...prev, status: prev.updatedAt ? 'refreshing' : 'loading', error: null }));
        const payload = await fetchDraftResultsPayload(LIVE_DRAFT_RESULTS_URL, controller.signal);
        const nextResults = mergePayload(payload);
        if (stopped) return;

        setDraftResults(nextResults);
        setLiveFeedState({
          enabled: true,
          status: 'live',
          updatedAt: new Date().toISOString(),
          error: null,
        });
      } catch (error) {
        if (stopped || error.name === 'AbortError') return;
        setLiveFeedState(prev => ({
          ...prev,
          status: prev.updatedAt ? 'stale' : 'fallback',
          error: error.message,
        }));
      } finally {
        scheduleNextLoad();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadLiveResults();
        return;
      }

      clearScheduledLoad();
      controller?.abort();
    };

    loadLiveResults();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopped = true;
      controller?.abort();
      clearScheduledLoad();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shouldPoll, mergePayload]);

  return { draftResults, liveFeedState, applyLivePayload };
}

function groupDraftPicks(picks) {
  return Array.from(
    picks.reduce((rounds, pick) => {
      if (!rounds.has(pick.round)) rounds.set(pick.round, []);
      rounds.get(pick.round).push(pick);
      return rounds;
    }, new Map()),
    ([round, roundPicks]) => ({
      round,
      picks: [...roundPicks].sort((a, b) => a.overall - b.overall),
    }),
  ).sort((a, b) => a.round - b.round);
}

function getTeamPicks(picks, teamName) {
  return picks.filter(pick => pick.teamName === teamName);
}

// How many of this team's picks are still on the board from this slot onward.
// Counts the current pick if it hasn't been selected yet, plus every later
// unselected pick the same team owns. Result descends with each subsequent
// row for the same team during a live draft.
function getTeamRemainingFromHere(picks, pick) {
  return picks.filter(p => (
    p.teamName === pick.teamName
    && !p.playerName
    && p.overall >= pick.overall
  )).length;
}

function compareAscNullLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareDescNullLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function getDraftScheduleState(now = Date.now()) {
  const activeSession = DRAFT_SESSION_WINDOWS_2026.find(
    session => now >= session.startAt && now <= session.endAt,
  ) ?? null;
  const nextSession = DRAFT_SESSION_WINDOWS_2026.find(session => session.startAt > now) ?? null;
  const firstStartAt = DRAFT_SESSION_WINDOWS_2026[0]?.startAt ?? null;
  const finalEndAt = DRAFT_SESSION_WINDOWS_2026[DRAFT_SESSION_WINDOWS_2026.length - 1]?.endAt ?? null;

  return {
    activeSession,
    nextSession,
    showBanner: firstStartAt != null && finalEndAt != null && now >= firstStartAt && now <= finalEndAt,
  };
}

function syncDesktopPanelPosition(detailNode, listShellNode) {
  if (!detailNode) return;

  if (window.innerWidth < 1024) {
    detailNode.style.removeProperty('--scout-panel-top');
    detailNode.style.removeProperty('--scout-panel-left');
    detailNode.style.removeProperty('--scout-panel-width');
    return;
  }

  const listShellRect = listShellNode?.getBoundingClientRect();
  const detailRect = detailNode.getBoundingClientRect();
  const panelWidth = Math.round(detailRect.width || 340);
  const shellTop = listShellRect?.top ?? 80;
  const shellRight = listShellRect?.right ?? detailRect.right;
  const panelLeft = Math.round(shellRight - panelWidth);

  detailNode.style.setProperty('--scout-panel-top', `${Math.max(80, Math.round(shellTop))}px`);
  detailNode.style.setProperty('--scout-panel-left', `${panelLeft}px`);
  detailNode.style.setProperty('--scout-panel-width', `${panelWidth}px`);
}

function sortRookies(rookies, sortKey) {
  return [...rookies].sort((a, b) => {
    switch (sortKey) {
      // Combine drills — lower time is faster (40, 3-cone, shuttle); higher
      // measurement is better for the jumps and bench reps.
      case 'fortyYard':
        return compareAscNullLast(a.combine?.fortyYard, b.combine?.fortyYard);
      case 'vertical':
        return compareDescNullLast(a.combine?.vertical, b.combine?.vertical);
      case 'broadJump':
        return compareDescNullLast(a.combine?.broadJump, b.combine?.broadJump);
      case 'threeCone':
        return compareAscNullLast(a.combine?.threeCone, b.combine?.threeCone);
      case 'shuttle':
        return compareAscNullLast(a.combine?.shuttle, b.combine?.shuttle);
      case 'benchPress':
        return compareDescNullLast(a.combine?.benchPress, b.combine?.benchPress);
      case 'rushYards':
        return compareDescNullLast(a.collegeStats?.rushYards, b.collegeStats?.rushYards);
      case 'recYards':
        return compareDescNullLast(a.collegeStats?.recYards, b.collegeStats?.recYards);
      case 'dynastyAdp':
        return compareAscNullLast(a.dynastyAdp, b.dynastyAdp);
      case 'projectedOverall':
        return compareAscNullLast(a.projectedOverall, b.projectedOverall);
      case 'nflGrade':
        return compareDescNullLast(a.nflGrade, b.nflGrade);
      case 'bigBoardRank':
      default:
        return compareAscNullLast(a.bigBoardRank, b.bigBoardRank);
    }
  });
}

// Format a duration in seconds as "Xd Xh Xm Xs", omitting any leading units
// that are zero. e.g. 41,520s → "11h 32m 0s" (drops days), 45s → "45s",
// 0 → "0s". The smallest non-zero unit and everything below it is kept so the
// seconds digit always animates during the final minute of the OTC clock.
function formatCountdownDuration(totalSeconds) {
  if (totalSeconds == null) return null;
  const safe = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(safe / 86_400);
  const h = Math.floor((safe % 86_400) / 3_600);
  const m = Math.floor((safe % 3_600) / 60);
  const s = safe % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (d > 0 || h > 0) parts.push(`${h}h`);
  if (d > 0 || h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function useCountdown(expiresAt) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (expiresAt == null) return null;
    return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (expiresAt == null) {
      setSecondsLeft(null);
      return undefined;
    }
    const tick = () => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(s);
      return s;
    };
    tick();
    const id = setInterval(() => { if (tick() <= 0) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}

export default function ScoutTab({ view = 'prospects', onViewChange }) {
  const scoutView = SCOUT_VIEWS.some(item => item.value === view) ? view : 'prospects';
  const [posFilter, setPosFilter] = useState('All');
  const [sortKey, setSortKey]     = useState('projectedOverall');
  const [combineOnly, setCombineOnly] = useState(false);
  // College team colors as row gradients in the prospects list.
  // Persisted to localStorage so the user's choice survives reloads.
  const [useTeamColors, setUseTeamColors] = useState(() => {
    try { return localStorage.getItem('scout:useTeamColors') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('scout:useTeamColors', useTeamColors ? '1' : '0'); }
    catch { /* storage unavailable — fine, fall back to in-memory state */ }
  }, [useTeamColors]);
  const [search, setSearch]       = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [compareA, setCompareA]   = useState(null);
  const [compareB, setCompareB]   = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [statisticsPlayer, setStatisticsPlayer] = useState(null);
  const [desktopPanelHeight, setDesktopPanelHeight] = useState(null);
  const [draftScheduleNow, setDraftScheduleNow] = useState(() => Date.now());
  const listShellRef = useRef(null);
  const detailPanelRef = useRef(null);
  const [liveDraftInfo, setLiveDraftInfo] = useState(null);
  const { draftResults, liveFeedState: resultsFeedState, applyLivePayload } = useScoutDraftResults(scoutView !== 'picks');
  const scoutPlayers = applyDraftResultsToPlayers(ROOKIES_2026, draftResults);
  const selectedScoutPlayer = selectedPlayerId
    ? (scoutPlayers.find(player => player.id === selectedPlayerId) ?? null)
    : null;
  const draftResultsSignature = draftResults
    .map(result => `${result.overall}:${result.playerId ?? result.playerName}:${result.team}`)
    .join('|');
  const draftedPlayersSignature = scoutPlayers
    .filter(player => player.draftStatus === 'drafted')
    .map(player => `${player.id}:${player.draftOverall}:${player.draftTeam}`)
    .join('|');

  useEffect(() => {
    const index = buildPlayerDraftMatchIndex(ROOKIES_2026);
    scoutDebugTable('Draft result identity matches', draftResults.map((result) => {
      const matchedPlayer = findPlayerForDraftResult(result, index);
      return {
        resultOverall: result.overall,
        resultPlayerId: result.playerId,
        resultPlayerName: result.playerName,
        matchedPlayerId: matchedPlayer?.id ?? null,
        matchedPlayerName: matchedPlayer?.name ?? null,
        matchedDraftStatus: matchedPlayer?.draftStatus ?? null,
      };
    }));

    scoutDebug('Scout draft state', {
      scoutView,
      liveFeedState: resultsFeedState,
      draftResults: draftResults.map(resultDebugSummary),
      draftedPlayers: scoutPlayers
        .filter(player => player.draftStatus === 'drafted')
        .map(draftDebugSummary),
    });
  }, [
    scoutView,
    resultsFeedState.status,
    resultsFeedState.updatedAt,
    draftResultsSignature,
    draftedPlayersSignature,
  ]);

  useEffect(() => {
    if (!selectedPlayerId) return;
    scoutDebug('Selected profile resolved in ScoutTab', {
      selectedPlayerId,
      selectedScoutPlayer: draftDebugSummary(selectedScoutPlayer),
      rawRookie: draftDebugSummary(ROOKIES_2026.find(player => player.id === selectedPlayerId)),
      matchingResult: resultDebugSummary(draftResults.find(result => result.playerId === selectedPlayerId)),
    });
  }, [selectedPlayerId, selectedScoutPlayer, draftResults]);

  // Ranked on full sorted list before filter (per AGENTS.md gotcha)
  const sorted = sortRookies(scoutPlayers, sortKey).map((r, i) => ({ ...r, rank: i + 1 }));

  const filtered = sorted.filter(r => {
    if (posFilter === 'Offense' && !OFFENSE_POSITION_GROUPS.has(r.positionGroup)) return false;
    if (posFilter === 'Defense' && !DEFENSE_POSITION_GROUPS.has(r.positionGroup)) return false;
    if (posFilter !== 'All' && posFilter !== 'Offense' && posFilter !== 'Defense' && r.positionGroup !== posFilter) return false;
    if (combineOnly && !hasCombineData(r)) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q)
        || r.college?.toLowerCase().includes(q)
        || r.position?.toLowerCase().includes(q)
        || r.positionGroup?.toLowerCase().includes(q)
        || r.draftTeam?.toLowerCase().includes(q)
        || r.draftTeamName?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSelectPlayer = useCallback((player) => {
    setSelectedPlayerId(player?.id ?? null);
  }, []);

  const handleViewStatistics = useCallback((player) => {
    setStatisticsPlayer(player);
  }, []);

  const handleCompare = useCallback((player) => {
    if (!compareA) {
      setCompareA(player);
    } else if (!compareB && player.id !== compareA.id) {
      setCompareB(player);
      setCompareOpen(true);
    } else {
      // Reset and start fresh with this player
      setCompareA(player);
      setCompareB(null);
      setCompareOpen(false);
    }
  }, [compareA, compareB]);

  const handleCloseCompare = useCallback(() => {
    setCompareOpen(false);
    setCompareA(null);
    setCompareB(null);
  }, []);

  const handleScoutViewChange = useCallback((view) => {
    onViewChange?.(view);

    if (view !== scoutView) {
      setSelectedPlayerId(null);
      setDesktopPanelHeight(null);
    }

    if (view !== 'prospects') {
      setCompareOpen(false);
      setCompareA(null);
      setCompareB(null);
    }
  }, [onViewChange, scoutView]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let frame = 0;
    const updateDesktopPanelState = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const detailNode = detailPanelRef.current;
        syncDesktopPanelPosition(detailNode, listShellRef.current);
      });
    };

    updateDesktopPanelState();
    window.addEventListener('scroll', updateDesktopPanelState, { passive: true });
    window.addEventListener('resize', updateDesktopPanelState);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateDesktopPanelState);
      window.removeEventListener('resize', updateDesktopPanelState);
    };
  }, [selectedPlayerId]);

  useEffect(() => {
    const tick = () => setDraftScheduleNow(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const detailNode = detailPanelRef.current;
    if (!detailNode) return undefined;

    const observer = new ResizeObserver(() => {
      syncDesktopPanelPosition(detailNode, listShellRef.current);
    });

    observer.observe(detailNode);
    if (listShellRef.current) observer.observe(listShellRef.current);

    return () => observer.disconnect();
  }, [selectedPlayerId]);

  // Live draft banner — adaptive polling against the flat ESPN draft endpoint.
  // Intervals: 5 s when the OTC clock is under 30 s (catch the pick landing),
  // 15 s while the clock is comfortably running, 60 s when the draft is not live.
  useEffect(() => {
    let stopped = false;
    let timeoutId = 0;
    let controller = null;

    const clearScheduled = () => { window.clearTimeout(timeoutId); timeoutId = 0; };

    const computeNextInterval = (info) => {
      if (!info?.isDraftLive) return LIVE_DRAFT_BANNER_INTERVAL_IDLE_MS;
      if (info.hasActiveClock && info.expiresAt != null) {
        const msLeft = info.expiresAt - Date.now();
        if (msLeft <= LIVE_DRAFT_BANNER_FAST_THRESHOLD_MS) {
          return LIVE_DRAFT_BANNER_INTERVAL_FAST_MS;
        }
      }
      // Live session, between picks, or clock comfortably running — keep it snappy.
      return LIVE_DRAFT_BANNER_INTERVAL_NORMAL_MS;
    };

    const scheduleNext = (intervalMs) => {
      if (stopped || document.visibilityState !== 'visible') return;
      clearScheduled();
      timeoutId = window.setTimeout(fetchLiveDraft, intervalMs);
    };

    const fetchLiveDraft = async () => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();
      let nextInterval = LIVE_DRAFT_BANNER_INTERVAL_NORMAL_MS;
      try {
        const payload = await fetchJsonWithAbort(ESPN_LIVE_DRAFT_URL, controller.signal);
        if (stopped) return;
        const info = normalizeEspnLiveDraftPayload(payload);
        setLiveDraftInfo(info);
        // Reuse the same payload to refresh the Results list at the banner's
        // adaptive cadence (5/15/60 s) instead of the slower internal poller.
        // Safe only when both feeds point at the same ESPN endpoint.
        if (LIVE_DRAFT_RESULTS_URL === ESPN_LIVE_DRAFT_URL) {
          applyLivePayload(payload);
        }
        nextInterval = computeNextInterval(info);
      } catch (err) {
        if (stopped || err.name === 'AbortError') return;
        // Silently fail — keep previous banner state and retry on the normal cadence.
      } finally {
        scheduleNext(nextInterval);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') { fetchLiveDraft(); return; }
      clearScheduled();
      controller?.abort();
    };

    fetchLiveDraft();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopped = true;
      controller?.abort();
      clearScheduled();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [applyLivePayload]);

  const draftScheduleState = getDraftScheduleState(draftScheduleNow);
  const liveBannerInfo = liveDraftInfo ?? { isDraftLive: false, hasActiveClock: false, bestAvailable: [], bestFit: [] };

  return (
    <div className="scout-tab">
      {draftScheduleState.showBanner && (
        <ScoutLiveDraftBanner
          info={liveBannerInfo}
          scheduleState={draftScheduleState}
        />
      )}
      {scoutView === 'prospects' && (
        <>
      {/* ── Editorial header ───────────────────────────────── */}
      <ScoutPositionalSpotlight players={filtered} onSelectPlayer={handleSelectPlayer} />

      {/* ── Filter / sort toolbar ──────────────────────────── */}
      <div className="scout-toolbar">
        {/* Position chips */}
        <div className="scout-pos-chips scrollbar-hide">
          {POS_FILTERS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className="scout-chip"
              aria-pressed={posFilter === pos}
              style={posFilter === pos ? {
                background: 'var(--color-signature)',
                color: 'var(--color-signature-fg)',
              } : {
                background: 'var(--color-fill)',
                color: 'var(--color-label-secondary)',
              }}
            >
              {pos}
            </button>
          ))}
          <button
            onClick={() => setCombineOnly(prev => !prev)}
            className="scout-chip"
            aria-pressed={combineOnly}
            style={combineOnly ? {
              background: 'var(--color-accent)',
              color: '#fff',
            } : {
              background: 'var(--color-fill)',
              color: 'var(--color-label-secondary)',
            }}
            title="Only show prospects with verified combine drill results"
          >
            Combine Data
          </button>
          <button
            onClick={() => setUseTeamColors(prev => !prev)}
            className="scout-chip"
            aria-pressed={useTeamColors}
            style={useTeamColors ? {
              background: 'var(--color-accent)',
              color: '#fff',
            } : {
              background: 'var(--color-fill)',
              color: 'var(--color-label-secondary)',
            }}
            title="Tint each prospect row with the player's college team colors"
          >
            Team Colors
          </button>
        </div>

        {/* Search */}
        <div className="scout-search-wrap">
          <svg
            className="scout-search-icon"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search prospects…"
            aria-label="Search prospects"
            className="scout-search-input"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Sort */}
        <div className="scout-sort-wrap">
          <span className="scout-sort-label">Sort</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="scout-sort-select"
            aria-label="Sort prospects by"
            style={{ fontSize: '16px' }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Ranked list ────────────────────────────────────── */}
      <div ref={listShellRef} className="scout-list-shell">
        <ScoutRosterList
          players={filtered}
          selectedPlayerId={selectedScoutPlayer?.id}
          compareAId={compareA?.id}
          onSelectPlayer={handleSelectPlayer}
          onCompare={handleCompare}
          useTeamColors={useTeamColors}
        />

        {/* Desktop detail panel */}
        {selectedScoutPlayer && (
          <div
            ref={detailPanelRef}
            className="scout-detail-panel"
            style={desktopPanelHeight ? { minHeight: `${desktopPanelHeight}px` } : undefined}
          >
            <ScoutPlayerSheet
              player={selectedScoutPlayer}
              variant="panel"
              onPanelHeightChange={setDesktopPanelHeight}
              onClose={() => setSelectedPlayerId(null)}
              onCompare={handleCompare}
              compareAId={compareA?.id}
              onViewStatistics={handleViewStatistics}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {selectedScoutPlayer && (
        <ScoutPlayerSheet
          player={selectedScoutPlayer}
          variant="sheet"
          onClose={() => setSelectedPlayerId(null)}
          onCompare={handleCompare}
          compareAId={compareA?.id}
          onViewStatistics={handleViewStatistics}
        />
      )}

        </>
      )}

      {scoutView === 'picks' && (
        <ScoutPicksView />
      )}

      {scoutView === 'results' && (
        <>
          <div ref={listShellRef} className="scout-list-shell">
            <ScoutResultsView
              players={scoutPlayers}
              draftResults={draftResults}
              liveFeedState={resultsFeedState}
              selectedPlayerId={selectedScoutPlayer?.id}
              onSelectPlayer={handleSelectPlayer}
            />

            {selectedScoutPlayer && (
              <div
                ref={detailPanelRef}
                className="scout-detail-panel"
                style={desktopPanelHeight ? { minHeight: `${desktopPanelHeight}px` } : undefined}
              >
                <ScoutPlayerSheet
                  player={selectedScoutPlayer}
                  variant="panel"
                  onPanelHeightChange={setDesktopPanelHeight}
                  onClose={() => setSelectedPlayerId(null)}
                  onCompare={handleCompare}
                  compareAId={compareA?.id}
                  onViewStatistics={handleViewStatistics}
                />
              </div>
            )}
          </div>

          {selectedScoutPlayer && (
            <ScoutPlayerSheet
              player={selectedScoutPlayer}
              variant="sheet"
              onClose={() => setSelectedPlayerId(null)}
              onCompare={handleCompare}
              compareAId={compareA?.id}
              onViewStatistics={handleViewStatistics}
            />
          )}
        </>
      )}

      {statisticsPlayer && (
        <ScoutStatisticsModal
          player={statisticsPlayer}
          onClose={() => setStatisticsPlayer(null)}
        />
      )}

      {compareOpen && compareA && compareB && (
        <ScoutCompareSheet
          playerA={compareA}
          playerB={compareB}
          onClose={handleCloseCompare}
        />
      )}
    </div>
  );
}

function formatSessionStartLabel(timestamp) {
  if (timestamp == null) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp));
}

function ScoutLiveDraftBanner({ info, scheduleState }) {
  const isSessionLive = Boolean(scheduleState?.activeSession);
  const team = info.teamName ? getDraftTeamMeta(info.teamName) : null;
  const secondsLeft = useCountdown(isSessionLive ? info.expiresAt : scheduleState?.nextSession?.startAt ?? null);

  const countdownStr = formatCountdownDuration(secondsLeft);
  const countdownUrgent = isSessionLive && secondsLeft != null && secondsLeft < 60;

  const bg = team?.gradient ?? 'linear-gradient(135deg, var(--color-fill) 0%, var(--color-bg-secondary) 100%)';
  const fg = team?.textColor ?? 'var(--color-label)';
  const muted = team?.mutedColor ?? 'var(--color-label-tertiary)';
  // Three states for the pill:
  // - Session live + active clock: "Live" with pulsing dot
  // - Session live but no active clock (between picks, selection just submitted): "Pick In"
  // - Session not live (between sessions or before draft): "Paused"
  const livePillLabel = isSessionLive
    ? (info.hasActiveClock ? 'Live' : 'Pick In')
    : 'Paused';
  const countdownLabel = isSessionLive ? 'Time Remaining' : 'Next Session';
  const nextSessionLabel = scheduleState?.nextSession
    ? `${scheduleState.nextSession.label} · ${formatSessionStartLabel(scheduleState.nextSession.startAt)} ET`
    : null;

  return (
    <div className="scout-live-banner" style={{ background: bg, color: fg }}>
      {team?.logoUrl && (
        <img
          src={team.logoUrl}
          alt=""
          className="scout-live-banner-watermark"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="scout-live-banner-inner">
        {/* Left: live pill + team logo + pick info */}
        <div className="scout-live-banner-left">
          <span className="scout-live-pill">
            {isSessionLive && info.hasActiveClock && <span className="scout-live-dot" />}
            {livePillLabel}
          </span>
          {team?.logoUrl && (
            <img
              src={team.logoUrl}
              alt=""
              className="scout-live-banner-logo"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="scout-live-banner-pick-info">
            <span className="scout-live-banner-otc" style={{ color: muted }}>
              {isSessionLive ? 'On the Clock' : 'Draft Status'}
            </span>
            <span className="scout-live-banner-team">
              {isSessionLive ? (info.teamName ?? 'Awaiting pick') : (scheduleState?.activeSession?.label ?? 'Draft paused')}
            </span>
            {isSessionLive && (info.round != null || info.overall != null) && (
              <span className="scout-live-banner-slot" style={{ color: muted }}>
                {[
                  info.round != null ? `Round ${info.round}` : null,
                  info.overall != null ? `Pick #${info.overall}` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Right: countdown + best available */}
        <div className="scout-live-banner-right">
          {countdownStr != null && (
            <div className="scout-live-countdown">
              <span className="scout-live-countdown-label" style={{ color: muted }}>{countdownLabel}</span>
              <span
                className="scout-live-countdown-time"
                style={{ color: countdownUrgent ? '#ef4444' : fg }}
              >
                {countdownStr}
              </span>
            </div>
          )}
          {!isSessionLive && nextSessionLabel && (
            <div className="scout-live-best">
              <span className="scout-live-best-label" style={{ color: muted }}>Upcoming</span>
              <div className="scout-live-best-list">
                <span className="scout-live-best-item">{nextSessionLabel}</span>
              </div>
            </div>
          )}
          {isSessionLive && info.bestAvailable.length > 0 && (
            <div className="scout-live-best">
              <span className="scout-live-best-label" style={{ color: muted }}>Best Available</span>
              <div className="scout-live-best-list">
                {info.bestAvailable.map((p, i) => (
                  <span key={i} className="scout-live-best-item">
                    {p.position && (
                      <span className="scout-live-best-pos" style={{ color: muted }}>{p.position}</span>
                    )}
                    <span>{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoutPicksView() {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [roundFilter, setRoundFilter] = useState('Remaining');
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const [draftPicks, setDraftPicks] = useState(DRAFT_PICKS_2026);
  const [liveFeedState, setLiveFeedState] = useState({
    enabled: Boolean(LIVE_DRAFT_PICKS_URL),
    status: LIVE_DRAFT_PICKS_URL ? 'loading' : 'static',
    updatedAt: null,
    error: null,
  });
  const teamFilterRef = useRef(null);
  const selectedTeamSet = new Set(selectedTeams);
  const draftRounds = groupDraftPicks(draftPicks);
  const filteredRounds = (roundFilter === 'All' || roundFilter === 'Remaining'
    ? draftRounds
    : draftRounds.filter(({ round }) => round === roundFilter))
    .map(({ round, picks }) => ({
      round,
      // Apply Remaining filter (no playerName means the slot hasn't been
      // selected yet) and team filter. Both are AND'd together.
      picks: picks.filter(pick => {
        if (roundFilter === 'Remaining' && pick.playerName) return false;
        if (selectedTeams.length > 0 && !selectedTeamSet.has(pick.teamName)) return false;
        return true;
      }),
    }))
    .filter(({ picks }) => picks.length > 0);

  useEffect(() => {
    if (!teamFilterOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!teamFilterRef.current?.contains(event.target)) {
        setTeamFilterOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
	  }, [teamFilterOpen]);

	  useEffect(() => {
	    if (!LIVE_DRAFT_PICKS_URL) return undefined;

	    let stopped = false;
	    let timeoutId = 0;
	    let controller = null;
    const intervalMs = Math.max(15_000, LIVE_DRAFT_PICKS_INTERVAL_MS);

    const clearScheduledLoad = () => {
      window.clearTimeout(timeoutId);
      timeoutId = 0;
    };

    const scheduleNextLoad = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      clearScheduledLoad();
      timeoutId = window.setTimeout(loadLivePicks, intervalMs);
    };

	    const loadLivePicks = async () => {
      if (document.visibilityState !== 'visible') return;
	      controller?.abort();
	      controller = new AbortController();

      try {
        setLiveFeedState(prev => ({ ...prev, status: prev.updatedAt ? 'refreshing' : 'loading', error: null }));
        const response = await fetch(LIVE_DRAFT_PICKS_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();
        const nextPicks = normalizeDraftPicksPayload(payload);
        if (nextPicks.length === 0) throw new Error('No picks in live feed');
        if (stopped) return;

        setDraftPicks(nextPicks);
        setLiveFeedState({
          enabled: true,
          status: 'live',
          updatedAt: new Date().toISOString(),
          error: null,
        });
      } catch (error) {
        if (stopped || error.name === 'AbortError') return;
        setLiveFeedState(prev => ({
          ...prev,
          status: prev.updatedAt ? 'stale' : 'fallback',
          error: error.message,
        }));
	      } finally {
	        scheduleNextLoad();
	      }
	    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadLivePicks();
        return;
      }

      clearScheduledLoad();
      controller?.abort();
    };

	    loadLivePicks();
    document.addEventListener('visibilitychange', handleVisibilityChange);

	    return () => {
	      stopped = true;
	      controller?.abort();
	      clearScheduledLoad();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
	    };
	  }, []);

  const toggleTeamFilter = useCallback((teamName) => {
    setSelectedTeams(prev => (
      prev.includes(teamName)
        ? prev.filter(name => name !== teamName)
        : [...prev, teamName]
    ));
  }, []);

  const teamFilterLabel = selectedTeams.length === 0
    ? 'All Teams'
    : `${selectedTeams.length} Teams`;

  return (
    <div className="scout-picks-view">
      <div className="scout-view-header">
        <h2 className="scout-view-title">2026 Draft Picks</h2>
        <ScoutPicksFeedStatus state={liveFeedState} />
      </div>
      <div className="scout-pick-filter-bar">
        <div className="scout-pick-round-filters" aria-label="Filter picks by round">
          {PICK_ROUND_FILTERS.map(round => (
            <button
              key={round}
              type="button"
              className="scout-round-chip"
              aria-pressed={roundFilter === round}
              onClick={() => setRoundFilter(round)}
            >
              {typeof round === 'number' ? `Round ${round}` : round}
            </button>
          ))}
        </div>
        <div className="scout-team-filter" ref={teamFilterRef}>
          <button
            type="button"
            className="scout-team-filter-button"
            aria-expanded={teamFilterOpen}
            onClick={() => setTeamFilterOpen(prev => !prev)}
          >
            <span>{teamFilterLabel}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {teamFilterOpen && (
            <div className="scout-team-filter-menu">
              <div className="scout-team-filter-menu-head">
                <span>Teams</span>
                {selectedTeams.length > 0 && (
                  <button type="button" onClick={() => setSelectedTeams([])}>
                    Clear
                  </button>
                )}
              </div>
              <div className="scout-team-filter-options">
                {DRAFT_TEAM_OPTIONS.map(teamName => (
                  <label key={teamName} className="scout-team-filter-option">
                    <input
                      type="checkbox"
                      checked={selectedTeamSet.has(teamName)}
                      onChange={() => toggleTeamFilter(teamName)}
                    />
                    <span>{teamName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {filteredRounds.length > 0 ? (
        <div className="scout-round-grid">
          {filteredRounds.map(({ round, picks }) => (
          <section key={round} className="scout-round-card">
            <div className="scout-round-header">
              <span>Round {round}</span>
              <span>{picks.length} picks</span>
            </div>
            <div className="scout-pick-list">
              {picks.map(pick => (
                  <ScoutPickRow
                    key={pick.overall}
                    pick={pick}
                    teamRemainingCount={getTeamRemainingFromHere(draftPicks, pick)}
                    onClick={() => setSelectedTeam(pick.teamName)}
                  />
              ))}
            </div>
          </section>
          ))}
        </div>
      ) : (
        <div className="scout-empty">No picks match the selected filters.</div>
      )}
      {selectedTeam && (
        <ScoutTeamPicksDialog
          teamName={selectedTeam}
          picks={getTeamPicks(draftPicks, selectedTeam)}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
}

function ScoutPicksFeedStatus({ state }) {
  if (!state.enabled) {
    return (
      <a className="scout-source-link" href={DRAFT_ORDER_SOURCE_2026} target="_blank" rel="noreferrer">
        Static NFL.com order
      </a>
    );
  }

  const updatedLabel = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const label = state.status === 'live'
    ? `Live feed · ${updatedLabel}`
    : state.status === 'refreshing'
      ? `Refreshing · ${updatedLabel}`
      : state.status === 'stale'
        ? `Live feed stale · ${updatedLabel}`
        : state.status === 'fallback'
          ? 'Using static fallback'
          : 'Loading live feed';

  return (
    <span className="scout-results-count" title={state.error ? `Live feed error: ${state.error}` : undefined}>
      {label}
    </span>
  );
}

function ScoutPickRow({ pick, teamRemainingCount, onClick }) {
  const team = getDraftTeamMeta(pick.teamName);

  return (
    <button
      type="button"
      className="scout-pick-row"
      onClick={onClick}
      style={{
        '--scout-pick-bg': team.gradient,
        '--scout-pick-fg': team.textColor,
        '--scout-pick-muted': team.mutedColor,
      }}
    >
      <span className="scout-pick-logo-wrap">
        {team.logoUrl && (
          <img
            src={team.logoUrl}
            alt=""
            className="scout-pick-logo"
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        )}
      </span>
      <span className="scout-pick-main">
        <span className="scout-pick-team-line">
          <span className="scout-pick-team">{pick.teamName}</span>
          <span className="scout-pick-count">
            {teamRemainingCount} {teamRemainingCount === 1 ? 'pick remaining' : 'picks remaining'}
          </span>
        </span>
        {pick.note && <span className="scout-pick-meta">{pick.note}</span>}
      </span>
      <span className="scout-pick-overall">#{pick.overall}</span>
    </button>
  );
}

function ScoutTeamPicksDialog({ teamName, picks, onClose }) {
  useBodyScrollLock();

  const team = getDraftTeamMeta(teamName);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="scout-team-picks-overlay" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${teamName} draft picks`}
        className="scout-team-picks-dialog"
        onClick={event => event.stopPropagation()}
      >
        <div className="scout-sheet-handle-row scout-team-picks-handle">
          <div className="scout-sheet-handle" />
        </div>
        <div
          className="scout-team-picks-hero"
          style={{
            '--scout-team-picks-bg': team.gradient,
            '--scout-team-picks-fg': team.textColor,
            '--scout-team-picks-muted': team.mutedColor,
          }}
        >
          {team.logoUrl && (
            <img
              src={team.logoUrl}
              alt=""
              className="scout-team-picks-watermark"
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="scout-team-picks-id">
            <span className="scout-team-picks-logo-wrap">
              {team.logoUrl && (
                <img
                  src={team.logoUrl}
                  alt=""
                  className="scout-team-picks-logo"
                  onError={event => { event.currentTarget.style.display = 'none'; }}
                />
              )}
            </span>
            <div className="scout-team-picks-title-wrap">
              <h3 className="scout-team-picks-title">{teamName}</h3>
              <p className="scout-team-picks-subtitle">{picks.length} 2026 draft picks</p>
            </div>
          </div>
          <button type="button" className="scout-team-picks-close" onClick={onClose} aria-label="Close team picks">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="scout-team-picks-body">
          <div className="scout-team-picks-list">
            {picks.map(pick => (
              <div key={pick.overall} className="scout-team-pick-item">
                <div>
                  <div className="scout-team-pick-primary">Round {pick.round} · Pick #{pick.overall}</div>
                  <div className="scout-team-pick-secondary">{pick.note || 'Original team pick'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const RESULTS_SORT_OPTIONS = [
  { value: 'topPicks', label: 'Top Picks' },
  { value: 'mostRecent', label: 'Most Recent' },
];

function ScoutResultsView({ players, draftResults, liveFeedState, selectedPlayerId, onSelectPlayer }) {
  const [sortOrder, setSortOrder] = useState('topPicks');
  const [posFilter, setPosFilter] = useState('All');
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const teamFilterRef = useRef(null);
  const filterRailRef = useRef(null);
  const [filterScrollCue, setFilterScrollCue] = useState({ left: false, right: false });

  const mergedResults = mergeDraftResultsWithPlayers(draftResults, players);
  const selectedTeamSet = new Set(selectedTeams);
  // Apply position + team filters first so the displayed list reflects the
  // active selection before the sort/reverse step.
  const filteredResults = mergedResults.filter(result => {
    if (selectedTeams.length > 0 && !selectedTeamSet.has(result.teamName)) return false;
    if (posFilter === 'All') return true;
    const group = result.player?.positionGroup ?? result.position;
    if (posFilter === 'Offense') return OFFENSE_POSITION_GROUPS.has(group);
    if (posFilter === 'Defense') return DEFENSE_POSITION_GROUPS.has(group);
    return group === posFilter;
  });
  // Source data arrives sorted ascending by overall (Pick #1 first). For "Most Recent"
  // we reverse so the latest pick is at the top — better for live viewing during the draft.
  const orderedResults = sortOrder === 'mostRecent'
    ? [...filteredResults].reverse()
    : filteredResults;

  useEffect(() => {
    if (!teamFilterOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!teamFilterRef.current?.contains(event.target)) {
        setTeamFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [teamFilterOpen]);

  const updateFilterScrollCue = useCallback(() => {
    const el = filterRailRef.current;
    if (!el) return;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = {
      left: maxScrollLeft > 1 && el.scrollLeft > 1,
      right: maxScrollLeft > 1 && el.scrollLeft < maxScrollLeft - 1,
    };
    setFilterScrollCue(prev => (
      prev.left === next.left && prev.right === next.right ? prev : next
    ));
  }, []);

  useEffect(() => {
    const el = filterRailRef.current;
    if (!el || mergedResults.length === 0) return undefined;

    const frame = window.requestAnimationFrame(updateFilterScrollCue);
    const handleScroll = () => updateFilterScrollCue();
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateFilterScrollCue);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterScrollCue);
      resizeObserver.observe(el);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateFilterScrollCue);
      resizeObserver?.disconnect();
    };
  }, [mergedResults.length, updateFilterScrollCue]);

  const toggleTeamFilter = useCallback((teamName) => {
    setSelectedTeams(prev => (
      prev.includes(teamName)
        ? prev.filter(name => name !== teamName)
        : [...prev, teamName]
    ));
  }, []);

  const teamFilterLabel = selectedTeams.length === 0
    ? 'All Teams'
    : selectedTeams.length === 1
      ? selectedTeams[0]
      : `${selectedTeams.length} Teams`;

  return (
    <div className="scout-results-view">
      <div className="scout-view-header">
        <h2 className="scout-view-title">Draft Results</h2>
        <ScoutDraftResultsFeedStatus state={liveFeedState} count={mergedResults.length} />
      </div>
      {mergedResults.length > 0 && (
        <div className="scout-results-filter-row scout-results-filter-row--chips">
          <span className="scout-results-filter-row-label">Filter</span>
          <div ref={filterRailRef} className="scout-pick-round-filters scout-results-chip-rail" role="group" aria-label="Filter draft results by position">
            {POS_FILTERS.map(pos => {
              const active = posFilter === pos;
              const isPositionGroup = pos !== 'All' && pos !== 'Offense' && pos !== 'Defense';
              const activeBg = isPositionGroup
                ? positionColor(pos, pos)
                : 'var(--color-signature)';
              const activeFg = isPositionGroup
                ? '#fff'
                : 'var(--color-signature-fg)';
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosFilter(pos)}
                  className="scout-round-chip"
                  aria-pressed={active}
                  style={active ? {
                    background: activeBg,
                    color: activeFg,
                  } : undefined}
                >
                  {pos}
                </button>
              );
            })}
          </div>
          {filterScrollCue.left && <span className="scout-results-scroll-cue scout-results-scroll-cue--left" aria-hidden="true" />}
          {filterScrollCue.right && <span className="scout-results-scroll-cue scout-results-scroll-cue--right" aria-hidden="true" />}
        </div>
      )}
      {mergedResults.length > 0 && (
        <div className="scout-results-filter-row scout-results-filter-row--sort">
          <span className="scout-results-filter-row-label">Sort</span>
          <div className="scout-pick-round-filters scout-results-sort-options" role="tablist" aria-label="Sort draft results">
            {RESULTS_SORT_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={sortOrder === option.value}
                className="scout-round-chip"
                aria-pressed={sortOrder === option.value}
                onClick={() => setSortOrder(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="scout-team-filter" ref={teamFilterRef}>
            <button
              type="button"
              className="scout-team-filter-button"
              aria-expanded={teamFilterOpen}
              onClick={() => setTeamFilterOpen(prev => !prev)}
            >
              <span>{teamFilterLabel}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {teamFilterOpen && (
              <div className="scout-team-filter-menu">
                <div className="scout-team-filter-menu-head">
                  <span>Teams</span>
                  {selectedTeams.length > 0 && (
                    <button type="button" onClick={() => setSelectedTeams([])}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="scout-team-filter-options">
                  {DRAFT_TEAM_OPTIONS.map(teamName => (
                    <label key={teamName} className="scout-team-filter-option">
                      <input
                        type="checkbox"
                        checked={selectedTeamSet.has(teamName)}
                        onChange={() => toggleTeamFilter(teamName)}
                      />
                      <span>{teamName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {orderedResults.length > 0 ? (
        <div className="scout-results-list">
          {orderedResults.map(result => (
            <ScoutResultRow
              key={result.overall}
              result={result}
              isSelected={result.player?.id === selectedPlayerId}
              onSelectPlayer={onSelectPlayer}
            />
          ))}
        </div>
      ) : (
        <div className="scout-empty">
          {mergedResults.length === 0
            ? 'Draft results will populate here as picks are entered into the live feed or rookie dataset.'
            : 'No picks match the active filters.'}
        </div>
      )}
    </div>
  );
}

function ScoutDraftResultsFeedStatus({ state, count }) {
  if (!state.enabled) {
    return <span className="scout-results-count">{count} picks logged · Static results</span>;
  }

  const updatedLabel = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const label = state.status === 'live'
    ? `${count} picks · Live feed · ${updatedLabel}`
    : state.status === 'refreshing'
      ? `${count} picks · Refreshing · ${updatedLabel}`
      : state.status === 'stale'
        ? `${count} picks · Live feed stale · ${updatedLabel}`
        : state.status === 'fallback'
          ? `${count} picks · Static fallback`
          : 'Loading live results';

  return (
    <span className="scout-results-count" title={state.error ? `Live results feed error: ${state.error}` : undefined}>
      {label}
    </span>
  );
}

function ScoutResultRow({ result, isSelected, onSelectPlayer }) {
  const team = getDraftTeamMeta(result.teamName);
  const player = result.player;

  return (
    <button
      type="button"
      className={`scout-result-row${isSelected ? ' is-selected' : ''}`}
      onClick={() => player && onSelectPlayer?.(player)}
      disabled={!player}
      style={{
        '--scout-pick-bg': team.gradient,
        '--scout-pick-fg': team.textColor,
        '--scout-pick-muted': team.mutedColor,
      }}
    >
      <span className="scout-result-photo-wrap">
        {player ? (
          <img
            src={playerPhotoUrl(player)}
            alt=""
            className="scout-result-photo"
            onError={photoFallback}
          />
        ) : team.logoUrl && (
          <img
            src={team.logoUrl}
            alt=""
            className="scout-result-photo"
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        )}
      </span>
      <span className="scout-pick-main">
        <span className="scout-pick-team-line">
          <span className="scout-result-player">{result.playerName}</span>
          <span
            className="scout-result-position"
            style={{ background: positionColor(result.position, player?.positionGroup) }}
            aria-label={`Position ${result.position ?? 'unknown'}`}
          >
            {result.position ?? '—'}
          </span>
        </span>
        <span className="scout-pick-meta">
          {nflLogoUrl(result.team || result.teamName) && (
            <img
              src={nflLogoUrl(result.team || result.teamName)}
              alt=""
              className="scout-inline-logo"
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}
          <span className="scout-pick-meta-text">{result.teamName}</span>
          <span className="scout-pick-meta-sep">·</span>
          {collegeLogoUrl(result.college) && (
            <img
              src={collegeLogoUrl(result.college)}
              alt=""
              className="scout-inline-logo"
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}
          <span className="scout-pick-meta-text">{result.college ?? 'College'}</span>
        </span>
      </span>
      <span className="scout-pick-overall">Pick #{result.overall}</span>
    </button>
  );
}
