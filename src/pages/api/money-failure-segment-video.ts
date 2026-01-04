import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const execAsync = util.promisify(exec);

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

  // 即レスポンス（ジョブ受付のみ）
  res.status(202).json({
    message: 'Money-failure segment video generation started',
    videoId,
    segmentId,
  });

  // 非同期処理
  setImmediate(async () => {
    try {
      console.log(
        `[money-failure-segment] Start ${videoId} / ${segmentId}`
      );

      /* -----------------------------
         Paths
      ------------------------------ */
      const basePublic =
        `${process.env.SUPABASE_URL}/storage/v1/object/public/projects`;

      const audioUrl =
        `${basePublic}/${videoId}/${segmentId}/audio.mp3`;

      const segmentPngUrl =
        `${basePublic}/${videoId}/${segmentId}/segment.png`;

      // tmp（シリーズ衝突を避けるため prefix 明示）
      const tmpAudio =
        `/tmp/money_failure_${videoId}_${segmentId}_audio.mp3`;

      const tmpSegmentPng =
        `/tmp/money_failure_${videoId}_${segmentId}_segment.png`;

      const tmpOutputVideo =
        `/tmp/money_failure_${videoId}_${segmentId}.mp4`;

      /* -----------------------------
         Download assets
      ------------------------------ */
      await downloadWithRetry(audioUrl, tmpAudio);
      await downloadWithRetry(segmentPngUrl, tmpSegmentPng);

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
         ffmpeg: static png + audio
      ------------------------------ */
      const ffmpegCmd = `
        ffmpeg -y \
          -loop 1 -i "${tmpSegmentPng}" \
          -i "${tmpAudio}" \
          -t ${duration} \
          -map 0:v -map 1:a \
          -c:v libx264 -preset faster -crf 28 -r 15 \
          -pix_fmt yuv420p \
          -c:a aac -b:a 96k \
          -movflags +faststart \
          "${tmpOutputVideo}"
      `;

      await execAsync(ffmpegCmd);

      console.log(
        `[money-failure-segment] Created ${tmpOutputVideo}`
      );

      /* -----------------------------
         Cleanup (leave mp4!)
      ------------------------------ */
      await Promise.all([
        fs.unlink(tmpAudio).catch(() => {}),
        fs.unlink(tmpSegmentPng).catch(() => {}),
      ]);

      console.log(
        `[money-failure-segment] Completed ${videoId} / ${segmentId}`
      );
    } catch (err) {
      console.error(
        `[money-failure-segment] Failed ${videoId} / ${segmentId}`,
        err
      );
    }
  });
}