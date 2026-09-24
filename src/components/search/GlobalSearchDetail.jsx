// Expanded detail for the active search result.
//
// Renders only what is already known — see buildResultDetail. Fields are omitted
// rather than shown empty, so the panel never reserves space for data that is
// not coming.

export default function GlobalSearchDetail({ detail, onRoute }) {
  const facts = detail?.facts ?? [];
  const stats = detail?.stats ?? null;
  const fantasy = detail?.fantasy ?? null;
  if (!facts.length && !stats && !fantasy) return null;

  return (
    <div className="global-search-detail">
      {facts.length ? (
        <dl className="global-search-detail__facts">
          {facts.map((fact) => (
            <div key={`${fact.label}:${fact.value}`} className="global-search-detail__fact">
              <dt className="global-search-detail__fact-label">{fact.label}</dt>
              <dd className="global-search-detail__fact-value">
                {fact.value}
                {fact.detail ? (
                  <span className="global-search-detail__fact-detail">{fact.detail}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {stats ? (
        <div className="global-search-detail__stats">
          {stats.label ? (
            <div className="global-search-detail__stats-label">{stats.label}</div>
          ) : null}
          <div className="global-search-detail__stat-row">
            {stats.values.map((value) => (
              <div key={value.key} className="global-search-detail__stat">
                <span className="global-search-detail__stat-number">{value.display}</span>
                <span className="global-search-detail__stat-label">{value.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Who rosters this player in the connected league, and the two places
          that fact leads. The buttons stop their click from reaching the result
          row behind them: the row's own job is still the stats page. */}
      {fantasy ? (
        <div className="global-search-detail__fantasy">
          <span
            className={`global-search-detail__owner${fantasy.isMine ? ' is-mine' : ''}`}
          >
            <span className="global-search-detail__owner-dot" aria-hidden="true" />
            {fantasy.label}
          </span>
          {fantasy.actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="global-search-detail__action"
              onClick={(event) => {
                event.stopPropagation();
                onRoute?.(action.route);
              }}
            >
              {action.label}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
