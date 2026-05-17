'use client';

import type { ReactNode } from 'react';

import AdminShell from '@/components/service/AdminShell';

export default function PromptPipelinesLayout({ children }: { children: ReactNode }) {
  return <AdminShell title="Template">{children}</AdminShell>;
}
