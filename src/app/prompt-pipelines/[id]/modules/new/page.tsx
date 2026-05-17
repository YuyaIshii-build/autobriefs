'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ModuleNewPage() {
  const params = useParams();
  const pipelineId = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const [name, setName] = useState('');
  const [step_key, setStepKey] = useState('');
  const [step_order, setStepOrder] = useState(1);
  const [output_key, setOutputKey] = useState('');
  const [system_prompt, setSystemPrompt] = useState('');
  const [user_prompt_template, setUserPromptTemplate] = useState('');
  const [output_format, setOutputFormat] = useState('');
  const [input_variables_raw, setInputVariablesRaw] = useState('["team_context","news_body"]');
  const [is_active, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!pipelineId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-gray-600">無効な URL です。</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let input_variables: string[] = [];
    try {
      const parsed = JSON.parse(input_variables_raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
        throw new Error('input_variables は JSON 配列（文字列のみ）にしてください');
      }
      input_variables = parsed;
    } catch {
      setError('input_variables は JSON 配列（例: ["team_context","news_body"]）にしてください');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/prompt-pipelines/${pipelineId}/modules`, {
        method: 'POST',
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
      if (!res.ok) throw new Error(data.error || '作成に失敗しました');
      router.push(`/prompt-pipelines/${pipelineId}/modules/${data.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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
      <h1 className="text-2xl font-bold mb-6 text-gray-900">ステップの追加</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ステップ名 *</label>
          <input className="w-full p-2 border border-gray-300 rounded" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">step_key *</label>
          <input
            className="w-full p-2 border border-gray-300 rounded"
            value={step_key}
            onChange={(e) => setStepKey(e.target.value)}
            placeholder="例: chapter_1_script"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">step_order *（数値）</label>
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
          <input
            className="w-full p-2 border border-gray-300 rounded"
            value={output_key}
            onChange={(e) => setOutputKey(e.target.value)}
            placeholder="例: chapter_1_script"
            required
          />
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
          <label className="block text-sm font-medium text-gray-700 mb-1">system_prompt</label>
          <textarea
            className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
            rows={4}
            value={system_prompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">user_prompt_template</label>
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

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? '保存中…' : '作成'}
        </button>
      </form>
    </div>
  );
}
