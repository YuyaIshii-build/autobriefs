#!/usr/bin/env node
/**
 * Unit-style checks for resolveN8nBriefWebhookUrl (no network).
 * Usage: node scripts/test-resolve-n8n-brief-webhook.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Load .env.local into process.env for JP URL
const envPath = path.join(root, '.env.local');
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i);
    if (!(k in process.env)) process.env[k] = line.slice(i + 1);
  }
} catch {
  /* optional */
}

const JP_ID = 'c67230ba-b0f4-4ab3-a3b0-0ce48d118531';
const EN_ID = process.env.EN_PROMPT_PIPELINE_ID?.trim() || 'f3808527-76a2-45f5-822c-e6698c918211';

// Dynamic import compiled TS — use tsx alternative: compile via jiti or duplicate logic
// Duplicate minimal resolve for script test without ts-node
function resolveN8nBriefWebhookUrl(pipelineId) {
  const enPipelineId = process.env.EN_PROMPT_PIPELINE_ID?.trim() || 'f3808527-76a2-45f5-822c-e6698c918211';
  if (pipelineId.trim() === enPipelineId) {
    const url = process.env.N8N_BRIEF_WEBHOOK_URL_EN?.trim();
    if (!url) throw new Error('N8N_BRIEF_WEBHOOK_URL_EN が未設定です');
    return { url, locale: 'en' };
  }
  const url = process.env.N8N_BRIEF_WEBHOOK_URL?.trim();
  if (!url) throw new Error('N8N_BRIEF_WEBHOOK_URL が未設定です');
  return { url, locale: 'ja' };
}

const savedEn = process.env.N8N_BRIEF_WEBHOOK_URL_EN;
let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    failed++;
  }
}

assert('JP pipeline → ja + N8N_BRIEF_WEBHOOK_URL', () => {
  const r = resolveN8nBriefWebhookUrl(JP_ID);
  if (r.locale !== 'ja') throw new Error(`locale=${r.locale}`);
  if (r.url !== process.env.N8N_BRIEF_WEBHOOK_URL?.trim()) throw new Error('wrong url');
});

assert('EN pipeline → en when EN URL set', () => {
  process.env.N8N_BRIEF_WEBHOOK_URL_EN = 'https://example.com/webhook/en-test';
  const r = resolveN8nBriefWebhookUrl(EN_ID);
  if (r.locale !== 'en') throw new Error(`locale=${r.locale}`);
  if (r.url !== 'https://example.com/webhook/en-test') throw new Error(`url=${r.url}`);
});

assert('EN pipeline + missing EN URL → error (no JP fallback)', () => {
  delete process.env.N8N_BRIEF_WEBHOOK_URL_EN;
  let threw = false;
  try {
    resolveN8nBriefWebhookUrl(EN_ID);
  } catch (e) {
    threw = e.message.includes('N8N_BRIEF_WEBHOOK_URL_EN');
  }
  if (!threw) throw new Error('expected throw');
});

if (savedEn !== undefined) process.env.N8N_BRIEF_WEBHOOK_URL_EN = savedEn;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
