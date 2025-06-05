'use client';

import InputForm from '../components/InputForm';

export default function Home() {
  const handleNewsSubmit = (topic: string, videoId: string) => {
    console.log('入力されたトピック:', topic);
    console.log('指定された videoId:', videoId);

    // ★ このあと fetch で n8n に送信できる
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">AutoBriefs - ニュース台本生成</h1>
      <InputForm onSubmit={handleNewsSubmit} />
    </main>
  );
}