// pages/api/generate-video.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch'; // node18以降はglobal fetchがあるので不要なら省略可

const execAsync = util.promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slideUrl, audioUrl, subtitleUrl, outputFileName } = req.body;

    if (!slideUrl || !audioUrl || !subtitleUrl) {
      return res.status(400).json({ error: 'Missing slideUrl, audioUrl, or subtitleUrl in request body' });
    }

    const slidePath = path.join('/tmp', 'slide.png');
    const audioPath = path.join('/tmp', 'audio.mp3');
    const subtitlePath = path.join('/tmp', 'subtitle.srt');
    const outputName = outputFileName || 'output.mp4';
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

    // 3. 字幕ファイルをダウンロードして保存
    const subtitleRes = await fetch(subtitleUrl);
    if (!subtitleRes.ok) throw new Error('Failed to fetch subtitle file');
    const subtitleText = await subtitleRes.text();
    await fs.writeFile(subtitlePath, subtitleText, 'utf-8');

    // 4. ffprobeで音声の長さを取得
    const { stdout: durationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    const duration = parseFloat(durationStdout.trim());
    if (isNaN(duration)) {
      throw new Error('Failed to parse audio duration');
    }

    // 5. ffmpegコマンドを構築・実行
    const cmd = `ffmpeg -y -loop 1 -i "${slidePath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${duration} -vf subtitles="${subtitlePath}" "${outputPath}"`;

    exec(cmd, async (error, stdout, stderr) => {
      if (error) {
        console.error('ffmpeg error:', error, stderr);
        return res.status(500).json({ error: 'ffmpeg execution failed', details: stderr });
      }

      try {
        // 6. 生成された動画を読み込みBase64化（必要に応じて）
        const videoBuffer = await fs.readFile(outputPath);

        // 7. 一時ファイル削除
        await Promise.all([
          fs.unlink(slidePath),
          fs.unlink(audioPath),
          fs.unlink(subtitlePath),
          fs.unlink(outputPath),
        ]);

        // 8. 成功レスポンス
        res.status(200).json({
          message: 'Video generated successfully',
          outputFileName: outputName,
          videoBase64: videoBuffer.toString('base64'),
        });
      } catch (readErr) {
        console.error('Error reading output file:', readErr);
        res.status(500).json({ error: 'Failed to read output video file' });
      }
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Unexpected error', details: err instanceof Error ? err.message : err });
  }
}