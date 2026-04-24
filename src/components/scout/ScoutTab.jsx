import { useState, useCallback, useEffect, useRef } from 'react';
import { ROOKIES_2026 } from '../../data/rookies';
import { DRAFT_ORDER_SOURCE_2026, DRAFT_PICKS_2026 } from '../../data/draftPicks';
import { DRAFT_RESULTS_2026, DRAFT_RESULTS_SOURCE_2026 } from '../../data/draftResults';
import { TEAM_NAMES, getTeamPalette } from '../../data/teamColors';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import { FANTASY_POSITION_GROUPS, hasCombineData } from './scoutUtils';
import ScoutPositionalSpotlight from './ScoutPositionalSpotlight';
import ScoutRosterList from './ScoutRosterList';
import ScoutPlayerSheet from './ScoutPlayerSheet';
import ScoutCompareSheet from './ScoutCompareSheet';

const SORT_OPTIONS = [
  { value: 'projectedOverall', label: 'Projected Pick' },
  { value: 'bigBoardRank', label: 'Prospect Rank' },
  { value: 'nflGrade',     label: 'NFL Grade' },
  { value: 'dynastyAdp',   label: 'Dynasty ADP' },
  { value: 'fortyYard',    label: '40-Yard Dash' },
  { value: 'rushYards',    label: 'Rush Yards' },
  { value: 'recYards',     label: 'Rec Yards' },
];

