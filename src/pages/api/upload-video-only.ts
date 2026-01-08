// pages/api/upload-video-only.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* -----------------------------
   Constants
------------------------------ */

const TMP_DIR = '/tmp';
const MAX_ATTEMPTS = 5;
const SAFE_UPLOAD_BYTES = 47 * 1024 * 1024; // 47MB safety buffer

/* -----------------------------
   Utilities
------------------------------ */

async function waitForFileAccessible(
  filePath: string,
  retries = 10,
  interval = 500
) {
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

async function getFileSize(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  return stat.size;
}

function getCompressionParams(attempt: number) {
  switch (attempt) {
    case 1:
      return { crf: 28, preset: 'fast', audio: '128k' };
    case 2:
      return { crf: 30, preset: 'fast', audio: '128k' };
    case 3:
      return { crf: 32, preset: 'fast', audio: '96k' };
    case 4:
      return { crf: 34, preset: 'veryfast', audio: '96k' };
    default:
      return { crf: 36, preset: 'veryfast', audio: '64k' };
  }
}

async function recompressVideo(
  inputPath: string,
  outputPath: string,
  attempt: number
) {
  const { crf, preset, audio } = getCompressionParams(attempt);

  console.log(
    `🎞 Recompress attempt ${attempt}: crf=${crf}, preset=${preset}, audio=${audio}`
  );

  const cmd = `
    ffmpeg -y \
      -i "${inputPath}" \
      -c:v libx264 -preset ${preset} -crf ${crf} \
      -c:a aac -b:a ${audio} \
      -movflags +faststart \
      "${outputPath}"
  `;

  await execAsync(cmd);
}

/* -----------------------------
   API Handler
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

    const originalPath = path.join(TMP_DIR, `${videoId}.mp4`);

    await waitForFileAccessible(originalPath);

    let currentPath = originalPath;
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const size = await getFileSize(currentPath);
      console.log(`📦 Current video size: ${(size / 1024 / 1024).toFixed(2)} MB`);

      if (size <= SAFE_UPLOAD_BYTES) {
        console.log('✅ Size is within upload limit');
        break;
      }

      attempt++;
      if (attempt > MAX_ATTEMPTS) break;

      const compressedPath = path.join(
        TMP_DIR,
        `${videoId}_compressed_${attempt}.mp4`
      );

      await recompressVideo(currentPath, compressedPath, attempt);
      currentPath = compressedPath;
    }

    const finalSize = await getFileSize(currentPath);
    if (finalSize > SAFE_UPLOAD_BYTES) {
      throw new Error(
        `Video still too large after ${MAX_ATTEMPTS} compression attempts`
      );
    }

    console.log(
      `⬆️ Uploading final video (${(finalSize / 1024 / 1024).toFixed(
        2
      )} MB)`
    );

    const videoBuffer = await fs.readFile(currentPath);

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
       Cleanup
    ------------------------------ */

    const files = await fs.readdir(TMP_DIR);
    await Promise.all(
      files.map((f) => fs.unlink(path.join(TMP_DIR, f)).catch(() => {}))
    );

    console.log('🧹 Cleanup completed: tmp fully cleared');

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