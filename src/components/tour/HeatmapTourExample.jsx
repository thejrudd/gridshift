import { useTheme } from '../../context/ThemeContext';
import { getTeamPalette } from '../../data/teamColors';
import { getBundledNflTeamLogoUrl } from '../../utils/companionAssetVisuals.js';
import { getHeatmapPlayerActivityColumns } from '../../utils/fantasyHeatmapData.js';
import HeatmapPlayerResults from '../companion/HeatmapPlayerResults.jsx';

const SAMPLE_GAMES = [
  { week: 11, team: 'GB', opponent: 'CHI', isHome: false, points: 16.4, entry: { rec_tgt: 8, off_snp: 47, tm_off_snp: 60 } },
  { week: 10, team: 'GB', opponent: 'MIN', isHome: true, inactive: true },
  { week: 9, team: 'GB', opponent: 'PHI', isHome: false, points: 10.5, entry: { rec_tgt: 6, off_snp: 42, tm_off_snp: 60 } },
  { week: 8, team: 'GB', opponent: 'CAR', isHome: true, points: 7.1, entry: { rec_tgt: 5, off_snp: 38, tm_off_snp: 60 } },
];

const SAMPLE_RECEIVER = {
  playerId: 'sample-receiver',
  name: 'Jayden Reed',
  player: { name: 'Jayden Reed', team: 'GB', position: 'WR' },
  position: 'WR',
  activityColumns: getHeatmapPlayerActivityColumns('WR'),
  seasonPoints: 34,
};

const UPCOMING_ROWS = [{
  ...SAMPLE_RECEIVER,
  games: SAMPLE_GAMES.filter(game => !game.inactive),
  logGames: SAMPLE_GAMES,
  activity: 6.3,
  value: 11.3,
}];

const COMPLETED_ROWS = [{
  ...SAMPLE_RECEIVER,
  games: [SAMPLE_GAMES[0]],
  activity: 8,
  value: 16.4,
  breakdown: [
    { label: 'Receptions', statVal: 6, pts: 3 },
    { label: 'Receiving Yards', statVal: 74, pts: 7.4 },
    { label: 'Receiving TD', statVal: 1, pts: 6 },
  ],
}];

export default function HeatmapTourExample({ kind }) {
  const { darkMode } = useTheme();
  const upcoming = kind === 'upcoming';
  const home = upcoming ? 'DET' : 'CHI';

  return (
    <div data-tour="heatmap-drilldown-example">
      <div className="companion-heatmap-drilldown-hero" style={{
        '--heatmap-away': getTeamPalette('GB').primary,
        '--heatmap-home': getTeamPalette(home).primary,
      }}>
        <div className="companion-heatmap-drilldown-week">Sample · Week {upcoming ? 12 : 11}</div>
        <div className="companion-heatmap-drilldown-matchup">
          <img src={getBundledNflTeamLogoUrl('GB')} width="40" height="40" alt="" />
          <span className="companion-heatmap-drilldown-matchup-team">GB</span>
          <span className="companion-heatmap-drilldown-matchup-sep">@</span>
          <span className="companion-heatmap-drilldown-matchup-team">{home}</span>
          <img src={getBundledNflTeamLogoUrl(home)} width="40" height="40" alt="" />
        </div>
        <div className="companion-heatmap-drilldown-subtitle">WR · Fantasy Points</div>
      </div>
      <div className="companion-heatmap-drilldown-content">
        <HeatmapPlayerResults
          rows={upcoming ? UPCOMING_ROWS : COMPLETED_ROWS}
          upcoming={upcoming}
          valueLabel={upcoming ? 'PPG' : 'Pts'}
          darkMode={darkMode}
          initialExpandedId={SAMPLE_RECEIVER.playerId}
        />
      </div>
    </div>
  );
}
