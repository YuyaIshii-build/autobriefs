import { NextResponse } from 'next/server';
import { isPromptBlockEligibleForModule } from '@/lib/brief/prompt-block-scope';
import { getDefaultWorkspaceId, getSupabaseAdmin } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

/** module id = [id] */
export async function GET(_req: Request, ctx: Ctx) {
  const moduleId = (await ctx.params).id;
  try {
    const supabase = getSupabaseAdmin();

    const { data: mod, error: modErr } = await supabase
      .from('prompt_modules')
      .select('id')
      .eq('id', moduleId)
      .maybeSingle();
    if (modErr) {
      return NextResponse.json({ error: modErr.message }, { status: 500 });
    }
    if (!mod) {
      return NextResponse.json({ error: 'Module が見つかりません' }, { status: 404 });
    }

    const { data: rows, error } = await supabase
      .from('prompt_module_blocks')
      .select('*')
      .eq('module_id', moduleId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows ?? [];
    const blockIds = [...new Set(list.map((r: { block_id: string }) => r.block_id))];
    const blocks: Record<string, unknown> = {};
    if (blockIds.length > 0) {
      const { data: bdata, error: berr } = await supabase.from('prompt_blocks').select('*').in('id', blockIds);
      if (berr) {
        return NextResponse.json({ error: berr.message }, { status: 500 });
      }
      for (const b of bdata ?? []) {
        blocks[(b as { id: string }).id] = b;
      }
    }

    const enriched = list.map((row: Record<string, unknown>) => ({
      ...row,
      prompt_block: blocks[row.block_id as string] ?? null,
    }));

    return NextResponse.json(enriched);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const moduleId = (await ctx.params).id;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const block_id = typeof body.block_id === 'string' ? body.block_id : '';
    const sort_order =
      typeof body.sort_order === 'number' ? body.sort_order : Number(body.sort_order);

    if (!block_id) {
      return NextResponse.json({ error: 'block_id は必須です' }, { status: 400 });
    }
    if (!Number.isFinite(sort_order) || sort_order <= 0) {
      return NextResponse.json({ error: 'sort_order は 1 以上の数値にしてください' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: mod, error: modErr } = await supabase
      .from('prompt_modules')
      .select('id, pipeline_id')
      .eq('id', moduleId)
      .maybeSingle();
    if (modErr) {
      return NextResponse.json({ error: modErr.message }, { status: 500 });
    }
    if (!mod) {
      return NextResponse.json({ error: 'Module が見つかりません' }, { status: 404 });
    }

    const { data: blk, error: blkErr } = await supabase
      .from('prompt_blocks')
      .select('id, scope_type, template_id, module_id')
      .eq('id', block_id)
      .maybeSingle();
    if (blkErr) {
      return NextResponse.json({ error: blkErr.message }, { status: 500 });
    }
    if (!blk) {
      return NextResponse.json({ error: 'Block が見つかりません' }, { status: 404 });
    }

    if (
      !isPromptBlockEligibleForModule(
        {
          id: blk.id,
          scope_type: String(blk.scope_type ?? 'global'),
          template_id: blk.template_id as string | null,
          module_id: blk.module_id as string | null,
        },
        mod.pipeline_id as string,
        moduleId
      )
    ) {
      return NextResponse.json(
        {
          error:
            'この Block はこの Step に追加できません（global / 同一Template / 同一Step の Block のみ）',
        },
        { status: 400 }
      );
    }

    const workspaceId = getDefaultWorkspaceId();
    const { data, error } = await supabase
      .from('prompt_module_blocks')
      .insert({
        workspace_id: workspaceId,
        module_id: moduleId,
        block_id,
        sort_order: Math.floor(sort_order),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
