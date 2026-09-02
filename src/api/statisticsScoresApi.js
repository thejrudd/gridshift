import { normalizeStatisticsScoresProvider } from '../utils/statisticsScoresProvider.js';

async function parseScoresResponse(response, fallbackMessage) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || fallbackMessage);
  }
  return payload;
}

function appendSource(params, source) {
  const normalized = normalizeStatisticsScoresProvider(source);
  if (normalized) params.set('source', normalized);
  return params;
}

function appendPhase(params, phase) {
  const normalized = String(phase ?? '').trim().toLowerCase();
  if (normalized === 'preseason' || normalized === 'regular') params.set('phase', normalized);
  return params;
}

function normalizePhase(phase) {
  const normalized = String(phase ?? '').trim().toLowerCase();
  return normalized === 'preseason' || normalized === 'regular' ? normalized : null;
}

export async function getStatisticsScoresStatus({ source, signal } = {}) {
  const params = appendSource(new URLSearchParams(), source);
  const query = params.size ? `?${params}` : '';
  const response = await fetch(`/api/statistics/scores/status${query}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parseScoresResponse(response, 'Could not load the Statistics Scores provider status.');
}

export async function getStatisticsScoresGames({ season, phase, source, signal } = {}) {
  const expectedPhase = normalizePhase(phase);
  const params = appendPhase(
    appendSource(new URLSearchParams({ season: String(season) }), source),
    phase,
  );
  const response = await fetch(`/api/statistics/scores/games?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const payload = await parseScoresResponse(response, 'Could not load BALLDONTLIE Scores data.');
  if (expectedPhase && payload.phase !== expectedPhase) {
    throw new Error('The local Statistics Scores API is out of date. Restart npm run dev, then select BALLDONTLIE again.');
  }
  return payload;
}

export async function getStatisticsScoresEspnWeek({ season, phase, week, signal } = {}) {
  const params = appendPhase(new URLSearchParams({
    season: String(season),
    week: String(week),
  }), phase);
  const response = await fetch(`/api/statistics/scores/espn-week?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const payload = await parseScoresResponse(response, 'Could not load ESPN live scores.');
  const expectedPhase = normalizePhase(phase);
  if (expectedPhase && payload.phase !== expectedPhase) {
    throw new Error('The Statistics Scores ESPN response used the wrong NFL phase.');
  }
  return payload;
}

export async function getStatisticsScoresLiveWeek({ season, phase, week, signal } = {}) {
  const params = appendPhase(new URLSearchParams({
    season: String(season),
    week: String(week),
  }), phase);
  const response = await fetch(`/api/statistics/scores/live-week?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const payload = await parseScoresResponse(response, 'Could not load the live NFL scoreboard snapshot.');
  const expectedPhase = normalizePhase(phase);
  if (expectedPhase && payload.phase !== expectedPhase) {
    throw new Error('The Statistics Scores live response used the wrong NFL phase.');
  }
  return payload;
}

export async function getStatisticsScoresGamePlays(gameId, { signal } = {}) {
  const response = await fetch(`/api/statistics/scores/game/${encodeURIComponent(gameId)}/plays`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parseScoresResponse(response, 'Could not load BALLDONTLIE game detail.');
}

export async function getStatisticsScoresGameDetail(gameId, { phase, signal } = {}) {
  const params = appendPhase(new URLSearchParams(), phase);
  const query = params.size ? `?${params}` : '';
  const response = await fetch(`/api/statistics/scores/game/${encodeURIComponent(gameId)}/detail${query}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parseScoresResponse(response, 'Could not load BALLDONTLIE game detail.');
}

const STORY_STATS_PHASES = new Set(['pregame', 'live', 'postgame']);

export async function getStatisticsScoresStory(gameId, phase, { signal } = {}) {
  const normalizedPhase = String(phase ?? '').trim().toLowerCase();
  if (!STORY_STATS_PHASES.has(normalizedPhase)) {
    throw new Error('A valid StoryStats phase is required.');
  }
  const params = new URLSearchParams({ phase: normalizedPhase });
  const response = await fetch(`/api/statistics/scores/game/${encodeURIComponent(gameId)}/story?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parseScoresResponse(response, 'Could not load the StoryStats game story.');
}

export async function getStatisticsScoresPreseason({ season, source, signal } = {}) {
  const params = appendSource(new URLSearchParams({ season: String(season) }), source);
  const response = await fetch(`/api/statistics/scores/preseason?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  return parseScoresResponse(response, 'Could not load BALLDONTLIE preseason scores.');
}
