import assert from 'node:assert/strict';

import {
  createSegmentBrowserPool,
  createSegmentRenderQueue,
  formatSlideRenderStatus,
  parseSlideRenderStatus,
  runSegmentRenderAttempts,
  SEGMENT_BROWSER_PAGE_LIMIT,
  SEGMENT_RENDER_RETRY_WAIT_MS,
  type SegmentBrowser,
  withSegmentBrowser,
} from '../src/lib/slides/segment-render-queue';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    process.stdout.write(`ok ${name}\n`);
  } catch (error) {
    process.stderr.write(`fail ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function main() {
  await test('連続した描画でもChromiumは1つだけ起動する', async () => {
    const queue = createSegmentRenderQueue();
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const release: Array<() => void> = [];
    const gates = [0, 1].map(
      () =>
        new Promise<void>((resolve) => {
          release.push(resolve);
        }),
    );
    const done = new Promise<void>((resolve, reject) => {
      let remaining = 2;
      const finish = () => {
        remaining -= 1;
        if (remaining === 0) resolve();
      };
      for (const index of [0, 1]) {
        queue.enqueue(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          order.push(`start-${index}`);
          await gates[index];
          active -= 1;
          order.push(`end-${index}`);
          finish();
        });
      }
      setTimeout(() => reject(new Error('queue stalled')), 2000);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(maxActive, 1);
    assert.equal(queue.waiting, 1);
    release[0]();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(maxActive, 1);
    release[1]();
    await done;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ['start-0', 'end-0', 'start-1', 'end-1']);
    assert.equal(queue.active, 0);
    assert.equal(queue.waiting, 0);
  });

  await test('失敗しても次の描画は止まらない', async () => {
    const queue = createSegmentRenderQueue();
    const seen: string[] = [];
    await new Promise<void>((resolve, reject) => {
      queue.enqueue(async () => {
        seen.push('fail');
        throw new Error('boom');
      });
      queue.enqueue(async () => {
        seen.push('next');
        resolve();
      });
      setTimeout(() => reject(new Error('queue stalled')), 2000);
    });
    assert.deepEqual(seen, ['fail', 'next']);
  });

  await test('起動失敗と描画失敗のどちらでもブラウザと一時ディレクトリを片づける', async () => {
    const removed: string[] = [];
    const closed: string[] = [];
    await assert.rejects(
      withSegmentBrowser(
        '/tmp/segment-a',
        async () => {
          throw new Error('Failed to launch the browser process');
        },
        async () => 'unused',
        async (dir) => {
          removed.push(dir);
        },
      ),
    );
    assert.equal(removed.join(','), '/tmp/segment-a');
    assert.equal(closed.length, 0);

    await assert.rejects(
      withSegmentBrowser(
        '/tmp/segment-b',
        async (): Promise<SegmentBrowser> => ({
          async close() {
            closed.push('b');
          },
        }),
        async () => {
          throw new Error('screenshot failed');
        },
        async (dir) => {
          removed.push(dir);
        },
      ),
    );
    assert.equal(closed.join(','), 'b');
    assert.equal(removed.join(','), '/tmp/segment-a,/tmp/segment-b');
  });

  await test('リソース解放のあとに再試行して復旧する', async () => {
    const events: string[] = [];
    const result = await runSegmentRenderAttempts(
      async (attempt) => {
        events.push(`start-${attempt}`);
        await withSegmentBrowser(
          `/tmp/attempt-${attempt}`,
          async () => ({
            async close() {
              events.push(`close-${attempt}`);
            },
          }),
          async () => {
            if (attempt === 1) throw new Error('Failed to launch the browser process');
            events.push(`ok-${attempt}`);
          },
          async () => {
            events.push(`remove-${attempt}`);
          },
        );
      },
      async () => {
        events.push('wait');
      },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(events, ['start-1', 'close-1', 'remove-1', 'wait', 'start-2', 'ok-2', 'close-2', 'remove-2']);
  });

  await test('最終失敗は成功状態にならない', async () => {
    let waits = 0;
    const result = await runSegmentRenderAttempts(
      async () => {
        throw new Error('Failed to launch the browser process');
      },
      async (ms) => {
        waits += 1;
        assert.equal(ms, SEGMENT_RENDER_RETRY_WAIT_MS);
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Failed to launch/);
    assert.equal(waits, 2);
    assert.equal(parseSlideRenderStatus(formatSlideRenderStatus('failed', result.ok ? '' : result.error)).state, 'failed');
    assert.equal(parseSlideRenderStatus(formatSlideRenderStatus('success')).state, 'success');
    assert.notEqual(parseSlideRenderStatus('failed\nFailed to launch\n').state, 'success');
  });

  await test('複数セグメントで同じChromiumを再利用しページは毎回閉じる', async () => {
    const events: string[] = [];
    const pool = createSegmentBrowserPool({
      pageLimit: SEGMENT_BROWSER_PAGE_LIMIT,
      createUserDataDir: () => '/tmp/segment-shared',
      removeDir: async (dir) => {
        events.push(`rm:${dir}`);
      },
      launch: async () => {
        events.push('launch');
        let pageNumber = 0;
        return {
          async newPage() {
            pageNumber += 1;
            const id = pageNumber;
            events.push(`open:${id}`);
            return {
              async close() {
                events.push(`page-close:${id}`);
              },
            };
          },
          async close() {
            events.push('browser-close');
          },
        };
      },
    });
    await pool.withPage(async () => 'first');
    await pool.withPage(async () => 'second');
    assert.equal(pool.launchCount(), 1);
    assert.equal(pool.hasBrowser(), true);
    assert.equal(events.filter((event) => event.startsWith('page-close:')).length, 2);
    assert.equal(events.includes('browser-close'), false);
    assert.equal(events.includes('rm:/tmp/segment-shared'), false);
  });

  await test('描画失敗と切断ではブラウザを破棄し次回復旧する', async () => {
    const events: string[] = [];
    let disconnect: () => void = () => undefined;
    const pool = createSegmentBrowserPool({
      createUserDataDir: () => `/tmp/segment-${events.filter((event) => event === 'launch').length + 1}`,
      removeDir: async (dir) => {
        events.push(`rm:${dir}`);
      },
      launch: async () => {
        events.push('launch');
        return {
          on(_event: 'disconnected', listener: () => void) {
            disconnect = listener;
          },
          async newPage() {
            events.push('open');
            return {
              async close() {
                events.push('page-close');
              },
            };
          },
          async close() {
            events.push('browser-close');
          },
        };
      },
    });
    await assert.rejects(pool.withPage(async () => {
      throw new Error('screenshot failed');
    }));
    assert.equal(pool.hasBrowser(), false);
    assert.equal(events.includes('page-close'), true);
    assert.equal(events.filter((event) => event === 'browser-close').length, 1);
    assert.equal(events.includes('rm:/tmp/segment-1'), true);
    await pool.withPage(async () => 'recovered');
    assert.equal(pool.launchCount(), 2);
    await pool.withPage(async () => {
      disconnect();
    });
    assert.equal(pool.hasBrowser(), false);
    await pool.withPage(async () => 'after-disconnect');
    assert.equal(pool.launchCount(), 3);
  });

  await test('20枚ごとにChromiumを再起動する', async () => {
    const pool = createSegmentBrowserPool({
      pageLimit: 20,
      createUserDataDir: () => '/tmp/segment-batch',
      removeDir: async () => undefined,
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        async close() {},
      }),
    });
    for (let index = 0; index < 20; index += 1) {
      await pool.withPage(async () => index);
    }
    assert.equal(pool.launchCount(), 1);
    assert.equal(pool.hasBrowser(), false);
    await pool.withPage(async () => 'next-batch');
    assert.equal(pool.launchCount(), 2);
    assert.equal(pool.hasBrowser(), true);
  });

  await test('終了が返らないChromiumは強制停止する', async () => {
    const events: string[] = [];
    const pool = createSegmentBrowserPool({
      pageLimit: 1,
      closeTimeoutMs: 20,
      createUserDataDir: () => '/tmp/segment-hang',
      removeDir: async (dir) => {
        events.push(`rm:${dir}`);
      },
      forceKill: () => {
        events.push('kill');
      },
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        close: () => new Promise<void>(() => undefined),
      }),
    });
    await pool.withPage(async () => 'done');
    assert.equal(events.includes('kill'), true);
    assert.equal(events.includes('rm:/tmp/segment-hang'), true);
    assert.equal(pool.hasBrowser(), false);
  });

  await test('ページ操作のタイムアウトでブラウザを破棄する', async () => {
    const pool = createSegmentBrowserPool({
      pageTimeoutMs: 20,
      createUserDataDir: () => '/tmp/segment-timeout',
      removeDir: async () => undefined,
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        async close() {},
      }),
    });
    await assert.rejects(
      pool.withPage(() => new Promise(() => undefined)),
      /segment page operation timed out/,
    );
    assert.equal(pool.hasBrowser(), false);
    await pool.withPage(async () => 'again');
    assert.equal(pool.launchCount(), 2);
  });

  await test('60秒のアイドルで終了し、その前の描画は同じChromiumを再利用する', async () => {
    const events: string[] = [];
    const pool = createSegmentBrowserPool({
      idleMs: 40,
      createUserDataDir: () => '/tmp/segment-idle',
      removeDir: async (dir) => {
        events.push(`rm:${dir}`);
      },
      launch: async () => {
        events.push('launch');
        return {
          async newPage() {
            return { async close() {} };
          },
          async close() {
            events.push('browser-close');
          },
        };
      },
    });
    await pool.withPage(async () => 'first');
    await sleep(20);
    await pool.withPage(async () => 'second');
    assert.equal(pool.launchCount(), 1);
    assert.equal(pool.hasBrowser(), true);
    await sleep(70);
    assert.equal(pool.hasBrowser(), false);
    assert.equal(events.filter((event) => event === 'browser-close').length, 1);
    assert.equal(events.includes('rm:/tmp/segment-idle'), true);
    await pool.withPage(async () => 'after-idle');
    assert.equal(pool.launchCount(), 2);
  });

  await test('描画中とキュー待機中はアイドル終了しない', async () => {
    let release: () => void = () => undefined;
    const rendering = createSegmentBrowserPool({
      idleMs: 20,
      createUserDataDir: () => '/tmp/segment-rendering',
      removeDir: async () => undefined,
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        async close() {},
      }),
    });
    const running = rendering.withPage(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await sleep(50);
    assert.equal(rendering.hasBrowser(), true);
    assert.equal(rendering.launchCount(), 1);
    release();
    await running;
    assert.equal(rendering.hasBrowser(), true);

    let busy = true;
    const waiting = createSegmentBrowserPool({
      idleMs: 20,
      isBusy: () => busy,
      createUserDataDir: () => '/tmp/segment-waiting',
      removeDir: async () => undefined,
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        async close() {},
      }),
    });
    await waiting.withPage(async () => 'queued');
    await sleep(50);
    assert.equal(waiting.hasBrowser(), true);
    busy = false;
    await sleep(80);
    assert.equal(waiting.hasBrowser(), false);
  });

  await test('アイドル終了と新しい描画は同じブラウザを同時に使わない', async () => {
    const events: string[] = [];
    let finishClose = () => undefined;
    const pool = createSegmentBrowserPool({
      idleMs: 30,
      closeTimeoutMs: 500,
      createUserDataDir: () => '/tmp/segment-race',
      removeDir: async () => {
        events.push('rm');
      },
      launch: async () => {
        const id = events.filter((event) => event.startsWith('launch:')).length + 1;
        events.push(`launch:${id}`);
        return {
          async newPage() {
            events.push(`use:${id}`);
            return { async close() {} };
          },
          close() {
            events.push(`close-start:${id}`);
            return new Promise<void>((resolve) => {
              finishClose = () => {
                events.push(`close-end:${id}`);
                resolve();
              };
            });
          },
        };
      },
    });
    await pool.withPage(async () => 'first');
    await sleep(50);
    assert.equal(events.includes('close-start:1'), true);
    const next = pool.withPage(async () => 'second');
    await sleep(20);
    assert.equal(events.includes('launch:2'), false);
    assert.equal(events.includes('use:2'), false);
    finishClose();
    await next;
    assert.equal(pool.launchCount(), 2);
    const closeEnd = events.indexOf('close-end:1');
    const secondLaunch = events.indexOf('launch:2');
    assert.equal(closeEnd >= 0 && secondLaunch > closeEnd, true);
    assert.equal(events.includes('use:1') && events.indexOf('use:2') > events.lastIndexOf('use:1'), true);
  });

  await test('アイドル終了が返らない場合は強制停止して一時ディレクトリを削除する', async () => {
    const events: string[] = [];
    const pool = createSegmentBrowserPool({
      idleMs: 20,
      closeTimeoutMs: 20,
      createUserDataDir: () => '/tmp/segment-idle-kill',
      removeDir: async (dir) => {
        events.push(`rm:${dir}`);
      },
      forceKill: () => {
        events.push('kill');
      },
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        close: () => new Promise<void>(() => undefined),
      }),
    });
    await pool.withPage(async () => 'done');
    await sleep(70);
    assert.equal(events.includes('kill'), true);
    assert.equal(events.includes('rm:/tmp/segment-idle-kill'), true);
    assert.equal(pool.hasBrowser(), false);
  });

  await test('呼び出しごとの上限がプール既定より長ければ正常な処理を30秒相当で切らない', async () => {
    const pool = createSegmentBrowserPool({
      pageTimeoutMs: 30,
      createUserDataDir: () => '/tmp/segment-timeout-override',
      removeDir: async () => undefined,
      launch: async () => ({
        async newPage() {
          return { async close() {} };
        },
        async close() {},
      }),
    });
    const value = await pool.withPage(async () => {
      await sleep(80);
      return 'kept';
    }, 200);
    assert.equal(value, 'kept');
  });

  if (process.exitCode) process.exit(process.exitCode);
}

main();
