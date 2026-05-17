'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type SVGProps } from 'react';

import { useIsAdmin } from '@/components/service/AdminProvider';
import { useLocale, useMessages } from '@/components/service/LocaleProvider';
import { adminNavLinks } from '@/lib/admin/nav-links';
import type { Locale } from '@/lib/i18n/constants';

function menuItemClass(disabled?: boolean) {
  return disabled
    ? 'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 cursor-not-allowed'
    : 'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-[rgba(188,0,44,0.08)] hover:text-[#bc002c]';
}

function languageButtonClass(active: boolean) {
  return active
    ? 'rounded-md bg-[rgba(188,0,44,0.12)] px-2.5 py-1 text-xs font-medium text-[#bc002c]'
    : 'rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100';
}

export default function UserMenu() {
  const m = useMessages();
  const { locale, setLocale, displayName, loading: localeLoading } = useLocale();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
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

  const onPickLocale = async (next: Locale) => {
    if (next === locale || savingLocale) return;
    setSavingLocale(true);
    try {
      await setLocale(next);
    } finally {
      setSavingLocale(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(188,0,44,0.12)] text-[#bc002c] transition-colors hover:bg-[rgba(188,0,44,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(188,0,44,0.28)] focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        title={displayName}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">
          {m.userMenu.accountMenu} ({displayName})
        </span>
        <UserIcon className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">{m.userMenu.signedInAs}</p>
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
          </div>

          <div className="border-b border-slate-100 px-3 py-2" role="none">
            <p className="text-xs font-medium text-slate-500">{m.userMenu.language}</p>
            <div className="mt-1.5 flex gap-1" role="group" aria-label={m.userMenu.language}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={locale === 'ja'}
                disabled={localeLoading || savingLocale}
                className={languageButtonClass(locale === 'ja')}
                onClick={() => onPickLocale('ja')}
              >
                {m.userMenu.languageJa}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={locale === 'en'}
                disabled={localeLoading || savingLocale}
                className={languageButtonClass(locale === 'en')}
                onClick={() => onPickLocale('en')}
              >
                {m.userMenu.languageEn}
              </button>
            </div>
          </div>

          <div className="px-1 py-1" role="none">
            <button type="button" role="menuitem" disabled className={menuItemClass(true)} title={m.userMenu.comingSoon}>
              {m.userMenu.account}
              <span className="mt-0.5 block text-xs font-normal text-slate-400">{m.userMenu.comingSoon}</span>
            </button>
            <button type="button" role="menuitem" disabled className={menuItemClass(true)} title={m.userMenu.comingSoon}>
              {m.userMenu.settings}
              <span className="mt-0.5 block text-xs font-normal text-slate-400">{m.userMenu.comingSoon}</span>
            </button>
          </div>

          {!adminLoading && isAdmin ? (
            <>
              <div className="my-1 border-t border-slate-100" role="separator" />
              <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{m.userMenu.adminSection}</p>
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
              title={m.userMenu.signOutHint}
            >
              {m.userMenu.signOut}
              <span className="mt-0.5 block text-xs font-normal leading-snug text-slate-400">{m.userMenu.signOutHint}</span>
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
