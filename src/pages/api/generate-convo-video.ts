// pages/api/generate-convo-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import fsSync from 'fs'; // for sync access check
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const execAsync = util.promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// リトライ付きダウンロード関数
async function downloadWithRetry(url: string, filePath: string, retries = 3, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
      const buffer = await res.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(buffer));
      return;
    } catch {
      if (attempt < retries) {
        console.warn(`[downloadWithRetry] Attempt ${attempt} failed for ${url}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw new Error(`[downloadWithRetry] Failed to download after ${retries} attempts: ${url}`);
      }
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoId, segmentId, speaker, type } = req.body;

  if (!videoId || !segmentId || !speaker || !type) {
    return res.status(400).json({ error: 'Missing required parameters (videoId, segmentId, speaker, type)' });
  }

  const basePath = `https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/${videoId}/${segmentId}`;
  const audioUrl = `${basePath}/audio.mp3`;
  const slideUrl = `${basePath}/slide.png`;

  res.status(202).json({
    message: 'Conversation video generation started',
    videoId,
    segmentId,
  });

  setTimeout(async () => {
    try {
      console.log(`[generate-convo-video] Start: ${videoId}/${segmentId} (${speaker})`);

      const templateUrl =
        speaker === 'Mia'
          ? `https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/99_Loop/${type}/loop_Mia.mp4`
          : `https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/99_Loop/${type}/loop_Yu.mp4`;

      const tmpBase = `/tmp/${videoId}_${segmentId}`;
      const audioPath = `${tmpBase}_audio.mp3`;
      const slidePath = `${tmpBase}_slide.png`;
      const templatePath = `/tmp/loop_${type}_${speaker.toLowerCase()}.mp4`;
      const outputPath = `/tmp/${videoId}_${segmentId}.mp4`;

      // シリアルに音声→スライドをダウンロード（リトライ付き）
      await downloadWithRetry(audioUrl, audioPath);
      await downloadWithRetry(slideUrl, slidePath);

      // テンプレートがローカルにない場合だけダウンロード
      if (!fsSync.existsSync(templatePath)) {
        console.log(`[generate-convo-video] Downloading template for ${speaker}`);
        await downloadWithRetry(templateUrl, templatePath);
      } else {
        console.log(`[generate-convo-video] Using cached template for ${speaker}`);
      }

      const { stdout: durationOut } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      const rawDuration = parseFloat(durationOut.trim());
      const duration = Math.round(rawDuration * 1000) / 1000;
      if (isNaN(duration)) throw new Error('Invalid audio duration');

      const cmd = `
        ffmpeg -y \
        -i "${templatePath}" \
        -i "${slidePath}" \
        -i "${audioPath}" \
        -filter_complex "[0:v][1:v] overlay=0:0:enable='between(t,0,${duration})'[v]; [v]scale=1280:720[outv]" \
        -map "[outv]" -map 2:a \
        -c:v libx264 -preset faster -crf 28 -r 15 \
        -movflags +faststart -c:a aac -b:a 96k -shortest -t ${duration} "${outputPath}"
      `;

      await execAsync(cmd);
      console.log(`[generate-convo-video] Segment video created: ${outputPath}`);

      const donePath = `${videoId}/${segmentId}/done.txt`;
      const { error: doneUploadError } = await supabase.storage
        .from('projects')
        .upload(donePath, Buffer.from('done'), {
          upsert: true,
          contentType: 'text/plain',
          cacheControl: 'no-cache',
        });

      if (doneUploadError) {
        throw new Error(`Failed to upload done.txt: ${doneUploadError.message}`);
      }

      console.log(`[generate-convo-video] done.txt uploaded to Supabase at ${donePath}`);

      await Promise.all([
        fs.unlink(audioPath).catch(() => {}),
        fs.unlink(slidePath).catch(() => {}),
      ]);
    } catch (err) {
      console.error('[generate-convo-video] Processing error:', err);
    }
  }, 0);
}