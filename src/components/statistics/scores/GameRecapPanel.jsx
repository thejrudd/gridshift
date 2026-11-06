export default function GameRecapPanel({ recap }) {
  return (
    <section className="scores-story-panel" aria-labelledby="scores-game-story-heading">
      <header className="scores-story-header">
        <div>
          <p className="scores-story-kicker">Story desk</p>
          <h2 id="scores-game-story-heading">Game story</h2>
        </div>
      </header>
      <div className="scores-story-recap" aria-label="Recap from the play-by-play">
        <p className="scores-story-recap-source">Recap from the play-by-play</p>
        {recap?.sections.length ? (
          <ol className="scores-story-list">
            {recap.sections.map((section) => (
              <li key={section.id} className="scores-story-item">
                <article aria-label={section.heading}>
                  <h3 className="scores-story-item-title">{section.heading}</h3>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="scores-story-item-body">{paragraph}</p>
                  ))}
                </article>
              </li>
            ))}
          </ol>
        ) : <p className="scores-story-state is-idle" role="status">{recap?.note}</p>}
      </div>
    </section>
  );
}
