'use client';

import { useState } from 'react';

type Props = {
  onSubmit: (text: string) => void;
};

export default function InputForm({ onSubmit }: Props) {
  const [topic, setTopic] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(topic);
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
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        台本を生成
      </button>
    </form>
  );
}