import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { videoId, segmentId } = req.body;

  if (!videoId || !segmentId) {
    return res.status(400).json({ error: 'Missing videoId or segmentId' });
  }

  res.status(202).json({ message: 'Duration extraction started', videoId, segmentId });

  setImmediate(async () => {
    try {
      const tempDir = `/tmp/${videoId}/${segmentId}`;
      await fs.mkdir(tempDir, { recursive: true });

      // 1. audio.mp3 を Supabase から取得して保存
      const mp3Path = path.join(tempDir, 'audio.mp3');
      const { data, error } = await supabase.storage
        .from('projects')
        .download(`${videoId}/${segmentId}/audio.mp3`);

      if (error || !data) {
        throw new Error(`Failed to download audio.mp3: ${error?.message}`);
      }

      await fs.writeFile(mp3Path, Buffer.from(await data.arrayBuffer()));

      // 2. duration を ffprobe で取得
      const { stdout: durationStr } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3Path}"`
      );

      const duration = parseFloat(durationStr.trim());

      // 3. duration.txt を作成して Supabase にアップロード
      const durationTxt = `${duration.toFixed(2)}\n`;
      const durationFilePath = path.join(tempDir, 'duration.txt');
      await fs.writeFile(durationFilePath, durationTxt, 'utf-8');

      const { error: uploadError } = await supabase.storage
        .from('projects')
        .upload(`${videoId}/${segmentId}/duration.txt`, Buffer.from(durationTxt), {
          contentType: 'text/plain',
          upsert: true,
        });

      if (uploadError) {
        console.error('❌ Failed to upload duration.txt:', uploadError.message);
      } else {
        console.log(`✅ Uploaded duration.txt (${durationTxt.trim()}) for ${segmentId}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('❌ Failed to extract duration:', message);
    }
  });
}