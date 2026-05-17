'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type SVGProps } from 'react';

import { useIsAdmin } from '@/components/service/AdminProvider';
import { adminNavLinks } from '@/lib/admin/nav-links';

// Future: session.name ?? session.email ?? 'User' from Supabase Auth
const userLabel = 'User';

function menuItemClass(disabled?: boolean) {
  return disabled
    ? 'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 cursor-not-allowed'
    : 'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-[rgba(188,0,44,0.08)] hover:text-[#bc002c]';
}

export default function UserMenu() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(188,0,44,0.12)] text-[#bc002c] transition-colors hover:bg-[rgba(188,0,44,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(188,0,44,0.28)] focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        title={userLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">アカウントメニュー（{userLabel}）</span>
        <UserIcon className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">Signed in as</p>
            <p className="truncate text-sm font-semibold text-slate-900">{userLabel}</p>
          </div>

          <div className="px-1 py-1" role="none">
            <button type="button" role="menuitem" disabled className={menuItemClass(true)} title="Coming soon">
              Account
              <span className="mt-0.5 block text-xs font-normal text-slate-400">Coming soon</span>
            </button>
            <button type="button" role="menuitem" disabled className={menuItemClass(true)} title="Coming soon">
              Settings
              <span className="mt-0.5 block text-xs font-normal text-slate-400">Coming soon</span>
            </button>
          </div>

          {!adminLoading && isAdmin ? (
            <>
              <div className="my-1 border-t border-slate-100" role="separator" />
              <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">Admin</p>
              <div className="px-1 pb-0.5" role="none">
                {adminNavLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={menuItemClass()}
                    onClick={close}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <div className="my-1 border-t border-slate-100" role="separator" />
          <div className="px-1 pb-1" role="none">
            <button
              type="button"
              role="menuitem"
              disabled
              className={menuItemClass(true)}
              title="HTTP Basic 認証はブラウザで管理されています"
            >
              Sign out
              <span className="mt-0.5 block text-xs font-normal leading-snug text-slate-400">
                Basic auth is managed by your browser
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
