'use client';

import { useState } from 'react';

type Props = {
  onSubmit: (topic: string, videoId: string) => void;
};

export default function InputForm({ onSubmit }: Props) {
  const [topic, setTopic] = useState('');
  const [videoId, setVideoId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoId.trim()) {
      alert('videoId を入力してください');
      return;
    }
    onSubmit(topic, videoId);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <textarea
        placeholder="ニュース記事やトピックを入力"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="w-full p-2 border rounded"
        rows={5}
        required
      />

      <input
        type="text"
        placeholder="videoId（例: nintendo-20240605）"
        value={videoId}
        onChange={(e) => setVideoId(e.target.value)}
        className="w-full p-2 border rounded"
        required
      />

      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        台本を生成
      </button>
    </form>
  );
}