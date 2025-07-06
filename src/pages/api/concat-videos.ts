// pages/api/concat-videos.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

const execAsync = util.promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ユーティリティ: 配列をチャンク分割
function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId in request body' });
    }

    const tmpDir = '/tmp';
    const files = await fs.readdir(tmpDir);
    const videoFiles = files
      .filter(f => f.startsWith(videoId + '_') && f.endsWith('.mp4'))
      .filter(f => f.includes('segment_'))
      .sort()
      .map(f => path.join(tmpDir, f));

    if (videoFiles.length === 0) {
      return res.status(400).json({ error: 'No video segment files found for this videoId' });
    }

    console.log(`Found ${videoFiles.length} segment files.`);

    // 1. チャンクに分割
    const chunks = chunkArray(videoFiles, 30);
    const intermediateFiles: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkListPath = path.join(tmpDir, `${videoId}_chunk_${i}.txt`);
      const chunkOutput = path.join(tmpDir, `${videoId}_chunk_${i}.mp4`);

      const chunkFileContent = chunk
        .map(f => `file '${path.basename(f)}'`)
        .join('\n') + '\n';
      await fs.writeFile(chunkListPath, chunkFileContent, 'utf8');

      console.log(`Chunk ${i + 1}/${chunks.length} list:\n${chunkFileContent}`);

      const ffmpegChunkCmd = `ffmpeg -y -f concat -safe 0 -i "${chunkListPath}" -c copy "${path.basename(chunkOutput)}"`;
      const { stdout: chunkStdout, stderr: chunkStderr } = await execAsync(ffmpegChunkCmd, { cwd: tmpDir });

      console.log(`Chunk ${i + 1} ffmpeg output:\n${chunkStdout}\n${chunkStderr}`);

      intermediateFiles.push(chunkOutput);
      await fs.unlink(chunkListPath).catch(() => {});
    }

    // 2. 最終結合（ここを再エンコードで圧縮）
    const finalListPath = path.join(tmpDir, `${videoId}_final_list.txt`);
    const finalFileContent = intermediateFiles
      .map(f => `file '${path.basename(f)}'`)
      .join('\n') + '\n';
    await fs.writeFile(finalListPath, finalFileContent, 'utf8');

    console.log('Final concat list:\n', finalFileContent);

    const finalOutput = path.join(tmpDir, `${videoId}.mp4`);

    // ✅ 再エンコードで圧縮
    const ffmpegFinalCmd = `ffmpeg -y -f concat -safe 0 -i "${finalListPath}" -c:v libx264 -preset slow -crf 24 -c:a aac -b:a 128k "${path.basename(finalOutput)}"`;
    const { stdout: finalStdout, stderr: finalStderr } = await execAsync(ffmpegFinalCmd, { cwd: tmpDir });

    console.log(`Final ffmpeg output:\n${finalStdout}\n${finalStderr}`);

    // 3. Supabaseにアップロード
    const videoBuffer = await fs.readFile(finalOutput);
    const { error: uploadError } = await supabase.storage
      .from('projects')
      .upload(`${videoId}/${videoId}.mp4`, videoBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'video/mp4',
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({
        error: 'Failed to upload final video file to Supabase',
        details: uploadError.message,
      });
    }

    // 4. 一時ファイル削除
    await Promise.all([
      ...videoFiles.map(f => fs.unlink(f).catch(() => {})),
      ...intermediateFiles.map(f => fs.unlink(f).catch(() => {})),
      fs.unlink(finalListPath).catch(() => {}),
      fs.unlink(finalOutput).catch(() => {}),
    ]);

    res.status(200).json({
      message: 'Videos concatenated, compressed, and uploaded successfully',
      outputFileName: `${videoId}.mp4`,
      videoUrl: `${SUPABASE_URL}/storage/v1/object/public/projects/${videoId}/${videoId}.mp4`,
      ffmpegStdout: finalStdout,
      ffmpegStderr: finalStderr,
    });

  } catch (error) {
    console.error('concat-videos error:', error);
    res.status(500).json({
      error: 'Failed to concatenate videos',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}