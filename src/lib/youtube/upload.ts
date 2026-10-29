import { request as httpsRequest } from 'node:https';
import type { ClientRequest, IncomingHttpHeaders } from 'node:http';

import { authorizeStart, queryCarriesSecret, refreshAccessToken } from '@/lib/youtube/oauth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'projects';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_MP4_BYTES = 256 * 1024 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 200_000;
const MAX_REQUEST_BYTES = 16_384;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5_000;
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
  'size_read_failed',
  'marker_read_failed',
  'lock_create_failed',
  'marker_write_failed',
  'stream_unavailable',
  'upload_in_progress',
  'upload_incomplete',
  'upload_failed',
  'marker_invalid',
  'privacy_mismatch',
  'session_start_failed',
  'title_unavailable',
  'description_unavailable',
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
  readTitlesFile(videoId: string): Promise<string | 'missing'>;
};

type UploadMetadata = {
  title: string;
  description: string;
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

export type ListMp4Size = (videoId: string) => Promise<number | 'missing' | 'unknown'>;

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

const TITLES_FILE_PATTERN = /^titles-(.+)\.txt$/;
const TITLE_LABEL_PATTERN = /^(?:[・●*\-]\s*)?タイトル\s*[ABCＡＢＣ]\s*(?:（[^）]{0,40}）|\([^)]{0,40}\))?\s*[：:]\s*/u;

export function chooseTitlesFile(files: Array<{ name: string; updatedAt?: string | null }>): string | null {
  const matched = files.filter((file) => TITLES_FILE_PATTERN.test(file.name) && !file.name.includes('/'));
  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0].name;
  const stamped = matched.map((file) => ({ file, stamp: filenameTime(file.name) }));
  if (stamped.every((item) => item.stamp !== null)) {
    stamped.sort((left, right) => right.stamp! - left.stamp! || left.file.name.localeCompare(right.file.name));
    return stamped[0].file.name;
  }
  const timed = matched.map((file) => ({ file, updated: timeMs(file.updatedAt) }));
  if (timed.every((item) => item.updated !== null)) {
    timed.sort((left, right) => right.updated! - left.updated! || left.file.name.localeCompare(right.file.name));
    return timed[0].file.name;
  }
  return null;
}

export function parseTitlesDocument(text: string): { title: string | null; description: string | null } {
  return {
    title: validateTitle(extractTitle(sectionLines(text, 'TITLES'))),
    description: validateDescription(extractDescription(sectionLines(text, 'DESCRIPTIONS'))),
  };
}

function sectionLines(text: string, name: 'TITLES' | 'DESCRIPTIONS'): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `=== ${name} ===`);
  if (start < 0) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^===\s+\S.*===$/.test(line.trim())) break;
    body.push(line);
  }
  return body;
}

function extractTitle(lines: string[]): string | null {
  const candidates: Array<{ role: 'A' | 'B' | 'C' | null; title: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim()) continue;
    const role = titleRole(line);
    const sameLine = validateTitle(cleanTitleLine(line));
    if (sameLine) {
      candidates.push({ role, title: sameLine });
      continue;
    }
    if (!role) continue;
    const next = nextContentIndex(lines, index + 1);
    if (next === null || titleRole(lines[next] ?? '')) continue;
    const body = validateTitle(cleanTitleLine(lines[next] ?? ''));
    if (!body) continue;
    candidates.push({ role, title: body });
    index = next;
  }
  const preferred = candidates.find((item) => item.role === 'A');
  return (preferred ?? candidates[0])?.title ?? null;
}

function titleRole(line: string): 'A' | 'B' | 'C' | null {
  const match = line.match(/タイトル\s*([ABCＡＢＣ])/u);
  if (!match) return null;
  if (match[1] === 'A' || match[1] === 'Ａ') return 'A';
  if (match[1] === 'B' || match[1] === 'Ｂ') return 'B';
  if (match[1] === 'C' || match[1] === 'Ｃ') return 'C';
  return null;
}

function nextContentIndex(lines: string[], start: number): number | null {
  for (let index = start; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim()) return index;
  }
  return null;
}

function cleanTitleLine(line: string): string {
  let text = line.trim().replace(/^[\s・●*\-]+/u, '');
  text = text.replace(/^\d+[.、．]\s*/, '');
  text = text.replace(TITLE_LABEL_PATTERN, '');
  text = text.replace(/^\d+[.、．]\s*/, '');
  return text.replace(/\s+/g, ' ').trim();
}

