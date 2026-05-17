'use client';

import type { ReactNode } from 'react';

import AdminShell from '@/components/service/AdminShell';

export default function LegacyToolShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AdminShell title={title}>
      <p className="mb-4 text-xs text-slate-500 rounded-md border border-slate-200 bg-white px-3 py-2">
        Legacy 動画生成ワークフロー — 一般ユーザー向けナビには表示されません。
      </p>
      {children}
    </AdminShell>
  );
}
