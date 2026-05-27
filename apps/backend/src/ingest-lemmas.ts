/**
 * Production CLI entry for the lemma seed loader.
 *
 * Bundled to dist/ingest-lemmas.js alongside dist/index.js so it can be
 * run inside the deployed backend container after a release:
 *
 *   bun ./dist/ingest-lemmas.js --input <dir>
 *
 * The <dir> must contain `lemmas.jsonl` (universal fields, ~2,166 loaded
 * Strong's entries baseline) and optionally `lemma_translations.jsonl`
 * (per-language fields, one row per (strongs, language_code)). Either is
 * optional — running just one is fine.
 *
 * Idempotent: re-running upserts in place. lemma_translations rows whose
 * strongs isn't in the lemmas table get skipped + counted.
 *
 * See scripts/lemma-translate/README.md for how the JSONLs are produced
 * (English baseline extracted from @versemate/lexicon, non-English from
 * an Anthropic Batches API translation pass).
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { main } from "backend-base/src/bible/ingest-lemmas";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    input: { type: "string" },
  },
  allowPositionals: true,
});

if (!values.input) {
  console.error("usage: bun ./dist/ingest-lemmas.js --input <dir>");
  process.exit(2);
}

main(path.resolve(values.input))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
