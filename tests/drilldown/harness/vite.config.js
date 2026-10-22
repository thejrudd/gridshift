// Standalone harness for the player matchup drilldown. It renders the real
// PlayerMatchupBreakdown with fixture league data and mocked contexts so the
// layout and interaction spec (tests/drilldown/player-drilldown.spec.js) can drive
// every game phase without a connected league or live provider.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

export default defineConfig({
  root: here,
  // Own dependency cache: sharing node_modules/.vite with the app's dev server
  // re-optimizes its deps under a new hash and loads React twice there.
  cacheDir: path.join(repoRoot, 'node_modules/.vite-drilldown-harness'),
  plugins: [react(), {
    name: 'drilldown-harness-mocks',
    enforce: 'pre',
    resolveId(source, importer) {
      if (/\/context\/SleeperContext(?:\.jsx)?$/.test(source)) return path.join(here, 'mocks/sleeperContext.js');
      if (/\/context\/ThemeContext(?:\.jsx)?$/.test(source)) return path.join(here, 'mocks/themeContext.js');
      // The timeline mock wraps the real hook for the no-BDL mode, so its own import is left alone.
      if (/\/hooks\/usePlayerMatchupTimeline(?:\.js)?$/.test(source) && !importer?.endsWith('mocks/usePlayerMatchupTimeline.js')) return path.join(here, 'mocks/usePlayerMatchupTimeline.js');
      return null;
    },
  }],
  server: { fs: { allow: [repoRoot] } },
});
