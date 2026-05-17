'use client';

import Link from 'next/link';

import AdminShell from '@/components/service/AdminShell';
import { useIsAdmin } from '@/components/service/AdminProvider';

const legacyTools = [
  {
    href: '/conversation-news',
    title: '企業ニュース解説動画',
    description: '企業ニュースを元に解説動画を生成（Legacy）',
  },
  {
    href: '/conversation-market',
    title: 'デイリー東京市場解説',
    description: '日経オンラインの市況まとめ記事を送信（Legacy）',
  },
  {
    href: '/market-article',
    title: '経済情報解説動画',
    description: '経済情報を元に解説動画を生成（Legacy）',
  },
  {
    href: '/structure-theme',
    title: '業界構造解説動画',
    description: '業界定義・構造的切り口の整理（Legacy）',
  },
  {
    href: '/intro-video',
    title: 'ニュース解説動画作成',
    description: 'イントロ用タイトル・説明・サムネ案（Legacy）',
  },
  {
    href: '/money-failure',
    title: 'お金の失敗ストーリー',
    description: 'ストーリー動画用入力（Legacy）',
  },
];

export default function AdminHomePage() {
  const { isAdmin, loading } = useIsAdmin();

  return (
    <AdminShell title="ホーム">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">管理者コンソール</h1>
      <p className="text-sm text-slate-600 mb-8">
        Template・Prompt Block・Legacy 動画ワークフロー・ジョブ詳細はここから操作します。一般ユーザー画面には表示されません。
      </p>

      {!loading && !isAdmin && (
        <p className="mb-6 text-sm text-slate-600">
          閲覧のみ可能です。Admin 機能を有効にするには環境変数を設定してください。
        </p>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Brief 基盤</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <AdminCard
            href="/prompt-pipelines"
            title="Template 管理"
            description="Brief Type（パイプライン）と Step のメンテナンス"
          />
          <AdminCard
            href="/prompt-blocks"
            title="Prompt Block 管理"
            description="再利用プロンプト部品の登録・スコープ設定"
          />
          <AdminCard
            href="/briefs"
            title="Jobs / Archive（詳細）"
            description="生成ジョブ一覧・ステータス・エラー・n8n 連携結果"
          />
        </ul>
      </section>

      <section id="legacy">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Legacy 動画生成</h2>
        <p className="text-sm text-slate-500 mb-3">旧 YouTube 向けワークフロー（削除せず Admin のみから案内）</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {legacyTools.map((item) => (
            <AdminCard key={item.href} href={item.href} title={item.title} description={item.description} />
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}

function AdminCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block h-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400 hover:shadow transition-all"
      >
        <span className="font-medium text-slate-900">{title}</span>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </Link>
    </li>
  );
}
