'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';
import { btnPrimaryClass } from '@/lib/ui/brand';

type Team = {
  id: string;
  name: string;
  updated_at: string;
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/team-contexts');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
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
        title="Team Context"
        description="Brief の出力品質を高めるため、チーム前提・トーン・Brief の狙いを登録・編集します。"
        action={
          <Link href="/teams/new" className={btnPrimaryClass}>
            新規登録
          </Link>
        }
      />

      {loading && <p className="text-slate-600">読み込み中…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && teams.length === 0 && (
        <p className="text-slate-600">まだ登録がありません。Team Context を作成してください。</p>
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
                更新: {new Date(t.updated_at).toLocaleString('ja-JP')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
