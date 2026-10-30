import { writeFile } from 'node:fs/promises';

import {
  COMPANY_MAX_FONT_PX,
  HEADLINE_MAX_FONT_PX,
  SUBTITLE_MAX_FONT_PX,
  THUMBNAIL_CATEGORIES,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  buildThumbnailHtml,
  ensureYoutubeThumbnailPng,
  generateYoutubeThumbnail,
  parseThumbnailSection,
  readPngSize,
  renderThumbnailPng,
  selectBackgroundName,
} from '../src/lib/youtube/thumbnail';

const SAMPLE = `=== TITLES ===
タイトルA
=== DESCRIPTIONS ===
本文
=== THUMBNAIL ===
COMPANY: JT
SUBTITLE: 業績予想を上方修正
HEADLINE: 純利益30％増
CATEGORY: business
`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fakePng(width: number, height: number): Uint8Array {
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(png.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return png;
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`ng ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

async function main() {
  await test('THUMBNAILの4項目を読む', () => {
    const fields = parseThumbnailSection(SAMPLE);
    assert(fields?.company === 'JT', 'company');
    assert(fields?.subtitle === '業績予想を上方修正', 'subtitle');
    assert(fields?.headline === '純利益30％増', 'headline');
    assert(fields?.category === 'business', 'category');
    assert(fields?.limitExceeded.length === 0, 'limits');
  });

  await test('文字数超過を検出し値は残す', () => {
    const fields = parseThumbnailSection(`=== THUMBNAIL ===
COMPANY: あいうえおかきくけこさ
SUBTITLE: あいうえおかきくけこさしすせそた
HEADLINE: あいうえおかきくけこさ
CATEGORY: ai
`);
    assert(fields?.limitExceeded.join(',') === 'COMPANY,SUBTITLE,HEADLINE', 'flags');
    assert(fields?.company === 'あいうえおかきくけこさ', 'kept');
  });

  await test('同じvideoIdは同じ背景を選ぶ', () => {
    const names = ['b.jpg', 'a.png', 'note.txt', 'c.webp'];
    const first = selectBackgroundName('202605291007', names);
    const second = selectBackgroundName('202605291007', names);
    assert(first === second && first !== null, 'stable');
    assert(first !== 'note.txt', 'image only');
  });

  await test('6カテゴリと空フォルダのフォールバック', async () => {
    const seen: string[] = [];
    const result = await generateYoutubeThumbnail('vid-1', {
      readTitlesText: async () => SAMPLE.replace('CATEGORY: business', 'CATEGORY: semiconductor'),
      listBackgrounds: async (category) => {
        seen.push(category);
        if (category === 'semiconductor') return [];
        if (category === 'business') return ['one.jpg'];
        return [`${category}.png`];
      },
      readBackground: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' }),
      render: async (html) => {
        assert(html.includes('data:image/jpeg;base64,'), 'embedded');
        return { png: fakePng(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), fontSizes: { company: 100, subtitle: 64, headline: 100 } };
      },
      savePng: async () => undefined,
    });
    assert(result.ok && result.backgroundCategory === 'business' && result.backgroundName === 'one.jpg', 'fallback');
    assert(seen[0] === 'semiconductor' && seen[1] === 'business', 'order');

    for (const category of THUMBNAIL_CATEGORIES) {
      const chosen = await generateYoutubeThumbnail(`vid-${category}`, {
        readTitlesText: async () => SAMPLE.replace('CATEGORY: business', `CATEGORY: ${category}`),
        listBackgrounds: async (folder) => (folder === category ? ['later.png', 'early.jpg'] : []),
        readBackground: async (_folder, name) => ({ bytes: new Uint8Array([4]), contentType: 'image/png' }),
        render: async () => ({ png: fakePng(1280, 720), fontSizes: { company: 100, subtitle: 64, headline: 100 } }),
        savePng: async () => undefined,
      });
      assert(chosen.ok && chosen.backgroundCategory === category, category);
      assert(chosen.ok && chosen.backgroundName === selectBackgroundName(`vid-${category}`, ['later.png', 'early.jpg']), category);
    }
  });

  await test('背景が無くてもPNGを保存する', async () => {
    let html = '';
    const result = await generateYoutubeThumbnail('vid-2', {
      readTitlesText: async () => SAMPLE,
      listBackgrounds: async () => [],
      render: async (documentHtml) => {
        html = documentHtml;
        return { png: fakePng(1280, 720), fontSizes: { company: 90, subtitle: 40, headline: 100 } };
      },
      savePng: async () => undefined,
    });
    assert(result.ok && result.backgroundName === null && result.path === 'vid-2/youtube-thumbnail.png', 'path');
    assert(html.includes('linear-gradient') && html.includes('Noto Sans CJK JP'), 'css');
    assert(html.includes('投資に役立つニュース解説'), 'band');
  });

  await test('有効な保存済みPNGを再利用し生成失敗時は送らない', async () => {
    const stored = fakePng(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    let generated = 0;
    const reused = await ensureYoutubeThumbnailPng('vid-reuse', {
      readStoredPng: async () => stored,
      generate: async () => {
        generated += 1;
        return { ok: false, error: 'render_failed' };
      },
    });
    assert(reused.ok && reused.bytes === stored, 'reused');
    assert(generated === 0, 'no generate');

    const invalid = await ensureYoutubeThumbnailPng('vid-invalid', {
      readStoredPng: async () => {
        generated += 1;
        return generated === 1 ? fakePng(10, 10) : fakePng(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      },
      generate: async () => ({
        ok: true,
        videoId: 'vid-invalid',
        path: 'vid-invalid/youtube-thumbnail.png',
        company: 'JT',
        subtitle: '補足',
        headline: '見出し',
        category: 'business',
        backgroundCategory: 'gradient',
        backgroundName: null,
        limitExceeded: ['COMPANY'],
        fontSizes: { company: 100, subtitle: 40, headline: 100 },
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
      }),
    });
    assert(invalid.ok && invalid.limitExceeded.join(',') === 'COMPANY', 'limit continues');

    const failed = await ensureYoutubeThumbnailPng('vid-missing', {
      readStoredPng: async () => 'missing',
      generate: async () => ({ ok: false, error: 'thumbnail_fields_missing' }),
    });
    assert(!failed.ok && failed.error === 'thumbnail_fields_missing', 'no send');
  });

  await test('短い見出しは最大サイズを超えず長い文字は縮小する', async () => {
    const shortHtml = buildThumbnailHtml({
      company: 'JT',
      subtitle: '上方修正',
      headline: '最高益更新',
      backgroundDataUrl: null,
    });
    const longHtml = buildThumbnailHtml({
      company: 'あいうえおかきくけこさしすせそたちつてとなにぬねの',
      subtitle: '業績予想を上方修正して設備投資を拡大する方針',
      headline: '純利益が大きく増えて市場予想を上回る',
      backgroundDataUrl: null,
    });
    const short = await renderThumbnailPng(shortHtml);
    const long = await renderThumbnailPng(longHtml);
    assert(short.fontSizes.headline === HEADLINE_MAX_FONT_PX, `headline ${short.fontSizes.headline}`);
    assert(short.fontSizes.company === COMPANY_MAX_FONT_PX, `company ${short.fontSizes.company}`);
    assert(short.fontSizes.subtitle === SUBTITLE_MAX_FONT_PX, `subtitle ${short.fontSizes.subtitle}`);
    assert(long.fontSizes.company < COMPANY_MAX_FONT_PX, `long company ${long.fontSizes.company}`);
    assert(long.fontSizes.subtitle < SUBTITLE_MAX_FONT_PX, `long subtitle ${long.fontSizes.subtitle}`);
    assert(long.fontSizes.headline < HEADLINE_MAX_FONT_PX, `long headline ${long.fontSizes.headline}`);
    assert(short.singleLine.company && short.singleLine.subtitle && short.singleLine.headline, 'short lines');
    assert(long.singleLine.company && long.singleLine.subtitle && long.singleLine.headline, 'long lines');
    assert(long.fits.company && long.fits.subtitle && long.fits.headline, 'fits');
    assert(short.clear && long.clear, 'clear');
    const size = readPngSize(short.png);
    assert(size?.width === THUMBNAIL_WIDTH && size.height === THUMBNAIL_HEIGHT, 'png size');
    assert(shortHtml.includes('font-family: "Noto Sans CJK JP"'), 'noto');
    assert(short.glyphWidth > 20, `glyph ${short.glyphWidth} ${short.fontFamily}`);
    await writeFile('/tmp/autobriefs-thumbnail-sample.png', short.png);
    await writeFile('/tmp/autobriefs-thumbnail-long.png', long.png);
  });
}

main();
