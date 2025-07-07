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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoId, segmentId, speaker } = req.body;

  if (!videoId || !segmentId || !speaker) {
    return res.status(400).json({ error: 'Missing required parameters (videoId, segmentId, speaker)' });
  }

  const basePath = `https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/${videoId}/${segmentId}`;
  const audioUrl = `${basePath}/audio.mp3`;
  const slideUrl = `${basePath}/slide.png`;
  const templateUrl = speaker === 'Mia'
    ? 'https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/99_Loop/loop_mia.mp4'
    : 'https://dqeonmqfumkblxintbbz.supabase.co/storage/v1/object/public/projects/99_Loop/loop_Yu.mp4';

  res.status(202).json({
    message: 'Conversation video generation started',
    videoId,
    segmentId,
  });

  setTimeout(async () => {
    try {
      console.log(`[generate-convo-video] Start: ${videoId}/${segmentId} (${speaker})`);

      const tmpBase = `/tmp/${videoId}_${segmentId}`;
      const audioPath = `${tmpBase}_audio.mp3`;
      const slidePath = `${tmpBase}_slide.png`;
      const templatePath = `/tmp/loop_${speaker.toLowerCase()}.mp4`;
      const outputPath = `/tmp/${videoId}_${segmentId}.mp4`;

      const download = async (url: string, filePath: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download ${url}`);
        const buffer = await res.arrayBuffer();
        await fs.writeFile(filePath, Buffer.from(buffer));
      };

      await Promise.all([
        download(audioUrl, audioPath),
        download(slideUrl, slidePath),
      ]);

      if (!fsSync.existsSync(templatePath)) {
        console.log(`[generate-convo-video] Downloading template for ${speaker}`);
        await download(templateUrl, templatePath);
      } else {
        console.log(`[generate-convo-video] Using cached template for ${speaker}`);
      }

      // duration取得（小数第3位に丸め）
      const { stdout: durationOut } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      const rawDuration = parseFloat(durationOut.trim());
      const duration = Math.round(rawDuration * 1000) / 1000;
      if (isNaN(duration)) throw new Error('Invalid audio duration');

      // ✅ 再エンコード＋圧縮付き ffmpegコマンド
      const cmd = `
        ffmpeg -y \
        -i "${templatePath}" \
        -i "${slidePath}" \
        -i "${audioPath}" \
        -filter_complex "[0:v][1:v] overlay=0:0:enable='between(t,0,${duration})'" \
        -map 0:v -map 2:a \
        -c:v libx264 -preset faster -crf 28 -r 15 -vf scale=1280:720 \
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