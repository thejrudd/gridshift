// Development only: run GridShift core beside a local GridShift fantasy
// platform API, the production-like arrangement for GridShift leagues.
//
//   GRIDSHIFT_PLATFORM_DIR=../GridShift-Fantasy-Platform npm run dev:platform
//
// Starts the platform's own `npm run dev` (PGlite in <platform>/.pglite,
// console mailer: sign-in links are printed in this terminal) and core's
// `npm run dev` with VITE_GRIDSHIFT_PLATFORM_URL pointing at it, so Vite
// proxies the platform routes same-origin. Core never imports platform code;
// the checkout is only used to launch its server. Without
// GRIDSHIFT_PLATFORM_DIR this script exits and `npm run dev` is unaffected.
// Setup and sign-in steps: docs/League Provider Contract.md.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const platformDir = process.env.GRIDSHIFT_PLATFORM_DIR ? resolve(process.env.GRIDSHIFT_PLATFORM_DIR) : '';
if (!platformDir) {
  console.error('[dev:platform] Set GRIDSHIFT_PLATFORM_DIR to a local GridShift-Fantasy-Platform checkout (after `npm ci` there).');
  process.exit(2);
}
const platformPackage = resolve(platformDir, 'package.json');
if (!existsSync(platformPackage) || JSON.parse(readFileSync(platformPackage, 'utf8')).name !== 'gridshift-platform') {
  console.error(`[dev:platform] ${platformDir} is not a GridShift-Fantasy-Platform checkout.`);
  process.exit(2);
}

// Core's own sidecar already listens on 3001, so the platform defaults to 3101.
const platformPort = process.env.GRIDSHIFT_PLATFORM_PORT ?? '3101';
// Open core at this origin: sign-in links and the session cookie use it.
const coreOrigin = process.env.GRIDSHIFT_CORE_ORIGIN ?? 'http://localhost:5173';
const platformUrl = `http://127.0.0.1:${platformPort}`;

const processes = [
  {
    name: 'platform-api',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    cwd: platformDir,
    env: {
      NODE_ENV: 'development',
      PORT: platformPort,
      // Links in sign-in emails open through core's dev proxy.
      BASE_URL: coreOrigin,
      // Core is the client; both loopback spellings are allowed.
      APP_ORIGINS: process.env.APP_ORIGINS ?? [coreOrigin, coreOrigin.replace('localhost', '127.0.0.1')].join(','),
    },
  },
  {
    name: 'core',
    command: process.execPath,
    args: [fileURLToPath(new URL('./dev.mjs', import.meta.url)), ...process.argv.slice(2)],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { VITE_GRIDSHIFT_PLATFORM_URL: platformUrl },
  },
];

const children = [];
let shuttingDown = false;

function stopAll(signal = 'SIGTERM') {
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode == null && child.signalCode == null) {
      try { child.kill(signal); } catch { /* already gone */ }
    }
  }
}

console.log(`[dev:platform] Platform API on ${platformUrl}; open core at ${coreOrigin}.`);
for (const proc of processes) {
  const child = spawn(proc.command, proc.args, {
    cwd: proc.cwd,
    stdio: 'inherit',
    env: { ...process.env, ...proc.env },
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev:platform] ${proc.name} exited${signal ? ` from ${signal}` : ''}. Stopping the rest.`);
    stopAll();
    process.exit(code ?? 1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopAll(signal);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}
