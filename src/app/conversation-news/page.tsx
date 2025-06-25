// src/app/conversation-news/page.tsx
'use client';

import { useState } from 'react';

export default function ConversationNewsPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const res = await fetch('primary-production-a9ff9.up.railway.app/webhook/conversation-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input }),
    });

    if (res.ok) {
      setMessage('送信が完了しました！');
      setInput('');
    } else {
      setMessage('送信に失敗しました。');
    }

    setLoading(false);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🗣 会話形式ニュース生成</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          className="w-full border p-2 h-48"
          placeholder="ニュース記事をペーストしてください"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '送信中...' : '送信'}
        </button>
      </form>
      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}