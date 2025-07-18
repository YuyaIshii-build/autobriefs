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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

const escapePath = (p: string) => p.replace(/'/g, "'\\''");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function validateFileReady(filePath: string) {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new Error(`File ${filePath} is empty`);
  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs < 5000) throw new Error(`File ${filePath} may still be being written (age ${ageMs} ms)`);
  console.log(`✅ File ready: ${filePath} (size: ${stat.size}, age: ${ageMs} ms)`);
}

async function waitForFileAccessible(filePath: string, retries = 10, interval = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      await new Promise((res) => setTimeout(res, interval));
    }
  }
  throw new Error(`File ${filePath} not accessible after ${retries} retries`);
}

async function runFfmpegWithRetry(cmd: string, cwd: string, outputFilePath?: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`▶️ [${new Date().toISOString()}] [ffmpeg attempt ${attempt}] ${cmd}`);
      const { stdout, stderr } = await execAsync(cmd, { cwd });

      if (outputFilePath) {
        await waitForFileAccessible(outputFilePath, 10, 200);
      }

      console.log(`✅ ffmpeg success [attempt ${attempt}]`);
      return { stdout, stderr };
    } catch (e) {
      console.error(`❌ ffmpeg failed [attempt ${attempt}]: ${e instanceof Error ? e.message : String(e)}`);
      if (attempt === 3) throw e;
      console.log('⏳ Waiting 10 sec before retry...');
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  throw new Error('ffmpeg failed after retries');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'Missing videoId in request body' });

    const tmpDir = '/tmp';
    console.log(`🔍 Reading directory: ${tmpDir}`);
    const files = await fs.readdir(tmpDir);

    const videoFiles = files
      .filter(f => f.startsWith(videoId + '_') && f.endsWith('.mp4'))
      .filter(f => f.includes('segment_'))
      .sort((a, b) => {
        const extractNumber = (name: string) => parseInt(name.match(/segment_(\d+)\.mp4/)?.[1] || '0', 10);
        return extractNumber(a) - extractNumber(b);
      })
      .map(f => path.join(tmpDir, f));

    if (videoFiles.length === 0) return res.status(400).json({ error: 'No video segment files found' });
    console.log(`🟢 Found ${videoFiles.length} segment files.`);

    for (const f of videoFiles) await validateFileReady(f);

    const chunks = chunkArray(videoFiles, 30);
    const intermediateFiles: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkListPath = path.join(tmpDir, `${videoId}_chunk_${i}.txt`);
      const chunkOutput = path.join(tmpDir, `${videoId}_chunk_${i}.mp4`);

      const listContent = chunk.map(f => `file '${escapePath(f)}'`).join('\n') + '\n';
      await fs.writeFile(chunkListPath, listContent);
      await waitForFileAccessible(chunkListPath, 10, 100);

      console.log(`[${new Date().toISOString()}] 📝 Chunk ${i + 1}/${chunks.length} list:\n${listContent}`);

      const ffmpegChunkCmd = `ffmpeg -y -f concat -safe 0 -i "${chunkListPath}" -c copy -movflags +faststart "${chunkOutput}"`;
      const { stdout, stderr } = await runFfmpegWithRetry(ffmpegChunkCmd, tmpDir, chunkOutput);

      console.log(`📄 Chunk ${i + 1} ffmpeg stdout:\n${stdout}`);
      console.log(`📄 Chunk ${i + 1} ffmpeg stderr:\n${stderr}`);

      await sleep(10000); // ← この一行を追加：ffmpeg直後に念のため待機
      intermediateFiles.push(chunkOutput);
      await fs.unlink(chunkListPath).catch(() => {});
    }

    for (const f of intermediateFiles) await validateFileReady(f);

    const finalListPath = path.join(tmpDir, `${videoId}_final_list.txt`);
    const finalOutput = path.join(tmpDir, `${videoId}.mp4`);
    const finalListContent = intermediateFiles.map(f => `file '${escapePath(f)}'`).join('\n') + '\n';
    await fs.writeFile(finalListPath, finalListContent);
    await waitForFileAccessible(finalListPath, 10, 100);

    console.log(`[${new Date().toISOString()}] 📝 Final concat list:\n${finalListContent}`);

    const ffmpegFinalCmd = `ffmpeg -y -f concat -safe 0 -i "${finalListPath}" -c copy -movflags +faststart "${finalOutput}"`;
    console.log(`[${new Date().toISOString()}] 🚀 Running final concat...`);
    const { stdout: finalStdout, stderr: finalStderr } = await runFfmpegWithRetry(ffmpegFinalCmd, tmpDir, finalOutput);

    console.log(`✅ Final ffmpeg stdout:\n${finalStdout}`);
    console.log(`✅ Final ffmpeg stderr:\n${finalStderr}`);

    console.log(`⬆️ Uploading final video to Supabase...`);
    const videoBuffer = await fs.readFile(finalOutput);
    const { error: uploadError } = await supabase.storage.from('projects').upload(`${videoId}/${videoId}.mp4`, videoBuffer, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'video/mp4',
    });

    if (uploadError) return res.status(500).json({ error: 'Supabase upload failed', details: uploadError.message });
    console.log(`✅ Upload complete.`);

    await Promise.all([
      ...videoFiles.map(f => fs.unlink(f).catch(() => {})),
      ...intermediateFiles.map(f => fs.unlink(f).catch(() => {})),
      fs.unlink(finalListPath).catch(() => {}),
      fs.unlink(finalOutput).catch(() => {}),
    ]);
    console.log(`🧹 Cleanup completed.`);

    res.status(200).json({
      message: 'Videos concatenated and uploaded successfully',
      outputFileName: `${videoId}.mp4`,
      videoUrl: `${SUPABASE_URL}/storage/v1/object/public/projects/${videoId}/${videoId}.mp4`,
      ffmpegStdout: finalStdout,
      ffmpegStderr: finalStderr,
    });
  } catch (error) {
    console.error('❌ concat-videos error:', error);
    res.status(500).json({
      error: 'Failed to concatenate videos',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}