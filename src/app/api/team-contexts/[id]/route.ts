import { NextResponse } from 'next/server';

import { getApiMessages, getRequestLocale } from '@/lib/i18n/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const api = getApiMessages(await getRequestLocale(req));
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_contexts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: api.notFound }, { status: 404 });
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
    const api = getApiMessages(await getRequestLocale(req));
    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (typeof body.company_summary === 'string') updates.company_summary = body.company_summary;
    if (typeof body.target_industries === 'string') updates.target_industries = body.target_industries;
    if (typeof body.customers === 'string') updates.customers = body.customers;
    if (typeof body.competitors === 'string') updates.competitors = body.competitors;
    if (typeof body.team_role === 'string') updates.team_role = body.team_role;
    if (typeof body.briefing_goals === 'string') updates.briefing_goals = body.briefing_goals;
    if (typeof body.tone === 'string') updates.tone = body.tone;
    if (typeof body.notes === 'string') updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: api.noUpdateFields }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_contexts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: api.notFound }, { status: 404 });
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
    const { error } = await supabase.from('team_contexts').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
