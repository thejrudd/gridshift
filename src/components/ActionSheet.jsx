import Modal from './Modal';

export default function ActionSheet({
  onClose,
  predictionCount,
  activeTab,
  onGuide,
  onDisplay,
  onLegal,
  onAppTour,
  onExportImage,
  onExportJSON,
  onImportJSON,
  onRandom,
  onReset,
  onInstall,
  onMyTeam,
  favoriteTeam,
  league,
  leagueSeason,
  leagueSeasonOptions = [],
  leagueSeasonSwitching = null,
  onLeagueSeasonChange,
  onSwitchLeague,
  onDraftSync,
}) {
  const hasPicks = predictionCount > 0;
  const isPredictions = activeTab === 'predictions';
  const showLeagueControls = Boolean(league);
  const showDraftSync = activeTab === 'draft' && Boolean(onDraftSync);
  const years = leagueSeasonOptions?.length
    ? leagueSeasonOptions
    : league
      ? [String(league.season ?? leagueSeason)]
      : [];

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Options"
      containerStyle={{ background: 'var(--color-bg-secondary)', maxWidth: '640px' }}
    >

        {/* Primary actions group */}
        <div className="px-4 py-2">
          {showLeagueControls && (
            <>
              <div className="px-1 pb-2 pt-1">
                <div
                  className="text-[length:var(--type-label)] font-bold uppercase"
                  style={{
                    color: 'var(--color-label-tertiary)',
                    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                    letterSpacing: '0.14em',
                  }}
                >
                  League
                </div>
                <div className="mt-1 truncate text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                  {league.name ?? 'League'}
                </div>
              </div>
              {years.length > 1 && (
                <div className="flex flex-wrap gap-2 pb-3 pt-1">
                  {years.map((year) => {
                    const active = String(leagueSeason) === String(year);
                    const pending = leagueSeasonSwitching === String(year);

                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          onLeagueSeasonChange?.(year);
                          onClose();
                        }}
                        disabled={leagueSeasonSwitching != null}
                        className="rounded px-3 py-1.5 text-xs font-bold transition-opacity active:opacity-60"
                        style={{
                          background: active || pending ? 'var(--color-signature)' : 'var(--color-fill)',
                          color: active || pending ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                          border: '1px solid var(--color-separator)',
                          opacity: leagueSeasonSwitching != null && !pending ? 0.5 : 1,
                        }}
                        aria-pressed={active}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              )}
              <ActionRow label="Switch League" onClick={onSwitchLeague} />
              {showDraftSync && (
                <>
                  <Divider />
                  <ActionRow label="Draft Sync" onClick={onDraftSync} dataTour="draft-sync" />
                </>
              )}
              <Divider />
            </>
          )}
          {!showLeagueControls && showDraftSync && (
            <>
              <ActionRow label="Draft Sync" onClick={onDraftSync} dataTour="draft-sync" />
              <Divider />
            </>
          )}
          <ActionRow
            label={favoriteTeam ? `My Team — ${favoriteTeam.toUpperCase()}` : 'My Team'}
            onClick={onMyTeam}
          />
          <Divider />
          <ActionRow label="Display" onClick={onDisplay} />
          <Divider />
          <ActionRow label="Privacy & Attributions" onClick={onLegal} />
          <Divider />
          <ActionLink
            label="Support GridShift"
            href="https://buymeacoffee.com/gridshift"
          />
          <Divider />
          <ActionRow label="Guide" onClick={onGuide} />
          <Divider />
          <ActionRow label="App Tour" onClick={onAppTour} />
          {isPredictions && (
            <>
              <Divider />
              <ActionRow label="Create Image" onClick={onExportImage} disabled={!hasPicks} />
              <Divider />
              <ActionRow label="Export JSON" onClick={onExportJSON} disabled={!hasPicks} />
              <Divider />
              <ActionRow label="Import JSON" onClick={onImportJSON} />
              <Divider />
              <ActionRow label="Randomize Predictions" onClick={onRandom} />
            </>
          )}
          {onInstall && (
            <>
              <Divider />
              <ActionRow label="Install App" onClick={onInstall} />
            </>
          )}
        </div>

        {/* Destructive action — visually separated, predictions only */}
        {isPredictions && (
        <div className="px-4 pb-2 pt-1">
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--color-fill-tertiary)' }}
          >
            <ActionRow label="Reset All" onClick={onReset} disabled={!hasPicks} destructive />
          </div>
        </div>
        )}

        {/* Cancel */}
        <div className="px-4 pb-4 pt-1">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-xl font-semibold text-sm transition-opacity active:opacity-60"
            style={{
              background: 'var(--color-fill)',
              color: 'var(--color-accent)',
            }}
          >
            Cancel
          </button>
          <div
            className="pt-4 text-center text-xs font-semibold"
            style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}
          >
            v{__APP_VERSION__}
          </div>
        </div>
    </Modal>
  );
}

function ActionRow({ label, onClick, disabled, destructive, dataTour }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-tour={dataTour}
      className="w-full flex items-center py-4 text-left transition-opacity active:opacity-50"
      style={{
        color: disabled
          ? 'var(--color-label-tertiary)'
          : destructive
          ? 'var(--color-accent-red)'
          : 'var(--color-accent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function ActionLink({ label, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full flex items-center py-4 text-left transition-opacity active:opacity-50"
      style={{
        color: 'var(--color-accent)',
        cursor: 'pointer',
      }}
    >
      <span className="text-sm font-medium">{label}</span>
    </a>
  );
}

function Divider() {
  return (
    <div
      className="h-px"
      style={{ background: 'var(--color-separator)' }}
    />
  );
}
