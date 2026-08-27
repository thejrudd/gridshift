// Export predictions as a JSON file download
export const exportAsJSON = (predictions) => {
  const data = JSON.stringify(predictions, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nfl-predictions-2026.json';
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
        const data = JSON.parse(e.target.result);

        // Validate shape: must be an object with team ID keys
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw new Error('Invalid file format: expected a predictions object');
        }

        // Validate each entry has expected fields
        for (const [teamId, record] of Object.entries(data)) {
          if (typeof record !== 'object' || record === null) {
            throw new Error(`Invalid record for team ${teamId}`);
          }
          if (typeof record.wins !== 'number' || typeof record.losses !== 'number') {
            throw new Error(`Missing wins/losses for team ${teamId}`);
          }
        }

        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};
