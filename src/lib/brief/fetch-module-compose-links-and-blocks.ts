import type { SupabaseClient } from '@supabase/supabase-js';

import type { BlockRow, ModuleBlockLink } from '@/lib/brief/compose-module-prompts';

/**
 * generation_jobs の POST と同じクエリ・同じ BlockRow 組み立て。
 * prompt_module_blocks は DB の返却順に依存せず、composeModulePrompts 側で sort_order ソートする。
 */
export async function fetchModuleComposeLinksAndBlocks(
  supabase: SupabaseClient,
  moduleIds: string[]
): Promise<{ links: ModuleBlockLink[]; blocksById: Map<string, BlockRow> } | { error: string }> {
  let links: ModuleBlockLink[] = [];
  if (moduleIds.length > 0) {
    const { data: linksData, error: linkErr } = await supabase
      .from('prompt_module_blocks')
      .select('module_id, block_id, sort_order')
      .in('module_id', moduleIds);
    if (linkErr) {
      return { error: linkErr.message };
    }
    links = (linksData ?? []).map(
      (row: { module_id: string; block_id: string; sort_order: number }) => ({
        module_id: row.module_id,
        block_id: row.block_id,
        sort_order: row.sort_order,
      })
    );
  }

  const blockIds = [...new Set(links.map((l) => l.block_id))];
  const blocksById = new Map<string, BlockRow>();
  if (blockIds.length > 0) {
    const { data: blocksData, error: blockErr } = await supabase
      .from('prompt_blocks')
      .select('id, content, content_target, is_active')
      .in('id', blockIds);
    if (blockErr) {
      return { error: blockErr.message };
    }
    for (const b of blocksData ?? []) {
      const ct =
        b.content_target === 'system' || b.content_target === 'user' ? b.content_target : 'user';
      blocksById.set(b.id, {
        id: b.id,
        content: typeof b.content === 'string' ? b.content : '',
        content_target: ct,
        is_active: Boolean(b.is_active),
      });
    }
  }

  return { links, blocksById };
}
