import { useState, useEffect } from 'react';
import { fetchRoster, fetchDepthChartUnits, CURRENT_SEASON } from '../utils/playerApi';
import { TEAM_COLORS } from '../data/teamColors.js';
import { TEAM_HISTORY } from '../data/teamHistory.js';
import { useTheme } from '../context/ThemeContext';
import { getLegibleTeamColor, getTeamVisualTheme, hexLuminance } from '../utils/teamVisualTheme';
import { useSleeperLeague } from '../context/SleeperContext';
import TeamDashboard from './statistics/team/TeamDashboard.jsx';
import TeamHero from './statistics/team/TeamHero.jsx';
import { useTeamSeasonDashboard } from '../hooks/useTeamSeasonDashboard.js';
import { getTeamAbbr } from '../utils/liveScoringFeed.js';

// ── Color helpers (duplicated from PlayerProfile to keep components self-contained) ──

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamPage({ team, onBack, onSelectPlayer, onViewSchedule, onViewScheduleGame, onViewGameStats }) {
  const { darkMode } = useTheme();

  const { hasLeague, activeScoringSettings, league } = useSleeperLeague();
  const [roster, setRoster]       = useState(null);
  const [depthUnits, setDepthUnits] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);

  const teamKey = team.id.toLowerCase();
  const palette = TEAM_COLORS[teamKey];
  const history = TEAM_HISTORY[teamKey];

  const heroBg     = palette ? (darkMode ? palette.darkPrimary   : palette.primary)   : '#1C2332';
  const heroAccent = palette ? (darkMode ? palette.darkSecondary : palette.secondary)  : '#F5B700';
  const heroOnBg   = hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF';
  const heroMuted  = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.60)';
  const podBg      = heroOnBg === '#FFFFFF' ? 'rgba(255,255,255,0.12)' : 'rgba(12,15,20,0.10)';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchRoster(team.id),
      fetchDepthChartUnits(team.id).catch(() => []),
    ])
      .then(([players, units]) => { setRoster(players); setDepthUnits(units); })
      .catch(() => setLoadError('Failed to load roster.'))
      .finally(() => setLoading(false));
  }, [team.id]);

  // Play-by-play starts with 2022; offer the last three seasons from there.
  const seasonOptions = [CURRENT_SEASON, CURRENT_SEASON - 1, CURRENT_SEASON - 2].filter((year) => year >= 2022);
  // The hero and the dashboard share one season and one team-season fetch.
  const [season, setSeason] = useState(seasonOptions[0]);
  const teamAbbr = getTeamAbbr(team.id);
  const seasonData = useTeamSeasonDashboard({ season, team: teamAbbr });
  const dashboardColor = getLegibleTeamColor(getTeamVisualTheme(team.id, darkMode)?.primary, darkMode);

  return (
    <div className="statistics-detail-page space-y-5">

      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--color-accent)' }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Statistics
      </button>

      <TeamHero
        team={team}
        teamAbbr={teamAbbr}
        history={history}
        season={season}
        seasonData={seasonData.status === 'ready' ? seasonData.data : null}
        darkMode={darkMode}
        colors={{
          '--statistics-team-hero-bg': heroBg,
          '--statistics-team-hero-bg-end': darkenHex(heroBg, 0.35),
          '--statistics-team-hero-accent': heroAccent,
          '--statistics-team-hero-on': heroOnBg,
          '--statistics-team-hero-muted': heroMuted,
          '--statistics-team-hero-pod': podBg,
        }}
        onViewSchedule={onViewSchedule}
        onOpenNextGame={onViewScheduleGame && seasonData.status === 'ready' ? (next) => {
          // Statistics Schedule finds the row by season, week, and both teams.
          const away = next.home ? next.opp : teamAbbr;
          const home = next.home ? teamAbbr : next.opp;
          onViewScheduleGame(`${seasonData.data.season ?? season}-W${next.week}-${away}-${home}`);
        } : null}
      />

      {/* ── Loading / error ───────────────────────────────────────────────── */}
      {loading && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-label-tertiary)' }}>
          Loading roster…
        </div>
      )}
      {loadError && (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--color-accent-red)' }}>
          {loadError}
        </div>
      )}

      {roster && (
        <TeamDashboard
          team={team}
          roster={roster}
          depthUnits={depthUnits}
          seasonOptions={seasonOptions}
          season={season}
          onSeasonChange={setSeason}
          seasonData={seasonData}
          darkMode={darkMode}
          meColor={dashboardColor?.color ?? null}
          meForeground={dashboardColor?.foreground ?? null}
          leagueScoring={hasLeague ? activeScoringSettings : null}
          leagueName={league?.name ?? null}
          onSelectPlayer={onSelectPlayer}
          onViewGameStats={onViewGameStats}
        />
      )}
    </div>
  );
}

