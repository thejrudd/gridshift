import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';
import useBodyScrollLock from '../hooks/useBodyScrollLock.js';
import useSheetHistory from '../hooks/useSheetHistory.js';
import {
  createPredictionSnapshot,
  createScheduleFingerprint,
  getCanonicalScheduleGameIds,
  getTeamAdvancedShareSchedule,
  validatePlayoffPicks,
} from '../utils/predictionSnapshot';
import { createPredictionShareUrl } from '../utils/predictionShareCodec';
import { buildPredictionShareModel, getPredictionPickWeekContext } from '../utils/predictionShareModel';
import { getPredictionScreenshotScale } from '../utils/predictionScreenshot.js';
import { copyText } from '../utils/pageShare.js';
import { PredictionShareCard, SHARE_CARD_TITLES } from './predictions/share';
import './predictionShareExport.css';

const CARD_OPTIONS = [
  { id: 'board', label: 'Full board' },
  { id: 'champions', label: 'Champions' },
  { id: 'divisions', label: 'Division winners' },
  { id: 'seeding', label: 'Playoff seeding' },
  { id: 'bracket', label: 'Full bracket' },
  { id: 'team-record', label: 'Team record' },
];

const CARD_IDS = new Set(CARD_OPTIONS.map(option => option.id));
const CANVAS_IDS = new Set(['square', 'tall']);
const THEME_IDS = new Set(['dark', 'poster']);
const SCREENSHOT_CONTROLS_HIDE_MS = 3_000;

function SegmentedControl({ label, value, options, onChange }) {
  return <fieldset className="prediction-share-export__field">
    <legend>{label}</legend>
    <div className="prediction-share-export__segments">
      {options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}
    </div>
  </fieldset>;
}

function ScreenshotView({ model, format, size, tone, titleId, managerName, qrImage, shareLabel, onClose }) {
  useBodyScrollLock();
  useSheetHistory(true, onClose);
  const hideControlsTimerRef = useRef(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scale, setScale] = useState(1);
  const cardHeight = size === 'tall' ? 1350 : 1080;

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), SCREENSHOT_CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    const updateScale = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setScale(getPredictionScreenshotScale({ viewportWidth, viewportHeight, cardHeight }));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    window.visualViewport?.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      window.visualViewport?.removeEventListener('resize', updateScale);
    };
  }, [cardHeight]);

  useEffect(() => {
    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), SCREENSHOT_CONTROLS_HIDE_MS);
    return () => {
      if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return <div
    className="prediction-share-screenshot"
    data-controls-visible={controlsVisible ? 'true' : 'false'}
    role="dialog"
    aria-modal="true"
    aria-label="Prediction Share Card screenshot view"
    onPointerDown={revealControls}
  >
    <div
      className="prediction-share-screenshot__stage"
      style={{
        '--prediction-share-screenshot-height': `${cardHeight}px`,
        '--prediction-share-screenshot-scale': scale,
      }}
      aria-hidden="true"
    >
      <PredictionShareCard model={model} format={format} size={size} tone={tone} titleId={titleId} managerName={managerName} qrImage={qrImage} shareLabel={shareLabel} />
    </div>
    <div className="prediction-share-screenshot__controls">
      <div>
        <strong>Screenshot ready</strong>
        <span>Use your device screenshot controls. This bar hides automatically.</span>
      </div>
      <button type="button" onClick={onClose}>Done</button>
    </div>
  </div>;
}

