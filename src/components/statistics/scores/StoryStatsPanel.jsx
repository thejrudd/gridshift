import { useId, useMemo } from 'react';

const VALID_STATUSES = new Set(['idle', 'loading', 'ready', 'error', 'unavailable']);

function textValue(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (!value || typeof value !== 'object') return '';
  return textValue(value.text ?? value.name ?? value.label ?? value.value);
}

function firstText(...values) {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return '';
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function generatedTime(value) {
  if (value == null || value === '') return null;
  const date = toDate(value);
  if (!date) return textValue(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function dateTimeValue(value) {
  const date = toDate(value);
  return date ? date.toISOString() : undefined;
}

function phaseLabel(value) {
  const raw = textValue(value);
  if (!raw) return '';
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, '');

  if (['pre', 'pregame', 'beforegame', 'scheduled'].includes(normalized)) return 'Pregame';
  if (['live', 'ingame', 'duringgame'].includes(normalized)) return 'Live update';
  if (['halftime', 'half', 'halfway'].includes(normalized)) return 'Halftime';
  if (['post', 'postgame', 'final', 'aftergame'].includes(normalized)) return 'Postgame';
  if (['q1', '1', '1st', 'first', 'firstquarter'].includes(normalized)) return 'End of Q1';
  if (['q2', '2', '2nd', 'second', 'secondquarter'].includes(normalized)) return 'Halftime';
  if (['q3', '3', '3rd', 'third', 'thirdquarter'].includes(normalized)) return 'End of Q3';
  if (['q4', '4', '4th', 'fourth', 'fourthquarter'].includes(normalized)) return 'End of Q4';

  return raw;
}

function contextPhase({ phase, gameStatus, statusLabel, context }) {
  const explicitPhase = phaseLabel(phase ?? context?.phase);
  if (explicitPhase) return explicitPhase;

  const normalizedStatus = textValue(gameStatus ?? context?.gameStatus ?? context?.status).toLowerCase();
  if (['scheduled', 'pre', 'pregame'].includes(normalizedStatus)) return 'Pregame';
  if (['live', 'halftime', 'delayed', 'in progress', 'in_progress'].includes(normalizedStatus)) return 'Live update';
  if (['final', 'post', 'postgame', 'completed'].includes(normalizedStatus)) return 'Postgame';

  return phaseLabel(statusLabel ?? context?.statusLabel);
}

function normalizeStory(story, fallbackPhase) {
  if (!story || typeof story !== 'object') return null;

  const title = firstText(story.headline, story.title, story.subject);
  const body = firstText(story.summary, story.body, story.content, story.text, story.description);
  const source = firstText(story.sourceName, story.source?.name, story.source?.label, story.source);
  const url = firstText(story.url, story.link, story.sourceUrl);
  const generatedAt = story.generatedAt ?? story.generated_at ?? story.createdAt ?? story.created_at;
  const phase = phaseLabel(
    story.phase
      ?? story.phaseLabel
      ?? story.periodLabel
      ?? story.quarterLabel
      ?? story.quarter
      ?? story.period,
  ) || fallbackPhase;

  if (!title && !body) return null;

  return {
    id: firstText(story.id, story.storyId, story.story_id),
    title,
    body,
    source,
    url,
    phase,
    generatedAt,
  };
}

function quotaText(quota) {
  if (!quota) return '';
  if (typeof quota === 'string') return quota.trim();

  const remaining = quota.remaining ?? quota.requestsRemaining ?? quota.remainingRequests;
  const limit = quota.limit ?? quota.dailyLimit ?? quota.maxRequests;
  const numericRemaining = Number(remaining);
  const numericLimit = Number(limit);

  if (Number.isFinite(numericRemaining) && Number.isFinite(numericLimit)) {
    return `${numericRemaining} of ${numericLimit} requests remaining today`;
  }
  if (Number.isFinite(numericRemaining)) return `${numericRemaining} requests remaining today`;
  if (Number.isFinite(numericLimit)) return `${numericLimit} requests available today`;

  return firstText(quota.message, quota.label, quota.resetLabel, quota.resetAt);
}

function emptyMessage(phase) {
  if (phase === 'Pregame') return 'No pregame story is available yet.';
  if (phase === 'Live update' || phase === 'Halftime') return 'No live story is available for this update yet.';
  if (phase === 'Postgame' || phase === 'End of Q4') return 'No postgame story is available yet.';
  return 'No game story is available yet.';
}

function StoryItem({ story, index }) {
  const storyLabel = story.title || story.body || `Game story ${index + 1}`;

  return (
    <li className="scores-story-item">
      <article aria-label={storyLabel}>
        {(story.phase || story.generatedAt || story.source) && (
          <div className="scores-story-item-meta">
            {story.phase && <span className="scores-story-phase">{story.phase}</span>}
            {story.generatedAt && (
              <time dateTime={dateTimeValue(story.generatedAt)}>
                Generated {generatedTime(story.generatedAt)}
              </time>
            )}
            {story.source && <span>Source: {story.source}</span>}
          </div>
        )}
        {story.title && <h3 className="scores-story-item-title">{story.title}</h3>}
        {story.body && <p className="scores-story-item-body">{story.body}</p>}
        {story.url && (
          <a
            className="scores-story-source-link"
            href={story.url}
            target="_blank"
            rel="noreferrer"
          >
            {story.source ? `Open ${story.source}` : 'Open source story'}
          </a>
        )}
      </article>
    </li>
  );
}

function LoadingState({ hasStories }) {
  if (hasStories) {
    return (
      <p className="scores-story-state is-loading" role="status" aria-live="polite">
        Updating game stories…
      </p>
    );
  }

  return (
    <div className="scores-story-loading" role="status" aria-live="polite" aria-label="Loading game stories">
      <span className="scores-story-loading-label">Loading game stories…</span>
      {[0, 1, 2].map((item) => (
        <span className="scores-story-loading-line" key={item} aria-hidden="true" />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  const message = firstText(error) || 'The latest game story could not be loaded.';

  return (
    <div className="scores-story-state is-error" role="alert">
      <strong>Game stories could not be loaded.</strong>
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          className="scores-story-retry"
          onClick={onRetry}
          aria-label="Retry loading game stories"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Compact StoryStats presentation for a score drilldown.
 *
 * @param {object} props
 * @param {Array<object>} [props.stories] Story records from the server.
 * @param {'idle'|'loading'|'ready'|'error'|'unavailable'} [props.status] Load state.
 * @param {unknown} [props.error] Error detail from the story request.
 * @param {string} [props.phase] Pregame, live checkpoint, quarter, or postgame context.
 * @param {string} [props.gameStatus] Score drilldown status such as scheduled, live, or final.
 * @param {string} [props.statusLabel] User-facing score status fallback.
 * @param {{ phase?: string, gameStatus?: string, status?: string, statusLabel?: string }} [props.context]
 *   Optional grouped phase/status context.
 * @param {{ remaining?: number, limit?: number, message?: string, resetAt?: string }|string} [props.quota]
 *   Request-budget metadata. No credential data is accepted or displayed.
 * @param {() => void} [props.onRetry] Retry callback for an error state.
 */
export default function StoryStatsPanel({
  stories = [],
  status = 'idle',
  error = null,
  phase,
  gameStatus,
  statusLabel,
  context,
  quota,
  onRetry,
}) {
  const headingId = `scores-story-heading-${useId().replace(/:/g, '')}`;
  const resolvedStatus = VALID_STATUSES.has(status) ? status : 'idle';
  const fallbackPhase = contextPhase({ phase, gameStatus, statusLabel, context });
  const normalizedStories = useMemo(
    () => (Array.isArray(stories) ? stories : [])
      .map((story) => normalizeStory(story, fallbackPhase))
      .filter(Boolean),
    [fallbackPhase, stories],
  );
  const hasStories = normalizedStories.length > 0;
  const requestQuota = quotaText(quota);

  return (
    <section
      className={`scores-story-panel is-${resolvedStatus}`}
      aria-labelledby={headingId}
    >
      <header className="scores-story-header">
        <div>
          <p className="scores-story-kicker">Story desk</p>
          <h2 id={headingId}>Game story</h2>
        </div>
        {(fallbackPhase || requestQuota) && (
          <div className="scores-story-header-meta">
            {fallbackPhase && <span className="scores-story-context">{fallbackPhase}</span>}
            {requestQuota && <span className="scores-story-quota">{requestQuota}</span>}
          </div>
        )}
      </header>

      {resolvedStatus === 'loading' && <LoadingState hasStories={hasStories} />}
      {resolvedStatus === 'error' && <ErrorState error={error} onRetry={onRetry} />}
      {resolvedStatus === 'unavailable' && (
        <p className="scores-story-state is-unavailable" role="status">
          Game stories are unavailable right now.
        </p>
      )}
      {resolvedStatus === 'ready' && !hasStories && (
        <p className="scores-story-state is-empty" role="status" aria-live="polite">
          {emptyMessage(fallbackPhase)}
        </p>
      )}
      {resolvedStatus === 'idle' && !hasStories && (
        <p className="scores-story-state is-idle" role="status" aria-live="polite">
          {emptyMessage(fallbackPhase)}
        </p>
      )}

      {hasStories && (
        <ol className="scores-story-list" aria-label="Game stories">
          {normalizedStories.map((story, index) => (
            <StoryItem key={story.id || `${story.phase || 'story'}-${index}`} story={story} index={index} />
          ))}
        </ol>
      )}
    </section>
  );
}
