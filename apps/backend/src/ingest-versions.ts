/**
 * Production CLI entry for the multi-version Bible ingest loader.
 *
 * In the deployed backend image this is bundled to dist/ingest-versions.js
 * alongside dist/index.js + dist/migrator.js, so it can be run from inside
 * the running backend container after a deploy:
 *
 *   bun ./dist/ingest-versions.js --input <dir> [--version KEY]
 *
 * The <dir> must contain the output of verse-mate-web's
 * scripts/bible-ingest/build.py (one subdirectory per version key, each with
 * manifest.json + <bookId>/<chapter>.json files). Place that directory
 * inside the container before running (e.g. via `docker cp` or by mounting a
 * volume), since the underlying loader reads from the local filesystem and
 * does not fetch the data itself.
 *
 * Idempotent: re-running updates existing verse text rather than duplicating
 * rows. Pass --version KEY to ingest a single version at a time.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { main } from "backend-base/src/bible/ingest-versions";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    input: { type: "string" },
    version: { type: "string" },
  },
  allowPositionals: true,
});

if (!values.input) {
  console.error(
    "usage: bun ./dist/ingest-versions.js --input <dir> [--version KEY]",
  );
  process.exit(2);
}

main(path.resolve(values.input), values.version)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
