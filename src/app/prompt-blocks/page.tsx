'use client';

import { PROMPT_BLOCK_CATEGORIES } from '@/lib/brief/prompt-block-scope';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Block = {
  id: string;
  name: string;
  block_key: string;
  block_type: string;
  scope_type: string;
  category: string;
  content_target: string;
  is_active: boolean;
  updated_at: string;
};

export default function PromptBlocksPage() {
  const [rows, setRows] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fScope, setFScope] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fContentTarget, setFContentTarget] = useState('');

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fScope) qs.set('scope_type', fScope);
    if (fCategory) qs.set('category', fCategory);
    if (fContentTarget) qs.set('content_target', fContentTarget);
    const q = qs.toString();
    const res = await fetch(q ? `/api/prompt-blocks?${q}` : '/api/prompt-blocks');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
    setRows(data);
  }, [fScope, fCategory, fContentTarget]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Prompt Block 管理</h1>
        <Link
          href="/prompt-blocks/new"
          className="btn-primary text-sm"
        >
          新規作成
        </Link>
      </div>

      <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm text-sm">
        <p className="font-medium text-gray-800 mb-2">フィルタ</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">scope_type</label>
            <select
              className="p-2 border border-gray-300 rounded"
              value={fScope}
              onChange={(e) => setFScope(e.target.value)}
            >
              <option value="">（すべて）</option>
              <option value="global">global（全テンプレ共通）</option>
              <option value="template">template（Template内共通）</option>
              <option value="step">step（Step専用）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">category</label>
            <select
              className="p-2 border border-gray-300 rounded min-w-[10rem]"
              value={fCategory}
              onChange={(e) => setFCategory(e.target.value)}
            >
              <option value="">（すべて）</option>
              {PROMPT_BLOCK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">content_target</label>
            <select
              className="p-2 border border-gray-300 rounded"
              value={fContentTarget}
              onChange={(e) => setFContentTarget(e.target.value)}
            >
              <option value="">（すべて）</option>
              <option value="system">system</option>
              <option value="user">user</option>
            </select>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50"
            onClick={() => {
              setFScope('');
              setFCategory('');
              setFContentTarget('');
            }}
          >
            クリア
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          UI上「Template内で共通」は DB では template（module_id なし）です。
        </p>
      </div>

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && rows.length === 0 && <p className="text-gray-600">該当する Block がありません。</p>}

      <ul className="space-y-2">
        {rows.map((b) => (
          <li key={b.id}>
            <Link
              href={`/prompt-blocks/${b.id}/edit`}
              className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 shadow-sm"
            >
              <span className="font-medium text-gray-900">{b.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {b.scope_type} · {b.category} · {b.content_target}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {b.block_key} · {b.block_type || '—'}
              </span>
              <span className="ml-2 text-xs text-gray-500">{b.is_active ? '有効' : '無効'}</span>
              <span className="block text-xs text-gray-500 mt-1">
                更新: {new Date(b.updated_at).toLocaleString('ja-JP')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
