#!/usr/bin/env node
/** dev サーバー稼働中に .next を消すと 5611.js 系エラーになるため、先に停止を促す */
import { execSync } from 'node:child_process';

const port = process.env.PORT || '3000';

if (process.env.SKIP_DEV_IDLE_CHECK === '1') {
  process.exit(0);
}

try {
  const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  if (pids) {
    console.error(
      `\n[error] ポート ${port} で開発サーバーが動いています。\n` +
        `        先に Ctrl+C で停止してから再実行してください。\n` +
        `        （dev 稼働中に build / .next 削除をするとチャンクエラーになります）\n`
    );
    process.exit(1);
  }
} catch {
  /* port free */
}
