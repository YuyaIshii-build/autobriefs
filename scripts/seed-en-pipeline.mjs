#!/usr/bin/env node
/**
 * Seed Business News Brief EN pipeline from draft JSON (dry-run by default).
 *
 *   node scripts/seed-en-pipeline.mjs           # dry-run (no writes)
 *   node scripts/seed-en-pipeline.mjs --apply   # INSERT to Supabase
 *
 * Does NOT modify the existing JP pipeline.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DRAFT = path.join(root, 'exports/business-news-brief-en-pipeline-draft.json');
const JP_PIPELINE_ID = 'c67230ba-b0f4-4ab3-a3b0-0ce48d118531';
const EN_PIPELINE_NAME = 'Business News Brief EN';

const BLOCK_TYPE_BY_CATEGORY = {
  role: 'shared_context',
  output_format: 'output_format',
  dialogue_rules: 'script_rules',
  part_rules: 'part_specific',
  conversation_flow: 'part_specific',
};

const BLOCK_KEY_SUFFIX = {
  role: 'role_characters',
  output: 'output_rendering_rules',
  dialogue: 'dialogue_safety_rules',
  part1_rules: 'part1_news_overview_rules',
  part1_flow: 'part1_conversation_flow',
  part2_rules: 'part2_background_rules',
  part2_flow: 'part2_conversation_flow',
  part3_rules: 'part3_structural_theme_rules',
  part3_flow: 'part3_conversation_flow',
  part4_rules: 'part4_team_impact_rules',
  part4_flow: 'part4_conversation_flow',
  part5_rules: 'part5_watchpoints_rules',
  part5_flow: 'part5_conversation_flow',
};

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

function parseArgs() {
  const args = process.argv.slice(2);
  let draftPath = DEFAULT_DRAFT;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--draft' && args[i + 1]) {
      draftPath = path.resolve(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage:
  node scripts/seed-en-pipeline.mjs [--apply] [--draft <path>]

  --apply   Perform INSERT (default: dry-run only)
  --draft   Path to EN draft JSON (default: exports/business-news-brief-en-pipeline-draft.json)`);
      process.exit(0);
    }
  }
  return { apply, draftPath };
}

function extractPlaceholders(text) {
  const matches = text.match(/\{\{[^}]+\}\}/g);
  return matches ? [...new Set(matches)] : [];
}

function blockKeyForDraftBlock(block) {
  const suffix = BLOCK_KEY_SUFFIX[block.key] ?? block.key.replace(/_/g, '_');
  return `business_brief_en_${suffix}_v1`;
}

function partNumberFromBlockKey(key) {
  const m = /^part(\d)_/.exec(key ?? '');
  return m ? Number(m[1]) : null;
}

function moduleForPartNumber(modules, partNumber) {
  return modules.find((m) => m.step_key === `part_${String(partNumber).padStart(3, '0')}_script`);
}

function buildSeedRows(draft) {
  const pipeline = {
    id: draft.pipeline.id,
    workspace_id: draft.pipeline.workspace_id,
    name: draft.pipeline.name,
    description: draft.pipeline.description ?? '',
    use_case: draft.pipeline.use_case ?? '',
    output_type: draft.pipeline.output_type ?? '',
    is_active: draft.pipeline.is_active ?? true,
  };

  const modules = draft.modules.map((m) => ({
    id: m.id,
    workspace_id: m.workspace_id,
    pipeline_id: pipeline.id,
    name: m.name,
    step_key: m.step_key,
    step_order: m.step_order,
    system_prompt: m.system_prompt ?? '',
    user_prompt_template: m.user_prompt_template ?? '',
    output_format: m.output_format,
    input_variables: m.input_variables ?? [],
    output_key: m.output_key,
    is_active: m.is_active ?? true,
  }));

  const blocks = draft.blocks.map((b) => {
    const partNum = partNumberFromBlockKey(b.key);
    const scope_type = b.scope_type ?? (partNum ? 'step' : 'global');
    const mod = partNum ? moduleForPartNumber(modules, partNum) : null;

    return {
      id: b.id,
      workspace_id: b.workspace_id,
      name: b.name,
      description: b.description ?? '',
      block_key: blockKeyForDraftBlock(b),
      block_type: BLOCK_TYPE_BY_CATEGORY[b.category] ?? 'part_specific',
      content_target: b.content_target,
      content: b.content ?? '',
      scope_type,
      template_id: scope_type === 'step' ? pipeline.id : null,
      module_id: scope_type === 'step' ? mod?.id ?? null : null,
      part_number: scope_type === 'step' ? partNum : null,
      category: b.category ?? 'other',
      is_active: b.is_active ?? true,
    };
  });

  const links = [];
  for (const mod of draft.modules) {
    for (const lb of mod.linked_blocks ?? []) {
      links.push({
        id: lb.join.prompt_module_block_id,
        workspace_id: lb.join.workspace_id,
        module_id: lb.join.module_id,
        block_id: lb.join.block_id,
        sort_order: lb.join.sort_order,
      });
    }
  }

  return { pipeline, modules, blocks, links };
}

function collectPlaceholderValidation(draft) {
  const found = new Set();
  const texts = [
    draft.pipeline.description,
    ...draft.modules.flatMap((m) => [
      m.system_prompt,
      m.user_prompt_template,
      ...(m.linked_blocks ?? []).map((lb) => lb.block?.content ?? ''),
    ]),
    ...draft.blocks.map((b) => b.content),
  ];
  for (const t of texts) {
    for (const p of extractPlaceholders(t ?? '')) found.add(p);
  }

  const required = [
    '{{team_context}}',
    '{{news_title}}',
    '{{news_body}}',
    '{{news_notes}}',
    '{{story_outline.content[0].main_message}}',
    '{{story_outline.content[0].supporting_points}}',
    '{{story_outline.content[0].host_comment_purpose}}',
    '{{story_outline.content[0].avoid_overlap_with}}',
    '{{story_outline.content[4].main_message}}',
  ];

  const missing = required.filter((p) => !found.has(p));
  const has120 = [...found].length === 0 || JSON.stringify(draft).includes('120 characters');
  const has50 = /50文字|最大50|51文字/.test(JSON.stringify(draft));

  return {
    placeholder_count: found.size,
    placeholders: [...found].sort(),
    missing_required: missing,
    has_120_char_rule: has120,
    has_jp_50_char_rule: has50,
    ok: missing.length === 0 && has120 && !has50,
  };
}

async function fetchExistingIds(supabase, plan) {
  const pipelineIds = [plan.pipeline.id];
  const blockIds = plan.blocks.map((b) => b.id);
  const moduleIds = plan.modules.map((m) => m.id);
  const linkIds = plan.links.map((l) => l.id);

  const [
    { data: byPipelineId },
    { data: byName },
    { data: blocks },
    { data: modules },
    { data: links },
    { data: jpPipeline },
  ] = await Promise.all([
    supabase.from('prompt_pipelines').select('id,name').eq('id', plan.pipeline.id).maybeSingle(),
    supabase.from('prompt_pipelines').select('id,name').eq('name', EN_PIPELINE_NAME).maybeSingle(),
    blockIds.length
      ? supabase.from('prompt_blocks').select('id,name').in('id', blockIds)
      : { data: [] },
    moduleIds.length
      ? supabase.from('prompt_modules').select('id,name').in('id', moduleIds)
      : { data: [] },
    linkIds.length
      ? supabase.from('prompt_module_blocks').select('id').in('id', linkIds)
      : { data: [] },
    supabase
      .from('prompt_pipelines')
      .select('id,name,updated_at')
      .eq('id', JP_PIPELINE_ID)
      .maybeSingle(),
  ]);

  return {
    pipeline_id_exists: Boolean(byPipelineId),
    pipeline_id_row: byPipelineId,
    pipeline_name_exists: Boolean(byName),
    pipeline_name_row: byName,
    existing_block_ids: (blocks ?? []).map((b) => b.id),
    existing_module_ids: (modules ?? []).map((m) => m.id),
    existing_link_ids: (links ?? []).map((l) => l.id),
    jp_pipeline: jpPipeline,
  };
}

function buildDuplicateReport(existing, plan) {
  const conflicts = [];
  if (existing.pipeline_id_exists) {
    conflicts.push(`prompt_pipelines.id already exists: ${plan.pipeline.id}`);
  }
  if (existing.pipeline_name_exists && existing.pipeline_name_row?.id !== plan.pipeline.id) {
    conflicts.push(
      `prompt_pipelines.name "${EN_PIPELINE_NAME}" already used by id ${existing.pipeline_name_row.id}`
    );
  }
  if (existing.existing_block_ids.length) {
    conflicts.push(`prompt_blocks.id collision: ${existing.existing_block_ids.join(', ')}`);
  }
  if (existing.existing_module_ids.length) {
    conflicts.push(`prompt_modules.id collision: ${existing.existing_module_ids.join(', ')}`);
  }
  if (existing.existing_link_ids.length) {
    conflicts.push(`prompt_module_blocks.id collision: ${existing.existing_link_ids.join(', ')}`);
  }
  return { ok: conflicts.length === 0, conflicts };
}

function buildRollbackSql(plan) {
  const linkIds = plan.links.map((l) => `'${l.id}'`).join(', ');
  const blockIds = plan.blocks.map((b) => `'${b.id}'`).join(', ');
  const moduleIds = plan.modules.map((m) => `'${m.id}'`).join(', ');
  const pipelineId = plan.pipeline.id;

  return `-- Rollback EN pipeline seed (run top to bottom)
-- 1. module-block links
DELETE FROM public.prompt_module_blocks WHERE id IN (${linkIds});

-- 2. blocks
DELETE FROM public.prompt_blocks WHERE id IN (${blockIds});

-- 3. modules
DELETE FROM public.prompt_modules WHERE id IN (${moduleIds});

-- 4. pipeline
DELETE FROM public.prompt_pipelines WHERE id = '${pipelineId}';
`;
}

function printDryRunReport({ plan, placeholders, existing, duplicates, jpSnapshot }) {
  console.log('='.repeat(72));
  console.log('Business News Brief EN — seed dry-run');
  console.log('='.repeat(72));
  console.log('');
  console.log('Mode: DRY-RUN (no database writes)');
  console.log('Use --apply to INSERT after reviewing this output.');
  console.log('');

  console.log('## Insert plan');
  console.log('');
  console.log('Pipeline:');
  console.log(`  id:   ${plan.pipeline.id}`);
  console.log(`  name: ${plan.pipeline.name}`);
  console.log(`  use_case: ${plan.pipeline.use_case}`);
  console.log(`  output_type: ${plan.pipeline.output_type}`);
  console.log('');
  console.log(`Modules: ${plan.modules.length}`);
  console.log(`Blocks:  ${plan.blocks.length}`);
  console.log(`Links:   ${plan.links.length}`);
  console.log('');

  console.log('step_key (in order):');
  for (const m of [...plan.modules].sort((a, b) => a.step_order - b.step_order)) {
    console.log(`  ${m.step_order}. ${m.step_key} → output_key=${m.output_key}`);
  }
  console.log('');

  console.log('output_key list:');
  console.log(`  ${plan.modules.map((m) => m.output_key).join(', ')}`);
  console.log('');

  console.log('## Placeholder validation');
  console.log(`  count: ${placeholders.placeholder_count}`);
  console.log(`  required missing: ${placeholders.missing_required.length ? placeholders.missing_required.join(', ') : '(none)'}`);
  console.log(`  120-char rule present: ${placeholders.has_120_char_rule}`);
  console.log(`  JP 50-char rule absent: ${!placeholders.has_jp_50_char_rule}`);
  console.log(`  status: ${placeholders.ok ? 'OK' : 'FAILED'}`);
  console.log('');

  console.log('## Duplicate check (live DB)');
  console.log(`  pipeline id exists:   ${existing.pipeline_id_exists}`);
  console.log(`  pipeline name exists: ${existing.pipeline_name_exists}${existing.pipeline_name_row ? ` (${existing.pipeline_name_row.id})` : ''}`);
  console.log(`  block id collisions:  ${existing.existing_block_ids.length}`);
  console.log(`  module id collisions: ${existing.existing_module_ids.length}`);
  console.log(`  link id collisions:   ${existing.existing_link_ids.length}`);
  console.log(`  status: ${duplicates.ok ? 'OK (safe to seed)' : 'BLOCKED'}`);
  if (!duplicates.ok) {
    for (const c of duplicates.conflicts) console.log(`  - ${c}`);
  }
  console.log('');

  console.log('## JP pipeline guard (read-only snapshot)');
  if (jpSnapshot) {
    console.log(`  id: ${jpSnapshot.id}`);
    console.log(`  name: ${jpSnapshot.name}`);
    console.log(`  updated_at: ${jpSnapshot.updated_at}`);
  } else {
    console.log('  WARNING: JP pipeline not found in DB');
  }
  console.log('');

  console.log('## INSERT order (FK-safe)');
  console.log('  1. prompt_pipelines');
  console.log('  2. prompt_modules  (required before step-scoped blocks)');
  console.log('  3. prompt_blocks   (step blocks reference module_id)');
  console.log('  4. prompt_module_blocks');
  console.log('');

  console.log('## Rollback SQL (if needed after partial --apply)');
  console.log(buildRollbackSql(plan));
}

async function verifyAfterSeed(supabase, plan, jpBefore) {
  const enPipelineId = plan.pipeline.id;
  const { data: enPipeline } = await supabase
    .from('prompt_pipelines')
    .select('id,name')
    .eq('id', enPipelineId)
    .maybeSingle();

  const { data: enModules } = await supabase
    .from('prompt_modules')
    .select('step_key,output_key,step_order')
    .eq('pipeline_id', enPipelineId)
    .order('step_order');

  const moduleIds = (enModules ?? []).map((m) => m.id);
  const { data: enLinks } = await supabase
    .from('prompt_module_blocks')
    .select('id')
    .in('module_id', moduleIds.length ? moduleIds : ['00000000-0000-0000-0000-000000000000']);

  const blockIds = plan.blocks.map((b) => b.id);
  const { data: enBlocks } = await supabase
    .from('prompt_blocks')
    .select('id')
    .in('id', blockIds);

  const { data: jpAfter } = await supabase
    .from('prompt_pipelines')
    .select('id,name,updated_at')
    .eq('id', JP_PIPELINE_ID)
    .maybeSingle();

  const jpUnchanged =
    jpBefore &&
    jpAfter &&
    jpBefore.updated_at === jpAfter.updated_at &&
    jpBefore.name === jpAfter.name;

  const jpModuleCount = await supabase
    .from('prompt_modules')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_id', JP_PIPELINE_ID);

  return {
    en_pipeline_exists: Boolean(enPipeline),
    en_module_count: enModules?.length ?? 0,
    en_block_count: enBlocks?.length ?? 0,
    en_link_count: enLinks?.length ?? 0,
    en_step_keys: (enModules ?? []).map((m) => m.step_key),
    en_output_keys: (enModules ?? []).map((m) => m.output_key),
    jp_unchanged: jpUnchanged,
    jp_module_count: jpModuleCount.count,
    jp_after: jpAfter,
  };
}

async function applySeed(supabase, plan, jpBefore) {
  const progress = { pipeline: false, modules: false, blocks: false, links: false };

  console.log('');
  console.log('='.repeat(72));
  console.log('APPLY — inserting EN pipeline');
  console.log('='.repeat(72));
  console.log(`Pipeline: ${plan.pipeline.name} (${plan.pipeline.id})`);
  console.log('');

  try {
    const { error: e1 } = await supabase.from('prompt_pipelines').insert(plan.pipeline);
    if (e1) throw new Error(`prompt_pipelines: ${e1.message}`);
    progress.pipeline = true;
    console.log('[1/4] prompt_pipelines — OK');

    const { error: e2 } = await supabase.from('prompt_modules').insert(plan.modules);
    if (e2) throw new Error(`prompt_modules: ${e2.message}`);
    progress.modules = true;
    console.log(`[2/4] prompt_modules — OK (${plan.modules.length} rows)`);

    const { error: e3 } = await supabase.from('prompt_blocks').insert(plan.blocks);
    if (e3) throw new Error(`prompt_blocks: ${e3.message}`);
    progress.blocks = true;
    console.log(`[3/4] prompt_blocks — OK (${plan.blocks.length} rows)`);

    const { error: e4 } = await supabase.from('prompt_module_blocks').insert(plan.links);
    if (e4) throw new Error(`prompt_module_blocks: ${e4.message}`);
    progress.links = true;
    console.log(`[4/4] prompt_module_blocks — OK (${plan.links.length} rows)`);
  } catch (err) {
    console.error('');
    console.error('INSERT failed:', err.message);
    console.error('');
    console.error('Progress:', progress);
    console.error('');
    console.error('Rollback SQL (delete rows inserted so far):');
    console.error(buildRollbackSql(plan));
    process.exit(1);
  }

  console.log('');
  console.log('Post-seed verification...');
  const verification = await verifyAfterSeed(supabase, plan, jpBefore);
  console.log(JSON.stringify(verification, null, 2));

  const ok =
    verification.en_pipeline_exists &&
    verification.en_module_count === 6 &&
    verification.en_block_count === 13 &&
    verification.en_link_count === 25 &&
    verification.jp_unchanged;

  console.log('');
  console.log(ok ? 'Seed verification: PASSED' : 'Seed verification: REVIEW REQUIRED');
  if (!verification.jp_unchanged) {
    console.warn('WARNING: JP pipeline updated_at changed — investigate before continuing.');
  }
}

async function main() {
  const { apply, draftPath } = parseArgs();
  const draft = JSON.parse(readFileSync(draftPath, 'utf8'));

  if (draft.status !== 'draft_not_in_db') {
    console.warn(`Note: draft status is "${draft.status}" (expected draft_not_in_db)`);
  }

  const plan = buildSeedRows(draft);
  const placeholders = collectPlaceholderValidation(draft);

  if (!placeholders.ok) {
    console.error('Placeholder validation failed:', placeholders);
    process.exit(1);
  }

  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const existing = await fetchExistingIds(supabase, plan);
  const duplicates = buildDuplicateReport(existing, plan);
  const jpSnapshot = existing.jp_pipeline;

  if (!apply) {
    printDryRunReport({ plan, placeholders, existing, duplicates, jpSnapshot });
    console.log('='.repeat(72));
    if (!duplicates.ok) {
      console.log('Dry-run complete — resolve conflicts before --apply.');
      process.exit(1);
    }
    console.log('Dry-run complete — no database writes performed.');
    process.exit(0);
  }

  // --apply path
  printDryRunReport({ plan, placeholders, existing, duplicates, jpSnapshot });

  if (!duplicates.ok) {
    console.error('--apply aborted due to duplicate conflicts.');
    process.exit(1);
  }

  console.log('');
  console.log('>>> FINAL CONFIRMATION: writing to Supabase in 3 seconds…');
  console.log('>>> Press Ctrl+C to cancel.');
  await new Promise((r) => setTimeout(r, 3000));

  await applySeed(supabase, plan, jpSnapshot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
