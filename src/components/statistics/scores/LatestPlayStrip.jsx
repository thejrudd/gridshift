import { getLatestPlayPresentation } from '../../../utils/nflPlays/latestPlayPresentation.js';

const LIVE_PLAY_STATUSES = new Set(['live', 'halftime', 'delayed']);

function LatestPlayState({ game, latestPlay }) {
  if (latestPlay?.status === 'loading') {
    return <span className="scores-latest-play__message">Waiting for the first play…</span>;
  }
  if (latestPlay?.play) {
    const presentation = getLatestPlayPresentation(latestPlay.play, game);
    if (!presentation) return null;
    return (
      <>
        <span className="scores-latest-play__meta">
          {presentation.down && <b>{presentation.down}</b>}
          {presentation.spot && <span>{presentation.spot}</span>}
          <time>{presentation.quarter} · {presentation.time}</time>
        </span>
        <span className="scores-latest-play__text">
          {presentation.sentence}
          {presentation.tag && <em data-k={presentation.tag[0]}>{presentation.tag[1]}</em>}
        </span>
        {presentation.possessionChanged && presentation.possessionTeam && (
          <span className="scores-latest-play__context">Change of possession · {presentation.possessionTeam}</span>
        )}
      </>
    );
  }
  if (latestPlay?.status === 'error') {
    return <span className="scores-latest-play__message">Latest play temporarily unavailable.</span>;
  }
  return <span className="scores-latest-play__message">Waiting for the first provider play…</span>;
}

export default function LatestPlayStrip({ game }) {
  if (!LIVE_PLAY_STATUSES.has(game?.status) || game?.playByPlayAvailable === false) return null;
  const latestPlay = game?.latestPlay ?? null;
  return (
    <span className={`scores-latest-play${latestPlay?.stale ? ' is-stale' : ''}`} aria-live="polite">
      <span className="scores-latest-play__label">Latest play</span>
      <LatestPlayState game={game} latestPlay={latestPlay} />
    </span>
  );
}
