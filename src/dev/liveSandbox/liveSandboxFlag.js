// Sandbox enable flag, kept in its own module so the panel and the hook can
// both read it without importing each other through the package entry.
//
// Production builds never see this file: vite.config.js aliases the sandbox
// entry to production-stub.js, so the fixture, the replay code, and the panel
// are all excluded from the shipped bundle.

export const LIVE_SANDBOX_ENABLED = Boolean(
  import.meta.env.DEV && import.meta.env.VITE_LIVE_SANDBOX === 'true',
);

// Which mode the sandbox opens in. The mode itself is switchable at runtime
// from the sandbox panel — see liveSandboxMode.js — so this only sets the
// starting point for a browser that has not chosen one yet.
export const LIVE_SANDBOX_DEFAULT_MODE = import.meta.env.VITE_LIVE_SANDBOX_MODE === 'preseason'
  ? 'preseason'
  : 'replay';
