import { randomBytes, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'youtube_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;
const HANDOFF_ROW_ID = 'current';
const HANDOFF_TABLE = 'youtube_oauth_handoff';

const REQUIRED_ENV = [
  'YOUTUBE_OAUTH_CLIENT_ID',
  'YOUTUBE_OAUTH_CLIENT_SECRET',
  'YOUTUBE_OAUTH_REDIRECT_URI',
  'YOUTUBE_OAUTH_START_SECRET',
] as const;

const FORBIDDEN_QUERY_KEYS = new Set([
  'secret',
  'token',
  'password',
  'client_secret',
  'refresh_token',
  'key',
]);

const PUBLIC_TOKEN_ERRORS = new Set([
  'invalid_grant',
  'invalid_client',
  'redirect_uri_mismatch',
  'invalid_request',
  'refresh_token_missing',
  'token_exchange_failed',
]);

export type OauthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  startSecret: string;
};

export type OauthConfigResult =
  | { ok: true; config: OauthConfig }
  | { ok: false; message: string };

export type HandoffStore = {
  save(refreshToken: string): Promise<void>;
  take(): Promise<string | null>;
};

type TokenErrorBody = {
  error?: unknown;
};

export type CallbackDeps = {
  fetchImpl?: typeof fetch;
  store?: HandoffStore;
  prepare?: () => Promise<void>;
};

export type TakeDeps = {
  store?: HandoffStore;
};

export function readOauthConfig(): OauthConfigResult {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    return { ok: false, message: `環境変数が未設定です: ${missing.join(', ')}` };
  }

  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI!.trim();
  if (!isAllowedRedirectUri(redirectUri)) {
    return { ok: false, message: 'YOUTUBE_OAUTH_REDIRECT_URI の形式が不正です' };
  }

  return {
    ok: true,
    config: {
      clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID!.trim(),
      clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!.trim(),
      redirectUri,
      startSecret: process.env.YOUTUBE_OAUTH_START_SECRET!.trim(),
    },
  };
}

