import { request as httpsRequest } from 'node:https';
import type { ClientRequest, IncomingHttpHeaders } from 'node:http';

import { authorizeStart, queryCarriesSecret, refreshAccessToken } from '@/lib/youtube/oauth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'projects';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_MP4_BYTES = 256 * 1024 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 200_000;
const DESCRIPTION = 'AutoBriefs private upload test.';
const SESSION_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus';

const REQUIRED_ENV = [
  'YOUTUBE_OAUTH_CLIENT_ID',
  'YOUTUBE_OAUTH_CLIENT_SECRET',
  'YOUTUBE_OAUTH_START_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const SAFE_REASONS = new Set([
  'invalid_grant',
  'invalid_client',
  'invalid_request',
  'redirect_uri_mismatch',
  'token_exchange_failed',
  'access_token_missing',
  'expires_in_missing',
  'invalid_video_id',
  'mp4_not_found',
  'size_unknown',
  'stream_unavailable',
  'upload_in_progress',
  'upload_incomplete',
  'upload_failed',
  'marker_save_failed',
  'marker_invalid',
  'privacy_mismatch',
  'session_start_failed',
  'storage_failed',
  'quotaExceeded',
  'uploadLimitExceeded',
  'forbidden',
  'insufficientPermissions',
  'unauthorized',
  'invalidValue',
  'badRequest',
  'youtube_request_failed',
]);

export type UploadStorage = {
  readMarker(videoId: string): Promise<'absent' | 'invalid' | { youtubeVideoId: string }>;
  readMp4Size(videoId: string): Promise<number | 'missing' | 'unknown'>;
  openMp4(videoId: string, start: number): Promise<ReadableStream<Uint8Array> | null>;
  createLock(videoId: string): Promise<'created' | 'exists' | 'failed'>;
  deleteLock(videoId: string): Promise<void>;
  saveMarker(videoId: string, youtubeVideoId: string): Promise<void>;
};

export type PutRequest = {
  url: string;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
  byteLength: number;
};

export type PutResponse = {
  status: number;
  headers: Headers;
  bodyText: string;
};

export type UploadDeps = {
  fetchImpl?: typeof fetch;
  storage?: UploadStorage;
  putImpl?: (request: PutRequest) => Promise<PutResponse>;
};

type UploadedVideo = {
  youtubeVideoId: string;
  isPrivate: boolean;
};

export function validateVideoId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const videoId = value.trim();
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;
  return videoId;
}

export function readByteSize(value: unknown): number | null {
  const size =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_MP4_BYTES) return null;
  return size;
}

