'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Pipeline = {
  id: string;
  name: string;
  description: string;
  use_case: string;
  output_type: string;
  is_active: boolean;
};

type Module = {
  id: string;
  name: string;
  step_order: number;
  is_active: boolean;
};

export default function PromptPipelineDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [p, setP] = useState<Pipeline | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [pr, mr] = await Promise.all([
          fetch(`/api/prompt-pipelines/${id}`),
          fetch(`/api/prompt-pipelines/${id}/modules`),
        ]);
        const pj = await pr.json();
        const mj = await mr.json();
        if (!pr.ok) throw new Error(pj.error || 'テンプレートの読み込みに失敗');
        if (!mr.ok) throw new Error(mj.error || 'ステップの読み込みに失敗');
        if (!cancelled) {
          setP(pj);
          setModules(mj);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-gray-600">無効な URL です。</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        href="/prompt-pipelines"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        ← Template 一覧
      </Link>
      <AdminTemplateBanner />

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {p && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{p.is_active ? '有効' : '無効'} · {p.output_type}</p>
              {p.description && <p className="text-gray-700 mt-3 whitespace-pre-wrap">{p.description}</p>}
              {p.use_case && <p className="text-sm text-gray-600 mt-2">用途: {p.use_case}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href={`/prompt-pipelines/${id}/edit`}
                className="px-4 py-2 rounded border border-gray-300 text-sm text-center hover:bg-gray-50"
              >
                Template を編集
              </Link>
              <Link
                href={`/prompt-pipelines/${id}/modules/new`}
                className="btn-primary text-sm text-center"
              >
                ステップを追加
              </Link>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-gray-900 mb-1">プロンプト手順（ステップ）</h2>
          <p className="text-xs text-gray-500 mb-3">一覧では名前と順序のみ表示します。詳細は各ステップの編集画面で確認・変更できます。</p>
          {modules.length === 0 ? (
            <p className="text-gray-600 text-sm">ステップがまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {modules.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/prompt-pipelines/${id}/modules/${m.id}/edit`}
                    className="block p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 shadow-sm text-sm"
                  >
                    <span className="font-medium text-gray-900">{m.name}</span>
                    <span className="text-gray-500 ml-2">順序 {m.step_order}</span>
                    <span className="text-gray-400 ml-2">{m.is_active ? '' : '（無効）'}</span>
                  </Link>
                  <Link
                    href={`/prompt-pipelines/${id}/modules/${m.id}/blocks`}
                    className="block mt-1 text-xs text-blue-700 hover:underline"
                  >
                    Block 構成を編集
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
