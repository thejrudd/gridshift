import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const nodeBin = process.execPath;
const clientArgs = process.argv.slice(2);

const processes = [
  {
    name: 'espn-api',
    command: nodeBin,
    args: [fileURLToPath(new URL('../server/index.js', import.meta.url))],
    env: {
      ESPN_API_HOST: process.env.ESPN_API_HOST ?? '127.0.0.1',
      ESPN_API_PORT: process.env.ESPN_API_PORT ?? '3001',
    },
  },
  {
    name: 'vite',
    command: nodeBin,
    args: [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), ...clientArgs],
  },
];

let shuttingDown = false;
const children = [];

function stopChild(child, signal = 'SIGTERM') {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  try {
    child.kill(signal);
  } catch {
    // The child may already be gone.
  }
}

function stopAll(signal = 'SIGTERM') {
  shuttingDown = true;
  for (const child of children) stopChild(child, signal);
}

function exitFromChild(name, code, signal) {
  if (shuttingDown) return;
  const exitCode = code ?? (signal ? 1 : 0);
  console.error(`[dev] ${name} exited${signal ? ` from ${signal}` : ''}. Stopping remaining processes.`);
  stopAll();
  process.exit(exitCode);
}

console.log('[dev] Starting GridShift dev server and ESPN API sidecar...');

for (const proc of processes) {
  const child = spawn(proc.command, proc.args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(proc.env ?? {}),
    },
  });
  children.push(child);
  child.on('exit', (code, signal) => exitFromChild(proc.name, code, signal));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopAll(signal);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}
