import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';

import { GET as startRoute } from '../src/app/api/youtube/oauth/start/route';
import {
  createSupabaseHandoffStore,
  handleOauthCallback,
  handleOauthStart,
  handleTakeRefreshToken,
  type HandoffStore,
} from '../src/lib/youtube/oauth';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-client-secret-value';
const REDIRECT_URI = 'https://autobriefs-production.up.railway.app/api/youtube/oauth/callback';
const START_SECRET = 'test-start-secret-value';
const REFRESH_TOKEN = '1//test-refresh-token-value';
const ACCESS_TOKEN = 'ya29.test-access-token-value';
const AUTH_CODE = 'test-auth-code-value';

const ENV_KEYS = [
  'YOUTUBE_OAUTH_CLIENT_ID',
  'YOUTUBE_OAUTH_CLIENT_SECRET',
  'YOUTUBE_OAUTH_REDIRECT_URI',
  'YOUTUBE_OAUTH_START_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const SOURCE_FILES = [
  'src/lib/youtube/oauth.ts',
  'src/app/api/youtube/oauth/start/route.ts',
  'src/app/api/youtube/oauth/callback/route.ts',
  'src/app/api/youtube/oauth/refresh-token/route.ts',
];

type MemoryStore = HandoffStore & { saved: string | null; saves: number; takes: number };

function memoryStore(initial: string | null = null): MemoryStore {
  const state = { saved: initial, saves: 0, takes: 0 };
  return {
    get saved() {
      return state.saved;
    },
    get saves() {
      return state.saves;
    },
    get takes() {
      return state.takes;
    },
    async save(refreshToken: string) {
      state.saves += 1;
      state.saved = refreshToken;
    },
    async take() {
      state.takes += 1;
      const value = state.saved;
      state.saved = null;
      return value;
    },
  };
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function applyEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnv(snapshot: Record<(typeof ENV_KEYS)[number], string | undefined>) {
  applyEnv(snapshot);
}

function configuredEnv(): Partial<Record<(typeof ENV_KEYS)[number], string>> {
  return {
    YOUTUBE_OAUTH_CLIENT_ID: CLIENT_ID,
    YOUTUBE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    YOUTUBE_OAUTH_REDIRECT_URI: REDIRECT_URI,
    YOUTUBE_OAUTH_START_SECRET: START_SECRET,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
}

function assertNoSecrets(text: string) {
  assert.equal(text.includes(CLIENT_SECRET), false);
  assert.equal(text.includes(START_SECRET), false);
  assert.equal(text.includes(REFRESH_TOKEN), false);
  assert.equal(text.includes(ACCESS_TOKEN), false);
  assert.equal(text.includes(AUTH_CODE), false);
}

async function captureOutput(run: () => Promise<void>) {
  const leaks: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals = Object.fromEntries(methods.map((method) => [method, console[method]])) as Record<
    (typeof methods)[number],
    (...args: unknown[]) => void
  >;
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const watch = (chunk: unknown) => {
    const text = String(chunk);
    if (
      text.includes(CLIENT_SECRET) ||
      text.includes(START_SECRET) ||
      text.includes(REFRESH_TOKEN) ||
      text.includes(ACCESS_TOKEN)
    ) {
      leaks.push(text);
    }
  };

  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      watch(args.map((arg) => String(arg)).join(' '));
    };
  }
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
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    restoreEnv(snapshot);
  }
}

