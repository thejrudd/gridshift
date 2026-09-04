const SITE_NAME = 'GridShift';
const DEFAULT_SEASON = 2026;
const SHARE_IMAGE_PATH = '/icons/pwa-512x512.png';
const PAGE_SHARE_METADATA_START = '<!-- gridshift-page-share:start -->';
const PAGE_SHARE_METADATA_END = '<!-- gridshift-page-share:end -->';

const COMPANION_TITLES = {
  rosters: 'Fantasy Rosters',
  rankings: 'Fantasy Rankings',
  live: 'Fantasy Live',
  matchups: 'Fantasy Matchups',
  waivers: 'Fantasy Waivers',
  heatmap: 'Fantasy Heatmap',
  defenses: 'Fantasy Defense',
  scoring: 'Fantasy Scoring',
};

const COMPANION_DESCRIPTIONS = {
  rosters: 'View your fantasy rosters and weekly player output.',
  rankings: 'Compare fantasy players with league-aware rankings.',
  live: 'Follow live fantasy scoring and game-day momentum.',
  matchups: 'Review fantasy matchups, starters, and scoring detail.',
  waivers: 'Find waiver options and compare available players.',
  heatmap: 'Explore fantasy production across teams, weeks, and positions.',
  defenses: 'Compare opposing defenses by player and position.',
  scoring: 'Review the scoring system behind your fantasy league.',
};

const TAB_DESCRIPTIONS = {
  predictions: 'Make and share your call on the 2026 NFL season.',
  league: 'Review league standings, history, and activity.',
  statistics: 'Explore NFL player, team, schedule, and game statistics.',
  trade: 'Build and evaluate fantasy trade ideas.',
  scout: 'Explore rookie prospects, draft picks, and results.',
  draft: 'Prepare for a fantasy draft with live picks and player tiers.',
};

function normalizedSeason(season) {
  const value = Number(season);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SEASON;
}

function findTeam(teams, teamId) {
  const normalizedId = String(teamId ?? '').trim().toUpperCase();
  if (!normalizedId) return null;
  return (teams ?? []).find((team) => String(team?.id ?? '').toUpperCase() === normalizedId) ?? null;
}

function teamLabel(teams, teamId) {
  const team = findTeam(teams, teamId);
  return team?.name ?? team?.nickname ?? (String(teamId ?? '').trim().toUpperCase() || 'team');
}

