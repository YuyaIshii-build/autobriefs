# Team Context EN — Review (Draft)

Generated for: **Business News Brief EN** demos  
Status: **draft_not_in_db** — not saved to Supabase yet

---

## Existing Team Context in DB (JP)

| Field | Value |
|-------|--------|
| **id** | `8fa2cb7d-0334-482a-baea-c5b069bb39d4` |
| **name** | AI・DX戦略提案チーム |
| **created_at** | 2026-05-12T04:25:16.045471+00:00 |
| **updated_at** | 2026-05-12T04:25:16.045471+00:00 |

### JP field summary

**company_summary**  
大手企業向けにDX・AI導入支援を行う国内SIer。製造業、物流、小売、金融など幅広い業界に対して、業務改善、生成AI活用、データ基盤構築などを提案している。

**target_industries**  
生成AI、クラウド、ソフトウェア、製造業DX、物流DX

**customers**  
大手製造業、物流企業、小売企業、金融機関の情報システム部門・事業企画部門

**competitors**  
アクセンチュア、NTTデータ、富士通、日立、IBM、AWS系パートナー企業

**team_role**  
顧客向け提案活動に必要な市場・競合・技術トレンドを整理し、チーム内で共通認識を持ちながら提案方針を検討する。

**briefing_goals**  
単なるニュース共有ではなく、「顧客や競合がこの変化をどう使おうとしているか」「自社提案や顧客課題にどう関係するか」を短時間でチーム共有。事実整理だけでなく、背景・構造・市場の見方・次に確認すべき論点までを揃える。

**tone**  
落ち着いたビジネス向け。専門性は保ちつつ、忙しいメンバーでも短時間で理解できる簡潔さ。煽りや断定は避ける。

**notes**  
営業会議前や提案準備前に短時間で視点を揃える用途。顧客との会話で使える整理軸や問いを重視。

**Live DB count at export time:** 1 row

---

## Design changes from JP

| JP framing | EN framing |
|------------|------------|
| 国内SIer | enterprise technology consulting / systems integration firm |
| 日本語の部門名 | IT leaders, architecture teams, business strategy groups |
| ニュース共有 | client impact, competitor moves, proposal angles |
| 営業会議前 | deal reviews, proposal working sessions, client briefings |

Not a literal translation. Written for English-speaking B2B SaaS / consulting demos.

---

## EN Team Context draft

| Field | Value |
|-------|--------|
| **id** | `463adde8-f01b-4098-8ae8-76882d9a5ecf` |
| **name** | AI & DX Strategy Team |

### EN full text

**company_summary**

Enterprise technology consulting and systems integration firm helping large organizations adopt AI, modernize operations, and build cloud and data platforms.

The firm works across manufacturing, logistics, retail, and financial services on business transformation, generative AI use cases, integration programs, and data foundation initiatives.

**target_industries**

Generative AI, cloud platforms, enterprise software, manufacturing transformation, logistics and supply chain technology

**customers**

IT leaders, architecture teams, and business strategy groups at large manufacturers, logistics operators, retailers, and financial institutions

**competitors**

Accenture, NTT DATA, Fujitsu, Hitachi, IBM, and major AWS ecosystem partners

**team_role**

Prepares market, competitor, and technology intelligence for enterprise client pursuits.

The team aligns on how industry news affects client conversations, competitive positioning, and proposal angles before sales meetings, deal reviews, and proposal development.

**briefing_goals**

This is not headline news sharing.

Briefings should help the team quickly align on:

- how clients and competitors may act on a development
- how the story connects to our proposals and client priorities
- what to validate or discuss next

Each brief should align facts, background, structural framing, and open questions the team can use in the field.

**tone**

Calm, credible, and business-oriented.

Keep language accessible for busy sales and solution stakeholders.

Avoid hype, sensationalism, and overconfident claims.

**notes**

Designed for short alignment before internal deal reviews, proposal working sessions, and client briefings.

Prioritize practical framing, client-impact angles, and questions that are usable in customer conversations.

---

## Duplicate check (before seed)

Seed script verifies:

- `team_contexts.id` = `463adde8-f01b-4098-8ae8-76882d9a5ecf` does not exist
- `team_contexts.name` = `AI & DX Strategy Team` does not exist

JP row `8fa2cb7d-0334-482a-baea-c5b069bb39d4` must remain unchanged.

---

## Pre-DB checklist

- [ ] Human review of EN copy for demo narrative
- [ ] Pair with **Business News Brief EN** pipeline in Create Brief UI (manual selection)
- [ ] Run `node scripts/seed-en-team-context.mjs` (dry-run)
- [ ] Run `node scripts/seed-en-team-context.mjs --apply` when approved

---

## Rollback (after apply)

```sql
DELETE FROM public.team_contexts
WHERE id = '463adde8-f01b-4098-8ae8-76882d9a5ecf';
```

Only safe if no `generation_jobs` reference this `team_context_id`.
