import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { composeModulePrompts } from '@/lib/brief/compose-module-prompts';
import { fetchModuleComposeLinksAndBlocks } from '@/lib/brief/fetch-module-compose-links-and-blocks';
import { buildN8nBriefPayload } from '@/lib/brief/n8n-payload';
import { resolveN8nBriefWebhookUrl } from '@/lib/brief/resolve-n8n-brief-webhook';
import { generateVideoId } from '@/lib/brief/video-id';
import { getDefaultWorkspaceId, getSupabaseAdmin } from '@/lib/supabase/admin';
import type { PromptModuleRow, PromptPipelineRow, TeamContextRow } from '@/lib/brief/n8n-payload';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('generation_jobs')
      .select(
        `id, status, news_title, news_url, result_url, error_message, created_at, updated_at,
         team_context_id, prompt_pipeline_id,
         team_contexts ( name ),
         prompt_pipelines ( name )`
      )
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type JobRow = {
      id: string;
      status: string;
      news_title: string;
      news_url: string;
      result_url: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
      team_context_id: string;
      prompt_pipeline_id: string;
      team_contexts: { name: string } | { name: string }[] | null;
      prompt_pipelines: { name: string } | { name: string }[] | null;
    };

    const rows = (data ?? []) as JobRow[];
    const enriched = rows.map((row) => {
      const team = Array.isArray(row.team_contexts) ? row.team_contexts[0] : row.team_contexts;
      const pipeline = Array.isArray(row.prompt_pipelines) ? row.prompt_pipelines[0] : row.prompt_pipelines;
      return {
        id: row.id,
        status: row.status,
        news_title: row.news_title,
        news_url: row.news_url,
        result_url: row.result_url,
        error_message: row.error_message,
        created_at: row.created_at,
        updated_at: row.updated_at,
        team_context_id: row.team_context_id,
        prompt_pipeline_id: row.prompt_pipeline_id,
        team_name: team?.name ?? null,
        brief_type_name: pipeline?.name ?? null,
      };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const team_context_id = typeof body.team_context_id === 'string' ? body.team_context_id : '';
    const prompt_pipeline_id =
      typeof body.prompt_pipeline_id === 'string' ? body.prompt_pipeline_id : '';
    const news_title = typeof body.news_title === 'string' ? body.news_title : '';
    const news_url = typeof body.news_url === 'string' ? body.news_url : '';
    const news_body = typeof body.news_body === 'string' ? body.news_body : '';
    const news_notes = typeof body.news_notes === 'string' ? body.news_notes : '';

    if (!team_context_id.trim()) {
      return NextResponse.json({ error: 'Team Context は必須です' }, { status: 400 });
    }
    if (!prompt_pipeline_id.trim()) {
      return NextResponse.json({ error: 'Brief Type は必須です' }, { status: 400 });
    }
    if (!news_body.trim()) {
      return NextResponse.json({ error: 'ニュース本文・要約は必須です' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const workspaceId = getDefaultWorkspaceId();

    const resolvedPipelineId = prompt_pipeline_id.trim();

    const { data: team, error: teamErr } = await supabase
      .from('team_contexts')
      .select('*')
      .eq('id', team_context_id)
      .maybeSingle();

    if (teamErr) {
      return NextResponse.json({ error: teamErr.message }, { status: 500 });
    }
    if (!team) {
      return NextResponse.json({ error: 'Team Context が見つかりません' }, { status: 404 });
    }

    const { data: pipeline, error: pipeErr } = await supabase
      .from('prompt_pipelines')
      .select('*')
      .eq('id', resolvedPipelineId)
      .maybeSingle();

    if (pipeErr) {
      return NextResponse.json({ error: pipeErr.message }, { status: 500 });
    }
    if (!pipeline) {
      return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });
    }

    let webhook: { url: string; locale: 'ja' | 'en' };
    try {
      webhook = resolveN8nBriefWebhookUrl(pipeline.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { data: modulesRaw, error: modErr } = await supabase
      .from('prompt_modules')
      .select('*')
      .eq('pipeline_id', resolvedPipelineId)
      .order('step_order', { ascending: true })
      .order('id', { ascending: true });

    if (modErr) {
      return NextResponse.json({ error: modErr.message }, { status: 500 });
    }

    const modules = (modulesRaw ?? []) as PromptModuleRow[];
    const moduleIds = modules.map((m) => m.id);

    const fetched = await fetchModuleComposeLinksAndBlocks(supabase, moduleIds);
    if ('error' in fetched) {
      return NextResponse.json({ error: fetched.error }, { status: 500 });
    }
    const { links, blocksById } = fetched;

    const composedByModuleId: Record<
      string,
      { composed_system_prompt: string; composed_user_prompt: string }
    > = {};
    for (const m of modules) {
      composedByModuleId[m.id] = composeModulePrompts({
        moduleId: m.id,
        links,
        blocksById,
        fallbackSystem: m.system_prompt ?? '',
        fallbackUser: m.user_prompt_template ?? '',
      });
    }

    const jobId = randomUUID();
    const videoId = generateVideoId();

    const payload = buildN8nBriefPayload({
      jobId,
      videoId,
      workspaceId,
      locale: webhook.locale,
      team: team as TeamContextRow,
      pipeline: pipeline as PromptPipelineRow,
      modules,
      composedByModuleId,
      news: { title: news_title, url: news_url, body: news_body, notes: news_notes },
    });

    const insertRow = {
      id: jobId,
      workspace_id: workspaceId,
      team_context_id,
      prompt_pipeline_id: resolvedPipelineId,
      news_title,
      news_url,
      news_body,
      news_notes,
      status: 'pending' as const,
      n8n_payload: payload as unknown as Record<string, unknown>,
    };

    const { error: insErr } = await supabase.from('generation_jobs').insert(insertRow);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    let n8nOk = false;
    let n8nError = '';
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      n8nOk = res.ok;
      if (!n8nOk) {
        const t = await res.text();
        n8nError = `n8n HTTP ${res.status}${t ? `: ${t.slice(0, 500)}` : ''}`;
      }
    } catch (err) {
      n8nOk = false;
      n8nError = err instanceof Error ? err.message : String(err);
    }

    const finalStatus = n8nOk ? 'sent_to_n8n' : 'failed';
    const { data: updated, error: updErr } = await supabase
      .from('generation_jobs')
      .update({
        status: finalStatus,
        error_message: n8nOk ? null : n8nError,
      })
      .eq('id', jobId)
      .select('*')
      .single();

    if (updErr) {
      return NextResponse.json(
        { error: `ジョブは作成されましたが status 更新に失敗: ${updErr.message}`, job_id: jobId },
        { status: 500 }
      );
    }

    return NextResponse.json(updated, { status: n8nOk ? 201 : 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