function extractDescription(lines: string[]): string | null {
  const content = lines.map((line) => line.replace(/\s+$/u, '')).join('\n').trim();
  if (!content || content === '(no descriptions)') return null;
  const meaningful = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (meaningful.length === 0 || meaningful.every((line) => line === '(no descriptions)')) return null;
  return content;
}

export function validateTitle(value: string | null): string | null {
  if (!value) return null;
  const title = value.replace(/\s+/g, ' ').trim();
  if (!title || title.length > MAX_TITLE_LENGTH || title.includes('<') || title.includes('>')) return null;
  return title;
}

export function validateDescription(value: string | null): string | null {
  if (!value) return null;
  const description = value.trim();
  if (!description || description === '(no descriptions)' || description.length > MAX_DESCRIPTION_LENGTH) return null;
  return description;
}

function filenameTime(name: string): number | null {
  const raw = name.slice('titles-'.length, -'.txt'.length).trim();
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T|[-_])?(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const ms = Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  const minutes = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (minutes) {
    const ms = Date.parse(`${minutes[1]}-${minutes[2]}-${minutes[3]}T${minutes[4]}:${minutes[5]}:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  if (!/\d/.test(raw)) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: unknown): 'omit' | 'invalid' | string {
  if (value === undefined || value === null) return 'omit';
  if (typeof value !== 'string') return 'invalid';
  return value;
}

async function resolveMetadata(
  record: { title?: unknown; description?: unknown },
  videoId: string,
  storage: UploadStorage,
): Promise<{ ok: true; title: string; description: string } | { ok: false; error: 'title_unavailable' | 'description_unavailable' }> {
  const titleInput = optionalText(record.title);
  const descriptionInput = optionalText(record.description);
  if (titleInput === 'invalid') return { ok: false, error: 'title_unavailable' };
  if (descriptionInput === 'invalid') return { ok: false, error: 'description_unavailable' };

  let parsed: { title: string | null; description: string | null } | null = null;
  if (titleInput === 'omit' || descriptionInput === 'omit') {
    const text = await storage.readTitlesFile(videoId);
    if (text === 'missing') {
      return { ok: false, error: titleInput === 'omit' ? 'title_unavailable' : 'description_unavailable' };
    }
    parsed = parseTitlesDocument(text);
  }

  const title = titleInput === 'omit' ? parsed?.title ?? null : validateTitle(titleInput);
  if (!title) return { ok: false, error: 'title_unavailable' };
  const description = descriptionInput === 'omit' ? parsed?.description ?? null : validateDescription(descriptionInput);
  if (!description) return { ok: false, error: 'description_unavailable' };
  return { ok: true, title, description };
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
    if (raw.length > MAX_REQUEST_BYTES) return json({ error: 'invalid_video_id' }, 400);
    payload = JSON.parse(raw) as unknown;
  } catch {
    return json({ error: 'invalid_video_id' }, 400);
  }

  const record =
    payload && typeof payload === 'object' ? (payload as { videoId?: unknown; title?: unknown; description?: unknown }) : {};
  const videoId = validateVideoId(record.videoId);
  if (!videoId) return json({ error: 'invalid_video_id' }, 400);

  const storage = deps.storage ?? createSupabaseUploadStorage(deps.fetchImpl ?? fetch);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const putImpl = deps.putImpl ?? putHttps;

  let marker: 'absent' | 'invalid' | { youtubeVideoId: string };
  try {
    marker = await storage.readMarker(videoId);
  } catch (error) {
    return failStage(error, 'marker_read_failed');
  }
  if (marker === 'invalid') return json({ error: 'marker_invalid' }, 409);
  if (marker !== 'absent') {
    return json(
      { youtubeVideoId: marker.youtubeVideoId, privacyStatus: 'private', alreadyUploaded: true },
      200,
    );
  }

  let metadata: UploadMetadata;
  try {
    const resolved = await resolveMetadata(record, videoId, storage);
    if (!resolved.ok) return json({ error: resolved.error }, 422);
    metadata = resolved;
  } catch (error) {
    return failStage(error, 'title_unavailable');
  }

  let size: number | 'missing' | 'unknown';
  try {
    size = await storage.readMp4Size(videoId);
  } catch (error) {
    return failStage(error, 'size_read_failed');
  }
  if (size === 'missing') return json({ error: 'mp4_not_found' }, 404);
  if (typeof size !== 'number') {
    logStage('size_read', null, 'invalid_content_length');
    return json({ error: 'size_read_failed' }, 500);
  }

  let lock: 'created' | 'exists' | 'failed';
  try {
    lock = await storage.createLock(videoId);
  } catch (error) {
    return failStage(error, 'lock_create_failed');
  }
  if (lock === 'exists') return json({ error: 'upload_in_progress' }, 409);
  if (lock !== 'created') {
    logStage('lock_create', null, 'failed');
    return json({ error: 'lock_create_failed' }, 500);
  }

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

    const session = await startUploadSession(fetchImpl, refreshed.accessToken, size, metadata);
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
    } catch (error) {
      logStage(
        'marker_write',
        error instanceof UploadStageError ? error.status : null,
        error instanceof UploadStageError ? error.code : 'unknown',
      );
      return json(
        { error: 'marker_write_failed', youtubeVideoId: uploaded.youtubeVideoId, privacyStatus: 'private' },
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

export function createSupabaseUploadStorage(
  fetchImpl: typeof fetch = fetch,
  listMp4Size: ListMp4Size = defaultListMp4Size,
  downloadObject?: ObjectDownload,
): UploadStorage {
  return {
    async readMarker(videoId) {
      const downloaded = downloadObject
        ? await downloadObject(markerPath(videoId))
        : await getSupabaseAdmin().storage.from(BUCKET).download(markerPath(videoId));
      const { data, error } = downloaded;
      if (error) {
        if (await isNotFound(error)) return 'absent';
        throw new UploadStageError('marker_read_failed', storageStatus(error) || null, storageErrorCode(error));
      }
      if (!data) {
        throw new UploadStageError('marker_read_failed', null, 'unknown');
      }
      const text = (await data.text()).trim();
      if (!YOUTUBE_ID_PATTERN.test(text)) return 'invalid';
      return { youtubeVideoId: text };
    },
    async readMp4Size(videoId) {
      const head = await readMp4SizeFromHead(fetchImpl, videoId);
      if (head.ok) return head.size;
      const listed = await listMp4Size(videoId).catch((error: unknown) => {
        logStage('size_list', null, storageErrorCode(error));
        return 'unknown' as const;
      });
      if (typeof listed === 'number') return listed;
      if (head.status === 404 && listed === 'missing') return 'missing';
      throw new UploadStageError('size_read_failed', head.status, head.code);
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
        contentType: 'text/plain',
        cacheControl: '0',
      });
      if (!error) return 'created';
      if (isAlreadyExists(error)) return 'exists';
      throw new UploadStageError('lock_create_failed', storageStatus(error) || null, storageErrorCode(error));
    },
    async deleteLock(videoId) {
      const supabase = getSupabaseAdmin();
      await supabase.storage.from(BUCKET).remove([lockPath(videoId)]);
    },
    async saveMarker(videoId, youtubeVideoId) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.storage.from(BUCKET).upload(markerPath(videoId), youtubeVideoId, {
        upsert: false,
        contentType: 'text/plain',
        cacheControl: '0',
      });
      if (!error) return;
      if (!isAlreadyExists(error)) {
        throw new UploadStageError('marker_write_failed', storageStatus(error) || null, storageErrorCode(error));
      }
      const existing = await this.readMarker(videoId);
      if (existing !== 'absent' && existing !== 'invalid' && existing.youtubeVideoId === youtubeVideoId) return;
      throw new UploadStageError('marker_write_failed', storageStatus(error) || null, storageErrorCode(error));
    },
    async readTitlesFile(videoId) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage.from(BUCKET).list(videoId, {
        limit: 100,
        search: 'titles-',
      });
      if (error) {
        throw new UploadStageError('title_unavailable', storageStatus(error) || null, storageErrorCode(error));
      }
      const name = chooseTitlesFile(
        (data ?? []).map((item) => ({
          name: item.name,
          updatedAt: item.updated_at ?? item.created_at ?? null,
        })),
      );
      if (!name) return 'missing';
      const downloaded = await supabase.storage.from(BUCKET).download(`${videoId}/${name}`);
      if (downloaded.error) {
        if (await isNotFound(downloaded.error)) return 'missing';
        throw new UploadStageError(
          'title_unavailable',
          storageStatus(downloaded.error) || null,
          storageErrorCode(downloaded.error),
        );
      }
      if (!downloaded.data) return 'missing';
      return (await downloaded.data.text()).slice(0, MAX_REQUEST_BYTES);
    },
  };
}

async function startUploadSession(
  fetchImpl: typeof fetch,
  accessToken: string,
  size: number,
  metadata: UploadMetadata,
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
          title: metadata.title,
          description: metadata.description,
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
    return json({ error: 'marker_write_failed', youtubeVideoId, privacyStatus: 'private' }, 500);
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

class UploadStageError extends Error {
  readonly stage: string;
  readonly status: number | null;
  readonly code: string;

  constructor(stage: string, status: number | null, code: string) {
    super(safeToken(stage));
    this.stage = safeToken(stage);
    this.status = status;
    this.code = safeToken(code);
  }
}

function failStage(error: unknown, fallback: string): Response {
  if (error instanceof UploadStageError) {
    logStage(error.stage, error.status, error.code);
    return json({ error: error.stage }, 500);
  }
  logStage(fallback, null, 'unknown');
  return json({ error: safeToken(fallback) }, 500);
}

function logStage(stage: string, status: number | null, code: string): void {
  const safeStatus = status === null ? 'none' : String(status);
  if (!/^\d{3}$/.test(safeStatus) && safeStatus !== 'none') return;
  console.error(`youtube_upload stage=${safeToken(stage)} status=${safeStatus} code=${safeToken(code)}`);
}

function safeToken(value: string): string {
  return /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : 'unknown';
}

async function readMp4SizeFromHead(
  fetchImpl: typeof fetch,
  videoId: string,
): Promise<{ ok: true; size: number } | { ok: false; status: number | null; code: string }> {
  const url = publicMp4Url(videoId);
  if (!url) return { ok: false, status: null, code: 'head_failed' };
  try {
    const response = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
    await response.body?.cancel();
    if (response.status !== 200) {
      return { ok: false, status: response.status, code: response.status === 404 ? 'not_found' : 'head_failed' };
    }
    const size = readByteSize(response.headers.get('content-length'));
    if (size === null) return { ok: false, status: response.status, code: 'invalid_content_length' };
    return { ok: true, size };
  } catch {
    return { ok: false, status: null, code: 'head_failed' };
  }
}

function publicMp4Url(videoId: string): string | null {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!base || !validateVideoId(videoId)) return null;
  return `${base}/storage/v1/object/public/projects/${videoId}/${videoId}.mp4`;
}

async function defaultListMp4Size(videoId: string): Promise<number | 'missing' | 'unknown'> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).list(videoId, {
    limit: 100,
    search: `${videoId}.mp4`,
  });
  if (error) {
    logStage('size_list', storageStatus(error) || null, storageErrorCode(error));
    return 'unknown';
  }
  const file = (data ?? []).find((item) => item.name === `${videoId}.mp4`);
  if (!file) return 'missing';
  const size = readByteSize(file.metadata?.size);
  return size === null ? 'unknown' : size;
}

function storageErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  const record = error as { code?: unknown; error?: unknown };
  for (const value of [record.code, record.error]) {
    if (typeof value === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(value)) return value;
  }
  return 'unknown';
}

const OBJECT_NOT_FOUND_MESSAGE = 'Object not found';
const OBJECT_NOT_FOUND_CODE = 'NoSuchKey';
const MAX_STORAGE_ERROR_BODY = 2048;

type ObjectDownload = (path: string) => Promise<{ data: { text: () => Promise<string> } | null; error: unknown }>;

function isNotFound(error: unknown): Promise<boolean> {
  return classifyMissingObject(error);
}

async function classifyMissingObject(error: unknown): Promise<boolean> {
  if (explicitObjectNotFound(error)) return true;
  const status = storageStatus(error);
  if (status === 404) return true;
  if (status !== 400) return false;
  const body = await storageErrorBody(error);
  return explicitObjectNotFound(body);
}

function explicitObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { message?: unknown; code?: unknown };
  return record.message === OBJECT_NOT_FOUND_MESSAGE || record.code === OBJECT_NOT_FOUND_CODE;
}

async function storageErrorBody(error: unknown): Promise<unknown> {
  if (!error || typeof error !== 'object' || !('originalError' in error)) return null;
  const original = (error as { originalError?: unknown }).originalError;
  if (!original || typeof original !== 'object' || !('text' in original)) return null;
  const read = (original as { text?: unknown }).text;
  if (typeof read !== 'function') return null;
  try {
    const raw = await read.call(original);
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_STORAGE_ERROR_BODY) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isAlreadyExists(error: unknown): boolean {
  if (storageStatus(error) === 409 || storageStatusCode(error) === 409) return true;
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return message.toLowerCase().includes('already exists') || message.toLowerCase().includes('duplicate');
}

function storageStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  const record = error as { status?: unknown; originalError?: unknown };
  const direct = httpStatus(record.status);
  if (direct !== 0) return direct;
  if (!record.originalError || typeof record.originalError !== 'object') return 0;
  return httpStatus((record.originalError as { status?: unknown }).status);
}

function storageStatusCode(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  return httpStatus((error as { statusCode?: unknown }).statusCode);
}

function httpStatus(value: unknown): number {
  const status =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{3}$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(status) || status < 100 || status > 599) return 0;
  return status;
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
