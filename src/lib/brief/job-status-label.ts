export function jobStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '待機中';
    case 'sent_to_n8n':
      return '生成依頼済み';
    case 'processing':
      return '処理中';
    case 'completed':
      return '完了';
    case 'failed':
      return '失敗';
    default:
      return status;
  }
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
