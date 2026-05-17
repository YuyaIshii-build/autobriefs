'use client';

import { useState } from 'react';

import InputForm from '@/components/InputForm';
import LegacyToolShell from '@/components/service/LegacyToolShell';

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
    <LegacyToolShell title="業界構造解説">
      <h1 className="text-2xl font-bold mb-2 text-slate-900">業界構造解説動画の生成</h1>
      <p className="text-sm text-slate-600 mb-4">
        業界定義・構造的切り口・影響整理（THEME_TEXT）をそのまま貼り付けてください
      </p>
      <InputForm onSubmit={handleSubmit} />
      {loading && <p className="mt-4 text-slate-600">送信中です…</p>}
      {message && <p className="mt-4 text-slate-800">{message}</p>}
    </LegacyToolShell>
  );
}