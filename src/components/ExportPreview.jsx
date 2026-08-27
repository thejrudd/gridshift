import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';
import { exportAsImage } from '../utils/exportImport';
import { createPredictionSnapshot, createScheduleFingerprint, getCanonicalScheduleGameIds } from '../utils/predictionSnapshot';
import { createPredictionShareUrl } from '../utils/predictionShareCodec';
import { buildPredictionShareModel, getPredictionPickWeekContext } from '../utils/predictionShareModel';
import { PredictionShareCard, SHARE_CARD_TITLES } from './predictions/share';
import './predictionShareExport.css';

const CARD_OPTIONS = [
  { id: 'board', label: 'Full board' },
  { id: 'champions', label: 'Champions' },
  { id: 'divisions', label: 'Division winners' },
  { id: 'seeding', label: 'Playoff seeding' },
  { id: 'bracket', label: 'Full bracket' },
];

const CARD_IDS = new Set(CARD_OPTIONS.map(option => option.id));
const CANVAS_IDS = new Set(['square', 'tall']);
const THEME_IDS = new Set(['dark', 'poster']);

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

function SegmentedControl({ label, value, options, onChange }) {
  return <fieldset className="prediction-share-export__field">
    <legend>{label}</legend>
    <div className="prediction-share-export__segments">
      {options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}
    </div>
  </fieldset>;
}

export default function ExportPreview({ teams, schedule, predictions, playoffPicks, predictionMode = 'record', predictionSeason, sleeperUser, sourceSnapshot = null, initialPresentation = null, onClose }) {
  const cardRef = useRef(null);
  const previewFrameRef = useRef(null);
  const initialFormat = CARD_IDS.has(initialPresentation?.cardId) ? initialPresentation.cardId : 'board';
  const initialSize = CANVAS_IDS.has(initialPresentation?.format) ? initialPresentation.format : 'square';
  const initialTone = THEME_IDS.has(initialPresentation?.themeId) ? initialPresentation.themeId : 'dark';
  const [createdAt] = useState(() => new Date().toISOString());
  const [format, setFormat] = useState(initialFormat);
  const [size, setSize] = useState(initialSize);
  const [tone, setTone] = useState(initialTone);
  const [titleId, setTitleId] = useState(() => {
    const parsed = Number(initialPresentation?.titleId);
    return Number.isInteger(parsed) && parsed >= 0 && parsed < SHARE_CARD_TITLES[initialFormat].length ? parsed : 0;
  });
  const previousFormatRef = useRef(initialFormat);
  const [previewScale, setPreviewScale] = useState(0.5);
  const [shareUrl, setShareUrl] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [shareError, setShareError] = useState('');
  const [copyState, setCopyState] = useState('Copy link');
  const [downloading, setDownloading] = useState(false);

  const snapshotResult = useMemo(() => {
    try {
      if (sourceSnapshot) return { snapshot: sourceSnapshot, error: '' };
      const { pickWeek } = getPredictionPickWeekContext(schedule, createdAt);
      return { snapshot: createPredictionSnapshot({
        season: predictionSeason, pickWeek, createdAt, mode: predictionMode, schedule,
        manager: { userId: sleeperUser?.user_id, username: sleeperUser?.username, displayName: sleeperUser?.display_name ?? sleeperUser?.username },
        predictions, playoffPicks, teams,
      }), error: '' };
    } catch (error) {
      return { snapshot: null, error: error?.errors?.[0] ?? error?.message ?? 'These predictions are not ready to share.' };
    }
  }, [createdAt, playoffPicks, predictionMode, predictionSeason, predictions, schedule, sleeperUser, sourceSnapshot, teams]);

  const model = useMemo(() => snapshotResult.snapshot ? buildPredictionShareModel({ snapshot: snapshotResult.snapshot, teams, schedule }) : null, [schedule, snapshotResult.snapshot, teams]);
  const managerName = snapshotResult.snapshot ? `${snapshotResult.snapshot.manager.displayName} · @${snapshotResult.snapshot.manager.username}` : '';

  useEffect(() => {
    if (previousFormatRef.current === format) return;
    previousFormatRef.current = format;
    setTitleId(0);
  }, [format]);

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
    if (!snapshotResult.snapshot) {
      setShareUrl(''); setQrImage(''); setShareError(snapshotResult.error);
      return undefined;
    }
    (async () => {
      try {
        const url = await createPredictionShareUrl({
          snapshot: snapshotResult.snapshot,
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
  }, [format, schedule, size, snapshotResult.error, snapshotResult.snapshot, titleId, tone]);

  const cardHeight = size === 'tall' ? 1350 : 1080;
  const downloadImage = async () => {
    if (!cardRef.current || !shareUrl || downloading) return;
    setDownloading(true);
    try { await exportAsImage(cardRef.current, { scale: 1, filename: `gridshift-${predictionSeason}-${format}-${size}.png` }); }
    finally { setDownloading(false); }
  };
  const handleCopy = async () => {
    if (!shareUrl) return;
    await copyText(shareUrl);
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Copy link'), 1800);
  };

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
        {model ? <div className="prediction-share-export__preview-scale" style={{ transform: `scale(${previewScale}) translateX(-50%)` }}>
          <PredictionShareCard ref={cardRef} model={model} format={format} size={size} tone={tone} titleId={titleId} managerName={managerName} qrImage={qrImage} shareLabel="Open these picks" />
        </div> : <div className="prediction-share-export__error">{snapshotResult.error}</div>}
      </div>
      <aside className="prediction-share-export__controls">
        <label className="prediction-share-export__field"><span>Card</span><select value={format} onChange={event => setFormat(event.target.value)}>{CARD_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label className="prediction-share-export__field"><span>Title</span><select value={titleId} onChange={event => setTitleId(Number(event.target.value))}>{SHARE_CARD_TITLES[format].map((title, index) => <option key={`${format}-${index}`} value={index}>{title.join(' ')}</option>)}</select></label>
        <SegmentedControl label="Canvas" value={size} onChange={setSize} options={[{ id: 'square', label: 'Square' }, { id: 'tall', label: 'Tall' }]} />
        <SegmentedControl label="Theme" value={tone} onChange={setTone} options={[{ id: 'dark', label: 'Broadcast dark' }, { id: 'poster', label: 'Bright poster' }]} />
        {shareError && <p className="prediction-share-export__message" role="alert">{shareError}</p>}
      </aside>
    </div>
    <footer className="prediction-share-export__footer">
      <p className="prediction-share-export__privacy">The QR and link contain this completed prediction snapshot. Anyone with the image or link can view it without connecting Sleeper.</p>
      <div className="prediction-share-export__actions"><button type="button" onClick={downloadImage} disabled={!shareUrl || downloading}>{downloading ? 'Exporting…' : 'Download PNG'}</button><button type="button" onClick={handleCopy} disabled={!shareUrl}>{copyState}</button></div>
    </footer>
  </Modal>;
}
