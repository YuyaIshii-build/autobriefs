'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useIsAdmin } from '@/components/service/AdminProvider';
import { jobStatusClass, jobStatusLabel } from '@/lib/brief/job-status-label';

type RecentJob = {
  id: string;
  status: string;
  news_title: string;
  created_at: string;
  team_name: string | null;
  brief_type_name: string | null;
};

const adminLinks = [
  { href: '/prompt-pipelines', label: 'Template 管理' },
  { href: '/prompt-blocks', label: 'Prompt Block 管理' },
  { href: '/admin#legacy', label: 'Legacy Tools' },
  { href: '/briefs', label: 'Jobs / Logs' },
] as const;

export default function BriefWorkspaceAside() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generation-jobs');
        const data = await res.json();
        if (!res.ok) throw new Error();
        if (!cancelled) setRecentJobs((data as RecentJob[]).slice(0, 3));
      } catch {
        if (!cancelled) setRecentJobs([]);
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="space-y-6 text-sm">
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Briefs</h2>
          <Link href="/briefs" className="text-xs text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
            Archive
          </Link>
        </div>
        {jobsLoading ? (
          <p className="mt-2 text-xs text-slate-500">読み込み中…</p>
        ) : recentJobs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">まだありません</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recentJobs.map((job) => (
              <li key={job.id} className="rounded-md border border-slate-100 bg-white px-2.5 py-2">
                <p className="text-xs font-medium text-slate-800 line-clamp-1">{job.news_title || '（無題）'}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${jobStatusClass(job.status)}`}
                  >
                    {jobStatusLabel(job.status)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(job.created_at).toLocaleDateString('ja-JP')}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team Context</h2>
        <Link href="/teams" className="mt-2 inline-block text-xs text-slate-700 underline-offset-2 hover:underline">
          チーム情報を編集
        </Link>
      </section>

      {!adminLoading && isAdmin ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</h2>
          <ul className="mt-2 space-y-1">
            {adminLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-xs text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/admin" className="text-xs text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">
                Admin ホーム
              </Link>
            </li>
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
