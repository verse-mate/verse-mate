# Lemma translation pipeline

Server-side translation of lemma cards (tap-to-meaning popovers) for the
10 non-English languages the backend serves. Output is consumed by
`apps/backend/src/ingest-lemmas.ts` and written to `lemmas` +
`lemma_translations` tables.

## Schema convention (matches `topics` + `topic_translations`)

- **`lemmas`** holds universal fields AND English baseline content
  (`pos`, `basic_gloss`, `semantic_range`, `notes`, `related`). English
  is the default; serving an English card needs no JOIN.
- **`lemma_translations`** holds NON-English rows only, one per
  (strongs, language_code). Field names prefix with `translated_` to
  mirror `topic_translations.translated_name` / `translated_description`.

## Scope

Translate the **~2,166 lemmas where `loaded = true`** in the lexicon —
the curated tap-worthy theological/biblical vocabulary. The remaining
~16K rare entries stay English-only (frontend filter doesn't underline
them anyway).

10 target languages: `es, de, fr, ru, it, pt, ro, hi, tl, uk`.

## Cost

~$22 batch (Haiku 4.5 at 50% off realtime). Wall-clock: usually
30-90 min for the Anthropic batch to process.

## Pipeline

```bash
# 1. EXTRACT lemmas.jsonl from @versemate/lexicon's _lemmas.json
python3 extract_baseline.py \
  --lemmas-json /path/to/verse-mate-web/src/data/lexicon/generated/_lemmas.json \
  --out-dir ./out

#   Writes:
#     out/lemmas.jsonl  — all 18,083 rows. English baseline populated for
#                          ~2,166 `loaded` rows; null for the long-tail
#                          ~16K untapped rows.

# 2. TRANSLATE via Anthropic Batches API (~30-90 min)
export ANTHROPIC_API_KEY=sk-ant-...
python3 translate_batch.py \
  --baseline ./out/lemmas.jsonl \
  --out-dir ./out \
  --run

#   Writes:
#     out/translate_batch.jsonl       — the records that were submitted
#     out/.batch_id                    — resumable batch ID
#     out/lemma_translations.jsonl     — translated rows, 10 langs × 2,160
#                                         lemmas, ~21,600 rows total

# 3. DEPLOY — hand `out/` to the operator
```

After steps 1 + 2, `out/` is ready to feed the loader.

## Deploy

Hand the `out/` directory to the operator who can run inside the prod
container:

```sh
bun ./dist/ingest-lemmas.js --input /path/to/out/
```

Order: the loader processes `lemmas.jsonl` first (since
`lemma_translations.strongs` has an FK on `lemmas.strongs`), then
`lemma_translations.jsonl`. Both upsert in batches of 500. Re-running
overwrites in place — safe to retry after partial failures. Translations
file rows with `language_code='en'` get rejected (would conflict with the
English baseline already on the `lemmas` row).

## What gets translated per entry

The English content lives on the `lemmas` row. The LLM rewrites it into
each target language and writes those into `lemma_translations`:

| Source field on lemmas | Translation target | Column on lemma_translations |
|---|---|---|
| `pos` | "Sustantivo (masc.)" / "Substantiv (mask.)" | `translated_pos` |
| `basic_gloss` | short headword | `translated_basic_gloss` |
| `semantic_range` | array of 3-5 senses | `translated_semantic_range` |
| `notes` | 1-3 sentence scholarly note | `translated_notes` |
| `related[].note` | relationship explanation | `translated_related[].note` |

Fields that stay universal (never translated):
- `lemma` — original Greek/Hebrew script
- `translit` — transliteration slug (lookup key)
- `pronunciation` — English-pronunciation hint
- `strongs`, `nt_frequency`, `ot_frequency`, `loaded` — metadata

## Re-running

Both scripts cache state:
- `extract_baseline.py` is deterministic — re-running overwrites `out/lemmas.jsonl` from the current `_lemmas.json`.
- `translate_batch.py` caches the batch_id in `out/.batch_id`. `--run` resumes the poll loop if a batch is already submitted. Delete `.batch_id` to force a fresh batch.

## Re-translate one language only

```bash
python3 translate_batch.py --baseline ./out/lemmas.jsonl \
  --langs es --out-dir ./out-es-redo --run
```

The loader's `ON CONFLICT (strongs, language_code) DO UPDATE` makes
re-running for a single language safe — only those rows get updated.
