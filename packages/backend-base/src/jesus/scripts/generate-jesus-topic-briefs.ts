/**
 * Generate the topic briefs behind the category browse.
 *
 *   bun run jesus:briefs -- --dry-run
 *   bun run jesus:briefs -- --category=teachings --print   # show the prompt, send nothing
 *   bun run jesus:briefs -- --category=teachings
 *   bun run jesus:briefs -- --category=questions --topic=kingdom --overwrite
 *   AI_PROVIDER=stub bun run jesus:briefs -- --limit=3     # no API key needed
 *
 * One brief per (category × topic) pair that has anything in it. Pairs are
 * derived from the corpus, not from the cross product — asking for a paragraph
 * about a topic a category never touches would produce prose about nothing.
 *
 * Runs sequentially and reports per pair so a partial run is resumable: a topic
 * that already has a brief is skipped unless --overwrite is passed, so
 * re-running after a failure only does the outstanding work.
 *
 * Briefs are stored at level 2 (interpretation) — never level 1, which means
 * "explicitly present in the text". Nothing here marks anything reviewed;
 * `reviewed_by` / `reviewed_at` stay null until a human does it.
 */
import { db } from "database";
import { getFacetTypeFromSlug } from "../jesus.constants";
import { JesusGenerationService } from "../services/jesus-generation.service";

interface Options {
  category?: string;
  topic?: string;
  limit: number;
  dryRun: boolean;
  overwrite: boolean;
  print: boolean;
  model?: string;
  languageCode: string;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) =>
    argv
      .find((a) => a.startsWith(`--${name}=`))
      ?.split("=")
      .slice(1)
      .join("=");
  const has = (name: string) => argv.includes(`--${name}`);

  const category = get("category");
  if (category && !getFacetTypeFromSlug(category)) {
    throw new Error(
      `Unknown --category value: ${category}. Use a category slug such as "teachings" or "questions".`,
    );
  }

  return {
    category,
    topic: get("topic"),
    limit: Number.parseInt(get("limit") ?? "0", 10) || Number.POSITIVE_INFINITY,
    dryRun: has("dry-run"),
    overwrite: has("overwrite"),
    print: has("print"),
    model: get("model"),
    languageCode: get("language") ?? "en-US",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const service = new JesusGenerationService(db);

  // Fail fast and legibly. Without the shared theological framework this would
  // generate against no guidance at all, which is worse than generating
  // nothing.
  const preflight = await service.checkTopicBriefPreconditions();
  if (preflight.length) {
    console.error("Cannot generate:\n");
    for (const problem of preflight) console.error(`  · ${problem}`);
    console.error(
      "\nThe system prompt is seeded by the Bible seed; the topic-brief template by migration 20260823130000.",
    );
    process.exit(1);
  }

  const wanted = options.category
    ? getFacetTypeFromSlug(options.category)
    : null;

  const targets = (await service.listTopicBriefTargets(options.languageCode))
    .filter((t) => (wanted ? t.facetType === wanted : true))
    .filter((t) => (options.topic ? t.themeSlug === options.topic : true))
    .slice(0, options.limit);

  if (targets.length === 0) {
    console.log(
      "Nothing to do — no (category × topic) pair matched. Is the corpus seeded?",
    );
    await db.closeConnection();
    return;
  }

  console.log(
    `${options.dryRun ? "[dry run] " : ""}${targets.length} topic brief(s)`,
  );
  console.log(
    `provider=${process.env.AI_PROVIDER ?? "openai"} model=${options.model ?? "gpt-5"} language=${options.languageCode}\n`,
  );

  // A prompt you cannot read is a prompt you cannot review. --print renders
  // exactly what a real run would submit for the first target and stops.
  if (options.print) {
    const [first] = targets;
    const request = await service.buildTopicBriefRequest(
      first.facetType,
      first.themeSlug,
      {
        languageCode: options.languageCode,
        model: options.model,
        overwrite: true,
      },
    );
    if (request.status !== "ready") {
      console.log(
        `Nothing to render for ${first.facetType} · ${first.themeSlug}`,
      );
    } else {
      console.log(`── ${first.facetType} · ${first.themeSlug} ──`);
      console.log(`\n[instructions]\n${request.instructions}`);
      console.log(`\n[input]\n${request.input}`);
    }
    await db.closeConnection();
    return;
  }

  const tally = { saved: 0, skipped: 0, rejected: 0 };
  const failures: Array<{ target: string; issues: string }> = [];

  for (const target of targets) {
    const label = `${target.facetType.toLowerCase()} · ${target.themeSlug}`;
    const result = await service.generateTopicBrief(
      target.facetType,
      target.themeSlug,
      {
        languageCode: options.languageCode,
        model: options.model,
        dryRun: options.dryRun,
        overwrite: options.overwrite,
      },
    );

    tally[result.status]++;
    if (result.status === "rejected") {
      const detail = (result.issues ?? [])
        .map((i) => `${i.rule}: ${i.detail}`)
        .join("; ");
      failures.push({ target: label, issues: detail });
      console.log(`  ✗ ${label} — ${detail}`);
    } else if (result.status === "saved") {
      console.log(`  ✓ ${label} (${result.chars} chars)`);
    } else if (result.detail && result.detail !== "dry run") {
      console.log(`  – ${label} — ${result.detail}`);
    }
  }

  console.log(
    `\nsaved ${tally.saved} · skipped ${tally.skipped} · rejected ${tally.rejected}`,
  );

  if (failures.length) {
    console.log(
      `\n${failures.length} rejected by validation. These are NOT stored — re-run to retry:`,
    );
    for (const f of failures) console.log(`  ${f.target}: ${f.issues}`);
  }

  await db.closeConnection();
  // A run that produced only rejections should fail its shell, so a scheduled
  // job doesn't report success while writing nothing.
  if (tally.saved === 0 && tally.rejected > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
