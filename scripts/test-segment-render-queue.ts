import assert from 'node:assert/strict';

import {
  createSegmentRenderQueue,
  formatSlideRenderStatus,
  parseSlideRenderStatus,
  runSegmentRenderAttempts,
  SEGMENT_RENDER_RETRY_WAIT_MS,
  type SegmentBrowser,
  withSegmentBrowser,
} from '../src/lib/slides/segment-render-queue';

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

  if (process.exitCode) process.exit(process.exitCode);
}

main();
