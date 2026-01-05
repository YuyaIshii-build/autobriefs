// pages/api/concat-videos-only.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = util.promisify(exec);

/* -----------------------------
   Utilities（既存そのまま）
------------------------------ */

function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

const escapePath = (p: string) => p.replace(/'/g, "'\\''");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function validateFileReady(filePath: string, retries = 10, interval = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await waitForFileAccessible(filePath, 10, 200);
      const stat = await fs.stat(filePath);
      const ageMs = Date.now() - stat.mtimeMs;

      if (stat.size === 0) throw new Error('File is empty');
      if (ageMs < 5000) throw new Error('File is too new');

      return;
    } catch {
      if (i === retries - 1) {
        throw new Error(`File ${filePath} not ready after ${retries} attempts`);
      }
      await sleep(interval);
    }
  }
}

async function runFfmpegWithRetry(cmd: string, cwd: string, outputFilePath?: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd });
      if (outputFilePath) {
        await waitForFileAccessible(outputFilePath, 10, 200);
      }
      return { stdout, stderr };
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(10000);
    }
  }
  throw new Error('ffmpeg failed after retries');
}

/* -----------------------------
   API Handler（concat-only）
------------------------------ */

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
      .filter(f => f.startsWith(videoId + '_'))
      .filter(f => f.includes('segment_'))
      .filter(f => f.endsWith('.mp4'))
      .sort((a, b) => {
        const getNum = (s: string) =>
          parseInt(s.match(/segment_(\d+)\.mp4/)?.[1] || '0', 10);
        return getNum(a) - getNum(b);
      })
      .map(f => path.join(tmpDir, f));

    if (videoFiles.length === 0) {
      return res.status(400).json({ error: 'No video segment files found' });
    }

    for (const f of videoFiles) {
      await validateFileReady(f);
    }

    const chunks = chunkArray(videoFiles, 30);
    const intermediateFiles: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const listPath = path.join(tmpDir, `${videoId}_chunk_${i}.txt`);
      const outputPath = path.join(tmpDir, `${videoId}_chunk_${i}.mp4`);

      const listContent = chunk.map(f => `file '${escapePath(f)}'`).join('\n') + '\n';
      await fs.writeFile(listPath, listContent);
      await waitForFileAccessible(listPath);

      const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${outputPath}"`;
      await runFfmpegWithRetry(cmd, tmpDir, outputPath);

      intermediateFiles.push(outputPath);
      await fs.unlink(listPath).catch(() => {});
      await sleep(5000);
    }

    for (const f of intermediateFiles) {
      await validateFileReady(f);
    }

    const finalListPath = path.join(tmpDir, `${videoId}_final_list.txt`);
    const finalOutput = path.join(tmpDir, `${videoId}.mp4`);
    const finalListContent =
      intermediateFiles.map(f => `file '${escapePath(f)}'`).join('\n') + '\n';

    await fs.writeFile(finalListPath, finalListContent);
    await waitForFileAccessible(finalListPath);

    const finalCmd = `ffmpeg -y -f concat -safe 0 -i "${finalListPath}" -c copy -movflags +faststart "${finalOutput}"`;
    await runFfmpegWithRetry(finalCmd, tmpDir, finalOutput);

    /* -----------------------------
       Cleanup（最終動画以外）
    ------------------------------ */
    await Promise.all([
      ...videoFiles.map(f => fs.unlink(f).catch(() => {})),
      ...intermediateFiles.map(f => fs.unlink(f).catch(() => {})),
      fs.unlink(finalListPath).catch(() => {}),
    ]);

    return res.status(200).json({
      message: 'Videos concatenated successfully',
      videoId,
      outputPath: finalOutput,
    });
  } catch (error) {
    console.error('❌ concat-videos-only error:', error);
    return res.status(500).json({
      error: 'Failed to concatenate videos',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}