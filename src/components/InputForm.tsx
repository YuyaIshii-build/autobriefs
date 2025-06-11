'use client';

import { useState } from 'react';

type Props = {
  onSubmit: (topic: string, videoId: string) => Promise<void> | void;
};

export default function InputForm({ onSubmit }: Props) {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);

  const generateTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const hour = pad(now.getHours());
    const minute = pad(now.getMinutes());
    return `${year}${month}${day}${hour}${minute}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      alert('ニュース記事やトピックを入力してください');
      return;
    }

    setLoading(true);
    const videoId = generateTimestamp();

    try {
      await onSubmit(topic, videoId);
    } finally {
      setLoading(false);
    }
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
        disabled={loading}
      />

      <button
        type="submit"
        disabled={loading}
        className={`px-4 py-2 rounded text-white ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        {loading ? '生成中' : '動画生成'}
      </button>
    </form>
  );
}