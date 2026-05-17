'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import AppShell from '@/components/service/AppShell';
import { useLocale, useMessages } from '@/components/service/LocaleProvider';
import PageHeader from '@/components/service/PageHeader';
import { jobStatusClass, jobStatusLabel } from '@/lib/brief/job-status-label';
import { formatLocaleDate } from '@/lib/i18n/format';
import { btnPrimaryClass } from '@/lib/ui/brand';

type Job = {
  id: string;
  status: string;
  news_title: string;
  news_url: string;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
  team_name: string | null;
  brief_type_name: string | null;
};

export default function BriefArchivePage() {
  const m = useMessages();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generation-jobs');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || m.common.errorLoadFailed);
        if (!cancelled) setJobs(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [m.common.errorLoadFailed]);

  return (
    <AppShell>
      <PageHeader
        title={m.archive.pageTitle}
        description={m.archive.pageDescription}
        action={
          <Link href="/" className={btnPrimaryClass}>
            {m.archive.createCta}
          </Link>
        }
      />

      {loading && <p className="text-slate-600">{m.common.loading}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
          <p className="font-medium text-slate-800">{m.archive.emptyTitle}</p>
          <p className="mt-2 text-sm text-slate-600">{m.archive.emptyDescription}</p>
          <Link href="/" className={`${btnPrimaryClass} mt-6 inline-flex`}>
            {m.archive.createCta}
          </Link>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <ul className="space-y-4">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <ArchiveCard job={j} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function ArchiveCard({ job }: { job: Job }) {
  const m = useMessages();
  const { locale } = useLocale();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 line-clamp-2">{job.news_title || m.common.untitled}</p>
          <p className="mt-1 text-sm text-slate-500">
            {job.team_name ?? '—'} · {job.brief_type_name ?? '—'}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${jobStatusClass(job.status)}`}
        >
          {jobStatusLabel(job.status, locale)}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{m.common.created}</dt>
          <dd className="text-slate-800">{formatLocaleDate(job.created_at, locale)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{m.archive.resultUrl}</dt>
          <dd className="break-all">
            {job.result_url ? (
              <a href={job.result_url} className="text-blue-700 hover:underline" target="_blank" rel="noreferrer">
                {m.archive.openVideo}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>

      {job.error_message ? (
        <details className="mt-3 rounded-md border border-red-100 bg-red-50/50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-red-800">{m.archive.errorDetails}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-red-900">{job.error_message}</pre>
        </details>
      ) : null}
    </>
  );
}
