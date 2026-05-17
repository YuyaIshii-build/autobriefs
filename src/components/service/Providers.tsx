'use client';

import type { ReactNode } from 'react';

import { AdminProvider } from '@/components/service/AdminProvider';
import { LocaleProvider } from '@/components/service/LocaleProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <AdminProvider>{children}</AdminProvider>
    </LocaleProvider>
  );
}
