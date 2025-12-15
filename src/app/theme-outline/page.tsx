'use client';

import { useState } from 'react';

export default function NightThemePage() {
  const [themeText, setThemeText] = useState('');
  const [videoId, setVideoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (!themeText || !videoId) {
      setMessage('テーマテキストとVideo IDを入力してください。');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await fetch(
        'https://primary-production-a9ff9.up.railway.app/webhook/theme-outline',
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
        setThemeText('');
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
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🌙 夜動画テーマ入力（構造解説）</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Video ID
        </label>
        <input
          type="text"
          value={videoId}
          onChange={(e) => setVideoId(e.target.value)}
          placeholder="例: 202512141649"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          THEME_TEXT（業界定義・構造切り口）
        </label>
        <textarea
          value={themeText}
          onChange={(e) => setThemeText(e.target.value)}
          placeholder="ここに THEME_TEXT をそのままコピペしてください"
          rows={18}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? '送信中…' : '骨組み生成をキック'}
      </button>

      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}