import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import puppeteer from 'puppeteer';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { chooseTitlesFile } from '@/lib/youtube/upload';

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const COMPANY_MAX_FONT_PX = 150;
export const SUBTITLE_MAX_FONT_PX = 80;
export const HEADLINE_MAX_FONT_PX = 150;
export const TEXT_STROKE_PX = 8;

const BUCKET = 'projects';
const BACKGROUND_ROOT = '99_Images/02_thumbnail-backgrounds';
const COMPANY_LIMIT = 10;
const SUBTITLE_LIMIT = 15;
const HEADLINE_LIMIT = 10;
const BAND_TEXT = '投資に役立つニュース解説';

export const THUMBNAIL_CATEGORIES = ['ai', 'semiconductor', 'it', 'automotive', 'finance', 'business'] as const;
export type ThumbnailCategory = (typeof THUMBNAIL_CATEGORIES)[number];
export type ThumbnailField = 'COMPANY' | 'SUBTITLE' | 'HEADLINE';

export type ThumbnailFields = {
  company: string;
  subtitle: string;
  headline: string;
  category: string;
  limitExceeded: ThumbnailField[];
};

export type BackgroundImage = {
  bytes: Uint8Array;
  contentType: string;
};

export type ThumbnailFontSizes = {
  company: number;
  subtitle: number;
  headline: number;
};

export type ThumbnailSuccess = {
  ok: true;
  videoId: string;
  path: string;
  company: string;
  subtitle: string;
  headline: string;
  category: string;
  backgroundCategory: string;
  backgroundName: string | null;
  limitExceeded: ThumbnailField[];
  fontSizes: ThumbnailFontSizes;
  width: number;
  height: number;
};

export type ThumbnailFailure = {
  ok: false;
  error: 'titles_missing' | 'thumbnail_fields_missing' | 'render_failed' | 'save_failed';
};

export type ThumbnailDeps = {
  readTitlesText?: (videoId: string) => Promise<string | 'missing'>;
  listBackgrounds?: (category: string) => Promise<string[]>;
  readBackground?: (category: string, name: string) => Promise<BackgroundImage | null>;
  render?: (html: string) => Promise<Pick<ThumbnailRender, 'png' | 'fontSizes'>>;
  savePng?: (videoId: string, png: Uint8Array) => Promise<void>;
};

export function parseThumbnailSection(text: string): ThumbnailFields | null {
  const lines = sectionLines(text, 'THUMBNAIL');
  const values = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(/^(COMPANY|SUBTITLE|HEADLINE|CATEGORY)\s*:\s*(.*)$/);
    if (!match) continue;
    values.set(match[1], match[2].trim());
  }
  const company = values.get('COMPANY') ?? '';
  const subtitle = values.get('SUBTITLE') ?? '';
  const headline = values.get('HEADLINE') ?? '';
  const category = (values.get('CATEGORY') ?? '').trim().toLowerCase();
  if (!company || !subtitle || !headline || !category) return null;
  const limitExceeded: ThumbnailField[] = [];
  if ([...company].length > COMPANY_LIMIT) limitExceeded.push('COMPANY');
  if ([...subtitle].length > SUBTITLE_LIMIT) limitExceeded.push('SUBTITLE');
  if ([...headline].length > HEADLINE_LIMIT) limitExceeded.push('HEADLINE');
  return { company, subtitle, headline, category, limitExceeded };
}

export function selectBackgroundName(videoId: string, names: string[]): string | null {
  const images = names.filter(isBackgroundImage).sort((left, right) => left.localeCompare(right));
  if (images.length === 0) return null;
  return images[hashVideoId(videoId) % images.length] ?? null;
}

export function isKnownCategory(category: string): category is ThumbnailCategory {
  return (THUMBNAIL_CATEGORIES as readonly string[]).includes(category);
}

