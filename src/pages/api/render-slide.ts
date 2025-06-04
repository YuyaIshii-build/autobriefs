// src/pages/api/render-slide.ts

import puppeteer from 'puppeteer';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { html } = req.body;

    if (!html || typeof html !== 'string') {
      console.error('Invalid or missing HTML:', html);
      return res.status(400).json({ error: 'Missing or invalid HTML content' });
    }

    const browser = await puppeteer.launch({
      headless: 'new', // puppeteer v20以降推奨設定
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1080, height: 1920 });

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const imageBuffer = await page.screenshot({
      type: 'png',
      fullPage: false, // スライドの場合 false の方が期待に近いことが多い
    });

    await browser.close();

    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(imageBuffer);
  } catch (error: any) {
    console.error('Rendering failed:', error.message || error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}