import { normalizeIDPPos } from './idpEngine';

export function getStatValue(source, ...keys) {
  if (!source) return null;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function getFantasyContribution(key, statsMap, position, scoringSettings) {
  if (!key || !statsMap || !scoringSettings) return null;
  const normalizedPosition = normalizeIDPPos(position) ?? position;

  switch (key) {
    case 'completions':
      return (getStatValue(statsMap, 'completions') ?? 0) * (scoringSettings.pass_cmp ?? 0);
    case 'passingAttempts':
      return (getStatValue(statsMap, 'passingAttempts') ?? 0) * (scoringSettings.pass_att ?? 0);
    case 'passingYards':
      return (getStatValue(statsMap, 'passingYards') ?? 0) * (scoringSettings.pass_yd ?? 0);
    case 'passingTouchdowns':
      return (getStatValue(statsMap, 'passingTouchdowns') ?? 0) * (scoringSettings.pass_td ?? 0);
    case 'interceptions':
      if (normalizedPosition === 'QB') return (getStatValue(statsMap, 'interceptions') ?? 0) * (scoringSettings.pass_int ?? 0);
      if (['DL', 'LB', 'DB'].includes(normalizedPosition)) return (getStatValue(statsMap, 'interceptions') ?? 0) * (scoringSettings.idp_int ?? 0);
      return null;
    case 'rushingAttempts':
      return normalizedPosition === 'RB' ? (getStatValue(statsMap, 'rushingAttempts') ?? 0) * (scoringSettings.bonus_rush_att ?? 0) : null;
    case 'rushingYards':
      return (getStatValue(statsMap, 'rushingYards') ?? 0) * (scoringSettings.rush_yd ?? 0);
    case 'rushingTouchdowns':
      return (getStatValue(statsMap, 'rushingTouchdowns') ?? 0) * (scoringSettings.rush_td ?? 0);
    case 'receptions': {
      const value = getStatValue(statsMap, 'receptions') ?? 0;
      let total = value * (scoringSettings.rec ?? 0);
      if (normalizedPosition === 'TE') total += value * (scoringSettings.bonus_rec_te ?? 0);
      if (normalizedPosition === 'RB') total += value * (scoringSettings.bonus_rec_rb ?? 0);
      if (normalizedPosition === 'WR') total += value * (scoringSettings.bonus_rec_wr ?? 0);
      return total;
    }
    case 'receivingYards':
      return (getStatValue(statsMap, 'receivingYards') ?? 0) * (scoringSettings.rec_yd ?? 0);
    case 'receivingTouchdowns':
      return (getStatValue(statsMap, 'receivingTouchdowns') ?? 0) * (scoringSettings.rec_td ?? 0);
    case 'fumbles':
      return (getStatValue(statsMap, 'fumbles') ?? 0) * (scoringSettings.fum ?? 0);
    case 'fumblesLost':
      return (getStatValue(statsMap, 'fumblesLost') ?? 0) * (scoringSettings.fum_lost ?? 0);
    case 'totalTackles':
    case 'tackles':
      return (getStatValue(statsMap, 'totalTackles', 'tackles') ?? 0) * (scoringSettings.idp_tkl ?? 0);
    case 'soloTackles':
      return (getStatValue(statsMap, 'soloTackles') ?? 0) * (scoringSettings.idp_tkl_solo ?? 0);
    case 'assistedTackles':
      return (getStatValue(statsMap, 'assistedTackles') ?? 0) * (scoringSettings.idp_tkl_ast ?? 0);
    case 'sacks':
      if (normalizedPosition === 'QB') return (getStatValue(statsMap, 'sacks') ?? 0) * (scoringSettings.pass_sack ?? 0);
      if (['DL', 'LB', 'DB'].includes(normalizedPosition)) return (getStatValue(statsMap, 'sacks') ?? 0) * (scoringSettings.idp_sack ?? 0);
      return null;
    case 'tacklesForLoss':
      return (getStatValue(statsMap, 'tacklesForLoss') ?? 0) * (scoringSettings.idp_tkl_loss ?? 0);
    case 'passesDefended':
      return (getStatValue(statsMap, 'passesDefended') ?? 0) * (scoringSettings.idp_pd ?? 0);
    case 'QBHits':
      return (getStatValue(statsMap, 'QBHits') ?? 0) * (scoringSettings.idp_qbhit ?? 0);
    case 'fieldGoalsMade':
      return (getStatValue(statsMap, 'fieldGoalsMade') ?? 0) * (scoringSettings.fgm ?? 0);
    case 'extraPointsMade':
      return (getStatValue(statsMap, 'extraPointsMade') ?? 0) * (scoringSettings.xpm ?? 0);
    default:
      return null;
  }
}

export function getSleeperFantasyContribution(key, totals, position, scoringSettings) {
  if (!key || !totals || !scoringSettings) return null;

  const normalizedPosition = normalizeIDPPos(position) ?? position;

  switch (key) {
    case 'completions':
      return (getStatValue(totals, 'pass_cmp') ?? 0) * (scoringSettings.pass_cmp ?? 0);
    case 'passingAttempts':
      return (getStatValue(totals, 'pass_att') ?? 0) * (scoringSettings.pass_att ?? 0);
    case 'passingYards':
      return (getStatValue(totals, 'pass_yd') ?? 0) * (scoringSettings.pass_yd ?? 0);
    case 'passingTouchdowns':
      return (getStatValue(totals, 'pass_td') ?? 0) * (scoringSettings.pass_td ?? 0);
    case 'interceptions':
      if (normalizedPosition === 'QB') return (getStatValue(totals, 'pass_int') ?? 0) * (scoringSettings.pass_int ?? 0);
      if (['DL', 'LB', 'DB'].includes(normalizedPosition)) return (getStatValue(totals, 'idp_int') ?? 0) * (scoringSettings.idp_int ?? 0);
      return null;
    case 'rushingAttempts':
      return normalizedPosition === 'RB' ? (getStatValue(totals, 'rush_att') ?? 0) * (scoringSettings.bonus_rush_att ?? 0) : null;
    case 'rushingYards':
      return (getStatValue(totals, 'rush_yd') ?? 0) * (scoringSettings.rush_yd ?? 0);
    case 'rushingTouchdowns':
      return (getStatValue(totals, 'rush_td') ?? 0) * (scoringSettings.rush_td ?? 0);
    case 'receptions': {
      const value = getStatValue(totals, 'rec') ?? 0;
      let total = value * (scoringSettings.rec ?? 0);
      if (normalizedPosition === 'TE') total += value * (scoringSettings.bonus_rec_te ?? 0);
      if (normalizedPosition === 'RB') total += value * (scoringSettings.bonus_rec_rb ?? 0);
      if (normalizedPosition === 'WR') total += value * (scoringSettings.bonus_rec_wr ?? 0);
      return total;
    }
    case 'receivingYards':
      return (getStatValue(totals, 'rec_yd') ?? 0) * (scoringSettings.rec_yd ?? 0);
    case 'receivingTouchdowns':
      return (getStatValue(totals, 'rec_td') ?? 0) * (scoringSettings.rec_td ?? 0);
    case 'fumbles':
      return (getStatValue(totals, 'fum') ?? 0) * (scoringSettings.fum ?? 0);
    case 'fumblesLost':
      return (getStatValue(totals, 'fum_lost') ?? 0) * (scoringSettings.fum_lost ?? 0);
    case 'totalTackles':
    case 'tackles':
      return (getStatValue(totals, 'idp_tkl') ?? 0) * (scoringSettings.idp_tkl ?? 0);
    case 'soloTackles':
      return (getStatValue(totals, 'idp_tkl_solo') ?? 0) * (scoringSettings.idp_tkl_solo ?? 0);
    case 'assistedTackles':
      return (getStatValue(totals, 'idp_tkl_ast') ?? 0) * (scoringSettings.idp_tkl_ast ?? 0);
    case 'sacks':
      if (normalizedPosition === 'QB') return (getStatValue(totals, 'pass_sack') ?? 0) * (scoringSettings.pass_sack ?? 0);
      if (['DL', 'LB', 'DB'].includes(normalizedPosition)) return (getStatValue(totals, 'idp_sack') ?? 0) * (scoringSettings.idp_sack ?? 0);
      return null;
    case 'tacklesForLoss':
      return (getStatValue(totals, 'idp_tkl_loss') ?? 0) * (scoringSettings.idp_tkl_loss ?? 0);
    case 'passesDefended':
      return (getStatValue(totals, 'idp_pd', 'idp_pass_def') ?? 0) * (scoringSettings.idp_pd ?? 0);
    case 'QBHits':
      return (getStatValue(totals, 'idp_qbhit', 'idp_qb_hit') ?? 0) * (scoringSettings.idp_qbhit ?? 0);
    case 'fieldGoalsMade':
      return (getStatValue(totals, 'fgm') ?? 0) * (scoringSettings.fgm ?? 0);
    case 'extraPointsMade':
      return (getStatValue(totals, 'xpm') ?? 0) * (scoringSettings.xpm ?? 0);
    default:
      return null;
  }
}

export function buildFantasyRankByKey(sleeperSeasonStats, sleeperPlayers, scoringSettings) {
  if (!sleeperSeasonStats || !sleeperPlayers || !scoringSettings) return new Map();

  const supportedKeys = [
    'completions',
    'passingAttempts',
    'passingYards',
    'passingTouchdowns',
    'interceptions',
    'rushingAttempts',
    'rushingYards',
    'rushingTouchdowns',
    'receptions',
    'receivingYards',
    'receivingTouchdowns',
    'fumbles',
    'fumblesLost',
    'totalTackles',
    'tackles',
    'soloTackles',
    'assistedTackles',
    'sacks',
    'tacklesForLoss',
    'passesDefended',
    'QBHits',
    'fieldGoalsMade',
    'extraPointsMade',
  ];

  return new Map(
    supportedKeys.map((key) => {
      const rankedEntries = Object.entries(sleeperSeasonStats)
        .map(([sleeperId, totals]) => {
          const position = sleeperPlayers[sleeperId]?.position ?? null;
          const fantasyPoints = getSleeperFantasyContribution(key, totals, position, scoringSettings);
          return fantasyPoints != null && fantasyPoints !== 0 ? { sleeperId, fantasyPoints } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);

      const rankMap = new Map();
      let previousScore = null;
      let previousRank = 0;

      rankedEntries.forEach((entry, index) => {
        const rank = previousScore != null && entry.fantasyPoints === previousScore ? previousRank : index + 1;
        rankMap.set(entry.sleeperId, rank);
        previousScore = entry.fantasyPoints;
        previousRank = rank;
      });

      return [key, rankMap];
    }),
  );
}
