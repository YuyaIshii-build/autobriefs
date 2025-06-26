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

    // 1. /tmp フォルダ内の videoId_*.mp4 ファイルを列挙
    const tmpDir = '/tmp';
    const files = await fs.readdir(tmpDir);
    const videoFiles = files
      .filter(f => f.startsWith(videoId + '_') && f.endsWith('.mp4'))
      .filter(f => f.includes('segment_')) // segment_xxx のみ対象
      .sort()
      .map(f => path.join(tmpDir, f));

    if (videoFiles.length === 0) {
      return res.status(400).json({ error: 'No video segment files found for this videoId' });
    }

    // 2. concat用テキストファイル作成
    const concatListPath = path.join(tmpDir, `${videoId}_concat_list.txt`);
    const concatFileContent = videoFiles
      .map(f => `file '${path.basename(f)}'`)
      .join('\n') + '\n'; // 最後に改行を追加
    await fs.writeFile(concatListPath, concatFileContent.replace(/\r\n/g, '\n'), 'utf8');

    console.log('concat list content:\n', concatFileContent);

    // 3. ffmpegで連結（cwd指定で作業ディレクトリを/tmpに設定）
    const outputFileName = `${videoId}.mp4`;
    const outputPath = path.join(tmpDir, outputFileName);
    const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputFileName}"`;
    const { stdout, stderr } = await execAsync(ffmpegCmd, { cwd: tmpDir });

    // 4. Supabaseに最終動画ファイルをアップロード
    const videoBuffer = await fs.readFile(outputPath);
    const { error: uploadError } = await supabase.storage
      .from('projects')
      .upload(`${videoId}/${outputFileName}`, videoBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'video/mp4',
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload final video file to Supabase', details: uploadError.message });
    }

    // 5. 一時ファイルを削除
    const templatePaths = ['/tmp/loop_mia.mp4', '/tmp/loop_yu.mp4'];
    await Promise.all([
      ...videoFiles.map(f => fs.unlink(f).catch(() => {})),
      fs.unlink(concatListPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {}),
      ...templatePaths.map(p => fs.unlink(p).catch(() => {})),
    ]);

    // 6. 成功レスポンス
    res.status(200).json({
      message: 'Videos concatenated and uploaded successfully',
      outputFileName,
      ffmpegStdout: stdout,
      ffmpegStderr: stderr,
      videoUrl: `${SUPABASE_URL}/storage/v1/object/public/projects/${videoId}/${outputFileName}`,
    });

  } catch (error) {
    console.error('concat-videos error:', error);
    res.status(500).json({ error: 'Failed to concatenate videos', details: error instanceof Error ? error.message : error });
  }
}