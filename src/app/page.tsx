'use client';

import InputForm from '../components/InputForm';

export default function Home() {
  const handleNewsSubmit = (text: string) => {
    console.log('入力されたニュース記事:', text);
    // 今後ここでn8n呼び出しや台本生成に進む
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">AutoBriefs - ニュース台本生成</h1>
      <InputForm onSubmit={handleNewsSubmit} />
    </main>
  );
}