export function authorizeStart(request: Request, secret: string): boolean {
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  if (header.length === 0 || header.length > 4096) return false;

  if (header.startsWith('Bearer ')) {
    return secretsMatch(header.slice('Bearer '.length).trim(), secret);
  }

  if (!header.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice('Basic '.length).trim(), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const passwordMatches = secretsMatch(password, secret);
  const userMatches = secretsMatch(user, secret);
  return passwordMatches || userMatches;
}

export function queryCarriesSecret(url: URL, secret: string): boolean {
  for (const [key, value] of url.searchParams) {
    if (FORBIDDEN_QUERY_KEYS.has(key.toLowerCase())) return true;
    if (secret && value.includes(secret)) return true;
  }
  return Boolean(secret) && url.search.includes(secret);
}

export async function handleOauthStart(request: Request): Promise<Response> {
  const configResult = readOauthConfig();
  if (!configResult.ok) {
    return htmlResponse('設定エラー', [configResult.message], 500);
  }

  const url = new URL(request.url);
  if (queryCarriesSecret(url, configResult.config.startSecret)) {
    return htmlResponse('拒否しました', ['秘密情報は URL に含められません。'], 400);
  }

  if (!authorizeStart(request, configResult.config.startSecret)) {
    return new Response('認証が必要です', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="YouTube OAuth", charset="UTF-8"',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const state = randomBytes(32).toString('base64url');
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildGoogleAuthUrl(configResult.config, state),
      'Set-Cookie': serializeStateCookie(state, STATE_MAX_AGE_SECONDS),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function handleOauthCallback(
  request: Request,
  deps: CallbackDeps = {},
): Promise<Response> {
  const configResult = readOauthConfig();
  if (!configResult.ok) {
    return htmlResponse('設定エラー', [configResult.message], 500, clearStateCookie());
  }

  const url = new URL(request.url);
  if (queryContainsValue(url, configResult.config.clientSecret) || url.searchParams.has('client_secret')) {
    return htmlResponse(
      '認証に失敗しました',
      ['リクエストを拒否しました。'],
      400,
      clearStateCookie(),
    );
  }

  const queryState = url.searchParams.get('state') ?? '';
  const cookieState = readStateCookie(request.headers.get('cookie'));
  if (!queryState || !cookieState || !secretsMatch(queryState, cookieState)) {
    return htmlResponse(
      '認証に失敗しました',
      ['state が一致しないため拒否しました。'],
      400,
      clearStateCookie(),
    );
  }

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return htmlResponse(
      '認証に失敗しました',
      [`Google が認可を完了しませんでした（${publicOauthError(oauthError)}）。`],
      400,
      clearStateCookie(),
    );
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return htmlResponse(
      '認証に失敗しました',
      ['認証コードがありません。'],
      400,
      clearStateCookie(),
    );
  }

  if (!deps.store) {
    if (!isSupabaseConfigured()) {
      return htmlResponse(
        '設定エラー',
        ['SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です。'],
        500,
      );
    }
    try {
      await (deps.prepare ?? assertHandoffTable)();
    } catch (error) {
      const missingTable = error instanceof Error && error.message === 'handoff_table_missing';
      return htmlResponse(
        '設定エラー',
        [
          missingTable
            ? '一時保存用のテーブル youtube_oauth_handoff がありません。マイグレーションを適用してから、このページを再読み込みしてください。'
            : '一時保存の確認に失敗しました。',
        ],
        500,
      );
    }
  }

  const store = deps.store ?? createSupabaseHandoffStore();
  const exchanged = await exchangeAuthCode(configResult.config, code, deps.fetchImpl ?? fetch);
  if (!exchanged.ok) {
    return htmlResponse(
      '認証に失敗しました',
      [`トークン交換に失敗しました（${exchanged.reason}）。同意からやり直してください。`],
      502,
      clearStateCookie(),
    );
  }

  try {
    await store.save(exchanged.refreshToken);
  } catch (error) {
    const missingTable = error instanceof Error && error.message === 'handoff_table_missing';
    return htmlResponse(
      '認証に失敗しました',
      [
        missingTable
          ? '一時保存用のテーブル youtube_oauth_handoff がありません。マイグレーションを適用してから同意をやり直してください。'
          : 'Refresh Token の一時保存に失敗しました。同意からやり直してください。',
      ],
      500,
      clearStateCookie(),
    );
  }

  return htmlResponse(
    '認証できました',
    [
      'YouTube の認可が完了し、Refresh Token をサーバーだけが読める一時保存へ書き込みました。',
      'Railway の環境変数へ移すには、YOUTUBE_OAUTH_START_SECRET を Authorization ヘッダーに付けて GET /api/youtube/oauth/refresh-token を1回呼び出してください。応答の本文がトークンです。呼び出した直後に一時保存からは削除されます。',
      '取り出した値を YOUTUBE_REFRESH_TOKEN に設定し、サービスを再起動してください。',
    ],
    200,
    clearStateCookie(),
  );
}

export async function handleTakeRefreshToken(
  request: Request,
  deps: TakeDeps = {},
): Promise<Response> {
  const configResult = readOauthConfig();
  if (!configResult.ok) {
    return jsonResponse({ error: configResult.message }, 500);
  }

  const url = new URL(request.url);
  if (queryCarriesSecret(url, configResult.config.startSecret)) {
    return jsonResponse({ error: '秘密情報は URL に含められません。' }, 400);
  }

  if (!authorizeStart(request, configResult.config.startSecret)) {
    return new Response('認証が必要です', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="YouTube OAuth", charset="UTF-8"',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  if (requestAcceptsHtml(request)) {
    return htmlResponse('トークンは表示しません', [
      'ブラウザでは Refresh Token を表示しません。',
      'Authorization ヘッダーに YOUTUBE_OAUTH_START_SECRET を付け、curl で GET /api/youtube/oauth/refresh-token を1回呼び出してください。応答の本文がトークンで、呼び出しと同時に一時保存から削除されます。',
    ], 200);
  }

  const store = deps.store ?? createSupabaseHandoffStore();
  let refreshToken: string | null;
  try {
    refreshToken = await store.take();
  } catch (error) {
    const missingTable = error instanceof Error && error.message === 'handoff_table_missing';
    return jsonResponse(
      {
        error: missingTable
          ? '一時保存用のテーブル youtube_oauth_handoff がありません。'
          : '一時保存の読み取りに失敗しました。',
      },
      500,
    );
  }

  if (!refreshToken) {
    return jsonResponse({ error: '保存された Refresh Token はありません。' }, 404);
  }

  return new Response(refreshToken, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="youtube-refresh-token.txt"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function createSupabaseHandoffStore(client?: SupabaseClient): HandoffStore {
  return {
    async save(refreshToken: string) {
      const supabase = client ?? getSupabaseAdmin();
      const { error } = await supabase.from(HANDOFF_TABLE).upsert({
        id: HANDOFF_ROW_ID,
        refresh_token: refreshToken,
        created_at: new Date().toISOString(),
      });
      if (error) throw handoffFailure(error.code);
    },
    async take() {
      const supabase = client ?? getSupabaseAdmin();
      const { data, error } = await supabase
        .from(HANDOFF_TABLE)
        .delete()
        .eq('id', HANDOFF_ROW_ID)
        .select('refresh_token');
      if (error) throw handoffFailure(error.code);
      const row = Array.isArray(data) ? data[0] : null;
      const token = row && typeof row.refresh_token === 'string' ? row.refresh_token : '';
      return token.length > 0 ? token : null;
    },
  };
}

export function buildGoogleAuthUrl(config: OauthConfig, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_UPLOAD_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeAuthCode(
  config: OauthConfig,
  code: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; refreshToken: string } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, reason: 'token_exchange_failed' };
  }

  let payload: TokenErrorBody & { refresh_token?: unknown };
  try {
    payload = (await response.json()) as TokenErrorBody & { refresh_token?: unknown };
  } catch {
    return { ok: false, reason: 'token_exchange_failed' };
  }

  if (!response.ok) {
    return { ok: false, reason: publicTokenError(payload.error) };
  }

  if (typeof payload.refresh_token !== 'string' || payload.refresh_token.length === 0) {
    return { ok: false, reason: 'refresh_token_missing' };
  }
  if (payload.refresh_token.length > 4096) {
    return { ok: false, reason: 'refresh_token_missing' };
  }

  return { ok: true, refreshToken: payload.refresh_token };
}

async function assertHandoffTable(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(HANDOFF_TABLE).select('id').limit(1);
  if (error) throw handoffFailure(error.code);
}

function queryContainsValue(url: URL, secret: string): boolean {
  if (!secret) return false;
  if (url.search.includes(secret)) return true;
  for (const [, value] of url.searchParams) {
    if (value.includes(secret)) return true;
  }
  return false;
}

function handoffFailure(code: string | undefined): Error {
  if (code === '42P01' || code === 'PGRST205') return new Error('handoff_table_missing');
  return new Error('handoff_failed');
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === 'https:') return true;
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return url.protocol === 'http:' && local;
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function serializeStateCookie(state: string, maxAge: number): string {
  return `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/youtube/oauth; Max-Age=${maxAge}`;
}

function clearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/youtube/oauth; Max-Age=0`;
}

function readStateCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== STATE_COOKIE) continue;
    return part.slice(separator + 1).trim();
  }
  return '';
}

function publicOauthError(value: string): string {
  return /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : 'unknown_error';
}

function publicTokenError(value: unknown): string {
  if (typeof value === 'string' && PUBLIC_TOKEN_ERRORS.has(value)) return value;
  return 'token_exchange_failed';
}

function requestAcceptsHtml(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html');
}

function htmlResponse(title: string, paragraphs: string[], status: number, setCookie?: string): Response {
  const body = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
<script>history.replaceState(null,"",location.pathname)</script>
</body>
</html>`;
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (setCookie) headers.set('Set-Cookie', setCookie);
  return new Response(html, { status, headers });
}

function jsonResponse(body: { error: string }, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
