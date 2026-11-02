export const SEGMENT_RENDER_MAX_ATTEMPTS = 3;
export const SEGMENT_RENDER_RETRY_WAIT_MS = 15_000;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type SlideRenderState = 'queued' | 'rendering' | 'success' | 'failed' | 'absent';

export type SegmentBrowser = {
  close: () => Promise<void>;
};

export function slideRenderStatusPath(videoId: string, segmentId: string): string | null {
  if (!SAFE_ID.test(videoId) || !SAFE_ID.test(segmentId)) return null;
  return `${videoId}/${segmentId}/slide-render-status.txt`;
}

export function formatSlideRenderStatus(state: Exclude<SlideRenderState, 'absent'>, error?: string): string {
  if (state === 'failed') return `failed\n${sanitizeStatusError(error)}\n`;
  return `${state}\n`;
}

export function parseSlideRenderStatus(text: string): { state: SlideRenderState; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const state = lines[0];
  if (state === 'queued' || state === 'rendering' || state === 'success') return { state };
  if (state === 'failed') return { state: 'failed', error: lines[1] || 'render_failed' };
  return { state: 'absent' };
}

export function createSegmentRenderQueue() {
  let active = 0;
  const waiting: Array<() => Promise<void>> = [];

  const pump = () => {
    if (active >= 1) return;
    const job = waiting.shift();
    if (!job) return;
    active += 1;
    job()
      .catch(() => undefined)
      .finally(() => {
        active -= 1;
        pump();
      });
  };

  return {
    enqueue(job: () => Promise<void>) {
      waiting.push(job);
      pump();
    },
    get active() {
      return active;
    },
    get waiting() {
      return waiting.length;
    },
  };
}

let sharedQueue: ReturnType<typeof createSegmentRenderQueue> | null = null;

export function getSegmentRenderQueue() {
  sharedQueue ??= createSegmentRenderQueue();
  return sharedQueue;
}

export async function runSegmentRenderAttempts(
  run: (attempt: number) => Promise<void>,
  wait: (ms: number) => Promise<void> = delay,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError = 'render_failed';
  for (let attempt = 1; attempt <= SEGMENT_RENDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      await run(attempt);
      return { ok: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < SEGMENT_RENDER_MAX_ATTEMPTS) await wait(SEGMENT_RENDER_RETRY_WAIT_MS);
    }
  }
  return { ok: false, error: sanitizeStatusError(lastError) };
}

export async function withSegmentBrowser<TBrowser extends SegmentBrowser, T>(
  userDataDir: string,
  launch: () => Promise<TBrowser>,
  work: (browser: TBrowser) => Promise<T>,
  removeDir: (dir: string) => Promise<void>,
): Promise<T> {
  let browser: TBrowser | null = null;
  try {
    browser = await launch();
    return await work(browser);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await removeDir(userDataDir).catch(() => undefined);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeStatusError(error: string | undefined): string {
  const singleLine = (error ?? 'render_failed').replace(/\s+/g, ' ').trim();
  const clipped = singleLine.slice(0, 300);
  return clipped.length > 0 ? clipped : 'render_failed';
}
