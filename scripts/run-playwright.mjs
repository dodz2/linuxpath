import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';

const [target, ...args] = process.argv.slice(2);
if (!['source', 'dist', 'offline'].includes(target)) {
  console.error('Usage: node scripts/run-playwright.mjs <source|dist|offline> [playwright args]');
  process.exit(2);
}

const cli = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
const serverTargets = {
  source: { port: 4177, directory: '.' },
  dist: { port: 4178, directory: 'dist' },
  offline: { port: 4179, directory: 'dist' },
};

function waitForServer(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1_000 }, (response) => {
        response.resume();
        if ((response.statusCode || 500) < 500) resolve();
        else retry();
      });
      request.on('error', retry);
      request.on('timeout', () => request.destroy());
    };
    const retry = () => {
      if (Date.now() >= deadline) reject(new Error(`Static server did not become ready on port ${port}`));
      else setTimeout(tryRequest, 100);
    };
    tryRequest();
  });
}

async function stopServer(server) {
  if (server.exitCode !== null || server.killed) return;
  server.kill('SIGTERM');
  const closed = await Promise.race([
    once(server, 'close').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (closed || !server.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    server.kill('SIGKILL');
  }
  await once(server, 'close');
}

const selected = serverTargets[target];
const server = spawn(process.execPath, ['scripts/e2e-static-server.mjs', String(selected.port), selected.directory], {
  cwd: process.cwd(),
  stdio: 'ignore',
  windowsHide: true,
});

let exitCode = 1;
try {
  await waitForServer(selected.port);
  const result = spawnSync(process.execPath, [cli, 'test', `--project=${target}`, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, LINUXPATH_E2E_TARGET: target, LINUXPATH_E2E_MANAGED_SERVER: '1' },
    stdio: 'inherit',
  });
  exitCode = result.status ?? 1;
} finally {
  await stopServer(server);
}
process.exit(exitCode);
