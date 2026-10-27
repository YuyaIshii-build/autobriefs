import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { POST as uploadRoute } from '../src/app/api/youtube/upload/route';
import {
  handleYoutubeUpload,
  readByteSize,
  validateVideoId,
  type PutRequest,
  type PutResponse,
  type UploadStorage,
} from '../src/lib/youtube/upload';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-client-secret-value';
const START_SECRET = 'test-start-secret-value';
const REFRESH_TOKEN = '1//test-refresh-token-value';
const ACCESS_TOKEN = 'ya29.test-access-token-value';
const VIDEO_ID = '202605121430';
const YOUTUBE_ID = 'abcdefghijk';
const SESSION_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test-session';

const ENV_KEYS = [
  'YOUTUBE_OAUTH_CLIENT_ID',
  'YOUTUBE_OAUTH_CLIENT_SECRET',
  'YOUTUBE_OAUTH_START_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const SOURCE_FILES = ['src/lib/youtube/upload.ts', 'src/app/api/youtube/upload/route.ts'];

type FakeStorage = UploadStorage & {
  marker: string | null;
  lock: 'absent' | 'held';
  lockDeleted: boolean;
  opens: number[];
  markerSaves: string[];
};

function streamOf(length: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(length).fill(7));
      controller.close();
    },
  });
}

function fakeStorage(size: number | 'missing' | 'unknown' = 8): FakeStorage {
  const state: FakeStorage = {
    marker: null,
    lock: 'absent',
    lockDeleted: false,
    opens: [],
    markerSaves: [],
    async readMarker() {
      if (state.marker === 'bad') return 'invalid';
      if (!state.marker) return 'absent';
      return { youtubeVideoId: state.marker };
    },
    async readMp4Size() {
      return size;
    },
    async openMp4(_videoId, start) {
      state.opens.push(start);
      if (start < 0) return null;
      return streamOf(size === 'missing' || size === 'unknown' ? 0 : size - start);
    },
    async createLock() {
      if (state.lock === 'held') return 'exists';
      state.lock = 'held';
      return 'created';
    },
    async deleteLock() {
      state.lock = 'absent';
      state.lockDeleted = true;
    },
    async saveMarker(_videoId, youtubeVideoId) {
      state.markerSaves.push(youtubeVideoId);
      state.marker = youtubeVideoId;
    },
  };
  return state;
}

function applyEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function configuredEnv(): Partial<Record<(typeof ENV_KEYS)[number], string>> {
  return {
    YOUTUBE_OAUTH_CLIENT_ID: CLIENT_ID,
    YOUTUBE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    YOUTUBE_OAUTH_START_SECRET: START_SECRET,
    YOUTUBE_REFRESH_TOKEN: REFRESH_TOKEN,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
}

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnv(snapshot: ReturnType<typeof snapshotEnv>) {
  applyEnv(snapshot);
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function assertNoSecrets(text: string) {
  assert.equal(text.includes(CLIENT_SECRET), false);
  assert.equal(text.includes(START_SECRET), false);
  assert.equal(text.includes(REFRESH_TOKEN), false);
  assert.equal(text.includes(ACCESS_TOKEN), false);
  assert.equal(text.includes('test-session'), false);
  assert.equal(text.includes('upload_id'), false);
}

function uploadRequest(body: unknown, authorization?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  return new Request('https://autobriefs-production.up.railway.app/api/youtube/upload', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function tokenFetch(onSession?: (body: string) => void): typeof fetch {
  return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const target = String(url);
    if (target.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 3599 }), { status: 200 });
    }
    if (target.includes('/upload/youtube/v3/videos')) {
      onSession?.(String(init?.body ?? ''));
      return new Response(null, { status: 200, headers: { Location: SESSION_URL } });
    }
    throw new Error(`unexpected fetch ${target}`);
  }) as typeof fetch;
}

function successPut(): { put: (request: PutRequest) => Promise<PutResponse>; calls: PutRequest[] } {
  const calls: PutRequest[] = [];
  return {
    calls,
    async put(request) {
      calls.push(request);
      if (request.body) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
          // consume the stream one chunk at a time
        }
      }
      return {
        status: 200,
        headers: new Headers(),
        bodyText: JSON.stringify({ id: YOUTUBE_ID, status: { privacyStatus: 'private' } }),
      };
    },
  };
}

