import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import PlayerMatchupBreakdown from '../../../src/components/companion/PlayerMatchupBreakdown.jsx';
import { buildFixture } from './fixtures.js';

const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const fixture = buildFixture({
  phase: params.get('phase') ?? 'pregame',
  source: params.get('source') ?? 'balldontlie',
  bench: params.get('bench') !== '0',
  bdl: params.get('bdl') !== '0',
  sparse: params.get('sparse') === '1',
});
// ?status=Q tags the player with an injury designation.
if (params.get('status')) fixture.props.enrichedPlayer = { ...fixture.props.enrichedPlayer, availabilityStatus: params.get('status') };
globalThis.__drilldownHarness = fixture;
// Callbacks are recorded so the spec can assert they fired.
window.__drilldownEvents = [];
const record = name => (...args) => window.__drilldownEvents.push({ name, args });

createRoot(document.getElementById('root')).render(
  <PlayerMatchupBreakdown
    {...fixture.props}
    onClose={record('close')}
    onViewStats={record('viewStats')}
    onViewBenchPlayer={record('viewBench')}
    onViewScheduleGame={record('viewScheduleGame')}
    onOpenInjuries={record('openInjuries')}
  />,
);
