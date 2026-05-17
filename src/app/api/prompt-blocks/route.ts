import { type NextRequest, NextResponse } from 'next/server';
import {
  normalizeCategory,
  normalizePartNumber,
  parseScopeType,
  validatePromptBlockScopeShape,
  validateStepBlockTemplateConsistency,
  isPromptBlockEligibleForModule,
} from '@/lib/brief/prompt-block-scope';
import { getDefaultWorkspaceId, getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const eligiblePipelineId = searchParams.get('eligible_pipeline_id');
    const eligibleModuleId = searchParams.get('eligible_module_id');

    let query = supabase.from('prompt_blocks').select('*');

    if (eligiblePipelineId && eligibleModuleId) {
      const { data: all, error: allErr } = await supabase
        .from('prompt_blocks')
        .select('*')
        .order('updated_at', { ascending: false });
      if (allErr) {
        return NextResponse.json({ error: allErr.message }, { status: 500 });
      }
      const filtered =
        all?.filter((b) =>
          isPromptBlockEligibleForModule(
            {
              id: b.id,
              scope_type: String(b.scope_type ?? 'global'),
              template_id: b.template_id as string | null,
              module_id: b.module_id as string | null,
            },
            eligiblePipelineId,
            eligibleModuleId
          )
        ) ?? [];
      return NextResponse.json(filtered);
    }

    if (searchParams.get('scope_type')) query = query.eq('scope_type', searchParams.get('scope_type')!);
    if (searchParams.get('template_id')) query = query.eq('template_id', searchParams.get('template_id')!);
    if (searchParams.get('module_id')) query = query.eq('module_id', searchParams.get('module_id')!);
    if (searchParams.get('category')) query = query.eq('category', searchParams.get('category')!);
    if (searchParams.get('content_target')) query = query.eq('content_target', searchParams.get('content_target')!);

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const block_key = typeof body.block_key === 'string' ? body.block_key.trim() : '';
    const content_target = body.content_target === 'system' || body.content_target === 'user' ? body.content_target : null;

    if (!name || !block_key || !content_target) {
      return NextResponse.json(
        { error: 'name, block_key, content_target（system または user）は必須です' },
        { status: 400 }
      );
    }

    const scope_type = parseScopeType(body.scope_type) ?? 'global';
    const template_id =
      typeof body.template_id === 'string' && body.template_id.trim() ? body.template_id.trim() : null;
    const module_id =
      typeof body.module_id === 'string' && body.module_id.trim() ? body.module_id.trim() : null;
    const category = normalizeCategory(body.category);
    const part_number = normalizePartNumber(body.part_number);

    const shapeErr = validatePromptBlockScopeShape({ scope_type, template_id, module_id });
    if (shapeErr) {
      return NextResponse.json({ error: shapeErr }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (scope_type === 'step') {
      const stepErr = await validateStepBlockTemplateConsistency(supabase, module_id!, template_id);
      if (stepErr) {
        return NextResponse.json({ error: stepErr }, { status: 400 });
      }
    }

    const workspaceId = getDefaultWorkspaceId();
    const row = {
      workspace_id: workspaceId,
      name,
      description: typeof body.description === 'string' ? body.description : '',
      block_key,
      block_type: typeof body.block_type === 'string' ? body.block_type : '',
      content_target,
      content: typeof body.content === 'string' ? body.content : '',
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
      scope_type,
      template_id,
      module_id,
      part_number,
      category,
    };

    const { data, error } = await supabase.from('prompt_blocks').insert(row).select('*').single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
