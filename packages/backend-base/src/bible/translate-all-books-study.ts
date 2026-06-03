/**
 * Translate the study for EVERY book into one target language. Creates a
 * per-book batch up front (skipExisting=true → fully-translated books are
 * skipped, partial books only fill the gaps), then polls all batches from this
 * single process and writes each back as it completes — so OpenAI processes
 * them in parallel (fast wall-clock) while the Pi runs just one light process.
 * The term dictionary is applied on writeback (processStudyTranslateOutputFile).
 *
 * Run from packages/backend-base with POSTGRES_URL + OPEN_AI_KEY + REDIS_URL
 * and a local redis up:
 *   E2E_USER_ID=... E2E_MODEL=gpt-5.4-nano-2026-03-17 E2E_EFFORT=high \
 *   TARGET_LANG=ro-RO bun run src/bible/translate-all-books-study.ts
 *
 * Optional: EXCLUDE_BOOKS="James,Genesis,Exodus" (skip entirely),
 *           MAX_HOURS=6 (overall poll ceiling).
 */
import { db } from "database";
import { sql } from "kysely";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { getAiProvider } from "../shared/ai";

const MODEL = process.env.E2E_MODEL || "gpt-5.4-nano-2026-03-17";
const EFFORT = (process.env.E2E_EFFORT as "low" | "medium" | "high") || "high";
const TARGET_LANG = process.env.TARGET_LANG || "ro-RO";
const ADMIN_USER_ID = process.env.E2E_USER_ID as string;
const EXCLUDE = (process.env.EXCLUDE_BOOKS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const POLL_INTERVAL_MS = 30_000;
const MAX_TOTAL_MS = (Number(process.env.MAX_HOURS) || 6) * 3_600_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!ADMIN_USER_ID) throw new Error("E2E_USER_ID env required");
  const conn = db.getOrCreateConnection();
  const ai = getAiProvider();
  const service = new BatchOperationService(
    db,
    batchMonitoringQueue,
    batchProcessingQueue,
  );

  console.log(
    `=== Translate ALL books → ${TARGET_LANG} | ${MODEL} @ ${EFFORT}${EXCLUDE.length ? ` | excluding ${EXCLUDE.join(",")}` : ""} ===\n`,
  );

  const bookRows = await conn
    .selectFrom("studies")
    .select(sql<string>`content->>'bookName'`.as("b"))
    .distinct()
    .orderBy(sql`content->>'bookName'`)
    .execute();
  const books = bookRows.map((r) => r.b).filter((b): b is string => !!b);

  // Create one batch per book (skipExisting → done books return null).
  const pending: { book: string; batchId: string }[] = [];
  for (const book of books) {
    if (EXCLUDE.includes(book)) {
      console.log(`  skip ${book} (excluded)`);
      continue;
    }
    try {
      const res = await service.generateStudyTranslateBatch(
        MODEL,
        ADMIN_USER_ID,
        "book",
        TARGET_LANG,
        true, // skipExisting
        EFFORT,
        book,
      );
      const id = (res as { batchId?: string }).batchId;
      if (id) {
        pending.push({ book, batchId: id });
        console.log(`  created ${book} -> ${id}`);
      } else {
        console.log(`  skip ${book} (nothing pending)`);
      }
    } catch (e) {
      console.error(`  create FAILED ${book}:`, e);
    }
  }
  console.log(`\n${pending.length} batches created. Polling every 30s…\n`);

  const start = Date.now();
  const done = new Set<string>();
  const result: Record<string, string> = {};
  while (done.size < pending.length && Date.now() - start < MAX_TOTAL_MS) {
    for (const p of pending) {
      if (done.has(p.batchId)) continue;
      let r: { status?: string; outputFileId?: string };
      try {
        r = await ai.batchesRetrieve(p.batchId);
      } catch {
        continue;
      }
      if (r.status === "completed" && r.outputFileId) {
        try {
          await service.processStudyTranslateOutputFile(
            p.batchId,
            r.outputFileId,
            {
              model: MODEL,
            },
          );
          result[p.book] = "ok";
        } catch (e) {
          console.error(`  writeback FAILED ${p.book}:`, e);
          result[p.book] = "writeback-failed";
        }
        done.add(p.batchId);
        console.log(
          `  ✓ ${p.book} (${done.size}/${pending.length}) @ ${Math.round((Date.now() - start) / 1000)}s`,
        );
      } else if (["failed", "cancelled", "expired"].includes(r.status ?? "")) {
        result[p.book] = r.status ?? "failed";
        done.add(p.batchId);
        console.log(`  ✗ ${p.book} ${r.status}`);
      }
    }
    if (done.size < pending.length) await sleep(POLL_INTERVAL_MS);
  }

  const incomplete = pending.filter((p) => !done.has(p.batchId));
  console.log(
    `\n=== Done: ${done.size}/${pending.length} batches written; ${incomplete.length} still pending after ${Math.round((Date.now() - start) / 60000)}m ===`,
  );
  for (const [book, st] of Object.entries(result)) {
    if (st !== "ok") console.log(`  ${book}: ${st}`);
  }
  if (incomplete.length) {
    console.log("  still pending:", incomplete.map((p) => p.book).join(", "));
  }
  await db.closeConnection();
}

// Force exit: the BullMQ queues hold open ioredis connections that keep the
// event loop alive, so the process would otherwise hang after the work is
// done (no completion signal). process.exit(0) on success / 1 on failure.
main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("FAILED:", e);
    await db.closeConnection();
    process.exit(1);
  });
