'use client';

import Link from 'next/link';

import CreateBriefForm from '@/components/brief/CreateBriefForm';
import AppShell from '@/components/service/AppShell';
import PageHeader from '@/components/service/PageHeader';

/** ホームと同じ作成フォーム。ブックマーク・直リンク用に維持 */
export default function BriefNewPage() {
  return (
    <AppShell>
      <PageHeader
        title="Create Team Brief"
        description={
          <>
            共有したいニュースを入力し、チーム文脈で解釈された Brief 動画を作成します。{' '}
            <Link href="/" className="text-[#bc002c] underline-offset-2 hover:text-[#9f0025] hover:underline">
              ホーム
            </Link>
            でも同じフォームを利用できます。
          </>
        }
      />
      <CreateBriefForm />
    </AppShell>
  );
}
