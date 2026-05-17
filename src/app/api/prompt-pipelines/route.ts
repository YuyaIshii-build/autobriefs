import { NextResponse } from 'next/server';
import { getDefaultWorkspaceId, getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_pipelines')
      .select('*')
      .order('updated_at', { ascending: false });

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
    if (!name) {
      return NextResponse.json({ error: 'name は必須です' }, { status: 400 });
    }

    const workspaceId = getDefaultWorkspaceId();
    const row = {
      workspace_id: workspaceId,
      name,
      description: typeof body.description === 'string' ? body.description : '',
      use_case: typeof body.use_case === 'string' ? body.use_case : '',
      output_type: typeof body.output_type === 'string' ? body.output_type : '',
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_pipelines')
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
