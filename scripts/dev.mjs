#!/usr/bin/env node
/**
 * 開発サーバー起動: 既存 dev を停止 → .next 削除 → next dev (--turbopack)
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3000';

function rmrf(rel) {
  const target = path.join(root, rel);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[dev] removed ${rel}`);
  }
}

function freePort(p) {
  if (process.env.SKIP_FREE_PORT === '1') return;
  try {
    const pids = execSync(`lsof -ti :${p}`, { encoding: 'utf8' }).trim();
    if (!pids) return;
    for (const pid of pids.split('\n').filter(Boolean)) {
      console.log(`[dev] stopping process on :${p} (pid ${pid})`);
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* port free */
  }
}

async function main() {
  freePort(port);
  await delay(400);
  rmrf('.next');
  rmrf('node_modules/.cache');

  const userArgs = process.argv.slice(2);
  const useWebpack = userArgs.includes('--webpack');
  const filtered = userArgs.filter((a) => a !== '--webpack');
  const nextArgs = ['dev', ...(useWebpack ? [] : ['--turbopack']), ...filtered];

  console.log(`[dev] npx next ${nextArgs.join(' ')}`);
  console.log('[dev] webpack を使う場合: npm run dev -- --webpack');

  const child = spawn('npx', ['next', ...nextArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
