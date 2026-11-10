import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { uploadMp4File } from '../src/pages/api/concat-videos';

const CHUNK = 64 * 1024;
const TOTAL = 8 * 1024 * 1024;

function streamServer() {
  const received: Buffer[] = [];
  let headers: Record<string, string | string[] | undefined> = {};
  let url = '';
  let method = '';
  let pulledWhilePaused = 0;
  const server = createServer((request, response) => {
    method = request.method ?? '';
    url = request.url ?? '';
    headers = request.headers;
    request.pause();
    setTimeout(() => {
      pulledWhilePaused = pulled;
      request.resume();
      request.on('data', (chunk: Buffer) => {
        received.push(chunk);
      });
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ Id: 'object-id', Key: 'projects/video/video.mp4' }));
      });
    }, 100);
  });
  return {
    server,
    reset() {
      received.length = 0;
      headers = {};
      url = '';
      method = '';
      pulledWhilePaused = 0;
    },
    snapshot: () => ({
      method,
      url,
      headers,
      body: Buffer.concat(received),
      pulledWhilePaused,
    }),
  };
}

let pulled = 0;

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), 'concat-upload-'));
  const filePath = path.join(dir, 'video.mp4');
  const payload = Buffer.alloc(256 * 1024, 7);
  await writeFile(filePath, payload);

  await test('失敗時もファイルを残し、ストリームとヘッダーを渡す', async () => {
    let bodyKind = '';
    let contentLength = '';
    const { error } = await uploadMp4File('video/video.mp4', filePath, {
      from(bucket) {
        assert.equal(bucket, 'projects');
        return {
          async upload(objectPath, body, options) {
            assert.equal(objectPath, 'video/video.mp4');
            assert.equal(typeof body.getReader, 'function');
            assert.equal(Buffer.isBuffer(body), false);
            bodyKind = body.constructor.name;
            contentLength = options.headers['content-length'];
            assert.equal(options.cacheControl, '3600');
            assert.equal(options.upsert, true);
            assert.equal(options.contentType, 'video/mp4');
            assert.equal(options.duplex, 'half');
            assert.equal(contentLength, String(payload.length));
            const reader = body.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              if (next.value) chunks.push(next.value);
            }
            assert.equal(Buffer.concat(chunks).equals(payload), true);
            return { error: { message: 'upload failed' } };
          },
        };
      },
    });
    assert.equal(error?.message, 'upload failed');
    assert.equal(bodyKind, 'ReadableStream');
    assert.equal((await readFile(filePath)).equals(payload), true);
  });

  const probe = streamServer();
  await new Promise<void>((resolve) => probe.server.listen(0, '127.0.0.1', resolve));
  const address = probe.server.address();
  if (!address || typeof address === 'string') throw new Error('local server did not bind');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    await test('SDKはContent-Length付きのストリームを分割受信できる', async () => {
      probe.reset();
      pulled = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const size = Math.min(CHUNK, TOTAL - pulled);
          if (size <= 0) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(size).fill(9));
          pulled += size;
          if (pulled >= TOTAL) controller.close();
        },
      });
      const client = createClient(`${base}/rest/v1`, 'service-role-test', {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const storage = client.storage;
      const original = storage.from.bind(storage);
      const bucket = original('projects');
      const originalUrl = (bucket as unknown as { url: string }).url;
      (bucket as unknown as { url: string }).url = `${base}/storage/v1`;
      void originalUrl;
      const result = await bucket.upload('video/video.mp4', stream, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'video/mp4',
        duplex: 'half',
        headers: { 'content-length': String(TOTAL) },
      });
      const seen = probe.snapshot();
      if (result.error) {
        throw new Error(`sdk upload failed: ${JSON.stringify(result.error)} bytes=${seen.body.length}`);
      }
      if (seen.pulledWhilePaused >= 2 * 1024 * 1024) {
        throw new Error(`sdk buffered more than a send window before the server read it (${seen.pulledWhilePaused} of ${TOTAL})`);
      }
      assert.equal(seen.method, 'POST');
      assert.equal(seen.url, '/storage/v1/object/projects/video/video.mp4');
      assert.equal(seen.headers['content-length'], String(TOTAL));
      assert.equal(seen.headers['content-type'], 'video/mp4');
      assert.equal(seen.headers['x-upsert'], 'true');
      assert.equal(seen.headers['cache-control'], 'max-age=3600');
      assert.equal(typeof seen.headers.authorization, 'string');
      assert.equal(seen.headers.apikey, 'service-role-test');
      assert.equal(seen.body.length, TOTAL);
      assert.equal(seen.body.every((byte) => byte === 9), true);
    });

    await test('完成MP4の送信はファイル内容とContent-Lengthを維持する', async () => {
      probe.reset();
      const client = createClient(`${base}/rest/v1`, 'service-role-test', {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bucket = client.storage.from('projects');
      (bucket as unknown as { url: string }).url = `${base}/storage/v1`;
      const { error } = await uploadMp4File('video/video.mp4', filePath, {
        from() {
          return bucket;
        },
      });
      const seen = probe.snapshot();
      if (error) throw new Error(`file stream upload failed: ${JSON.stringify(error)} bytes=${seen.body.length}`);
      assert.equal(seen.url, '/storage/v1/object/projects/video/video.mp4');
      assert.equal(seen.headers['content-length'], String(payload.length));
      assert.equal(seen.headers['content-type'], 'video/mp4');
      assert.equal(seen.headers['x-upsert'], 'true');
      assert.equal(seen.body.equals(payload), true);
      assert.equal((await readFile(filePath)).equals(payload), true);
    });
  } finally {
    await new Promise<void>((resolve, reject) => probe.server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }

  if (process.exitCode) process.exit(process.exitCode);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    process.stdout.write(`ok ${name}\n`);
  } catch (error) {
    process.stderr.write(`fail ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

main();
