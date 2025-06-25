import puppeteer from 'puppeteer';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { html, videoId, segmentId } = req.body as {
      html?: string;
      videoId?: string;
      segmentId?: string;
    };

    if (!html || typeof html !== 'string') {
      console.error('Invalid or missing HTML:', html);
      return res.status(400).json({ error: 'Missing or invalid HTML content' });
    }

    if (!videoId || !segmentId) {
      console.error('Missing videoId or segmentId');
      return res.status(400).json({ error: 'Missing videoId or segmentId' });
    }

    // ✅ 即レスポンス返す
    res.status(202).json({
      message: 'Rendering started',
      videoId,
      segmentId,
    });

    // 🧵 非同期処理スタート
    setImmediate(async () => {
      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // ✅ ここを修正：omitBackground: true を追加して背景透過に対応
        const imageBuffer = await page.screenshot({
          type: 'png',
          omitBackground: true,
        });

        await browser.close();

        const filePath = `${videoId}/${segmentId}/slide.png`;

        const { error: uploadError } = await supabase.storage
          .from('projects')
          .upload(filePath, imageBuffer, {
            contentType: 'image/png',
            upsert: true,
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error('❌ Upload failed:', uploadError.message);
        } else {
          console.log('✅ Upload succeeded:', filePath);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ Rendering failed:', message);
      }
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ API entry error:', message);
    return res.status(500).json({ error: 'Internal Server Error', details: message });
  }
}