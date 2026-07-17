const GLYPHS = {
  trophy: (
    <>
      <path d="M7.5 3.5h9V9a4.5 4.5 0 0 1-9 0V3.5Z" />
      <path d="M7.5 5.5H4.8a3 3 0 0 0 3 3.4M16.5 5.5h2.7a3 3 0 0 1-3 3.4M12 13.5V20M8.5 20h7" />
    </>
  ),
  crown: (
    <>
      <path d="m4 17 1.5-9.5 4 4L12 5.5l2.5 6 4-4L20 17H4Z" />
      <path d="M4.5 20h15" />
    </>
  ),
  star: <path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6-5.9-3.3-5.9 3.3L7.4 14 2.5 9.4l6.6-.8L12 2.5Z" />,
  bolt: <path d="m13.5 2.5-8 11H11l-1.5 8 9-11H13l.5-8Z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  flame: <path d="M12 2.8c.8 3.4 6 5.8 6 11a6 6 0 0 1-12 0c0-2.4 1.2-4.1 2.4-5.8.6 1.7 1.6 2.5 3.6 2.8-.6-2.6-.8-5.4 0-8Z" />,
  swap: (
    <>
      <path d="m15.5 3.5 4.5 4.5-4.5 4.5M20 8H5M8.5 11.5 4 16l4.5 4.5M4 16h15" />
    </>
  ),
  plus: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  player: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
    </>
  ),
  bench: (
    <>
      <path d="M4 10h16v5H4zM7 15v5M17 15v5M2.5 8v7M21.5 8v7" />
    </>
  ),
  percent: (
    <>
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
      <path d="m18.5 5.5-13 13" />
    </>
  ),
  minus: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" />
    </>
  ),
  diamond: (
    <>
      <path d="m12 3 9 9-9 9-9-9 9-9Z" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  versus: <path d="m9 5-5 7 5 7M15 5l5 7-5 7" />,
  open: (
    <>
      <path d="M8 16 16 8M10 8h6v6" />
      <path d="M16 16v3H5V8h3" />
    </>
  ),
};

export default function LeagueHistoryIcon({ name = 'star', tone = 'neutral', variant = 'engraved', size = 'md' }) {
  return (
    <span className={`league-history-icon is-${variant} is-${size} tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[name] ?? GLYPHS.star}
      </svg>
    </span>
  );
}
