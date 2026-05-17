'use client';

import type { ReactNode } from 'react';

import ServiceNav from '@/components/service/ServiceNav';
import { APP_CONTAINER_CLASS, APP_MAIN_PADDING_CLASS } from '@/lib/layout/app-container';

type Props = {
  children: ReactNode;
};

export default function AppShell({ children }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <ServiceNav />
      <main className={`${APP_CONTAINER_CLASS} ${APP_MAIN_PADDING_CLASS}`}>{children}</main>
    </div>
  );
}
