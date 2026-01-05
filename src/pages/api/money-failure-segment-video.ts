import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const execAsync = util.promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* -----------------------------
   Utility: download with retry
------------------------------ */
async function downloadWithRetry(
  url: string,
  filePath: string,
  retries = 3,
  delayMs = 1000
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const buffer = await res.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(buffer));
      return;
    } catch {
      if (attempt === retries) {
        throw new Error(`Failed to download ${url}`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/* -----------------------------
   API Handler
------------------------------ */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoId, segmentId } = req.body;

  if (!videoId || !segmentId) {
    return res.status(400).json({
      error: 'Missing required params (videoId, segmentId)',
    });
  }

  // 即レスポンス
  res.status(202).json({
    message: 'Money-failure segment video generation started',
    videoId,
    segmentId,
  });

  // 非同期処理
  setImmediate(async () => {
    try {
      console.log(
        `[money-failure-segment-video] Start ${videoId} / ${segmentId}`
      );

      /* -----------------------------
         Paths
      ------------------------------ */
      const basePublic =
        `${SUPABASE_URL}/storage/v1/object/public/projects`;

      const audioUrl =
        `${basePublic}/${videoId}/${segmentId}/audio.mp3`;

      const segmentSlideUrl =
        `${basePublic}/${videoId}/${segmentId}/slide.png`;

      // ローカル一時ファイル（既存と絶対に被らない命名）
      const tmpAudio = `/tmp/${videoId}_${segmentId}_audio.mp3`;
      const tmpSegmentSlide = `/tmp/${videoId}_${segmentId}_segment.png`;
      const tmpOutputVideo = `/tmp/${videoId}_${segmentId}_segment.mp4`;

      /* -----------------------------
         Download assets (serial)
      ------------------------------ */
      await downloadWithRetry(audioUrl, tmpAudio);
      await downloadWithRetry(segmentSlideUrl, tmpSegmentSlide);

      /* -----------------------------
         Get audio duration
      ------------------------------ */
      const { stdout: durationOut } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tmpAudio}"`
      );

      const duration = parseFloat(durationOut.trim());
      if (isNaN(duration)) {
        throw new Error('Invalid audio duration');
      }

      /* -----------------------------
         ffmpeg: slide + audio
      ------------------------------ */
      const ffmpegCmd = `
        ffmpeg -y \
          -loop 1 -i "${tmpSegmentSlide}" \
          -i "${tmpAudio}" \
          -map 0:v -map 1:a \
          -t ${duration} \
          -c:v libx264 -preset faster -crf 28 -r 15 \
          -pix_fmt yuv420p \
          -c:a aac -b:a 96k \
          -movflags +faststart \
          "${tmpOutputVideo}"
      `;

      await execAsync(ffmpegCmd);
      console.log(
        `[money-failure-segment-video] Created ${tmpOutputVideo}`
      );

      /* -----------------------------
         done.txt upload
      ------------------------------ */
      const donePath = `${videoId}/${segmentId}/done.txt`;

      const { error: doneErr } = await supabase.storage
        .from('projects')
        .upload(donePath, Buffer.from('done'), {
          upsert: true,
          contentType: 'text/plain',
          cacheControl: 'no-cache',
        });

      if (doneErr) {
        throw new Error(`done.txt upload failed: ${doneErr.message}`);
      }

      /* -----------------------------
         Cleanup (leave mp4!)
      ------------------------------ */
      await Promise.all([
        fs.unlink(tmpAudio).catch(() => {}),
        fs.unlink(tmpSegmentSlide).catch(() => {}),
      ]);

      console.log(
        `[money-failure-segment-video] Completed ${videoId}/${segmentId}`
      );
    } catch {
      console.error(
        '[money-failure-segment-video] Unexpected error occurred'
      );
    }
  });
}