async function main() {
  await test('環境変数が未設定のとき変数名だけを返す', async () => {
    applyEnv({});
    const response = await handleOauthStart(new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/start'));
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /YOUTUBE_OAUTH_CLIENT_ID/);
    assert.match(body, /YOUTUBE_OAUTH_CLIENT_SECRET/);
    assert.match(body, /YOUTUBE_OAUTH_REDIRECT_URI/);
    assert.match(body, /YOUTUBE_OAUTH_START_SECRET/);
    assert.equal(response.headers.get('location'), null);
  });

  await test('Redirect URI の形式が不正なとき値を返さない', async () => {
    applyEnv({ ...configuredEnv(), YOUTUBE_OAUTH_REDIRECT_URI: 'http://evil.example/callback' });
    const response = await handleOauthStart(
      new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/start', {
        headers: { authorization: `Bearer ${START_SECRET}` },
      }),
    );
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /YOUTUBE_OAUTH_REDIRECT_URI の形式が不正です/);
    assert.equal(body.includes('evil.example'), false);
  });

  await test('開始 API は合言葉なしを拒否する', async () => {
    applyEnv(configuredEnv());
    const response = await startRoute(new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/start'));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate') ?? '', /Basic/);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('set-cookie'), null);
    assertNoSecrets(await response.text());
  });

  await test('開始 API は誤った合言葉を拒否する', async () => {
    applyEnv(configuredEnv());
    const response = await handleOauthStart(
      new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/start', {
        headers: { authorization: basic('oauth', 'wrong-secret') },
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('location'), null);
  });

  await test('秘密情報を URL に含む開始リクエストを拒否する', async () => {
    applyEnv(configuredEnv());
    const response = await handleOauthStart(
      new Request(
        `https://autobriefs-production.up.railway.app/api/youtube/oauth/start?secret=${START_SECRET}`,
        { headers: { authorization: `Bearer ${START_SECRET}` } },
      ),
    );
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
    assertNoSecrets(body);
  });

  await test('開始 API は Google へリダイレクトし state Cookie を付ける', async () => {
    applyEnv(configuredEnv());
    const response = await handleOauthStart(
      new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/start', {
        headers: { authorization: basic('oauth', START_SECRET) },
      }),
    );
    assert.equal(response.status, 302);
    const location = response.headers.get('location') ?? '';
    const cookie = response.headers.get('set-cookie') ?? '';
    const target = new URL(location);
    assert.equal(target.origin, 'https://accounts.google.com');
    assert.equal(target.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(target.searchParams.get('redirect_uri'), REDIRECT_URI);
    assert.equal(target.searchParams.get('response_type'), 'code');
    assert.equal(target.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.upload');
    assert.equal(target.searchParams.get('access_type'), 'offline');
    assert.equal(target.searchParams.get('prompt'), 'consent');
    const state = target.searchParams.get('state') ?? '';
    assert.ok(state.length >= 32);
    assert.match(cookie, new RegExp(`youtube_oauth_state=${state}`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/api\/youtube\/oauth/);
    assert.match(cookie, /Max-Age=600/);
    assert.equal(location.includes(CLIENT_SECRET), false);
    assert.equal(location.includes(START_SECRET), false);
  });

  await test('state が一致しないコールバックを拒否する', async () => {
    applyEnv(configuredEnv());
    const store = memoryStore();
    let called = false;
    const response = await handleOauthCallback(
      new Request(`${REDIRECT_URI}?state=wrong-state&code=${AUTH_CODE}`, {
        headers: { cookie: 'youtube_oauth_state=expected-state' },
      }),
      {
        store,
        fetchImpl: async () => {
          called = true;
          throw new Error('fetch should not run');
        },
      },
    );
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /state が一致しない/);
    assert.equal(called, false);
    assert.equal(store.saves, 0);
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assertNoSecrets(body);
  });

  await test('Refresh Token が無い応答ではアクセストークンを返さない', async () => {
    applyEnv(configuredEnv());
    const store = memoryStore();
    const response = await handleOauthCallback(
      new Request(`${REDIRECT_URI}?state=same-state&code=${AUTH_CODE}`, {
        headers: { cookie: 'youtube_oauth_state=same-state' },
      }),
      {
        store,
        fetchImpl: async () =>
          new Response(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 3600 }), { status: 200 }),
      },
    );
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.match(body, /refresh_token_missing/);
    assert.equal(store.saves, 0);
    assertNoSecrets(body);
  });

  await test('成功時は一時保存し、レスポンスとログにトークンを出さない', async () => {
    applyEnv(configuredEnv());
    const store = memoryStore();
    const leaks = await captureOutput(async () => {
      const response = await handleOauthCallback(
        new Request(`${REDIRECT_URI}?state=same-state&code=${AUTH_CODE}`, {
          headers: { cookie: 'youtube_oauth_state=same-state' },
        }),
        {
          store,
          fetchImpl: async (_url, init) => {
            const body = String(init?.body ?? '');
            assert.equal(body.includes(CLIENT_SECRET), true);
            return new Response(
              JSON.stringify({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN }),
              { status: 200 },
            );
          },
        },
      );
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.match(text, /一時保存/);
      assertNoSecrets(text);
      assertNoSecrets(response.headers.get('set-cookie') ?? '');
      assert.equal(store.saved, REFRESH_TOKEN);
    });
    assert.deepEqual(leaks, []);
  });

  await test('保存失敗の詳細にトークンが含まれても応答へ出さない', async () => {
    applyEnv(configuredEnv());
    const store: HandoffStore = {
      async save() {
        throw new Error(REFRESH_TOKEN);
      },
      async take() {
        return null;
      },
    };
    const leaks = await captureOutput(async () => {
      const response = await handleOauthCallback(
        new Request(`${REDIRECT_URI}?state=same-state&code=${AUTH_CODE}`, {
          headers: { cookie: 'youtube_oauth_state=same-state' },
        }),
        {
          store,
          fetchImpl: async () =>
            new Response(JSON.stringify({ refresh_token: REFRESH_TOKEN, access_token: ACCESS_TOKEN }), {
              status: 200,
            }),
        },
      );
      const text = await response.text();
      assert.equal(response.status, 500);
      assert.match(text, /一時保存に失敗しました/);
      assertNoSecrets(text);
    });
    assert.deepEqual(leaks, []);
  });

  await test('一時保存テーブルが無いときはトークン交換を始めない', async () => {
    applyEnv(configuredEnv());
    let called = false;
    const response = await handleOauthCallback(
      new Request(`${REDIRECT_URI}?state=same-state&code=${AUTH_CODE}`, {
        headers: { cookie: 'youtube_oauth_state=same-state' },
      }),
      {
        prepare: async () => {
          throw new Error('handoff_table_missing');
        },
        fetchImpl: async () => {
          called = true;
          throw new Error('fetch should not run');
        },
      },
    );
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /youtube_oauth_handoff/);
    assert.equal(called, false);
    assert.equal(response.headers.get('set-cookie'), null);
    assertNoSecrets(body);
  });

  await test('Supabase 未設定ではトークン交換を始めない', async () => {
    applyEnv({ ...configuredEnv(), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
    let called = false;
    const response = await handleOauthCallback(
      new Request(`${REDIRECT_URI}?state=same-state&code=${AUTH_CODE}`, {
        headers: { cookie: 'youtube_oauth_state=same-state' },
      }),
      {
        fetchImpl: async () => {
          called = true;
          throw new Error('fetch should not run');
        },
      },
    );
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /SUPABASE_URL/);
    assert.equal(called, false);
    assertNoSecrets(body);
  });

  await test('取得 API は未認証を拒否する', async () => {
    applyEnv(configuredEnv());
    const store = memoryStore(REFRESH_TOKEN);
    const response = await handleTakeRefreshToken(
      new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/refresh-token'),
      { store },
    );
    assert.equal(response.status, 401);
    assert.equal(store.takes, 0);
    assertNoSecrets(await response.text());
  });

  await test('ブラウザから取得 API を開いてもトークンを出さず削除しない', async () => {
    applyEnv(configuredEnv());
    const store = memoryStore(REFRESH_TOKEN);
    const response = await handleTakeRefreshToken(
      new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/refresh-token', {
        headers: {
          authorization: `Bearer ${START_SECRET}`,
          accept: 'text/html',
        },
      }),
      { store },
    );
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /表示しません/);
    assert.equal(store.takes, 0);
    assert.equal(store.saved, REFRESH_TOKEN);
    assertNoSecrets(body);
  });

  await test('取得 API は合言葉付きの1回だけトークンを返し削除する', async () => {
    applyEnv(configuredEnv());
    const store = memoryStore(REFRESH_TOKEN);
    const leaks = await captureOutput(async () => {
      const response = await handleTakeRefreshToken(
        new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/refresh-token', {
          headers: { authorization: `Bearer ${START_SECRET}`, accept: '*/*' },
        }),
        { store },
      );
      assert.equal(response.status, 200);
      assert.equal(await response.text(), REFRESH_TOKEN);
      assert.match(response.headers.get('content-disposition') ?? '', /attachment/);
      const second = await handleTakeRefreshToken(
        new Request('https://autobriefs-production.up.railway.app/api/youtube/oauth/refresh-token', {
          headers: { authorization: `Bearer ${START_SECRET}`, accept: '*/*' },
        }),
        { store },
      );
      const secondBody = await second.text();
      assert.equal(second.status, 404);
      assertNoSecrets(secondBody);
    });
    assert.deepEqual(leaks, []);
  });

  await test('Supabase のエラーメッセージは例外へ載せない', async () => {
    const fake = {
      from() {
        return {
          upsert: async () => ({ error: { message: REFRESH_TOKEN, code: '23505' } }),
          delete() {
            return {
              eq() {
                return {
                  select: async () => ({ data: null, error: { message: REFRESH_TOKEN, code: 'PGRST205' } }),
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;
    const store = createSupabaseHandoffStore(fake);
    await assert.rejects(store.save(REFRESH_TOKEN), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'handoff_failed');
      return true;
    });
    await assert.rejects(store.take(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'handoff_table_missing');
      return true;
    });
  });

  await test('実装ファイルにログ出力が無い', async () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('console.'), false, file);
      assert.equal(source.includes('stdout'), false, file);
      assert.equal(source.includes('stderr'), false, file);
    }
  });

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

main();
