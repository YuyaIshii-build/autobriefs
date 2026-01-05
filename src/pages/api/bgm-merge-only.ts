// pages/api/bgm-merge-only.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const execAsync = util.promisify(exec);

const SUPABASE_BASE =
  'https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects';

const BGM_BASE =
  `${SUPABASE_BASE}/99_Template/04_BGM/01_Dark`;

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
    console.log('🎵 bgm-merge START');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const tmpVideo = `/tmp/${videoId}.mp4`;
    if (!(await fileExists(tmpVideo))) {
      return res.status(400).json({
        error: 'Target video not found in /tmp',
        path: tmpVideo,
      });
    }

    /* -----------------------------
       Pick random BGM
    ------------------------------ */

    const candidates = [
      '001.mp3',
      '002.mp3',
      '003.mp3',
      '004.mp3',
      '005.mp3',
    ];

    const picked =
      candidates[Math.floor(Math.random() * candidates.length)];

    console.log(`🎶 Picked BGM: ${picked}`);

    const bgmUrl = `${BGM_BASE}/${picked}`;
    const tmpBgm = `/tmp/money_failure_bgm_${picked}`;

    if (!(await fileExists(tmpBgm))) {
      console.log('⬇️ Downloading BGM');
      await download(bgmUrl, tmpBgm);
    } else {
      console.log('♻️ Using cached BGM');
    }

    /* -----------------------------
       ffmpeg merge
    ------------------------------ */

    const duration = await getVideoDuration(tmpVideo);
    const fadeStart = Math.max(duration - 10, 0);

    const tmpOutput = `/tmp/${videoId}_bgm.mp4`;

    /**
     * 音声構成:
     * - 0:a = 元動画の音声（ナレーション）
     * - 1:a = BGM（ループ）
     * - BGM音量を下げ、最後10秒でフェードアウト
     */
    const cmd = `
      ffmpeg -y \
        -i "${tmpVideo}" \
        -stream_loop -1 -i "${tmpBgm}" \
        -filter_complex "
          [1:a]volume=0.15,afade=t=out:st=${fadeStart}:d=10[bgm];
          [0:a][bgm]amix=inputs=2:dropout_transition=0[a]
        " \
        -map 0:v \
        -map "[a]" \
        -c:v copy \
        -c:a aac -b:a 128k \
        -t ${duration} \
        -movflags +faststart \
        "${tmpOutput}"
    `;

    console.log('🎚 Running ffmpeg BGM merge');
    await execAsync(cmd);

    /* -----------------------------
       Replace original
    ------------------------------ */

    await fs.rename(tmpOutput, tmpVideo);

    console.log('✅ BGM merge completed');

    return res.status(200).json({
      message: 'BGM merged successfully',
      videoId,
      bgm: picked,
      outputPath: tmpVideo,
    });
  } catch (e) {
    console.error('❌ bgm-merge error', e);
    return res.status(500).json({
      error: 'BGM merge failed',
      details: e instanceof Error ? e.message : String(e),
    });
  }
}