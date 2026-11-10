import { rm } from 'node:fs/promises';

import puppeteer from 'puppeteer';

import { createSegmentBrowserPool, getSegmentRenderQueue } from '@/lib/slides/segment-render-queue';

// Puppeteerの操作ごとの既定は30秒。全体を30秒で包むと、複数操作の合計で成功していた描画を落とす。
export const TOPIC_PAGE_TIMEOUT_MS = 90_000;
export const THUMBNAIL_PAGE_TIMEOUT_MS = 180_000;

let browserGeneration = 0;

function createPool() {
  return createSegmentBrowserPool({
    createUserDataDir() {
      browserGeneration += 1;
      return `/tmp/puppeteer_segment_${process.pid}_${browserGeneration}`;
    },
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    isBusy: () => {
      const queue = getSegmentRenderQueue();
      return queue.active > 0 || queue.waiting > 0;
    },
    launch: async (userDataDir) => {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
        `--user-data-dir=${userDataDir}`,
      ];
      try {
        return await puppeteer.launch({ headless: true, args });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('Could not find Chrome')) throw error;
        return puppeteer.launch({ headless: true, channel: 'chrome', args });
      }
    },
  });
}

let renderBrowserPool: ReturnType<typeof createPool> | null = null;

export function getRenderBrowserPool() {
  renderBrowserPool ??= createPool();
  return renderBrowserPool;
}