async function captureOutput(run: () => Promise<void>) {
  const leaks: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals = Object.fromEntries(methods.map((method) => [method, console[method]])) as Record<
    (typeof methods)[number],
    (...args: unknown[]) => void
  >;
  const watch = (chunk: unknown) => {
    const text = String(chunk);
    if (
      text.includes(CLIENT_SECRET) ||
      text.includes(START_SECRET) ||
      text.includes(REFRESH_TOKEN) ||
      text.includes(ACCESS_TOKEN) ||
      text.includes('test-session')
    ) {
      leaks.push(text);
    }
  };
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      watch(args.map((arg) => String(arg)).join(' '));
    };
  }
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown) => {
    watch(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    watch(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    await run();
  } finally {
    for (const method of methods) console[method] = originals[method];
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
  return leaks;
}

async function test(name: string, fn: () => Promise<void>) {
  const snapshot = snapshotEnv();
  try {
    await fn();
    process.stdout.write(`ok ${name}\n`);
  } catch (error) {
    process.stderr.write(`fail ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    restoreEnv(snapshot);
  }
}

async function main() {
  await test('videoId は英数字だけを許可する', async () => {
    assert.equal(validateVideoId(VIDEO_ID), VIDEO_ID);
    assert.equal(validateVideoId('https://evil.example/a.mp4'), null);
    assert.equal(validateVideoId('abc/def'), null);
    assert.equal(validateVideoId('../secret'), null);
    assert.equal(readByteSize(0), null);
    assert.equal(readByteSize(8), 8);
  });

  await test('未認証と誤った合言葉は401', async () => {
    applyEnv(configuredEnv());
    const storage = fakeStorage();
    const missing = await uploadRoute(uploadRequest({ videoId: VIDEO_ID }));
    const wrong = await handleYoutubeUpload(
      uploadRequest({ videoId: VIDEO_ID }, basic('oauth', 'wrong-secret')),
      { storage, fetchImpl: tokenFetch(), putImpl: async () => { throw new Error('put should not run'); } },
    );
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate') ?? '', /Basic/);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.equal(wrong.status, 401);
    assert.equal(storage.lock, 'absent');
    assertNoSecrets(await missing.text());
    assertNoSecrets(await wrong.text());
  });

  await test('不正なvideoIdと外部URLを拒否する', async () => {
    applyEnv(configuredEnv());
    for (const videoId of ['https://evil.example/a.mp4', 'abc/def', '../secret', '']) {
      const storage = fakeStorage();
      let called = false;
      const response = await handleYoutubeUpload(uploadRequest({ videoId }, `Bearer ${START_SECRET}`), {
        storage,
        fetchImpl: (async () => {
          called = true;
          throw new Error('fetch should not run');
        }) as typeof fetch,
      });
      assert.equal(response.status, 400);
      assert.equal(called, false);
      assert.equal(storage.opens.length, 0);
      const body = await response.text();
      assert.match(body, /invalid_video_id/);
      assert.equal(body.includes('evil.example'), false);
    }
  });

  await test('環境変数が不足しているときは名前だけを返す', async () => {
    applyEnv({ ...configuredEnv(), YOUTUBE_REFRESH_TOKEN: undefined });
    const response = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, `Bearer ${START_SECRET}`), {
      storage: fakeStorage(),
    });
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /YOUTUBE_REFRESH_TOKEN/);
    assertNoSecrets(body);
  });

  await test('マーカーがある場合は再アップロードしない', async () => {
    applyEnv(configuredEnv());
    const storage = fakeStorage();
    storage.marker = YOUTUBE_ID;
    let called = false;
    const response = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, `Bearer ${START_SECRET}`), {
      storage,
      fetchImpl: (async () => {
        called = true;
        throw new Error('fetch should not run');
      }) as typeof fetch,
      putImpl: async () => {
        throw new Error('put should not run');
      },
    });
    const body = await response.json() as { youtubeVideoId: string; privacyStatus: string; alreadyUploaded: boolean };
    assert.equal(response.status, 200);
    assert.equal(body.youtubeVideoId, YOUTUBE_ID);
    assert.equal(body.privacyStatus, 'private');
    assert.equal(body.alreadyUploaded, true);
    assert.equal(called, false);
    assert.equal(storage.markerSaves.length, 0);
  });

  await test('成功時はprivateで送りマーカーを保存する', async () => {
    applyEnv(configuredEnv());
    const storage = fakeStorage();
    const sink = successPut();
    let sessionBody = '';
    const leaks = await captureOutput(async () => {
      const response = await handleYoutubeUpload(
        uploadRequest(
          { videoId: VIDEO_ID, privacyStatus: 'public', videoUrl: 'https://evil.example/a.mp4' },
          `Bearer ${START_SECRET}`,
        ),
        { storage, fetchImpl: tokenFetch((body) => { sessionBody = body; }), putImpl: sink.put },
      );
      const text = await response.text();
      const body = JSON.parse(text) as { youtubeVideoId: string; privacyStatus: string; alreadyUploaded: boolean };
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(body.youtubeVideoId, YOUTUBE_ID);
      assert.equal(body.privacyStatus, 'private');
      assert.equal(body.alreadyUploaded, false);
      assertNoSecrets(text);
      assert.deepEqual(storage.markerSaves, [YOUTUBE_ID]);
      assert.equal(storage.lockDeleted, true);
      assert.equal(sink.calls.length, 1);
      assert.equal(typeof sink.calls[0]?.body?.getReader, 'function');
      assert.equal(sink.calls[0]?.headers['Content-Length'], '8');
    });
    const sent = JSON.parse(sessionBody) as { status: { privacyStatus: string }; snippet: { title: string } };
    assert.equal(sent.status.privacyStatus, 'private');
    assert.equal(sent.snippet.title, `AutoBriefs test ${VIDEO_ID}`);
    assert.equal(sessionBody.includes('public'), false);
    assert.equal(sessionBody.includes('evil.example'), false);
    assert.deepEqual(leaks, []);
  });

  await test('転送失敗時は同じセッションで再開する', async () => {
    applyEnv(configuredEnv());
    const storage = fakeStorage();
    let dataPuts = 0;
    const response = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, basic('oauth', START_SECRET)), {
      storage,
      fetchImpl: tokenFetch(),
      putImpl: async (request) => {
        if (request.body === null) {
          return { status: 308, headers: new Headers({ range: 'bytes=0-3' }), bodyText: '' };
        }
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
          // consume
        }
        dataPuts += 1;
        if (dataPuts === 1) {
          return {
            status: 500,
            headers: new Headers(),
            bodyText: JSON.stringify({ error: { message: REFRESH_TOKEN, errors: [{ reason: 'backendError', message: ACCESS_TOKEN }] } }),
          };
        }
        assert.equal(request.headers['Content-Range'], 'bytes 4-7/8');
        return {
          status: 200,
          headers: new Headers(),
          bodyText: JSON.stringify({ id: YOUTUBE_ID, status: { privacyStatus: 'private' } }),
        };
      },
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, new RegExp(YOUTUBE_ID));
    assert.equal(text.includes('backendError'), false);
    assertNoSecrets(text);
    assert.deepEqual(storage.opens, [0, 4]);
    assert.deepEqual(storage.markerSaves, [YOUTUBE_ID]);
  });

  await test('マーカー保存失敗時はVideo IDを返してロックを残す', async () => {
    applyEnv(configuredEnv());
    const storage = fakeStorage();
    storage.saveMarker = async () => {
      throw new Error(ACCESS_TOKEN);
    };
    const leaks = await captureOutput(async () => {
      const response = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, `Bearer ${START_SECRET}`), {
        storage,
        fetchImpl: tokenFetch(),
        putImpl: successPut().put,
      });
      const text = await response.text();
      const body = JSON.parse(text) as { error: string; youtubeVideoId: string; privacyStatus: string; alreadyUploaded?: boolean };
      assert.equal(response.status, 500);
      assert.equal(body.error, 'marker_save_failed');
      assert.equal(body.youtubeVideoId, YOUTUBE_ID);
      assert.equal(body.privacyStatus, 'private');
      assert.equal(body.alreadyUploaded, undefined);
      assert.equal(storage.lockDeleted, false);
      assertNoSecrets(text);
    });
    assert.deepEqual(leaks, []);
  });

  await test('進行中のロックがある場合は新しいアップロードを始めない', async () => {
    applyEnv(configuredEnv());
    const storage = fakeStorage();
    storage.lock = 'held';
    let called = false;
    const response = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, `Bearer ${START_SECRET}`), {
      storage,
      fetchImpl: (async () => {
        called = true;
        throw new Error('fetch should not run');
      }) as typeof fetch,
    });
    const body = await response.json() as { error: string };
    assert.equal(response.status, 409);
    assert.equal(body.error, 'upload_in_progress');
    assert.equal(called, false);
    assert.equal(storage.opens.length, 0);
  });

  await test('サイズ不明とストリーム不可はアップロードを始めない', async () => {
    applyEnv(configuredEnv());
    const unknown = fakeStorage('unknown');
    const unknownResponse = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, `Bearer ${START_SECRET}`), {
      storage: unknown,
      fetchImpl: tokenFetch(),
    });
    assert.equal(unknownResponse.status, 422);
    assert.match(await unknownResponse.text(), /size_unknown/);
    assert.equal(unknown.lock, 'absent');

    const storage = fakeStorage();
    storage.openMp4 = async () => null;
    let session = false;
    const response = await handleYoutubeUpload(uploadRequest({ videoId: VIDEO_ID }, `Bearer ${START_SECRET}`), {
      storage,
      fetchImpl: tokenFetch(() => {
        session = true;
      }),
      putImpl: async () => {
        throw new Error('put should not run');
      },
    });
    assert.equal(response.status, 422);
    assert.match(await response.text(), /stream_unavailable/);
    assert.equal(session, false);
    assert.equal(storage.lockDeleted, true);
  });

  await test('実装ファイルにログ出力が無い', async () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('console.'), false, file);
      assert.equal(source.includes('stdout'), false, file);
      assert.equal(source.includes('stderr'), false, file);
    }
  });

  if (process.exitCode) process.exit(process.exitCode);
}

main();