export async function handleYoutubeUpload(request: Request, deps: UploadDeps = {}): Promise<Response> {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    return json({ error: `環境変数が未設定です: ${missing.join(', ')}` }, 500);
  }

  const startSecret = process.env.YOUTUBE_OAUTH_START_SECRET!.trim();
  const url = new URL(request.url);
  if (queryCarriesSecret(url, startSecret)) {
    return json({ error: '秘密情報は URL に含められません。' }, 400);
  }
  if (!authorizeStart(request, startSecret)) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'invalid_video_id' }, 400);
    payload = JSON.parse(raw) as unknown;
  } catch {
    return json({ error: 'invalid_video_id' }, 400);
  }

  const record = payload && typeof payload === 'object' ? (payload as { videoId?: unknown }) : {};
  const videoId = validateVideoId(record.videoId);
  if (!videoId) return json({ error: 'invalid_video_id' }, 400);

  const storage = deps.storage ?? createSupabaseUploadStorage(deps.fetchImpl ?? fetch);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const putImpl = deps.putImpl ?? putHttps;

  let marker: 'absent' | 'invalid' | { youtubeVideoId: string };
  try {
    marker = await storage.readMarker(videoId);
  } catch {
    return json({ error: 'storage_failed' }, 500);
  }
  if (marker === 'invalid') return json({ error: 'marker_invalid' }, 409);
  if (marker !== 'absent') {
    return json(
      { youtubeVideoId: marker.youtubeVideoId, privacyStatus: 'private', alreadyUploaded: true },
      200,
    );
  }

  let size: number | 'missing' | 'unknown';
  try {
    size = await storage.readMp4Size(videoId);
  } catch {
    return json({ error: 'storage_failed' }, 500);
  }
  if (size === 'missing') return json({ error: 'mp4_not_found' }, 404);
  if (size === 'unknown') return json({ error: 'size_unknown' }, 422);

  let lock: 'created' | 'exists' | 'failed';
  try {
    lock = await storage.createLock(videoId);
  } catch {
    return json({ error: 'storage_failed' }, 500);
  }
  if (lock === 'exists') return json({ error: 'upload_in_progress' }, 409);
  if (lock !== 'created') return json({ error: 'storage_failed' }, 500);

  let sessionStarted = false;
  try {
    const refreshed = await refreshAccessToken(fetchImpl);
    if (!refreshed.ok) {
      await storage.deleteLock(videoId);
      return json({ error: safeReason(refreshed.reason) }, 502);
    }

    const mp4 = await storage.openMp4(videoId, 0);
    if (!mp4) {
      await storage.deleteLock(videoId);
      return json({ error: 'stream_unavailable' }, 422);
    }

    const session = await startUploadSession(fetchImpl, refreshed.accessToken, videoId, size);
    if (!session.ok) {
      await cancelStream(mp4);
      await storage.deleteLock(videoId);
      return json({ error: session.error }, 502);
    }
    sessionStarted = true;

    const uploaded = await sendMp4(putImpl, storage, session.url, videoId, size, mp4);
    if (!uploaded) {
      return json({ error: 'upload_incomplete' }, 502);
    }
    if (!uploaded.isPrivate) {
      return markerFailure(storage, videoId, uploaded.youtubeVideoId, 'privacy_mismatch');
    }

    try {
      await storage.saveMarker(videoId, uploaded.youtubeVideoId);
    } catch {
      return json(
        { error: 'marker_save_failed', youtubeVideoId: uploaded.youtubeVideoId, privacyStatus: 'private' },
        500,
      );
    }

    try {
      await storage.deleteLock(videoId);
    } catch {
      return json(
        { youtubeVideoId: uploaded.youtubeVideoId, privacyStatus: 'private', alreadyUploaded: false },
        200,
      );
    }
    return json(
      { youtubeVideoId: uploaded.youtubeVideoId, privacyStatus: 'private', alreadyUploaded: false },
      200,
    );
  } catch {
    if (!sessionStarted) {
      await storage.deleteLock(videoId).catch(() => undefined);
    }
    return json({ error: 'upload_failed' }, 502);
  }
}

export function createSupabaseUploadStorage(fetchImpl: typeof fetch = fetch): UploadStorage {
  return {
    async readMarker(videoId) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage.from(BUCKET).download(markerPath(videoId));
      if (error) {
        if (isNotFound(error)) return 'absent';
        throw new Error('storage_failed');
      }
      const text = (await data.text()).trim();
      if (!YOUTUBE_ID_PATTERN.test(text)) return 'invalid';
      return { youtubeVideoId: text };
    },
    async readMp4Size(videoId) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage.from(BUCKET).info(mp4Path(videoId));
      if (error) {
        if (isNotFound(error)) return 'missing';
        throw new Error('storage_failed');
      }
      const size = readByteSize(data?.size);
      return size === null ? 'unknown' : size;
    },
    async openMp4(videoId, start) {
      const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!supabaseUrl || !serviceKey) return null;
      const headers = new Headers({
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      });
      if (start > 0) headers.set('Range', `bytes=${start}-`);
      const response = await fetchImpl(`${supabaseUrl}/storage/v1/object/projects/${mp4Path(videoId)}`, {
        headers,
        cache: 'no-store',
        redirect: 'manual',
      });
      if (start > 0 ? response.status !== 206 : response.status !== 200) {
        await response.body?.cancel();
        return null;
      }
      if (!response.body) return null;
      return response.body;
    },
    async createLock(videoId) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.storage.from(BUCKET).upload(lockPath(videoId), 'uploading', {
        upsert: false,
        contentType: 'text/plain; charset=utf-8',
        cacheControl: '0',
      });
      if (!error) return 'created';
      if (isAlreadyExists(error)) return 'exists';
      return 'failed';
    },
    async deleteLock(videoId) {
      const supabase = getSupabaseAdmin();
      await supabase.storage.from(BUCKET).remove([lockPath(videoId)]);
    },
    async saveMarker(videoId, youtubeVideoId) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.storage.from(BUCKET).upload(markerPath(videoId), youtubeVideoId, {
        upsert: false,
        contentType: 'text/plain; charset=utf-8',
        cacheControl: '0',
      });
      if (!error) return;
      if (!isAlreadyExists(error)) throw new Error('storage_failed');
      const existing = await this.readMarker(videoId);
      if (existing !== 'absent' && existing !== 'invalid' && existing.youtubeVideoId === youtubeVideoId) return;
      throw new Error('storage_failed');
    },
  };
}

