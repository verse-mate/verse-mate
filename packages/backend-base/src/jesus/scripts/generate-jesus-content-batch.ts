/**
 * Generate Jesus event content through the OpenAI **Batch API**.
 *
 *   bun run jesus:generate:batch submit                      # build + upload + enqueue
 *   bun run jesus:generate:batch submit --types=overview --limit=10
 *   bun run jesus:generate:batch status  <batch_id>
 *   bun run jesus:generate:batch collect <batch_id>          # validate + write back
 *
 * WHY BATCH AND NOT THE SYNCHRONOUS SCRIPT
 *
 * `jesus:generate` sends one request at a time. That is twice the price — the
 * Batch API is half — and it fails badly: a run of 828 requests died partway
 * with `429 insufficient_quota`, having already spent the balance, leaving 563
 * records written and no way to resume except re-walking the whole corpus.
 *
 * A batch is one submission with a 24h completion window. It is cheaper, it
 * cannot be half-killed by a transient error, and its result file can be
 * written back as many times as needed because the writeback is idempotent.
 *
 * This matches the batch jobs already in `batch-operations.service.ts`
 * (translations, topics, rephrase): build JSONL of `/v1/responses` requests →
 * `filesCreate({purpose:"batch"})` → `batchesCreate` → poll → `filesContent`
 * → validate and write back.
 *
 * The prompt and the validation gate are NOT reimplemented here. Both come from
 * `JesusGenerationService` (`buildGenerationRequest` / `acceptGeneratedContent`),
 * so a batched record is held to exactly the standard a synchronous one is.
 */
import { db } from "database";
import { getAiProvider } from "../../shared/ai/ai-provider.factory";
import {
  JESUS_EVENT_EXPLANATION_TYPES,
  type JesusEventExplanationType,
} from "../jesus.constants";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import {
  EXTRACTION_MAX_OUTPUT_TOKENS,
  GENERATION_MAX_OUTPUT_TOKENS,
  GENERATION_REASONING_EFFORT,
  JesusGenerationService,
} from "../services/jesus-generation.service";
import {
  EMPTY_CATEGORIES,
  type KeepTally,
  normalizeFacetKey,
  selectFacetsToWrite,
} from "../utils/persist-extracted-facets";
import {
  ENRICH_INSTRUCTIONS,
  type Enrichment,
  writeEnrichment,
} from "./enrich-jesus-events";

/** One line of the JSONL, shaped exactly like the existing batch jobs. */
interface BatchLine {
  custom_id: string;
  method: "POST";
  url: "/v1/responses";
  body: {
    model: string;
    reasoning: { effort: "low" | "medium" | "high" };
    instructions: string;
    input: string;
    max_output_tokens: number;
  };
}

/** `custom_id` has to carry everything the writeback needs to route a result. */
const encodeId = (slug: string, type: string) => `${type}::${slug}`;
const decodeId = (id: string) => {
  const [type, ...rest] = id.split("::");
  return { type: type as JesusEventExplanationType, slug: rest.join("::") };
};

const get2 = (argv: string[], n: string) =>
  argv
    .find((a) => a.startsWith(`--${n}=`))
    ?.split("=")
    .slice(1)
    .join("=");

function parseArgs(argv: string[]) {
  const get = (n: string) =>
    argv
      .find((a) => a.startsWith(`--${n}=`))
      ?.split("=")
      .slice(1)
      .join("=");
  const has = (n: string) => argv.includes(`--${n}`);
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
    throw new Error(
      `Unknown --types value(s). Valid: ${JESUS_EVENT_EXPLANATION_TYPES.join(", ")}`,
    );
  }
  return {
    types,
    limit: Number.parseInt(get("limit") ?? "0", 10) || Number.POSITIVE_INFINITY,
    model: get("model"),
    languageCode: get("language") ?? "en-US",
    bibleVersion: get("bible-version") ?? "NASB1995",
    overwrite: has("overwrite"),
  };
}

