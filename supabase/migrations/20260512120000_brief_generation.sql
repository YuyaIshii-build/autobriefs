-- B2B brief: team contexts, prompt pipelines/modules, generation jobs
-- RLS/Auth は未実装。サーバーは service_role のみ利用想定。
-- トリガー: もし EXECUTE PROCEDURE でエラーになる場合は EXECUTE FUNCTION に置き換えてください（Postgres バージョン依存）。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.team_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL,
  name text NOT NULL,
  company_summary text NOT NULL DEFAULT '',
  target_industries text NOT NULL DEFAULT '',
  customers text NOT NULL DEFAULT '',
  competitors text NOT NULL DEFAULT '',
  team_role text NOT NULL DEFAULT '',
  briefing_goals text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER team_contexts_set_updated_at
  BEFORE UPDATE ON public.team_contexts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.prompt_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  use_case text NOT NULL DEFAULT '',
  output_type text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER prompt_pipelines_set_updated_at
  BEFORE UPDATE ON public.prompt_pipelines
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.prompt_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL,
  pipeline_id uuid NOT NULL REFERENCES public.prompt_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  step_key text NOT NULL,
  step_order integer NOT NULL,
  system_prompt text NOT NULL DEFAULT '',
  user_prompt_template text NOT NULL DEFAULT '',
  output_format text NULL,
  input_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_modules_step_order_positive CHECK (step_order > 0)
);

CREATE INDEX prompt_modules_pipeline_id_step_order_idx
  ON public.prompt_modules (pipeline_id, step_order);

CREATE TRIGGER prompt_modules_set_updated_at
  BEFORE UPDATE ON public.prompt_modules
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL,
  team_context_id uuid NOT NULL REFERENCES public.team_contexts(id) ON DELETE RESTRICT,
  prompt_pipeline_id uuid NOT NULL REFERENCES public.prompt_pipelines(id) ON DELETE RESTRICT,
  news_title text NOT NULL DEFAULT '',
  news_url text NOT NULL DEFAULT '',
  news_body text NOT NULL DEFAULT '',
  news_notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  n8n_payload jsonb NULL,
  result_url text NULL,
  error_message text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_jobs_status_check CHECK (
    status IN ('pending', 'sent_to_n8n', 'processing', 'completed', 'failed')
  )
);

CREATE INDEX generation_jobs_created_at_idx
  ON public.generation_jobs (created_at DESC);

CREATE TRIGGER generation_jobs_set_updated_at
  BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
