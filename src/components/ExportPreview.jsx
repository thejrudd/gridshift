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
  { id: 'board', label: 'Standings', description: 'All 32 teams and their projected records' },
  { id: 'champions', label: 'Champions', description: 'Conference and Super Bowl picks' },
  { id: 'divisions', label: 'Division winners', description: 'Your predicted division leaders' },
  { id: 'seeding', label: 'Playoff seeding', description: 'AFC and NFC seeds from your records' },
  { id: 'bracket', label: 'Full bracket', description: 'Every playoff matchup and winner' },
  { id: 'team-record', label: 'Team record', description: 'One team’s game-by-game forecast' },
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
  predictionShareReady = true,
  predictionShareReason = '',
  predictionShareCapabilities = null,
  onOpenTeamAdvanced,
  onOpenPlayoffs,
  onClose,
}) {
  const previewFrameRef = useRef(null);
  const hasSourceSnapshot = Boolean(sourceSnapshot);
  const initialFormat = CARD_IDS.has(initialPresentation?.cardId)
    ? initialPresentation.cardId
    : hasSourceSnapshot ? 'board' : null;
  const initialSize = CANVAS_IDS.has(initialPresentation?.format)
    ? initialPresentation.format
    : hasSourceSnapshot ? 'square' : null;
  const initialTone = THEME_IDS.has(initialPresentation?.themeId)
    ? initialPresentation.themeId
    : hasSourceSnapshot ? 'dark' : null;
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
    return Number.isInteger(parsed) && parsed >= 0 && initialFormat && parsed < SHARE_CARD_TITLES[initialFormat].length
      ? parsed
      : null;
  });
  const [previewScale, setPreviewScale] = useState(0.5);
  const [shareUrl, setShareUrl] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [shareError, setShareError] = useState('');
  const [copyState, setCopyState] = useState('Copy Link');
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
  const regularSeasonReady = hasSourceSnapshot || (predictionShareCapabilities?.regularSeasonReady ?? predictionShareReady);
  const baseShareReady = hasSourceSnapshot || predictionShareReady;
  const portableSnapshotResult = useMemo(() => {
    try {
      if (sourceSnapshot) return { snapshot: sourceSnapshot, error: '' };
      if (!regularSeasonReady) return { snapshot: null, error: predictionShareReason || 'Complete all 32 team records in Records before sharing.' };
      if (!baseShareReady) return { snapshot: null, error: predictionShareReason || 'Connect Sleeper before creating a portable share link.' };
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
  }, [baseShareReady, createdAt, playoffError, playoffPicks, playoffReady, predictionMode, predictionSeason, predictionShareReason, predictions, regularSeasonReady, schedule, sleeperUser, sourceSnapshot, teams]);

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
  const previewConfigured = Boolean(format && size && tone);
  const formatConfigured = previewConfigured && titleId != null;
  const formatReady = formatConfigured && (isTeamRecord ? teamStatus.isComplete : (regularSeasonReady && baseShareReady && (!needsPlayoffs || playoffReady)));
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
    if (isTeamRecord || !format || titleId == null || !size || !tone || !portableSnapshotResult.snapshot) {
      queueMicrotask(() => {
        if (!cancelled) {
          setShareUrl(''); setQrImage(''); setShareError(isTeamRecord || !format || titleId == null || !size || !tone ? '' : portableSnapshotResult.error);
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
  const portableLinkMessage = !formatConfigured
    ? !format ? 'Choose a card, title, canvas, and theme to prepare the preview.' : 'Choose a title to enable Create Share Card and Copy Link.'
    : !regularSeasonReady
      ? predictionShareReason || 'Complete all 32 team records in Records before creating a portable link.'
      : !baseShareReady
        ? predictionShareReason || 'Connect Sleeper before creating a portable link.'
        : 'Complete the playoff bracket to add a portable link and QR code.';
  const handleCopy = async () => {
    if (!shareUrl) return;
    await copyText(shareUrl);
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Copy Link'), 1800);
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
        <p>Share card studio</p>
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
        {previewConfigured ? <div className="prediction-share-export__preview-scale" style={{ transform: `scale(${previewScale}) translateX(-50%)` }}>
          <PredictionShareCard model={model} format={format} size={size} tone={tone} titleId={titleId} managerName={managerName} qrImage={isTeamRecord ? '' : qrImage} shareLabel={isTeamRecord ? 'Team forecast' : 'Open these picks'} />
        </div> : <div className="prediction-share-export__requirement" role="status">
          {!format ? <>
            <strong>Choose a card to begin</strong>
            <span>{!regularSeasonReady
              ? `${predictionShareReason || 'Complete all 32 team records in Records before creating this card.'} Start with Step 1 when you are ready.`
              : 'Start with Step 1. Standings, Division Winners, and Playoff Seeding can render without a completed bracket; Champions and Full Bracket need every playoff outcome.'}</span>
          </> : titleId == null ? <>
            <strong>Choose a title next</strong>
            <span>Continue with Step 2 to give this card its headline.</span>
          </> : !size || !tone ? <>
            <strong>Set the canvas and theme</strong>
            <span>Finish Step 3 to prepare the card preview.</span>
          </> : !isTeamRecord && !regularSeasonReady ? <>
            <strong>Finish your regular-season picks</strong>
            <span>{predictionShareReason || 'Complete all 32 team records in Records before creating this card.'}</span>
          </> : !isTeamRecord && !baseShareReady ? <>
            <strong>Connect Sleeper to continue</strong>
            <span>{predictionShareReason || 'Connect Sleeper before creating this share card.'}</span>
          </> : isTeamRecord ? <>
            <strong>Complete {selectedTeam?.name ?? selectedTeamId} in Advanced Mode</strong>
            <span>{teamStatus.remainingCount} of 17 matchups remain before this team card can be rendered.</span>
            {onOpenTeamAdvanced && <button type="button" onClick={() => onOpenTeamAdvanced(selectedTeamId)}>Open {selectedTeam?.nickname ?? selectedTeamId} in Advanced Mode</button>}
          </> : <>
            <strong>Complete the playoff bracket</strong>
            <span>{format === 'champions' ? 'Champions' : 'Full Bracket'} needs all playoff outcomes before it can be rendered.</span>
            {onOpenPlayoffs && <button type="button" onClick={onOpenPlayoffs}>Open Playoffs</button>}
          </>}
        </div>}
      </div>
      <aside className="prediction-share-export__controls">
        <div className="prediction-share-export__steps">
          <section className={`prediction-share-export__step${format ? ' is-complete' : ' is-active'}`}>
            <div className="prediction-share-export__step-heading">
              <span className="prediction-share-export__step-number">1</span>
              <div><p>Step 1</p><strong>Choose a card</strong></div>
            </div>
            <div className="prediction-share-export__card-options" role="radiogroup" aria-label="Choose a share card">
              {CARD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="prediction-share-export__card-option"
                  aria-pressed={format === option.id}
                  onClick={() => { setFormat(option.id); setTitleId(null); setSize('square'); setTone('dark'); }}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            {isTeamRecord && <label className="prediction-share-export__field"><span>Team</span><select value={selectedTeamId} onChange={event => setSelectedTeamId(event.target.value)}>{teams.map(team => <option key={team.id} value={team.id}>{team.name ?? team.id}</option>)}</select></label>}
          </section>

          <section className={`prediction-share-export__step${format && titleId == null ? ' is-active' : ''}${titleId != null ? ' is-complete' : ''}`}>
            <div className="prediction-share-export__step-heading">
              <span className="prediction-share-export__step-number">2</span>
              <div><p>Step 2</p><strong>Choose a title</strong></div>
            </div>
            {format ? <label className="prediction-share-export__field">
              <span>Title</span>
              <select
                value={titleId ?? ''}
                onChange={event => setTitleId(event.target.value === '' ? null : Number(event.target.value))}
                aria-label="Choose a card title"
              >
                <option value="" disabled>Choose a title</option>
                {SHARE_CARD_TITLES[format].map((title, index) => <option key={`${format}-${index}`} value={index}>{title.join(' ')}</option>)}
              </select>
            </label> : <p className="prediction-share-export__step-help">Choose a card first.</p>}
          </section>

          <section className={`prediction-share-export__step${format && titleId != null && (!size || !tone) ? ' is-active' : ''}${format && titleId != null && size && tone ? ' is-complete' : ''}`}>
            <div className="prediction-share-export__step-heading">
              <span className="prediction-share-export__step-number">3</span>
              <div><p>Step 3</p><strong>Choose canvas and theme</strong></div>
            </div>
            {format && titleId != null ? <div className="prediction-share-export__step-fields">
              <SegmentedControl label="Canvas" value={size} onChange={setSize} options={[{ id: 'square', label: 'Square' }, { id: 'tall', label: 'Tall' }]} />
              <SegmentedControl label="Theme" value={tone} onChange={setTone} options={[{ id: 'dark', label: 'Broadcast dark' }, { id: 'poster', label: 'Bright poster' }]} />
            </div> : <p className="prediction-share-export__step-help">Choose a card and title first.</p>}
          </section>
        </div>
        {shareError && !isTeamRecord && needsPlayoffs && <p className="prediction-share-export__message" role="status">{shareError}</p>}
      </aside>
    </div>
    <footer className="prediction-share-export__footer">
      <p className="prediction-share-export__privacy">{isTeamRecord
        ? 'This team schedule card is a local screenshot render. It does not create a link or QR code.'
        : shareUrl
          ? 'Open a clean full-screen card and use your device screenshot controls. The QR and link contain this completed prediction snapshot.'
          : `Open a clean screenshot when this card is ready. ${portableLinkMessage}`}</p>
      <div className="prediction-share-export__actions"><button type="button" onClick={() => setScreenshotOpen(true)} disabled={!formatReady}>Create Share Card</button>{!isTeamRecord && <button type="button" onClick={handleCopy} disabled={titleId == null || !shareUrl}>{copyState}</button>}</div>
    </footer>
  </Modal>;
}
