// src/app/conversation-news/page.tsx

'use client';

import { useState } from 'react';
import InputForm from '@/components/InputForm'; // ← src/components からのimport

export default function ConversationNewsPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (topic: string, videoId: string) => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('https://primary-production-a9ff9.up.railway.app/webhook/conversation-news', {
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
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🗣 会話形式ニュース生成</h1>

      <InputForm onSubmit={handleSubmit} />

      {loading && <p className="mt-4 text-gray-600">送信中です…</p>}
      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}