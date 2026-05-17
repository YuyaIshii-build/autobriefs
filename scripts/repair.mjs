#!/usr/bin/env node
/** チャンクエラー時: dev 停止後に実行 → npm run dev */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3000';

function rmrf(rel) {
  const target = path.join(root, rel);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[repair] removed ${rel}`);
  }
}

try {
  const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  if (pids) {
    console.error(`[repair] ポート ${port} の dev を先に停止してください (Ctrl+C)`);
    process.exit(1);
  }
} catch {
  /* ok */
}

rmrf('.next');
rmrf('node_modules/.cache');
console.log('[repair] 完了。npm run dev で再起動してください。');
