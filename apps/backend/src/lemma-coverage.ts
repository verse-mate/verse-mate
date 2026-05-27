/**
 * Production CLI entry for the lemma translation-coverage report.
 *
 * Bundled to dist/lemma-coverage.js alongside dist/index.js so it can be
 * run inside the deployed backend container to see how much of each
 * language's lemma set is translated:
 *
 *   bun ./dist/lemma-coverage.js                 # all known languages
 *   bun ./dist/lemma-coverage.js --lang es,de    # a subset
 *   bun ./dist/lemma-coverage.js --json          # machine-readable
 *
 * Read-only. See scripts/lemma-translate/README.md for how to backfill the
 * gaps this report surfaces.
 */
import { parseArgs } from "node:util";
import { reportCoverage } from "backend-base/src/lemmas/coverage";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    lang: { type: "string" },
    json: { type: "boolean" },
  },
  allowPositionals: true,
});

const langs = values.lang
  ? values.lang
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : undefined;

reportCoverage({ langs, json: values.json ?? false })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
