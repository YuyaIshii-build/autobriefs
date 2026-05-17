'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { btnPrimaryClass } from '@/lib/ui/brand';

type Form = {
  name: string;
  company_summary: string;
  target_industries: string;
  customers: string;
  competitors: string;
  team_role: string;
  briefing_goals: string;
  tone: string;
  notes: string;
};

export default function TeamEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const [f, setF] = useState<Form | null>(null);
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
        const res = await fetch(`/api/team-contexts/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗');
        if (!cancelled) {
          setF({
            name: data.name ?? '',
            company_summary: data.company_summary ?? '',
            target_industries: data.target_industries ?? '',
            customers: data.customers ?? '',
            competitors: data.competitors ?? '',
            team_role: data.team_role ?? '',
            briefing_goals: data.briefing_goals ?? '',
            tone: data.tone ?? '',
            notes: data.notes ?? '',
          });
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
      <AppShell>
        <p className="text-slate-600">無効な URL です。</p>
      </AppShell>
    );
  }

  const set =
    (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/team-contexts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      setF({
        name: data.name ?? '',
        company_summary: data.company_summary ?? '',
        target_industries: data.target_industries ?? '',
        customers: data.customers ?? '',
        competitors: data.competitors ?? '',
        team_role: data.team_role ?? '',
        briefing_goals: data.briefing_goals ?? '',
        tone: data.tone ?? '',
        notes: data.notes ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('この Team Context を削除しますか？')) return;
    setError('');
    try {
      const res = await fetch(`/api/team-contexts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      router.push('/teams');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Team Context 編集"
        description="チーム前提・トーン・Brief の狙いを更新します。"
      />

      {loading && <p className="text-gray-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {f && (
        <form onSubmit={handleSave} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <Field label="チーム名 *" required value={f.name} onChange={set('name')} />
          <Area label="会社概要" value={f.company_summary} onChange={set('company_summary')} rows={3} />
          <Field label="対象業界" value={f.target_industries} onChange={set('target_industries')} />
          <Field label="主要顧客" value={f.customers} onChange={set('customers')} />
          <Field label="主要競合" value={f.competitors} onChange={set('competitors')} />
          <Field label="チームの役割" value={f.team_role} onChange={set('team_role')} />
          <Area label="Briefの狙い" value={f.briefing_goals} onChange={set('briefing_goals')} rows={3} />
          <Field label="トーン" value={f.tone} onChange={set('tone')} />
          <Area label="補足メモ" value={f.notes} onChange={set('notes')} rows={2} />

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              削除
            </button>
            <button type="submit" disabled={saving} className={btnPrimaryClass}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      )}
    </AppShell>
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
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        className="w-full p-2 border border-gray-300 rounded"
        value={value}
        onChange={onChange}
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
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea className="w-full p-2 border border-gray-300 rounded" rows={rows} value={value} onChange={onChange} />
    </div>
  );
}
