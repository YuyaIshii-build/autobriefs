'use client';

import CreateBriefForm from '@/components/brief/CreateBriefForm';
import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';

export default function Home() {
  return (
    <AppShell>
      <PageHeader
        title="Create Team Brief"
        description="共有したいニュースを入力し、チーム文脈で解釈された Brief 動画を作成します。"
      />
      <CreateBriefForm />
    </AppShell>
  );
}
