'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import { PROMPT_BLOCK_CATEGORIES, type ScopeType } from '@/lib/brief/prompt-block-scope';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Pipeline = { id: string; name: string };
type Module = { id: string; name: string; step_order: number };

export default function PromptBlockNewPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [block_key, setBlockKey] = useState('');
  const [block_type, setBlockType] = useState('');
  const [content_target, setContentTarget] = useState<'system' | 'user'>('user');
  const [content, setContent] = useState('');
  const [is_active, setIsActive] = useState(true);
  const [scope_type, setScopeType] = useState<ScopeType>('global');
  const [template_id, setTemplateId] = useState('');
  const [pipelineForStep, setPipelineForStep] = useState('');
  const [module_id, setModuleId] = useState('');
  const [part_number, setPartNumber] = useState('');
  const [category, setCategory] = useState('other');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/prompt-pipelines');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Template 一覧の取得に失敗');
        if (!cancelled) setPipelines(data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      } catch {
        if (!cancelled) setPipelines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scope_type !== 'step' || !pipelineForStep) {
      setModules([]);
      setModuleId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prompt-pipelines/${pipelineForStep}/modules`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Step 一覧の取得に失敗');
        if (!cancelled) {
          setModules(
            (data as Module[]).map((m) => ({
              id: m.id,
              name: m.name,
              step_order: m.step_order,
            }))
          );
        }
      } catch {
        if (!cancelled) setModules([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope_type, pipelineForStep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let bodyTemplateId: string | null = null;
      let bodyModuleId: string | null = null;

      if (scope_type === 'global') {
        bodyTemplateId = null;
        bodyModuleId = null;
      } else if (scope_type === 'template') {
        if (!template_id) {
          setError('Template を選択してください');
          setLoading(false);
          return;
        }
        bodyTemplateId = template_id;
        bodyModuleId = null;
      } else {
        if (!module_id) {
          setError('Step（module）を選択してください');
          setLoading(false);
          return;
        }
        bodyModuleId = module_id;
        bodyTemplateId = pipelineForStep ? pipelineForStep : null;
      }

      const pn = part_number.trim() === '' ? null : Number(part_number);
      const partNum = pn !== null && Number.isFinite(pn) ? Math.trunc(pn) : null;

      const res = await fetch('/api/prompt-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          block_key,
          block_type,
          content_target,
          content,
          is_active,
          scope_type,
          template_id: bodyTemplateId,
          module_id: bodyModuleId,
          part_number: partNum,
          category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '作成に失敗しました');
      router.push(`/prompt-blocks/${data.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/prompt-blocks" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        ← Block 一覧
      </Link>
      <AdminTemplateBanner />
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Prompt Block 新規</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">スコープ *</label>
          <select
            className="w-full p-2 border border-gray-300 rounded"
            value={scope_type}
            onChange={(e) => {
              const v = e.target.value as ScopeType;
              setScopeType(v);
              setTemplateId('');
              setPipelineForStep('');
              setModuleId('');
            }}
          >
            <option value="global">global（全テンプレート共通）</option>
            <option value="template">template（特定 Template 内で共通）</option>
            <option value="step">step（特定 Step 専用）</option>
          </select>
        </div>

        {scope_type === 'template' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template *</label>
            <select
              className="w-full p-2 border border-gray-300 rounded"
              value={template_id}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              <option value="">選択してください</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope_type === 'step' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template（Step 選択のため）*</label>
              <select
                className="w-full p-2 border border-gray-300 rounded"
                value={pipelineForStep}
                onChange={(e) => {
                  setPipelineForStep(e.target.value);
                  setModuleId('');
                }}
                required
              >
                <option value="">選択してください</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Step *</label>
              <select
                className="w-full p-2 border border-gray-300 rounded"
                value={module_id}
                onChange={(e) => setModuleId(e.target.value)}
                required
                disabled={!pipelineForStep}
              >
                <option value="">選択してください</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}（順序 {m.step_order}）
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">
              保存時は整合チェック用に、選択した Template ID を template_id にも設定します（未指定時と同等の検証）。
            </p>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">category *</label>
          <select className="w-full p-2 border border-gray-300 rounded" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PROMPT_BLOCK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">part_number（任意）</label>
          <input
            type="number"
            className="w-full p-2 border border-gray-300 rounded"
            value={part_number}
            onChange={(e) => setPartNumber(e.target.value)}
            placeholder="例: 1"
          />
        </div>

        <Field label="名前 *" value={name} onChange={setName} required />
        <Area label="説明" value={description} onChange={setDescription} rows={2} />
        <Field label="block_key *" value={block_key} onChange={setBlockKey} required />
        <Field label="block_type" value={block_type} onChange={setBlockType} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">content_target *</label>
          <select
            className="w-full p-2 border border-gray-300 rounded"
            value={content_target}
            onChange={(e) => setContentTarget(e.target.value as 'system' | 'user')}
            required
          >
            <option value="system">system</option>
            <option value="user">user</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">content</label>
          <textarea
            className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
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

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        className="w-full p-2 border border-gray-300 rounded"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea className="w-full p-2 border border-gray-300 rounded" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