async function startUploadSession(
  fetchImpl: typeof fetch,
  accessToken: string,
  videoId: string,
  size: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetchImpl(SESSION_URL, {
      method: 'POST',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: `AutoBriefs test ${videoId}`,
          description: DESCRIPTION,
        },
        status: { privacyStatus: 'private' },
      }),
    });
  } catch {
    return { ok: false, error: 'session_start_failed' };
  }

  if (response.status !== 200) {
    const bodyText = await readLimitedText(response);
    return { ok: false, error: youtubeReason(bodyText) };
  }

  const location = response.headers.get('location') ?? '';
  if (!isGoogleUploadUrl(location)) return { ok: false, error: 'session_start_failed' };
  return { ok: true, url: location };
}

async function sendMp4(
  putImpl: (request: PutRequest) => Promise<PutResponse>,
  storage: UploadStorage,
  sessionUrl: string,
  videoId: string,
  size: number,
  firstStream: ReadableStream<Uint8Array>,
): Promise<UploadedVideo | null> {
  const first = await putOrNull(putImpl, {
    url: sessionUrl,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
    },
    body: firstStream,
    byteLength: size,
  });
  const completed = first ? readUploadedVideo(first) : null;
  if (completed) return completed;
  if (first && first.status !== 308 && first.status < 500) return null;

  let status: PutResponse;
  try {
    status = await putImpl({
      url: sessionUrl,
      headers: {
        'Content-Length': '0',
        'Content-Range': `bytes */${size}`,
      },
      body: null,
      byteLength: 0,
    });
  } catch {
    return null;
  }
  const already = readUploadedVideo(status);
  if (already) return already;
  if (status.status !== 308) return null;

  const start = nextByte(status.headers.get('range') ?? '');
  if (start === null || start > size) return null;
  if (start === size) return null;

  const rest = await storage.openMp4(videoId, start);
  if (!rest) return null;
  const remaining = size - start;
  const second = await putOrNull(putImpl, {
    url: sessionUrl,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(remaining),
      'Content-Range': `bytes ${start}-${size - 1}/${size}`,
    },
    body: rest,
    byteLength: remaining,
  });
  if (!second) return null;
  return readUploadedVideo(second);
}

async function putOrNull(
  putImpl: (request: PutRequest) => Promise<PutResponse>,
  request: PutRequest,
): Promise<PutResponse | null> {
  try {
    return await putImpl(request);
  } catch {
    await cancelStream(request.body);
    return null;
  }
}

function putHttps(request: PutRequest): Promise<PutResponse> {
  let target: URL;
  try {
    target = new URL(request.url);
  } catch {
    return Promise.reject(new Error('upload_transfer_failed'));
  }
  if (target.protocol !== 'https:' || !isGoogleHost(target.hostname)) {
    return Promise.reject(new Error('upload_transfer_failed'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error('upload_transfer_failed'));
    };
    const req = httpsRequest(
      {
        method: 'PUT',
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: request.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) {
            res.destroy();
            fail();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({
            status: res.statusCode ?? 0,
            headers: toHeaders(res.headers),
            bodyText: Buffer.concat(chunks).toString('utf8'),
          });
        });
        res.on('error', fail);
      },
    );
    req.on('error', fail);
    if (!request.body) {
      req.end();
      return;
    }
    writeStream(request.body, req, request.byteLength).catch(() => {
      req.destroy();
      fail();
    });
  });
}

