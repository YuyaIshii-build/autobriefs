'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Pipeline = {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
};

export default function PromptPipelinesPage() {
  const [rows, setRows] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/prompt-pipelines');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Template 管理</h1>
        <Link
          href="/prompt-pipelines/new"
          className="btn-primary text-sm"
        >
          新規作成
        </Link>
      </div>

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-gray-600">まだ登録がありません。</p>
      )}

      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/prompt-pipelines/${p.id}`}
              className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 shadow-sm"
            >
              <span className="font-medium text-gray-900">{p.name}</span>
              <span className="ml-2 text-xs text-gray-500">{p.is_active ? '有効' : '無効'}</span>
              <span className="block text-xs text-gray-500 mt-1">
                更新: {new Date(p.updated_at).toLocaleString('ja-JP')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
