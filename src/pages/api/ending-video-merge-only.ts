// pages/api/ending-video-merge-only.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const execAsync = util.promisify(exec);

const ENDING_URL =
  'https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/99_Template/03_Ending/MoneyFailure.mp4';

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

const escapePath = (p: string) => p.replace(/'/g, "'\\''");

/* -----------------------------
   API
------------------------------ */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    console.log('🎬 ending-video-merge START');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const tmpMainVideo = `/tmp/${videoId}.mp4`;
    if (!(await fileExists(tmpMainVideo))) {
      return res.status(400).json({
        error: 'Main video not found in /tmp',
        path: tmpMainVideo,
      });
    }

    /* -----------------------------
       Prepare ending video
    ------------------------------ */

    const tmpEndingVideo = `/tmp/money_failure_ending.mp4`;

    if (!(await fileExists(tmpEndingVideo))) {
      console.log('⬇️ Downloading ending video');
      await download(ENDING_URL, tmpEndingVideo);
    } else {
      console.log('♻️ Using cached ending video');
    }

    /* -----------------------------
       Concat main + ending
    ------------------------------ */

    const listPath = `/tmp/${videoId}_ending_list.txt`;
    const tmpOutput = `/tmp/${videoId}_with_ending.mp4`;

    const listContent =
      `file '${escapePath(tmpMainVideo)}'\n` +
      `file '${escapePath(tmpEndingVideo)}'\n`;

    await fs.writeFile(listPath, listContent);

    const cmd = `
      ffmpeg -y \
        -f concat -safe 0 \
        -i "${listPath}" \
        -c copy \
        -movflags +faststart \
        "${tmpOutput}"
    `;

    console.log('🎞 Running ffmpeg concat (main + ending)');
    await execAsync(cmd);

    /* -----------------------------
       Replace original
    ------------------------------ */

    await fs.rename(tmpOutput, tmpMainVideo);
    await fs.unlink(listPath).catch(() => {});

    console.log('✅ Ending merge completed');

    return res.status(200).json({
      message: 'Ending video merged',
      videoId,
      outputPath: tmpMainVideo,
    });
  } catch (e) {
    console.error('❌ ending-video-merge error', e);
    return res.status(500).json({
      error: 'Ending merge failed',
      details: e instanceof Error ? e.message : String(e),
    });
  }
}