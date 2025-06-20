// pages/api/generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const execAsync = util.promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[generate-video] Start handler');

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slideUrl, audioUrl, subtitleUrl, videoId, segmentId, outputFileName } = req.body;

    if (!slideUrl || !audioUrl || !videoId || !segmentId) {
      return res.status(400).json({ error: 'Missing required parameters (slideUrl, audioUrl, videoId, segmentId)' });
    }

    const slidePath = path.join('/tmp', `${videoId}_${segmentId}_slide.png`);
    const audioPath = path.join('/tmp', `${videoId}_${segmentId}_audio.mp3`);
    const subtitlePath = subtitleUrl ? path.join('/tmp', `${videoId}_${segmentId}_subtitle.srt`) : null;
    const outputName = outputFileName || `${videoId}_${segmentId}.mp4`;
    const outputPath = path.join('/tmp', outputName);

    // 1. スライド画像をダウンロードして保存
    const slideRes = await fetch(slideUrl);
    if (!slideRes.ok) throw new Error('Failed to fetch slide image');
    const slideBuffer = await slideRes.arrayBuffer();
    await fs.writeFile(slidePath, Buffer.from(slideBuffer));

    // 2. 音声ファイルをダウンロードして保存
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error('Failed to fetch audio file');
    const audioBuffer = await audioRes.arrayBuffer();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));

    // 3. 字幕ファイルをダウンロードして保存（あれば）
    if (subtitleUrl && subtitlePath) {
      const subtitleRes = await fetch(subtitleUrl);
      if (!subtitleRes.ok) throw new Error('Failed to fetch subtitle file');
      const subtitleText = await subtitleRes.text();
      await fs.writeFile(subtitlePath, subtitleText, 'utf-8');
    }

    // 4. ffprobeで音声の長さを取得
    const { stdout: durationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    const duration = parseFloat(durationStdout.trim());
    if (isNaN(duration)) {
      throw new Error('Failed to parse audio duration');
    }

    // 5. ffmpegコマンドを構築
    let cmd = `ffmpeg -y -loop 1 -i "${slidePath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${duration}`;

    if (subtitlePath) {
      cmd += ` -vf subtitles="${subtitlePath}"`;
    }

    cmd += ` "${outputPath}"`;

    // 6. ffmpeg実行
    await execAsync(cmd);

    // 7. 一時的な素材ファイル（スライド、音声、字幕）を削除
    await Promise.all([
      fs.unlink(slidePath).catch(() => {}),
      fs.unlink(audioPath).catch(() => {}),
      subtitlePath ? fs.unlink(subtitlePath).catch(() => {}) : Promise.resolve(),
    ]);
    
    // 8. 成功レスポンス（動画ファイルのパスまたは名前を返す）
    res.status(200).json({
      message: 'Segment video generated and saved',
      outputFileName: outputName,
      outputPath,
      videoId,
      segmentId,
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({
      error: 'Unexpected error',
      details: err instanceof Error ? err.message : err,
    });
  }
}