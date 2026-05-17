#!/usr/bin/env node
/**
 * Build n8n brief payload for EN pipeline + EN team context (no webhook, no DB insert).
 * Usage: node scripts/build-en-brief-payload-dry-run.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const EN_TEAM_CONTEXT_ID = '463adde8-f01b-4098-8ae8-76882d9a5ecf';
const EN_PIPELINE_ID = 'f3808527-76a2-45f5-822c-e6698c918211';
const EN_TEAM_NAME = 'AI & DX Strategy Team';
const EN_PIPELINE_NAME = 'Business News Brief EN';

const EXPECTED_STEP_KEYS = [
  'story_outline',
  'part_001_script',
  'part_002_script',
  'part_003_script',
  'part_004_script',
  'part_005_script',
];

const EXPECTED_OUTPUT_KEYS = [...EXPECTED_STEP_KEYS];

const JP_MARKERS = ['あなたは', 'ニュース本文', 'チーム', '台本', '文字', 'みなさん'];

const SAMPLE_NEWS = {
  title: 'OpenAI launches deployment company with investment firms and SoftBank',
  url: '',
  body: `OpenAI is forming a new deployment company to place consultants and engineers inside large enterprise accounts, according to people familiar with the plans.

The initiative is backed by investment firms and SoftBank, and is aimed at accelerating adoption of generative AI beyond pilots. The model resembles a hybrid of product deployment and professional services, with OpenAI teams working alongside customer IT, business units, and existing systems integrators.

For enterprise buyers, the move could shorten time-to-value on AI rollouts but also intensify competition among consulting firms, cloud partners, and traditional systems integrators that already sell transformation programs.

Analysts say the structure reflects demand for hands-on implementation support, not just API access, as boards press for measurable outcomes from AI budgets.`,
  notes:
    'Focus on enterprise AI adoption, systems integrators, and consulting competition.',
};

const JSON_OUT = path.join(root, 'exports/en-brief-payload-dry-run.json');
const MD_OUT = path.join(root, 'exports/en-brief-payload-review.md');

function loadEnv() {
  return Object.fromEntries(
    readFileSync(path.join(root, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function generateVideoId() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function composeModulePrompts({ moduleId, links, blocksById, fallbackSystem, fallbackUser }) {
  const forModule = links
    .filter((l) => l.module_id === moduleId)
    .sort((a, b) => a.sort_order - b.sort_order || a.block_id.localeCompare(b.block_id));

  if (forModule.length === 0) {
    return {
      composed_system_prompt: fallbackSystem,
      composed_user_prompt: fallbackUser,
    };
  }

  const systemParts = [];
  const userParts = [];
  for (const link of forModule) {
    const block = blocksById.get(link.block_id);
    if (!block || !block.is_active) continue;
    const text = (block.content ?? '').trim();
    if (!text) continue;
    if (block.content_target === 'system') systemParts.push(text);
    else userParts.push(text);
  }

  return {
    composed_system_prompt: systemParts.join('\n\n'),
    composed_user_prompt: userParts.join('\n\n'),
  };
}

function dedupePromptModulesForPayload(modules) {
  const sorted = [...modules].sort((a, b) => {
    if (a.step_order !== b.step_order) return a.step_order - b.step_order;
    return a.id.localeCompare(b.id);
  });
  const seenIds = new Set();
  const seenStepKeys = new Set();
  const out = [];
  for (const m of sorted) {
    if (seenIds.has(m.id)) continue;
    const stepKey = typeof m.step_key === 'string' ? m.step_key.trim() : '';
    if (stepKey && seenStepKeys.has(stepKey)) continue;
    seenIds.add(m.id);
    if (stepKey) seenStepKeys.add(stepKey);
    out.push(m);
  }
  return out;
}

function normalizeInputVariables(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => typeof x === 'string');
}

function buildN8nBriefPayload({
  jobId,
  videoId,
  workspaceId,
  locale,
  team,
  pipeline,
  modules,
  composedByModuleId,
  news,
}) {
  const uniqueModules = dedupePromptModulesForPayload(modules);
  return {
    schema_version: 2,
    job_id: jobId,
    team_context: {
      id: team.id,
      name: team.name,
      company_summary: team.company_summary,
      target_industries: team.target_industries,
      customers: team.customers,
      competitors: team.competitors,
      team_role: team.team_role,
      briefing_goals: team.briefing_goals,
      tone: team.tone,
      notes: team.notes,
    },
    news_input: {
      title: news.title,
      url: news.url,
      body: news.body,
      notes: news.notes,
    },
    prompt_pipeline: {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      use_case: pipeline.use_case,
      output_type: pipeline.output_type,
      is_active: pipeline.is_active,
    },
    prompt_modules: uniqueModules.map((m) => {
      const c = composedByModuleId[m.id] ?? {
        composed_system_prompt: m.system_prompt ?? '',
        composed_user_prompt: m.user_prompt_template ?? '',
      };
      return {
        id: m.id,
        name: m.name,
        step_key: m.step_key,
        step_order: m.step_order,
        system_prompt: m.system_prompt,
        user_prompt_template: m.user_prompt_template,
        output_format: m.output_format,
        input_variables: normalizeInputVariables(m.input_variables),
        output_key: m.output_key,
        is_active: m.is_active,
        composed_system_prompt: c.composed_system_prompt,
        composed_user_prompt: c.composed_user_prompt,
      };
    }),
    output_settings: { video_id: videoId },
    metadata: { workspace_id: workspaceId, source: 'auto-briefs-ui', locale },
  };
}

async function fetchModuleComposeLinksAndBlocks(supabase, moduleIds) {
  let links = [];
  if (moduleIds.length > 0) {
    const { data, error } = await supabase
      .from('prompt_module_blocks')
      .select('module_id, block_id, sort_order')
      .in('module_id', moduleIds);
    if (error) throw new Error(error.message);
    links = data ?? [];
  }
  const blockIds = [...new Set(links.map((l) => l.block_id))];
  const blocksById = new Map();
  if (blockIds.length > 0) {
    const { data, error } = await supabase
      .from('prompt_blocks')
      .select('id, content, content_target, is_active')
      .in('id', blockIds);
    if (error) throw new Error(error.message);
    for (const b of data ?? []) {
      const ct = b.content_target === 'system' || b.content_target === 'user' ? b.content_target : 'user';
      blocksById.set(b.id, {
        id: b.id,
        content: typeof b.content === 'string' ? b.content : '',
        content_target: ct,
        is_active: Boolean(b.is_active),
      });
    }
  }
  return { links, blocksById };
}

function countCjk(text) {
  return (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
}

function validatePayload(payload, input) {
  const allComposed = payload.prompt_modules
    .flatMap((m) => [m.composed_system_prompt, m.composed_user_prompt])
    .join('\n\n');

  const jpMarkerHits = {};
  for (const marker of JP_MARKERS) {
    jpMarkerHits[marker] = allComposed.includes(marker);
  }
  const anyJpMarker = Object.values(jpMarkerHits).some(Boolean);

  const teamContextJpMarkers = {};
  const teamText = JSON.stringify(payload.team_context);
  for (const marker of JP_MARKERS) {
    teamContextJpMarkers[marker] = teamText.includes(marker);
  }

  const checks = {
    team_context_id_matches: payload.team_context.id === EN_TEAM_CONTEXT_ID,
    team_context_name: payload.team_context.name === EN_TEAM_NAME,
    pipeline_id_matches: payload.prompt_pipeline.id === EN_PIPELINE_ID,
    pipeline_name: payload.prompt_pipeline.name === EN_PIPELINE_NAME,
    prompt_modules_count: payload.prompt_modules.length === 6,
    step_keys: payload.prompt_modules.map((m) => m.step_key),
    output_keys: payload.prompt_modules.map((m) => m.output_key),
    step_keys_match:
      JSON.stringify(payload.prompt_modules.map((m) => m.step_key)) ===
      JSON.stringify(EXPECTED_STEP_KEYS),
    output_keys_match:
      JSON.stringify(payload.prompt_modules.map((m) => m.output_key)) ===
      JSON.stringify(EXPECTED_OUTPUT_KEYS),
    has_50_char_rule: allComposed.includes('50文字') || allComposed.includes('最大50'),
    has_120_char_rule: allComposed.includes('120 characters'),
    jp_markers_in_composed_prompts: jpMarkerHits,
    any_jp_marker_in_composed: anyJpMarker,
    jp_markers_in_team_context: teamContextJpMarkers,
    composed_cjk_char_count: countCjk(allComposed),
    story_outline_english:
      payload.prompt_modules.find((m) => m.step_key === 'story_outline')?.composed_system_prompt?.includes(
        'Business Brief Strategist'
      ) ?? false,
    part1_english:
      payload.prompt_modules
        .find((m) => m.step_key === 'part_001_script')
        ?.composed_system_prompt?.includes('Role and purpose') ?? false,
    schema_version: payload.schema_version === 2,
    has_required_top_level: [
      'job_id',
      'team_context',
      'news_input',
      'prompt_pipeline',
      'prompt_modules',
      'output_settings',
      'metadata',
    ].every((k) => k in payload),
    news_input_shape:
      typeof payload.news_input?.title === 'string' &&
      typeof payload.news_input?.body === 'string',
    output_settings_video_id: typeof payload.output_settings?.video_id === 'string',
    metadata_source: payload.metadata?.source === 'auto-briefs-ui',
    metadata_locale: payload.metadata?.locale === 'en',
    input_ids_used: input,
  };

  checks.all_passed =
    checks.team_context_id_matches &&
    checks.team_context_name &&
    checks.pipeline_id_matches &&
    checks.pipeline_name &&
    checks.prompt_modules_count &&
    checks.step_keys_match &&
    checks.output_keys_match &&
    !checks.has_50_char_rule &&
    checks.has_120_char_rule &&
    !checks.any_jp_marker_in_composed &&
    checks.story_outline_english &&
    checks.part1_english &&
    checks.schema_version &&
    checks.has_required_top_level &&
    checks.metadata_locale;

  return checks;
}

function buildReviewMd({ payload, checks, trace }) {
  const lines = [];
  lines.push('# EN Brief n8n Payload — Dry Run Review');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('**No webhook sent. No generation_jobs INSERT.**');
  lines.push('');
  lines.push('## Payload generation trace (app parity)');
  lines.push('');
  lines.push('| Step | App behavior | This dry-run |');
  lines.push('|------|----------------|--------------|');
  lines.push('| 1 | `CreateBriefForm` POSTs `team_context_id`, `prompt_pipeline_id`, news fields | Same IDs / sample news |');
  lines.push('| 2 | `POST /api/generation-jobs` loads team + pipeline by ID | Same Supabase queries |');
  lines.push('| 3 | Loads `prompt_modules` for `pipeline_id` | Same |');
  lines.push('| 4 | `fetchModuleComposeLinksAndBlocks` + `composeModulePrompts` | Same logic (mirrored) |');
  lines.push('| 5 | `buildN8nBriefPayload` | Same logic (mirrored) |');
  lines.push('| 6 | Webhook + `generation_jobs` insert | **Skipped** |');
  lines.push('');
  lines.push('## Input IDs');
  lines.push('');
  lines.push(`- team_context_id: \`${trace.team_context_id}\``);
  lines.push(`- prompt_pipeline_id: \`${trace.prompt_pipeline_id}\``);
  lines.push('');
  lines.push('## Validation summary');
  lines.push('');
  lines.push(`**Overall: ${checks.all_passed ? 'PASSED' : 'FAILED'}**`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(checks, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Top-level payload');
  lines.push('');
  lines.push(`- job_id: \`${payload.job_id}\` (dry-run UUID, not persisted)`);
  lines.push(`- team_context.name: **${payload.team_context.name}**`);
  lines.push(`- prompt_pipeline.name: **${payload.prompt_pipeline.name}**`);
  lines.push(`- prompt_modules: ${payload.prompt_modules.length}`);
  lines.push(`- video_id: \`${payload.output_settings.video_id}\``);
  lines.push('');
  lines.push('## Modules');
  lines.push('');
  lines.push('| step_order | step_key | output_key | name | sys len | user len |');
  lines.push('|------------|----------|------------|------|---------|----------|');
  for (const m of payload.prompt_modules) {
    lines.push(
      `| ${m.step_order} | \`${m.step_key}\` | \`${m.output_key}\` | ${m.name} | ${m.composed_system_prompt.length} | ${m.composed_user_prompt.length} |`
    );
  }
  lines.push('');
  lines.push('## Composed prompt previews');
  lines.push('');
  for (const m of payload.prompt_modules) {
    lines.push(`### ${m.step_key} — system (first 400 chars)`);
    lines.push('');
    lines.push('```');
    lines.push(m.composed_system_prompt.slice(0, 400) || '(empty)');
    lines.push('```');
    lines.push('');
    lines.push(`### ${m.step_key} — user (first 400 chars)`);
    lines.push('');
    lines.push('```');
    lines.push(m.composed_user_prompt.slice(0, 400) || '(empty)');
    lines.push('```');
    lines.push('');
  }
  lines.push('## n8n compatibility');
  lines.push('');
  lines.push('- `schema_version: 2` — unchanged');
  lines.push('- Top-level keys match `N8nBriefPayload` in `src/lib/brief/n8n-payload.ts`');
  lines.push('- `prompt_modules[]` still includes `composed_system_prompt` / `composed_user_prompt` per module');
  lines.push('- Placeholders `{{team_context}}`, `{{news_body}}`, etc. remain in templates for n8n substitution');
  lines.push('');
  lines.push('## Next step');
  lines.push('');
  lines.push(
    checks.all_passed
      ? 'Ready to duplicate n8n workflow for EN (same JSON shape; English prompts + TTS).'
      : 'Fix failing checks before n8n EN workflow work.'
  );
  return lines.join('\n');
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const workspaceId = env.WORKSPACE_ID?.trim() || null;

  const { data: team, error: teamErr } = await supabase
    .from('team_contexts')
    .select('*')
    .eq('id', EN_TEAM_CONTEXT_ID)
    .maybeSingle();
  if (teamErr) throw new Error(teamErr.message);
  if (!team) throw new Error(`Team Context not found: ${EN_TEAM_CONTEXT_ID}`);

  const { data: pipeline, error: pipeErr } = await supabase
    .from('prompt_pipelines')
    .select('*')
    .eq('id', EN_PIPELINE_ID)
    .maybeSingle();
  if (pipeErr) throw new Error(pipeErr.message);
  if (!pipeline) throw new Error(`Pipeline not found: ${EN_PIPELINE_ID}`);

  const { data: modulesRaw, error: modErr } = await supabase
    .from('prompt_modules')
    .select('*')
    .eq('pipeline_id', EN_PIPELINE_ID)
    .order('step_order', { ascending: true })
    .order('id', { ascending: true });
  if (modErr) throw new Error(modErr.message);

  const modules = modulesRaw ?? [];
  const moduleIds = modules.map((m) => m.id);
  const { links, blocksById } = await fetchModuleComposeLinksAndBlocks(supabase, moduleIds);

  const composedByModuleId = {};
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
    locale: 'en',
    team,
    pipeline,
    modules,
    composedByModuleId,
    news: SAMPLE_NEWS,
  });

  const checks = validatePayload(payload, {
    team_context_id: EN_TEAM_CONTEXT_ID,
    prompt_pipeline_id: EN_PIPELINE_ID,
  });

  const exportDoc = {
    generated_at: new Date().toISOString(),
    mode: 'dry_run_no_webhook_no_db_insert',
    input: {
      team_context_id: EN_TEAM_CONTEXT_ID,
      prompt_pipeline_id: EN_PIPELINE_ID,
      news: SAMPLE_NEWS,
    },
    validation: checks,
    payload,
  };

  mkdirSync(path.join(root, 'exports'), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(exportDoc, null, 2) + '\n');
  writeFileSync(
    MD_OUT,
    buildReviewMd({
      payload,
      checks,
      trace: { team_context_id: EN_TEAM_CONTEXT_ID, prompt_pipeline_id: EN_PIPELINE_ID },
    })
  );

  console.log(
    JSON.stringify(
      {
        jsonPath: JSON_OUT,
        mdPath: MD_OUT,
        validation: {
          all_passed: checks.all_passed,
          team_context_name: checks.team_context_name,
          pipeline_name: checks.pipeline_name,
          modules: checks.prompt_modules_count,
          has_120_char_rule: checks.has_120_char_rule,
          has_50_char_rule: checks.has_50_char_rule,
          any_jp_marker_in_composed: checks.any_jp_marker_in_composed,
        },
      },
      null,
      2
    )
  );

  if (!checks.all_passed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