const POS_FILTERS = ['All', 'Fantasy', 'QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'OL', 'ST'];
const SCOUT_VIEWS = [
  { value: 'prospects', label: 'Prospects' },
  { value: 'picks', label: 'Picks' },
  { value: 'results', label: 'Results' },
];
const PICK_ROUND_FILTERS = ['All', 1, 2, 3, 4, 5, 6, 7];
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
// Single flat endpoint for picks, results, and the banner — CORS-open, real-time
const ESPN_LIVE_DRAFT_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft';
const LIVE_DRAFT_PICKS_URL = import.meta.env?.VITE_SCOUT_DRAFT_PICKS_URL?.trim() || ESPN_LIVE_DRAFT_URL;
const LIVE_DRAFT_PICKS_INTERVAL_MS = Number(import.meta.env?.VITE_SCOUT_DRAFT_PICKS_INTERVAL_MS ?? 60_000);
const USE_ESPN_DRAFT_RESULTS = import.meta.env?.VITE_SCOUT_USE_ESPN_DRAFT_RESULTS !== 'false';
const LIVE_DRAFT_RESULTS_URL = import.meta.env?.VITE_SCOUT_DRAFT_RESULTS_URL?.trim()
  || (USE_ESPN_DRAFT_RESULTS ? ESPN_LIVE_DRAFT_URL : '');
const LIVE_DRAFT_RESULTS_INTERVAL_MS = Number(import.meta.env?.VITE_SCOUT_DRAFT_RESULTS_INTERVAL_MS ?? 30_000);
const LIVE_DRAFT_BANNER_INTERVAL_MS = 60_000;

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

function normalizeDraftPicksPayload(payload) {
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
    team: firstString(pick?.team?.abbreviation, pick?.franchise?.abbreviation) || null,
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

function mergeDraftResultsWithPlayers(results, players) {
  const playerById = new Map(players.map(player => [player.id, player]));
  const playerByName = new Map(players.map(player => [normalizeNameKey(player.name), player]));

  return results.map(result => {
    const player = (result.playerId && playerById.get(result.playerId))
      || playerByName.get(normalizeNameKey(result.playerName));

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

function sortRookies(rookies, sortKey) {
  return [...rookies].sort((a, b) => {
    switch (sortKey) {
      case 'fortyYard':
        return compareAscNullLast(a.combine?.fortyYard, b.combine?.fortyYard);
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
  const [search, setSearch]       = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [compareA, setCompareA]   = useState(null);
  const [compareB, setCompareB]   = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [desktopPanelHeight, setDesktopPanelHeight] = useState(null);
  const listShellRef = useRef(null);
  const detailPanelRef = useRef(null);
  const [liveDraftInfo, setLiveDraftInfo] = useState(null);

  // Ranked on full sorted list before filter (per AGENTS.md gotcha)
  const sorted = sortRookies(ROOKIES_2026, sortKey).map((r, i) => ({ ...r, rank: i + 1 }));

  const filtered = sorted.filter(r => {
    if (posFilter === 'Fantasy' && !FANTASY_POSITION_GROUPS.has(r.positionGroup)) return false;
    if (posFilter !== 'All' && posFilter !== 'Fantasy' && r.positionGroup !== posFilter) return false;
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
    setSelectedPlayer(player);
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

    if (view !== 'prospects') {
      setSelectedPlayer(null);
      setCompareOpen(false);
      setCompareA(null);
      setCompareB(null);
      setDesktopPanelHeight(null);
    }
  }, [onViewChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let frame = 0;
    const updateDesktopPanelState = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const detailNode = detailPanelRef.current;
        if (!detailNode) return;

        if (window.innerWidth < 1024) {
          detailNode.style.removeProperty('--scout-panel-top');
          detailNode.style.removeProperty('--scout-panel-left');
          detailNode.style.removeProperty('--scout-panel-width');
          return;
        }

        const listShellTop = listShellRef.current?.getBoundingClientRect().top ?? 80;
        const detailRect = detailNode.getBoundingClientRect();
        detailNode.style.setProperty('--scout-panel-top', `${Math.max(80, Math.round(listShellTop))}px`);
        detailNode.style.setProperty('--scout-panel-left', `${Math.round(detailRect.left)}px`);
        detailNode.style.setProperty('--scout-panel-width', `${Math.round(detailRect.width)}px`);
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
  }, [selectedPlayer]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const detailNode = detailPanelRef.current;
    if (!detailNode) return undefined;

    const observer = new ResizeObserver(() => {
      if (window.innerWidth < 1024) {
        return;
      }
      const listShellTop = listShellRef.current?.getBoundingClientRect().top ?? 80;
      const detailRect = detailNode.getBoundingClientRect();
      detailNode.style.setProperty('--scout-panel-top', `${Math.max(80, Math.round(listShellTop))}px`);
      detailNode.style.setProperty('--scout-panel-left', `${Math.round(detailRect.left)}px`);
      detailNode.style.setProperty('--scout-panel-width', `${Math.round(detailRect.width)}px`);
    });

    observer.observe(detailNode);
    if (listShellRef.current) observer.observe(listShellRef.current);

    return () => observer.disconnect();
  }, [selectedPlayer]);

  // Live draft banner — polls the flat ESPN draft endpoint every 60 s
  useEffect(() => {
    let stopped = false;
    let timeoutId = 0;
    let controller = null;

    const clearScheduled = () => { window.clearTimeout(timeoutId); timeoutId = 0; };

    const scheduleNext = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      clearScheduled();
      timeoutId = window.setTimeout(fetchLiveDraft, LIVE_DRAFT_BANNER_INTERVAL_MS);
    };

    const fetchLiveDraft = async () => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();
      try {
        const payload = await fetchJsonWithAbort(ESPN_LIVE_DRAFT_URL, controller.signal);
        if (stopped) return;
        setLiveDraftInfo(normalizeEspnLiveDraftPayload(payload));
      } catch (err) {
        if (stopped || err.name === 'AbortError') return;
        // Silently fail — keep previous banner state
      } finally {
        scheduleNext();
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
  }, []);

  return (
    <div className="scout-tab">
      {liveDraftInfo?.isDraftLive && <ScoutLiveDraftBanner info={liveDraftInfo} />}
      <div className="scout-view-tabs" role="tablist" aria-label="Scout views">
        {SCOUT_VIEWS.map(item => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={scoutView === item.value}
            className="scout-view-tab"
            onClick={() => handleScoutViewChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {scoutView === 'prospects' && (
        <>
      {/* ── Editorial header ───────────────────────────────── */}
      <ScoutPositionalSpotlight players={sorted} onSelectPlayer={handleSelectPlayer} />

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
          selectedPlayerId={selectedPlayer?.id}
          compareAId={compareA?.id}
          onSelectPlayer={handleSelectPlayer}
          onCompare={handleCompare}
        />

        {/* Desktop detail panel */}
        {selectedPlayer && (
          <div
            ref={detailPanelRef}
            className="scout-detail-panel"
            style={desktopPanelHeight ? { minHeight: `${desktopPanelHeight}px` } : undefined}
          >
            <ScoutPlayerSheet
              player={selectedPlayer}
              variant="panel"
              onPanelHeightChange={setDesktopPanelHeight}
              onClose={() => setSelectedPlayer(null)}
              onCompare={handleCompare}
              compareAId={compareA?.id}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {selectedPlayer && (
        <ScoutPlayerSheet
          player={selectedPlayer}
          variant="sheet"
          onClose={() => setSelectedPlayer(null)}
          onCompare={handleCompare}
          compareAId={compareA?.id}
        />
      )}

      {/* Compare overlay */}
      {compareOpen && compareA && compareB && (
        <ScoutCompareSheet
          playerA={compareA}
          playerB={compareB}
          onClose={handleCloseCompare}
        />
      )}
        </>
      )}

      {scoutView === 'picks' && (
        <ScoutPicksView />
      )}

      {scoutView === 'results' && (
        <ScoutResultsView players={ROOKIES_2026} />
      )}
    </div>
  );
}

function ScoutLiveDraftBanner({ info }) {
  const team = info.teamName ? getDraftTeamMeta(info.teamName) : null;
  const secondsLeft = useCountdown(info.expiresAt);

  const mins = secondsLeft != null ? Math.floor(secondsLeft / 60) : null;
  const secs = secondsLeft != null ? secondsLeft % 60 : null;
  const countdownStr = secondsLeft != null
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : null;
  const countdownUrgent = secondsLeft != null && secondsLeft < 60;

  const bg = team?.gradient ?? 'linear-gradient(135deg, var(--color-fill) 0%, var(--color-bg-secondary) 100%)';
  const fg = team?.textColor ?? 'var(--color-label)';
  const muted = team?.mutedColor ?? 'var(--color-label-tertiary)';

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
          <span className="scout-live-pill">● Live</span>
          {team?.logoUrl && (
            <img
              src={team.logoUrl}
              alt=""
              className="scout-live-banner-logo"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="scout-live-banner-pick-info">
            <span className="scout-live-banner-otc" style={{ color: muted }}>On the Clock</span>
            <span className="scout-live-banner-team">{info.teamName ?? '—'}</span>
            {(info.round != null || info.overall != null) && (
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
              <span className="scout-live-countdown-label" style={{ color: muted }}>Time Remaining</span>
              <span
                className="scout-live-countdown-time"
                style={{ color: countdownUrgent ? '#ef4444' : fg }}
              >
                {countdownStr}
              </span>
            </div>
          )}
          {info.bestAvailable.length > 0 && (
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
  const [roundFilter, setRoundFilter] = useState('All');
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
  const filteredRounds = (roundFilter === 'All'
    ? draftRounds
    : draftRounds.filter(({ round }) => round === roundFilter))
    .map(({ round, picks }) => ({
      round,
      picks: selectedTeams.length === 0
        ? picks
        : picks.filter(pick => selectedTeamSet.has(pick.teamName)),
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
              {round === 'All' ? 'All' : `Round ${round}`}
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
                    teamPickCount={getTeamPicks(draftPicks, pick.teamName).length}
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

function ScoutPickRow({ pick, teamPickCount, onClick }) {
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
          <span className="scout-pick-count">{teamPickCount} picks</span>
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

function ScoutResultsView({ players }) {
  const staticResults = DRAFT_RESULTS_2026.length > 0
    ? DRAFT_RESULTS_2026
    : players
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
  const [draftResults, setDraftResults] = useState(staticResults);
  const [liveFeedState, setLiveFeedState] = useState({
    enabled: Boolean(LIVE_DRAFT_RESULTS_URL),
    status: LIVE_DRAFT_RESULTS_URL ? 'loading' : 'static',
    updatedAt: null,
    error: null,
  });
  const mergedResults = mergeDraftResultsWithPlayers(draftResults, players);

  useEffect(() => {
    if (!LIVE_DRAFT_RESULTS_URL) return undefined;

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
        const nextResults = normalizeDraftResultsPayload(payload);
        if (nextResults.length === 0) throw new Error('No results in live feed');
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
  }, []);

  return (
    <div className="scout-results-view">
      <div className="scout-view-header">
        <h2 className="scout-view-title">Draft Results</h2>
        <ScoutDraftResultsFeedStatus state={liveFeedState} count={mergedResults.length} />
      </div>
      {mergedResults.length > 0 ? (
        <div className="scout-results-list">
          {mergedResults.map(result => (
            <ScoutResultRow key={result.overall} result={result} />
          ))}
        </div>
      ) : (
        <div className="scout-empty">
          Draft results will populate here as picks are entered into the live feed or rookie dataset.
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

function ScoutResultRow({ result }) {
  const team = getDraftTeamMeta(result.teamName);

  return (
    <div
      className="scout-result-row"
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
          <span className="scout-result-player">{result.playerName}</span>
          <span className="scout-pick-count">Pick #{result.overall}</span>
        </span>
        <span className="scout-pick-meta">
          {result.teamName} · {result.position ?? 'POS'} · {result.college ?? 'College'}
        </span>
      </span>
      <span className="scout-pick-overall">#{result.overall}</span>
    </div>
  );
}
