// src/app/market-article/page.tsx

'use client';

import { useState } from 'react';

import InputForm from '@/components/InputForm';
import LegacyToolShell from '@/components/service/LegacyToolShell';

export default function  MarketArticlePage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (topic: string, videoId: string) => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('https://primary-production-a9ff9.up.railway.app/webhook/market-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, videoId }), // ✅ 修正点：text → topic
      });

      if (res.ok) {
        setMessage(`送信が完了しました！（ID: ${videoId}）`);
      } else {
        setMessage('送信に失敗しました。');
      }
    } catch (error) {
      console.error('送信エラー:', error);
      setMessage('送信中にエラーが発生しました。');
    }

    setLoading(false);
  };

  return (
    <LegacyToolShell title="経済情報解説">
      <h1 className="text-2xl font-bold mb-4 text-slate-900">経済情報解説動画の生成</h1>
      <InputForm onSubmit={handleSubmit} />
      {loading && <p className="mt-4 text-slate-600">送信中です…</p>}
      {message && <p className="mt-4 text-slate-800">{message}</p>}
    </LegacyToolShell>
  );
}