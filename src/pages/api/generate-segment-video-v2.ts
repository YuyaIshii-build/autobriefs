// pages/api/generate-segment-video-v2.ts

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
    } catch (err) {
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

  const { videoId, segmentId, topicId } = req.body;

  if (!videoId || !segmentId || !topicId) {
    return res.status(400).json({
      error: 'Missing required params (videoId, segmentId, topicId)',
    });
  }

  // 即レスポンス
  res.status(202).json({
    message: 'Segment video generation started',
    videoId,
    segmentId,
    topicId,
  });

  // 非同期処理
  setImmediate(async () => {
    try {
      console.log(
        `[segment-video-v2] Start ${videoId} / ${segmentId} / ${topicId}`
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

      const topicSlideUrl =
        `${basePublic}/${videoId}/topic/${topicId}.png`;

      // ローカル一時ファイル（既存と絶対に被らない命名）
      const tmpAudio = `/tmp/${videoId}_${segmentId}_audio.mp3`;
      const tmpSegmentSlide = `/tmp/${videoId}_${segmentId}_segment.png`;
      const tmpTopicSlide = `/tmp/${videoId}_${segmentId}_topic.png`;
      const tmpOutputVideo = `/tmp/${videoId}_${segmentId}_segment.mp4`;

      /* -----------------------------
         Download assets (serial)
      ------------------------------ */
      await downloadWithRetry(audioUrl, tmpAudio);
      await downloadWithRetry(segmentSlideUrl, tmpSegmentSlide);
      await downloadWithRetry(topicSlideUrl, tmpTopicSlide);

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
         ffmpeg: overlay topic + segment
      ------------------------------ */
      const ffmpegCmd = `
        ffmpeg -y \
          -loop 1 -i "${tmpTopicSlide}" \
          -loop 1 -i "${tmpSegmentSlide}" \
          -i "${tmpAudio}" \
          -filter_complex "[0:v][1:v] overlay=0:0:format=auto [v]" \
          -map "[v]" -map 2:a \
          -t ${duration} \
          -c:v libx264 -preset faster -crf 28 -r 15 \
          -pix_fmt yuv420p \
          -c:a aac -b:a 96k \
          -movflags +faststart \
          "${tmpOutputVideo}"
      `;

      await execAsync(ffmpegCmd);
      console.log(
        `[segment-video-v2] Created ${tmpOutputVideo}`
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
        fs.unlink(tmpTopicSlide).catch(() => {}),
      ]);

      console.log(
        `[segment-video-v2] Completed ${videoId}/${segmentId}`
      );
    } catch (err) {
      console.error('[segment-video-v2] Error:', err);
    }
  });
}