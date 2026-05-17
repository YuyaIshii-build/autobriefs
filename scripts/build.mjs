#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function rmrf(rel) {
  const target = path.join(root, rel);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[build] removed ${rel}`);
  }
}

async function main() {
  const check = spawn('node', ['scripts/ensure-dev-idle.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });
  const idle = await new Promise((resolve) => {
    check.on('exit', (code) => resolve(code === 0));
  });
  if (!idle) process.exit(1);

  rmrf('.next');
  rmrf('node_modules/.cache');

  const child = spawn('npx', ['next', 'build'], {
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
