#!/usr/bin/env node
/**
 * Business News Brief JP pipeline 全量エクスポート（DB read-only）
 * Usage: node scripts/export-jp-pipeline.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function composeModulePrompts({ moduleId, links, blocksById, fallbackSystem, fallbackUser }) {
  const forModule = links
    .filter((l) => l.module_id === moduleId)
    .sort((a, b) => a.sort_order - b.sort_order || a.block_id.localeCompare(b.block_id));

  if (forModule.length === 0) {
    return {
      compose_mode: 'legacy_fallback',
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
    if (block.content_target === 'system') {
      systemParts.push(text);
    } else {
      userParts.push(text);
    }
  }

  return {
    compose_mode: 'blocks',
    composed_system_prompt: systemParts.join('\n\n'),
    composed_user_prompt: userParts.join('\n\n'),
  };
}

const PIPELINE_ID = 'c67230ba-b0f4-4ab3-a3b0-0ce48d118531';

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: pipeline, error: pErr } = await supabase
    .from('prompt_pipelines')
    .select('*')
    .eq('id', PIPELINE_ID)
    .maybeSingle();

  if (pErr) throw new Error(`pipeline: ${pErr.message}`);
  if (!pipeline) throw new Error(`pipeline not found: ${PIPELINE_ID}`);

  const { data: modules, error: mErr } = await supabase
    .from('prompt_modules')
    .select('*')
    .eq('pipeline_id', PIPELINE_ID)
    .order('step_order', { ascending: true })
    .order('id', { ascending: true });

  if (mErr) throw new Error(`modules: ${mErr.message}`);

  const moduleIds = (modules ?? []).map((m) => m.id);

  const { data: linksRaw, error: lErr } = await supabase
    .from('prompt_module_blocks')
    .select('*')
    .in('module_id', moduleIds);

  if (lErr) throw new Error(`links: ${lErr.message}`);

  const links = linksRaw ?? [];
  const blockIds = [...new Set(links.map((l) => l.block_id))];

  const { data: blocksRaw, error: bErr } = await supabase
    .from('prompt_blocks')
    .select('*')
    .in('id', blockIds.length ? blockIds : ['00000000-0000-0000-0000-000000000000']);

  if (bErr) throw new Error(`blocks: ${bErr.message}`);

  const blocksById = new Map((blocksRaw ?? []).map((b) => [b.id, b]));

  const modulesExport = (modules ?? []).map((mod) => {
    const modLinks = links
      .filter((l) => l.module_id === mod.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.block_id.localeCompare(b.block_id));

    const linked_blocks = modLinks.map((link) => {
      const block = blocksById.get(link.block_id);
      return {
        join: {
          prompt_module_block_id: link.id,
          module_id: link.module_id,
          block_id: link.block_id,
          sort_order: link.sort_order,
          workspace_id: link.workspace_id,
          created_at: link.created_at,
          updated_at: link.updated_at,
          content_role: block?.content_target ?? null,
        },
        block: block
          ? {
              id: block.id,
              name: block.name,
              description: block.description,
              block_key: block.block_key,
              block_type: block.block_type,
              category: block.category,
              scope_type: block.scope_type,
              template_id: block.template_id,
              module_id: block.module_id,
              part_number: block.part_number,
              content_target: block.content_target,
              content: block.content,
              is_active: block.is_active,
              created_at: block.created_at,
              updated_at: block.updated_at,
            }
          : null,
      };
    });

    const composed = composeModulePrompts({
      moduleId: mod.id,
      links: links.map((l) => ({
        module_id: l.module_id,
        block_id: l.block_id,
        sort_order: l.sort_order,
      })),
      blocksById: new Map(
        [...blocksById.values()].map((b) => [
          b.id,
          {
            id: b.id,
            content: b.content,
            content_target: b.content_target,
            is_active: b.is_active,
          },
        ])
      ),
      fallbackSystem: mod.system_prompt ?? '',
      fallbackUser: mod.user_prompt_template ?? '',
    });

    return {
      id: mod.id,
      pipeline_id: mod.pipeline_id,
      workspace_id: mod.workspace_id,
      name: mod.name,
      step_key: mod.step_key,
      step_order: mod.step_order,
      system_prompt: mod.system_prompt,
      user_prompt_template: mod.user_prompt_template,
      output_format: mod.output_format,
      input_variables: mod.input_variables,
      output_key: mod.output_key,
      is_active: mod.is_active,
      created_at: mod.created_at,
      updated_at: mod.updated_at,
      compose_mode: composed.compose_mode,
      composed_system_prompt: composed.composed_system_prompt,
      composed_user_prompt: composed.composed_user_prompt,
      linked_blocks,
    };
  });

  const exportDoc = {
    exported_at: new Date().toISOString(),
    source: 'supabase_live',
    pipeline_id: PIPELINE_ID,
    note: 'prompt_module_blocks has no role column; content_role is prompt_blocks.content_target',
    pipeline: {
      id: pipeline.id,
      workspace_id: pipeline.workspace_id,
      name: pipeline.name,
      description: pipeline.description,
      use_case: pipeline.use_case,
      output_type: pipeline.output_type,
      is_active: pipeline.is_active,
      created_at: pipeline.created_at,
      updated_at: pipeline.updated_at,
    },
    modules: modulesExport,
    summary: {
      module_count: modulesExport.length,
      distinct_block_count: blockIds.length,
      prompt_module_block_link_count: links.length,
    },
  };

  const exportsDir = path.join(root, 'exports');
  mkdirSync(exportsDir, { recursive: true });

  const jsonPath = path.join(exportsDir, 'business-news-brief-jp-pipeline.json');
  writeFileSync(jsonPath, JSON.stringify(exportDoc, null, 2), 'utf8');

  const mdPath = path.join(exportsDir, 'business-news-brief-jp-pipeline-review.md');
  writeFileSync(mdPath, buildReviewMarkdown(exportDoc), 'utf8');

  console.log(JSON.stringify({ jsonPath, mdPath, summary: exportDoc.summary }, null, 2));
}

function buildReviewMarkdown(doc) {
  const lines = [];
  const p = doc.pipeline;

  lines.push('# Business News Brief — JP Pipeline Review');
  lines.push('');
  lines.push(`- Exported at: ${doc.exported_at}`);
  lines.push(`- Pipeline ID: \`${p.id}\``);
  lines.push(`- Modules: ${doc.summary.module_count}`);
  lines.push(`- Distinct blocks: ${doc.summary.distinct_block_count}`);
  lines.push(`- Module-block links: ${doc.summary.prompt_module_block_link_count}`);
  lines.push('');

  lines.push('## Pipeline overview');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| name | ${p.name} |`);
  lines.push(`| use_case | ${escapeCell(p.use_case)} |`);
  lines.push(`| output_type | ${escapeCell(p.output_type)} |`);
  lines.push(`| is_active | ${p.is_active} |`);
  lines.push(`| created_at | ${p.created_at} |`);
  lines.push('');
  lines.push('### description');
  lines.push('');
  lines.push(p.description || '_(empty)_');
  lines.push('');

  lines.push('## Module index');
  lines.push('');
  lines.push('| step_order | step_key | name | compose_mode | blocks |');
  lines.push('|------------|----------|------|--------------|--------|');
  for (const m of doc.modules) {
    lines.push(
      `| ${m.step_order} | \`${m.step_key}\` | ${escapeCell(m.name)} | ${m.compose_mode} | ${m.linked_blocks.length} |`
    );
  }
  lines.push('');

  for (const m of doc.modules) {
    lines.push(`## Module ${m.step_order}: ${m.name}`);
    lines.push('');
    lines.push(`- **module id**: \`${m.id}\``);
    lines.push(`- **step_key**: \`${m.step_key}\``);
    lines.push(`- **output_key**: \`${m.output_key}\``);
    lines.push(`- **compose_mode**: ${m.compose_mode}`);
    lines.push(`- **input_variables**: \`${JSON.stringify(m.input_variables)}\``);
    lines.push('');

    lines.push('### Role (what this step does)');
    lines.push('');
    lines.push(moduleRoleSummary(m.step_key, m.name));
    lines.push('');

    if (m.linked_blocks.length > 0) {
      lines.push('### Linked prompt blocks');
      lines.push('');
      lines.push('| sort_order | block id | name | category | scope_type | content_role |');
      lines.push('|------------|----------|------|----------|------------|--------------|');
      for (const { join, block } of m.linked_blocks) {
        if (!block) continue;
        lines.push(
          `| ${join.sort_order} | \`${block.id}\` | ${escapeCell(block.name)} | ${block.category} | ${block.scope_type} | ${join.content_role} |`
        );
      }
      lines.push('');

      for (const { join, block } of m.linked_blocks) {
        if (!block) continue;
        lines.push(`#### Block: ${block.name} (sort ${join.sort_order}, ${join.content_role})`);
        lines.push('');
        lines.push('```');
        lines.push(block.content || '');
        lines.push('```');
        lines.push('');
      }
    } else {
      lines.push('_No prompt_module_blocks links — legacy module fields used for compose._');
      lines.push('');
    }

    lines.push('### Module legacy fields (DB columns)');
    lines.push('');
    lines.push('#### system_prompt');
    lines.push('');
    lines.push('```');
    lines.push(m.system_prompt || '');
    lines.push('```');
    lines.push('');
    lines.push('#### user_prompt_template');
    lines.push('');
    lines.push('```');
    lines.push(m.user_prompt_template || '');
    lines.push('```');
    lines.push('');

    if (m.output_format) {
      lines.push('#### output_format');
      lines.push('');
      lines.push('```');
      lines.push(m.output_format);
      lines.push('```');
      lines.push('');
    }

    lines.push('### Composed prompts (runtime / n8n payload)');
    lines.push('');
    lines.push('#### composed_system_prompt');
    lines.push('');
    lines.push('```');
    lines.push(m.composed_system_prompt || '');
    lines.push('```');
    lines.push('');
    lines.push('#### composed_user_prompt');
    lines.push('');
    lines.push('```');
    lines.push(m.composed_user_prompt || '');
    lines.push('```');
    lines.push('');

    lines.push('### EN conversion notes (this module)');
    lines.push('');
    lines.push(enNotesForModule(m));
    lines.push('');
  }

  lines.push('## Global EN conversion guidance');
  lines.push('');
  lines.push(globalEnGuidance());
  lines.push('');

  return lines.join('\n');
}

function escapeCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function moduleRoleSummary(stepKey, name) {
  const map = {
    story_outline: '5-part video structure; JSON with parts and topic_id per part.',
    part_001_script: 'Part 1 script — news overview.',
    part_002_script: 'Part 2 — background and market context.',
    part_003_script: 'Part 3 — structural change / key themes.',
    part_004_script: 'Part 4 — impact on team/company.',
    part_005_script: 'Part 5 — next actions and watchpoints.',
  };
  return map[stepKey] ?? `Step: ${name}`;
}

function enNotesForModule(m) {
  const notes = [];
  if (m.compose_mode === 'blocks') {
    notes.push('- **Convert**: all linked block `content` fields (primary source for n8n).');
    notes.push('- **Align**: module `name` for Admin UI only; optional EN labels.');
  } else {
    notes.push('- **Convert**: `system_prompt` and `user_prompt_template` columns directly.');
  }
  if (m.output_format) {
    notes.push('- **Preserve structure**: `output_format` JSON schema keys (`topic_id`, line limits) — translate descriptions only unless n8n requires change.');
  }
  if (/part_\d+_script/.test(m.step_key)) {
    notes.push('- **Redesign for EN**: Mia/Yu dialogue tone, sentence length for TTS, Business English register.');
    notes.push('- **Shorten for TTS**: Japanese lines often longer; target ~15–20 words per spoken line where 50-char rule applies.');
  }
  if (m.step_key === 'story_outline') {
    notes.push('- **Redesign**: strategist framing for US/EU business audience; keep 5-part arc.');
  }
  notes.push('- **Keep placeholders**: `{{team_context}}`, `{{news_title}}`, `{{news_body}}`, `{{news_notes}}` and any step-specific variables unchanged.');
  return notes.join('\n');
}

function globalEnGuidance() {
  return `### Translate as-is (low risk)

- Variable placeholders: \`{{team_context}}\`, \`{{news_title}}\`, \`{{news_body}}\`, \`{{news_notes}}\`
- JSON field names in output_format: \`topic_id\`, \`parts\`, \`lines\`, \`speaker\`, etc. (verify in each module output_format)
- step_key values (machine identifiers)
- output_key values (downstream n8n keys)

### Redesign (not literal translation)

- Role definitions ("Business Brief Strategist", audience, tone)
- Prohibitions and dialogue rules (cultural norms differ)
- Mia / Yu persona: map to consistent EN names (e.g. keep **Mia** / **Yu** or use **Mia** / **Alex**) with EN conversational business tone
- Part titles and narrative arc descriptions
- "市場インテリジェンス" → "market intelligence" / "executive briefing" framing

### TTS-oriented shortening

- Per-line character limits (e.g. 50) — EN uses word count; re-validate after translation
- Avoid nested clauses; prefer active voice
- Numbers and units: US business conventions ($, %, dates)

### Technical constraints to preserve (confirm in output_format / blocks)

- topic_id naming convention
- JSON-only responses where specified
- Line count per speaker per segment
- 5-part structure (part_001 … part_005)

### EN naming suggestion

| JP (current) | EN suggestion |
|--------------|---------------|
| Business News Brief | Business News Brief EN |
| 動画構成生成 | Story outline |
| Part N 台本生成（…） | Part N script (…) |

### Do not change without n8n coordination

- step_order sequence
- output_key strings consumed by workflow
- Webhook payload schema_version`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
