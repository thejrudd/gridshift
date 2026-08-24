import { getAllDivisions, getTeamsByDivision, sortTeamsByRecord, getConferenceRecord } from '../utils/scheduleParser';
import { usePredictions } from '../context/PredictionContext';
import { validateTotalWinsLosses, validateDivisionRecords } from '../utils/validation';
import DivisionMatrix from './DivisionMatrix';

const placementLabels = ['1st', '2nd', '3rd', '4th'];
const placementColors = [
  'bg-[color:var(--color-accent-green)] text-white',
  'bg-[color:var(--color-label-tertiary)] text-[color:var(--color-bg)]',
  'bg-[color:var(--color-accent-orange)] text-white',
  'bg-[color:var(--color-accent-red)] text-white',
];

const StandingsTable = ({ teams }) => {
  const { predictions } = usePredictions();
  const divisions = getAllDivisions();

  // Validate that total wins equals total losses
  const validation = validateTotalWinsLosses(predictions);
  const divisionValidation = validateDivisionRecords(predictions, teams);
  const hasPredictions = Object.keys(predictions).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl font-display tracking-wide text-[color:var(--color-label)]">DIVISION STANDINGS</h2>
        <p className="text-sm text-[color:var(--color-label-secondary)]">Based on your predictions</p>
      </div>

      {/* Status Messages */}
      {Object.keys(predictions).length < 32 ? (
        <div className="bg-tint-accent border-2 border-tint-accent rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <svg className="h-6 w-6 text-[color:var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--color-accent)]">
                Predictions In Progress
              </h3>
              <p className="text-sm text-[color:var(--color-accent)]">
                Complete predictions for all 32 teams to see final standings. ({Object.keys(predictions).length}/32 teams predicted)
              </p>
            </div>
          </div>
        </div>
      ) : validation.isValid && divisionValidation.isValid ? (
        <div className="bg-tint-green border-2 border-tint-green rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <svg className="h-6 w-6 text-[color:var(--color-accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--color-accent-green)]">
                ✓ All Predictions Complete!
              </h3>
              <p className="text-sm text-[color:var(--color-accent-green)]">
                Your predictions are mathematically valid. All 32 teams predicted with consistent records.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {divisions.map(division => {
          const divisionTeams = getTeamsByDivision(teams, division);
          const sortedTeams = sortTeamsByRecord(divisionTeams, predictions, teams);
          const conference = division.split(' ')[0]; // "AFC" or "NFC"

          return (
            <div key={division} className="bg-[color:var(--color-bg-secondary)] rounded-lg shadow-md overflow-hidden">
              <div className={`p-3 ${conference === 'AFC' ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-accent-red)]'} text-white`}>
                <h3 className="text-xl font-display tracking-wider uppercase">{division}</h3>
              </div>

              <div className="divide-y divide-[color:var(--color-separator)]">
                {sortedTeams.map((team, index) => {
                  const record = predictions[team.id];
                  const confRecord = getConferenceRecord(team.id, teams, predictions);

                  return (
                    <div
                      key={team.id}
                      className={`p-3 flex items-center justify-between ${
                        index === 0 && record ? 'bg-tint-green' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-display text-[color:var(--color-label-tertiary)] w-4">
                          {index + 1}
                        </span>
                        <img
                          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id}.png`}
                          alt={`${team.name} logo`}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-[color:var(--color-label)]">
                              {team.id}
                            </span>
                            {record && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${placementColors[index]}`}>
                                {placementLabels[index]}
                              </span>
                            )}
                          </div>
                          {!record && (
                            <span className="text-xs text-[color:var(--color-label-tertiary)] italic">
                              No prediction
                            </span>
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
                            {record.divisionWins !== undefined && (
                              <div className="font-semibold text-[color:var(--color-accent)]">
                                {record.divisionWins}-{6 - record.divisionWins} division
                              </div>
                            )}
                            {confRecord && (
                              <div className="text-[color:var(--color-alpha)] font-medium">
                                {confRecord.wins}-{confRecord.losses}{confRecord.ties > 0 && `-${confRecord.ties}`} conf
                                {confRecord.games < confRecord.totalGames && (
                                  <span className="text-[color:var(--color-label-tertiary)]"> ({confRecord.games}/{confRecord.totalGames})</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <DivisionMatrix divisionTeams={divisionTeams} allTeams={teams} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StandingsTable;
