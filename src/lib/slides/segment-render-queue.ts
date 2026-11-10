export const SEGMENT_RENDER_MAX_ATTEMPTS = 3;
export const SEGMENT_RENDER_RETRY_WAIT_MS = 15_000;
export const SEGMENT_BROWSER_PAGE_LIMIT = 20;
export const SEGMENT_PAGE_TIMEOUT_MS = 30_000;
export const SEGMENT_BROWSER_CLOSE_TIMEOUT_MS = 5_000;
export const SEGMENT_BROWSER_IDLE_MS = 60_000;

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

type BrowserWithPage<TPage extends { close: () => Promise<void> }> = {
  close: () => Promise<void>;
  newPage: () => Promise<TPage>;
  on?: (event: 'disconnected', listener: () => void) => void;
};

export type SegmentBrowserPoolOptions<TPage extends { close: () => Promise<void> }> = {
  launch: (userDataDir: string) => Promise<BrowserWithPage<TPage>>;
  createUserDataDir: () => string;
  removeDir: (dir: string) => Promise<void>;
  pageLimit?: number;
  pageTimeoutMs?: number;
  closeTimeoutMs?: number;
  idleMs?: number;
  isBusy?: () => boolean;
  attach?: (browser: BrowserWithPage<TPage>, onDisconnected: () => void) => void;
  forceKill?: (browser: BrowserWithPage<TPage>) => void;
};

export type SegmentBrowserPool<TPage extends { close: () => Promise<void> }> = {
  withPage: <T>(work: (page: TPage) => Promise<T>, timeoutMs?: number) => Promise<T>;
  launchCount: () => number;
  hasBrowser: () => boolean;
};

export function createSegmentBrowserPool<TPage extends { close: () => Promise<void> }>(
  options: SegmentBrowserPoolOptions<TPage>,
): SegmentBrowserPool<TPage> {
  const pageLimit = options.pageLimit ?? SEGMENT_BROWSER_PAGE_LIMIT;
  const pageTimeoutMs = options.pageTimeoutMs ?? SEGMENT_PAGE_TIMEOUT_MS;
  const closeTimeoutMs = options.closeTimeoutMs ?? SEGMENT_BROWSER_CLOSE_TIMEOUT_MS;
  const idleMs = options.idleMs ?? SEGMENT_BROWSER_IDLE_MS;
  const attach = options.attach ?? defaultAttach<BrowserWithPage<TPage>>;
  const forceKill = (target: BrowserWithPage<TPage>) => {
    if (options.forceKill) options.forceKill(target);
    else defaultForceKill(target);
  };
  let browser: BrowserWithPage<TPage> | null = null;
  let userDataDir: string | null = null;
  let pagesUsed = 0;
  let disconnected = false;
  let launches = 0;
  let destroying: Promise<void> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleGeneration = 0;
  let inUse = 0;

  const clearIdleTimer = () => {
    idleGeneration += 1;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const destroy = () => {
    clearIdleTimer();
    if (destroying) return destroying;
    const current = browser;
    const dir = userDataDir;
    browser = null;
    userDataDir = null;
    pagesUsed = 0;
    disconnected = false;
    destroying = (async () => {
      if (current) await closeBrowser(current, closeTimeoutMs, forceKill);
      if (dir) await options.removeDir(dir).catch(() => undefined);
    })().finally(() => {
      destroying = null;
    });
    return destroying;
  };

  const scheduleIdleClose = () => {
    clearIdleTimer();
    if (!browser || inUse > 0) return;
    const generation = idleGeneration;
    const timer = setTimeout(() => {
      if (idleTimer === timer) idleTimer = null;
      const run = chain.then(async () => {
        if (generation !== idleGeneration || inUse > 0 || options.isBusy?.()) {
          if (browser && (inUse > 0 || options.isBusy?.())) scheduleIdleClose();
          return;
        }
        if (!browser) return;
        await destroy();
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
    }, idleMs);
    timer.unref();
    idleTimer = timer;
  };

  const acquire = async () => {
    if (browser && (disconnected || pagesUsed >= pageLimit)) await destroy();
    if (browser) return browser;
    const dir = options.createUserDataDir();
    userDataDir = dir;
    try {
      const launched = await options.launch(dir);
      launches += 1;
      browser = launched;
      pagesUsed = 0;
      disconnected = false;
      attach(launched, () => {
        if (browser === launched) disconnected = true;
      });
      return launched;
    } catch (error) {
      userDataDir = null;
      await options.removeDir(dir).catch(() => undefined);
      throw error;
    }
  };

  const runWithPage = async <T>(work: (page: TPage) => Promise<T>, timeoutMs: number): Promise<T> => {
    let page: TPage | null = null;
    let recycle = false;
    try {
      const current = await acquire();
      page = await withTimeout(current.newPage(), pageTimeoutMs, 'segment page open timed out');
      const result = await withTimeout(work(page), timeoutMs, 'segment page operation timed out');
      pagesUsed += 1;
      if (disconnected) recycle = true;
      return result;
    } catch (error) {
      recycle = true;
      throw error;
    } finally {
      const opened = page;
      if (opened) {
        const closed = await closeWithin(() => opened.close(), closeTimeoutMs);
        if (!closed) recycle = true;
      }
      if (recycle || (browser !== null && pagesUsed >= pageLimit)) await destroy();
    }
  };

  return {
    withPage<T>(work: (page: TPage) => Promise<T>, timeoutMs = pageTimeoutMs) {
      clearIdleTimer();
      inUse += 1;
      const run = chain.then(async () => {
        try {
          return await runWithPage(work, timeoutMs);
        } finally {
          inUse -= 1;
          if (inUse === 0 && browser) scheduleIdleClose();
        }
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    launchCount: () => launches,
    hasBrowser: () => browser !== null,
  };
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

function defaultAttach<TBrowser extends { on?: (event: 'disconnected', listener: () => void) => void }>(
  browser: TBrowser,
  onDisconnected: () => void,
) {
  browser.on?.('disconnected', onDisconnected);
}

function defaultForceKill(browser: object): void {
  const candidate = browser as { process?: () => { pid?: number; kill: (signal?: NodeJS.Signals) => boolean } | null };
  const child = candidate.process?.() ?? null;
  const pid = child?.pid;
  if (pid && process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      // The process group is already gone, or this process cannot signal it.
    }
  }
  try {
    child?.kill('SIGKILL');
  } catch {
    // The browser process has already exited.
  }
}

async function closeBrowser<TBrowser extends { close: () => Promise<void> }>(
  browser: TBrowser,
  timeoutMs: number,
  forceKill: (browser: TBrowser) => void,
) {
  const closed = await closeWithin(() => browser.close(), timeoutMs);
  if (!closed) forceKill(browser);
}

function closeWithin(run: () => Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const pending = run();
    void pending.then(
      () => undefined,
      () => undefined,
    );
    pending.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Promise<T>((resolve, reject) => {
    promise.then(resolve, reject);
  });
  void promise.then(
    () => undefined,
    () => undefined,
  );
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeStatusError(error: string | undefined): string {
  const singleLine = (error ?? 'render_failed').replace(/\s+/g, ' ').trim();
  const clipped = singleLine.slice(0, 300);
  return clipped.length > 0 ? clipped : 'render_failed';
}
