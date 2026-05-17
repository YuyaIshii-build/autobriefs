-- Prompt Blocks: 再利用可能なプロンプト部品と、Module への紐づけ
-- UNIQUE は block_key / sort_order には付けない（運用柔軟性）

CREATE TABLE public.prompt_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  block_key text NOT NULL,
  block_type text NOT NULL DEFAULT '',
  content_target text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_blocks_content_target_check CHECK (content_target IN ('system', 'user'))
);

CREATE INDEX prompt_blocks_block_type_idx ON public.prompt_blocks (block_type);

CREATE TRIGGER prompt_blocks_set_updated_at
  BEFORE UPDATE ON public.prompt_blocks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.prompt_module_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL,
  module_id uuid NOT NULL REFERENCES public.prompt_modules(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.prompt_blocks(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_module_blocks_sort_order_positive CHECK (sort_order > 0)
);

CREATE INDEX prompt_module_blocks_module_sort_idx
  ON public.prompt_module_blocks (module_id, sort_order);

CREATE TRIGGER prompt_module_blocks_set_updated_at
  BEFORE UPDATE ON public.prompt_module_blocks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
