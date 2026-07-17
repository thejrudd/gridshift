import { findCorrespondingGameIndex } from '../utils/scheduleParser';
import { usePredictions } from '../context/PredictionContext';

// Get head-to-head results for teamA vs teamB from game picks
const getHeadToHead = (teamA, teamB, allTeams, predictions) => {
  // Find game indices where teamA plays teamB
  const indices = teamA.opponents
    .map((oppId, i) => oppId === teamB.id ? i : -1)
    .filter(i => i !== -1);

  const savedResults = predictions[teamA.id]?.gameResults || {};

  return indices.map((gameIdx) => {
    // Check teamA's own saved result first
    if (savedResults[gameIdx]) return savedResults[gameIdx];

    // Check if opponent has a synced result
    const oppRecord = predictions[teamB.id];
    if (!oppRecord?.gameResults) return null;
    const correspondingIdx = findCorrespondingGameIndex(allTeams, teamA.id, gameIdx, teamB.id);
    if (correspondingIdx === -1) return null;
    const oppResult = oppRecord.gameResults[correspondingIdx];
    if (oppResult === 'W') return 'L';
    if (oppResult === 'L') return 'W';
    if (oppResult === 'T') return 'T';
    return null;
  });
};

const resultColors = {
  W: 'bg-[color:var(--color-accent-green)] text-white',
  L: 'bg-[color:var(--color-accent-red)] text-white',
  T: 'bg-[color:var(--color-accent-orange)] text-white',
};

const DivisionMatrix = ({ divisionTeams, allTeams }) => {
  const { predictions } = usePredictions();

  // Check if there are any game picks at all for this division
  const hasAnyPicks = divisionTeams.some(team => {
    for (const rival of divisionTeams) {
      if (rival.id === team.id) continue;
      const results = getHeadToHead(team, rival, allTeams, predictions);
      if (results.some(r => r !== null)) return true;
    }
    return false;
  });

  if (!hasAnyPicks) return null;

  return (
    <div className="px-3 pb-3">
      <div className="text-[length:var(--type-label)] font-semibold text-[color:var(--color-label-tertiary)] uppercase tracking-wider mb-1.5">
        Head-to-Head
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead>
            <tr>
              <th className="w-12" />
              {divisionTeams.map(team => (
                <th key={team.id} className="px-1 py-1 font-bold text-[color:var(--color-label-secondary)] text-[length:var(--type-label)]">
                  {team.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {divisionTeams.map(rowTeam => (
              <tr key={rowTeam.id}>
                <td className="pr-1 py-0.5 text-right font-bold text-[color:var(--color-label-secondary)] text-[length:var(--type-label)]">
                  {rowTeam.id}
                </td>
                {divisionTeams.map(colTeam => {
                  if (rowTeam.id === colTeam.id) {
                    return (
                      <td key={colTeam.id} className="px-1 py-0.5">
                        <span className="text-[color:var(--color-label-quaternary)]">—</span>
                      </td>
                    );
                  }

                  const results = getHeadToHead(rowTeam, colTeam, allTeams, predictions);

                  return (
                    <td key={colTeam.id} className="px-1 py-0.5">
                      <div className="flex justify-center gap-0.5">
                        {results.map((result, i) => (
                          <span
                            key={i}
                            className={`inline-block w-5 h-5 leading-5 rounded text-[length:var(--type-label)] font-bold ${
                              result ? resultColors[result] : 'bg-[color:var(--color-fill)] text-[color:var(--color-label-tertiary)]'
                            }`}
                          >
                            {result || '·'}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DivisionMatrix;
