'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PromptPipelineEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [use_case, setUseCase] = useState('');
  const [output_type, setOutputType] = useState('');
  const [is_active, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prompt-pipelines/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗');
        if (!cancelled) {
          setName(data.name ?? '');
          setDescription(data.description ?? '');
          setUseCase(data.use_case ?? '');
          setOutputType(data.output_type ?? '');
          setIsActive(Boolean(data.is_active));
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
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-gray-600">無効な URL です。</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/prompt-pipelines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, use_case, output_type, is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      setName(data.name ?? '');
      setDescription(data.description ?? '');
      setUseCase(data.use_case ?? '');
      setOutputType(data.output_type ?? '');
      setIsActive(Boolean(data.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このテンプレートと配下のステップを削除しますか？')) return;
    setError('');
    try {
      const res = await fetch(`/api/prompt-pipelines/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      router.push('/prompt-pipelines');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href={`/prompt-pipelines/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        ← Template 詳細
      </Link>
      <AdminTemplateBanner />
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Template 編集</h1>

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {!loading && (
        <form onSubmit={handleSave} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">テンプレート名 *</label>
            <input
              className="w-full p-2 border border-gray-300 rounded"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
            <textarea
              className="w-full p-2 border border-gray-300 rounded"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用途</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={use_case} onChange={(e) => setUseCase(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">出力動画タイプ</label>
            <input
              className="w-full p-2 border border-gray-300 rounded"
              value={output_type}
              onChange={(e) => setOutputType(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50"
            >
              削除
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
