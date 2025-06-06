// pages/api/generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import util from 'util';

const execPromise = util.promisify(exec);

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

    // 出力ファイル名（なければ固定）
    const outputName = outputFileName ? outputFileName : 'output.mp4';
    // 一時保存先は /tmp 配下（環境による）
    const outputPath = path.join('/tmp', outputName);

    // 音声の長さに余裕を持たせる（3秒バッファ）
    const bufferSeconds = 3;
    const safeDuration = Number(duration) + bufferSeconds;

    // ffmpegコマンド構築（-shortest は外し -t で制御）
    const cmd = `ffmpeg -y -loop 1 -i "${slideUrl}" -i "${audioUrl}" -c:v libx264 -t ${safeDuration} -pix_fmt yuv420p -c:a aac -b:a 192k "${outputPath}"`;

    try {
      // コマンド実行
      const { stdout, stderr } = await execPromise(cmd);

      // 生成された動画を読み込んでBase64に変換
      const videoBuffer = await fs.readFile(outputPath);
      const videoBase64 = videoBuffer.toString('base64');

      // 一時ファイル削除
      await fs.unlink(outputPath);

      // 成功レスポンス返却
      res.status(200).json({
        message: 'Video generated successfully',
        outputFileName: outputName,
        videoBase64,
        ffmpegStdout: stdout,
        ffmpegStderr: stderr,
      });
    } catch (ffmpegError) {
      console.error('ffmpeg execution failed:', ffmpegError);
      return res.status(500).json({ error: 'ffmpeg execution failed', details: ffmpegError });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
}