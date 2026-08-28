const PREDICTION_EXPORT_FORMAT = 'gridshift-predictions';
const PREDICTION_EXPORT_VERSION = 1;

function validatePredictions(predictions) {
  if (typeof predictions !== 'object' || predictions === null || Array.isArray(predictions)) {
    throw new Error('Invalid file format: expected a predictions object');
  }

  for (const [teamId, record] of Object.entries(predictions)) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      throw new Error(`Invalid record for team ${teamId}`);
    }
    if (typeof record.wins !== 'number' || typeof record.losses !== 'number') {
      throw new Error(`Missing wins/losses for team ${teamId}`);
    }
  }

  return predictions;
}

export function createPredictionExport({ predictions, playoffPicks = {}, season = null }) {
  return {
    format: PREDICTION_EXPORT_FORMAT,
    version: PREDICTION_EXPORT_VERSION,
    season: Number.isInteger(Number(season)) ? Number(season) : null,
    predictions: validatePredictions(predictions),
    playoffPicks: typeof playoffPicks === 'object' && playoffPicks !== null && !Array.isArray(playoffPicks)
      ? playoffPicks
      : {},
  };
}

export function parsePredictionImportData(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Invalid file format: expected a predictions object');
  }

  if (data.format === PREDICTION_EXPORT_FORMAT || Object.hasOwn(data, 'predictions')) {
    const predictions = validatePredictions(data.predictions);
    const playoffPicks = data.playoffPicks;
    if (typeof playoffPicks !== 'object' || playoffPicks === null || Array.isArray(playoffPicks)) {
      throw new Error('Invalid file format: expected playoff picks');
    }
    return {
      predictions,
      playoffPicks,
      season: Number.isInteger(Number(data.season)) ? Number(data.season) : null,
      legacy: false,
    };
  }

  return {
    predictions: validatePredictions(data),
    playoffPicks: {},
    season: null,
    legacy: true,
  };
}

// Export regular-season predictions and the matching playoff bracket.
export const exportAsJSON = ({ predictions, playoffPicks, season }) => {
  const data = JSON.stringify(createPredictionExport({ predictions, playoffPicks, season }), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nfl-predictions-${Number(season) || 'export'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Import predictions from a JSON file
// Returns parsed predictions object or throws on invalid data
export const importFromJSON = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parsePredictionImportData(JSON.parse(e.target.result)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};