export default function ExportPreview({
  teams,
  schedule,
  predictions,
  playoffPicks,
  predictionMode = 'record',
  predictionSeason,
  sleeperUser,
  sourceSnapshot = null,
  initialPresentation = null,
  initialTeamId = null,
  onOpenTeamAdvanced,
  onClose,
}) {
  const previewFrameRef = useRef(null);
  const initialFormat = CARD_IDS.has(initialPresentation?.cardId) ? initialPresentation.cardId : 'board';
  const initialSize = CANVAS_IDS.has(initialPresentation?.format) ? initialPresentation.format : 'square';
  const initialTone = THEME_IDS.has(initialPresentation?.themeId) ? initialPresentation.themeId : 'dark';
  const [createdAt] = useState(() => new Date().toISOString());
  const [format, setFormat] = useState(initialFormat);
  const [selectedTeamId, setSelectedTeamId] = useState(() => {
    const normalizedInitial = String(initialTeamId ?? '').toUpperCase();
    return teams.some(team => team.id === normalizedInitial) ? normalizedInitial : teams[0]?.id ?? '';
  });
  const [size, setSize] = useState(initialSize);
  const [tone, setTone] = useState(initialTone);
  const [titleId, setTitleId] = useState(() => {
    const parsed = Number(initialPresentation?.titleId);
    return Number.isInteger(parsed) && parsed >= 0 && parsed < SHARE_CARD_TITLES[initialFormat].length ? parsed : 0;
  });
  const [previewScale, setPreviewScale] = useState(0.5);
  const [shareUrl, setShareUrl] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [shareError, setShareError] = useState('');
  const [copyState, setCopyState] = useState('Copy link');
  const [screenshotOpen, setScreenshotOpen] = useState(false);

  // Validate the exact records and selections that will be encoded, rather than
  // trusting a readiness value calculated by a different render pass. A record
  // edit can change seeding after the bracket has already been filled in.
  const playoffValidation = useMemo(() => (
    sourceSnapshot
      ? { isComplete: true, errors: [] }
      : validatePlayoffPicks({ playoffPicks, records: predictions, teams })
  ), [playoffPicks, predictions, sourceSnapshot, teams]);
  const playoffReady = playoffValidation.isComplete;
  const playoffError = playoffValidation.errors[0] ?? 'Complete every playoff outcome to create a portable link.';
  const portableSnapshotResult = useMemo(() => {
    try {
      if (sourceSnapshot) return { snapshot: sourceSnapshot, error: '' };
      if (!playoffReady) return { snapshot: null, error: playoffError };
      const { pickWeek } = getPredictionPickWeekContext(schedule, createdAt);
      return { snapshot: createPredictionSnapshot({
        season: predictionSeason, pickWeek, createdAt, mode: predictionMode, schedule,
        manager: { userId: sleeperUser?.user_id, username: sleeperUser?.username, displayName: sleeperUser?.display_name ?? sleeperUser?.username },
        predictions, playoffPicks, teams,
      }), error: '' };
    } catch (error) {
      return { snapshot: null, error: error?.errors?.[0] ?? error?.message ?? 'These predictions are not ready to share.' };
    }
  }, [createdAt, playoffError, playoffPicks, playoffReady, predictionMode, predictionSeason, predictions, schedule, sleeperUser, sourceSnapshot, teams]);

  const previewSnapshot = useMemo(() => sourceSnapshot ?? {
    season: predictionSeason,
    createdAt,
    mode: predictionMode,
    records: predictions,
    playoffPicks,
  }, [createdAt, playoffPicks, predictionMode, predictionSeason, predictions, sourceSnapshot]);
  const baseModel = useMemo(() => buildPredictionShareModel({ snapshot: previewSnapshot, teams, schedule }), [previewSnapshot, schedule, teams]);
  const teamStatus = useMemo(() => getTeamAdvancedShareSchedule({
    teamId: selectedTeamId,
    predictions,
    schedule,
    teams,
  }), [predictions, schedule, selectedTeamId, teams]);
  const model = useMemo(() => ({
    ...baseModel,
    teamRecord: {
      teamId: selectedTeamId,
      rows: teamStatus.rows,
    },
  }), [baseModel, selectedTeamId, teamStatus.rows]);
  const manager = sourceSnapshot?.manager ?? {
    username: sleeperUser?.username,
    displayName: sleeperUser?.display_name ?? sleeperUser?.username,
  };
  const managerName = manager?.displayName && manager?.username ? `${manager.displayName} · @${manager.username}` : '';
  const isTeamRecord = format === 'team-record';
  const needsPlayoffs = format === 'champions' || format === 'bracket';
  const formatReady = isTeamRecord ? teamStatus.isComplete : (!needsPlayoffs || playoffReady);
  const selectedTeam = teams.find(team => team.id === selectedTeamId);

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return undefined;
    const updateScale = () => {
      const cardHeight = size === 'tall' ? 1350 : 1080;
      const desktopPreviewHeight = Math.min(720, Math.max(360, window.innerHeight - 260));
      const maxPreviewHeight = window.innerWidth < 1024 ? 540 : desktopPreviewHeight;
      setPreviewScale(Math.min(1, Math.max(280, frame.clientWidth) / 1080, maxPreviewHeight / cardHeight));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    window.addEventListener('resize', updateScale);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateScale); };
  }, [size]);

  useEffect(() => {
    let cancelled = false;
    if (isTeamRecord || !portableSnapshotResult.snapshot) {
      queueMicrotask(() => {
        if (!cancelled) {
          setShareUrl(''); setQrImage(''); setShareError(isTeamRecord ? '' : portableSnapshotResult.error);
        }
      });
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const url = await createPredictionShareUrl({
          snapshot: portableSnapshotResult.snapshot,
          presentation: { titleId: String(titleId), themeId: tone, cardId: format, format: size },
        }, {
          scheduleGameIds: getCanonicalScheduleGameIds(schedule),
          scheduleFingerprint: createScheduleFingerprint(schedule),
        });
        const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 384, color: { dark: '#0c0f14', light: '#ffffff' } });
        if (!cancelled) { setShareUrl(url); setQrImage(qr); setShareError(''); }
      } catch (error) {
        if (!cancelled) { setShareUrl(''); setQrImage(''); setShareError(error?.message ?? 'The share link could not be created.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [format, isTeamRecord, portableSnapshotResult.error, portableSnapshotResult.snapshot, schedule, size, titleId, tone]);

  const cardHeight = size === 'tall' ? 1350 : 1080;
  const handleCopy = async () => {
    if (!shareUrl) return;
    await copyText(shareUrl);
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Copy link'), 1800);
  };

  if (screenshotOpen && model && formatReady) {
    return <ScreenshotView
      model={model}
      format={format}
      size={size}
      tone={tone}
      titleId={titleId}
      managerName={managerName}
      qrImage={isTeamRecord ? '' : qrImage}
      shareLabel={isTeamRecord ? 'Team forecast' : 'Open these picks'}
      onClose={() => setScreenshotOpen(false)}
    />;
  }

  return <Modal onClose={onClose} ariaLabel="Create prediction share card" containerClassName="prediction-share-export" containerStyle={{ maxWidth: '1240px', maxHeight: '94vh', background: 'var(--color-bg-secondary)' }}>
    <header className="prediction-share-export__header">
      <div className="prediction-share-export__heading">
        <p>Prediction share cards</p>
        <h2>Create your season call</h2>
        <div className="prediction-share-export__context">
          <span>{predictionSeason} · {model?.weekLabel ?? 'Automatic pick week'}</span>
          <strong>{managerName || 'Sleeper connection required'}</strong>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close prediction share cards">×</button>
    </header>
    <div className="prediction-share-export__content">
      <div ref={previewFrameRef} className="prediction-share-export__preview-frame" style={{ height: `${cardHeight * previewScale}px` }}>
        {formatReady ? <div className="prediction-share-export__preview-scale" style={{ transform: `scale(${previewScale}) translateX(-50%)` }}>
          <PredictionShareCard model={model} format={format} size={size} tone={tone} titleId={titleId} managerName={managerName} qrImage={isTeamRecord ? '' : qrImage} shareLabel={isTeamRecord ? 'Team forecast' : 'Open these picks'} />
        </div> : <div className="prediction-share-export__requirement" role="status">
          {isTeamRecord ? <>
            <strong>Complete {selectedTeam?.name ?? selectedTeamId} in Advanced Mode</strong>
            <span>{teamStatus.remainingCount} of 17 matchups remain before this team card can be rendered.</span>
            {onOpenTeamAdvanced && <button type="button" onClick={() => onOpenTeamAdvanced(selectedTeamId)}>Open {selectedTeam?.nickname ?? selectedTeamId} in Advanced Mode</button>}
          </> : <>
            <strong>Complete the playoff bracket</strong>
            <span>{format === 'champions' ? 'Champions' : 'Full Bracket'} needs all playoff outcomes before it can be rendered.</span>
          </>}
        </div>}
      </div>
      <aside className="prediction-share-export__controls">
        <label className="prediction-share-export__field"><span>Card</span><select value={format} onChange={(event) => { setFormat(event.target.value); setTitleId(0); }}>{CARD_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        {isTeamRecord && <label className="prediction-share-export__field"><span>Team</span><select value={selectedTeamId} onChange={event => setSelectedTeamId(event.target.value)}>{teams.map(team => <option key={team.id} value={team.id}>{team.name ?? team.id}</option>)}</select></label>}
        <label className="prediction-share-export__field"><span>Title</span><select value={titleId} onChange={event => setTitleId(Number(event.target.value))}>{SHARE_CARD_TITLES[format].map((title, index) => <option key={`${format}-${index}`} value={index}>{title.join(' ')}</option>)}</select></label>
        <SegmentedControl label="Canvas" value={size} onChange={setSize} options={[{ id: 'square', label: 'Square' }, { id: 'tall', label: 'Tall' }]} />
        <SegmentedControl label="Theme" value={tone} onChange={setTone} options={[{ id: 'dark', label: 'Broadcast dark' }, { id: 'poster', label: 'Bright poster' }]} />
        {shareError && !isTeamRecord && <p className="prediction-share-export__message" role="status">{shareError}</p>}
      </aside>
    </div>
    <footer className="prediction-share-export__footer">
      <p className="prediction-share-export__privacy">{isTeamRecord
        ? 'This team schedule card is a local screenshot render. It does not create a link or QR code.'
        : shareUrl
          ? 'Open a clean full-screen card and use your device screenshot controls. The QR and link contain this completed prediction snapshot.'
          : 'Open a clean screenshot when this card is ready. Complete the playoff bracket to add a portable link and QR code.'}</p>
      <div className="prediction-share-export__actions"><button type="button" onClick={() => setScreenshotOpen(true)} disabled={!formatReady}>Open screenshot view</button>{!isTeamRecord && <button type="button" onClick={handleCopy} disabled={!shareUrl}>{copyState}</button>}</div>
    </footer>
  </Modal>;
}
