/**
 * VER-120 startup remediation — regenerates existing byline explanations
 * whose per-verse ### Summary sections fall below the 3-sentence quality bar.
 *
 * Called once on backend startup (fire-and-forget). Idempotent: if the audit
 * finds no short summaries the function exits immediately without calling AI.
 */

import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { BibleRepository } from "../bible/repository/bible.repository";
import { PromptRepository } from "../bible/repository/prompt.repository";
import { getAiProvider } from "../shared/ai";
import {
  MIN_SUMMARY_SENTENCES,
  generateChunkedBylineParallel,
  shouldUseBylineChunking,
  toBylineVerses,
  validateSummaryLengths,
} from "../shared/byline-chunking";
import { getExplanationTypePrompt } from "../shared/prompt-utils";
import { auditByLineSummaries } from "./audit-byline-summaries";

const LOG = "[VER-120-REMEDIATION]";

export async function remediateVer120ShortSummaries(): Promise<void> {
  const connection = db.getOrCreateConnection();
  const ai = getAiProvider();
  const promptRepo = new PromptRepository(db);
  const bibleRepo = new BibleRepository(db);

  const findings = await auditByLineSummaries();
  if (findings.length === 0) {
    console.log(`${LOG} No short summaries found — nothing to remediate.`);
    return;
  }

  console.log(
    `${LOG} Found ${findings.length} chapter(s) with short summaries. Starting remediation...`,
  );

  const systemPrompt = await promptRepo.getActivePrompt();
  if (!systemPrompt) {
    console.error(`${LOG} No active system prompt found — aborting.`);
    return;
  }

  let fixed = 0;
  let failed = 0;

  for (const finding of findings) {
    try {
      const book = await connection
        .selectFrom("books")
        .innerJoin("chapters", "chapters.book_id", "books.book_id")
        .where("chapters.chapter_id", "=", finding.chapter_id)
        .select(["books.book_id", "books.name"])
        .executeTakeFirst();

      if (!book) {
        console.warn(
          `${LOG} Could not find book for chapter_id=${finding.chapter_id}, skipping.`,
        );
        failed++;
        continue;
      }

      // Use the primary version for this language (first match).
      const version = await connection
        .selectFrom("bible_versions")
        .where("language_code", "=", finding.language_code)
        .select(["id", "version_key"])
        .executeTakeFirst();

      if (!version) {
        console.warn(
          `${LOG} No bible version for language=${finding.language_code}, skipping ${book.name} ${finding.chapter_number}.`,
        );
        failed++;
        continue;
      }

      const language =
        new Intl.DisplayNames(["en"], { type: "language" }).of(
          finding.language_code,
        ) ?? "English";

      const explanationConfig = await getExplanationTypePrompt(
        ExplanationTypeEnum.byline,
        book.name,
        finding.chapter_number,
        db,
        language,
      );

      const verses = await connection
        .selectFrom("verses")
        .where("chapter_id", "=", finding.chapter_id)
        .where("version_id", "=", version.id)
        .select(["verse_number", "text"])
        .orderBy("verse_number", "asc")
        .execute();

      const verseRows = toBylineVerses(verses);
      const useChunking = shouldUseBylineChunking("byline", verseRows.length);

      console.log(
        `${LOG} Regenerating ${book.name} ${finding.chapter_number} [${finding.language_code}]...`,
      );

      let newContent: string;

      if (useChunking && verseRows.length > 0) {
        newContent = await generateChunkedBylineParallel({
          verses: verseRows,
          bookName: book.name,
          chapterNumber: finding.chapter_number,
          bylineTemplate: explanationConfig.prompt,
          logPrefix: `${LOG}_CHUNKED`,
          generateChunk: async ({ prompt }) => {
            const result = await ai.responsesCreate({
              model: "gpt-5-mini",
              instructions: systemPrompt.prompt,
              input: prompt,
              reasoningEffort: "medium",
              maxOutputTokens: 20000,
            });
            return result.outputText;
          },
        });
      } else {
        const versesText = verses
          .map((v) => `${v.verse_number}. ${v.text}`)
          .join("\n");

        const userPrompt = `${explanationConfig.prompt}\n\nBiblical Text (${book.name} ${finding.chapter_number}):\n${versesText}\n\nThe response should be in ${language} using Markdown format only.`;

        // Retry once if the first attempt still has short summaries.
        let attempt = 0;
        let promptForAttempt = userPrompt;
        newContent = "";

        while (attempt <= 1) {
          if (attempt === 1) {
            promptForAttempt = `${userPrompt}\n\n- Previous attempt produced one or more verses whose "### Summary" was shorter than ${MIN_SUMMARY_SENTENCES} sentences. Each per-verse "### Summary" MUST contain at least ${MIN_SUMMARY_SENTENCES} complete sentences of prose.`;
          }
          const result = await ai.responsesCreate({
            model: "gpt-5-mini",
            instructions: systemPrompt.prompt,
            input: promptForAttempt,
            reasoningEffort: "medium",
            maxOutputTokens: 20000,
          });
          newContent = result.outputText;
          const validation = validateSummaryLengths(newContent);
          if (validation.valid) break;
          attempt++;
        }
      }

      if (!newContent) {
        console.error(
          `${LOG} Empty content generated for ${book.name} ${finding.chapter_number}, skipping.`,
        );
        failed++;
        continue;
      }

      await bibleRepo.saveExplanation({
        type: ExplanationTypeEnum.byline,
        explanation: newContent,
        chapter_id: finding.chapter_id,
        language_code: finding.language_code,
      });

      console.log(
        `${LOG} ✅ Remediated ${book.name} ${finding.chapter_number} [${finding.language_code}]`,
      );
      fixed++;
    } catch (err) {
      console.error(
        `${LOG} ❌ Failed to remediate chapter_id=${finding.chapter_id}:`,
        err,
      );
      failed++;
    }
  }

  console.log(
    `${LOG} Done. Fixed: ${fixed}, Failed: ${failed} / ${findings.length} total.`,
  );
}
