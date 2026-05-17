// src/app/conversation-market/page.tsx

'use client';

import { useState } from 'react';

import InputForm from '@/components/InputForm';
import LegacyToolShell from '@/components/service/LegacyToolShell';

export default function ConversationMarketPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (topic: string, videoId: string) => {
    setLoading(true);
    setMessage('');

    try {
      // 市場定点観測（骨格生成）用Webhook
      // ※実際のn8n側のWebhookパス名に合わせて必要ならここだけ変更してください
      const res = await fetch(
        'https://primary-production-a9ff9.up.railway.app/webhook/conversation-market',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, videoId }),
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
    <LegacyToolShell title="デイリー東京市場">
      <h1 className="text-2xl font-bold mb-2 text-slate-900">デイリー東京市場の解説動画の生成</h1>
      <p className="text-sm text-slate-600 mb-4">
        日経オンラインの市況まとめ記事（本文）を貼り付けて送信してください。
        <br />
        ※入力欄の「topic」はこの記事本文として扱います。
      </p>
      <InputForm onSubmit={handleSubmit} />
      {loading && <p className="mt-4 text-slate-600">送信中です…</p>}
      {message && <p className="mt-4 text-slate-800">{message}</p>}
    </LegacyToolShell>
  );
}