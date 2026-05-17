export type BlockRow = {
  id: string;
  content: string;
  content_target: 'system' | 'user';
  is_active: boolean;
};

export type ModuleBlockLink = {
  module_id: string;
  block_id: string;
  sort_order: number;
};

/** composeModulePrompts が legacy 分岐に入るかどうかと一致 */
export function getModuleComposeMode(
  links: ModuleBlockLink[],
  moduleId: string
): 'blocks' | 'legacy_fallback' {
  const forModule = links.filter((l) => l.module_id === moduleId);
  return forModule.length === 0 ? 'legacy_fallback' : 'blocks';
}

/**
 * prompt_module_blocks + prompt_blocks から合成。
 * 紐づけが 0 件のときは legacy の system / user をそのまま返す。
 */
export function composeModulePrompts(params: {
  moduleId: string;
  links: ModuleBlockLink[];
  blocksById: Map<string, BlockRow>;
  fallbackSystem: string;
  fallbackUser: string;
}): { composed_system_prompt: string; composed_user_prompt: string } {
  const { moduleId, links, blocksById, fallbackSystem, fallbackUser } = params;

  const forModule = links
    .filter((l) => l.module_id === moduleId)
    .sort((a, b) => a.sort_order - b.sort_order || a.block_id.localeCompare(b.block_id));

  if (forModule.length === 0) {
    return {
      composed_system_prompt: fallbackSystem,
      composed_user_prompt: fallbackUser,
    };
  }

  const systemParts: string[] = [];
  const userParts: string[] = [];

  for (const link of forModule) {
    const block = blocksById.get(link.block_id);
    if (!block || !block.is_active) continue;
    const text = (block.content ?? '').trim();
    if (!text) continue;
    if (block.content_target === 'system') {
      systemParts.push(text);
    } else {
      userParts.push(text);
    }
  }

  return {
    composed_system_prompt: systemParts.join('\n\n'),
    composed_user_prompt: userParts.join('\n\n'),
  };
}
