// pages/api/ generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slideUrl, audioUrl, outputFileName } = req.body;

    if (!slideUrl || !audioUrl) {
      return res.status(400).json({ error: 'Missing slideUrl or audioUrl in request body' });
    }

    // 出力ファイル名（なければ固定）
    const outputName = outputFileName ? outputFileName : 'output.mp4';
    // 一時保存先は /tmp 配下（環境による）
    const outputPath = path.join('/tmp', outputName);

    // ffmpegコマンド構築
    // 画像をループさせて音声と合成、最短時間で切る
    const cmd = `ffmpeg -y -loop 1 -i "${slideUrl}" -i "${audioUrl}" -c:v libx264 -c:a aac -b:a 192k -shortest "${outputPath}"`;

    exec(cmd, async (error, stdout, stderr) => {
      if (error) {
        console.error('ffmpeg error:', error, stderr);
        return res.status(500).json({ error: 'ffmpeg execution failed', details: stderr });
      }

      try {
        // 生成された動画を読み込んでBase64に変換（必要に応じて）
        const videoBuffer = await fs.readFile(outputPath);
        const videoBase64 = videoBuffer.toString('base64');

        // 一時ファイル削除（必要に応じて）
        await fs.unlink(outputPath);

        // レスポンスにBase64動画データ返却（あるいはURLを返すAPIに変更も可）
        res.status(200).json({ 
          message: 'Video generated successfully',
          outputFileName: outputName,
          videoBase64,
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