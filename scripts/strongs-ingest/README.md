# Strong's-tokens ingest

Offline pipeline that produces the `<version_key>_tokens.jsonl` seed files
consumed by the backend's `ingest-strongs-tokens` CLI.

Two source paths feed the same output format:

## 1. Published CrossWire SWORD modules (preferred — free, hand-edited)

For translations where a Strong's-tagged SWORD module already exists:
Spanish (RVR09), German (SCH51), French (LSG), Russian (SYN).

```bash
# Install pysword (parses zText + Sapphire-decrypted OSIS)
pip install pysword

# Download + unpack the module
curl -L -o /tmp/SpaRV1909.zip \
  https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/SpaRV1909.zip
mkdir -p /tmp/sword/SpaRV1909 && unzip -o /tmp/SpaRV1909.zip -d /tmp/sword/SpaRV1909

# Generate the JSONL
python3 ingest_strongs.py --version-key RVR09 \
  --out-jsonl out/rvr09_tokens.jsonl \
  --smoke-test
```

Registered modules (see `TRANSLATIONS` dict in `ingest_strongs.py`):

| version_key | CrossWire module     | Source                                                                        |
|-------------|----------------------|-------------------------------------------------------------------------------|
| RVR09       | SpaRV1909            | https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/SpaRV1909.zip       |
| SCH51       | GerSch               | https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/GerSch.zip          |
| LSG         | FreSegond1910        | https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/FreSegond1910.zip   |
| SYN         | RusSynodalLIO        | https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/RusSynodalLIO.zip   |

For each, repeat the workflow above with `--version-key <KEY>`.

## 2. LLM-aligned (for translations without published Strong's tagging)

For translations where no Strong's-tagged source exists in the open canon:
Italian (RIV), Portuguese (BLIV), Romanian (VDC), Hindi (HCV), Tagalog
(TGLULB), Ukrainian (UKRKL).

The pilot script under `llm_align_pilot.py` aligns one chapter at a time
using Claude Haiku 4.5 (sequential real-time calls — cheap for one
chapter, switch to the Anthropic Batches API before running a full Bible).
It uses the verses already tagged via path #1 to constrain the candidate
Strong's inventory per verse, and the production `_lemmas.json` from
`@versemate/lexicon` for definitions so the LLM sees the same data the
frontend will render.

See `llm_align_pilot.py --help`. Costs roughly **$35 per full-Bible
language** at Haiku batch pricing — full 6-language run is **~$210**.

## Hard invariant the loader enforces (both paths)

For every emitted JSONL row, the loader checks:

```python
"".join(t["text"] for t in tokens) == verses.text  # in the DB
```

…before writing. Rows that don't match are skipped (left as
`tokens IS NULL`) and the chapter endpoint serves the legacy plain-text
shape for those. No corruption possible.

## Output format

One JSON object per line, matching `SeedRow` in
`packages/backend-base/src/bible/ingest-strongs-tokens.ts`:

```jsonl
{"version_key": "RVR09", "book_id": 59, "chapter": 1, "verse_number": 1, "tokens": [
  {"text": "JACOBO", "strongs": "G2385"},
  {"text": ", "},
  {"text": "siervo", "strongs": "G1401"},
  ...
]}
```

## Deploy workflow

1. Generate `out/<key>_tokens.jsonl` for each version on a dev box.
2. Copy the directory into the running backend container: `docker cp out/ <container>:/seed/`
3. Inside the container: `bun ./dist/ingest-strongs-tokens.js --input /seed`
4. Tear down the seed directory: `docker exec <container> rm -rf /seed`

Idempotent — safe to re-run.
