'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { btnPrimaryClass } from '@/lib/ui/brand';

type TeamOpt = { id: string; name: string };
type TemplateOpt = { id: string; name: string; description: string };

function templateOptionLabel(name: string, description: string) {
  const one = description.replace(/\s+/g, ' ').trim();
  if (!one) return name;
  const short = one.length > 100 ? `${one.slice(0, 100)}…` : one;
  return `${name} — ${short}`;
}

type Props = {
  className?: string;
};

export default function CreateBriefForm({ className = '' }: Props) {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [teamId, setTeamId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [news_title, setNewsTitle] = useState('');
  const [news_url, setNewsUrl] = useState('');
  const [news_body, setNewsBody] = useState('');
  const [news_notes, setNewsNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tr, pr] = await Promise.all([fetch('/api/team-contexts'), fetch('/api/prompt-pipelines')]);
        const tj = await tr.json();
        const pj = await pr.json();
        if (!tr.ok) throw new Error(tj.error || 'Team の読み込みに失敗');
        if (!pr.ok) throw new Error(pj.error || 'Brief Type の読み込みに失敗');
        if (!cancelled) {
          setTeams(tj.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
          setTemplates(
            pj.map((x: { id: string; name: string; description?: string }) => ({
              id: x.id,
              name: x.name,
              description: typeof x.description === 'string' ? x.description : '',
            }))
          );
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!teamId) {
      setMessage('Team Context を選択してください');
      return;
    }
    if (!pipelineId) {
      setMessage('Brief Type を選択してください');
      return;
    }
    if (!news_body.trim()) {
      setMessage('ニュース本文・要約を入力してください');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/generation-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_context_id: teamId,
          prompt_pipeline_id: pipelineId,
          news_title,
          news_url,
          news_body,
          news_notes,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/briefs');
        return;
      }
      if (res.status === 502 && data.id) {
        router.push('/briefs');
        return;
      }
      setMessage(data.error || '作成に失敗しました');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">フォームを読み込み中…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${className}`.trim()}
    >
      <FieldSelect
        label="Team Context"
        hint="どのチーム向けに解釈するかを選びます"
        value={teamId}
        onChange={setTeamId}
        required
        options={teams.map((t) => ({ value: t.id, label: t.name }))}
      />

      <FieldSelect
        label="Brief Type"
        hint="出力する Brief の型を選びます"
        value={pipelineId}
        onChange={setPipelineId}
        required
        options={templates.map((t) => ({
          value: t.id,
          label: templateOptionLabel(t.name, t.description),
        }))}
      />

      {pipelineId ? (
        (() => {
          const sel = templates.find((t) => t.id === pipelineId);
          if (!sel?.description?.trim()) return null;
          return (
            <aside className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p className="text-xs font-medium text-slate-500 mb-1">Brief Type の説明</p>
              <p className="whitespace-pre-wrap">{sel.description}</p>
            </aside>
          );
        })()
      ) : null}

      <FieldInput label="ニュースタイトル" value={news_title} onChange={setNewsTitle} required />

      <FieldInput label="URL" value={news_url} onChange={setNewsUrl} type="url" />

      <FieldTextarea
        label="ニュース本文・要約"
        value={news_body}
        onChange={setNewsBody}
        rows={10}
        required
        placeholder="ニュース本文、要約、または共有したい内容を貼り付けてください"
      />

      <FieldTextarea
        label="補足メモ"
        value={news_notes}
        onChange={setNewsNotes}
        rows={3}
        placeholder="特に注目してほしい観点があれば入力してください"
      />

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={submitting} className={`${btnPrimaryClass} px-5 py-3`}>
          {submitting ? '送信中…' : 'チーム向けBriefを作成'}
        </button>
      </div>
    </form>
  );
}

function FieldSelect({
  label,
  hint,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  const id = `field-${label.replace(/\s+/g, '-')}`;
  return (
    <fieldset className="border-0 p-0 m-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="text-[#bc002c]"> *</span> : null}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <select
        id={id}
        name={id}
        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">{required ? '選択してください' : '（未指定）'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <label className="block text-sm font-medium text-slate-800">{label}</label>
      <input
        type={type}
        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </fieldset>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  rows,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  required?: boolean;
  placeholder?: string;
}) {
  const id = `field-${label.replace(/\s+/g, '-')}`;
  return (
    <fieldset className="border-0 p-0 m-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="text-[#bc002c]"> *</span> : null}
      </label>
      <textarea
        id={id}
        name={id}
        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </fieldset>
  );
}
