'use client';

import type { ReactNode } from 'react';

import AdminShell from '@/components/service/AdminShell';

export default function PromptBlocksLayout({ children }: { children: ReactNode }) {
  return <AdminShell title="Prompt Block">{children}</AdminShell>;
}
