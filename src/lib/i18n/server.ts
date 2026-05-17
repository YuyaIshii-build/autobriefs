import { getRequestUserKey } from '@/lib/auth/request-user';
import { getOrCreateAppUser } from '@/lib/db/app-users';
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale, type Locale } from '@/lib/i18n/constants';
import { getMessages } from '@/messages';

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

/** Locale for API responses: per-user DB preference, with cookie/default fallback. */
export async function getRequestLocale(request: Request): Promise<Locale> {
  try {
    const userKey = getRequestUserKey(request);
    const user = await getOrCreateAppUser(userKey);
    return user.ui_locale;
  } catch {
    return parseLocale(readCookie(request, LOCALE_COOKIE)) ?? DEFAULT_LOCALE;
  }
}

export function getApiMessages(locale: Locale) {
  return getMessages(locale).api;
}
