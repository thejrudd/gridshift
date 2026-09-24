// Empty-state guide for the global search palette.
//
// Search only feels powerful if people know what it accepts, and nothing about
// an empty text field communicates that "sea 11" works. These examples are the
// documentation.

const GUIDE_SECTIONS = [
  {
    label: 'Players — name, shorthand, or team and number',
    chips: ['Jaxon Smith-Njigba', 'jsn', 'sea 11', 'seattle wr', 'lv 17'],
  },
  {
    label: 'Teams and schedules',
    chips: ['Seahawks', 'cardinals schedule', 'week 3', 'cardinals week 4', 'detroit bye week'],
  },
  {
    label: 'Standings and records',
    chips: ['NFC West standings', 'my record', 'playoff picture'],
  },
  {
    label: 'Your league',
    chips: ['my matchup', 'waiver wire', 'rankings', 'trade agent'],
  },
  {
    label: 'Misspellings are fine',
    chips: ['seahwaks', 'jefersn', 'quaterback'],
  },
];

export default function GlobalSearchGuide({ onExample }) {
  return (
    <div className="global-search-guide">
      <p className="global-search-guide__intro">
        Search players, teams, games, your league, and anywhere in the app. Pick an
        example to try it.
      </p>
      {GUIDE_SECTIONS.map(({ label, chips }) => (
        <div key={label}>
          <div className="global-search-guide__label">{label}</div>
          <div className="global-search-guide__chips">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onExample(chip)}
                className="global-search-guide__chip"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
