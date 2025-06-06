// pages/api/test-ffmpeg.ts
import { exec } from 'child_process';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: stderr });
      return;
    }
    res.status(200).json({ version: stdout });
  });
}