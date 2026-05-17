# EN Brief n8n Payload — Dry Run Review

Generated: 2026-05-17T07:52:30.034Z
**No webhook sent. No generation_jobs INSERT.**

## Payload generation trace (app parity)

| Step | App behavior | This dry-run |
|------|----------------|--------------|
| 1 | `CreateBriefForm` POSTs `team_context_id`, `prompt_pipeline_id`, news fields | Same IDs / sample news |
| 2 | `POST /api/generation-jobs` loads team + pipeline by ID | Same Supabase queries |
| 3 | Loads `prompt_modules` for `pipeline_id` | Same |
| 4 | `fetchModuleComposeLinksAndBlocks` + `composeModulePrompts` | Same logic (mirrored) |
| 5 | `buildN8nBriefPayload` | Same logic (mirrored) |
| 6 | Webhook + `generation_jobs` insert | **Skipped** |

## Input IDs

- team_context_id: `463adde8-f01b-4098-8ae8-76882d9a5ecf`
- prompt_pipeline_id: `f3808527-76a2-45f5-822c-e6698c918211`

## Validation summary

**Overall: PASSED**

```json
{
  "team_context_id_matches": true,
  "team_context_name": true,
  "pipeline_id_matches": true,
  "pipeline_name": true,
  "prompt_modules_count": true,
  "step_keys": [
    "story_outline",
    "part_001_script",
    "part_002_script",
    "part_003_script",
    "part_004_script",
    "part_005_script"
  ],
  "output_keys": [
    "story_outline",
    "part_001_script",
    "part_002_script",
    "part_003_script",
    "part_004_script",
    "part_005_script"
  ],
  "step_keys_match": true,
  "output_keys_match": true,
  "has_50_char_rule": false,
  "has_120_char_rule": true,
  "jp_markers_in_composed_prompts": {
    "あなたは": false,
    "ニュース本文": false,
    "チーム": false,
    "台本": false,
    "文字": false,
    "みなさん": false
  },
  "any_jp_marker_in_composed": false,
  "jp_markers_in_team_context": {
    "あなたは": false,
    "ニュース本文": false,
    "チーム": false,
    "台本": false,
    "文字": false,
    "みなさん": false
  },
  "composed_cjk_char_count": 0,
  "story_outline_english": true,
  "part1_english": true,
  "schema_version": true,
  "has_required_top_level": true,
  "news_input_shape": true,
  "output_settings_video_id": true,
  "metadata_source": true,
  "metadata_locale": true,
  "input_ids_used": {
    "team_context_id": "463adde8-f01b-4098-8ae8-76882d9a5ecf",
    "prompt_pipeline_id": "f3808527-76a2-45f5-822c-e6698c918211"
  },
  "all_passed": true
}
```

## Top-level payload

- job_id: `04c338ee-9518-4dc3-9d49-3d4d19132eac` (dry-run UUID, not persisted)
- team_context.name: **AI & DX Strategy Team**
- prompt_pipeline.name: **Business News Brief EN**
- prompt_modules: 6
- video_id: `202605171652`

## Modules

| step_order | step_key | output_key | name | sys len | user len |
|------------|----------|------------|------|---------|----------|
| 1 | `story_outline` | `story_outline` | Story outline | 935 | 1281 |
| 2 | `part_001_script` | `part_001_script` | Part 1 script — News overview | 1281 | 7725 |
| 3 | `part_002_script` | `part_002_script` | Part 2 script — Background and market context | 1281 | 8199 |
| 4 | `part_003_script` | `part_003_script` | Part 3 script — Structural theme | 1281 | 8019 |
| 5 | `part_004_script` | `part_004_script` | Part 4 script — Team impact | 1281 | 8238 |
| 6 | `part_005_script` | `part_005_script` | Part 5 script — Watch points and next questions | 1281 | 7720 |

## Composed prompt previews

### story_outline — system (first 400 chars)

```
You are a Business Brief Strategist who designs market intelligence video structures for internal business teams.

Your job is not to summarize the news.

Your job is to design how this news should be understood from the team's perspective:
- what matters
- what context is needed
- what structural pattern it reflects
- how it may affect the team's work
- what the team should watch or discuss next

```

### story_outline — user (first 400 chars)

```
Using the Team Context and news inputs below, create a five-part Business News Brief story outline.

# Team Context
{{team_context}}

# News title
{{news_title}}

# News body
{{news_body}}

# Additional notes
{{news_notes}}

The outline should help the team:
1. Align on what happened
2. Understand why it matters
3. See industry and market context
4. Clarify team-relevant impact
5. Identify what to
```

### part_001_script — system (first 400 chars)