async function submit(argv: string[]) {
  const opts = parseArgs(argv);
  const service = new JesusGenerationService(db);
  const events = new JesusEventRepository(db);

  const preflight = await service.checkPreconditions(opts.types);
  if (preflight.length) {
    console.error("Cannot generate:\n");
    for (const p of preflight) console.error(`  · ${p}`);
    process.exit(1);
  }

  const slugs = (
    await events.listEvents({}, { limit: 1000, orderBy: "chronology" })
  )
    .map((e) => e.slug)
    .slice(0, opts.limit);

  const lines: BatchLine[] = [];
  let skipped = 0;

  // Enrichment (status-doc items 6 and 9) is also one request per event: the
  // reveals/reactions/people/location tables and the per-Gospel passage notes
  // are all read off the same passage text.
  if (argv.includes("--enrich")) {
    for (const slug of slugs) {
      const full = await events.getEventBySlug(slug, opts.languageCode);
      const passageBlock = await service.renderEventPassages(slug, {
        languageCode: opts.languageCode,
        bibleVersion: opts.bibleVersion,
      });
      if (!full || !passageBlock) {
        skipped++;
        continue;
      }
      lines.push({
        custom_id: encodeId(slug, "enrich"),
        method: "POST",
        url: "/v1/responses",
        body: {
          model: opts.model ?? "gpt-5",
          reasoning: { effort: GENERATION_REASONING_EFFORT },
          instructions: ENRICH_INSTRUCTIONS,
          input: `Event: ${full.title}\nSummary: ${full.summary ?? ""}\nGospel accounts: ${(full.passages ?? []).map((x) => x.display).join(" · ")}\n\nPassages:\n${passageBlock}`,
          max_output_tokens: 16000,
        },
      });
    }
    console.log(
      `${lines.length} enrichment request(s) · ${skipped} unavailable`,
    );
    await finishSubmit(lines, argv, "jesus_enrich");
    return;
  }

  // Extraction is one request per event rather than per (event, type), and it
  // needs a much larger ceiling — see EXTRACTION_MAX_OUTPUT_TOKENS.
  if (argv.includes("--extract")) {
    for (const slug of slugs) {
      const built = await service.buildExtractionRequest(slug, {
        languageCode: opts.languageCode,
        bibleVersion: opts.bibleVersion,
        model: opts.model,
      });
      if (built.status !== "ready") {
        skipped++;
        continue;
      }
      lines.push({
        custom_id: encodeId(slug, "extract"),
        method: "POST",
        url: "/v1/responses",
        body: {
          model: built.model,
          reasoning: { effort: GENERATION_REASONING_EFFORT },
          instructions: built.instructions,
          input: built.input,
          max_output_tokens: EXTRACTION_MAX_OUTPUT_TOKENS,
        },
      });
    }
    console.log(
      `${lines.length} extraction request(s) · ${skipped} unavailable`,
    );
    await finishSubmit(lines, argv, "jesus_extract");
    return;
  }

  // Only what is actually outstanding is submitted, so re-submitting after a
  // partial run costs nothing for work already done.
  for (const slug of slugs) {
    for (const type of opts.types) {
      const built = await service.buildGenerationRequest(slug, type, {
        languageCode: opts.languageCode,
        bibleVersion: opts.bibleVersion,
        model: opts.model,
        overwrite: opts.overwrite,
      });
      if (built.status !== "ready") {
        skipped++;
        continue;
      }
      lines.push({
        custom_id: encodeId(slug, type),
        method: "POST",
        url: "/v1/responses",
        body: {
          model: built.model,
          reasoning: { effort: GENERATION_REASONING_EFFORT },
          instructions: built.instructions,
          input: built.input,
          max_output_tokens: GENERATION_MAX_OUTPUT_TOKENS,
        },
      });
    }
  }

  console.log(
    `${lines.length} request(s) to submit · ${skipped} already present or unavailable`,
  );
  await finishSubmit(lines, argv, "jesus_generate");
}

