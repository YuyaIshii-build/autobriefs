'use client';

import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function PageHeader({ title, description, action, className = '' }: Props) {
  return (
    <header
      className={`mb-8 flex flex-wrap items-start justify-between gap-4 ${className}`.trim()}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
