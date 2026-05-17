'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { jobStatusClass, jobStatusLabel } from '@/lib/brief/job-status-label';
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generation-jobs');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
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
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Brief Archive"
        description="過去に作成した Brief のステータスと結果を確認します。"
        action={
          <Link href="/" className={btnPrimaryClass}>
            Briefを作成する
          </Link>
        }
      />

      {loading && <p className="text-slate-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && jobs.length === 0 && (
        <p className="text-slate-600">まだ Brief がありません。</p>
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
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 line-clamp-2">{job.news_title || '（無題）'}</p>
          <p className="mt-1 text-sm text-slate-500">
            {job.team_name ?? '—'} · {job.brief_type_name ?? '—'}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${jobStatusClass(job.status)}`}
        >
          {jobStatusLabel(job.status)}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">作成日時</dt>
          <dd className="text-slate-800">{new Date(job.created_at).toLocaleString('ja-JP')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">結果 URL</dt>
          <dd className="break-all">
            {job.result_url ? (
              <a href={job.result_url} className="text-blue-700 hover:underline" target="_blank" rel="noreferrer">
                {job.result_url}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>

      {job.error_message ? (
        <details className="mt-3 rounded-md border border-red-100 bg-red-50/50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-red-800">エラー詳細</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-red-900">{job.error_message}</pre>
        </details>
      ) : null}
    </>
  );
}
