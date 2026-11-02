import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

import { parseSlideRenderStatus, slideRenderStatusPath } from '@/lib/slides/segment-render-queue';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = typeof req.query.videoId === 'string' ? req.query.videoId : '';
  const segmentId = typeof req.query.segmentId === 'string' ? req.query.segmentId : '';
  const path = slideRenderStatusPath(videoId, segmentId);
  if (!path) return res.status(400).json({ error: 'invalid_id' });

  const downloaded = await supabase.storage.from('projects').download(path);
  if (downloaded.error || !downloaded.data) {
    if (isMissing(downloaded.error)) {
      return res.status(404).json({ videoId, segmentId, state: 'absent' });
    }
    return res.status(503).json({ error: 'status_read_failed' });
  }

  const parsed = parseSlideRenderStatus(await downloaded.data.text());
  if (parsed.state === 'success') {
    return res.status(200).json({ videoId, segmentId, state: 'success' });
  }
  if (parsed.state === 'failed') {
    return res.status(500).json({ videoId, segmentId, state: 'failed', error: parsed.error ?? 'render_failed' });
  }
  if (parsed.state === 'queued' || parsed.state === 'rendering') {
    return res.status(202).json({ videoId, segmentId, state: parsed.state });
  }
  return res.status(404).json({ videoId, segmentId, state: 'absent' });
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const record = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (record.status === 404 || record.statusCode === 404) return true;
  return typeof record.message === 'string' && /not found/i.test(record.message);
}
