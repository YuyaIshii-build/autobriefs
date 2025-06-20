// pages/api/generate-video.ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[generate-video] Start handler');

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slideUrl, audioUrl, subtitleUrl, videoId, segmentId, outputFileName } = req.body;

    console.log('[generate-video] Params:', { slideUrl, audioUrl, subtitleUrl, videoId, segmentId });

    if (!slideUrl || !audioUrl || !videoId || !segmentId) {
      console.warn('[generate-video] Missing parameters');
      return res.status(400).json({ error: 'Missing required parameters (slideUrl, audioUrl, videoId, segmentId)' });
    }

    const slidePath = path.join('/tmp', `${videoId}_${segmentId}_slide.png`);
    const audioPath = path.join('/tmp', `${videoId}_${segmentId}_audio.mp3`);
    const subtitlePath = subtitleUrl ? path.join('/tmp', `${videoId}_${segmentId}_subtitle.srt`) : null;
    const outputName = outputFileName || `${videoId}_${segmentId}.mp4`;
    const outputPath = path.join('/tmp', outputName);

    // 1. Download slide
    console.log('[generate-video] Fetching slide...');
    const slideRes = await fetch(slideUrl);
    if (!slideRes.ok) throw new Error('Failed to fetch slide image');
    const slideBuffer = await slideRes.arrayBuffer();
    await fs.writeFile(slidePath, Buffer.from(slideBuffer));
    console.log('[generate-video] Slide downloaded');

    // 2. Download audio
    console.log('[generate-video] Fetching audio...');
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error('Failed to fetch audio file');
    const audioBuffer = await audioRes.arrayBuffer();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    console.log('[generate-video] Audio downloaded');

    // 3. Download subtitle (optional)
    if (subtitleUrl && subtitlePath) {
      console.log('[generate-video] Fetching subtitle...');
      const subtitleRes = await fetch(subtitleUrl);
      if (!subtitleRes.ok) throw new Error('Failed to fetch subtitle file');
      const subtitleText = await subtitleRes.text();
      await fs.writeFile(subtitlePath, subtitleText, 'utf-8');
      console.log('[generate-video] Subtitle downloaded');
    }

    // 4. ffprobe duration
    console.log('[generate-video] Running ffprobe...');
    const { stdout: durationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    const duration = parseFloat(durationStdout.trim());
    if (isNaN(duration)) throw new Error('Failed to parse audio duration');
    console.log(`[generate-video] Audio duration: ${duration}s`);

    // 5. Build ffmpeg command
    let cmd = `ffmpeg -y -loop 1 -i "${slidePath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${duration}`;
    if (subtitlePath) {
      cmd += ` -vf subtitles='${subtitlePath}'`;
    }
    cmd += ` "${outputPath}"`;

    console.log('[generate-video] Executing ffmpeg:', cmd);
    await execAsync(cmd);
    console.log('[generate-video] ffmpeg completed');

    // 6. Clean up
    await Promise.all([
      fs.unlink(slidePath).catch(() => {}),
      fs.unlink(audioPath).catch(() => {}),
      subtitlePath ? fs.unlink(subtitlePath).catch(() => {}) : Promise.resolve(),
    ]);
    console.log('[generate-video] Cleanup completed');

    // 7. Respond
    res.status(200).json({
      message: 'Segment video generated and saved',
      outputFileName: outputName,
      outputPath,
      videoId,
      segmentId,
    });

  } catch (err) {
    console.error('[generate-video] Unexpected error:', err);
    if (res.headersSent) return;
    res.status(500).json({
      error: 'Unexpected error',
      details: err instanceof Error ? err.message : err,
    });
  }
}