import { useEffect } from 'react';
import {
  positionColor, tierColor, tierFg,
  formatHeight, formatForty, gradeFromPercentile, gradeColor,
  draftRoundLabel, formatDraftSelection, formatDraftSlot, formatProjectedPick, formatRank, playerPhotoUrl, photoFallback,
  getCombineStatus, combineStatusColor, getCombineStatusDescription, getTierDescription,
  getCollegeProductionRows,
} from './scoutUtils';
import { ROOKIES_2026 } from '../../data/rookies';
import { DRAFT_RESULTS_2026 } from '../../data/draftResults';
import { scoutDebug } from './scoutDebug';
import { collegeLogoUrl, nflLogoUrl } from './scoutTeamLogos';

// ── Shared primitives ─────────────────────────────────────────

function applyDraftResult(player, result) {
  if (!player || !result) return player;
  return {
    ...player,
    draftStatus: 'drafted',
    draftRound: result.round ?? player.draftRound ?? null,
    draftPick: result.pick ?? player.draftPick ?? null,
    draftOverall: result.overall ?? player.draftOverall ?? null,
    draftTeam: result.team ?? player.draftTeam ?? null,
    draftTeamName: result.teamName ?? player.draftTeamName ?? null,
  };
}

function draftDebugSummary(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    draftStatus: player.draftStatus,
    draftRound: player.draftRound,
    draftPick: player.draftPick,
    draftOverall: player.draftOverall,
    draftTeam: player.draftTeam,
    draftTeamName: player.draftTeamName,
    projectedOverall: player.projectedOverall,
    bigBoardRank: player.bigBoardRank,
  };
}

function resolveCanonicalPlayerDetails(player) {
  if (!player?.id) return { resolvedPlayer: player, canonical: null, explicitResult: null };

  const canonical = ROOKIES_2026.find(p => p.id === player.id);
  const base = { ...(canonical ?? {}), ...player };
  const withCanonicalDraft = canonical?.draftStatus === 'drafted'
    ? applyDraftResult(base, {
      round: canonical.draftRound,
      pick: canonical.draftPick,
      overall: canonical.draftOverall,
      team: canonical.draftTeam,
      teamName: canonical.draftTeamName,
    })
    : base;

  const explicitResult = DRAFT_RESULTS_2026.find(result => result.playerId === player.id);
  return {
    resolvedPlayer: applyDraftResult(withCanonicalDraft, explicitResult),
    canonical,
    explicitResult,
  };
}

function SectionLabel({ children }) {
  return (
    <div className="scout-card-section-label">{children}</div>
  );
}

function DataRow({ label, value, logoUrl }) {
  if (value == null) return null;
  const debugKey = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (
    <div
      className="scout-card-data-row"
      data-scout-debug-row={debugKey}
      data-scout-debug-value={String(value)}
    >
      <span className="scout-card-data-label">{label}</span>
      <span className="scout-card-data-value">
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="scout-inline-logo"
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        {value}
      </span>
    </div>
  );
}

function InlineLogo({ url, alt = '' }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      className="scout-inline-logo"
      onError={event => { event.currentTarget.style.display = 'none'; }}
    />
  );
}

