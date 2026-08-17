/**
 * Generate Jesus event content.
 *
 *   bun run jesus:generate -- --dry-run
 *   bun run jesus:generate -- --types=overview,compare --limit=10
 *   bun run jesus:generate -- --event=event-storm-stilled --overwrite
 *   AI_PROVIDER=stub bun run jesus:generate -- --limit=3     # no API key needed
 *
 * Runs sequentially and reports per event so a partial run is resumable: an
 * event that already has content is skipped unless --overwrite is passed, so
 * re-running after a failure only does the outstanding work.
 *
 * Content is written at the provenance level its type earns — never level 1.
 * Nothing here marks anything reviewed; that is a human step, and
 * `reviewed_by` / `reviewed_at` stay null until it happens.
 */
import { db } from "database";
import {
  JESUS_EVENT_EXPLANATION_TYPES,
  type JesusEventExplanationType,
} from "../jesus.constants";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import { JesusGenerationService } from "../services/jesus-generation.service";

interface Options {
  types: JesusEventExplanationType[];
  event?: string;
  limit: number;
  dryRun: boolean;
  overwrite: boolean;
  model?: string;
  bibleVersion: string;
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

  const requested = get("types")
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const types = (
    requested?.length
      ? requested.filter((t): t is JesusEventExplanationType =>
          (JESUS_EVENT_EXPLANATION_TYPES as readonly string[]).includes(t),
        )
      : [...JESUS_EVENT_EXPLANATION_TYPES]
  ) as JesusEventExplanationType[];

  if (requested?.length && types.length !== requested.length) {
    const unknown = requested.filter((t) => !types.includes(t as never));
    throw new Error(
      `Unknown --types value(s): ${unknown.join(", ")}. Valid: ${JESUS_EVENT_EXPLANATION_TYPES.join(", ")}`,
    );
  }

  return {
    types,
    event: get("event"),
    limit: Number.parseInt(get("limit") ?? "0", 10) || Number.POSITIVE_INFINITY,
    dryRun: has("dry-run"),
    overwrite: has("overwrite"),
    model: get("model"),
    bibleVersion: get("bible-version") ?? "NASB1995",
    languageCode: get("language") ?? "en-US",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const service = new JesusGenerationService(db);
  const events = new JesusEventRepository(db);

  // Fail fast and legibly. Without the shared theological framework this would
  // generate against no guidance at all, which is worse than generating
  // nothing — and finding out per-event means N stack traces instead of one
  // sentence.
  const preflight = await service.checkPreconditions(options.types);
  if (preflight.length) {
    console.error("Cannot generate:\n");
    for (const problem of preflight) console.error(`  · ${problem}`);
    console.error(
      "\nThe system prompt is seeded by the Bible seed; the Jesus templates by migration 20260817140000.",
    );
    process.exit(1);
  }

  const targets = options.event
    ? [options.event]
    : (await events.listEvents({}, { limit: 1000, orderBy: "chronology" })).map(
        (e) => e.slug,
      );

  const selected = targets.slice(0, options.limit);

  console.log(
    `${options.dryRun ? "[dry run] " : ""}${selected.length} event(s) × ${options.types.length} type(s) = ${selected.length * options.types.length} generation(s)`,
  );
  console.log(
    `provider=${process.env.AI_PROVIDER ?? "openai"} model=${options.model ?? "gpt-5"} version=${options.bibleVersion}\n`,
  );

  const tally = { saved: 0, skipped: 0, rejected: 0 };
  const failures: Array<{ slug: string; type: string; issues: string }> = [];

  for (const slug of selected) {
    for (const type of options.types) {
      const result = await service.generateForEvent(slug, type, {
        languageCode: options.languageCode,
        bibleVersion: options.bibleVersion,
        model: options.model,
        dryRun: options.dryRun,
        overwrite: options.overwrite,
      });

      tally[result.status]++;
      if (result.status === "rejected") {
        const detail = (result.issues ?? [])
          .map((i) => `${i.rule}: ${i.detail}`)
          .join("; ");
        failures.push({ slug, type, issues: detail });
        console.log(`  ✗ ${slug} · ${type} — ${detail}`);
      } else if (result.status === "saved") {
        console.log(`  ✓ ${slug} · ${type} (${result.chars} chars)`);
      }
    }
  }

  console.log(
    `\nsaved ${tally.saved} · skipped ${tally.skipped} · rejected ${tally.rejected}`,
  );

  if (failures.length) {
    console.log(
      `\n${failures.length} rejected by validation. These are NOT stored — re-run to retry:`,
    );
    for (const f of failures)
      console.log(`  ${f.slug} · ${f.type}: ${f.issues}`);
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
