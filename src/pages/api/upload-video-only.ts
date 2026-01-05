// pages/api/upload-video-only.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* -----------------------------
   Utilities（最小限）
------------------------------ */

async function waitForFileAccessible(filePath: string, retries = 10, interval = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      await new Promise((res) => setTimeout(res, interval));
    }
  }
  throw new Error(`File ${filePath} not accessible after ${retries} retries`);
}

/* -----------------------------
   API Handler（upload-only）
------------------------------ */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId in request body' });
    }

    const tmpDir = '/tmp';
    const finalVideoPath = path.join(tmpDir, `${videoId}.mp4`);

    // 最終動画の存在確認
    await waitForFileAccessible(finalVideoPath);

    console.log(`⬆️ Uploading video: ${finalVideoPath}`);

    const videoBuffer = await fs.readFile(finalVideoPath);

    const uploadPath = `${videoId}/${videoId}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('projects')
      .upload(uploadPath, videoBuffer, {
        upsert: true,
        cacheControl: '3600',
        contentType: 'video/mp4',
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    console.log(`✅ Upload complete: ${uploadPath}`);

    /* -----------------------------
       Cleanup（tmp 全掃除）
    ------------------------------ */
    const files = await fs.readdir(tmpDir);

    const relatedFiles = files.filter((f) =>
      f.startsWith(videoId)
    );

    await Promise.all(
      relatedFiles.map((f) =>
        fs.unlink(path.join(tmpDir, f)).catch(() => {})
      )
    );

    console.log(`🧹 Cleanup completed for videoId=${videoId}`);

    return res.status(200).json({
      message: 'Video uploaded successfully',
      videoId,
      videoUrl: `${SUPABASE_URL}/storage/v1/object/public/projects/${uploadPath}`,
    });
  } catch (error) {
    console.error('❌ upload-video-only error:', error);
    return res.status(500).json({
      error: 'Failed to upload video',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}