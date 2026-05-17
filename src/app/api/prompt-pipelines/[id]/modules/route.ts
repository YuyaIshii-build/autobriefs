import { NextResponse } from 'next/server';
import { getDefaultWorkspaceId, getSupabaseAdmin } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: pipelineId } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_modules')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('step_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: pipelineId } = await ctx.params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const step_key = typeof body.step_key === 'string' ? body.step_key.trim() : '';
    const output_key = typeof body.output_key === 'string' ? body.output_key.trim() : '';
    const step_order = typeof body.step_order === 'number' ? body.step_order : Number(body.step_order);

    if (!name || !step_key || !output_key) {
      return NextResponse.json(
        { error: 'name, step_key, output_key は必須です' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(step_order) || step_order <= 0) {
      return NextResponse.json({ error: 'step_order は 1 以上の数値にしてください' }, { status: 400 });
    }

    const input_variables = normalizeJsonArray(body.input_variables);

    const workspaceId = getDefaultWorkspaceId();
    const row = {
      workspace_id: workspaceId,
      pipeline_id: pipelineId,
      name,
      step_key,
      step_order: Math.floor(step_order),
      system_prompt: typeof body.system_prompt === 'string' ? body.system_prompt : '',
      user_prompt_template:
        typeof body.user_prompt_template === 'string' ? body.user_prompt_template : '',
      output_format:
        typeof body.output_format === 'string' && body.output_format.length > 0
          ? body.output_format
          : null,
      input_variables,
      output_key,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_modules')
      .insert(row)
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
