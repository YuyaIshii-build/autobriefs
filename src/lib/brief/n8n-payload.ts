export type TeamContextRow = {
  id: string;
  workspace_id: string | null;
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

export type PromptPipelineRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string;
  use_case: string;
  output_type: string;
  is_active: boolean;
};

export type PromptModuleRow = {
  id: string;
  workspace_id: string | null;
  pipeline_id: string;
  name: string;
  step_key: string;
  step_order: number;
  system_prompt: string;
  user_prompt_template: string;
  output_format: string | null;
  input_variables: unknown;
  output_key: string;
  is_active: boolean;
};

export type BriefPayloadLocale = 'ja' | 'en';

export type N8nBriefPayload = {
  schema_version: 2;
  job_id: string;
  team_context: Omit<TeamContextRow, 'workspace_id'>;
  news_input: {
    title: string;
    url: string;
    body: string;
    notes: string;
  };
  prompt_pipeline: Omit<PromptPipelineRow, 'workspace_id'>;
  prompt_modules: Array<
    Omit<PromptModuleRow, 'workspace_id' | 'pipeline_id'> & {
      input_variables: string[];
      composed_system_prompt: string;
      composed_user_prompt: string;
    }
  >;
  output_settings: {
    video_id: string;
  };
  metadata: {
    workspace_id: string | null;
    source: 'auto-briefs-ui';
    locale: BriefPayloadLocale;
  };
};

function normalizeInputVariables(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

/**
 * n8n 向け prompt_modules: step_order 昇順（同順位は id）で並べ、
 * 同一 id または同一 step_key（空文字は step_key 重複判定に含めない）の行は先頭のみ残す。
 */
export function dedupePromptModulesForPayload(modules: PromptModuleRow[]): PromptModuleRow[] {
  const sorted = [...modules].sort((a, b) => {
    if (a.step_order !== b.step_order) return a.step_order - b.step_order;
    return a.id.localeCompare(b.id);
  });

  const seenIds = new Set<string>();
  const seenStepKeys = new Set<string>();
  const out: PromptModuleRow[] = [];

  for (const m of sorted) {
    if (seenIds.has(m.id)) continue;
    const stepKey = typeof m.step_key === 'string' ? m.step_key.trim() : '';
    if (stepKey && seenStepKeys.has(stepKey)) continue;
    seenIds.add(m.id);
    if (stepKey) seenStepKeys.add(stepKey);
    out.push(m);
  }

  return out;
}

export function buildN8nBriefPayload(params: {
  jobId: string;
  videoId: string;
  workspaceId: string | null;
  locale: BriefPayloadLocale;
  team: TeamContextRow;
  pipeline: PromptPipelineRow;
  modules: PromptModuleRow[];
  composedByModuleId: Record<string, { composed_system_prompt: string; composed_user_prompt: string }>;
  news: { title: string; url: string; body: string; notes: string };
}): N8nBriefPayload {
  const { jobId, videoId, workspaceId, locale, team, pipeline, modules, news, composedByModuleId } =
    params;

  const uniqueModules = dedupePromptModulesForPayload(modules);

  return {
    schema_version: 2,
    job_id: jobId,
    team_context: {
      id: team.id,
      name: team.name,
      company_summary: team.company_summary,
      target_industries: team.target_industries,
      customers: team.customers,
      competitors: team.competitors,
      team_role: team.team_role,
      briefing_goals: team.briefing_goals,
      tone: team.tone,
      notes: team.notes,
    },
    news_input: {
      title: news.title,
      url: news.url,
      body: news.body,
      notes: news.notes,
    },
    prompt_pipeline: {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      use_case: pipeline.use_case,
      output_type: pipeline.output_type,
      is_active: pipeline.is_active,
    },
    prompt_modules: uniqueModules.map((m) => {
      const c = composedByModuleId[m.id] ?? {
        composed_system_prompt: m.system_prompt ?? '',
        composed_user_prompt: m.user_prompt_template ?? '',
      };
      return {
        id: m.id,
        name: m.name,
        step_key: m.step_key,
        step_order: m.step_order,
        system_prompt: m.system_prompt,
        user_prompt_template: m.user_prompt_template,
        output_format: m.output_format,
        input_variables: normalizeInputVariables(m.input_variables),
        output_key: m.output_key,
        is_active: m.is_active,
        composed_system_prompt: c.composed_system_prompt,
        composed_user_prompt: c.composed_user_prompt,
      };
    }),
    output_settings: {
      video_id: videoId,
    },
    metadata: {
      workspace_id: workspaceId,
      source: 'auto-briefs-ui',
      locale,
    },
  };
}
