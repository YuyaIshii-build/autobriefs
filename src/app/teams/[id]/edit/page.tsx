'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import TeamContextFormFields, { type TeamContextFormValues } from '@/components/teams/TeamContextFormFields';
import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { useMessages } from '@/components/service/LocaleProvider';
import { btnPrimaryClass } from '@/lib/ui/brand';

export default function TeamEditPage() {
  const m = useMessages();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const [f, setF] = useState<TeamContextFormValues | null>(null);
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
        if (!res.ok) throw new Error(data.error || m.common.errorLoadFailed);
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
        <p className="text-slate-600">{m.common.invalidUrl}</p>
      </AppShell>
    );
  }

  const set =
    (key: keyof TeamContextFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
      if (!res.ok) throw new Error(data.error || m.teamContext.errorSave);
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
    if (!confirm(m.teamContext.deleteConfirm)) return;
    setError('');
    try {
      const res = await fetch(`/api/team-contexts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || m.teamContext.errorDelete);
      router.push('/teams');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AppShell>
      <PageHeader title={m.teamContext.editTitle} description={m.teamContext.editDescription} />

      {loading && <p className="text-slate-600">{m.common.loading}</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {f && (
        <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <TeamContextFormFields values={f} onChange={set} />

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Link
              href="/teams"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {m.common.cancel}
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {m.common.delete}
            </button>
            <button type="submit" disabled={saving} className={btnPrimaryClass}>
              {saving ? m.common.saving : m.teamContext.saveCta}
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
