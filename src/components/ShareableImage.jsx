import { forwardRef } from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ReactGridLayout } from 'react-grid-layout/legacy';
import { getBestAndWorstTeams, getToughestDivision, getBoldPredictions, getConferenceChampions, getDivisionWinners, getWorstDivision, getStrengthOfScheduleExtremes, getClosestDivisionRace, getWildCardTeams, getParityIndex } from '../utils/exportStats';
import {
  RGL_TOTAL_ROWS,
  PREVIEW_GRID_W, PREVIEW_GRID_H, PREVIEW_GAP, PREVIEW_PAD, PREVIEW_ROW_HEIGHT,
  SECTION_ORDER, getPreviewCellInfo,
} from '../utils/layoutUtils';

const LOGO_URL = (id) => `/logos/${id}.png`;

// Clamp helper
const C = (val, max) => Math.min(val, max);

// Shared section title style — scales by both height and width
const sTitle = (h, w, color = 'text-gray-200') => ({
  fontSize: C(Math.min(h * 0.10, w * 0.12), 22),
  style: { letterSpacing: '0.15em', marginBottom: 6, textShadow: '0 1px 4px rgba(0,0,0,0.5)', overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.2 },
  className: `font-bold uppercase ${color} text-center shrink-0`,
});

// --- Main ---

const ShareableImage = forwardRef(({ predictions, teams, enabledSections, userName, rglLayout, onLayoutChange, onDragStop, onResizeStop }, ref) => {
  const stats = {
    bestWorst: getBestAndWorstTeams(predictions, teams),
    toughestDiv: getToughestDivision(predictions, teams),
    worstDiv: getWorstDivision(predictions, teams),
    bold: getBoldPredictions(predictions, teams),
    confChamps: getConferenceChampions(predictions, teams),
    afcWinners: getDivisionWinners(predictions, teams, 'AFC'),
    nfcWinners: getDivisionWinners(predictions, teams, 'NFC'),
    sos: getStrengthOfScheduleExtremes(predictions, teams),
    closestRace: getClosestDivisionRace(predictions, teams),
    wildCard: getWildCardTeams(predictions, teams),
    parity: getParityIndex(predictions, teams),
  };

  const activeSections = SECTION_ORDER.filter(k => enabledSections[k]);
  const count = activeSections.length;

  const renderSection = (key, info) => {
    const p = { stats, predictions, ...info };
    switch (key) {
      case 'bestWorst': return <BestWorstSection {...p} />;
      case 'playoffSeeds': return <PlayoffSeedsSection {...p} />;
      case 'divisionWinners': return <DivisionWinnersSection {...p} />;
      case 'conferenceShowdown': return <ConferenceShowdownSection {...p} />;
      case 'toughestDivision': return <ToughestDivisionSection {...p} />;
      case 'boldPredictions': return <BoldPredictionsSection {...p} />;
      case 'worstDivision': return <WorstDivisionSection {...p} />;
      case 'strengthOfSchedule': return <StrengthOfScheduleSection {...p} />;
      case 'closestRace': return <ClosestRaceSection {...p} />;
      case 'wildCard': return <WildCardSection {...p} />;
      case 'parityIndex': return <ParityIndexSection {...p} />;
      default: return null;
    }
  };

  const renderInteractiveGrid = () => {
    if (!rglLayout || rglLayout.length === 0) return null;

    return (
      <ReactGridLayout
        layout={rglLayout}
        cols={4}
        rowHeight={PREVIEW_ROW_HEIGHT}
        width={PREVIEW_GRID_W}
        margin={[PREVIEW_GAP, PREVIEW_GAP]}
        containerPadding={[0, 0]}
        isDraggable={true}
        isResizable={true}
        isBounded={true}
        onLayoutChange={onLayoutChange}
        onDragStop={onDragStop}
        onResizeStop={onResizeStop}
        compactType="vertical"
        maxRows={RGL_TOTAL_ROWS}
        resizeHandles={['se']}
        style={{ minHeight: PREVIEW_GRID_H, userSelect: 'none' }}
      >
        {activeSections.map((key) => {
          const item = rglLayout.find(l => l.i === key);
          if (!item) return null;
          const info = getPreviewCellInfo(item.w, item.h);
          return (
            <div
              key={key}
              style={{ borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: PREVIEW_PAD }}
              className="bg-gray-800/80 border border-gray-700/50"
            >
              {renderSection(key, info)}
            </div>
          );
        })}
      </ReactGridLayout>
    );
  };

  const scale = 0.7;
  const containerW = 1080 * scale;
  const containerH = 1080 * scale;

  return (
    <div
      ref={ref}
      style={{ width: containerW, height: containerH, fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", userSelect: 'none', WebkitUserSelect: 'none' }}
      className="bg-gray-900 text-white flex flex-col overflow-hidden"
    >
      <div style={{ padding: `${20 * scale}px ${24 * scale}px ${10 * scale}px` }} className="text-center shrink-0">
        <h1 style={{ fontSize: 38 * scale, fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.1 }}>NFL SEASON PREDICTOR</h1>
        <p style={{ fontSize: 13 * scale, marginTop: 2 * scale, letterSpacing: '0.05em' }} className="text-blue-400 font-semibold">2026 SEASON</p>
        {userName && <p style={{ fontSize: 11 * scale, marginTop: 1 }} className="text-gray-400">Predictions by {userName}</p>}
      </div>

      {count > 0 ? (
        <div style={{ flex: 1, padding: `${4 * scale}px ${16 * scale}px ${10 * scale}px`, minHeight: 0 }}>
          {renderInteractiveGrid()}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ fontSize: 16 * scale }} className="text-gray-500">Enable sections to build your graphic</p>
        </div>
      )}

      <div style={{ padding: `${2 * scale}px 0 ${10 * scale}px`, fontSize: 9 * scale }} className="text-center text-gray-600 shrink-0">nfl-predictor</div>
    </div>
  );
});

