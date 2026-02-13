'use client';

import { useState } from 'react';
import Link from 'next/link';
import InputForm from '@/components/InputForm';

export default function StructureThemePage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (themeText: string, videoId: string) => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch(
        'https://primary-production-a9ff9.up.railway.app/webhook/structure-theme',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            themeText,
            videoId,
          }),
        }
      );

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
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        ← ホームへ戻る
      </Link>
      <h1 className="text-2xl font-bold mb-2">🧠 業界構造解説動画の生成</h1>
      <p className="text-sm text-gray-600 mb-4">
        業界定義・構造的切り口・影響整理（THEME_TEXT）をそのまま貼り付けてください
      </p>

      <InputForm onSubmit={handleSubmit} />

      {loading && <p className="mt-4 text-gray-600">送信中です…</p>}
      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}