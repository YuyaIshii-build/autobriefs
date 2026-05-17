'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { btnPrimaryClass } from '@/lib/ui/brand';

const empty = {
  name: '',
  company_summary: '',
  target_industries: '',
  customers: '',
  competitors: '',
  team_role: '',
  briefing_goals: '',
  tone: '',
  notes: '',
};

export default function TeamNewPage() {
  const router = useRouter();
  const [f, setF] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set =
    (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/team-contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '作成に失敗しました');
      router.push(`/teams/${data.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Team Context 新規"
        description="Brief に使うチーム前提情報を登録します。"
      />

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Field label="チーム名 *" required value={f.name} onChange={set('name')} />
        <Area label="会社概要" value={f.company_summary} onChange={set('company_summary')} rows={3} />
        <Field label="対象業界" value={f.target_industries} onChange={set('target_industries')} />
        <Field label="主要顧客" value={f.customers} onChange={set('customers')} />
        <Field label="主要競合" value={f.competitors} onChange={set('competitors')} />
        <Field label="チームの役割" value={f.team_role} onChange={set('team_role')} />
        <Area label="Briefの狙い" value={f.briefing_goals} onChange={set('briefing_goals')} rows={3} />
        <Field label="トーン" value={f.tone} onChange={set('tone')} />
        <Area label="補足メモ" value={f.notes} onChange={set('notes')} rows={2} />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading} className={btnPrimaryClass}>
            {loading ? '保存中…' : '作成'}
          </button>
        </div>
      </form>
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