async function writeStream(stream: ReadableStream<Uint8Array>, req: ClientRequest, expected: number): Promise<void> {
  const reader = stream.getReader();
  let sent = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sent += value.byteLength;
      if (sent > expected) {
        await reader.cancel();
        throw new Error('upload_transfer_failed');
      }
      const ok = req.write(Buffer.from(value));
      if (!ok) await new Promise<void>((resolve) => req.once('drain', resolve));
    }
  } finally {
    reader.releaseLock();
  }
  if (sent !== expected) throw new Error('upload_transfer_failed');
  req.end();
}

function readUploadedVideo(response: PutResponse): UploadedVideo | null {
  if (response.status !== 200 && response.status !== 201) return null;
  try {
    const payload = JSON.parse(response.bodyText) as { id?: unknown; status?: { privacyStatus?: unknown } };
    if (typeof payload.id !== 'string' || !YOUTUBE_ID_PATTERN.test(payload.id)) return null;
    return { youtubeVideoId: payload.id, isPrivate: payload.status?.privacyStatus === 'private' };
  } catch {
    return null;
  }
}

function youtubeReason(bodyText: string): string {
  try {
    const payload = JSON.parse(bodyText) as { error?: { errors?: Array<{ reason?: unknown }> } };
    const reason = payload.error?.errors?.[0]?.reason;
    if (typeof reason === 'string' && SAFE_REASONS.has(reason)) return reason;
  } catch {
    return 'youtube_request_failed';
  }
  return 'youtube_request_failed';
}

async function readLimitedText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? '' : text;
  } catch {
    return '';
  }
}

function nextByte(range: string): number | null {
  const match = /bytes=(\d+)-(\d+)/.exec(range);
  if (!match) return null;
  const end = Number(match[2]);
  if (!Number.isSafeInteger(end) || end < 0) return null;
  return end + 1;
}

function isGoogleUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isGoogleHost(url.hostname);
  } catch {
    return false;
  }
}

function isGoogleHost(hostname: string): boolean {
  return hostname === 'googleapis.com' || hostname.endsWith('.googleapis.com');
}

function safeReason(reason: string): string {
  if (SAFE_REASONS.has(reason)) return reason;
  if (/^環境変数が未設定です: [A-Z0-9_, ]+$/.test(reason)) return reason;
  return 'upload_failed';
}

async function markerFailure(
  storage: UploadStorage,
  videoId: string,
  youtubeVideoId: string,
  error: string,
): Promise<Response> {
  try {
    await storage.saveMarker(videoId, youtubeVideoId);
  } catch {
    return json({ error: 'marker_save_failed', youtubeVideoId, privacyStatus: 'private' }, 500);
  }
  await storage.deleteLock(videoId).catch(() => undefined);
  return json({ error, youtubeVideoId, privacyStatus: 'private' }, 502);
}

async function cancelStream(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) return;
  try {
    await stream.cancel();
  } catch {
    return;
  }
}

function markerPath(videoId: string): string {
  return `${videoId}/youtube-video-id.txt`;
}

function mp4Path(videoId: string): string {
  return `${videoId}/${videoId}.mp4`;
}

function lockPath(videoId: string): string {
  return `${videoId}/youtube-upload-lock.txt`;
}

function isNotFound(error: { message?: string; status?: number; statusCode?: number | string }): boolean {
  const status = storageStatus(error);
  if (status === 400 || status === 404) return true;
  return (error.message ?? '').toLowerCase().includes('not found');
}

function isAlreadyExists(error: { message?: string; status?: number; statusCode?: number | string }): boolean {
  if (storageStatus(error) === 409) return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('already exists') || message.includes('duplicate');
}

function storageStatus(error: { status?: number; statusCode?: number | string }): number {
  const value = error.status ?? error.statusCode;
  const status = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(status) ? status : 0;
}

function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    }
  }
  return headers;
}

function unauthorized(): Response {
  return new Response('認証が必要です', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="YouTube OAuth", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
