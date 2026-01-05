// pages/api/background-video-merge-only.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';

const execAsync = util.promisify(exec);

const SUPABASE_BASE =
  'https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects';

const TEMPLATE_BASE =
  `${SUPABASE_BASE}/99_Template/02_MoneyFailure`;

/* -----------------------------
   Utils
------------------------------ */

async function download(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}`);
  const buf = await res.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(buf));
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  const d = parseFloat(stdout.trim());
  if (isNaN(d)) throw new Error('Invalid duration');
  return d;
}

/* -----------------------------
   API
------------------------------ */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    console.log('🎬 background-video-merge START');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const tmpFinalVideo = `/tmp/${videoId}.mp4`;
    if (!(await fileExists(tmpFinalVideo))) {
      return res.status(400).json({
        error: 'Final video not found in /tmp',
        path: tmpFinalVideo,
      });
    }

    /* -----------------------------
       Pick random background
    ------------------------------ */

    const candidates = ['001.mp4', '002.mp4', '003.mp4', '004.mp4', '005.mp4', '006.mp4', '007.mp4']; // ← ここは将来API化してもいい
    const picked =
      candidates[Math.floor(Math.random() * candidates.length)];

    console.log(`🎨 Picked background: ${picked}`);

    const bgUrl = `${TEMPLATE_BASE}/${picked}`;
    const tmpBg = `/tmp/money_failure_bg_${picked}`;

    if (!(await fileExists(tmpBg))) {
      console.log('⬇️ Downloading background video');
      await download(bgUrl, tmpBg);
    } else {
      console.log('♻️ Using cached background video');
    }

    /* -----------------------------
       ffmpeg merge
    ------------------------------ */

    const duration = await getVideoDuration(tmpFinalVideo);
    console.log(`⏱ Foreground duration: ${duration}s`);

    const tmpOutput = `/tmp/${videoId}_bg.mp4`;

    /**
     * 構成:
     * - 背景：フルHD
     * - 前景：1280x720 に縮小 → 中央配置
     */
    const cmd = `
      ffmpeg -y \
        -stream_loop -1 -i "${tmpBg}" \
        -i "${tmpFinalVideo}" \
        -filter_complex "
          [0:v]scale=1920:1080[bg];
          [1:v]scale=1280:720[fg];
          [bg][fg]overlay=(W-w)/2:(H-h)/2
        " \
        -map 1:a? \
        -c:v libx264 -preset faster -crf 28 -r 15 \
        -pix_fmt yuv420p \
        -t ${duration} \
        -movflags +faststart \
        "${tmpOutput}"
    `;

    console.log('🎞 Running ffmpeg merge');
    await execAsync(cmd);

    /* -----------------------------
       Replace original
    ------------------------------ */

    await fs.rename(tmpOutput, tmpFinalVideo);

    console.log('✅ Background merge completed');

    return res.status(200).json({
      message: 'Background video merged',
      videoId,
      outputPath: tmpFinalVideo,
      background: picked,
    });
  } catch (e) {
    console.error('❌ background-video-merge error', e);
    return res.status(500).json({
      error: 'Background merge failed',
      details: e instanceof Error ? e.message : String(e),
    });
  }
}