'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import BrandLogo from '@/components/service/BrandLogo';
import UserMenu from '@/components/service/UserMenu';
import { navLinkClass } from '@/lib/ui/brand';
import { APP_CONTAINER_CLASS } from '@/lib/layout/app-container';

const userLinks = [
  { href: '/', label: 'Create Brief' },
  { href: '/briefs', label: 'Archive' },
  { href: '/teams', label: 'Team Context' },
] as const;

export default function ServiceNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    const p = pathname ?? '';
    if (href === '/') return p === '/' || p === '/briefs/new';
    if (href === '/briefs') return p === '/briefs';
    if (href === '/teams') return p === '/teams' || p.startsWith('/teams/');
    if (href === '/admin')
      return (
        p === '/admin' ||
        p.startsWith('/prompt-') ||
        p.startsWith('/conversation-') ||
        p.startsWith('/market-') ||
        p.startsWith('/structure-') ||
        p.startsWith('/intro-') ||
        p.startsWith('/money-')
      );
    return p === href || p.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div
        className={`${APP_CONTAINER_CLASS} flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4`}
      >
        <BrandLogo />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <nav className="flex flex-wrap items-center gap-0.5 sm:gap-1" aria-label="メインナビゲーション">
            {userLinks.map((item) => (
              <Link key={item.href} href={item.href} className={navLinkClass(isActive(item.href))}>
                {item.label}
              </Link>
            ))}
          </nav>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
