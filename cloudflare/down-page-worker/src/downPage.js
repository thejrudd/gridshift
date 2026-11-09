// Standalone down page. Everything is inline except Google Fonts, which
// load from Google and fall back to system fonts. Colors mirror the
// Broadcast Editorial tokens in src/index.css.

export const DOWN_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>GridShift is down</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Figtree:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: light dark;
    --color-bg: #F2F1EC;
    --color-label: rgba(12, 15, 20, 1);
    --color-label-secondary: rgba(12, 15, 20, 0.58);
    --color-signature: #F5B700;
    --color-signature-fg: #0C0F14;
    --color-accent: #1A6EFF;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --color-bg: #0C0F14;
      --color-label: rgba(228, 235, 244, 1);
      --color-label-secondary: rgba(228, 235, 244, 0.58);
      --color-accent: #5AADFF;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px calc(24px + env(safe-area-inset-bottom, 0px));
    background: var(--color-bg);
    color: var(--color-label);
    font-family: 'Figtree', system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  main { width: 100%; max-width: 420px; text-align: center; }
  /* Matches .sidebar-brand__wordmark */
  .wordmark {
    margin: 0 0 40px;
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 700;
    font-size: 28px;
    letter-spacing: 0.08em;
    line-height: 1;
  }
  .wordmark span { color: var(--color-signature); }
  /* Matches .predictions-empty-state */
  h1 {
    margin: 0 0 8px;
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 900;
    font-size: clamp(2rem, 9vw, 2.75rem);
    letter-spacing: 0.02em;
    line-height: 1;
    text-transform: uppercase;
  }
  p {
    margin: 0 0 22px;
    color: var(--color-label-secondary);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.45;
  }
  /* Matches .predictions-empty-state__action */
  button {
    min-height: 44px;
    padding: 9px 18px;
    border: 1px solid var(--color-signature);
    border-radius: 4px;
    background: var(--color-signature);
    color: var(--color-signature-fg);
    font: 800 16px 'Figtree', system-ui, sans-serif;
    line-height: 1.2;
    cursor: pointer;
    transition: transform 120ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  button:active { transform: scale(0.97); }
  button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
</style>
</head>
<body>
<main>
  <div class="wordmark" aria-label="GridShift">GRID<span>SHIFT</span></div>
  <h1>GridShift is down</h1>
  <p>We're working on it. Try again in a few minutes.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>
`
