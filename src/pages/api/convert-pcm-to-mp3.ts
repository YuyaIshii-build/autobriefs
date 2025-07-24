// pages/api/convert-pcm-to-mp3.ts

import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Body parserを無効化（formidableを使うため）
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uploadDir = '/tmp';
  const form = formidable({ uploadDir, keepExtensions: true });

  // ファイルだけを取得（fieldsは不要なので無視）
  const files = await new Promise<formidable.Files>((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) reject(err);
      else resolve(files);
    });
  });

  const pcmFile = Array.isArray(files.pcm) ? files.pcm[0].filepath : files.pcm?.filepath
    || Array.isArray(files.file) ? files.file[0].filepath : files.file?.filepath;

  if (!pcmFile) {
    return res.status(400).json({ error: 'No PCM file uploaded' });
  }

  const mp3Path = path.join(uploadDir, `converted-${Date.now()}.mp3`);

  try {
    // ffmpegでPCMからMP3へ変換（24kHz, mono）
    await execAsync(
      `ffmpeg -f s16le -ar 24000 -ac 1 -i "${pcmFile}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}"`
    );

    const mp3Buffer = fs.readFileSync(mp3Path);
    const base64 = mp3Buffer.toString('base64');

    // 後片付け
    fs.unlinkSync(pcmFile);
    fs.unlinkSync(mp3Path);

    res.status(200).json({ mp3Base64: base64 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Conversion failed' });
  }
}