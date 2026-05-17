'use client';

import { useMessages } from '@/components/service/LocaleProvider';

export type TeamContextFormValues = {
  name: string;
  company_summary: string;
  target_industries: string;
  customers: string;
  competitors: string;
  team_role: string;
  briefing_goals: string;
  tone: string;
  notes: string;
};

type Props = {
  values: TeamContextFormValues;
  onChange: (key: keyof TeamContextFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};

export default function TeamContextFormFields({ values, onChange }: Props) {
  const f = useMessages().teamContext.fields;
  return (
    <>
      <Field label={f.name} required value={values.name} onChange={onChange('name')} />
      <Area
        label={f.companySummary}
        hint={f.hintCompanySummary}
        value={values.company_summary}
        onChange={onChange('company_summary')}
        rows={3}
      />
      <Field
        label={f.targetIndustries}
        hint={f.hintTargetIndustries}
        value={values.target_industries}
        onChange={onChange('target_industries')}
      />
      <Field label={f.customers} hint={f.hintCustomers} value={values.customers} onChange={onChange('customers')} />
      <Field
        label={f.competitors}
        hint={f.hintCompetitors}
        value={values.competitors}
        onChange={onChange('competitors')}
      />
      <Field label={f.teamRole} hint={f.hintTeamRole} value={values.team_role} onChange={onChange('team_role')} />
      <Area
        label={f.briefingGoals}
        hint={f.hintBriefingGoals}
        value={values.briefing_goals}
        onChange={onChange('briefing_goals')}
        rows={3}
      />
      <Field label={f.tone} hint={f.hintTone} value={values.tone} onChange={onChange('tone')} />
      <Area label={f.notes} hint={f.hintNotes} value={values.notes} onChange={onChange('notes')} rows={2} />
    </>
  );
}

function FieldShell({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="text-[#bc002c]"> *</span> : null}
      </label>
      {hint ? <p className="mb-1 text-xs text-slate-500">{hint}</p> : null}
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <FieldShell label={label} hint={hint} required={required}>
      <input
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900"
        value={value}
        onChange={onChange}
        required={required}
      />
    </FieldShell>
  );
}

function Area({
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows: number;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <textarea
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900"
        rows={rows}
        value={value}
        onChange={onChange}
      />
    </FieldShell>
  );
}
