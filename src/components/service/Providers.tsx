'use client';

import type { ReactNode } from 'react';

import { AdminProvider } from '@/components/service/AdminProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return <AdminProvider>{children}</AdminProvider>;
}
