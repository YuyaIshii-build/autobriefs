'use client';

import AdminTemplateBanner from '@/components/admin/AdminTemplateBanner';
import { PROMPT_BLOCK_CATEGORIES, parseScopeType, type ScopeType } from '@/lib/brief/prompt-block-scope';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Pipeline = { id: string; name: string };
type Module = { id: string; name: string; step_order: number };

export default function PromptBlockEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prompt-blocks/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗');
        if (!cancelled) {
          setName(data.name ?? '');
          setDescription(data.description ?? '');
          setBlockKey(data.block_key ?? '');
          setBlockType(data.block_type ?? '');
          setContentTarget(data.content_target === 'system' ? 'system' : 'user');
          setContent(data.content ?? '');
          setIsActive(Boolean(data.is_active));
          const st = parseScopeType(data.scope_type) ?? 'global';
          setScopeType(st);
          setCategory(typeof data.category === 'string' ? data.category : 'other');
          setPartNumber(data.part_number != null ? String(data.part_number) : '');

          if (st === 'template' && data.template_id) {
            setTemplateId(data.template_id);
          }
          if (st === 'step' && data.module_id) {
            setModuleId(data.module_id);
            const mr = await fetch(`/api/prompt-modules/${data.module_id}`);
            const mj = await mr.json();
            if (mr.ok && mj.pipeline_id) {
              setPipelineForStep(mj.pipeline_id);
            } else if (data.template_id) {
              setPipelineForStep(data.template_id);
            }
          }
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

  useEffect(() => {
    if (scope_type !== 'step' || !pipelineForStep) {
      if (scope_type !== 'step') setModules([]);
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
      let bodyTemplateId: string | null | undefined = undefined;
      let bodyModuleId: string | null | undefined = undefined;

      if (scope_type === 'global') {
        bodyTemplateId = null;
        bodyModuleId = null;
      } else if (scope_type === 'template') {
        if (!template_id) {
          setError('Template を選択してください');
          setSaving(false);
          return;
        }
        bodyTemplateId = template_id;
        bodyModuleId = null;
      } else {
        if (!module_id) {
          setError('Step（module）を選択してください');
          setSaving(false);
          return;
        }
        bodyModuleId = module_id;
        bodyTemplateId = pipelineForStep ? pipelineForStep : null;
      }

      const pn = part_number.trim() === '' ? null : Number(part_number);
      const partNum = pn !== null && Number.isFinite(pn) ? Math.trunc(pn) : null;

      const res = await fetch(`/api/prompt-blocks/${id}`, {
        method: 'PATCH',
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
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      setName(data.name ?? '');
      setDescription(data.description ?? '');
      setBlockKey(data.block_key ?? '');
      setBlockType(data.block_type ?? '');
      setContentTarget(data.content_target === 'system' ? 'system' : 'user');
      setContent(data.content ?? '');
      setIsActive(Boolean(data.is_active));
      const st = parseScopeType(data.scope_type) ?? 'global';
      setScopeType(st);
      setCategory(typeof data.category === 'string' ? data.category : 'other');
      setPartNumber(data.part_number != null ? String(data.part_number) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('この Prompt Block を削除しますか？')) return;
    setError('');
    try {
      const res = await fetch(`/api/prompt-blocks/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      router.push('/prompt-blocks');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/prompt-blocks" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        ← Block 一覧
      </Link>
      <AdminTemplateBanner />
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Prompt Block 編集</h1>

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {!loading && (
        <form onSubmit={handleSave} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Template *</label>
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
            <textarea className="w-full p-2 border border-gray-300 rounded" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">block_key *</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={block_key} onChange={(e) => setBlockKey(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">block_type</label>
            <input className="w-full p-2 border border-gray-300 rounded" value={block_type} onChange={(e) => setBlockType(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">content_target *</label>
            <select
              className="w-full p-2 border border-gray-300 rounded"
              value={content_target}
              onChange={(e) => setContentTarget(e.target.value as 'system' | 'user')}
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
