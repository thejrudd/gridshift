import { useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import { getAllDivisions, getTeamsByDivision, sortTeamsByRecord } from '../../utils/scheduleParser';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme';

const SEASON_VIEWS = [
  { id: 'predictions', label: 'Picks' },
  { id: 'standings', label: 'Standings' },
  { id: 'playoffs', label: 'Playoffs' },
];

const PICK_MODES = [
  { id: 'record', label: 'Predict Record' },
  { id: 'advanced', label: 'Advanced Mode' },
];

const CONFERENCES = ['AFC', 'NFC'];
const DEFAULT_RECORD = { wins: 8, losses: 9, ties: 0, divisionWins: 3 };
const FULL_SEASON_GAMES = 17;
const DIVISION_GAMES = 6;
const NON_DIVISION_GAMES = 11;
const DIVISION_TOTAL_WINS = 12;

const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;

const getTeamLabel = (team) => team?.nickname || team?.name || team?.id || 'TBD';
const getTeamFullName = (team) => team?.name || [team?.city, team?.nickname].filter(Boolean).join(' ') || getTeamLabel(team);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeRecord = (record, options = {}) => {
  const allowTies = options.allowTies ?? true;
  const ties = allowTies
    ? clamp(Number(record?.ties ?? DEFAULT_RECORD.ties) || 0, 0, FULL_SEASON_GAMES)
    : 0;
  const wins = clamp(Number(record?.wins ?? DEFAULT_RECORD.wins) || 0, 0, FULL_SEASON_GAMES - ties);
  const losses = FULL_SEASON_GAMES - wins - ties;
  const divisionMin = options.divisionMin ?? 0;
  const divisionMax = options.divisionMax ?? Math.min(DIVISION_GAMES, wins);
  const safeDivisionMin = clamp(divisionMin, 0, DIVISION_GAMES);
  const safeDivisionMax = Math.max(safeDivisionMin, clamp(divisionMax, 0, DIVISION_GAMES));
  const divisionWins = clamp(
    Number(record?.divisionWins ?? Math.min(DEFAULT_RECORD.divisionWins, wins)) || 0,
    safeDivisionMin,
    safeDivisionMax,
  );
  return { wins, losses, ties, divisionWins };
};

const isRecordSet = (record) => Boolean(
  record?.recordSource
  || record?.manualOverride
  || Object.keys(record?.gameResults ?? {}).length
  || record?.wins
  || record?.losses
  || record?.ties,
);

const getTeamsWithEnteredRecords = (teams, records = {}) => (
  teams.filter((team) => isRecordSet(records?.[team.id]))
);

const filterPlayoffSeedsToEnteredRecords = (playoffSeeds, enteredTeams) => {
  if (!playoffSeeds) return null;
  const enteredTeamIds = new Set(enteredTeams.map((team) => team.id));
  return Object.fromEntries(CONFERENCES.map((conference) => [
    conference,
    (playoffSeeds[conference] ?? []).filter((team) => enteredTeamIds.has(team?.id)),
  ]));
};

const getEditableRecord = (record, options = {}) => normalizeRecord(isRecordSet(record) ? record : DEFAULT_RECORD, options);

const getNoTieDivisionRange = (record) => {
  const wins = Number(record?.wins ?? DEFAULT_RECORD.wins) || 0;
  return {
    min: clamp(wins - NON_DIVISION_GAMES, 0, DIVISION_GAMES),
    max: clamp(wins, 0, DIVISION_GAMES),
  };
};

const sameRecord = (a, b) => (
  (a?.wins ?? 0) === (b?.wins ?? 0)
  && (a?.losses ?? 0) === (b?.losses ?? 0)
  && (a?.ties ?? 0) === (b?.ties ?? 0)
  && (a?.divisionWins ?? 0) === (b?.divisionWins ?? 0)
);

const getChooseRecord = (record) => getEditableRecord(record, { allowTies: false });

const clampChooseRecord = (record) => {
  const normalized = normalizeRecord(record, { allowTies: false });
  const range = getNoTieDivisionRange(normalized);
  return normalizeRecord(normalized, {
    allowTies: false,
    divisionMin: range.min,
    divisionMax: range.max,
  });
};

const rebalanceDivisionRecords = (divisionTeams, records, targetTeamId, targetRecord) => {
  const draft = new Map(divisionTeams.map((team) => [team.id, clampChooseRecord(getChooseRecord(records[team.id]))]));
  draft.set(targetTeamId, clampChooseRecord(targetRecord));

  const adjust = (amount, direction, preferredTeamIds) => {
    let remaining = amount;
    let guard = 0;
    while (remaining > 0 && guard < DIVISION_GAMES * divisionTeams.length) {
      guard += 1;
      let moved = false;
      for (const teamId of preferredTeamIds) {
        const record = draft.get(teamId);
        const range = getNoTieDivisionRange(record);
        if (direction === -1 && record.divisionWins > range.min) {
          draft.set(teamId, { ...record, divisionWins: record.divisionWins - 1 });
          remaining -= 1;
          moved = true;
        } else if (direction === 1 && record.divisionWins < range.max) {
          draft.set(teamId, { ...record, divisionWins: record.divisionWins + 1 });
          remaining -= 1;
          moved = true;
        }
        if (remaining === 0) break;
      }
      if (!moved) break;
    }
    return amount - remaining;
  };

  const getTotal = () => [...draft.values()].reduce((sum, record) => sum + record.divisionWins, 0);
  const otherTeamIds = divisionTeams.map((team) => team.id).filter((teamId) => teamId !== targetTeamId);
  const preferredReduce = [...otherTeamIds].sort((a, b) => draft.get(b).divisionWins - draft.get(a).divisionWins);
  const preferredIncrease = [...otherTeamIds].sort((a, b) => draft.get(a).divisionWins - draft.get(b).divisionWins);

  let total = getTotal();
  if (total > DIVISION_TOTAL_WINS) {
    const excess = total - DIVISION_TOTAL_WINS;
    const moved = adjust(excess, -1, preferredReduce);
    if (moved < excess) adjust(excess - moved, -1, [targetTeamId]);
  }

  total = getTotal();
  if (total < DIVISION_TOTAL_WINS) {
    const deficit = DIVISION_TOTAL_WINS - total;
    // Preserve the number the user just picked; only fill available room on rivals.
    adjust(deficit, 1, preferredIncrease);
  }

  return [...draft.entries()]
    .map(([teamId, record]) => [teamId, clampChooseRecord(record)])
    .filter(([teamId, record]) => !sameRecord(record, getChooseRecord(records[teamId])) || teamId === targetTeamId);
};

const getTeamRowStyle = (team, darkMode) => {
  const theme = getTeamVisualTheme(team?.id, darkMode, { logoSide: 'start' });
  if (!theme?.gradient) return undefined;
  return {
    '--prediction-team-gradient': theme.gradient,
    '--prediction-team-overlay': theme.gradientOverlay,
    '--prediction-team-fg': theme.gradientFullForeground ?? theme.gradientForeground,
    '--prediction-team-muted': theme.gradientFullMuted ?? theme.gradientMuted,
    '--prediction-team-subtle': theme.gradientFullSubtle ?? theme.gradientSubtle,
    '--prediction-team-border': theme.borderColor,
  };
};

const recordLabel = (record) => {
  if (!isRecordSet(record)) return '-';
  const ties = record.ties ? `-${record.ties}` : '';
  return `${record.wins ?? 0}-${record.losses ?? 0}${ties}`;
};

const recordStatusLabel = (record) => (isRecordSet(record) ? recordLabel(record) : 'No record yet');

const divisionRecordLabel = (record) => {
  if (!isRecordSet(record)) return 'Division -';
  const divisionWins = record?.divisionWins ?? 0;
  return `Division ${divisionWins}-${DIVISION_GAMES - divisionWins}`;
};

const normalizeWeek = (week, index = 0) => ({
  id: String(week?.id ?? week?.week ?? index + 1),
  label: week?.label ?? `Week ${week?.week ?? index + 1}`,
  games: Array.isArray(week?.games) ? week.games : [],
});

const getTeamIdFromGameValue = (value) => {
  if (typeof value === 'string') return value.toUpperCase();
  return value?.id ?? null;
};

const formatKickoff = (value) => {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeGame = (game, teamsById, index = 0, weekId = '1') => {
  const awayId = game?.awayId
    ?? game?.awayTeamId
    ?? getTeamIdFromGameValue(game?.awayTeam)
    ?? game?.away;
  const homeId = game?.homeId
    ?? game?.homeTeamId
    ?? getTeamIdFromGameValue(game?.homeTeam)
    ?? game?.home;
  const neutral = Boolean(game?.neutralSite || game?.neutral);

  return {
    id: String(game?.id ?? game?.gameId ?? `${weekId}-${awayId || 'away'}-${homeId || 'home'}-${index}`),
    week: String(game?.week ?? weekId),
    label: game?.label,
    awayGameIndex: Number.isInteger(game?.awayGameIndex) ? game.awayGameIndex : null,
    homeGameIndex: Number.isInteger(game?.homeGameIndex) ? game.homeGameIndex : null,
    awayTeam: teamsById.get(awayId) ?? { id: awayId, name: awayId },
    homeTeam: teamsById.get(homeId) ?? { id: homeId, name: homeId },
    dateLabel: game?.dateLabel ?? game?.date ?? formatKickoff(game?.kickoff) ?? game?.time,
    network: game?.network,
    venue: game?.venue ?? game?.location,
    neutral,
  };
};

const buildFallbackWeeks = (teams, teamsById) => {
  const maxGames = Math.max(0, ...teams.map((team) => team.opponents?.length ?? 0));

  return Array.from({ length: maxGames }, (_, weekIndex) => {
    const seen = new Set();
    const games = [];

    teams.forEach((team) => {
      const opponentId = team.opponents?.[weekIndex];
      if (!opponentId) return;
      const key = [team.id, opponentId].sort().join('-');
      if (seen.has(key)) return;
      seen.add(key);

      const opponent = teamsById.get(opponentId) ?? { id: opponentId, name: opponentId };
      games.push({
        id: `${weekIndex + 1}-${team.id}-${opponentId}`,
        week: String(weekIndex + 1),
        awayTeam: team,
        homeTeam: opponent,
      });
    });

    return { id: String(weekIndex + 1), label: `Week ${weekIndex + 1}`, games };
  });
};

const getWeeks = ({ scheduleData, weeks, gamesByWeek, teams, teamsById }) => {
  if (Array.isArray(weeks) && weeks.length) {
    return weeks.map((week, index) => {
      const normalizedWeek = normalizeWeek(week, index);
      return {
        ...normalizedWeek,
        games: normalizedWeek.games.map((game, gameIndex) => normalizeGame(game, teamsById, gameIndex, normalizedWeek.id)),
      };
    });
  }

  if (gamesByWeek && typeof gamesByWeek === 'object') {
    return Object.entries(gamesByWeek).map(([weekId, games], index) => ({
      id: String(weekId),
      label: `Week ${weekId}`,
      games: (Array.isArray(games) ? games : []).map((game, gameIndex) => normalizeGame(game, teamsById, gameIndex, weekId)),
      sort: Number(weekId) || index,
    })).sort((a, b) => a.sort - b.sort);
  }

  const scheduleWeeks = scheduleData?.weeks ?? scheduleData?.scheduleWeeks;
  if (Array.isArray(scheduleWeeks) && scheduleWeeks.length) {
    return getWeeks({ weeks: scheduleWeeks, teams, teamsById });
  }

  const scheduleGames = scheduleData?.games ?? scheduleData?.schedule;
  if (Array.isArray(scheduleGames) && scheduleGames.length) {
    const byWeek = scheduleGames.reduce((acc, game) => {
      const weekId = String(game.week ?? game.weekNumber ?? 1);
      acc[weekId] = acc[weekId] ?? [];
      acc[weekId].push(game);
      return acc;
    }, {});
    return getWeeks({ gamesByWeek: byWeek, teams, teamsById });
  }

  return buildFallbackWeeks(teams, teamsById);
};

const getPickWinner = (picks, game) => {
  const value = picks?.[game.id];
  if (!value || typeof value === 'string') return value;
  return value.winnerId ?? value.winner ?? value.pick ?? null;
};

const getRecordFromPicks = (teams, weeks, picks) => {
  const records = Object.fromEntries(teams.map((team) => [team.id, { wins: 0, losses: 0, ties: 0, divisionWins: 0 }]));

  weeks.forEach((week) => {
    week.games.forEach((game) => {
      const awayId = game.awayTeam?.id;
      const homeId = game.homeTeam?.id;
      const winner = getPickWinner(picks, game);
      if (!awayId || !homeId || !winner) return;

      if (winner === 'T') {
        records[awayId].ties += 1;
        records[homeId].ties += 1;
      } else if (winner === awayId) {
        records[awayId].wins += 1;
        records[homeId].losses += 1;
      } else if (winner === homeId) {
        records[homeId].wins += 1;
        records[awayId].losses += 1;
      }
    });
  });

  return records;
};

const getDisplayRecords = (teams, weeks, picks, predictions, standings) => {
  if (standings && typeof standings === 'object') return standings;
  const pickRecords = getRecordFromPicks(teams, weeks, picks);

  return Object.fromEntries(teams.map((team) => {
    const predictionRecord = predictions?.[team.id];
    return [team.id, predictionRecord ?? pickRecords[team.id] ?? { wins: 0, losses: 0, ties: 0, divisionWins: 0 }];
  }));
};

const sortByRecord = (teams, records) => [...teams].sort((a, b) => {
  const aRecord = records[a.id] ?? {};
  const bRecord = records[b.id] ?? {};
  const aWins = aRecord.wins ?? 0;
  const bWins = bRecord.wins ?? 0;
  const aLosses = aRecord.losses ?? 0;
  const bLosses = bRecord.losses ?? 0;
  if (bWins !== aWins) return bWins - aWins;
  if (aLosses !== bLosses) return aLosses - bLosses;
  return getTeamLabel(a).localeCompare(getTeamLabel(b));
});

const getPlayoffSeeds = (teams, records) => Object.fromEntries(CONFERENCES.map((conference) => {
  const divisions = getAllDivisions().filter((division) => division.startsWith(conference));
  const divisionWinners = [];
  const wildCards = [];

  divisions.forEach((division) => {
    const divisionTeams = getTeamsByDivision(teams, division);
    const sortedDivision = sortByRecord(divisionTeams, records);
    if (sortedDivision[0]) divisionWinners.push(sortedDivision[0]);
    wildCards.push(...sortedDivision.slice(1));
  });

  const seeds = [
    ...sortByRecord(divisionWinners, records),
    ...sortByRecord(wildCards, records).slice(0, 3),
  ].slice(0, 7);

  return [conference, seeds];
}));

const getTeamGames = (team, weeks) => {
  const rows = [];
  weeks.forEach((week) => {
    const startIndex = rows.length;
    week.games.forEach((game) => {
      const isAway = game.awayTeam?.id === team.id;
      const isHome = game.homeTeam?.id === team.id;
      if (!isAway && !isHome) return;
      rows.push({
        game,
        weekLabel: week.label,
        opponent: isAway ? game.homeTeam : game.awayTeam,
        isAway,
        gameIndex: Number.isInteger(isAway ? game.awayGameIndex : game.homeGameIndex)
          ? (isAway ? game.awayGameIndex : game.homeGameIndex)
          : rows.length,
      });
    });

    if (rows.length === startIndex) {
      rows.push({
        game: null,
        weekLabel: week.label,
        opponent: null,
        isAway: false,
        isBye: true,
        team,
        gameIndex: null,
      });
    }
  });
  return rows;
};

const getRecordFromTeamGameResults = (team, teamGames, gameResults) => {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let divisionWins = 0;

  teamGames.forEach((row) => {
    const result = gameResults?.[row.gameIndex];
    if (!result) return;
    if (result === 'W') {
      wins += 1;
      if (row.opponent?.division === team.division) divisionWins += 1;
    } else if (result === 'L') {
      losses += 1;
    } else if (result === 'T') {
      ties += 1;
    }
  });

  return { wins, losses, ties, divisionWins, recordSource: 'games' };
};

function TeamIdentity({ team, seed, compact = false }) {
  return (
    <div className={`predictions-team-identity${compact ? ' predictions-team-identity--compact' : ''}`}>
      {seed && <span className="predictions-seed-badge">{seed}</span>}
      {team?.id && (
        <img
          className="predictions-team-logo"
          src={teamLogo(team.id)}
          alt=""
          loading="lazy"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="predictions-team-copy">
        <span className="predictions-team-code">{team?.id ?? 'TBD'}</span>
        {!compact && <span className="predictions-team-name">{getTeamFullName(team)}</span>}
      </div>
    </div>
  );
}

function ViewTabs({ seasonView, onSeasonViewChange }) {
  return (
    <div className="predictions-redesign-tabs" role="tablist" aria-label="Predictions views">
      {SEASON_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={`predictions-redesign-tab${seasonView === view.id ? ' is-active' : ''}`}
          aria-selected={seasonView === view.id}
          role="tab"
          onClick={() => onSeasonViewChange?.(view.id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

function PickModeToggle({ pickMode, onPickModeChange }) {
  return (
    <div className="predictions-segmented-control" role="group" aria-label="Pick entry mode">
      {PICK_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`predictions-segment${pickMode === mode.id ? ' is-active' : ''}`}
          aria-pressed={pickMode === mode.id}
          onClick={() => onPickModeChange?.(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange, showValue = true }) {
  const normalizedLabel = label.toLowerCase();

  return (
    <div className="predictions-record-stepper" aria-label={`${label}: ${showValue ? value : 'not set'}`}>
      <button
        type="button"
        aria-label={`Decrease ${normalizedLabel}`}
        onClick={() => onChange(clamp(value - 1, min, max))}
        disabled={value <= min}
      >
        -
      </button>
      <span>{showValue ? value : '-'}</span>
      <button
        type="button"
        aria-label={`Increase ${normalizedLabel}`}
        onClick={() => onChange(clamp(value + 1, min, max))}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}

function RecordControls({
  record,
  onChange,
  compact = false,
  showTies = true,
  divisionMode = 'details',
  valuesVisible = true,
}) {
  const current = normalizeRecord(record, { allowTies: showTies });
  const getDivisionRange = (nextRecord) => showTies
    ? { min: 0, max: Math.min(DIVISION_GAMES, nextRecord.wins) }
    : getNoTieDivisionRange(nextRecord);
  const divisionRange = getDivisionRange(current);
  const normalizeNext = (nextRecord) => {
    const normalized = normalizeRecord(nextRecord, { allowTies: showTies });
    const nextDivisionRange = getDivisionRange(normalized);
    return normalizeRecord(normalized, {
      allowTies: showTies,
      divisionMin: nextDivisionRange.min,
      divisionMax: nextDivisionRange.max,
    });
  };
  const updateWins = (wins) => onChange(normalizeNext({ ...current, wins }));
  const updateTies = (ties) => onChange(normalizeNext({ ...current, ties }));
  const updateDivisionWins = (divisionWins) => {
    const nextDivisionWins = clamp(divisionWins, 0, DIVISION_GAMES);
    // Let Division move directly, then nudge Wins only when needed to keep the record possible.
    const nextWins = showTies
      ? current.wins
      : clamp(current.wins, nextDivisionWins, NON_DIVISION_GAMES + nextDivisionWins);
    onChange(normalizeNext({ ...current, wins: nextWins, divisionWins: nextDivisionWins }));
  };
  const divisionStepperRange = showTies ? divisionRange : { min: 0, max: DIVISION_GAMES };
  const divisionControl = (
    <label className="predictions-record-division-stepper">
      <span>Division</span>
      <Stepper
        label="Division wins"
        value={current.divisionWins}
        min={divisionStepperRange.min}
        max={divisionStepperRange.max}
        showValue={valuesVisible}
        onChange={updateDivisionWins}
      />
    </label>
  );

  return (
    <div className={`predictions-record-controls${compact ? ' predictions-record-controls--compact' : ''}`}>
      <div className="predictions-record-primary">
        <div className="predictions-record-value">
          <strong>{recordLabel(current)}</strong>
          <span>Projected</span>
        </div>
        <div className="predictions-record-steppers">
          <label>
            <span>Wins</span>
            <Stepper
              label="Wins"
              value={current.wins}
              min={0}
              max={FULL_SEASON_GAMES - current.ties}
              showValue={valuesVisible}
              onChange={updateWins}
            />
          </label>
          {showTies ? (
            <label>
              <span>Ties</span>
              <Stepper
                label="Ties"
                value={current.ties}
                min={0}
                max={FULL_SEASON_GAMES}
                showValue={valuesVisible}
                onChange={updateTies}
              />
            </label>
          ) : divisionControl}
        </div>
      </div>
      {showTies && divisionMode === 'details' && (
        <details className="predictions-division-control">
          <summary>Division</summary>
          <div>
            <span>{current.divisionWins}-{DIVISION_GAMES - current.divisionWins}</span>
            <Stepper
              label="Division wins"
              value={current.divisionWins}
              min={divisionStepperRange.min}
              max={divisionStepperRange.max}
              showValue={valuesVisible}
              onChange={updateDivisionWins}
            />
          </div>
        </details>
      )}
    </div>
  );
}

function RecordTeamRow({ team, record, onRecordChange, darkMode }) {
  const editableRecord = getChooseRecord(record);
  const recordIsSet = isRecordSet(record);

  return (
    <article className="predictions-record-row predictions-team-gradient-row" style={getTeamRowStyle(team, darkMode)}>
      <TeamIdentity team={team} />
      <div className="predictions-record-row-status">
        <strong>{recordStatusLabel(record)}</strong>
        {recordIsSet && <span>{divisionRecordLabel(record)}</span>}
      </div>
      <RecordControls
        compact
        showTies={false}
        divisionMode="inline"
        valuesVisible={recordIsSet}
        record={editableRecord}
        onChange={(nextRecord) => onRecordChange?.({ teamId: team.id, record: nextRecord })}
      />
    </article>
  );
}

function AdvancedTeamRow({ team, record, onOpenTeam, darkMode }) {
  const [isHovered, setIsHovered] = useState(false);
  const theme = getTeamVisualTheme(team?.id, darkMode, { logoSide: 'start' });
  const accentColor = theme?.borderColor ?? theme?.color ?? 'var(--color-accent)';
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isHovered,
    color: accentColor,
    cardColor: theme?.color ?? null,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: accentColor,
  });

  return (
    <button
      type="button"
      className="predictions-advanced-team-row predictions-team-gradient-row"
      style={{
        ...getTeamRowStyle(team, darkMode),
        boxShadow: glowShadow ?? 'none',
      }}
      onClick={() => onOpenTeam?.(team)}
      onMouseMove={glowHandlers.onMouseMove}
      onMouseEnter={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onBlur={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
    >
      {borderOverlay}
      <TeamIdentity team={team} />
      <div className="predictions-record-row-status predictions-advanced-team-status">
        <strong>{recordStatusLabel(record)}</strong>
        {isRecordSet(record) && <span>{divisionRecordLabel(record)}</span>}
      </div>
    </button>
  );
}

function DivisionRecordGroup({ division, teams, records, onRecordChange, advanced = false, onOpenTeam, darkMode }) {
  const handleRecordChange = ({ teamId, record }) => {
    rebalanceDivisionRecords(teams, records, teamId, record).forEach(([balancedTeamId, balancedRecord]) => {
      onRecordChange?.({ teamId: balancedTeamId, record: balancedRecord });
    });
  };

  return (
    <section className="predictions-record-group">
      <header className="predictions-division-header">
        <span>{division}</span>
      </header>
      <div className="predictions-record-group-list">
        {teams.map((team) => advanced ? (
          <AdvancedTeamRow
            key={team.id}
            team={team}
            record={records[team.id]}
            onOpenTeam={onOpenTeam}
            darkMode={darkMode}
          />
        ) : (
          <RecordTeamRow
            key={team.id}
            team={team}
            record={records[team.id]}
            onRecordChange={handleRecordChange}
            darkMode={darkMode}
          />
        ))}
      </div>
    </section>
  );
}

function SchedulePendingState() {
  return (
    <div className="predictions-empty-state">
      <p className="predictions-eyebrow">Schedule pending</p>
      <h3>Games will appear here</h3>
      <p>
        Drop the released NFL schedule into <span>public/season-schedule.json</span> to unlock team game picks.
      </p>
    </div>
  );
}

export function PredictionsPicks({
  teams = [],
  weeks = [],
  pickMode = 'record',
  onPickModeChange,
  records = {},
  onRecordChange,
  onOpenTeam,
  darkMode = false,
}) {
  return (
    <section className="predictions-picks-view">
      <div className="predictions-control-bar">
        <PickModeToggle pickMode={pickMode} onPickModeChange={onPickModeChange} />
      </div>

      <div className="predictions-week-layout">
        <div className="predictions-record-board">
          <header className="predictions-section-header">
            <p className="predictions-eyebrow">{pickMode === 'record' ? 'Record-first picks' : 'Team drilldown'}</p>
            <h2>{pickMode === 'record' ? 'Predict Record' : 'Advanced Mode'}</h2>
          </header>
          <div className="predictions-record-grid">
            {getAllDivisions().map((division) => (
              <DivisionRecordGroup
                key={division}
                division={division}
                teams={getTeamsByDivision(teams, division)}
                records={records}
                onRecordChange={onRecordChange}
                advanced={pickMode === 'advanced'}
                onOpenTeam={onOpenTeam}
                darkMode={darkMode}
              />
            ))}
          </div>
        </div>
        <PlayoffPictureRail teams={teams} weeks={weeks} records={records} />
      </div>
    </section>
  );
}

const gameResultClass = (result) => {
  if (result === 'W') return 'is-win';
  if (result === 'L') return 'is-loss';
  if (result === 'T') return 'is-tie';
  return '';
};

function GamePickButton({ value, active, onClick }) {
  return (
    <button
      type="button"
      className={`predictions-game-result-button ${gameResultClass(value)}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {value}
    </button>
  );
}

function TeamGameRow({ row, result, onResultChange, darkMode = false }) {
  const setResult = (nextResult) => onResultChange(result === nextResult ? undefined : nextResult);
  const rowTheme = getTeamRowStyle(row.isBye ? row.team : row.opponent, darkMode);

  return (
    <article
      className={`predictions-team-game-row predictions-team-gradient-row ${gameResultClass(result)}${result ? ' is-picked' : ''}${row.isBye ? ' is-bye' : ''}`}
      style={rowTheme}
    >
      <div className="predictions-team-game-meta">
        <span>{row.weekLabel}</span>
        {row.isBye ? <span>No game</span> : row.game?.dateLabel && <span>{row.game.dateLabel}</span>}
      </div>
      <div className="predictions-team-game-opponent">
        {row.isBye ? (
          <>
            <span className="predictions-team-game-marker" aria-hidden="true" />
            <div className="predictions-team-identity predictions-team-identity--compact predictions-bye-identity">
              <span className="predictions-team-logo predictions-bye-logo-spacer" aria-hidden="true" />
              <div className="predictions-team-copy">
                <span className="predictions-team-code predictions-bye-label">BYE</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="predictions-team-game-marker">{row.isAway ? '@' : 'vs'}</span>
            <TeamIdentity team={row.opponent} compact />
          </>
        )}
      </div>
      {row.isBye ? (
        <div className="predictions-team-game-actions predictions-team-game-actions--bye">—</div>
      ) : (
        <div className="predictions-team-game-actions">
          {['W', 'L', 'T'].map((value) => (
            <GamePickButton
              key={value}
              value={value}
              active={result === value}
              onClick={() => setResult(value)}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function AdvancedTeamPage({
  team,
  weeks,
  records,
  predictions,
  onBack,
  onSaveTeamGameResults,
  darkMode = false,
}) {
  const savedRecord = records[team.id];
  const [draftGameResults, setDraftGameResults] = useState(() => ({ ...(predictions?.[team.id]?.gameResults ?? {}) }));
  const [gamePicksTouched, setGamePicksTouched] = useState(false);
  const teamGames = useMemo(() => getTeamGames(team, weeks), [team, weeks]);
  const hasDraftGameResults = Object.keys(draftGameResults).length > 0;
  const draftRecord = useMemo(
    () => getRecordFromTeamGameResults(team, teamGames, draftGameResults),
    [draftGameResults, team, teamGames],
  );
  const displayedRecord = gamePicksTouched || hasDraftGameResults ? draftRecord : savedRecord;

  const saveGameResults = () => {
    const saved = onSaveTeamGameResults?.({ teamId: team.id, gameResults: draftGameResults });
    setGamePicksTouched(false);
    if (saved !== false) onBack?.();
  };
  const resetGameResults = () => {
    setDraftGameResults({ ...(predictions?.[team.id]?.gameResults ?? {}) });
    setGamePicksTouched(false);
  };

  return (
    <section className="predictions-team-page">
      <button type="button" className="predictions-back-button" onClick={onBack}>
        <span aria-hidden="true">←</span>
        <span>Advanced Mode</span>
      </button>

      <header className="predictions-team-page-header predictions-team-gradient-row" style={getTeamRowStyle(team, darkMode)}>
        <TeamIdentity team={team} />
        <div>
          <p className="predictions-eyebrow">{team.division}</p>
          <h2>{recordLabel(displayedRecord)}</h2>
          <span>{divisionRecordLabel(displayedRecord)}</span>
        </div>
      </header>

      <div className="predictions-team-page-panel">
        <header className="predictions-team-game-header">
          <p className="predictions-eyebrow">Advanced Mode</p>
          <h2>Game Picks</h2>
        </header>
        {teamGames.length ? (
          <div className="predictions-team-game-list">
            {teamGames.map((row) => (
              <TeamGameRow
                key={row.game?.id ?? `${team.id}-${row.weekLabel}-bye`}
                row={row}
                result={draftGameResults[row.gameIndex]}
                darkMode={darkMode}
                onResultChange={(result) => {
                  setGamePicksTouched(true);
                  setDraftGameResults((prev) => {
                    const next = { ...prev };
                    if (result) next[row.gameIndex] = result;
                    else delete next[row.gameIndex];
                    return next;
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <SchedulePendingState />
        )}
        <div className="predictions-team-page-actions">
          <button type="button" onClick={resetGameResults}>Cancel</button>
          <button type="button" className="is-primary" onClick={saveGameResults}>Save Game Picks</button>
        </div>
      </div>
    </section>
  );
}

const divisionShortRecordLabel = (record) => {
  if (!isRecordSet(record)) return '-';
  const divisionWins = record?.divisionWins ?? 0;
  return `${divisionWins}-${DIVISION_GAMES - divisionWins}`;
};

function StandingRow({ team, record, rank, darkMode = false }) {
  return (
    <tr className="predictions-standings-row" style={getTeamRowStyle(team, darkMode)}>
      <td>
        <span className="predictions-rank">{rank}</span>
      </td>
      <td>
        <TeamIdentity team={team} compact />
      </td>
      <td>{recordLabel(record)}</td>
      <td>{divisionShortRecordLabel(record)}</td>
    </tr>
  );
}

export function PredictionsStandings({ teams = [], records = {}, predictions = {} }) {
  const { darkMode } = useTheme();

  return (
    <section className="predictions-standings-view">
      <header className="predictions-section-header">
        <p className="predictions-eyebrow">Editorial standings</p>
        <h2>Projected Division Standings</h2>
      </header>

      <div className="predictions-standings-grid">
        {getAllDivisions().map((division) => {
          const divisionTeams = getTeamsByDivision(teams, division);
          const sortedTeams = Object.keys(predictions).length
            ? sortTeamsByRecord(divisionTeams, predictions, teams)
            : sortByRecord(divisionTeams, records);

          return (
            <section key={division} className="predictions-division-table">
              <header className="predictions-division-header">
                <span>{division}</span>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>Record</th>
                    <th>Div</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((team, index) => (
                    <StandingRow
                      key={team.id}
                      team={team}
                      record={records[team.id] ?? predictions[team.id]}
                      rank={index + 1}
                      darkMode={darkMode}
                    />
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function PlayoffPictureRail({ teams = [], weeks = [], records }) {
  const displayRecords = records ?? getRecordFromPicks(teams, weeks, {});
  const enteredTeams = getTeamsWithEnteredRecords(teams, displayRecords);
  const seedsByConference = getPlayoffSeeds(enteredTeams, displayRecords);

  return (
    <aside className="predictions-playoff-picture-rail" aria-label="Desktop playoff picture">
      <header>
        <p className="predictions-eyebrow">Playoff picture</p>
        <h3>Live Seeds</h3>
      </header>
      {!enteredTeams.length ? (
        <div className="predictions-rail-empty">
          <p className="predictions-eyebrow">Waiting on picks</p>
          <span>Seeds appear after you predict at least one record.</span>
        </div>
      ) : (
        CONFERENCES.map((conference) => (
          <section key={conference} className="predictions-rail-conference">
            <h4>{conference}</h4>
            <ol>
              {(seedsByConference[conference] ?? []).map((team, index) => (
                <li key={team.id}>
                  <TeamIdentity team={team} seed={index + 1} compact />
                  <span>{recordLabel(displayRecords[team.id])}</span>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </aside>
  );
}

function PlayoffTeamButton({ team, seed, picked, onPick }) {
  return (
    <button
      type="button"
      className={`predictions-playoff-team${picked ? ' is-picked' : ''}`}
      aria-pressed={picked}
      disabled={!team?.id}
      onClick={() => team?.id && onPick?.(team.id)}
    >
      <TeamIdentity team={team} seed={seed} compact />
    </button>
  );
}

function BracketMatchup({ id, label, top, bottom, picks, onPlayoffPick }) {
  const winnerId = picks?.[id];

  return (
    <article className="predictions-bracket-matchup">
      <header>{label}</header>
      <div className="predictions-bracket-teams">
        <PlayoffTeamButton
          team={top?.team}
          seed={top?.seed}
          picked={winnerId === top?.team?.id}
          onPick={(winnerId) => onPlayoffPick?.({ matchupId: id, winnerId })}
        />
        <PlayoffTeamButton
          team={bottom?.team}
          seed={bottom?.seed}
          picked={winnerId === bottom?.team?.id}
          onPick={(winnerId) => onPlayoffPick?.({ matchupId: id, winnerId })}
        />
      </div>
    </article>
  );
}

const getTeamSeedNumber = (team, seeds = []) => {
  const index = seeds.findIndex((seededTeam) => seededTeam?.id === team?.id);
  return index >= 0 ? index + 1 : null;
};

function ChampionTeamPanel({ team, seed, conference, record, winner, onPick, align = 'start' }) {
  const { darkMode } = useTheme();

  if (!team) return null;

  return (
    <button
      type="button"
      className={`predictions-champion-team predictions-champion-team--${align}${winner ? ' is-winner' : ' is-runner-up'}`}
      style={winner ? getTeamRowStyle(team, darkMode) : undefined}
      aria-pressed={winner}
      onClick={() => onPick?.(team.id)}
    >
      <img src={teamLogo(team.id)} alt="" className="predictions-champion-logo" loading="lazy" />
      <span className="predictions-champion-team-copy">
        {winner && <span className="predictions-champion-winner-badge">Selected champion</span>}
        <span className="predictions-champion-seed">{conference} - {seed ? `${seed} seed` : 'champion'}</span>
        <strong>{getTeamLabel(team)}</strong>
        <span>{recordLabel(record)} {winner ? 'projected' : 'runner-up'}</span>
      </span>
    </button>
  );
}

function SuperBowlChampionCard({ teams, seedsByConference, records, picks, onPlayoffPick }) {
  const [afcTeam, nfcTeam] = teams;
  const winnerId = picks?.['super-bowl'];

  if (!winnerId) {
    return (
      <section className="predictions-super-bowl-card">
        <header>Super Bowl</header>
        <BracketMatchup
          id="super-bowl"
          label="AFC vs NFC"
          top={{ seed: null, team: afcTeam }}
          bottom={{ seed: null, team: nfcTeam }}
          picks={picks}
          onPlayoffPick={onPlayoffPick}
        />
      </section>
    );
  }

  return (
    <section className="predictions-super-bowl-card predictions-super-bowl-card--champion">
      <header>Super Bowl</header>
      <div className="predictions-champion-banner">
        <ChampionTeamPanel
          team={afcTeam}
          seed={getTeamSeedNumber(afcTeam, seedsByConference.AFC)}
          conference="AFC"
          record={records[afcTeam?.id]}
          winner={winnerId === afcTeam?.id}
          onPick={(teamId) => onPlayoffPick?.({ matchupId: 'super-bowl', winnerId: teamId })}
        />
        <div className="predictions-champion-center" aria-live="polite">
          <span>★ Super Bowl</span>
          <strong>Champion</strong>
          <span>Projected winner</span>
        </div>
        <ChampionTeamPanel
          team={nfcTeam}
          seed={getTeamSeedNumber(nfcTeam, seedsByConference.NFC)}
          conference="NFC"
          record={records[nfcTeam?.id]}
          winner={winnerId === nfcTeam?.id}
          onPick={(teamId) => onPlayoffPick?.({ matchupId: 'super-bowl', winnerId: teamId })}
          align="end"
        />
      </div>
    </section>
  );
}

function ConferenceBracket({ conference, seeds, picks, onPlayoffPick }) {
  const seed = (number) => ({ seed: number, team: seeds[number - 1] });
  const wildCardWinners = {
    [`${conference}-wc-2-7`]: seeds.find((team) => team.id === picks?.[`${conference}-wc-2-7`]),
    [`${conference}-wc-3-6`]: seeds.find((team) => team.id === picks?.[`${conference}-wc-3-6`]),
    [`${conference}-wc-4-5`]: seeds.find((team) => team.id === picks?.[`${conference}-wc-4-5`]),
  };
  const divisionalTeams = Object.values(wildCardWinners).filter(Boolean);
  const lowestRemaining = [...divisionalTeams].reverse()[0];
  const remainingDivisionalTeams = divisionalTeams.filter((team) => team.id !== lowestRemaining?.id);

  return (
    <section className="predictions-conference-bracket">
      <header className="predictions-division-header">
        <span>{conference}</span>
      </header>
      <div className="predictions-bracket-rounds">
        <div className="predictions-bracket-round">
          <h3>Wild Card</h3>
          <BracketMatchup id={`${conference}-wc-2-7`} label="2 vs 7" top={seed(2)} bottom={seed(7)} picks={picks} onPlayoffPick={onPlayoffPick} />
          <BracketMatchup id={`${conference}-wc-3-6`} label="3 vs 6" top={seed(3)} bottom={seed(6)} picks={picks} onPlayoffPick={onPlayoffPick} />
          <BracketMatchup id={`${conference}-wc-4-5`} label="4 vs 5" top={seed(4)} bottom={seed(5)} picks={picks} onPlayoffPick={onPlayoffPick} />
        </div>
        <div className="predictions-bracket-round">
          <h3>Divisional</h3>
          <BracketMatchup
            id={`${conference}-div-1`}
            label="1 seed matchup"
            top={seed(1)}
            bottom={{ seed: lowestRemaining ? seeds.findIndex((team) => team.id === lowestRemaining.id) + 1 : null, team: lowestRemaining }}
            picks={picks}
            onPlayoffPick={onPlayoffPick}
          />
          <BracketMatchup
            id={`${conference}-div-2`}
            label="Remaining seeds"
            top={{
              seed: remainingDivisionalTeams[0] ? seeds.findIndex((team) => team.id === remainingDivisionalTeams[0].id) + 1 : null,
              team: remainingDivisionalTeams[0],
            }}
            bottom={{
              seed: remainingDivisionalTeams[1] ? seeds.findIndex((team) => team.id === remainingDivisionalTeams[1].id) + 1 : null,
              team: remainingDivisionalTeams[1],
            }}
            picks={picks}
            onPlayoffPick={onPlayoffPick}
          />
        </div>
        <div className="predictions-bracket-round">
          <h3>Conference</h3>
          <BracketMatchup
            id={`${conference}-championship`}
            label={`${conference} Championship`}
            top={{ seed: null, team: seeds.find((team) => team.id === picks?.[`${conference}-div-1`]) }}
            bottom={{ seed: null, team: seeds.find((team) => team.id === picks?.[`${conference}-div-2`]) }}
            picks={picks}
            onPlayoffPick={onPlayoffPick}
          />
        </div>
      </div>
    </section>
  );
}

export function PredictionsPlayoffs({
  teams = [],
  records = {},
  playoffSeeds,
  playoffPicks = {},
  onPlayoffPick,
}) {
  const enteredTeams = getTeamsWithEnteredRecords(teams, records);
  const enteredPlayoffSeeds = filterPlayoffSeedsToEnteredRecords(playoffSeeds, enteredTeams);
  const seedsByConference = enteredTeams.length
    ? (enteredPlayoffSeeds ?? getPlayoffSeeds(enteredTeams, records))
    : Object.fromEntries(CONFERENCES.map((conference) => [conference, []]));
  const superBowlTeams = CONFERENCES.map((conference) => seedsByConference[conference]?.find((team) => team.id === playoffPicks[`${conference}-championship`]));

  return (
    <section className="predictions-playoffs-view">
      <header className="predictions-section-header">
        <p className="predictions-eyebrow">Manual-pick playoffs</p>
        <h2>Choose Every Matchup Winner</h2>
      </header>

      {!enteredTeams.length ? (
        <div className="predictions-empty-state">
          <p className="predictions-eyebrow">Waiting on records</p>
          <h3>Select Team Records</h3>
          <p>
            Predict records in <span>Picks</span> before building the playoff bracket.
          </p>
        </div>
      ) : (
        <>
          <div className="predictions-playoffs-layout">
            {CONFERENCES.map((conference) => (
              <ConferenceBracket
                key={conference}
                conference={conference}
                seeds={seedsByConference[conference] ?? []}
                picks={playoffPicks}
                onPlayoffPick={onPlayoffPick}
              />
            ))}
          </div>

          <SuperBowlChampionCard
            teams={superBowlTeams}
            seedsByConference={seedsByConference}
            records={records}
            picks={playoffPicks}
            onPlayoffPick={onPlayoffPick}
          />
        </>
      )}
    </section>
  );
}

export default function PredictionsRedesign({
  teams: teamsProp,
  scheduleData,
  seasonView = 'predictions',
  onSeasonViewChange,
  pickMode = 'record',
  onPickModeChange,
  selectedTeamId,
  picks = {},
  predictions = {},
  standings,
  playoffSeeds,
  playoffPicks = {},
  onPlayoffPick,
  onRecordChange,
  onSaveTeamGameResults,
  onOpenTeam,
  onBackToAdvancedMode,
  showInternalTabs = false,
}) {
  const { darkMode } = useTheme();
  const teams = useMemo(() => teamsProp ?? scheduleData?.teams ?? [], [teamsProp, scheduleData]);
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const weeks = useMemo(() => getWeeks({ scheduleData, teams, teamsById }), [scheduleData, teams, teamsById]);
  const records = useMemo(
    () => getDisplayRecords(teams, weeks, picks, predictions, standings),
    [teams, weeks, picks, predictions, standings],
  );
  const selectedTeam = selectedTeamId ? teamsById.get(String(selectedTeamId).toUpperCase()) : null;

  return (
    <div className="predictions-redesign">
      {showInternalTabs && (
        <ViewTabs seasonView={seasonView} onSeasonViewChange={onSeasonViewChange} />
      )}

      {seasonView === 'predictions' && selectedTeam && (
        <AdvancedTeamPage
          key={selectedTeam.id}
          team={selectedTeam}
          weeks={weeks}
          records={records}
          predictions={predictions}
          onBack={onBackToAdvancedMode}
          onSaveTeamGameResults={onSaveTeamGameResults}
          darkMode={darkMode}
        />
      )}

      {seasonView === 'predictions' && !selectedTeam && (
        <PredictionsPicks
          teams={teams}
          weeks={weeks}
          pickMode={pickMode}
          onPickModeChange={onPickModeChange}
          records={records}
          onRecordChange={onRecordChange}
          onOpenTeam={onOpenTeam}
          darkMode={darkMode}
        />
      )}

      {seasonView === 'standings' && (
        <PredictionsStandings teams={teams} records={records} predictions={predictions} />
      )}

      {seasonView === 'playoffs' && (
        <PredictionsPlayoffs
          teams={teams}
          records={records}
          playoffSeeds={playoffSeeds}
          playoffPicks={playoffPicks}
          onPlayoffPick={onPlayoffPick}
        />
      )}
    </div>
  );
}
