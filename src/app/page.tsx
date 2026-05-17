'use client';

import CreateBriefForm from '@/components/brief/CreateBriefForm';
import AppShell from '@/components/service/AppShell';
import { useMessages } from '@/components/service/LocaleProvider';
import PageHeader from '@/components/service/PageHeader';

export default function Home() {
  const m = useMessages();
  return (
    <AppShell>
      <PageHeader title={m.createBrief.pageTitle} description={m.createBrief.pageDescription} />
      <CreateBriefForm />
    </AppShell>
  );
}
