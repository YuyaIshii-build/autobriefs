'use client';

import Link from 'next/link';

import CreateBriefForm from '@/components/brief/CreateBriefForm';
import AppShell from '@/components/service/AppShell';
import { useMessages } from '@/components/service/LocaleProvider';
import PageHeader from '@/components/service/PageHeader';

/** Same create form as home — kept for bookmarks and direct links */
export default function BriefNewPage() {
  const m = useMessages();
  return (
    <AppShell>
      <PageHeader
        title={m.createBrief.pageTitle}
        description={
          <>
            {m.createBrief.briefNewDescription}{' '}
            <Link href="/" className="text-[#bc002c] underline-offset-2 hover:text-[#9f0025] hover:underline">
              {m.common.home}
            </Link>
            .
          </>
        }
      />
      <CreateBriefForm />
    </AppShell>
  );
}
