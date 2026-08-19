/**
 * Reprocess an OpenAI translate batch's output file using the NEW
 * chunked-aware parsing logic. Useful when the running backend had
 * stale code the first time.
 *
 * Usage: bun run src/bible/reprocess-translate-batch.ts <openai_batch_id>
 */

import { db } from "database";
import OpenAI from "openai";
import { stitchBylineChunks } from "../shared/byline-chunking";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

async function main() {
  const batchId = process.argv[2];
  if (!batchId) throw new Error("Usage: <openai_batch_id>");

  console.log(`=== Reprocessing ${batchId} ===\n`);

  const batch = await openai.batches.retrieve(batchId);
  if (batch.status !== "completed") throw new Error("Batch not completed");
  const outputFileId = batch.output_file_id;
  if (!outputFileId) throw new Error("No output file");

  const fileContent = await openai.files.content(outputFileId);
  const jsonl = await fileContent.text();
  const lines = jsonl.split("\n").filter((l) => l.trim());
  console.log(`Parsing ${lines.length} lines...\n`);

  const connection = db.getOrCreateConnection();

  // Same data structure & logic as processTranslateOutputFile
  const chunkCollector = new Map<
    string,
    {
      bookName: string;
      chapterNumberStr: string;
      explanationType: string;
      bibleVersion: string;
      totalChunks: number;
      chunks: Array<{ chunkIndex: number; text: string }>;
    }
  >();

  let nonChunkedProcessed = 0;

  for (const line of lines) {
    const parsed = JSON.parse(line);
    const responseBody = parsed.response?.body;
    let text: string | undefined;
    if (Array.isArray(responseBody?.output)) {
      for (const item of responseBody.output) {
        const t = item?.content?.find?.(
          (c: any) => typeof c?.text === "string",
        )?.text;
        if (t) {
          text = t;
          break;
        }
      }
    }
    if (!text) text = responseBody?.output_text;

    if (
      parsed.custom_id?.startsWith("translate|") &&
      parsed.response?.status_code === 200 &&
      typeof text === "string" &&
      text.length > 0
    ) {
      const parts = parsed.custom_id.split("|");

      if (parts.length === 10 && parts[6] === "chunk") {
        const [
          ,
          bookName,
          chapterNumberStr,
          explanationType,
          bibleVersion,
          expId,
          ,
          idxStr,
          ,
          totalStr,
        ] = parts;
        const chunkIndex = Number.parseInt(idxStr, 10);
        const totalChunks = Number.parseInt(totalStr, 10);
        const key = `${bookName}|${chapterNumberStr}|${explanationType}|${bibleVersion}|${expId}`;
        let entry = chunkCollector.get(key);
        if (!entry) {
          entry = {
            bookName,
            chapterNumberStr,
            explanationType,
            bibleVersion,
            totalChunks,
            chunks: [],
          };
          chunkCollector.set(key, entry);
        }
        entry.chunks.push({ chunkIndex, text });
        console.log(
          `  Collected chunk ${chunkIndex + 1}/${totalChunks} for ${bookName} ${chapterNumberStr} ${explanationType} (${bibleVersion}): ${text.length} chars`,
        );
      } else {
        nonChunkedProcessed++;
      }
    }
  }

  console.log(
    `\nFound ${chunkCollector.size} chunked translation(s), ${nonChunkedProcessed} non-chunked.\n`,
  );

  for (const [_key, collected] of chunkCollector) {
    if (collected.chunks.length < collected.totalChunks) {
      console.warn(
        `  Incomplete: ${collected.chunks.length}/${collected.totalChunks}`,
      );
      continue;
    }

    const stitchedText = stitchBylineChunks(collected.chunks);
    const chapterNumber = Number(collected.chapterNumberStr);

    const book = await connection
      .selectFrom("books")
      .where("name", "=", collected.bookName)
      .select("book_id")
      .executeTakeFirst();
    if (!book) {
      console.error(`Book not found: ${collected.bookName}`);
      continue;
    }

    const chapter = await connection
      .selectFrom("chapters")
      .where("book_id", "=", book.book_id)
      .where("chapter_number", "=", chapterNumber)
      .select("chapter_id")
      .executeTakeFirst();
    if (!chapter) {
      console.error(
        `Chapter not found: ${collected.bookName} ${chapterNumber}`,
      );
      continue;
    }

    const existing = await connection
      .selectFrom("explanations")
      .where("chapter_id", "=", chapter.chapter_id)
      .where("type", "=", collected.explanationType as any)
      .where("language_code", "=", collected.bibleVersion)
      .orderBy("version", "desc")
      .selectAll()
      .executeTakeFirst();

    const nextVersion = existing ? existing.version + 1 : 1;

    await connection.transaction().execute(async (trx) => {
      await trx
        .updateTable("explanations")
        .set({ is_active: false })
        .where("chapter_id", "=", chapter.chapter_id)
        .where("type", "=", collected.explanationType as any)
        .where("language_code", "=", collected.bibleVersion)
        .execute();

      await trx
        .insertInto("explanations")
        .values({
          type: collected.explanationType as any,
          explanation: stitchedText,
          chapter_id: chapter.chapter_id,
          language_code: collected.bibleVersion,
          version: nextVersion,
          is_active: true,
          created_by_admin: false,
          parent_explanation_id: existing?.explanation_id ?? null,
          created_at: new Date(),
        })
        .execute();
    });

    console.log(
      `\nSaved stitched ${collected.explanationType} for ${collected.bookName} ${chapterNumber} ${collected.bibleVersion}: ${collected.chunks.length} chunks → ${stitchedText.length} chars, version ${nextVersion}`,
    );
  }

  db.closeConnection();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  db.closeConnection();
  process.exit(1);
});
