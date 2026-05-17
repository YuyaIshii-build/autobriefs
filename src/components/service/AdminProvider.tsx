'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { isAdminPublicEnv } from '@/lib/auth/admin';

type AdminContextValue = {
  isAdmin: boolean;
  loading: boolean;
};

const AdminContext = createContext<AdminContextValue>({ isAdmin: false, loading: true });

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (isAdminPublicEnv()) {
      if (!cancelled) {
        setIsAdmin(true);
        setLoading(false);
      }
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!cancelled) setIsAdmin(Boolean(data?.isAdmin));
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <AdminContext.Provider value={{ isAdmin, loading }}>{children}</AdminContext.Provider>;
}

export function useIsAdmin() {
  return useContext(AdminContext);
}
