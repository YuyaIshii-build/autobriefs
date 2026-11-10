// pages/api/render-slide.ts

import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

import { getRenderBrowserPool } from '@/lib/slides/render-browser';
import {
  formatSlideRenderStatus,
  getSegmentRenderQueue,
  runSegmentRenderAttempts,
  slideRenderStatusPath,
} from '@/lib/slides/segment-render-queue';

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
      console.error('Invalid or missing HTML');
      return res.status(400).json({ error: 'Missing or invalid HTML content' });
    }

    if (!videoId || !segmentId) {
      console.error('Missing videoId or segmentId');
      return res.status(400).json({ error: 'Missing videoId or segmentId' });
    }

    await writeRenderStatus(videoId, segmentId, 'queued');

    res.status(202).json({
      message: 'Rendering started',
      videoId,
      segmentId,
    });

    getSegmentRenderQueue().enqueue(async () => {
      await writeRenderStatus(videoId, segmentId, 'rendering');
      const result = await runSegmentRenderAttempts(async (attempt) => {
        try {
          console.log(`🔁 Segment slide rendering attempt ${attempt}`);
          await renderSlide(html, videoId, segmentId);
          console.log('✅ Segment slide rendering succeeded');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`❌ Segment slide rendering failed (attempt ${attempt}):`, message);
          if (attempt < 3) console.log('⏳ Retrying in 15s...');
          throw error;
        }
      });
      if (result.ok) {
        await writeRenderStatus(videoId, segmentId, 'success');
        return;
      }
      console.error('🛑 Giving up after 3 attempts');
      await writeRenderStatus(videoId, segmentId, 'failed', result.error);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ API entry error:', message);
    return res.status(500).json({
      error: 'Internal Server Error',
      details: message,
    });
  }
}

async function renderSlide(html: string, videoId: string, segmentId: string) {
  const imageBuffer = await getRenderBrowserPool().withPage(async (page) => {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return page.screenshot({ type: 'png', omitBackground: true });
  });

  const filePath = `${videoId}/${segmentId}/slide.png`;
  const { error: uploadError } = await supabase.storage.from('projects').upload(filePath, imageBuffer, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '3600',
  });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log('✅ Segment slide upload succeeded:', filePath);
}

async function writeRenderStatus(
  videoId: string,
  segmentId: string,
  state: 'queued' | 'rendering' | 'success' | 'failed',
  error?: string,
) {
  const path = slideRenderStatusPath(videoId, segmentId);
  if (!path) {
    console.error('slide render status skipped: invalid id');
    return;
  }
  const { error: uploadError } = await supabase.storage.from('projects').upload(path, formatSlideRenderStatus(state, error), {
    contentType: 'text/plain',
    upsert: true,
    cacheControl: '0',
  });
  if (uploadError) console.error('slide render status write failed');
}
