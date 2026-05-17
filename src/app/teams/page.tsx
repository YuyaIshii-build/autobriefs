'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { formatLocaleDate } from '@/lib/i18n/format';
import { useLocale, useMessages } from '@/components/service/LocaleProvider';
import { btnPrimaryClass } from '@/lib/ui/brand';

type Team = {
  id: string;
  name: string;
  updated_at: string;
};

export default function TeamsPage() {
  const m = useMessages();
  const { locale } = useLocale();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/team-contexts');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || m.common.errorLoadFailed);
        if (!cancelled) setTeams(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      <PageHeader
        title={m.teamContext.pageTitle}
        description={m.teamContext.pageDescription}
        action={
          <Link href="/teams/new" className={btnPrimaryClass}>
            {m.teamContext.newCta}
          </Link>
        }
      />

      {loading && <p className="text-slate-600">{m.common.loading}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && teams.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
          <p className="font-medium text-slate-800">{m.teamContext.empty}</p>
          <p className="mt-2 text-sm text-slate-600">{m.teamContext.emptyDescription}</p>
          <Link href="/teams/new" className={`${btnPrimaryClass} mt-6 inline-flex`}>
            {m.teamContext.newCta}
          </Link>
        </div>
      )}

      <ul className="space-y-2">
        {teams.map((t) => (
          <li key={t.id}>
            <Link
              href={`/teams/${t.id}/edit`}
              className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300"
            >
              <span className="font-medium text-slate-900">{t.name}</span>
              <span className="block text-xs text-slate-500 mt-1">
                {m.common.updated}: {formatLocaleDate(t.updated_at, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
