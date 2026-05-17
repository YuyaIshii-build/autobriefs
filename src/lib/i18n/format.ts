import type { Locale } from '@/lib/i18n/constants';

const options: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export function formatLocaleDate(iso: string, locale: Locale): string {
  const tag = locale === 'ja' ? 'ja-JP' : 'en-US';
  return new Date(iso).toLocaleString(tag, options);
}