export function buildThumbnailHtml(input: {
  company: string;
  subtitle: string;
  headline: string;
  backgroundDataUrl: string | null;
}): string {
  const background = input.backgroundDataUrl
    ? `background-image:url('${input.backgroundDataUrl}');`
    : 'background-image:linear-gradient(145deg,#071433 0%,#0d4ea8 52%,#06101f 100%);';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${THUMBNAIL_WIDTH}px; height: ${THUMBNAIL_HEIGHT}px; overflow: hidden; }
  .frame {
    position: relative;
    box-sizing: border-box;
    width: ${THUMBNAIL_WIDTH}px;
    height: ${THUMBNAIL_HEIGHT}px;
    border: 22px solid #0b5fff;
    overflow: hidden;
    background: #06101f;
  }
  .photo, .shade { position: absolute; inset: 0; }
  .photo { ${background} background-size: cover; background-position: center; }
  .shade { background: rgba(0, 12, 32, 0.46); }
  .company-slot, .stack, .band { position: absolute; z-index: 1; }
  .company-slot { top: 16px; left: 48px; right: 48px; height: 168px; }
  .stack {
    left: 56px;
    right: 56px;
    bottom: 104px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
  }
  .band {
    left: 0; right: 0; bottom: 0; height: 92px;
    display: flex; align-items: center; justify-content: center;
    background: #0b5fff; color: #fff;
    font-size: 40px; font-weight: 900; letter-spacing: 0.04em;
  }
  .fit {
    display: block;
    line-height: 1;
  }
  .company-slot .fit { width: 100%; text-align: left; }
  .stack .fit { width: 100%; text-align: center; }
  .line {
    display: inline-block;
    white-space: nowrap;
    font-weight: 900;
    color: #fff;
    line-height: 1;
    -webkit-text-stroke: ${TEXT_STROKE_PX}px #0b5fff;
    paint-order: stroke fill;
    font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif;
  }
  #company { font-size: ${COMPANY_MAX_FONT_PX}px; }
  #subtitle { font-size: ${SUBTITLE_MAX_FONT_PX}px; }
  #headline { font-size: ${HEADLINE_MAX_FONT_PX}px; }
</style>
</head>
<body>
  <div class="frame">
    <div class="photo"></div>
    <div class="shade"></div>
    <div class="company-slot"><div class="fit" id="company-box"><span class="line" id="company">${escapeHtml(input.company)}</span></div></div>
    <div class="stack">
      <div class="fit" id="subtitle-box"><span class="line" id="subtitle">${escapeHtml(input.subtitle)}</span></div>
      <div class="fit" id="headline-box"><span class="line" id="headline">${escapeHtml(input.headline)}</span></div>
    </div>
    <div class="band">${BAND_TEXT}</div>
  </div>
  <script>
    function fitLine(textId, boxId, maxPx, strokePx) {
      const text = document.getElementById(textId);
      const box = document.getElementById(boxId);
      let low = 1;
      let high = maxPx;
      let best = 1;
      while (low <= high) {
        const size = Math.floor((low + high) / 2);
        text.style.fontSize = size + 'px';
        const width = text.getBoundingClientRect().width + strokePx + 4;
        if (width <= box.clientWidth) {
          best = size;
          low = size + 1;
        } else {
          high = size - 1;
        }
      }
      text.style.fontSize = best + 'px';
      text.dataset.fontSize = String(best);
      return best;
    }
    window.fitThumbnail = function () {
      return {
        company: fitLine('company', 'company-box', ${COMPANY_MAX_FONT_PX}, ${TEXT_STROKE_PX}),
        subtitle: fitLine('subtitle', 'subtitle-box', ${SUBTITLE_MAX_FONT_PX}, ${TEXT_STROKE_PX}),
        headline: fitLine('headline', 'headline-box', ${HEADLINE_MAX_FONT_PX}, ${TEXT_STROKE_PX}),
      };
    };
    window.measureThumbnail = function () {
      const fontSizes = window.fitThumbnail();
      const ids = ['company', 'subtitle', 'headline'];
      const singleLine = { company: true, subtitle: true, headline: true };
      const fits = { company: true, subtitle: true, headline: true };
      ids.forEach(function (id) {
        const text = document.getElementById(id);
        const box = document.getElementById(id + '-box');
        if (!text || !box) return;
        const style = getComputedStyle(text);
        singleLine[id] = style.whiteSpace === 'nowrap' && text.textContent.indexOf('\\n') < 0;
        fits[id] = text.getBoundingClientRect().width + 12 <= box.clientWidth + 0.5;
      });
      const bounds = function (id) { return document.getElementById(id).getBoundingClientRect(); };
      const companyBox = bounds('company');
      const subtitleBox = bounds('subtitle');
      const headlineBox = bounds('headline');
      const band = document.querySelector('.band').getBoundingClientRect();
      const frame = document.querySelector('.frame').getBoundingClientRect();
      const clear = companyBox.bottom + 6 <= subtitleBox.top &&
        subtitleBox.bottom + 6 <= headlineBox.top &&
        headlineBox.bottom + 4 <= band.top &&
        companyBox.top - 4 >= frame.top + 22 &&
        companyBox.left - 4 >= frame.left + 22 &&
        Math.max(companyBox.right, subtitleBox.right, headlineBox.right) + 4 <= frame.right - 22 &&
        Math.min(subtitleBox.left, headlineBox.left) - 4 >= frame.left + 22;
      const headline = document.getElementById('headline');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = getComputedStyle(headline).font;
      return {
        fontSizes: fontSizes,
        singleLine: singleLine,
        fits: fits,
        clear: clear,
        fontFamily: getComputedStyle(headline).fontFamily,
        glyphWidth: context.measureText('純').width,
      };
    };
  </script>