```
0. Role and purpose

You generate scripts for English Business News Brief videos as a dialogue between Mia and Yu.

Goal: help viewers quickly understand the news headline, background, structural pattern, team relevance, and what to watch next.

This is not a headline recap.
Convert the news into an internal team briefing the group can share before meetings or customer calls.

Audience: sales, bus
```

### part_001_script — user (first 400 chars)

```
2. Output format (JSON)

Always output in this shape:

{
  "lines": [
    { "speaker": "Mia", "text": "...", "topic_id": "topic_{PART}_001" },
    { "speaker": "Yu",  "text": "...", "topic_id": "topic_{PART}_001" }
  ],
  "topics": [
    {
      "topic_id": "topic_{PART}_001",
      "layout_type": "title_bullets",
      "layout": {
        "title": "...",
        "bullets": ["...", "..."]
      }

```

### part_002_script — system (first 400 chars)

```
0. Role and purpose

You generate scripts for English Business News Brief videos as a dialogue between Mia and Yu.

Goal: help viewers quickly understand the news headline, background, structural pattern, team relevance, and what to watch next.

This is not a headline recap.
Convert the news into an internal team briefing the group can share before meetings or customer calls.

Audience: sales, bus
```

### part_002_script — user (first 400 chars)

```
2. Output format (JSON)

Always output in this shape:

{
  "lines": [
    { "speaker": "Mia", "text": "...", "topic_id": "topic_{PART}_001" },
    { "speaker": "Yu",  "text": "...", "topic_id": "topic_{PART}_001" }
  ],
  "topics": [
    {
      "topic_id": "topic_{PART}_001",
      "layout_type": "title_bullets",
      "layout": {
        "title": "...",
        "bullets": ["...", "..."]
      }

```

### part_003_script — system (first 400 chars)

```
0. Role and purpose

You generate scripts for English Business News Brief videos as a dialogue between Mia and Yu.

Goal: help viewers quickly understand the news headline, background, structural pattern, team relevance, and what to watch next.

This is not a headline recap.
Convert the news into an internal team briefing the group can share before meetings or customer calls.

Audience: sales, bus
```

### part_003_script — user (first 400 chars)

```
2. Output format (JSON)

Always output in this shape:

{
  "lines": [
    { "speaker": "Mia", "text": "...", "topic_id": "topic_{PART}_001" },
    { "speaker": "Yu",  "text": "...", "topic_id": "topic_{PART}_001" }
  ],
  "topics": [
    {
      "topic_id": "topic_{PART}_001",
      "layout_type": "title_bullets",
      "layout": {
        "title": "...",
        "bullets": ["...", "..."]
      }

```

### part_004_script — system (first 400 chars)

```
0. Role and purpose

You generate scripts for English Business News Brief videos as a dialogue between Mia and Yu.

Goal: help viewers quickly understand the news headline, background, structural pattern, team relevance, and what to watch next.

This is not a headline recap.
Convert the news into an internal team briefing the group can share before meetings or customer calls.

Audience: sales, bus
```

### part_004_script — user (first 400 chars)

```
2. Output format (JSON)

Always output in this shape:

{
  "lines": [
    { "speaker": "Mia", "text": "...", "topic_id": "topic_{PART}_001" },
    { "speaker": "Yu",  "text": "...", "topic_id": "topic_{PART}_001" }
  ],
  "topics": [
    {
      "topic_id": "topic_{PART}_001",
      "layout_type": "title_bullets",
      "layout": {
        "title": "...",
        "bullets": ["...", "..."]
      }

```

### part_005_script — system (first 400 chars)

```
0. Role and purpose

You generate scripts for English Business News Brief videos as a dialogue between Mia and Yu.

Goal: help viewers quickly understand the news headline, background, structural pattern, team relevance, and what to watch next.

This is not a headline recap.
Convert the news into an internal team briefing the group can share before meetings or customer calls.

Audience: sales, bus
```

### part_005_script — user (first 400 chars)

```
2. Output format (JSON)

Always output in this shape:

{
  "lines": [
    { "speaker": "Mia", "text": "...", "topic_id": "topic_{PART}_001" },
    { "speaker": "Yu",  "text": "...", "topic_id": "topic_{PART}_001" }
  ],
  "topics": [
    {
      "topic_id": "topic_{PART}_001",
      "layout_type": "title_bullets",
      "layout": {
        "title": "...",
        "bullets": ["...", "..."]
      }

```

## n8n compatibility

- `schema_version: 2` — unchanged
- Top-level keys match `N8nBriefPayload` in `src/lib/brief/n8n-payload.ts`
- `prompt_modules[]` still includes `composed_system_prompt` / `composed_user_prompt` per module
- Placeholders `{{team_context}}`, `{{news_body}}`, etc. remain in templates for n8n substitution

## Next step

Ready to duplicate n8n workflow for EN (same JSON shape; English prompts + TTS).