import type { SupabaseClient } from '@supabase/supabase-js';

export type ScopeType = 'global' | 'template' | 'step';

export const PROMPT_BLOCK_CATEGORIES = [
  'role',
  'output_format',
  'dialogue_rules',
  'topic_rules',
  'layout_rules',
  'prohibition_rules',
  'part_rules',
  'conversation_flow',
  'variables',
  'other',
] as const;

export function parseScopeType(v: unknown): ScopeType | null {
  if (v === 'global' || v === 'template' || v === 'step') return v;
  return null;
}

export function normalizeCategory(v: unknown): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return 'other';
}

export function normalizePartNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** 同期: scope_type と FK カラムの形のみ。step+template_id の整合は別関数。 */
export function validatePromptBlockScopeShape(params: {
  scope_type: ScopeType;
  template_id: string | null;
  module_id: string | null;
}): string | null {
  const { scope_type, template_id, module_id } = params;
  if (scope_type === 'global') {
    if (template_id != null) return 'global のとき template_id は指定できません（null にしてください）';
    if (module_id != null) return 'global のとき module_id は指定できません（null にしてください）';
    return null;
  }
  if (scope_type === 'template') {
    if (!template_id) return 'template のとき template_id は必須です';
    if (module_id != null) return 'template のとき module_id は null にしてください';
    return null;
  }
  if (scope_type === 'step') {
    if (!module_id) return 'step のとき module_id は必須です';
    return null;
  }
  return '不正な scope_type です';
}

/** step かつ template_id 指定時、module が属する pipeline と一致するか */
export async function validateStepBlockTemplateConsistency(
  supabase: SupabaseClient,
  moduleId: string,
  templateId: string | null
): Promise<string | null> {
  if (!templateId) return null;
  const { data: mod, error } = await supabase
    .from('prompt_modules')
    .select('pipeline_id')
    .eq('id', moduleId)
    .maybeSingle();
  if (error) return error.message;
  if (!mod) return 'module が見つかりません';
  if (mod.pipeline_id !== templateId) {
    return 'template_id がこの Step（module）の属する Template と一致しません';
  }
  return null;
}

export type PromptBlockScopeRow = {
  id: string;
  scope_type: string;
  template_id: string | null;
  module_id: string | null;
};

export function isPromptBlockEligibleForModule(
  block: PromptBlockScopeRow,
  pipelineId: string,
  moduleId: string
): boolean {
  if (block.scope_type === 'global') return true;
  if (block.scope_type === 'template' && block.template_id === pipelineId) return true;
  if (block.scope_type === 'step' && block.module_id === moduleId) return true;
  return false;
}
