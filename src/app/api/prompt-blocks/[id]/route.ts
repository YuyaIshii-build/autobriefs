import { NextResponse } from 'next/server';
import {
  normalizeCategory,
  normalizePartNumber,
  parseScopeType,
  validatePromptBlockScopeShape,
  validateStepBlockTemplateConsistency,
} from '@/lib/brief/prompt-block-scope';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('prompt_blocks').select('*').eq('id', id).maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: '見つかりません' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { data: current, error: curErr } = await supabase
      .from('prompt_blocks')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (curErr) {
      return NextResponse.json({ error: curErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: '見つかりません' }, { status: 404 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    let scope_type = parseScopeType(body.scope_type !== undefined ? body.scope_type : current.scope_type);
    if (body.scope_type !== undefined && !parseScopeType(body.scope_type)) {
      return NextResponse.json({ error: 'scope_type は global, template, step のいずれかです' }, { status: 400 });
    }
    if (!scope_type) scope_type = 'global';

    let template_id: string | null = current.template_id;
    if (body.template_id !== undefined) {
      if (body.template_id === null || body.template_id === '') template_id = null;
      else if (typeof body.template_id === 'string') template_id = body.template_id.trim() || null;
    }

    let module_id: string | null = current.module_id;
    if (body.module_id !== undefined) {
      if (body.module_id === null || body.module_id === '') module_id = null;
      else if (typeof body.module_id === 'string') module_id = body.module_id.trim() || null;
    }

    if (scope_type === 'global') {
      template_id = null;
      module_id = null;
    } else if (scope_type === 'template') {
      module_id = null;
    }

    const shapeErr = validatePromptBlockScopeShape({ scope_type, template_id, module_id });
    if (shapeErr) {
      return NextResponse.json({ error: shapeErr }, { status: 400 });
    }

    if (scope_type === 'step' && module_id) {
      const stepErr = await validateStepBlockTemplateConsistency(supabase, module_id, template_id);
      if (stepErr) {
        return NextResponse.json({ error: stepErr }, { status: 400 });
      }
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (typeof body.description === 'string') updates.description = body.description;
    if (typeof body.block_key === 'string') updates.block_key = body.block_key.trim();
    if (typeof body.block_type === 'string') updates.block_type = body.block_type;
    if (body.content_target === 'system' || body.content_target === 'user') {
      updates.content_target = body.content_target;
    }
    if (typeof body.content === 'string') updates.content = body.content;
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;

    if (
      body.scope_type !== undefined ||
      body.template_id !== undefined ||
      body.module_id !== undefined
    ) {
      updates.scope_type = scope_type;
      updates.template_id = template_id;
      updates.module_id = module_id;
    }
    if (body.part_number !== undefined) {
      updates.part_number = normalizePartNumber(body.part_number);
    }
    if (body.category !== undefined) {
      updates.category = normalizeCategory(body.category);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '更新フィールドがありません' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('prompt_blocks')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: '見つかりません' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('prompt_blocks').delete().eq('id', id);
    if (error) {
      if (error.code === '23503' || error.message.includes('foreign key')) {
        return NextResponse.json(
          { error: 'この Block は Module に紐づいているため削除できません。先に紐づけを外してください。' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
