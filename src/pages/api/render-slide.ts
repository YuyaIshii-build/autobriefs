// pages/api/render-slide.ts

import { rm } from 'node:fs/promises';

import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';
import puppeteer from 'puppeteer';

import {
  createSegmentBrowserPool,
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

let browserGeneration = 0;

function createPool() {
  return createSegmentBrowserPool({
    createUserDataDir() {
      browserGeneration += 1;
      return `/tmp/puppeteer_segment_${process.pid}_${browserGeneration}`;
    },
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    isBusy: () => {
      const queue = getSegmentRenderQueue();
      return queue.active > 0 || queue.waiting > 0;
    },
    launch: (userDataDir) =>
      puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process',
          '--no-zygote',
          `--user-data-dir=${userDataDir}`,
        ],
      }),
  });
}

let segmentBrowserPool: ReturnType<typeof createPool> | null = null;

function getSegmentBrowser() {
  segmentBrowserPool ??= createPool();
  return segmentBrowserPool;
}

async function renderSlide(html: string, videoId: string, segmentId: string) {
  const imageBuffer = await getSegmentBrowser().withPage(async (page) => {
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
