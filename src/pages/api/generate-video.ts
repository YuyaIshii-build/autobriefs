// pages/api/generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const execAsync = util.promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slideUrl, audioUrl, subtitleUrl, videoId, segmentId, outputFileName } = req.body;

  if (!slideUrl || !audioUrl || !videoId || !segmentId) {
    return res.status(400).json({ error: 'Missing required parameters (slideUrl, audioUrl, videoId, segmentId)' });
  }

  // 即レスポンス（202 Accepted）
  res.status(202).json({
    message: 'Video generation started (processing asynchronously)',
    videoId,
    segmentId,
  });

  // 非同期で動画生成処理を開始
  setTimeout(async () => {
    try {
      console.log(`[generate-video] Start async process for videoId=${videoId}, segmentId=${segmentId}`);

      const slidePath = path.join('/tmp', `${videoId}_${segmentId}_slide.png`);
      const audioPath = path.join('/tmp', `${videoId}_${segmentId}_audio.mp3`);
      const subtitlePath = subtitleUrl ? path.join('/tmp', `${videoId}_${segmentId}_subtitle.srt`) : null;
      const outputName = outputFileName || `${videoId}_${segmentId}.mp4`;
      const outputPath = path.join('/tmp', outputName);

      // スライド画像の保存
      const slideRes = await fetch(slideUrl);
      if (!slideRes.ok) throw new Error('Failed to fetch slide image');
      const slideBuffer = await slideRes.arrayBuffer();
      await fs.writeFile(slidePath, Buffer.from(slideBuffer));

      // 音声ファイルの保存
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error('Failed to fetch audio file');
      const audioBuffer = await audioRes.arrayBuffer();
      await fs.writeFile(audioPath, Buffer.from(audioBuffer));

      // 字幕ファイルの保存（あれば）
      if (subtitleUrl && subtitlePath) {
        const subtitleRes = await fetch(subtitleUrl);
        if (!subtitleRes.ok) throw new Error('Failed to fetch subtitle file');
        const subtitleText = await subtitleRes.text();
        await fs.writeFile(subtitlePath, subtitleText, 'utf-8');
      }

      // 音声長の取得
      const { stdout: durationStdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      const duration = parseFloat(durationStdout.trim());
      if (isNaN(duration)) throw new Error('Failed to parse audio duration');

      // ffmpegコマンド生成
      let cmd = `ffmpeg -y -loop 1 -i "${slidePath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${duration}`;
      if (subtitlePath) {
        cmd += ` -vf subtitles="${subtitlePath}"`;
      }
      cmd += ` "${outputPath}"`;

      // ffmpeg実行
      await execAsync(cmd);

      console.log(`[generate-video] Successfully generated: ${outputPath}`);

      // 一時ファイル削除
      await Promise.all([
        fs.unlink(slidePath).catch(() => {}),
        fs.unlink(audioPath).catch(() => {}),
        subtitlePath ? fs.unlink(subtitlePath).catch(() => {}) : Promise.resolve(),
      ]);

      // 🔔 セグメント生成完了通知 (n8n Webhook 呼び出し)
      await fetch('https://primary-production-a9ff9.up.railway.app/webhook/segment-done', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          segmentId,
          status: 'done',
        }),
      });

      console.log(`[generate-video] Callback sent for videoId=${videoId}, segmentId=${segmentId}`);
    } catch (err) {
      console.error('[generate-video] Async process failed:', err);
    }
  }, 0);
}