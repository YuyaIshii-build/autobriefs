// pages/api/render-topic-slide.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import { getRenderBrowserPool, TOPIC_PAGE_TIMEOUT_MS } from '@/lib/slides/render-browser';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { html, videoId, topicId } = req.body as {
      html?: string;
      videoId?: string;
      topicId?: string;
    };

    // --- validation ---
    if (!html || typeof html !== 'string') {
      console.error('Invalid or missing HTML:', html);
      return res.status(400).json({ error: 'Missing or invalid HTML content' });
    }

    if (!videoId || !topicId) {
      console.error('Missing videoId or topicId');
      return res.status(400).json({ error: 'Missing videoId or topicId' });
    }

    // ✅ 即レスポンス
    res.status(202).json({
      message: 'Topic slide rendering started',
      videoId,
      topicId,
    });

    // --- 非同期レンダリング ---
    setImmediate(async () => {
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`🔁 Topic slide rendering attempt ${attempt}`);
          await renderTopicSlide(html, videoId, topicId);
          console.log('✅ Topic slide rendering succeeded');
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            `❌ Topic slide rendering failed (attempt ${attempt}):`,
            message
          );

          if (attempt === maxAttempts) {
            console.error('🛑 Giving up after 3 attempts');
          } else {
            console.log('⏳ Retrying in 5s...');
            await new Promise((res) => setTimeout(res, 5000));
          }
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ API entry error:', message);
    return res
      .status(500)
      .json({ error: 'Internal Server Error', details: message });
  }
}

async function renderTopicSlide(html: string, videoId: string, topicId: string) {
  const imageBuffer = await getRenderBrowserPool().withPage(async (page) => {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return page.screenshot({ type: 'png', omitBackground: true });
  }, TOPIC_PAGE_TIMEOUT_MS);

  const filePath = `${videoId}/topic/${topicId}.png`;
  const { error: uploadError } = await supabase.storage.from('projects').upload(filePath, imageBuffer, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '3600',
  });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log('✅ Topic slide upload succeeded:', filePath);
}