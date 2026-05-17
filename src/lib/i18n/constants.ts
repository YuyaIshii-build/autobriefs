export type Locale = 'ja' | 'en';

export const LOCALES: readonly Locale[] = ['ja', 'en'] as const;

export const DEFAULT_LOCALE: Locale = 'ja';

export const LOCALE_COOKIE = 'ab_ui_locale';

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLocale(value: string | null | undefined): Locale | null {
  if (value === 'ja' || value === 'en') return value;
  return null;
}
