'use client';

import { useState } from 'react';
import Link from 'next/link';

const mainMenuItems = [
  {
    href: '/conversation-news',
    title: '企業ニュース解説動画の生成',
    description: '企業ニュースを元に解説動画を生成',
    icon: '🏢',
  },
  {
    href: '/conversation-market',
    title: 'デイリー東京市場の解説動画の生成',
    description: '日経オンラインの市況まとめ記事を送信',
    icon: '📈',
  },
  {
    href: '/market-article',
    title: '経済情報解説動画の生成',
    description: '経済情報を元に解説動画を生成',
    icon: '📊',
  },
  {
    href: '/structure-theme',
    title: '業界構造解説動画の生成',
    description: '業界定義・構造的切り口・影響整理を送信',
    icon: '🧠',
  },
];

const accordionMenuItems = [
  {
    href: '/intro-video',
    title: 'ニュース解説動画作成',
    description: 'トピックからイントロ用のタイトル・説明・サムネ案を生成',
    icon: '🎬',
  },
  {
    href: '/money-failure',
    title: 'お金の失敗ストーリー動画生成',
    description: 'お金の失敗ストーリー動画用の入力を送信',
    icon: '💰',
  },
];

function MenuLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
    >
      <span className="text-2xl mr-3">{icon}</span>
      <span className="font-semibold text-gray-900">{title}</span>
      <p className="mt-1 ml-9 text-sm text-gray-500">{description}</p>
    </Link>
  );
}

export default function Home() {
  const [accordionOpen, setAccordionOpen] = useState(false);

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col">
      <div className="max-w-2xl mx-auto px-6 py-12 flex-1 w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AutoBriefs</h1>
        <p className="text-gray-600 mb-6">動画生成メニューから使いたい機能を選んでください。</p>

        {/* 使い方の注意 */}
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <p className="font-medium mb-1">💡 使い方</p>
          <p>記事やテキストを入力して送信すると、動画生成がバックグラウンドで開始されます。完了まで数分〜十数分かかることがあります。</p>
        </div>

        <nav className="space-y-3">
          {mainMenuItems.map((item) => (
            <MenuLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              title={item.title}
              description={item.description}
            />
          ))}

          {/* アコーディオン：あまり使わない機能 */}
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setAccordionOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              aria-expanded={accordionOpen}
            >
              <span className="font-semibold text-gray-700">その他の機能</span>
              <span
                className={`text-gray-500 transition-transform ${accordionOpen ? 'rotate-180' : ''}`}
                aria-hidden
              >
                ▼
              </span>
            </button>
            {accordionOpen && (
              <div className="border-t border-gray-200 px-4 pb-4 pt-2 space-y-3">
                {accordionMenuItems.map((item) => (
                  <MenuLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* YouTube チャンネル */}
        <a
          href="https://www.youtube.com/channel/UCSxL2p6ktQeIkX45yg5BnHw"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center gap-4 p-4 rounded-xl bg-[#0f0f0f] text-white hover:bg-[#272727] transition-colors group"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#ff0000] text-2xl" aria-hidden>
            ▶
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white group-hover:text-[#ff0000] transition-colors">YouTube チャンネル</p>
            <p className="text-sm text-gray-400 truncate">投資情報を整理する</p>
          </div>
          <span className="shrink-0 text-gray-500 group-hover:text-white transition-colors" aria-hidden>→</span>
        </a>

        {/* フッター */}
        <footer className="mt-16 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>AutoBriefs — 解説動画の生成は送信後、バックグラウンドで処理されます。</p>
        </footer>
      </div>
    </main>
  );
}
