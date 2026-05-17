import { en } from '@/messages/en';
import { ja } from '@/messages/ja';
import type { Locale } from '@/lib/i18n/constants';

export type Messages = typeof en;

const catalog: Record<Locale, Messages> = { en, ja: ja as Messages };

export function getMessages(locale: Locale): Messages {
  return catalog[locale] ?? catalog.ja;
}

export { en, ja };
