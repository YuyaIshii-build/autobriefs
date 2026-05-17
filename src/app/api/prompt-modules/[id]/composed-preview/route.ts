import { NextResponse } from 'next/server';

import { composeModulePrompts, getModuleComposeMode } from '@/lib/brief/compose-module-prompts';
import { fetchModuleComposeLinksAndBlocks } from '@/lib/brief/fetch-module-compose-links-and-blocks';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const moduleId = (await ctx.params).id;
  try {
    const supabase = getSupabaseAdmin();

    const { data: mod, error: modErr } = await supabase
      .from('prompt_modules')
      .select('id, system_prompt, user_prompt_template')
      .eq('id', moduleId)
      .maybeSingle();

    if (modErr) {
      return NextResponse.json({ error: modErr.message }, { status: 500 });
    }
    if (!mod) {
      return NextResponse.json({ error: 'Module が見つかりません' }, { status: 404 });
    }

    const fetched = await fetchModuleComposeLinksAndBlocks(supabase, [moduleId]);
    if ('error' in fetched) {
      return NextResponse.json({ error: fetched.error }, { status: 500 });
    }
    const { links, blocksById } = fetched;

    const composed = composeModulePrompts({
      moduleId,
      links,
      blocksById,
      fallbackSystem: mod.system_prompt ?? '',
      fallbackUser: mod.user_prompt_template ?? '',
    });

    const mode = getModuleComposeMode(links, moduleId);

    return NextResponse.json({
      composed_system_prompt: composed.composed_system_prompt,
      composed_user_prompt: composed.composed_user_prompt,
      mode,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