</body>
</html>`;
}

export type ThumbnailRender = {
  png: Uint8Array;
  fontSizes: ThumbnailFontSizes;
  singleLine: Record<'company' | 'subtitle' | 'headline', boolean>;
  fits: Record<'company' | 'subtitle' | 'headline', boolean>;
  clear: boolean;
  fontFamily: string;
  glyphWidth: number;
};

export async function renderThumbnailPng(html: string): Promise<ThumbnailRender> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'autobriefs-thumbnail-'));
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--no-zygote',
    `--user-data-dir=${userDataDir}`,
  ];
  const browser = await puppeteer.launch({ headless: true, args }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('Could not find Chrome')) throw error;
    return puppeteer.launch({ headless: true, channel: 'chrome', args });
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate(() => {
      return (window as unknown as { measureThumbnail: () => ThumbnailRender }).measureThumbnail();
    });
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT },
    });
    return { ...measured, png };
  } finally {
    await browser.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

export function readPngSize(png: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 24) return null;
  for (let index = 0; index < signature.length; index += 1) {
    if (png[index] !== signature[index]) return null;
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function ensureYoutubeThumbnailPng(
  videoId: string,
  deps: {
    readStoredPng?: (videoId: string) => Promise<Uint8Array | 'missing' | 'unknown'>;
    generate?: (videoId: string) => Promise<ThumbnailSuccess | ThumbnailFailure>;
  } = {},
): Promise<
  | { ok: true; bytes: Uint8Array; limitExceeded: ThumbnailField[] }
  | { ok: false; error: ThumbnailFailure['error'] | 'thumbnail_read_failed' }
> {
  const readStoredPng = deps.readStoredPng ?? readStoredThumbnailPng;
  const generate = deps.generate ?? ((id: string) => generateYoutubeThumbnail(id));
  let stored: Uint8Array | 'missing' | 'unknown';
  try {
    stored = await readStoredPng(videoId);
  } catch {
    return { ok: false, error: 'thumbnail_read_failed' };
  }
  if (stored === 'unknown') return { ok: false, error: 'thumbnail_read_failed' };
  if (stored !== 'missing' && isValidThumbnailPng(stored)) {
    return { ok: true, bytes: stored, limitExceeded: [] };
  }

  let generated: ThumbnailSuccess | ThumbnailFailure;
  try {
    generated = await generate(videoId);
  } catch {
    return { ok: false, error: 'render_failed' };
  }
  if (!generated.ok) return generated;

  let saved: Uint8Array | 'missing' | 'unknown';
  try {
    saved = await readStoredPng(videoId);
  } catch {
    return { ok: false, error: 'thumbnail_read_failed' };
  }
  if (saved === 'missing' || saved === 'unknown' || !isValidThumbnailPng(saved)) {
    return { ok: false, error: 'thumbnail_read_failed' };
  }
  return { ok: true, bytes: saved, limitExceeded: generated.limitExceeded };
}

export async function generateYoutubeThumbnail(videoId: string, deps: ThumbnailDeps = {}): Promise<ThumbnailSuccess | ThumbnailFailure> {
  const readTitlesText = deps.readTitlesText ?? readTitlesTextFromStorage;
  const listBackgrounds = deps.listBackgrounds ?? listBackgroundsFromStorage;
  const readBackground = deps.readBackground ?? readBackgroundFromStorage;
  const render = deps.render ?? renderThumbnailPng;
  const savePng = deps.savePng ?? saveThumbnailPng;

  const titles = await readTitlesText(videoId);
  if (titles === 'missing') return { ok: false, error: 'titles_missing' };
  const fields = parseThumbnailSection(titles);
  if (!fields) return { ok: false, error: 'thumbnail_fields_missing' };

  const chosen = await chooseBackground(videoId, fields.category, listBackgrounds);
  const image = chosen ? await readBackground(chosen.category, chosen.name) : null;
  const html = buildThumbnailHtml({
    company: fields.company,
    subtitle: fields.subtitle,
    headline: fields.headline,
    backgroundDataUrl: image ? toDataUrl(image) : null,
  });

  let rendered: Pick<ThumbnailRender, 'png' | 'fontSizes'>;
  try {
    rendered = await render(html);
  } catch {
    return { ok: false, error: 'render_failed' };
  }
  const size = readPngSize(rendered.png);
  if (!size || size.width !== THUMBNAIL_WIDTH || size.height !== THUMBNAIL_HEIGHT) {
    return { ok: false, error: 'render_failed' };
  }
  try {
    await savePng(videoId, rendered.png);
  } catch {
    return { ok: false, error: 'save_failed' };
  }
  return {
    ok: true,
    videoId,
    path: `${videoId}/youtube-thumbnail.png`,
    company: fields.company,
    subtitle: fields.subtitle,
    headline: fields.headline,
    category: fields.category,
    backgroundCategory: chosen && image ? chosen.category : 'gradient',
    backgroundName: chosen && image ? chosen.name : null,
    limitExceeded: fields.limitExceeded,
    fontSizes: rendered.fontSizes,
    width: size.width,
    height: size.height,
  };
}

async function chooseBackground(
  videoId: string,
  category: string,
  listBackgrounds: (category: string) => Promise<string[]>,
): Promise<{ category: string; name: string } | null> {
  const requested = isKnownCategory(category) ? category : 'business';
  const primary = selectBackgroundName(videoId, await listBackgrounds(requested));
  if (primary) return { category: requested, name: primary };
  if (requested !== 'business') {
    const fallback = selectBackgroundName(videoId, await listBackgrounds('business'));
    if (fallback) return { category: 'business', name: fallback };
  }
  return null;
}

function isValidThumbnailPng(png: Uint8Array): boolean {
  const size = readPngSize(png);
  return size?.width === THUMBNAIL_WIDTH && size.height === THUMBNAIL_HEIGHT;
}

async function readStoredThumbnailPng(videoId: string): Promise<Uint8Array | 'missing' | 'unknown'> {
  const supabase = getSupabaseAdmin();
  const listed = await supabase.storage.from(BUCKET).list(videoId, { limit: 100, search: 'youtube-thumbnail.png' });
  if (listed.error) return 'unknown';
  const found = (listed.data ?? []).some((item) => item.name === 'youtube-thumbnail.png');
  if (!found) return 'missing';
  const downloaded = await supabase.storage.from(BUCKET).download(`${videoId}/youtube-thumbnail.png`);
  if (downloaded.error || !downloaded.data) return 'unknown';
  return new Uint8Array(await downloaded.data.arrayBuffer());
}

async function readTitlesTextFromStorage(videoId: string): Promise<string | 'missing'> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).list(videoId, { limit: 100, search: 'titles-' });
  if (error || !data) return 'missing';
  const name = chooseTitlesFile(data.map((item) => ({ name: item.name, updatedAt: item.updated_at ?? item.created_at ?? null })));
  if (!name) return 'missing';
  const downloaded = await supabase.storage.from(BUCKET).download(`${videoId}/${name}`);
  if (downloaded.error || !downloaded.data) return 'missing';
  return downloaded.data.text();
}

async function listBackgroundsFromStorage(category: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const names: string[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${BACKGROUND_ROOT}/${category}`, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !data) break;
    names.push(...data.map((item) => item.name).filter(isBackgroundImage));
    if (data.length < 100) break;
  }
  return names;
}

async function readBackgroundFromStorage(category: string, name: string): Promise<BackgroundImage | null> {
  if (!isBackgroundImage(name) || name.includes('/') || name.includes('..')) return null;
  const supabase = getSupabaseAdmin();
  const downloaded = await supabase.storage.from(BUCKET).download(`${BACKGROUND_ROOT}/${category}/${name}`);
  if (downloaded.error || !downloaded.data) return null;
  return {
    bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
    contentType: contentTypeFor(name),
  };
}

async function saveThumbnailPng(videoId: string, png: Uint8Array): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).upload(`${videoId}/youtube-thumbnail.png`, Buffer.from(png), {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error('save_failed');
}

function sectionLines(text: string, name: string): string[] {
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

function hashVideoId(videoId: string): number {
  let hash = 2166136261;
  for (const char of videoId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isBackgroundImage(name: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(name);
}

function contentTypeFor(name: string): string {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return 'image/jpeg';
}

function toDataUrl(image: BackgroundImage): string {
  const bytes = Buffer.from(image.bytes).toString('base64');
  return `data:${image.contentType};base64,${bytes}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
