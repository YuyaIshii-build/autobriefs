'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import TeamContextFormFields, { type TeamContextFormValues } from '@/components/teams/TeamContextFormFields';
import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { useMessages } from '@/components/service/LocaleProvider';
import { btnPrimaryClass } from '@/lib/ui/brand';

const empty: TeamContextFormValues = {
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
  const m = useMessages();
  const router = useRouter();
  const [f, setF] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set =
    (key: keyof TeamContextFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
      if (!res.ok) throw new Error(data.error || m.teamContext.errorCreate);
      router.push(`/teams/${data.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title={m.teamContext.newTitle} description={m.teamContext.newDescription} />

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <TeamContextFormFields values={f} onChange={set} />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Link
            href="/teams"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {m.common.cancel}
          </Link>
          <button type="submit" disabled={loading} className={btnPrimaryClass}>
            {loading ? m.common.saving : m.common.create}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