function titleFromSlug(slug) {
  const value = String(slug ?? '').trim();
  if (!value) return 'Player';
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getPlayerLabel(route, playerMeta) {
  return playerMeta?.displayName || titleFromSlug(route?.statisticsPlayerSlug) || 'Player';
}

export function getPageShareMetadata({ route = {}, season = DEFAULT_SEASON, teams = [], playerMeta = null } = {}) {
  const year = normalizedSeason(season);
  let title = `${year} NFL Season`;
  let description = 'Explore the NFL season in GridShift.';

  if (route.activeTab === 'predictions') {
    const view = route.seasonView ?? 'predictions';
    const viewTitle = {
      predictions: 'NFL Predictions',
      playoffs: 'NFL Playoff Bracket',
    }[view] ?? 'NFL Predictions';
    const selectedTeam = route.predictionsTeamId ? teamLabel(teams, route.predictionsTeamId) : '';
    title = selectedTeam ? `${year} ${selectedTeam} Prediction` : `${year} ${viewTitle}`;
    description = selectedTeam
      ? `See the ${selectedTeam} forecast and season path.`
      : TAB_DESCRIPTIONS.predictions;
  } else if (route.activeTab === 'fantasy') {
    const view = route.companionView ?? 'rosters';
    title = `${COMPANION_TITLES[view] ?? 'Fantasy'} · ${year}`;
    description = COMPANION_DESCRIPTIONS[view] ?? 'Explore your fantasy league in GridShift.';
  } else if (route.activeTab === 'league') {
    const viewTitle = {
      standings: 'League Standings',
      history: 'League History',
      activity: 'League Activity',
    }[route.leagueView] ?? 'League';
    title = `${viewTitle} · ${year}`;
    description = TAB_DESCRIPTIONS.league;
  } else if (route.activeTab === 'statistics') {
    const view = route.statisticsView ?? 'browser';
    if (view === 'player') {
      title = `${getPlayerLabel(route, playerMeta)} · NFL Stats`;
      description = `Review ${getPlayerLabel(route, playerMeta)}'s NFL and fantasy statistics.`;
    } else if (view === 'team') {
      const team = teamLabel(teams, route.statisticsTeamId);
      title = `${team} · NFL Stats`;
      description = `Explore the ${team} schedule, results, and team statistics.`;
    } else {
      const viewTitle = {
        browser: 'NFL Statistics',
        schedule: 'NFL Schedule',
        scores: 'NFL Scores',
        standings: 'NFL Standings',
        game: 'NFL Game Stats',
      }[view] ?? 'NFL Statistics';
      title = `${viewTitle} · ${year}`;
      description = TAB_DESCRIPTIONS.statistics;
    }
  } else if (route.activeTab === 'trade') {
    const viewTitle = {
      agent: 'Trade Agent',
      intelligence: 'Trade Intelligence',
      upgrade: 'Trade Upgrades',
      history: 'Trade History',
    }[route.tradeView] ?? 'Fantasy Trades';
    title = `${viewTitle} · ${year}`;
    description = TAB_DESCRIPTIONS.trade;
  } else if (route.activeTab === 'scout') {
    const viewTitle = {
      prospects: 'NFL Draft Prospects',
      picks: 'NFL Draft Picks',
      results: 'NFL Draft Results',
    }[route.scoutView] ?? 'NFL Draft Scout';
    title = `${viewTitle} · ${year}`;
    description = TAB_DESCRIPTIONS.scout;
  } else if (route.activeTab === 'draft') {
    const viewTitle = {
      'war-room': 'Draft War Room',
      'my-board': 'Draft My Board',
      results: 'Draft Results',
    }[route.draftView] ?? 'Fantasy Draft';
    title = `${viewTitle} · ${year}`;
    description = TAB_DESCRIPTIONS.draft;
  }

  return {
    title,
    description,
    text: `${title} — ${description}`,
    siteName: SITE_NAME,
  };
}

export function getCurrentShareUrl(locationRef = globalThis.location) {
  if (!locationRef) return '';
  if (locationRef.href) return String(locationRef.href);
  return `${locationRef.origin ?? ''}${locationRef.pathname ?? ''}${locationRef.search ?? ''}${locationRef.hash ?? ''}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderPageShareMetadataHtml(html, metadata, { url = '', imageUrl = SHARE_IMAGE_PATH } = {}) {
  if (!html || !metadata) return html;

  const title = `${metadata.title} | ${metadata.siteName ?? SITE_NAME}`;
  const description = metadata.description ?? '';
  const siteName = metadata.siteName ?? SITE_NAME;
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    ...(url ? [`<meta property="og:url" content="${escapeHtml(url)}" />`] : []),
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
    ...(url ? [`<link rel="canonical" href="${escapeHtml(url.replace(/#.*$/, ''))}" />`] : []),
    `<title>${escapeHtml(title)}</title>`,
  ].join('\n    ');
  const block = `${PAGE_SHARE_METADATA_START}\n    ${tags}\n    ${PAGE_SHARE_METADATA_END}`;
  const markedBlock = new RegExp(`${PAGE_SHARE_METADATA_START}[\\s\\S]*?${PAGE_SHARE_METADATA_END}`);

  if (markedBlock.test(html)) return html.replace(markedBlock, block);
  return html.replace('</head>', `    ${block}\n  </head>`);
}

function upsertMeta(documentRef, selector, attributes) {
  let element = documentRef.head.querySelector(selector);
  if (!element) {
    element = documentRef.createElement('meta');
    documentRef.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
}

export function applyPageShareMetadata(metadata, { documentRef = globalThis.document, locationRef = globalThis.location } = {}) {
  if (!documentRef || !metadata) return;

  const title = `${metadata.title} | ${metadata.siteName ?? SITE_NAME}`;
  const url = getCurrentShareUrl(locationRef);
  const canonicalUrl = url ? url.replace(/#.*$/, '') : '';
  const imageUrl = locationRef?.origin ? new URL(SHARE_IMAGE_PATH, locationRef.origin).href : SHARE_IMAGE_PATH;

  documentRef.title = title;
  upsertMeta(documentRef, 'meta[name="description"]', { name: 'description', content: metadata.description });
  upsertMeta(documentRef, 'meta[property="og:title"]', { property: 'og:title', content: metadata.title });
  upsertMeta(documentRef, 'meta[property="og:description"]', { property: 'og:description', content: metadata.description });
  upsertMeta(documentRef, 'meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta(documentRef, 'meta[property="og:site_name"]', { property: 'og:site_name', content: metadata.siteName ?? SITE_NAME });
  upsertMeta(documentRef, 'meta[property="og:url"]', { property: 'og:url', content: url });
  upsertMeta(documentRef, 'meta[property="og:image"]', { property: 'og:image', content: imageUrl });
  upsertMeta(documentRef, 'meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
  upsertMeta(documentRef, 'meta[name="twitter:title"]', { name: 'twitter:title', content: metadata.title });
  upsertMeta(documentRef, 'meta[name="twitter:description"]', { name: 'twitter:description', content: metadata.description });
  upsertMeta(documentRef, 'meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });

  let canonical = documentRef.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = documentRef.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    documentRef.head.appendChild(canonical);
  }
  canonical.setAttribute('href', canonicalUrl || url);
}

export async function copyText(value) {
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export async function sharePage({ title, text, url = getCurrentShareUrl() } = {}) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'fallback';
  try {
    await navigator.share({ title, text, url });
    return 'shared';
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    return 'fallback';
  }
}
