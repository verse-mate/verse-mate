# Lemma translation pipeline

Server-side translation of lemma cards (tap-to-meaning popovers) for the
10 non-English languages the backend serves. Output is consumed by
`apps/backend/src/ingest-lemmas.ts` and written to `lemmas` +
`lemma_translations` tables.

## Scope

Translate the **~2,166 lemmas where `loaded = true`** in the lexicon —
the curated tap-worthy theological/biblical vocabulary. The remaining
~16K rare entries stay English-only; they're invisible to users since the
frontend filters underlines to `loaded=true` lemmas.

10 target languages: `es, de, fr, ru, it, pt, ro, hi, tl, uk`.

## Cost

~$22 batch (Haiku 4.5 at 50% off realtime). Wall-clock: usually
30-90 min for the Anthropic batch to process.

## Pipeline (3 steps)

```bash
# 1. EXTRACT the English baseline from @versemate/lexicon's _lemmas.json
python3 extract_baseline.py \
  --lemmas-json /path/to/verse-mate-web/src/data/lexicon/generated/_lemmas.json \
  --out-dir ./out

#   Writes:
#     out/lemmas.jsonl              — universal fields, all 18,083 rows
#     out/lemma_translations.jsonl  — English rows, 2,160 loaded entries

# 2. TRANSLATE via Anthropic Batches API (~30-90 min)
export ANTHROPIC_API_KEY=sk-ant-...
python3 translate_batch.py \
  --baseline ./out/lemma_translations.jsonl \
  --out-dir ./out \
  --run

#   Writes:
#     out/translate_batch.jsonl          — the records that were submitted
#     out/.batch_id                       — resumable batch ID
#     out/lemma_translations.llm.jsonl    — translated rows, 10 langs × 2,160

# 3. MERGE the English + translated outputs into the loader's input file
cat out/lemma_translations.jsonl out/lemma_translations.llm.jsonl \
    > out/lemma_translations.jsonl.merged
mv out/lemma_translations.jsonl.merged out/lemma_translations.jsonl

# Now `out/lemmas.jsonl` + `out/lemma_translations.jsonl` are the seed
# files for ingest-lemmas — same idempotent upsert pattern as
# ingest-strongs-tokens.
```

## Deploy

Hand the `out/` directory to the operator who can run inside the prod
container:

```sh
bun ./dist/ingest-lemmas.js --input /path/to/out/
```

The loader processes lemmas.jsonl first (since lemma_translations have an
FK on it), then lemma_translations.jsonl. Both upsert in batches of 500.
Re-running overwrites in place — safe to retry after partial failures.

## What gets translated per entry

The English LexEntry fields the LLM rewrites:
  - `pos` — "Noun (masc.)" → "Sustantivo (masc.)" / "Substantiv (mask.)"
  - `basic_gloss` — short headword
  - `semantic_range` — array of 3-5 senses
  - `notes` — 1-3 sentence scholarly note
  - `related[].note` — relationship explanation

Fields that stay untouched:
  - `lemma` — original Greek/Hebrew script
  - `translit` — transliteration slug (Latin, lookup key)
  - `pronunciation` — English pronunciation hint (not user-facing in
    non-English UIs anyway)
  - `strongs`, `nt_frequency`, `ot_frequency`, `loaded` — pure metadata

## Re-running

Both scripts cache state aggressively:
  - `extract_baseline.py` is deterministic; re-running overwrites the
    output JSONLs from the current `_lemmas.json`
  - `translate_batch.py` caches the batch_id in `out/.batch_id` — if a
    batch is already submitted, `--run` resumes its poll loop instead of
    re-submitting. To force a fresh batch, delete `.batch_id` first.

## Future: re-translate one language only

```bash
python3 translate_batch.py --baseline ./out/lemma_translations.jsonl \
  --langs es --out-dir ./out-es-redo --run
```

Outputs a new `out-es-redo/lemma_translations.llm.jsonl` with Spanish
only; merge it into the seed directory and re-run `ingest-lemmas` to
upsert just those rows. The loader's `ON CONFLICT (strongs,
language_code) DO UPDATE` semantics make this safe.