async function finishSubmit(lines: BatchLine[], argv: string[], label: string) {
  if (!lines.length) {
    await db.closeConnection();
    return;
  }

  const jsonl = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
  const buffer = Buffer.from(jsonl, "utf8");
  const mb = buffer.length / (1024 * 1024);
  if (mb > 100) {
    throw new Error(
      `Batch file is ${mb.toFixed(1)}MB, over OpenAI's 100MB limit — narrow it with --types or --limit.`,
    );
  }
  console.log(`  payload ${mb.toFixed(2)}MB`);

  // `--dry-run` stops here: it writes the exact JSONL that would be uploaded so
  // the request set can be inspected (and the resume arithmetic checked)
  // without spending anything.
  const dryRunOut = argv.find((a) => a.startsWith("--dry-run="))?.split("=")[1];
  if (argv.includes("--dry-run") || dryRunOut) {
    if (dryRunOut) await Bun.write(dryRunOut, jsonl);
    console.log(
      `[dry run] not uploaded${dryRunOut ? ` — payload written to ${dryRunOut}` : ""}`,
    );
    await db.closeConnection();
    return;
  }

  const ai = getAiProvider();
  const file = await ai.filesCreate({
    file: new File([new Uint8Array(buffer)], `${label}_${Date.now()}.jsonl`),
    purpose: "batch",
  });
  const batch = await ai.batchesCreate({
    inputFileId: file.id,
    endpoint: "/v1/responses",
    completionWindow: "24h",
  });

  console.log(`\nsubmitted: ${batch.id}  (status ${batch.status})`);
  console.log(`poll with:    bun run jesus:generate:batch status ${batch.id}`);
  console.log(`write back:   bun run jesus:generate:batch collect ${batch.id}`);
  await db.closeConnection();
}

async function status(batchId: string) {
  const ai = getAiProvider();
  const b = await ai.batchesRetrieve(batchId);
  console.log(`${batchId}: ${b.status}`);
  if (b.requestCounts) {
    const c = b.requestCounts;
    console.log(
      `  completed ${c.completed} · failed ${c.failed} · total ${c.total}`,
    );
  }
  if (b.outputFileId) console.log(`  output_file_id ${b.outputFileId}`);
  if (b.errorFileId) console.log(`  error_file_id  ${b.errorFileId}`);
}

