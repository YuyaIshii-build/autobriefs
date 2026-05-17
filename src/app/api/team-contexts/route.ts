import { NextResponse } from 'next/server';
import { getDefaultWorkspaceId, getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_contexts')
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
      company_summary: str(body.company_summary),
      target_industries: str(body.target_industries),
      customers: str(body.customers),
      competitors: str(body.competitors),
      team_role: str(body.team_role),
      briefing_goals: str(body.briefing_goals),
      tone: str(body.tone),
      notes: str(body.notes),
    };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_contexts')
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

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
