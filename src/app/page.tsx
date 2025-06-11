'use client';

import { useState } from 'react';
import InputForm from '../components/InputForm';
import SuggestionsDisplay from '../components/SuggestionsDisplay';

export default function Home() {
  const [titles, setTitles] = useState<string[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const handleNewsSubmit = async (topic: string, videoId: string) => {
    try {
      const response = await fetch('https://primary-production-a9ff9.up.railway.app/webhook/generate-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, topic, source: 'ニュースソース（任意固定値）' }),
      });

      if (!response.ok) throw new Error('生成に失敗しました');

      const data = await response.json();

      // 例: n8nから返るデータが { titles: [], descriptions: [], thumbnails: [] } なら
      setTitles(data.titles ?? []);
      setDescriptions(data.descriptions ?? []);
      setThumbnails(data.thumbnails ?? []);

    } catch (err) {
      console.error('エラー:', err);
      setTitles([]);
      setDescriptions([]);
      setThumbnails([]);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">AutoBriefs - ニュース解説動画作成</h1>
      <InputForm onSubmit={handleNewsSubmit} />

      <SuggestionsDisplay
        titles={titles}
        descriptions={descriptions}
        thumbnails={thumbnails}
      />
    </main>
  );
}