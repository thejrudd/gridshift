import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getTeamsByDivision, getStrengthOfSchedule, findCorrespondingGameIndex } from '../utils/scheduleParser';
import { usePredictions } from '../context/PredictionContext';

// Quick-view tooltip showing game-by-game picks (rendered via portal to escape overflow:hidden)
const GameTooltip = ({ team, allTeams, predictions, onClose, anchorRef }) => {
  const teamRecord = predictions[team.id];
  const gameResults = teamRecord?.gameResults || {};
  const [position, setPosition] = useState(null);

  // Position the tooltip relative to the anchor element
  useEffect(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(400, window.innerWidth - 16);
    // Center horizontally on the anchor, clamped to viewport
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    setPosition({
      top: rect.bottom + window.scrollY + 4,
      left: left + window.scrollX,
      width: tooltipWidth,
    });
  }, [anchorRef]);

  // Also compute synced results from opponents
  const fullResults = { ...gameResults };
  for (let i = 0; i < team.opponents.length; i++) {
    if (fullResults[i]) continue;
    const oppId = team.opponents[i];
    const oppRecord = predictions[oppId];
    if (!oppRecord?.gameResults) continue;
    const correspondingIdx = findCorrespondingGameIndex(allTeams, team.id, i, oppId);
    if (correspondingIdx === -1) continue;
    const oppResult = oppRecord.gameResults[correspondingIdx];
    if (oppResult === 'W') fullResults[i] = 'L';
    else if (oppResult === 'L') fullResults[i] = 'W';
    else if (oppResult === 'T') fullResults[i] = 'T';
  }

  const hasAnyResults = Object.keys(fullResults).length > 0;

  if (!position) return null;

  return createPortal(
    <div
      className="fixed z-[100] bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-separator)] rounded-lg shadow-xl p-3 text-left"
      style={{ top: position.top, left: position.left, width: position.width, position: 'absolute' }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-[color:var(--color-label)]">{team.name} — Game-by-Game</span>
        <button onClick={onClose} className="text-[color:var(--color-label-tertiary)] hover:text-[color:var(--color-label-secondary)] text-lg leading-none tooltip-close-btn">×</button>
      </div>
      {!hasAnyResults ? (
        <p className="text-xs text-[color:var(--color-label-tertiary)] italic">No game picks yet. Click to open and set predictions.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {team.opponents.map((oppId, i) => {
            const result = fullResults[i];
            const isSynced = !gameResults[i] && result;
            return (
              <div key={`${oppId}-${i}`} className="flex items-center space-x-1.5 text-xs py-0.5">
                <span className="font-mono text-[color:var(--color-label-tertiary)] w-4 text-right">{i + 1}.</span>
                <img
                  src={`https://a.espncdn.com/i/teamlogos/nfl/500/${oppId}.png`}
                  alt={oppId}
                  className="w-4 h-4 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="font-semibold text-[color:var(--color-label-secondary)] w-7">{oppId}</span>
                {result ? (
                  <span className={`font-bold px-1 rounded text-[10px] ${
                    result === 'W' ? 'text-[color:var(--color-accent-green)] bg-tint-green-strong' :
                    result === 'L' ? 'text-[color:var(--color-accent-red)] bg-tint-red-strong' :
                    'text-[color:var(--color-accent-orange)] bg-tint-signature-strong'
                  }${isSynced ? ' opacity-60' : ''}`}>
                    {result}
                  </span>
                ) : (
                  <span className="text-[color:var(--color-label-quaternary)]">—</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
};

// Compute implied game results for a team from all saved predictions
const getImpliedRecord = (teamId, teams, predictions) => {
  const team = teams.find(t => t.id === teamId);
  if (!team) return { wins: 0, losses: 0, ties: 0, divWins: 0, divLosses: 0, divTies: 0, hasAny: false };

  let wins = 0, losses = 0, ties = 0, divWins = 0, divLosses = 0, divTies = 0;
  let hasAny = false;

  for (let i = 0; i < team.opponents.length; i++) {
    const oppId = team.opponents[i];
    const oppRecord = predictions[oppId];
    if (!oppRecord?.gameResults) continue;
    const correspondingIdx = findCorrespondingGameIndex(teams, teamId, i, oppId);
    if (correspondingIdx === -1) continue;
    const oppResult = oppRecord.gameResults[correspondingIdx];
    if (!oppResult) continue;

    const oppTeam = teams.find(t => t.id === oppId);
    const isDivision = oppTeam && oppTeam.division === team.division;
    hasAny = true;

    if (oppResult === 'W') { // Opponent won = we lost
      losses++;
      if (isDivision) divLosses++;
    } else if (oppResult === 'L') { // Opponent lost = we won
      wins++;
      if (isDivision) divWins++;
    } else if (oppResult === 'T') {
      ties++;
      if (isDivision) divTies++;
    }
  }

  return { wins, losses, ties, divWins, divLosses, divTies, hasAny };
};

// Individual team row with ref for portal tooltip positioning
const TeamRow = ({ team, record, implied, sos, hasGameData, showTooltip, allTeams, predictions, onTeamClick, hoverTimeout, setTooltipTeamId }) => {
  const rowRef = useRef(null);

  return (
    <div key={team.id} className="relative">
      <div
        ref={rowRef}
        className="w-full p-4 hover:bg-[color:var(--color-fill)] transition-colors text-left flex items-center justify-between group cursor-pointer"
        onClick={() => onTeamClick(team)}
        onMouseEnter={() => {
          hoverTimeout.current = setTimeout(() => setTooltipTeamId(team.id), 400);
        }}
        onMouseLeave={() => {
          clearTimeout(hoverTimeout.current);
          setTooltipTeamId(null);
        }}
      >
        <div className="flex items-center space-x-3 flex-1">
          <img
            src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id}.png`}
            alt={`${team.name} logo`}
            className="w-12 h-12 object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div>
            <h3 className="font-bold text-[color:var(--color-label)] group-hover:text-[color:var(--color-accent)] transition-colors text-lg">
              {team.name}
            </h3>
            <p className="text-xs text-[color:var(--color-label-tertiary)] font-mono font-semibold">{team.id}</p>
            {sos && (
              <p className={`text-[10px] font-medium ${
                sos.avgOppWins >= 9.5 ? 'text-[color:var(--color-accent-red)]' :
                sos.avgOppWins >= 8.5 ? 'text-[color:var(--color-accent-orange)]' :
                sos.avgOppWins <= 7.5 ? 'text-[color:var(--color-accent-green)]' :
                'text-[color:var(--color-label-tertiary)]'
              }`}>
                SOS: {sos.avgOppWins.toFixed(1)} avg opp wins
                {sos.predictedOpponents < sos.totalOpponents && (
                  <span className="text-[color:var(--color-label-tertiary)]"> ({sos.predictedOpponents}/{sos.totalOpponents})</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Info button for touch devices */}
          {(hasGameData || implied.hasAny) && (
            <button
              className="hidden p-1.5 rounded-full text-[color:var(--color-label-tertiary)] hover:text-[color:var(--color-accent)] hover:bg-tint-accent transition-colors touch-info-btn"
              onClick={(e) => {
                e.stopPropagation();
                setTooltipTeamId(showTooltip ? null : team.id);
              }}
              aria-label="View game picks"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          <div className="text-right">
            {record ? (
              <div>
                <div className="text-2xl font-display text-[color:var(--color-label)]">
                  {record.wins}-{record.losses}{record.ties > 0 && `-${record.ties}`}
                </div>
                <p className="text-xs text-[color:var(--color-label-secondary)] font-medium">
                  {record.divisionWins !== undefined ? `${record.divisionWins}-${6 - record.divisionWins} in division` : 'Click to edit'}
                </p>
                {implied.hasAny && (
                  <p className="text-[10px] text-[color:var(--color-accent)] font-medium">
                    {implied.divWins}W-{implied.divLosses}L{implied.divTies > 0 && `-${implied.divTies}T`} from matchups
                  </p>
                )}
              </div>
            ) : implied.hasAny ? (
              <div>
                <div className="text-lg font-display text-[color:var(--color-accent)]">
                  {implied.wins}-{implied.losses}{implied.ties > 0 && `-${implied.ties}`}
                </div>
                <p className="text-[10px] text-[color:var(--color-accent)] font-medium">
                  {implied.divWins}W-{implied.divLosses}L{implied.divTies > 0 && `-${implied.divTies}T`} div (from matchups)
                </p>
                <p className="text-xs text-[color:var(--color-label-tertiary)]">Click to predict</p>
              </div>
            ) : (
              <div>
                <span className="text-sm text-[color:var(--color-label-tertiary)] italic">Not set</span>
                <p className="text-xs text-[color:var(--color-label-secondary)]">Click to predict</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Game-by-game tooltip (portal) */}
      {showTooltip && (
        <GameTooltip
          team={team}
          allTeams={allTeams}
          predictions={predictions}
          onClose={() => setTooltipTeamId(null)}
          anchorRef={rowRef}
        />
      )}
    </div>
  );
};

// Collapsed team button with tooltip support
const CollapsedTeamButton = ({ team, record, allTeams, predictions, onTeamClick, showTooltip, hoverTimeout, setTooltipTeamId }) => {
  const btnRef = useRef(null);
  const hasData = record?.gameResults && Object.keys(record.gameResults).length > 0;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => onTeamClick(team)}
        className="flex flex-col items-center space-y-1 px-2 py-1 rounded-lg hover:bg-[color:var(--color-fill)] transition-colors"
        onMouseEnter={() => {
          hoverTimeout.current = setTimeout(() => setTooltipTeamId(team.id), 400);
        }}
        onMouseLeave={() => {
          clearTimeout(hoverTimeout.current);
          setTooltipTeamId(null);
        }}
      >
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.id}.png`}
          alt={team.name}
          className="w-8 h-8 object-contain"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className="text-xs font-mono font-semibold text-[color:var(--color-label-secondary)]">{team.id}</span>
        {record ? (
          <span className="text-sm font-display font-bold text-[color:var(--color-label)]">
            {record.wins}-{record.losses}{record.ties > 0 && `-${record.ties}`}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--color-label-tertiary)] italic">--</span>
        )}
      </button>
      {hasData && (
        <button
          className="hidden absolute -top-1 -right-1 p-0.5 rounded-full text-[color:var(--color-label-tertiary)] hover:text-[color:var(--color-accent)] bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-separator)] shadow-sm touch-info-btn"
          onClick={(e) => {
            e.stopPropagation();
            setTooltipTeamId(showTooltip ? null : team.id);
          }}
          aria-label="View game picks"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
      {showTooltip && (
        <GameTooltip
          team={team}
          allTeams={allTeams}
          predictions={predictions}
          onClose={() => setTooltipTeamId(null)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
};

const DivisionCard = ({ division, onTeamClick, getTeamRecord, predictions, allTeams, collapsed, onToggle }) => {
  const divisionTeams = getTeamsByDivision(allTeams, division);
  const conference = division.split(' ')[0];
  const predictedCount = divisionTeams.filter(t => getTeamRecord(t.id)).length;
  const allPredicted = predictedCount === 4;
  const [tooltipTeamId, setTooltipTeamId] = useState(null);
  const hoverTimeout = useRef(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!tooltipTeamId) return;
    const handleClick = () => setTooltipTeamId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [tooltipTeamId]);

  return (
    <div className="bg-[color:var(--color-bg-secondary)] rounded-lg shadow-md overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full p-4 ${conference === 'AFC' ? 'bg-[color:var(--color-accent)] hover:opacity-85' : 'bg-[color:var(--color-accent-red)] hover:opacity-85'} text-white transition-colors flex items-center justify-between`}
      >
        <h2 className="text-2xl font-display tracking-wider uppercase">{division}</h2>
        <div className="flex items-center space-x-3">
          {allPredicted && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">4/4</span>
          )}
          {!allPredicted && predictedCount > 0 && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">{predictedCount}/4</span>
          )}
          <svg
            className={`w-5 h-5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {collapsed ? (
        <div className="p-3 flex items-center justify-around">
          {divisionTeams.map(team => {
            const record = getTeamRecord(team.id);
            return (
              <CollapsedTeamButton
                key={team.id}
                team={team}
                record={record}
                allTeams={allTeams}
                predictions={predictions}
                onTeamClick={onTeamClick}
                showTooltip={tooltipTeamId === team.id}
                hoverTimeout={hoverTimeout}
                setTooltipTeamId={setTooltipTeamId}
              />
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--color-separator)]">
          {divisionTeams.map(team => {
            const record = getTeamRecord(team.id);
            const implied = getImpliedRecord(team.id, allTeams, predictions);
            const sos = getStrengthOfSchedule(team.id, allTeams, predictions);
            const hasGameData = record?.gameResults && Object.keys(record.gameResults).length > 0;
            const showTooltip = tooltipTeamId === team.id;

            return (
              <TeamRow
                key={team.id}
                team={team}
                record={record}
                implied={implied}
                sos={sos}
                hasGameData={hasGameData}
                showTooltip={showTooltip}
                allTeams={allTeams}
                predictions={predictions}
                onTeamClick={onTeamClick}
                hoverTimeout={hoverTimeout}
                setTooltipTeamId={setTooltipTeamId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const DIVISION_PAIRS = ['East', 'North', 'South', 'West'];

const LG_BREAKPOINT = 1024; // matches Tailwind's lg: breakpoint

const TeamList = ({ teams, onTeamClick, teamSearch = '', divisionFilter = '' }) => {
  const { getTeamRecord, predictions } = usePredictions();
  const [collapsedDivs, setCollapsedDivs] = useState({});

  const toggleDiv = (division) => {
    const isLg = window.innerWidth >= LG_BREAKPOINT;
    if (isLg) {
      // Two-column: toggle both AFC and NFC for this subdivision
      const subDiv = division.split(' ').slice(1).join(' ');
      const afc = `AFC ${subDiv}`;
      const nfc = `NFC ${subDiv}`;
      const newVal = !collapsedDivs[division];
      setCollapsedDivs(prev => ({ ...prev, [afc]: newVal, [nfc]: newVal }));
    } else {
      // Single-column: toggle only the clicked division
      setCollapsedDivs(prev => ({ ...prev, [division]: !prev[division] }));
    }
  };

  const query = teamSearch.toLowerCase().trim();
  const isFiltering = query !== '' || divisionFilter !== '';

  const divisionVisible = (division) => {
    if (divisionFilter && !division.startsWith(divisionFilter)) return false;
    if (query) {
      const divTeams = getTeamsByDivision(teams, division);
      return divTeams.some(t =>
        t.name.toLowerCase().includes(query) || t.id.toLowerCase().includes(query)
      );
    }
    return true;
  };

  const rows = DIVISION_PAIRS.flatMap(subDiv => {
    const afcDiv = `AFC ${subDiv}`;
    const nfcDiv = `NFC ${subDiv}`;
    const showAfc = divisionVisible(afcDiv);
    const showNfc = divisionVisible(nfcDiv);
    if (!showAfc && !showNfc) return [];
    if (showAfc && showNfc) {
      return [(
        <div key={subDiv} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DivisionCard division={afcDiv} onTeamClick={onTeamClick} getTeamRecord={getTeamRecord} predictions={predictions} allTeams={teams} collapsed={!!collapsedDivs[afcDiv]} onToggle={() => toggleDiv(afcDiv)} />
          <DivisionCard division={nfcDiv} onTeamClick={onTeamClick} getTeamRecord={getTeamRecord} predictions={predictions} allTeams={teams} collapsed={!!collapsedDivs[nfcDiv]} onToggle={() => toggleDiv(nfcDiv)} />
        </div>
      )];
    }
    const division = showAfc ? afcDiv : nfcDiv;
    return [(
      <DivisionCard key={division} division={division} onTeamClick={onTeamClick} getTeamRecord={getTeamRecord} predictions={predictions} allTeams={teams} collapsed={!!collapsedDivs[division]} onToggle={() => toggleDiv(division)} />
    )];
  });

  return (
    <div className="space-y-6">
      {rows}
      {isFiltering && rows.length === 0 && (
        <div className="text-center py-12 text-[color:var(--color-label-tertiary)]">
          <p className="text-sm">No teams match your search.</p>
        </div>
      )}
    </div>
  );
};

export default TeamList;