ShareableImage.displayName = 'ShareableImage';

// ============================================================
// BEST & WORST — sizes derived from cell pixel dimensions
// ============================================================

const BestWorstSection = ({ stats, predictions, w, h, aspect }) => {
  if (!stats.bestWorst.best) return null;
  const vert = aspect < 0.9;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const cardW = vert ? w : (w - 8) / 2;
  const cardH = vert ? (contentH - 8) / 2 : contentH;
  // Budget: label ~7%, logo ~40%, name ~14%, record ~20% = ~81% with margins
  const totalBudget = cardH * 0.85;
  const logo = C(Math.min(cardW * 0.48, totalBudget * 0.48), 180);
  const nameF = C(Math.min(totalBudget * 0.16, cardW * 0.24), 60);
  const recF = C(Math.min(totalBudget * 0.22, cardW * 0.30), 80);
  const labelF = C(Math.min(totalBudget * 0.07, cardW * 0.09), 20);

  const card = (label, team, record, accent) => {
    const c = accent === 'green'
      ? { text: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-700/50' }
      : { text: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700/50' };
    return (
      <div className={`flex-1 ${c.bg} border ${c.border} rounded-xl flex flex-col items-center justify-center min-h-0`} style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: labelF, letterSpacing: '0.12em' }} className={`font-bold ${c.text} shrink-0`}>{label}</div>
        <img src={LOGO_URL(team.id)} alt="" className="shrink-0" style={{ width: logo, height: logo, objectFit: 'contain', marginTop: logo * 0.04 }} />
        <div className="shrink-0" style={{ fontSize: nameF, fontWeight: 700, marginTop: nameF * 0.08, lineHeight: 1 }}>{team.id}</div>
        <div className={`shrink-0 ${c.text}`} style={{ fontSize: recF, fontWeight: 700, lineHeight: 1 }}>
          {record?.wins}-{record?.losses}{record?.ties > 0 ? `-${record.ties}` : ''}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Best & Worst Records</div>
      <div className={`flex flex-1 min-h-0 ${vert ? 'flex-col' : 'flex-row'}`} style={{ gap: 8 }}>
        {card('BEST', stats.bestWorst.best, predictions[stats.bestWorst.best.id], 'green')}
        {card('WORST', stats.bestWorst.worst, predictions[stats.bestWorst.worst.id], 'red')}
      </div>
    </div>
  );
};

// ============================================================
// PLAYOFF SEEDS — rows evenly distributed, sized to cell
// ============================================================

const PlayoffSeedsSection = ({ stats, predictions, w, h, aspect }) => {
  const vert = aspect < 0.6;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const listW = vert ? w : (w - 8) / 2;
  const listH = vert ? (contentH - 8) / 2 : contentH;
  const seedCount = 7;
  const hdrF = C(Math.min(listH * 0.10, listW * 0.10), 22);
  const innerH = listH - hdrF - 8; // padding accounted
  const rowH = innerH / seedCount;

  // Constrain all row items by BOTH rowH and listW so nothing overflows horizontally
  const logoSz = C(Math.min(rowH * 0.75, listW * 0.18), 52);
  const numSz = C(Math.min(rowH * 0.60, listW * 0.14), 34);
  const nameF = C(Math.min(rowH * 0.55, listW * 0.14), 28);
  const recF = C(Math.min(rowH * 0.45, listW * 0.11), 22);
  const rowGap = C(Math.min(rowH * 0.15, listW * 0.02), 8);

  const list = (conf, winners, color) => {
    const top = winners.slice(0, seedCount);
    const hdr = color === 'blue' ? 'text-blue-400' : 'text-red-400';
    const bg = color === 'blue' ? 'bg-blue-900/20 border-blue-800/40' : 'bg-red-900/20 border-red-800/40';
    const pad = Math.round(Math.min(listH * 0.02, listW * 0.03));
    return (
      <div className={`${bg} border rounded-xl flex-1 flex flex-col min-h-0`} style={{ padding: `${pad}px ${pad + 2}px`, overflow: 'hidden' }}>
        <div style={{ fontSize: hdrF, letterSpacing: '0.1em' }} className={`font-bold ${hdr} shrink-0`}>{conf}</div>
        <div className="flex flex-col flex-1 justify-evenly min-h-0">
          {top.map((team, i) => (
            <div key={team.id} className="flex items-center min-w-0" style={{ gap: rowGap }}>
              <span
                style={{ width: numSz, height: numSz, fontSize: numSz * 0.5 }}
                className="font-bold flex items-center justify-center rounded-full bg-gray-700 text-white shrink-0"
              >{i + 1}</span>
              <img src={LOGO_URL(team.id)} alt="" className="shrink-0" style={{ width: logoSz, height: logoSz, objectFit: 'contain' }} />
              <span className="truncate" style={{ fontSize: nameF, fontWeight: 700, minWidth: 0 }}>{team.id}</span>
              <span style={{ fontSize: recF }} className="text-gray-400 ml-auto shrink-0">
                {predictions[team.id]?.wins}-{predictions[team.id]?.losses}
              </span>
            </div>
          ))}
        </div>
        {top.length === 0 && <div style={{ fontSize: 10 }} className="text-gray-500 italic flex-1 flex items-center justify-center">Predict full divisions</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Playoff Seeds</div>
      <div className={`flex flex-1 min-h-0 ${vert ? 'flex-col' : 'flex-row'}`} style={{ gap: 8 }}>
        {list('AFC', stats.afcWinners, 'blue')}
        {list('NFC', stats.nfcWinners, 'red')}
      </div>
    </div>
  );
};

// ============================================================
// DIVISION WINNERS — items fill grid cells
// ============================================================

const DivisionWinnersSection = ({ stats, predictions, w, h, aspect }) => {
  const allWinners = [...stats.afcWinners, ...stats.nfcWinners];
  const cols = aspect >= 2.5 ? 8 : aspect < 0.8 ? 2 : 4;
  const rows = Math.ceil(allWinners.length / cols) || 1;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const itemH = (contentH - (rows - 1) * 6) / rows;
  const itemW = (w - (cols - 1) * 6) / cols;
  const logo = C(Math.min(itemH * 0.50, itemW * 0.58), 100);
  const nameF = C(Math.min(itemH * 0.22, itemW * 0.30), 36);
  const recF = C(Math.min(itemH * 0.17, itemW * 0.24), 26);
  const divF = C(Math.min(itemH * 0.12, itemW * 0.17), 16);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Division Winners</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, flex: 1, alignContent: 'stretch' }}>
        {allWinners.map(team => (
          <div key={team.id} className="bg-gray-700/40 rounded-lg flex flex-col items-center justify-center">
            <img src={LOGO_URL(team.id)} alt="" style={{ width: logo, height: logo, objectFit: 'contain' }} />
            <div style={{ fontSize: nameF, fontWeight: 700, marginTop: 2, lineHeight: 1 }}>{team.id}</div>
            <div style={{ fontSize: recF, lineHeight: 1.1 }} className="text-gray-400">
              {predictions[team.id]?.wins}-{predictions[team.id]?.losses}
            </div>
            <div style={{ fontSize: divF }} className="text-gray-500">{team.division}</div>
          </div>
        ))}
        {allWinners.length === 0 && (
          <div style={{ gridColumn: '1 / -1', fontSize: 12 }} className="text-gray-500 italic text-center self-center">
            Predict full divisions to see winners
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// CONFERENCE SHOWDOWN — cards stretch, content sized to cell
// ============================================================

const ConferenceShowdownSection = ({ stats, predictions, w, h, aspect }) => {
  if (!stats.confChamps.AFC || !stats.confChamps.NFC) return null;
  const vert = aspect < 0.85;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const vsSize = vert ? C(contentH * 0.05, 24) : C(w * 0.03, 28);
  const cardW = vert ? w : (w - vsSize - 16) / 2;
  const cardH = vert ? (contentH - vsSize - 12) / 2 : contentH;
  const totalBudget = cardH * 0.85;
  const logo = C(Math.min(cardW * 0.48, totalBudget * 0.48), 160);
  const nameF = C(Math.min(totalBudget * 0.18, cardW * 0.22), 56);
  const recF = C(Math.min(totalBudget * 0.15, cardW * 0.18), 44);
  const labelF = C(Math.min(totalBudget * 0.07, cardW * 0.07), 18);

  const card = (team, color) => {
    const conf = color === 'blue' ? 'AFC' : 'NFC';
    const bg = color === 'blue' ? 'bg-blue-900/25 border-blue-800/40' : 'bg-red-900/25 border-red-800/40';
    const txt = color === 'blue' ? 'text-blue-400' : 'text-red-400';
    return (
      <div className={`${bg} border rounded-xl flex-1 flex flex-col items-center justify-center min-h-0`} style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: labelF, letterSpacing: '0.1em' }} className={`font-bold ${txt} shrink-0`}>{conf}</div>
        <img src={LOGO_URL(team.id)} alt="" className="shrink-0" style={{ width: logo, height: logo, objectFit: 'contain', marginTop: logo * 0.04 }} />
        <div className="shrink-0" style={{ fontSize: nameF, fontWeight: 700, marginTop: nameF * 0.08, lineHeight: 1 }}>{team.id}</div>
        <div className={`font-bold ${txt} shrink-0`} style={{ fontSize: recF, lineHeight: 1, marginTop: recF * 0.06 }}>
          {predictions[team.id]?.wins}-{predictions[team.id]?.losses}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Conference Showdown</div>
      <div className={`flex flex-1 min-h-0 items-stretch ${vert ? 'flex-col' : 'flex-row'}`} style={{ gap: 6 }}>
        {card(stats.confChamps.AFC, 'blue')}
        <div className="flex items-center justify-center shrink-0">
          <span style={{ fontSize: vsSize, lineHeight: 1 }} className="font-bold text-gray-600">VS</span>
        </div>
        {card(stats.confChamps.NFC, 'red')}
      </div>
    </div>
  );
};

// ============================================================
// TOUGHEST DIVISION — all elements sized from cell dimensions
// ============================================================

const ToughestDivisionSection = ({ stats, w, h, aspect }) => {
  if (!stats.toughestDiv) return null;
  const t = sTitle(h, w, 'text-amber-400');
  const contentH = h - t.fontSize - 6;
  const wide = aspect > 1.4;

  const divNameF = C(Math.min(contentH * (wide ? 0.30 : 0.18), w * 0.14), 72);
  const subtitleF = C(Math.min(contentH * (wide ? 0.14 : 0.08), w * 0.08), 28);
  const logoBudget = wide ? Math.min(contentH * 0.7, (w * 0.5) / 2) : (contentH - divNameF - subtitleF - 24) / 2;
  const logoSize = C(Math.min(logoBudget, w / 5), 110);
  const logoGap = C(Math.min(w * 0.03, 16), 16);

  if (wide) {
    return (
      <div className="flex flex-col flex-1 min-h-0" style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Toughest Division</div>
        <div className="flex-1 flex items-center min-h-0" style={{ gap: 16 }}>
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div style={{ fontSize: divNameF, fontWeight: 700, lineHeight: 1, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-amber-400">{stats.toughestDiv.division}</div>
            <div style={{ fontSize: subtitleF, marginTop: 4, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-gray-300">{stats.toughestDiv.totalWins} combined wins</div>
          </div>
          <div className="flex flex-wrap justify-center items-center shrink-0" style={{ gap: logoGap }}>
            {stats.toughestDiv.teams.map(tm => (
              <img key={tm.id} src={LOGO_URL(tm.id)} alt="" style={{ width: logoSize, height: logoSize, objectFit: 'contain' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ overflow: 'hidden' }}>
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Toughest Division</div>
      <div className="flex-1 flex flex-col items-center justify-center min-h-0" style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: divNameF, fontWeight: 700, lineHeight: 1, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-amber-400 shrink-0">{stats.toughestDiv.division}</div>
        <div style={{ fontSize: subtitleF, marginTop: 4, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-gray-300 shrink-0">{stats.toughestDiv.totalWins} combined wins</div>
        <div className="flex justify-center flex-wrap shrink-0" style={{ gap: logoGap, marginTop: 8 }}>
          {stats.toughestDiv.teams.map(tm => (
            <img key={tm.id} src={LOGO_URL(tm.id)} alt="" style={{ width: logoSize, height: logoSize, objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// BOLD PREDICTIONS — chips sized to cell, adapts direction
// ============================================================

const BoldPredictionsSection = ({ stats, predictions, w, h, aspect }) => {
  const { highFlyers, cellarDwellers } = stats.bold;
  if (highFlyers.length === 0 && cellarDwellers.length === 0) return null;

  const hasBoth = highFlyers.length > 0 && cellarDwellers.length > 0;
  const sideBySide = hasBoth && aspect >= 1.6;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const groupH = hasBoth ? (sideBySide ? contentH : (contentH - 8) / 2) : contentH;
  const groupW = sideBySide ? (w - 12) / 2 : w;
  const labelF = C(groupH * 0.10, 20);
  const innerH = groupH - labelF - 8;

  const chipGroup = (items, color, label) => {
    const bg = color === 'green' ? 'bg-green-900/40 border-green-800/50' : 'bg-red-900/40 border-red-800/50';
    const txt = color === 'green' ? 'text-green-400' : 'text-red-400';
    const chipBg = color === 'green' ? 'bg-green-900/60 border-green-700/50' : 'bg-red-900/60 border-red-700/50';

    const n = items.length;
    const innerAR = groupW / innerH;
    const cols = n <= 1 ? 1 : n <= 2 ? 2 : innerAR > 2 ? Math.min(n, 4) : innerAR > 1.2 ? Math.min(n, 3) : Math.min(n, 2);
    const rows = Math.ceil(n / cols) || 1;
    const cellW = (groupW - (cols - 1) * 6) / cols;
    const cellH = (innerH - (rows - 1) * 6) / rows;
    const logo = C(Math.min(cellW * 0.45, cellH * 0.42), 90);
    const nameF = C(Math.min(cellW * 0.30, cellH * 0.22), 34);
    const recF = C(Math.min(cellW * 0.22, cellH * 0.18), 26);

    return (
      <div className={`${bg} border rounded-xl flex-1 flex flex-col min-h-0`} style={{ padding: `${Math.round(groupH * 0.02)}px ${Math.round(groupW * 0.02)}px` }}>
        <div style={{ fontSize: labelF, letterSpacing: '0.08em' }} className={`${txt} font-bold text-center shrink-0`}>{label}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, flex: 1, alignContent: 'stretch' }}>
          {items.map(t => (
            <div key={t.id} className={`${chipBg} border rounded-lg flex flex-col items-center justify-center`}>
              <img src={LOGO_URL(t.id)} alt="" style={{ width: logo, height: logo, objectFit: 'contain' }} />
              <span style={{ fontSize: nameF, fontWeight: 700, lineHeight: 1, marginTop: 2 }}>{t.id}</span>
              <span style={{ fontSize: recF, lineHeight: 1 }} className="text-gray-400">{predictions[t.id]?.wins}-{predictions[t.id]?.losses}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Bold Predictions</div>
      <div
        className={`flex flex-1 min-h-0 ${sideBySide ? 'flex-row items-stretch' : 'flex-col'}`}
        style={{ gap: sideBySide ? 12 : 6 }}
      >
        {highFlyers.length > 0 && chipGroup(highFlyers, 'green', 'ELITE (12+ WINS)')}
        {cellarDwellers.length > 0 && chipGroup(cellarDwellers, 'red', 'CELLAR (4- WINS)')}
      </div>
    </div>
  );
};

// ============================================================
// WORST DIVISION — mirror of toughest, fewest combined wins
// ============================================================

const WorstDivisionSection = ({ stats, w, h, aspect }) => {
  if (!stats.worstDiv) return null;
  const t = sTitle(h, w, 'text-rose-400');
  const contentH = h - t.fontSize - 6;
  const wide = aspect > 1.4;

  const divNameF = C(Math.min(contentH * (wide ? 0.30 : 0.18), w * 0.14), 72);
  const subtitleF = C(Math.min(contentH * (wide ? 0.14 : 0.08), w * 0.08), 28);
  const logoBudget = wide ? Math.min(contentH * 0.7, (w * 0.5) / 2) : (contentH - divNameF - subtitleF - 24) / 2;
  const logoSize = C(Math.min(logoBudget, w / 5), 110);
  const logoGap = C(Math.min(w * 0.03, 16), 16);

  if (wide) {
    return (
      <div className="flex flex-col flex-1 min-h-0" style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Worst Division</div>
        <div className="flex-1 flex items-center min-h-0" style={{ gap: 16 }}>
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div style={{ fontSize: divNameF, fontWeight: 700, lineHeight: 1, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-rose-400">{stats.worstDiv.division}</div>
            <div style={{ fontSize: subtitleF, marginTop: 4, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-gray-300">{stats.worstDiv.totalWins} combined wins</div>
          </div>
          <div className="flex flex-wrap justify-center items-center shrink-0" style={{ gap: logoGap }}>
            {stats.worstDiv.teams.map(tm => (
              <img key={tm.id} src={LOGO_URL(tm.id)} alt="" style={{ width: logoSize, height: logoSize, objectFit: 'contain' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ overflow: 'hidden' }}>
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Worst Division</div>
      <div className="flex-1 flex flex-col items-center justify-center min-h-0" style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: divNameF, fontWeight: 700, lineHeight: 1, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-rose-400 shrink-0">{stats.worstDiv.division}</div>
        <div style={{ fontSize: subtitleF, marginTop: 4, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} className="text-gray-300 shrink-0">{stats.worstDiv.totalWins} combined wins</div>
        <div className="flex justify-center flex-wrap shrink-0" style={{ gap: logoGap, marginTop: 8 }}>
          {stats.worstDiv.teams.map(tm => (
            <img key={tm.id} src={LOGO_URL(tm.id)} alt="" style={{ width: logoSize, height: logoSize, objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// STRENGTH OF SCHEDULE — hardest & easiest SOS
// ============================================================

const StrengthOfScheduleSection = ({ stats, w, h, aspect }) => {
  if (!stats.sos.hardest) return null;
  const vert = aspect < 0.9;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const colH = vert ? (contentH - 8) / 2 : contentH;
  const colW = vert ? w : (w - 8) / 2;
  const labelF = C(Math.min(colH * 0.10, colW * 0.10), 18);
  const innerH = colH - labelF - 6;
  const rowH = innerH / 3;

  const logoSz = C(Math.min(rowH * 0.65, colW * 0.17), 44);
  const nameF = C(Math.min(rowH * 0.48, colW * 0.14), 24);
  const sosF = C(Math.min(rowH * 0.40, colW * 0.11), 20);
  const rowGap = C(Math.min(rowH * 0.15, colW * 0.02), 8);

  const list = (items, color, label) => {
    const txt = color === 'red' ? 'text-red-400' : 'text-green-400';
    const bg = color === 'red' ? 'bg-red-900/20 border-red-800/40' : 'bg-green-900/20 border-green-800/40';
    const pad = Math.round(Math.min(colH * 0.02, colW * 0.03));
    return (
      <div className={`${bg} border rounded-xl flex-1 flex flex-col min-h-0`} style={{ padding: `${pad}px ${pad + 2}px`, overflow: 'hidden' }}>
        <div style={{ fontSize: labelF, letterSpacing: '0.08em' }} className={`${txt} font-bold shrink-0`}>{label}</div>
        <div className="flex flex-col flex-1 justify-evenly min-h-0">
          {items.map(team => (
            <div key={team.id} className="flex items-center min-w-0" style={{ gap: rowGap }}>
              <img src={LOGO_URL(team.id)} alt="" className="shrink-0" style={{ width: logoSz, height: logoSz, objectFit: 'contain' }} />
              <span className="truncate" style={{ fontSize: nameF, fontWeight: 700, minWidth: 0 }}>{team.id}</span>
              <span style={{ fontSize: sosF }} className="text-gray-400 ml-auto shrink-0">{team.sos.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Strength of Schedule</div>
      <div className={`flex flex-1 min-h-0 ${vert ? 'flex-col' : 'flex-row'}`} style={{ gap: 8 }}>
        {list(stats.sos.hardest, 'red', 'HARDEST')}
        {list(stats.sos.easiest, 'green', 'EASIEST')}
      </div>
    </div>
  );
};

// ============================================================
// CLOSEST DIVISION RACE — tightest competition
// ============================================================

const ClosestRaceSection = ({ stats, predictions, w, h, aspect }) => {
  if (!stats.closestRace) return null;
  const t = sTitle(h, w, 'text-cyan-400');
  const contentH = h - t.fontSize - 6;

  // Budget header text to ~25% of contentH max, rest for grid
  const divNameF = C(Math.min(contentH * 0.16, w * 0.09), 48);
  const gapLabelF = C(Math.min(contentH * 0.10, w * 0.06), 22);
  const headerH = divNameF + gapLabelF + 12;
  const gridH = contentH - headerH;

  const cols = aspect > 2 ? 4 : aspect > 1.2 ? 4 : 2;
  const rows = Math.ceil(4 / cols);
  const itemH = (gridH - (rows - 1) * 6) / rows;
  const itemW = (w - (cols - 1) * 6) / cols;
  const logoSz = C(Math.min(itemH * 0.48, itemW * 0.45), 70);
  const nameF = C(Math.min(itemH * 0.20, itemW * 0.24), 24);
  const recF = C(Math.min(itemH * 0.15, itemW * 0.18), 18);

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ overflow: 'hidden' }}>
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Closest Division Race</div>
      <div className="flex-1 flex flex-col items-center min-h-0" style={{ overflow: 'hidden' }}>
        <div className="shrink-0" style={{ fontSize: divNameF, fontWeight: 700, lineHeight: 1, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }} >{stats.closestRace.division}</div>
        <div className="shrink-0 text-gray-300" style={{ fontSize: gapLabelF, marginTop: 4, overflow: 'hidden', wordBreak: 'break-word', maxWidth: '100%' }}>
          {stats.closestRace.gap === 0 ? 'Dead heat!' : `${stats.closestRace.gap} win gap`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, marginTop: 6, width: '100%', flex: 1, alignContent: 'stretch' }}>
          {stats.closestRace.teams.map(team => (
            <div key={team.id} className="bg-gray-700/40 rounded-lg flex flex-col items-center justify-center" style={{ overflow: 'hidden' }}>
              <img src={LOGO_URL(team.id)} alt="" style={{ width: logoSz, height: logoSz, objectFit: 'contain' }} />
              <div style={{ fontSize: nameF, fontWeight: 700, lineHeight: 1, marginTop: 2 }}>{team.id}</div>
              <div style={{ fontSize: recF, lineHeight: 1.1 }} className="text-gray-400">
                {predictions[team.id]?.wins}-{predictions[team.id]?.losses}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// WILD CARD TEAMS — non-division-winners in playoff spots
// ============================================================

const WildCardSection = ({ stats, predictions, w, h, aspect }) => {
  const afc = stats.wildCard.AFC || [];
  const nfc = stats.wildCard.NFC || [];
  if (afc.length === 0 && nfc.length === 0) return null;

  const vert = aspect < 0.6;
  const t = sTitle(h, w);
  const contentH = h - t.fontSize - 6;

  const listW = vert ? w : (w - 8) / 2;
  const listH = vert ? (contentH - 8) / 2 : contentH;
  const hdrF = C(Math.min(listH * 0.10, listW * 0.10), 20);
  const innerH = listH - hdrF - 8;
  const rowH = innerH / 3;

  const logoSz = C(Math.min(rowH * 0.70, listW * 0.17), 46);
  const numSz = C(Math.min(rowH * 0.55, listW * 0.14), 30);
  const nameF = C(Math.min(rowH * 0.50, listW * 0.14), 24);
  const recF = C(Math.min(rowH * 0.42, listW * 0.11), 20);
  const rowGap = C(Math.min(rowH * 0.15, listW * 0.02), 6);

  const list = (conf, teams, color) => {
    const hdr = color === 'blue' ? 'text-blue-400' : 'text-red-400';
    const bg = color === 'blue' ? 'bg-blue-900/20 border-blue-800/40' : 'bg-red-900/20 border-red-800/40';
    const pad = Math.round(Math.min(listH * 0.02, listW * 0.03));
    return (
      <div className={`${bg} border rounded-xl flex-1 flex flex-col min-h-0`} style={{ padding: `${pad}px ${pad + 2}px`, overflow: 'hidden' }}>
        <div style={{ fontSize: hdrF, letterSpacing: '0.1em' }} className={`font-bold ${hdr} shrink-0`}>{conf}</div>
        <div className="flex flex-col flex-1 justify-evenly min-h-0">
          {teams.map((team, i) => (
            <div key={team.id} className="flex items-center min-w-0" style={{ gap: rowGap }}>
              <span
                style={{ width: numSz, height: numSz, fontSize: numSz * 0.35 }}
                className="font-bold flex items-center justify-center rounded-full bg-gray-700 text-white shrink-0"
              >WC{i + 1}</span>
              <img src={LOGO_URL(team.id)} alt="" className="shrink-0" style={{ width: logoSz, height: logoSz, objectFit: 'contain' }} />
              <span className="truncate" style={{ fontSize: nameF, fontWeight: 700, minWidth: 0 }}>{team.id}</span>
              <span style={{ fontSize: recF }} className="text-gray-400 ml-auto shrink-0">
                {predictions[team.id]?.wins}-{predictions[team.id]?.losses}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Wild Card Teams</div>
      <div className={`flex flex-1 min-h-0 ${vert ? 'flex-col' : 'flex-row'}`} style={{ gap: 8 }}>
        {list('AFC', afc, 'blue')}
        {list('NFC', nfc, 'red')}
      </div>
    </div>
  );
};

// ============================================================
// PARITY INDEX — how many teams near .500
// ============================================================

const ParityIndexSection = ({ stats, w, h }) => {
  if (!stats.parity) return null;
  const t = sTitle(h, w, 'text-purple-400');
  const contentH = h - t.fontSize - 6;
  const pct = stats.parity.percentage;

  // Ring gauge dimensions — fills the available space
  const ringDim = C(Math.min(contentH * 0.70, w * 0.65), 280);
  const strokeW = C(ringDim * 0.08, 20);
  const radius = (ringDim - strokeW) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  const pctF = C(ringDim * 0.28, 80);
  const labelF = C(ringDim * 0.08, 22);
  const detailF = C(contentH * 0.07, 18);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ fontSize: t.fontSize, ...t.style }} className={t.className}>Parity Index</div>
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div style={{ position: 'relative', width: ringDim, height: ringDim }}>
          <svg width={ringDim} height={ringDim} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringDim / 2} cy={ringDim / 2} r={radius} fill="none" stroke="rgba(107,114,128,0.3)" strokeWidth={strokeW} />
            <circle cx={ringDim / 2} cy={ringDim / 2} r={radius} fill="none" stroke="#a855f7" strokeWidth={strokeW}
              strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: pctF, fontWeight: 700, lineHeight: 1 }} className="text-purple-400">{pct}%</div>
            <div style={{ fontSize: labelF, marginTop: 2 }} className="text-gray-300">near .500</div>
          </div>
        </div>
        <div style={{ fontSize: detailF, marginTop: 6 }} className="text-gray-500">
          {stats.parity.near500} of {stats.parity.total} teams at 7-10 wins
        </div>
      </div>
    </div>
  );
};

export default ShareableImage;
