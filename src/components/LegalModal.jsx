import { useState } from 'react';
import Modal from './Modal';

const tabs = [
  { id: 'privacy', label: 'Privacy' },
  { id: 'attributions', label: 'Attributions' },
];

const providers = [
  ['Sleeper', 'Fantasy league, roster, matchup, and player data.', 'https://docs.sleeper.com/'],
  ['ESPN', 'Public NFL and player information.', 'https://www.espn.com/'],
  ['Open-Meteo', 'Historical game-weather context.', 'https://open-meteo.com/'],
  ['LeagueLogs', 'Optional fantasy market profiles and valuations.', 'https://leaguelogs.com/'],
  ['BALLDONTLIE', 'Optional server-proxied NFL live data.', 'https://www.balldontlie.io/'],
  ['CollegeFootballData.com', 'College-football data used in Scout.', 'https://collegefootballdata.com/'],
];

const libraries = [
  ['React', 'MIT'], ['Vite', 'MIT'], ['Tailwind CSS', 'MIT'], ['Express', 'MIT'],
  ['html2canvas', 'MIT'], ['react-grid-layout', 'MIT'], ['Reaviz', 'MIT'], ['Workbox', 'Apache-2.0'],
];

export default function LegalModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('privacy');

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Privacy and attributions"
      containerClassName="max-w-2xl flex flex-col max-h-[86vh]"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--color-separator)' }}>
        <div>
          <p className="font-display font-bold uppercase" style={{ color: 'var(--color-label)', fontSize: 'var(--type-title)', letterSpacing: '0.06em' }}>
            GridShift legal
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>Privacy details, data sources, and open-source notices.</p>
        </div>
        <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ color: 'var(--color-label-secondary)', background: 'var(--color-fill)' }} aria-label="Close legal information">
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>
      </header>

      <div className="flex shrink-0 gap-1 px-5 pt-3" role="tablist" aria-label="Legal information">
        {tabs.map((tab) => {
          const selected = tab.id === activeTab;
          return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveTab(tab.id)} className="rounded px-3 py-2 text-sm font-semibold" style={{ background: selected ? 'var(--color-signature)' : 'transparent', color: selected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)' }}>{tab.label}</button>;
        })}
      </div>

      <div className="min-h-0 overflow-y-auto px-5 pb-5 pt-4" role="tabpanel">
        {activeTab === 'privacy' ? <PrivacyContent /> : <AttributionsContent />}
      </div>
    </Modal>
  );
}

function PrivacyContent() {
  return <div className="space-y-5 text-sm leading-6" style={{ color: 'var(--color-label-secondary)' }}>
    <PolicySection title="Your data stays close to you">
      GridShift saves predictions, preferences, connected-league state, and performance caches in your browser. This lets the app work without an account and keeps those details on your device unless you choose to connect a service or export data.
    </PolicySection>
    <PolicySection title="Fantasy connections">
      Sleeper usernames and league IDs are sent directly to Sleeper to load league data. GridShift does not require or collect credentials for a fantasy provider.
    </PolicySection>
    <PolicySection title="No advertising analytics">
      This open-source app does not include advertising trackers or third-party analytics. A hosted or self-hosted deployment may still maintain ordinary server or hosting logs.
    </PolicySection>
    <PolicySection title="Your controls">
      Use the app's reset and disconnect controls to remove predictions or connected sessions. Clearing this site's browser storage also removes locally saved information. The complete policy is available in the repository as <a href="https://github.com/thejrudd/nfl-predictor/blob/main/PRIVACY.md" target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: 'var(--color-accent)' }}>PRIVACY.md</a>.
    </PolicySection>
  </div>;
}

function AttributionsContent() {
  return <div className="space-y-6 text-sm leading-6" style={{ color: 'var(--color-label-secondary)' }}>
    <section>
      <h2 className="font-display font-bold uppercase" style={{ color: 'var(--color-label)', fontSize: 'var(--type-heading)', letterSpacing: '0.05em' }}>Data sources</h2>
      <p className="mt-1">Data is provided by the following services when the related feature is used. Their names and marks belong to their respective owners.</p>
      <div className="mt-3 divide-y rounded-lg" style={{ border: '1px solid var(--color-separator)' }}>
        {providers.map(([name, detail, href]) => <a key={name} href={href} target="_blank" rel="noreferrer" className="block px-4 py-3 transition-colors hover:opacity-75"><span className="font-semibold" style={{ color: 'var(--color-label)' }}>{name}</span><span className="block text-xs leading-5">{detail}</span></a>)}
      </div>
    </section>
    <section>
      <h2 className="font-display font-bold uppercase" style={{ color: 'var(--color-label)', fontSize: 'var(--type-heading)', letterSpacing: '0.05em' }}>Open-source software</h2>
      <p className="mt-1">GridShift is available under the <a href="https://github.com/thejrudd/nfl-predictor/blob/main/LICENSE" target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: 'var(--color-accent)' }}>MIT License</a>. It is built with:</p>
      <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {libraries.map(([name, license]) => <li key={name}><span className="font-semibold" style={{ color: 'var(--color-label)' }}>{name}</span> <span>({license})</span></li>)}
      </ul>
      <p className="mt-3 text-xs">See package-lock.json and each dependency's distribution for the full third-party license notices.</p>
    </section>
  </div>;
}

function PolicySection({ title, children }) {
  return <section><h2 className="font-display font-bold uppercase" style={{ color: 'var(--color-label)', fontSize: 'var(--type-heading)', letterSpacing: '0.05em' }}>{title}</h2><p className="mt-1">{children}</p></section>;
}
