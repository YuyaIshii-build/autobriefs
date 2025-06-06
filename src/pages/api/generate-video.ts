// pages/api/ generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec as execCb } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import util from 'util';

const exec = util.promisify(execCb);

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

    const outputName = outputFileName || 'output.mp4';
    const outputPath = path.join('/tmp', outputName);

    // 1. ffprobeで音声の長さを取得
    const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioUrl}"`;
    const { stdout: durationStr } = await exec(durationCmd);
    const duration = parseFloat(durationStr.trim());

    if (isNaN(duration)) {
      return res.status(500).json({ error: 'Failed to get audio duration' });
    }

    // 2. 画像を音声の長さだけループさせて動画作成
    const ffmpegCmd = `ffmpeg -y -loop 1 -i "${slideUrl}" -i "${audioUrl}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outputPath}"`;
    await exec(ffmpegCmd);

    // 3. 生成ファイルをBase64変換してレスポンス
    const videoBuffer = await fs.readFile(outputPath);
    const videoBase64 = videoBuffer.toString('base64');

    await fs.unlink(outputPath);

    res.status(200).json({
      message: 'Video generated successfully',
      outputFileName: outputName,
      videoBase64,
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Unexpected error', details: err instanceof Error ? err.message : String(err) });
  }
}