async function collect(batchId: string, argv: string[]) {
  const opts = parseArgs(argv);
  const ai = getAiProvider();
  const b = await ai.batchesRetrieve(batchId);

  if (b.status !== "completed") {
    console.error(
      `batch is "${b.status}", not "completed" — nothing to write back yet.`,
    );
    process.exit(2);
  }
  if (!b.outputFileId) {
    console.error("batch completed with no output file");
    process.exit(3);
  }

  const service = new JesusGenerationService(db);
  const events = new JesusEventRepository(db);
  const conn = db.getOrCreateConnection();
  const text = await (await ai.filesContent(b.outputFileId)).text();
  const tally = { saved: 0, skipped: 0, rejected: 0 };
  const failures: string[] = [];
  const facetTally: KeepTally = {
    proposed: 0,
    written: 0,
    noText: 0,
    duplicate: 0,
    filtered: 0,
  };
  const usedSlugs = new Set<string>();
  const enrichTally = {
    location: 0,
    people: 0,
    reveals: 0,
    reactions: 0,
    accounts: 0,
  };
  const bookIds = new Map(
    (await conn.selectFrom("books").select(["book_id", "name"]).execute()).map(
      (b) => [b.name, b.book_id] as const,
    ),
  );
  const allTypes = argv.includes("--all-types");
  const wanted = new Set(
    (get2(argv, "types")
      ?.split(",")
      .map((t) => t.trim().toUpperCase()) ?? [...EMPTY_CATEGORIES]) as string[],
  );

  for (const raw of text.split("\n").filter(Boolean)) {
    let line: {
      custom_id: string;
      response?: {
        status_code?: number;
        body?: { output?: unknown; model?: string };
      };
      error?: unknown;
    };
    try {
      line = JSON.parse(raw);
    } catch {
      failures.push("unparseable output line");
      continue;
    }

    const { slug, type } = decodeId(line.custom_id);
    if (line.error || line.response?.status_code !== 200) {
      tally.rejected++;
      failures.push(`${slug} · ${type}: request failed`);
      continue;
    }

    // Responses-API shape: body.output[].content[].text
    const output = line.response?.body?.output as
      | Array<{ content?: Array<{ text?: string; type?: string }> }>
      | undefined;
    const outputText = (output ?? [])
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? "")
      .join("")
      .trim();

    if (!outputText) {
      tally.rejected++;
      failures.push(`${slug} · ${type}: empty output`);
      continue;
    }

    if (type === ("enrich" as never)) {
      const full = await events.getEventBySlug(slug, "en-US");
      if (!full) {
        tally.skipped++;
        continue;
      }
      let data: Enrichment;
      try {
        data = JSON.parse(
          outputText.trim().replace(/^```json\s*|\s*```$/g, ""),
        );
      } catch (err) {
        tally.rejected++;
        failures.push(
          `${slug} · enrich: ${(err as Error).message.slice(0, 60)}`,
        );
        continue;
      }
      // One malformed record must not abort the writeback of 206 good ones.
      let wrote: Awaited<ReturnType<typeof writeEnrichment>>;
      try {
        wrote = await writeEnrichment(conn, full.event_id, data, bookIds);
      } catch (err) {
        tally.rejected++;
        failures.push(
          `${slug} · enrich: ${(err as Error).message.slice(0, 80)}`,
        );
        continue;
      }
      enrichTally.location += wrote.location;
      enrichTally.people += wrote.people;
      enrichTally.reveals += wrote.reveals;
      enrichTally.reactions += wrote.reactions;
      enrichTally.accounts += wrote.accounts;
      tally.saved++;
      continue;
    }

    // Extraction results take the facet path: validated against the passage
    // text, then filtered and written at level 1 by the same rules the
    // synchronous `jesus:extract` uses.
    if (type === ("extract" as never)) {
      const built = await service.buildExtractionRequest(slug, {
        languageCode: opts.languageCode,
        bibleVersion: opts.bibleVersion,
      });
      if (built.status !== "ready") {
        tally.rejected++;
        failures.push(`${slug} · extract: ${built.detail}`);
        continue;
      }
      const ex = service.acceptExtraction(outputText, built.sourceText);
      if (ex.error) {
        tally.rejected++;
        failures.push(`${slug} · extract: ${ex.error}`);
        continue;
      }
      const full = await events.getEventBySlug(slug, "en-US");
      if (!full) {
        tally.skipped++;
        continue;
      }
      const existingKeys = new Set(
        (full.facets ?? []).map((f) =>
          normalizeFacetKey(String(f.text ?? f.title ?? "")),
        ),
      );
      const keep = selectFacetsToWrite({
        facets: ex.accepted,
        existingKeys,
        wantedTypes: allTypes ? null : wanted,
        eventSlug: slug,
        usedSlugs,
        tally: facetTally,
      });
      for (const f of keep) {
        await conn
          .insertInto("jesus_facets")
          .values({
            event_id: full.event_id,
            slug: f.slug,
            mode: f.mode,
            type: f.type,
            speaker: f.mode === "WORD" ? "JESUS" : null,
            actor: f.mode === "ACTION" ? "JESUS" : null,
            title: f.title,
            text: f.text,
            summary: null,
            provenance: 1,
            sort_order: 100,
            is_active: true,
          })
          .onConflict((oc) => oc.column("slug").doNothing())
          .execute();
      }
      tally.saved++;
      continue;
    }

    const result = await service.acceptGeneratedContent(
      slug,
      type,
      outputText,
      line.response?.body?.model ?? "gpt-5",
      { languageCode: opts.languageCode, bibleVersion: opts.bibleVersion },
    );
    tally[result.status]++;
    if (result.status === "rejected") {
      failures.push(
        `${slug} · ${type}: ${(result.issues ?? []).map((i) => `${i.rule}: ${i.detail}`).join("; ")}`,
      );
    }
  }

  console.log(
    `saved ${tally.saved} · skipped ${tally.skipped} · rejected ${tally.rejected}`,
  );
  if (enrichTally.reveals || enrichTally.reactions || enrichTally.people) {
    console.log(
      `enrichment: location ${enrichTally.location} · people ${enrichTally.people} · reveals ${enrichTally.reveals} · reactions ${enrichTally.reactions} · passages annotated ${enrichTally.accounts}`,
    );
  }
  if (facetTally.proposed) {
    console.log(
      `facets: proposed ${facetTally.proposed} · written ${facetTally.written} · dropped ${facetTally.filtered} wrong type, ${facetTally.noText} no text, ${facetTally.duplicate} duplicate`,
    );
  }
  if (failures.length) {
    console.log(`\n${failures.length} not stored — re-submit to retry:`);
    for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
  }
  await db.closeConnection();
}

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.find((r) => !r.startsWith("--"));

if (cmd === "submit") await submit(rest);
else if (cmd === "status" && arg) await status(arg);
else if (cmd === "collect" && arg) await collect(arg, rest);
else {
  console.error(
    "usage: jesus:generate:batch submit [--types=] [--limit=] [--overwrite]\n" +
      "       jesus:generate:batch status  <batch_id>\n" +
      "       jesus:generate:batch collect <batch_id>",
  );
  process.exit(1);
}
