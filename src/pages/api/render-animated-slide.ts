import { NextApiRequest, NextApiResponse } from 'next';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { html, videoId, segmentId } = req.body;

  if (!html || !videoId || !segmentId) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  res.status(202).json({ message: 'Video rendering started', videoId, segmentId });

  setImmediate(async () => {
    try {
      const tempDir = `/tmp/${videoId}/${segmentId}`;
      await fs.mkdir(tempDir, { recursive: true });

      // 1. 保存するhtmlファイル
      const htmlPath = path.join(tempDir, 'slide.html');
      await fs.writeFile(htmlPath, html, 'utf-8');

      // 2. Puppeteerを使ってhtmlを開く
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

      // 3. mp3をSupabaseからダウンロード
      const mp3Path = path.join(tempDir, 'audio.mp3');
      const { data, error } = await supabase.storage
        .from('projects')
        .download(`${videoId}/${segmentId}/audio.mp3`);
      if (error || !data) throw new Error('Failed to fetch mp3');
      await fs.writeFile(mp3Path, Buffer.from(await data.arrayBuffer()));

      // 4. duration取得
      const { stdout: durationStr } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3Path}"`
      );
      const duration = parseFloat(durationStr.trim());

      // 5. mp4生成（htmlを録画）
      const mp4Path = path.join(tempDir, 'video.mp4');
      const ffmpegCmd = [
        'ffmpeg',
        '-y',
        '-f', 'x11grab',
        '-video_size', '1920x1080',
        '-i', ':99.0', // ⚠️ここはサーバー構成によって変わる（ローカル録画は別手段）
        '-t', duration,
        mp4Path,
      ].join(' ');
      await execAsync(ffmpegCmd);

      // 6. mp3とmp4を結合
      const outputPath = path.join(tempDir, 'output.mp4');
      await execAsync(
        `ffmpeg -y -i "${mp4Path}" -i "${mp3Path}" -c:v copy -c:a aac -strict experimental "${outputPath}"`
      );

      // ✅ TEST: セグメント動画ファイルをSupabaseにアップロード
      const supabaseVideoPath = `${videoId}/${segmentId}/output.mp4`;
      const videoBuffer = await fs.readFile(outputPath);
      const { error: videoUploadError } = await supabase.storage
        .from('projects')
        .upload(supabaseVideoPath, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });
      if (videoUploadError) {
        console.error('❌ Video upload failed:', videoUploadError.message);
      } else {
        console.log(`✅ Uploaded output.mp4 to Supabase: ${supabaseVideoPath}`);
      }

      console.log(`✅ Segment ${segmentId} rendering completed`);
      await browser.close();
    } catch (e) {
      console.error('❌ Video segment rendering failed:', e);
    }
  });
}