'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type PromptBlock = {
  id: string;
  name: string;
  block_key: string;
  scope_type?: string;
  category?: string;
  content_target: string;
  is_active: boolean;
};

type ComposedPreview = {
  composed_system_prompt: string;
  composed_user_prompt: string;
  mode: 'blocks' | 'legacy_fallback';
};

type Row = {
  id: string;
  module_id: string;
  block_id: string;
  sort_order: number;
  prompt_block: PromptBlock | null;
};

export default function ModuleBlocksPage() {
  const params = useParams();
  const pipelineId = typeof params?.id === 'string' ? params.id : '';
  const moduleId = typeof params?.moduleId === 'string' ? params.moduleId : '';

  const [rows, setRows] = useState<Row[]>([]);
  const [allBlocks, setAllBlocks] = useState<PromptBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addBlockId, setAddBlockId] = useState('');
  const [addSort, setAddSort] = useState(1);
  const [adding, setAdding] = useState(false);

  const [preview, setPreview] = useState<ComposedPreview | null>(null);
  const [previewError, setPreviewError] = useState('');

  const load = useCallback(async () => {
    if (!moduleId || !pipelineId) return;
    setPreview(null);
    setPreviewError('');
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/prompt-modules/${moduleId}/blocks`),
      fetch(
        `/api/prompt-blocks?eligible_pipeline_id=${encodeURIComponent(pipelineId)}&eligible_module_id=${encodeURIComponent(moduleId)}`
      ),
      fetch(`/api/prompt-modules/${moduleId}/composed-preview`),
    ]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    const j3 = await r3.json();
    if (!r1.ok) throw new Error(j1.error || '紐づけの読み込みに失敗');
    if (!r2.ok) throw new Error(j2.error || 'Block 一覧の読み込みに失敗');
    if (!r3.ok) {
      setPreview(null);
      setPreviewError(j3.error || '合成プレビューの取得に失敗しました');
    } else {
      setPreview(j3 as ComposedPreview);
    }
    setRows(j1);
    setAllBlocks(j2);
    const maxSo = (j1 as Row[]).reduce((m, x) => Math.max(m, x.sort_order), 0);
    setAddSort(maxSo + 1);
  }, [moduleId, pipelineId]);

  useEffect(() => {
    if (!moduleId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
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
  }, [moduleId, load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addBlockId) {
      setError('追加する Block を選択してください');
      return;
    }
    setError('');
    setAdding(true);
    try {
      const res = await fetch(`/api/prompt-modules/${moduleId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id: addBlockId, sort_order: addSort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '追加に失敗しました');
      await load();
      setAddBlockId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const updateSort = async (linkId: string, sort_order: number) => {
    setError('');
    try {
      const res = await fetch(`/api/prompt-module-blocks/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新に失敗しました');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeLink = async (linkId: string) => {
    if (!confirm('この紐づけを削除しますか？')) return;
    setError('');
    try {
      const res = await fetch(`/api/prompt-module-blocks/${linkId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!pipelineId || !moduleId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-gray-600">無効な URL です。</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href={`/prompt-pipelines/${pipelineId}/modules/${moduleId}/edit`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        ← ステップの編集
      </Link>
      <AdminTemplateBanner />
      <h1 className="text-2xl font-bold mb-2 text-gray-900">ステップの Block 構成</h1>
      <p className="text-sm text-gray-600 mb-6">
        sort_order 昇順で system / user それぞれ連結され、n8n へ送る composed プロンプトに反映されます。
      </p>

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {!loading && previewError && (
        <p className="text-amber-800 text-sm mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          合成プレビュー: {previewError}
        </p>
      )}

      {!loading && preview && (
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">合成プロンプト（プレビュー）</h2>
          <p className="text-xs text-gray-600 mb-3">
            generation_jobs と同じ合成ルールです。読み取り専用・OpenAI は呼びません。
          </p>
          <p className="text-sm text-gray-800 mb-4">
            <span className="font-medium text-gray-700">現在の合成モード：</span>
            {preview.mode === 'legacy_fallback' ? (
              <span>
                レガシー fallback（紐づけ 0 件 → Module の system_prompt / user_prompt_template）
              </span>
            ) : (
              <span>Block 構成（紐づけあり。有効 Block の内容を sort_order 順に連結）</span>
            )}
          </p>

          <div className="space-y-4">
            <details open className="group rounded border border-gray-100 bg-gray-50/80">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 rounded-t">
                最終 System Prompt
                <span className="ml-2 text-xs font-normal text-gray-500">（クリックで折りたたみ）</span>
              </summary>
              <div className="border-t border-gray-200 p-3 pt-2">
                <div className="flex justify-end mb-1">
                  <CopyButton text={preview.composed_system_prompt} label="System をコピー" />
                </div>
                <ReadonlyPrompt value={preview.composed_system_prompt} />
              </div>
            </details>

            <details open className="group rounded border border-gray-100 bg-gray-50/80">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 rounded-t">
                最終 User Prompt
                <span className="ml-2 text-xs font-normal text-gray-500">（クリックで折りたたみ）</span>
              </summary>
              <div className="border-t border-gray-200 p-3 pt-2">
                <div className="flex justify-end mb-1">
                  <CopyButton text={preview.composed_user_prompt} label="User をコピー" />
                </div>
                <ReadonlyPrompt value={preview.composed_user_prompt} />
              </div>
            </details>
          </div>
        </section>
      )}

      {!loading && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">紐づけ一覧</h2>
          {rows.length === 0 ? (
            <p className="text-gray-600 text-sm mb-6">紐づけがありません（fallback は Module の system / user 全文）。</p>
          ) : (
            <ul className="space-y-3 mb-8">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-end gap-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm"
                >
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-medium text-gray-900">{r.prompt_block?.name ?? '(不明)'}</p>
                    <p className="text-xs text-gray-500">
                      {r.prompt_block?.block_key} · {r.prompt_block?.scope_type ?? '—'} · {r.prompt_block?.category ?? '—'} ·{' '}
                      {r.prompt_block?.content_target}
                      {r.prompt_block?.is_active ? '' : ' · Block無効'}
                    </p>
                  </div>
                  <SortRow
                    initial={r.sort_order}
                    onSave={(n) => updateSort(r.id, n)}
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(r.id)}
                    className="px-3 py-1.5 text-sm rounded border border-red-200 text-red-700 hover:bg-red-50"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="text-lg font-semibold text-gray-900 mb-2">Block を追加</h2>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Prompt Block</label>
              <select
                className="w-full p-2 border border-gray-300 rounded text-sm"
                value={addBlockId}
                onChange={(e) => setAddBlockId(e.target.value)}
              >
                <option value="">選択</option>
                {allBlocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.block_key})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">sort_order</label>
              <input
                type="number"
                min={1}
                className="w-24 p-2 border border-gray-300 rounded text-sm"
                value={addSort}
                onChange={(e) => setAddSort(Number(e.target.value))}
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="btn-primary text-sm"
            >
              {adding ? '追加中…' : '追加'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function ReadonlyPrompt({ value }: { value: string }) {
  return (
    <textarea
      readOnly
      spellCheck={false}
      value={value}
      rows={14}
      className="w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 leading-relaxed min-h-[180px]"
    />
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
    >
      {done ? 'コピーしました' : label}
    </button>
  );
}

function SortRow({ initial, onSave }: { initial: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    setV(initial);
  }, [initial]);
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">sort_order</label>
        <input
          type="number"
          min={1}
          className="w-24 p-2 border border-gray-300 rounded text-sm"
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
        />
      </div>
      <button
        type="button"
        className="px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
        onClick={() => onSave(v)}
      >
        保存
      </button>
    </div>
  );
}
