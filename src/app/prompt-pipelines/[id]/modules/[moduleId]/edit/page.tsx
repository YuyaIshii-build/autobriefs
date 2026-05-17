'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ModuleEditPage() {
  const params = useParams();
  const pipelineId = typeof params?.id === 'string' ? params.id : '';
  const moduleId = typeof params?.moduleId === 'string' ? params.moduleId : '';
  const router = useRouter();
  const [name, setName] = useState('');
  const [step_key, setStepKey] = useState('');
  const [step_order, setStepOrder] = useState(1);
  const [output_key, setOutputKey] = useState('');
  const [system_prompt, setSystemPrompt] = useState('');
  const [user_prompt_template, setUserPromptTemplate] = useState('');
  const [output_format, setOutputFormat] = useState('');
  const [input_variables_raw, setInputVariablesRaw] = useState('[]');
  const [is_active, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!moduleId || !pipelineId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prompt-modules/${moduleId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗');
        if (!cancelled) {
          if (data.pipeline_id !== pipelineId) {
            setLoadError('このステップは別のテンプレートに属しています');
            return;
          }
          setName(data.name ?? '');
          setStepKey(data.step_key ?? '');
          setStepOrder(Number(data.step_order) || 1);
          setOutputKey(data.output_key ?? '');
          setSystemPrompt(data.system_prompt ?? '');
          setUserPromptTemplate(data.user_prompt_template ?? '');
          setOutputFormat(data.output_format ?? '');
          setInputVariablesRaw(JSON.stringify(data.input_variables ?? [], null, 0));
          setIsActive(Boolean(data.is_active));
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, pipelineId]);

  if (!pipelineId || !moduleId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-gray-600">無効な URL です。</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    let input_variables: string[] = [];
    try {
      const parsed = JSON.parse(input_variables_raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
        throw new Error('input_variables は JSON 配列（文字列のみ）にしてください');
      }
      input_variables = parsed;
    } catch {
      setFormError('input_variables は JSON 配列にしてください');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/prompt-modules/${moduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          step_key,
          step_order,
          output_key,
          system_prompt,
          user_prompt_template,
          output_format: output_format || null,
          input_variables,
          is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      setFormError('');
      setName(data.name ?? '');
      setStepKey(data.step_key ?? '');
      setStepOrder(Number(data.step_order) || 1);
      setOutputKey(data.output_key ?? '');
      setSystemPrompt(data.system_prompt ?? '');
      setUserPromptTemplate(data.user_prompt_template ?? '');
      setOutputFormat(data.output_format ?? '');
      setInputVariablesRaw(JSON.stringify(data.input_variables ?? [], null, 0));
      setIsActive(Boolean(data.is_active));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このステップを削除しますか？')) return;
    setFormError('');
    try {
      const res = await fetch(`/api/prompt-modules/${moduleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      router.push(`/prompt-pipelines/${pipelineId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href={`/prompt-pipelines/${pipelineId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        ← Template 詳細
      </Link>
      <AdminTemplateBanner />
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ステップの編集</h1>
        <Link
          href={`/prompt-pipelines/${pipelineId}/modules/${moduleId}/blocks`}
          className="shrink-0 px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50"
        >
          Block 構成を編集
        </Link>
      </div>

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {loadError && <p className="text-red-600 text-sm mb-4">{loadError}</p>}

      {!loading && !loadError && (
        <form onSubmit={handleSave} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium mb-1">プロンプト本文について</p>
            <p className="text-amber-900/90 mb-2">
              下の <strong>system_prompt</strong> / <strong>user_prompt_template</strong> は、
              <strong>この Step に Prompt Block が1件も紐づいていないときだけ</strong>使われる legacy fallback です。
              通常は <strong>Block 構成</strong>でプロンプトを組み立ててください。
            </p>
            <Link
              href={`/prompt-pipelines/${pipelineId}/modules/${moduleId}/blocks`}
              className="text-amber-900 underline font-medium"
            >
              Block 構成を編集する
            </Link>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ステップ名 *</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">step_key *</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={step_key} onChange={(e) => setStepKey(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">step_order *</label>
            <input
              type="number"
              min={1}
              className="w-full p-2 border border-gray-300 rounded"
              value={step_order}
              onChange={(e) => setStepOrder(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">output_key *</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={output_key} onChange={(e) => setOutputKey(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">input_variables（JSON 配列）</label>
            <textarea
              className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
              rows={2}
              value={input_variables_raw}
              onChange={(e) => setInputVariablesRaw(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">system_prompt（legacy fallback）</label>
            <textarea
              className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
              rows={4}
              value={system_prompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">user_prompt_template（legacy fallback）</label>
            <textarea
              className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
              rows={6}
              value={user_prompt_template}
              onChange={(e) => setUserPromptTemplate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">output_format（任意）</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={output_format} onChange={(e) => setOutputFormat(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>

          {formError && <p className="text-red-600 text-sm">{formError}</p>}

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
