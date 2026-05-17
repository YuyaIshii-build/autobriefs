import type { Locale } from '@/lib/i18n/constants';
import { getMessages } from '@/messages';

export function jobStatusLabel(status: string, locale: Locale): string {
  const labels = getMessages(locale).jobStatus;
  if (status in labels) {
    return labels[status as keyof typeof labels];
  }
  return status;
}

export function jobStatusClass(status: string): string {
  switch (status) {
    case 'failed':
      return 'bg-red-50 text-red-800 ring-red-200';
    case 'completed':
    case 'sent_to_n8n':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    case 'processing':
      return 'bg-blue-50 text-blue-800 ring-blue-200';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200';
  }
}
