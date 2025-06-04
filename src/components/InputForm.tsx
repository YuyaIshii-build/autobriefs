'use client';

import { useState } from 'react';

type NewsInputFormProps = {
  onSubmit: (topic: string) => Promise<string>;
};

export default function NewsInputForm({ onSubmit }: NewsInputFormProps) {
  const [topic, setTopic] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponse(null);

    try {
      const result = await onSubmit(topic);
      setResponse(result);
    } catch (error) {
      console.error('Error:', error);
      setResponse('エラーが発生しました。');
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
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? '生成中...' : '台本を生成'}
      </button>

      {response && (
        <div className="mt-4 p-4 border rounded bg-gray-50 whitespace-pre-wrap">
          {response}
        </div>
      )}
    </form>
  );
}