'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useIsAdmin } from '@/components/service/AdminProvider';
import ServiceNav from '@/components/service/ServiceNav';
import { APP_CONTAINER_CLASS, APP_MAIN_PADDING_CLASS } from '@/lib/layout/app-container';

type Props = {
  children: ReactNode;
  title?: string;
};

function AdminAccessNotice() {
  return (
    <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">管理者モードが無効です</p>
      <p className="mt-1 text-amber-900/90">
        環境変数 <code className="rounded bg-amber-100 px-1">AUTO_BRIEFS_ADMIN=true</code> と{' '}
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_AUTO_BRIEFS_ADMIN=true</code>{' '}
        を設定すると Admin 機能が表示されます。
      </p>
    </section>
  );
}

export default function AdminShell({ children, title }: Props) {
  const { isAdmin, loading } = useIsAdmin();

  return (
    <section className="min-h-screen bg-slate-100">
      <ServiceNav />
      <header className="border-b border-slate-700/20 bg-slate-800 text-slate-100">
        <nav
          className={`${APP_CONTAINER_CLASS} flex flex-wrap items-center justify-between gap-3 py-2 text-sm`}
          aria-label="Admin"
        >
          <p className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-white">Admin</span>
            {title ? <span className="text-slate-300">/ {title}</span> : null}
          </p>
          <p className="flex flex-wrap gap-3 text-slate-300">
            <Link href="/admin" className="hover:text-white">
              Admin ホーム
            </Link>
            <Link href="/prompt-pipelines" className="hover:text-white">
              Template
            </Link>
            <Link href="/prompt-blocks" className="hover:text-white">
              Prompt Block
            </Link>
            <Link href="/briefs" className="hover:text-white">
              Jobs / Archive
            </Link>
          </p>
        </nav>
      </header>
      <main className={`${APP_CONTAINER_CLASS} ${APP_MAIN_PADDING_CLASS}`}>
        {!loading && !isAdmin && <AdminAccessNotice />}
        {children}
      </main>
    </section>
  );
}