function CombineRow({ label, value, pct }) {
  if (value == null) return null;
  const grade = gradeFromPercentile(pct);
  return (
    <div className="scout-card-combine-row">
      <div className="scout-card-combine-top">
        <span className="scout-card-data-label">{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="scout-card-data-value">{value}</span>
          {grade && (
            <span className="scout-card-grade" style={{ color: gradeColor(grade) }}>{grade}</span>
          )}
        </div>
      </div>
      {pct != null && (
        <div className="scout-card-pct-bar-track">
          <div
            className="scout-card-pct-bar-fill"
            style={{ width: `${pct}%`, background: gradeColor(grade) }}
          />
        </div>
      )}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────

function DraftSection({ player }) {
  return (
    <div className="scout-card-section">
      <SectionLabel>Draft</SectionLabel>
      <DataRow label="Status" value={player.draftStatus === 'drafted' ? 'Drafted' : 'Not drafted yet'} />
      <DataRow label="Projected Pick" value={player.draftStatus === 'drafted' ? null : formatProjectedPick(player)} />
      <DataRow label="Team" value={player.draftTeamName} logoUrl={nflLogoUrl(player.draftTeam || player.draftTeamName)} />
      <DataRow label="Selection" value={formatDraftSelection(player)} />
      <DataRow label="Round / Pick" value={draftRoundLabel(player.draftRound, player.draftPick)} />
      <DataRow label="Prospect Rank" value={formatRank(player.bigBoardRank)} />
      <DataRow label="NFL Grade" value={player.nflGrade?.toFixed(2)} />
      <DataRow label="Dynasty ADP" value={player.dynastyAdp?.toFixed(1)} />
    </div>
  );
}

function CollegeSection({ player }) {
  const { college } = player;
  if (!player.collegeStats) return null;
  const rows = getCollegeProductionRows(player);

  return (
    <div className="scout-card-section">
      <SectionLabel>College — {college}</SectionLabel>
      {rows.length ? (
        rows.map(r => (
          <DataRow key={r.label} label={r.label} value={r.value} />
        ))
      ) : (
        <p className="scout-card-empty-note">College production will be filled as verified prospect data is added.</p>
      )}
    </div>
  );
}

function CombineSection({ player }) {
  const { combine: c, combinePercentiles: p } = player;
  if (!c && !player.combineInvite) return null;
  const hasVerifiedMeasure = Object.values(c).some(value => value != null);
  const status = getCombineStatus(player);
  if (!hasVerifiedMeasure && status === 'No Combine') return null;

  return (
    <div className="scout-card-section">
      <SectionLabel>NFL Combine</SectionLabel>
      <DataRow label="Status" value={status} />
      <DataRow label="Height" value={formatHeight(c.heightIn)} />
      <DataRow label="Weight" value={c.weightLbs ? `${c.weightLbs} lbs` : null} />
      <CombineRow label="40-Yard Dash"  value={c.fortyYard  != null ? `${formatForty(c.fortyYard)}s`  : null} pct={p?.fortyYard} />
      <CombineRow label="Vertical Jump" value={c.vertical   != null ? `${c.vertical}"`                : null} pct={p?.vertical} />
      <CombineRow label="Broad Jump"    value={c.broadJump  != null ? `${c.broadJump}"`               : null} pct={p?.broadJump} />
      <CombineRow label="3-Cone Drill"  value={c.threeCone  != null ? `${c.threeCone}s`               : null} pct={p?.threeCone} />
      <CombineRow label="20-Yd Shuttle" value={c.shuttle    != null ? `${c.shuttle}s`                 : null} pct={p?.shuttle} />
      <CombineRow label="Bench Press"   value={c.benchPress != null ? `${c.benchPress} reps`          : null} pct={p?.benchPress} />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────

export default function ScoutPlayerCard({ player, onCompare, compareAId, onViewStatistics }) {
  const { resolvedPlayer, canonical, explicitResult } = resolveCanonicalPlayerDetails(player);
  const posColor = positionColor(resolvedPlayer.position, resolvedPlayer.positionGroup);
  const tc = tierColor(resolvedPlayer.tier);
  const tfg = tierFg(resolvedPlayer.tier);
  const isPendingCompare = compareAId === resolvedPlayer.id;
  const draftSlot = formatDraftSlot(resolvedPlayer);
  const combineStatus = getCombineStatus(resolvedPlayer);
  const combineStatusStyle = { borderColor: combineStatusColor(combineStatus), color: combineStatusColor(combineStatus) };

  useEffect(() => {
    scoutDebug('Profile card resolved player', {
      input: draftDebugSummary(player),
      canonical: draftDebugSummary(canonical),
      explicitResult,
      resolved: draftDebugSummary(resolvedPlayer),
    });
  }, [
    player?.id,
    player?.draftStatus,
    player?.draftOverall,
    resolvedPlayer?.draftStatus,
    resolvedPlayer?.draftOverall,
    canonical?.draftStatus,
    canonical?.draftOverall,
    explicitResult?.overall,
  ]);

  return (
    <div
      className="scout-player-card"
      data-scout-debug-version="draft-profile-debug-2026-04-23"
      data-scout-debug-player-id={resolvedPlayer.id}
      data-scout-debug-player-name={resolvedPlayer.name}
      data-scout-debug-draft-status={resolvedPlayer.draftStatus}
      data-scout-debug-draft-round={resolvedPlayer.draftRound ?? ''}
      data-scout-debug-draft-pick={resolvedPlayer.draftPick ?? ''}
      data-scout-debug-draft-overall={resolvedPlayer.draftOverall ?? ''}
      data-scout-debug-draft-team={resolvedPlayer.draftTeam ?? ''}
      data-scout-debug-draft-team-name={resolvedPlayer.draftTeamName ?? ''}
      data-scout-debug-input-status={player?.draftStatus ?? ''}
      data-scout-debug-canonical-status={canonical?.draftStatus ?? ''}
      data-scout-debug-explicit-overall={explicitResult?.overall ?? ''}
    >
      {/* Identity block */}
      <div className="scout-card-identity" style={{ borderLeftColor: posColor }}>
        {/* Photo */}
        <div className="scout-card-photo-wrap">
          <img
            src={playerPhotoUrl(resolvedPlayer)}
            onError={photoFallback}
            alt={resolvedPlayer.name}
            className="scout-card-photo"
          />
        </div>

        {/* Text identity */}
        <div className="scout-card-identity-text">
          <div className="scout-card-player-name">{resolvedPlayer.name}</div>
          <div className="scout-card-player-meta">
            <span className="scout-card-pos" style={{ color: posColor }}>{resolvedPlayer.position}</span>
            <span className="scout-card-college">
              {resolvedPlayer.college}
              <InlineLogo url={collegeLogoUrl(resolvedPlayer.college)} alt="" />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span
              className="scout-card-tier"
              style={{ background: tc, color: tfg }}
              title={getTierDescription(resolvedPlayer.tier)}
            >
              {resolvedPlayer.tier}
            </span>
            <span
              className="scout-card-status-chip"
              style={combineStatusStyle}
              title={getCombineStatusDescription(combineStatus)}
            >
              {combineStatus}
            </span>
            <span className="scout-card-pick">{draftSlot}</span>
          </div>
        </div>
      </div>

      {/* Compare trigger */}
      <div className="scout-card-actions">
        {onCompare && (
          <button
            onClick={() => onCompare(resolvedPlayer)}
            className="scout-card-compare-btn"
            style={{
              borderColor: isPendingCompare ? 'var(--color-accent)' : 'var(--color-separator)',
              background: isPendingCompare ? 'rgba(90,173,255,0.10)' : 'var(--color-fill)',
              color: isPendingCompare ? 'var(--color-accent)' : 'var(--color-label-secondary)',
            }}
            aria-label={isPendingCompare ? 'Waiting — select a second player' : `Compare ${resolvedPlayer.name}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="8" height="18" rx="1" />
              <rect x="13" y="3" width="8" height="18" rx="1" />
            </svg>
            {isPendingCompare ? 'Select a second player to compare' : 'Compare'}
          </button>
        )}
        {onViewStatistics && (
          <button
            type="button"
            onClick={() => onViewStatistics(resolvedPlayer)}
            className="scout-card-compare-btn scout-card-stats-btn"
            aria-label={`Open college statistics for ${resolvedPlayer.name}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3v18h18" />
              <path d="M7 15l3-3 3 2 5-7" />
            </svg>
            Statistics
          </button>
        )}
      </div>

      {/* Data sections */}
      <DraftSection player={resolvedPlayer} />
      <CollegeSection player={resolvedPlayer} />
      <CombineSection player={resolvedPlayer} />
    </div>
  );
}
