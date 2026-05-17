'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { setLocaleCookie } from '@/lib/i18n/cookie';
import { DEFAULT_LOCALE, parseLocale, type Locale } from '@/lib/i18n/constants';
import { getMessages, type Messages } from '@/messages';

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  userKey: string | null;
  displayName: string;
  loading: boolean;
  setLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readInitialLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const fromDom = document.documentElement.lang;
  return parseLocale(fromDom) ?? DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);
  const [userKey, setUserKey] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('User');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!cancelled && parseLocale(data?.locale)) {
          const next = data.locale as Locale;
          setLocaleState(next);
          setLocaleCookie(next);
          document.documentElement.lang = next;
        }
        if (!cancelled && typeof data?.userKey === 'string') {
          setUserKey(data.userKey);
          setDisplayName(typeof data.displayName === 'string' ? data.displayName : data.userKey);
        }
      } catch {
        /* keep cookie / default */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    setLocaleCookie(next);
    document.documentElement.lang = next;

    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      const data = await res.json();
      if (res.ok && typeof data.displayName === 'string') {
        setDisplayName(data.displayName);
      }
      if (res.ok && typeof data.userKey === 'string') {
        setUserKey(data.userKey);
      }
    } catch {
      /* UI already updated; will sync on next session fetch */
    }
  }, []);

  const messages = useMemo(() => getMessages(locale), [locale]);

  const value = useMemo(
    () => ({ locale, messages, userKey, displayName, loading, setLocale }),
    [locale, messages, userKey, displayName, loading, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useMessages(): Messages {
  return useLocale().messages;
}
