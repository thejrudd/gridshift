// Sandbox enable flag, kept in its own module so the panel and the hook can
// both read it without importing each other through the package entry.
//
// Production builds never see this file: vite.config.js aliases the sandbox
// entry to production-stub.js, so the fixture, the replay code, and the panel
// are all excluded from the shipped bundle.

// `?liveSandbox=off` on the first page load opts a session out entirely (data
// source, league override and panel), so automated checks can run the
// production path against a developer server that has the sandbox enabled. It
// is read once: route normalization may rewrite the query string later.
const SANDBOX_DISABLED_BY_URL = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('liveSandbox') === 'off';

export const LIVE_SANDBOX_ENABLED = Boolean(
  import.meta.env.DEV && import.meta.env.VITE_LIVE_SANDBOX === 'true' && !SANDBOX_DISABLED_BY_URL,
);

// Which mode the sandbox opens in. The mode itself is switchable at runtime
// from the sandbox panel — see liveSandboxMode.js — so this only sets the
// starting point for a browser that has not chosen one yet.
const configuredMode = import.meta.env.VITE_LIVE_SANDBOX_MODE;
export const LIVE_SANDBOX_DEFAULT_MODE = ['live', 'preseason'].includes(configuredMode)
  ? configuredMode
  : 'replay';
