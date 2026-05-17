#!/usr/bin/env node
/**
 * Seed English demo Team Context from draft JSON (dry-run by default).
 *
 *   node scripts/seed-en-team-context.mjs           # dry-run
 *   node scripts/seed-en-team-context.mjs --apply   # INSERT
 *
 * Does NOT modify the existing JP team_contexts row.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DRAFT = path.join(root, 'exports/team-context-en-draft.json');
const EN_TEAM_CONTEXT_NAME = 'AI & DX Strategy Team';
const JP_TEAM_CONTEXT_ID = '8fa2cb7d-0334-482a-baea-c5b069bb39d4';

const FIELDS = [
  'name',
  'company_summary',
  'target_industries',
  'customers',
  'competitors',
  'team_role',
  'briefing_goals',
  'tone',
  'notes',
];

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
    else if (args[i] === '--draft' && args[i + 1]) draftPath = path.resolve(args[++i]);
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage:
  node scripts/seed-en-team-context.mjs [--apply] [--draft <path>]

  --apply   INSERT into team_contexts (default: dry-run only)
  --draft   Draft JSON path (default: exports/team-context-en-draft.json)`);
      process.exit(0);
    }
  }
  return { apply, draftPath };
}

function buildInsertRow(draft) {
  const tc = draft.team_context;
  return {
    id: tc.id,
    workspace_id: tc.workspace_id ?? null,
    name: tc.name,
    company_summary: tc.company_summary ?? '',
    target_industries: tc.target_industries ?? '',
    customers: tc.customers ?? '',
    competitors: tc.competitors ?? '',
    team_role: tc.team_role ?? '',
    briefing_goals: tc.briefing_goals ?? '',
    tone: tc.tone ?? '',
    notes: tc.notes ?? '',
  };
}

async function fetchJpContext(supabase) {
  const { data, error } = await supabase
    .from('team_contexts')
    .select('*')
    .eq('id', JP_TEAM_CONTEXT_ID)
    .maybeSingle();
  if (error) throw new Error(`JP team_context: ${error.message}`);
  return data;
}

async function fetchAllContexts(supabase) {
  const { data, error } = await supabase.from('team_contexts').select('*').order('created_at');
  if (error) throw new Error(`team_contexts: ${error.message}`);
  return data ?? [];
}

async function checkDuplicates(supabase, row) {
  const [{ data: byId }, { data: byName }] = await Promise.all([
    supabase.from('team_contexts').select('id,name').eq('id', row.id).maybeSingle(),
    supabase.from('team_contexts').select('id,name').eq('name', EN_TEAM_CONTEXT_NAME).maybeSingle(),
  ]);

  const conflicts = [];
  if (byId) conflicts.push(`team_contexts.id already exists: ${row.id} (${byId.name})`);
  if (byName && byName.id !== row.id) {
    conflicts.push(`team_contexts.name "${EN_TEAM_CONTEXT_NAME}" already used by id ${byName.id}`);
  }

  return {
    ok: conflicts.length === 0,
    conflicts,
    id_exists: Boolean(byId),
    name_exists: Boolean(byName),
    name_row: byName,
  };
}

function printFieldBlock(title, row) {
  console.log(title);
  for (const key of FIELDS) {
    const val = row[key] ?? '';
    const preview = val.length > 200 ? `${val.slice(0, 200)}…` : val;
    console.log(`  ${key}:`);
    console.log(`    ${preview.replace(/\n/g, '\n    ')}`);
  }
  console.log('');
}

function printDryRun({ draft, jp, allContexts, row, duplicates }) {
  console.log('='.repeat(72));
  console.log('EN Team Context — seed dry-run');
  console.log('='.repeat(72));
  console.log('');
  console.log('Mode: DRY-RUN (no database writes)');
  console.log('Use --apply to INSERT after reviewing this output.');
  console.log('');

  console.log(`## Live DB: team_contexts count = ${allContexts.length}`);
  console.log('');

  console.log('## Source JP Team Context');
  if (jp) {
    console.log(`  id:         ${jp.id}`);
    console.log(`  name:       ${jp.name}`);
    console.log(`  created_at: ${jp.created_at}`);
    console.log(`  updated_at: ${jp.updated_at}`);
    printFieldBlock('  Fields (JP):', jp);
  } else {
    console.log(`  WARNING: JP context ${JP_TEAM_CONTEXT_ID} not found`);
    console.log('');
  }

  console.log('## Derived from (draft metadata)');
  console.log(`  jp_team_context_id: ${draft.derived_from?.jp_team_context_id ?? '—'}`);
  console.log(`  jp_name:            ${draft.derived_from?.jp_name ?? '—'}`);
  console.log('');

  console.log('## Insert plan (EN)');
  console.log(`  new id:   ${row.id}`);
  console.log(`  name:     ${row.name}`);
  console.log(`  table:    team_contexts`);
  console.log(`  action:   INSERT (1 row)`);
  console.log('');
  printFieldBlock('  Fields (EN insert):', row);

  console.log('## Duplicate check');
  console.log(`  id exists (${row.id}):     ${duplicates.id_exists}`);
  console.log(`  name exists ("${EN_TEAM_CONTEXT_NAME}"): ${duplicates.name_exists}${duplicates.name_row ? ` (${duplicates.name_row.id})` : ''}`);
  console.log(`  status: ${duplicates.ok ? 'OK (safe to seed)' : 'BLOCKED'}`);
  if (!duplicates.ok) {
    for (const c of duplicates.conflicts) console.log(`  - ${c}`);
  }
  console.log('');

  console.log('## JP guard');
  console.log('  Existing JP row will NOT be updated.');
  console.log(`  JP id to preserve: ${JP_TEAM_CONTEXT_ID}`);
  console.log('');

  console.log('## Rollback SQL (after --apply)');
  console.log(`DELETE FROM public.team_contexts WHERE id = '${row.id}';`);
  console.log('');
}

async function verifyAfterSeed(supabase, row, jpBefore) {
  const { data: en } = await supabase
    .from('team_contexts')
    .select('*')
    .eq('id', row.id)
    .maybeSingle();

  const { data: jpAfter } = await supabase
    .from('team_contexts')
    .select('id,name,updated_at')
    .eq('id', JP_TEAM_CONTEXT_ID)
    .maybeSingle();

  const { count: totalCount } = await supabase
    .from('team_contexts')
    .select('id', { count: 'exact', head: true });

  const jpUnchanged =
    jpBefore &&
    jpAfter &&
    jpBefore.updated_at === jpAfter.updated_at &&
    jpBefore.name === jpAfter.name;

  return {
    en_exists: Boolean(en),
    en_name: en?.name,
    total_team_contexts: totalCount,
    jp_unchanged: jpUnchanged,
    jp_before_updated_at: jpBefore?.updated_at,
    jp_after_updated_at: jpAfter?.updated_at,
  };
}

async function applySeed(supabase, row, jpBefore) {
  console.log('');
  console.log('='.repeat(72));
  console.log('APPLY — inserting EN Team Context');
  console.log('='.repeat(72));
  console.log(`  id:   ${row.id}`);
  console.log(`  name: ${row.name}`);
  console.log('');

  try {
    const { error } = await supabase.from('team_contexts').insert(row);
    if (error) throw new Error(error.message);
    console.log('[1/1] team_contexts — OK');
  } catch (err) {
    console.error('INSERT failed:', err.message);
    console.error('');
    console.error('Rollback SQL:');
    console.error(`DELETE FROM public.team_contexts WHERE id = '${row.id}';`);
    process.exit(1);
  }

  const verification = await verifyAfterSeed(supabase, row, jpBefore);
  console.log('');
  console.log('Post-seed verification:');
  console.log(JSON.stringify(verification, null, 2));
  console.log('');
  console.log(
    verification.en_exists && verification.jp_unchanged
      ? 'Seed verification: PASSED'
      : 'Seed verification: REVIEW REQUIRED'
  );
}

async function main() {
  const { apply, draftPath } = parseArgs();
  const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
  const row = buildInsertRow(draft);

  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const [allContexts, jp, duplicates] = await Promise.all([
    fetchAllContexts(supabase),
    fetchJpContext(supabase),
    checkDuplicates(supabase, row),
  ]);

  printDryRun({ draft, jp, allContexts, row, duplicates });

  if (!apply) {
    console.log('='.repeat(72));
    if (!duplicates.ok) {
      console.log('Dry-run complete — resolve conflicts before --apply.');
      process.exit(1);
    }
    console.log('Dry-run complete — no database writes performed.');
    process.exit(0);
  }

  if (!duplicates.ok) {
    console.error('--apply aborted due to duplicate conflicts.');
    process.exit(1);
  }

  console.log('>>> FINAL CONFIRMATION: writing to Supabase in 3 seconds…');
  console.log('>>> Press Ctrl+C to cancel.');
  await new Promise((r) => setTimeout(r, 3000));

  await applySeed(supabase, row, jp);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
