import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_modules')
      .select('*')
      .eq('id', id)
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

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (typeof body.step_key === 'string') updates.step_key = body.step_key.trim();
    if (typeof body.output_key === 'string') updates.output_key = body.output_key.trim();
    if (typeof body.system_prompt === 'string') updates.system_prompt = body.system_prompt;
    if (typeof body.user_prompt_template === 'string') {
      updates.user_prompt_template = body.user_prompt_template;
    }
    if (typeof body.output_format === 'string') {
      updates.output_format = body.output_format.length > 0 ? body.output_format : null;
    }
    if (body.output_format === null) updates.output_format = null;
    if (body.input_variables !== undefined) {
      updates.input_variables = normalizeJsonArray(body.input_variables);
    }
    if (typeof body.step_order === 'number' || typeof body.step_order === 'string') {
      const n = Number(body.step_order);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: 'step_order は 1 以上の数値にしてください' }, { status: 400 });
      }
      updates.step_order = Math.floor(n);
    }
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '更新フィールドがありません' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_modules')
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
    const { error } = await supabase.from('prompt_modules').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function normalizeJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string');
  }
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v) as unknown;
      if (Array.isArray(p)) {
        return p.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}
