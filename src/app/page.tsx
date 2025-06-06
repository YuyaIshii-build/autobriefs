'use client';

import InputForm from '../components/InputForm';

export default function Home() {
  const handleNewsSubmit = async (topic: string, videoId: string) => {
    console.log('入力されたトピック:', topic);
    console.log('指定された videoId:', videoId);

    try {
      const response = await fetch('https://primary-production-a9ff9.up.railway.app/webhook/generate-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          topic,
          source: 'ニュースソース（任意固定値）'
        }),
      });

      if (!response.ok) {
        throw new Error('生成に失敗しました');
      }

      const data = await response.json();
      console.log('n8nからのレスポンス:', data);
    } catch (err) {
      console.error('エラー:', err);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">AutoBriefs - ニュース台本生成</h1>
      <InputForm onSubmit={handleNewsSubmit} />
    </main>
  );
}