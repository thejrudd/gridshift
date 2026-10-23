import { parsePlayNarrative } from '../../../utils/nflPlays/playNarrative.js';

// Plain formatting shared by the Scores drilldown sections.

export function detailCoverageMessage(detail, fallback) {
  if (detail.coverage?.detailStatus === 'loading') return 'Loading live game detail from BALLDONTLIE…';
  if (detail.coverage?.detailStatus === 'error') {
    return detail.coverage.detailError ?? 'BALLDONTLIE game detail could not be loaded.';
  }
  return fallback;
}

const QUARTER_LABEL = { 1: '1st quarter', 2: '2nd quarter', 3: '3rd quarter', 4: '4th quarter' };

export function quarterLabel(play) {
  const period = Number(play?.period);
  if (!Number.isFinite(period) || period < 1) return null;
  return QUARTER_LABEL[period] ?? 'Overtime';
}

export function driveMeta(drive) {
  const opening = drive.plays[0];
  // `playCount` is the offensive snaps; `plays` also carries clock stoppages
  // and the kickoff that ends a scoring drive.
  const snaps = drive.playCount ?? drive.plays.length;
  const count = `${snaps} ${snaps === 1 ? 'play' : 'plays'}`;
  const yards = drive.netYards != null ? ` · ${drive.netYards} yds` : '';
  const openingQuarter = opening
    ? quarterLabel(opening)
      ?? (typeof opening.quarter === 'string' ? opening.quarter : null)
      ?? (typeof drive.quarter === 'string' ? drive.quarter : null)
    : null;
  const from = opening ? ` · from ${opening.time}${openingQuarter ? ` ${openingQuarter}` : ''}` : '';
  return `${count}${yards}${from}`;
}

/** "Q3 4:12" for a play, or the bare clock when the period is unknown. */
export function playClockLabel(play) {
  const period = Number(play?.period);
  const quarter = period > 4 ? 'OT' : period > 0 ? `Q${period}` : null;
  return [quarter, play?.time].filter(Boolean).join(' ');
}

export function playSentence(play) {
  const narrative = parsePlayNarrative(play);
  return narrative.confident && narrative.sentence ? narrative.sentence : play?.description ?? '';
}

// "Amon-Ra St. Brown" → "St. Brown"; "Pierre Strong Jr." → "Strong"; "J.Goff" → "Goff".
function surname(name) {
  const parts = String(name ?? '').replace(/^[A-Z][a-z]?\./, '').trim().split(/\s+/)
    .filter((part) => part && !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(part));
  if (!parts.length) return '';
  const last = parts.at(-1).replace(/^[A-Z]\./, '');
  const prefix = parts.length > 1 && /^(St\.|Van|Von|De|Da|Di|Le|La|Mc)$/i.test(parts.at(-2)) ? `${parts.at(-2)} ` : '';
  return `${prefix}${last}`;
}

const downLabel = (play) => {
  const down = Number(play?.startDown);
  const distance = Number(play?.startDistance);
  if (!(down >= 1 && down <= 4) || !Number.isFinite(distance)) return '';
  const goal = Number(play?.startYardsToEndzone) > 0 && distance >= Number(play.startYardsToEndzone);
  return `${down}&${goal ? 'G' : distance}`;
};

/** The few words beside a drive lane: down and distance, then who did what. */
export function drivePlayNote(play) {
  const narrative = parsePlayNarrative(play);
  const role = (name) => surname(narrative.actors?.find((actor) => actor.role === name)?.name);
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  const kind = narrative.playKind;
  let text;
  if (/sack/.test(slug) || kind === 'sack') text = role('passer') ? `${role('passer')} sacked` : 'Sack';
  else if (/punt/.test(slug) || kind === 'punt') text = 'Punt';
  else if (/field.?goal/.test(slug) || kind === 'field-goal') text = /no.?good|missed|blocked/.test(slug) ? 'Field goal missed' : 'Field goal';
  else if (/kickoff/.test(slug) || kind === 'kickoff') text = 'Kickoff';
  else if (/interception/.test(slug) || kind === 'interception') text = role('passer') ? `${role('passer')} intercepted` : 'Interception';
  else if (/incompl/.test(slug) || kind === 'incompletion') text = role('passer') ? `${role('passer')} incomplete` : 'Incomplete';
  else if (role('receiver')) text = role('passer') ? `${role('passer')} to ${role('receiver')}` : `Catch by ${role('receiver')}`;
  else if (role('rusher')) text = `${role('rusher')} rush`;
  else if (/penalty/.test(slug) || narrative.penalty) text = 'Penalty';
  else text = play?.type ?? 'Play';
  if (/touchdown/.test(slug)) text = `${text}, touchdown`;
  return { down: downLabel(play), text };
}

/**
 * The snap still to come on a live drive, from where its last play left the
 * ball: the spot, the line to gain, and "3rd & 3 at BUF 48". Null when the
 * provider has not said where the next snap is.
 */
export function nextSnapFor(drive, geometryOf) {
  const last = [...(drive?.plays ?? [])].reverse().find((play) => play.endDownDistanceText && play.endYardsToEndzone != null);
  if (!last) return null;
  const geometry = geometryOf(last);
  const at = geometry?.end;
  if (at == null || !geometry.dir) return null;
  const text = String(last.endDownDistanceText).replace(/\s+/g, ' ').trim();
  const distance = Number(last.endDistance);
  const goal = /goal/i.test(text);
  const firstDown = !goal && Number.isFinite(distance) && distance > 0 ? Math.max(0, Math.min(100, at + distance * geometry.dir)) : null;
  return { at, firstDown, label: text.split(/ at /i)[0], text };
}
