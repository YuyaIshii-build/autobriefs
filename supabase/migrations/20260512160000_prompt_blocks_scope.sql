-- prompt_blocks: スコープ・分類・Part 番号
-- common は DB に入れず global / template / step のみ

ALTER TABLE public.prompt_blocks
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS template_id uuid NULL REFERENCES public.prompt_pipelines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS module_id uuid NULL REFERENCES public.prompt_modules(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS part_number integer NULL,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';

-- 既存行の移行
UPDATE public.prompt_blocks
SET
  scope_type = 'global',
  template_id = NULL,
  module_id = NULL,
  part_number = NULL,
  category = 'other';

ALTER TABLE public.prompt_blocks
  DROP CONSTRAINT IF EXISTS prompt_blocks_scope_type_check,
  DROP CONSTRAINT IF EXISTS prompt_blocks_scope_shape_check;

ALTER TABLE public.prompt_blocks
  ADD CONSTRAINT prompt_blocks_scope_type_check CHECK (scope_type IN ('global', 'template', 'step')),
  ADD CONSTRAINT prompt_blocks_scope_shape_check CHECK (
    (scope_type = 'global' AND template_id IS NULL AND module_id IS NULL)
    OR (scope_type = 'template' AND template_id IS NOT NULL AND module_id IS NULL)
    OR (scope_type = 'step' AND module_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS prompt_blocks_scope_type_idx ON public.prompt_blocks (scope_type);
CREATE INDEX IF NOT EXISTS prompt_blocks_template_id_idx ON public.prompt_blocks (template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prompt_blocks_module_id_idx ON public.prompt_blocks (module_id) WHERE module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prompt_blocks_category_idx ON public.prompt_blocks (category);
