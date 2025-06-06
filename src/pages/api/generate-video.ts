// pages/api/generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch'; // node18以上はglobal fetchがあるので不要な場合あり

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slideUrl, audioUrl, outputFileName, duration } = req.body;
    if (!slideUrl || !audioUrl || !duration) {
      return res.status(400).json({ error: 'Missing slideUrl, audioUrl or duration in request body' });
    }

    // 保存先パスを決定
    const slidePath = path.join('/tmp', 'slide.png');
    const audioPath = path.join('/tmp', 'audio.mp3');
    const outputName = outputFileName || 'output.mp4';
    const outputPath = path.join('/tmp', outputName);

    // 1. 画像ファイルをダウンロードして保存
    const slideRes = await fetch(slideUrl);
    if (!slideRes.ok) throw new Error('Failed to fetch slide image');
    const slideBuffer = await slideRes.arrayBuffer();
    await fs.writeFile(slidePath, Buffer.from(slideBuffer));

    // 2. 音声ファイルをダウンロードして保存
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error('Failed to fetch audio file');
    const audioBuffer = await audioRes.arrayBuffer();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));

    // 3. ffmpeg コマンドを実行
    // 画像をループして音声と合わせ、音声の長さに動画を合わせる
    //const cmd = `ffmpeg -y -loop 1 -i "${slideUrl}" -i "${audioUrl}" -c:v libx264 -c:a aac -b:a 192k -t ${duration} "${outputPath}"`;
    const cmd = `ffmpeg -y -loop 1 -i "${slidePath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -shortest "${outputPath}"`;

    exec(cmd, async (error, stdout, stderr) => {
      if (error) {
        console.error('ffmpeg error:', error, stderr);
        return res.status(500).json({ error: 'ffmpeg execution failed', details: stderr });
      }

      try {
        // 4. 生成された動画を読み込む（必要ならBase64化など）
        const videoBuffer = await fs.readFile(outputPath);
        // 一時ファイルは不要なら削除
        await fs.unlink(slidePath);
        await fs.unlink(audioPath);
        await fs.unlink(outputPath);

        res.status(200).json({
          message: 'Video generated successfully',
          videoBase64: videoBuffer.toString('base64'),
          outputFileName: outputName,
        });
      } catch (readErr) {
        console.error('Error reading output file:', readErr);
        res.status(500).json({ error: 'Failed to read output video file' });
      }
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
}