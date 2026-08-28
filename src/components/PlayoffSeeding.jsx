import { getAllDivisions, getTeamsByDivision, getConferenceRecord } from '../utils/scheduleParser';
import { usePredictions } from '../context/PredictionContext';
import { getPredictionPlayoffField } from '../utils/predictionPlayoffSeeding.js';

const seedBadgeColors = [
  'bg-[color:var(--color-signature)] text-[color:var(--color-signature-fg)]',   // #1 seed
  'bg-[color:var(--color-label-secondary)] text-[color:var(--color-bg)]',     // #2
  'bg-[color:var(--color-accent-orange)] text-white',    // #3
  'bg-[color:var(--color-accent)] text-white',     // #4
  'bg-[color:var(--color-alpha)] text-white',   // #5 wild card
  'bg-[color:var(--color-alpha)] text-white',   // #6 wild card
  'bg-[color:var(--color-alpha)] text-white',   // #7 wild card
];

const getConferenceSeeding = (teams, predictions, conference) => {
  const divisions = getAllDivisions().filter(d => d.startsWith(conference));
  const eligibleDivisions = new Set(divisions.filter((division) => {
    const divisionTeams = getTeamsByDivision(teams, division);
    return divisionTeams.length === 4 && divisionTeams.every((team) => predictions[team.id]);
  }));
  const eligibleTeams = teams.filter((team) => eligibleDivisions.has(team.division));
  const field = getPredictionPlayoffField(eligibleTeams, predictions)[conference];
  return {
    divisionWinners: field?.divisionWinners ?? [],
    wildCards: field?.wildCards ?? [],
  };
};

const PlayoffSeeding = ({ teams }) => {
  const { predictions } = usePredictions();
  const hasPredictions = Object.keys(predictions).length > 0;

  const conferences = ['AFC', 'NFC'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl font-display tracking-wide text-[color:var(--color-label)]">PLAYOFF SEEDING</h2>
        <p className="text-sm text-[color:var(--color-label-secondary)]">Based on your predictions</p>
      </div>

      {!hasPredictions && (
        <div className="bg-tint-accent border-2 border-tint-accent rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <svg className="h-6 w-6 text-[color:var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-[color:var(--color-accent)]">
              Make predictions for teams to see playoff seeding.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {conferences.map(conference => {
          const { divisionWinners, wildCards } = getConferenceSeeding(teams, predictions, conference);

          return (
            <div key={conference} className="bg-[color:var(--color-bg-secondary)] rounded-lg shadow-md overflow-hidden">
              <div className={`p-3 ${conference === 'AFC' ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-accent-red)]'} text-white`}>
                <h3 className="text-xl font-display tracking-wider uppercase">{conference} PLAYOFFS</h3>
              </div>

              {/* Division Winners */}
              <div className="px-3 pt-3 pb-1">
                <span className="text-xs font-semibold text-[color:var(--color-label-secondary)] uppercase tracking-wider">
                  Division Winners ({divisionWinners.length}/4)
                </span>
              </div>
              <div className="divide-y divide-[color:var(--color-separator)]">
                {divisionWinners.map((team, index) => (
                  <SeedRow
                    key={team.id}
                    team={team}
                    record={predictions[team.id]}
                    seed={index + 1}
                    hasBye={index === 0}
                    allTeams={teams}
                    predictions={predictions}
                  />
                ))}
                {divisionWinners.length === 0 && (
                  <div className="p-3 text-sm text-[color:var(--color-label-tertiary)] italic">
                    Predict all teams in a division to determine its winner
                  </div>
                )}
              </div>

              {/* Wild Cards */}
              <div className="px-3 pt-3 pb-1 border-t-2 border-[color:var(--color-separator-opaque)]">
                <span className="text-xs font-semibold text-[color:var(--color-label-secondary)] uppercase tracking-wider">
                  Wild Card ({wildCards.length}/3)
                </span>
              </div>
              <div className="divide-y divide-[color:var(--color-separator)]">
                {wildCards.map((team, index) => (
                  <SeedRow
                    key={team.id}
                    team={team}
                    record={predictions[team.id]}
                    seed={index + 5}
                    allTeams={teams}
                    predictions={predictions}
                  />
                ))}
                {wildCards.length === 0 && (
                  <div className="p-3 text-sm text-[color:var(--color-label-tertiary)] italic">
                    Predict all teams in a division to see wild card seeding
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SeedRow = ({ team, record, seed, hasBye, allTeams, predictions }) => {
  const confRecord = allTeams ? getConferenceRecord(team.id, allTeams, predictions) : null;

  return (
    <div className={`p-3 flex items-center justify-between ${hasBye ? 'bg-tint-signature' : ''}`}>
      <div className="flex items-center space-x-3">
        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${seedBadgeColors[seed - 1]}`}>
          {seed}
        </span>
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id}.png`}
          alt={`${team.name} logo`}
          className="w-8 h-8 object-contain"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[color:var(--color-label)]">{team.id}</span>
            <span className="text-xs text-[color:var(--color-label-secondary)]">{team.division}</span>
            {hasBye && (
              <span className="text-xs bg-[color:var(--color-signature)] text-[color:var(--color-signature-fg)] px-2 py-0.5 rounded-full font-semibold">
                #1 Seed
              </span>
            )}
          </div>
          {!record && (
            <span className="text-xs text-[color:var(--color-label-tertiary)] italic">No prediction</span>
          )}
        </div>
      </div>

      {record && (
        <div className="text-right">
          <div className="text-2xl font-display text-[color:var(--color-label)]">
            {record.wins}-{record.losses}
          </div>
          <div className="text-xs space-y-0.5">
            <div className="text-[color:var(--color-label-secondary)] font-medium">
              {(record.wins / 17 * 100).toFixed(0)}% win rate
            </div>
            {confRecord && (
              <div className="text-[color:var(--color-alpha)] font-medium">
                {confRecord.wins}-{confRecord.losses}{confRecord.ties > 0 && `-${confRecord.ties}`} conf
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayoffSeeding;
