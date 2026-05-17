#!/usr/bin/env node
/**
 * Generate Business News Brief EN pipeline draft JSON + review MD (no DB writes).
 * Usage: node scripts/generate-en-pipeline-draft.mjs
 */
import { randomUUID } from 'crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BLOCKS,
  MODULES_META,
  STORY_OUTLINE_SYSTEM,
  STORY_OUTLINE_USER,
} from './en-pipeline-content.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const jpPath = path.join(root, 'exports/business-news-brief-jp-pipeline.json');
const jsonOut = path.join(root, 'exports/business-news-brief-en-pipeline-draft.json');
const mdOut = path.join(root, 'exports/business-news-brief-en-pipeline-review.md');

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
    if (block.content_target === 'system') systemParts.push(text);
    else userParts.push(text);
  }

  return {
    compose_mode: 'blocks',
    composed_system_prompt: systemParts.join('\n\n'),
    composed_user_prompt: userParts.join('\n\n'),
  };
}

function extractPlaceholders(text) {
  const matches = text.match(/\{\{[^}]+\}\}/g);
  return matches ? [...new Set(matches)] : [];
}

function buildDraft(jp) {
  const pipelineId = randomUUID();
  const now = new Date().toISOString();

  const blocksByKey = new Map();
  const blockRecords = BLOCKS.map((b) => {
    const id = randomUUID();
    const record = {
      id,
      key: b.key,
      workspace_id: null,
      name: b.name,
      description: b.description,
      category: b.category,
      scope_type: b.scope_type,
      content_target: b.content_target,
      content: b.content,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    blocksByKey.set(b.key, record);
    return record;
  });

  const blocksById = new Map(blockRecords.map((b) => [b.id, b]));

  const modules = [];
  const allLinks = [];

  for (const meta of MODULES_META) {
    const moduleId = randomUUID();
    const isOutline = meta.step_key === 'story_outline';
    const system_prompt = isOutline ? STORY_OUTLINE_SYSTEM : '';
    const user_prompt_template = isOutline ? STORY_OUTLINE_USER : '';

    const links = meta.block_keys.map((key, idx) => {
      const block = blocksByKey.get(key);
      const link = {
        prompt_module_block_id: randomUUID(),
        module_id: moduleId,
        block_id: block.id,
        sort_order: idx + 1,
        workspace_id: null,
        created_at: now,
        updated_at: now,
        content_role: block.content_target,
      };
      allLinks.push(link);
      return link;
    });

    const linked_blocks = links.map((join) => {
      const block = blocksById.get(join.block_id);
      return {
        join,
        block: { ...block },
      };
    });

    const composed = composeModulePrompts({
      moduleId,
      links,
      blocksById,
      fallbackSystem: system_prompt,
      fallbackUser: user_prompt_template,
    });

    modules.push({
      id: moduleId,
      pipeline_id: pipelineId,
      workspace_id: null,
      name: meta.name,
      step_key: meta.step_key,
      step_order: meta.step_order,
      system_prompt,
      user_prompt_template,
      output_format: meta.output_format,
      input_variables: meta.input_variables,
      output_key: meta.output_key,
      is_active: true,
      created_at: now,
      updated_at: now,
      ...composed,
      linked_blocks,
    });
  }

  return {
    exported_at: now,
    source: 'draft_from_jp_export',
    status: 'draft_not_in_db',
    derived_from: {
      jp_pipeline_id: jp.pipeline_id,
      jp_exported_at: jp.exported_at,
      jp_pipeline_name: jp.pipeline?.name,
    },
    note: 'prompt_module_blocks has no role column; content_role is prompt_blocks.content_target',
    pipeline: {
      id: pipelineId,
      workspace_id: null,
      name: 'Business News Brief EN',
      description:
        'Turn industry news, market moves, and competitive signals into a short internal briefing video for English-speaking business teams.\n\nUsing Team Context, the pipeline organizes:\n- what matters\n- what is changing in the market\n- how it may affect this team\n- what to watch or discuss next\n\nDesigned for sales, BD, leadership, product, and marketing teams — not for entertainment or investment advice.',
      use_case:
        'Internal news briefings, competitive updates, and market intelligence for global business teams',
      output_type: '5–10 minute team news briefing video (English)',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    modules,
    blocks: blockRecords,
    summary: {
      module_count: modules.length,
      distinct_block_count: blockRecords.length,
      prompt_module_block_link_count: allLinks.length,
    },
  };
}

function validateDraft(draft) {
  const jp = JSON.parse(readFileSync(jpPath, 'utf8'));
  const jpStepKeys = jp.modules.map((m) => m.step_key).sort();
  const enStepKeys = draft.modules.map((m) => m.step_key).sort();
  const jpOutputKeys = jp.modules.map((m) => m.output_key).sort();
  const enOutputKeys = draft.modules.map((m) => m.output_key).sort();

  const errors = [];
  if (JSON.stringify(jpStepKeys) !== JSON.stringify(enStepKeys)) {
    errors.push(`step_key mismatch: JP ${jpStepKeys} vs EN ${enStepKeys}`);
  }
  if (JSON.stringify(jpOutputKeys) !== JSON.stringify(enOutputKeys)) {
    errors.push(`output_key mismatch: JP ${jpOutputKeys} vs EN ${enOutputKeys}`);
  }

  const allText = JSON.stringify(draft);
  if (/50文字|最大50|51文字/.test(allText)) {
    errors.push('JP 50-character limit text found in EN draft');
  }
  if (!/120 characters/.test(allText)) {
    errors.push('EN 120-character limit not found in draft');
  }

  const jpPlaceholders = new Set();
  for (const m of jp.modules) {
    for (const p of extractPlaceholders(
      [m.system_prompt, m.user_prompt_template, m.composed_system_prompt, m.composed_user_prompt]
        .join('\n')
        .concat(
          m.linked_blocks.map((lb) => lb.block?.content ?? '').join('\n')
        )
    )) {
      jpPlaceholders.add(p);
    }
  }

  const enPlaceholders = new Set();
  for (const m of draft.modules) {
    for (const p of extractPlaceholders(
      [m.system_prompt, m.user_prompt_template, m.composed_system_prompt, m.composed_user_prompt]
        .join('\n')
        .concat(m.linked_blocks.map((lb) => lb.block?.content ?? '').join('\n'))
    )) {
      enPlaceholders.add(p);
    }
  }

  for (const p of jpPlaceholders) {
    if (!enPlaceholders.has(p)) {
      errors.push(`missing placeholder: ${p}`);
    }
  }

  return { errors, jpPlaceholders: [...jpPlaceholders].sort(), enPlaceholders: [...enPlaceholders].sort() };
}

function buildReviewMd(draft, validation) {
  const lines = [];
  const hr = '\n---\n\n';

  lines.push('# Business News Brief EN — Pipeline Review (Draft)');
  lines.push('');
  lines.push(`Generated: ${draft.exported_at}`);
  lines.push(`Status: **${draft.status}** — not saved to Supabase`);
  lines.push(`Derived from JP pipeline: \`${draft.derived_from.jp_pipeline_id}\``);
  lines.push('');

  lines.push('## EN Pipeline overview');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Draft pipeline ID | \`${draft.pipeline.id}\` |`);
  lines.push(`| Name | ${draft.pipeline.name} |`);
  lines.push(`| Modules | ${draft.summary.module_count} |`);
  lines.push(`| Blocks | ${draft.summary.distinct_block_count} |`);
  lines.push(`| Module–block links | ${draft.summary.prompt_module_block_link_count} |`);
  lines.push('');
  lines.push(draft.pipeline.description.replace(/\n/g, '\n\n'));
  lines.push(hr);

  lines.push('## Design changes from JP');
  lines.push('');
  lines.push('- **Audience**: internal English-speaking business teams (analyst briefing, not YouTube entertainment).');
  lines.push('- **Tone**: clear, calm, collaborative business English — not polite Japanese conversation patterns.');
  lines.push('- **Line length**: `lines[].text` max **120 characters** (ideally 12–18 words), not JP 50-character CJK limits.');
  lines.push('- **Slide copy**: word-based targets (6–10 word titles, 4–8 word bullets) for 16:9 readability.');
  lines.push('- **Part length**: word budgets per part instead of JP character counts.');
  lines.push('- **Openers**: internal briefing greeting instead of 「みなさん、こんにちは」.');
  lines.push('- **Mia / Yu**: same names; Mia = calm strategist/analyst, Yu = curious non-specialist teammate.');
  lines.push('- **Structure preserved**: step_key, output_key, JSON schema, topic_id pattern, placeholders, 6-step flow.');
  lines.push(hr);

  lines.push('## Module list');
  lines.push('');
  lines.push('| step_order | step_key | output_key | name | compose_mode | blocks |');
  lines.push('|------------|----------|------------|------|--------------|--------|');
  for (const m of draft.modules) {
    lines.push(
      `| ${m.step_order} | \`${m.step_key}\` | \`${m.output_key}\` | ${m.name} | ${m.compose_mode} | ${m.linked_blocks.length} |`
    );
  }
  lines.push(hr);

  lines.push('## Block list');
  lines.push('');
  lines.push('| name | category | scope | content_target |');
  lines.push('|------|----------|-------|----------------|');
  for (const b of draft.blocks) {
    lines.push(`| ${b.name} | ${b.category} | ${b.scope_type} | ${b.content_target} |`);
  }
  lines.push(hr);

  lines.push('## Technical constraints');
  lines.push('');
  lines.push('### Preserved (same as JP)');
  lines.push('');
  lines.push('- `step_order` 1–6 and all `step_key` / `output_key` values');
  lines.push('- JSON output: `lines[]`, `topics[]`, `speaker`, `topic_id`, `layout_type`, `layout`');
  lines.push('- Speakers: **Mia**, **Yu**');
  lines.push('- `topic_id` pattern: `topic_{PART}_001`, `topic_{PART}_002`, …');
  lines.push('- Placeholders: `{{team_context}}`, `{{news_title}}`, `{{news_body}}`, `{{news_notes}}`, `{{story_outline.content[N].…}}`');
  lines.push('- Part roles: overview → background → structure → team impact → watch points');
  lines.push('');
  lines.push('### Changed for EN');
  lines.push('');
  lines.push('| JP | EN draft |');
  lines.push('|----|----------|');
  lines.push('| 50 characters per `lines[].text` | 120 characters max; 12–18 words ideal |');
  lines.push('| Slide fields in Japanese character counts | Word counts for 16:9 slides |');
  lines.push('| Part totals in Japanese characters (~400–500) | Word budgets (~240–450 words per part) |');
  lines.push('| Japanese conversational fillers | Concise spoken business English |');
  lines.push(hr);

  lines.push('## Why 120 characters instead of 50');
  lines.push('');
  lines.push(
    'The JP limit targets one short Japanese utterance per TTS clip. English needs more letters per idea; 50 characters often truncates mid-thought. **120 characters** keeps lines short for TTS while allowing one complete English sentence. The model is also asked for **12–18 words** and to split long thoughts across multiple lines.'
  );
  lines.push(hr);

  lines.push('## Placeholder verification');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(validation, null, 2));
  lines.push('```');
  if (validation.errors.length) {
    lines.push('');
    lines.push('**Validation errors:**');
    for (const e of validation.errors) lines.push(`- ${e}`);
  } else {
    lines.push('');
    lines.push('All JP placeholders are present in the EN draft.');
  }
  lines.push(hr);

  lines.push('## Pre-DB checklist');
  lines.push('');
  lines.push('- [ ] Human review of Mia/Yu sample dialogue tone');
  lines.push('- [ ] Test one end-to-end generation job against EN draft prompts (file-based or staging)');
  lines.push('- [ ] Confirm n8n EN workflow uses same `output_key` and JSON parsing');
  lines.push('- [ ] Validate TTS with 120-character lines on target voices');
  lines.push('- [ ] Confirm slide renderer handles English word lengths');
  lines.push('- [ ] Seed script assigns new UUIDs or uses these draft IDs consistently');
  lines.push('- [ ] Keep JP pipeline unchanged in production');
  lines.push(hr);

  lines.push('## n8n follow-ups');
  lines.push('');
  lines.push('- Duplicate B2B brief workflow for EN (`N8N_BRIEF_WEBHOOK_URL_EN` or equivalent).');
  lines.push('- Keep `step_key` / `output_key` routing identical to JP.');
  lines.push('- Replace `{PART}` in topic_id the same way as JP (001–005).');
  lines.push('- Use English TTS voices for Mia/Yu if voice IDs are language-specific.');
  lines.push('- Subtitle timing: re-test with longer average line length.');
  lines.push('- Metadata: set `locale: en` when API supports it.');
  lines.push(hr);

  for (const m of draft.modules) {
    lines.push(`## Module ${m.step_order}: ${m.name}`);
    lines.push('');
    lines.push(`- **step_key**: \`${m.step_key}\``);
    lines.push(`- **output_key**: \`${m.output_key}\``);
    lines.push(`- **compose_mode**: ${m.compose_mode}`);
    lines.push(`- **input_variables**: ${m.input_variables.join(', ')}`);
    lines.push('');

    if (m.linked_blocks.length) {
      lines.push('### Linked blocks');
      lines.push('');
      for (const lb of m.linked_blocks) {
        lines.push(`#### ${lb.block.name} (sort_order ${lb.join.sort_order}, ${lb.join.content_role})`);
        lines.push('');
        lines.push('```');
        lines.push(lb.block.content);
        lines.push('```');
        lines.push('');
      }
    }

    lines.push('### Composed system prompt (sent to n8n)');
    lines.push('');
    lines.push('```');
    lines.push(m.composed_system_prompt || '(empty)');
    lines.push('```');
    lines.push('');
    lines.push('### Composed user prompt (sent to n8n)');
    lines.push('');
    lines.push('```');
    lines.push(m.composed_user_prompt || '(empty)');
    lines.push('```');
    lines.push(hr);
  }

  return lines.join('\n');
}

function main() {
  const jp = JSON.parse(readFileSync(jpPath, 'utf8'));
  const draft = buildDraft(jp);
  const validation = validateDraft(draft);

  if (validation.errors.length) {
    console.error('Validation failed:', validation.errors);
    process.exit(1);
  }

  mkdirSync(path.join(root, 'exports'), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify(draft, null, 2) + '\n');
  writeFileSync(mdOut, buildReviewMd(draft, validation));

  console.log(
    JSON.stringify(
      {
        jsonPath: jsonOut,
        mdPath: mdOut,
        summary: draft.summary,
        validation: {
          errors: validation.errors,
          placeholder_count: validation.enPlaceholders.length,
        },
      },
      null,
      2
    )
  );
}

main();
