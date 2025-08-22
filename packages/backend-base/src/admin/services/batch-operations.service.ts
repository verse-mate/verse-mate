import * as fs from "node:fs";
import * as path from "node:path";
import type { Queue } from "bullmq";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { BATCH_MONITORING_QUEUE } from "../../queue/batch-monitoring.queue";
import type { db } from "../../shared/shared.plugin";

interface BatchJobRequest {
  custom_id: string;
  method: "POST";
  url: "/v1/responses";
  body: {
    model: string;
    reasoning: { effort: "low" | "medium" | "high" };
    instructions?: string;
    input: string;
    max_output_tokens: number;
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

async function calculateActualCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): Promise<number> {
  let inputCostPerMillion = 0;
  let outputCostPerMillion = 0;

  switch (model) {
    case "gpt-5":
    case "gpt-5-chat-latest":
      inputCostPerMillion = 1.25;
      outputCostPerMillion = 10;
      break;
    case "gpt-5-mini":
      inputCostPerMillion = 0.25;
      outputCostPerMillion = 2;
      break;
    case "gpt-5-nano":
      inputCostPerMillion = 0.05;
      outputCostPerMillion = 0.4;
      break;
    default:
      inputCostPerMillion = 1.25;
      outputCostPerMillion = 10;
      break;
  }

  const inputCost = (promptTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (completionTokens / 1_000_000) * outputCostPerMillion;

  const totalCost = inputCost + outputCost;
  const batchDiscount = 0.5;

  return totalCost * batchDiscount;
}

const getExplanationTypePrompt = async (
  type: ExplanationTypeEnum,
  bookName: string,
  chapterNumber: number,
  dbInstance: any,
  language: string,
): Promise<{ prompt: string }> => {
  try {
    const userPromptRepo = new UserPromptRepository(dbInstance);
    const promptTemplate = await userPromptRepo.getActivePromptByType(type);

    if (promptTemplate && (promptTemplate as any).prompt_template) {
      return {
        prompt: (promptTemplate as any).prompt_template
          .replace("{bookName}", bookName)
          .replace("{chapterNumber}", chapterNumber.toString()),
      };
    }
  } catch (error) {
    console.warn(
      "Failed to fetch prompt from database, using fallback:",
      error,
    );
  }

  switch (type) {
    case "summary":
      return {
        prompt: `# Summary (start with title: "# Summary of ${bookName} ${chapterNumber}")

**Request Overview:** Provide a high-level summary
explanation of all of ${bookName} ${chapterNumber} in 300 words or so. Focus on clarity and
depth to help readers understand their significance and message. Be sure
to output in full sentences. Output without any commentary or questions
before or after the response. Only include the book name and number in
the title. 
**Instructions:** 
1. **Passage Summary and Analysis:**
**Summary:** Provide an overall summary in
approximately 300 words. **Connection to Broader Themes:** Where
relevant, link the passage(s) to broader biblical themes or narratives.
2. **Formatting:** - Use Markdown for the response, with clear
headings for the passages, subheadings for major analysis points. - Aim
for readability and engagement, making the analysis informative for both
novice and experienced readers, title should be in font size 20. - **Accessibility:** Provide
easy-to- understand explanations suitable for readers with varying
levels of biblical knowledge. Clarify any theological terms or concepts
that might be unfamiliar. - **Thoroughness:** Ensure the examination
is thorough, covering the passage provided. Offer insights into the
meaning, context, and implications of the text. - **Relevance:**
Draw connections to broader themes in the Bible and suggest contemporary
applications where appropriate.

**Evaluation Criteria:**
- Does the summary accurately reflect the main points of the chapter?
- Is the summary approximately 300 words?
- Is the output in full sentences?
- Does the title follow the format "# Summary of ${bookName} ${chapterNumber}"?
- Does the response use the specified Markdown formatting?

**Use this template to format your response:**

# Summary of ${bookName} ${chapterNumber}


## Overview

Hebrews 3 contrasts Jesus Christ with Moses and issues a solemn warning against unbelief. The chapter emphasizes Jesus’ superiority in God’s redemptive plan, calls believers to steadfast faith, and warns against the dangers of hardened hearts, using Israel’s wilderness rebellion as a cautionary example.
Christ Greater than Moses (Hebrews 3:1–6)

The writer urges believers, described as “holy brethren, partakers of a heavenly calling” (v.1, NASB1995), to fix their attention on Jesus, who is both the Apostle (sent One) and High Priest of their confession. While Moses was faithful as a servant in God’s house, Christ is exalted as the Son who rules over the house. This comparison highlights Jesus’ unique status: Moses prefigured the covenant community, but Christ fulfills and surpasses it. The author stresses, “We are His house, if we hold fast our confidence” (v.6), underscoring perseverance as a mark of true belonging to Christ.
Warning Against Unbelief (Hebrews 3:7–19)

Quoting Psalm 95, the Holy Spirit’s warning is restated: “Today if you hear His voice, do not harden your hearts” (v.7–8). The Israelites’ rebellion in the wilderness is recalled—despite witnessing God’s works, they provoked Him, failed to trust His promises, and were excluded from entering His rest (vv. 9–11, 19). Their unbelief serves as a sobering example for Christians, showing that God’s promises demand faith and obedience.

The author admonishes believers to “encourage one another day after day… so that none of you will be hardened by the deceitfulness of sin” (v.13). The Christian life is communal, requiring mutual exhortation to remain faithful. Endurance in faith to the end reveals true participation in Christ (v.14).
Broader Themes

Hebrews 3 aligns with the biblical narrative of God’s covenant faithfulness and man’s frequent rebellion. The wilderness generation symbolizes unbelieving hearts, while Christ embodies the perfect Son leading His people into the greater “rest” of salvation (cf. Hebrews 4). This chapter contributes to the overarching theme of perseverance in faith, warning against apostasy, and elevating Christ as the ultimate High Priest who surpasses all previous mediators.`,
      };
    case "byline":
      return {
        prompt: `# Verse-by-Verse Analysis (start with title "# Line-by-Line Analysis of ${bookName} ${chapterNumber}")

**Request Overview:**
- Provide a line-by-line explanation of all
of ${bookName} ${chapterNumber} without stopping until the full chapter is explained even if it's very long, in a single message. Ensure you do each line and do not group
for flow - even if the passage has many lines. Focus on clarity and
depth to help readers understand their significance and message.
- Be sure to output in full sentences - even within the bullets. Output without
any commentary or questions before or after the response.

**Instructions:**

1. **Introduction:**    Begin with the verse

2. **Passage Summary and Analysis:**

**Summary:** Provide and overall summary of the verse in at least
2-3 sentences.

**Analysis:** Provide an analysis of the verse focusing on key
themes, insights, and theological implications. Organize major points
using subheadings, and emphasize critical details. Include relevant
definitions as appropriate. Be sure that each analysis can standalone.
Limit to 2-3 bullets max.

3. **Formatting:** 
- Use Markdown for the response, with clear
headings for the passages, subheadings for major analysis points, and
bullet points for key insights. 
- Aim for readability and engagement,
making the analysis informative for both novice and experienced
readers. 
- **Accessibility:** 
- Provide easy-to- understand
explanations suitable for readers with varying levels of biblical
knowledge. Clarify any theological terms or concepts that might be
unfamiliar. 
- **Thoroughness:** 
- Ensure the examination is
thorough, covering the passage provided. Offer insights into the
meaning, context, and implications of the text.

**Evaluation Criteria:**
- Is every single verse of the chapter explained?
- Is the explanation for each verse a line-by-line analysis?
- Is grouping of verses for flow avoided?
- Is the summary for each verse at least 2-3 sentences?
- Does the analysis for each verse have a maximum of 2-3 bullet points?
- Does the title follow the format "# Line-by-Line Analysis of ${bookName} ${chapterNumber}"?
- Does the summary and analysis follow the format "### Summary" and "### Analysis"?
- Are all the markdown templates followed?

**Use this template to format your response:**

# Line-by-Line Analysis of ${bookName} ${chapterNumber}


## Hebrews 1:1

"God, after He spoke long ago to the fathers in the prophets in many
portions and in many ways," ({bible_version})

### Summary

This verse declares that God is the initiator of revelation. He spoke in
the past to Israel's ancestors through the prophets. The revelation came
in many parts and various forms, indicating progressive disclosure over
time.


### Analysis

**Progressive revelation:**
- The Greek adverbs *polumerōs* ("in many
parts") and *polutropōs* ("in many ways") denote truth given across
eras, genres, and messengers, preparing for a climactic word.

**Covenantal continuity:**
-"To the fathers" anchors Christian faith within Israel's history, not apart from it.`,
      };
    case "detailed":
      return {
        prompt: `# In-Depth Analysis (start with title "# In-Depth Analysis of ${bookName} ${chapterNumber}")

**Request Overview:** Provide an in-depth yet accessible
explanation of all of ${bookName} ${chapterNumber} 500-600 words per section. Focus on
clarity and depth to help readers understand their significance and
message. Do not include the verses in the output before the
introduction. Be sure to output in full sentences - even within the
bullets. Output without any commentary or questions before or after the
response.

**Instructions:** 

1. **Introduction:**  Begin with a brief introduction that
contextualizes the passage within the Bible, highlighting its place in
the broader narrative and any relevant background information.

2. **Passage Analysis:** 

**Analysis:** Provide a detailed examination focusing on key themes,
insights, and theological implications. Organize major points using
subheadings, and emphasize critical details. Be sure that each analysis
can standalone.  - **Connection to Broader Themes:** Where
relevant, link the passage(s) to broader biblical themes or narratives.

3. **Overall Significance:**     Conclude with a discussion on the
overall significance of the passage. Address how it contributes to the
overarching narrative of the Bible and its relevance to contemporary
readers.

4. **Formatting:**   - Use Markdown for the response, with clear
headings for the passages, subheadings for major analysis points, and
bullet points for key insights, title should be in size 20. - Ensure the explanation is
comprehensive, typically spanning at least 500-600 words, but allow for
flexibility depending on the complexity and length of the passage. -
Aim for readability and engagement, making the analysis informative for
both novice and experienced readers. Include bullets as appropriate. -
**Accessibility:** Provide easy-to- understand explanations suitable
for readers with varying levels of biblical knowledge. Clarify any
theological terms or concepts that might be unfamiliar. Include any
definitions as appropriate.     - **Thoroughness:** Ensure the
examination is thorough, covering the passage provided. Offer insights
into the meaning, context, and implications of the text.     -
**Relevance:** Draw connections to broader themes in the Bible and
suggest contemporary applications where appropriate. Include
interpretation and application questions.

**Evaluation Criteria:**
- Is there an introduction that contextualizes the passage?
- Is there a discussion of the overall significance?
- Are there interpretation and application questions?
- Does the title follow the format "# In-Depth Analysis of ${bookName} ${chapterNumber}"?
- Are all the markdown templates followed?
- Are verses not included in the output before the introduction?

**Use this template to format your response:**

# In-Depth Analysis of ${bookName} ${chapterNumber}


## Introduction

Hebrews 1 opens one of the most profound Christological arguments in the
New Testament. The letter to the Hebrews, though anonymous, was written
to a community of Jewish Christians who were tempted to drift back into
Judaism due to pressure, persecution, or discouragement. The author
begins by emphasizing the absolute supremacy of Jesus Christ over all
former revelations, particularly over the prophets and the angels, who
were highly regarded in Jewish thought as mediators of the Law. The
chapter sets the tone for the entire letter by proclaiming that the
final and fullest revelation of God has come in the Son, who is superior
to all others in His person, His work, and His eternal reign. Hebrews 1
is not merely a doctrinal statement but a pastoral call to recognize
Jesus as the center of God's plan and to remain faithful to Him.

## Passage Analysis

### God's Final Revelation in the Son (Hebrews 1:1--4)

The opening contrasts God's past revelations through the prophets with
His definitive revelation in Jesus Christ. While the prophets spoke "at
many times and in many ways," the Son is the climax and completion of
God's self-disclosure.

- The Son is described as the heir of all things, the agent of creation,
the radiance of God's glory, and the exact representation of His
being. These titles emphasize His divinity, His authority, and His
intimate relationship with the Father.

- Jesus upholds the universe by His powerful word, revealing His ongoing
role in sustaining creation. This echoes themes from John 1 and
Colossians 1, where Christ is portrayed as both Creator and Sustainer.

- His work of purifying sins highlights His redemptive mission, and His
seated position at the right hand of God signifies completed work,
divine authority, and exaltation.

This introduction establishes Jesus not only as a prophet but as the
very embodiment of God's nature, surpassing all others in role and
essence.

### The Superiority of the Son Over Angels (Hebrews 1:5--14)

The author turns to a series of Old Testament quotations to demonstrate
that Jesus is superior to angels. Angels were revered in Jewish
tradition as messengers of God and associated with the giving of the Law
at Sinai. By drawing from Psalms, 2 Samuel, and Deuteronomy, the author
contrasts the temporary, servant role of angels with the eternal
kingship of the Son.

- Jesus is uniquely called the "Son" by God, a title never given to
angels. This establishes His eternal relationship with the Father.

- Angels are commanded to worship the Son, showing His superiority in
rank and nature. Worship is reserved for God alone, and thus the Son
shares in God's divinity.

- The Son is addressed as God, with a throne that lasts forever,
emphasizing His eternal kingship and justice. The imagery of anointing
with the oil of gladness portrays His joy-filled reign, in contrast to
the transient roles of angels.

- The Son is the unchanging Creator who laid the foundations of the
earth. While creation itself will wear out like a garment, He remains
the same, underscoring His eternal immutability.

- Angels, by contrast, are described as ministering spirits sent to
serve those who will inherit salvation. Their greatness lies in their
service, but they do not compare with the Son's sovereignty.

Through these comparisons, the author underscores that the Son is not a
mere heavenly messenger but the eternal ruler who is both God and King.

### Overall Significance

Hebrews 1 firmly establishes the identity of Jesus Christ as the supreme
revelation of God, surpassing prophets, angels, and all other mediators.
The chapter affirms both His divinity and His humanity, showing Him as
Creator, Sustainer, Redeemer, and King. Theologically, it emphasizes the
incarnation as the culmination of God's communication with humanity and
presents Christ as the one who fulfills and transcends the Old Testament
promises.

For contemporary readers, Hebrews 1 is a call to recognize the unique
and unparalleled authority of Christ. It challenges believers not to
drift toward lesser sources of security or revelation but to anchor
themselves in Jesus, who is the same yesterday, today, and forever.

### Interpretation and Application Questions:

- How does understanding Jesus as the final revelation of God affect the
way we approach Scripture and faith today?

- In what ways do people today look to "angels" or other mediators
instead of relying fully on Christ?

- How does the assurance of Christ's supremacy provide encouragement in
times of uncertainty or persecution?

By presenting Jesus as greater than prophets and angels, Hebrews 1 calls
believers to revere Him as the center of God's plan of salvation and to
remain steadfast in faith, knowing that He reigns eternally and
unshakably.`,
      };
    default:
      throw new Error(`Unknown explanation type: ${type}`);
  }
};

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });
  return display.of(code) ?? display.of("en") ?? "English";
}

const getUserPrompt = ({
  explanationPrompt,
  language,
}: { explanationPrompt: string; language: string }) => {
  return `${explanationPrompt}

The response should be in ${language} using Markdown format only.`;
};

export class BatchOperationService {
  private promptRepository: PromptRepository;

  constructor(
    private readonly db: db,
    private readonly batchMonitoringQueue: Queue,
  ) {
    this.promptRepository = new PromptRepository(this.db);
  }

  async generateBookBatchByName(
    bookName: string,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
  ) {
    console.log(
      `[BATCH] Starting book batch for book "${bookName}", version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    // Look up book ID by name
    const book = await this.db
      .getOrCreateConnection()
      .selectFrom("books")
      .where("name", "=", bookName)
      .select(["book_id"])
      .executeTakeFirst();

    if (!book) {
      throw new Error(`Book "${bookName}" not found in database`);
    }

    console.log(
      `[BATCH] Found book "${bookName}" with book_id=${book.book_id}`,
    );

    // Call the existing method with the looked-up book_id
    return this.generateBookBatch(
      book.book_id,
      bibleVersion,
      explanationTypes,
      model,
      adminUserId,
      skipExisting,
      effort,
    );
  }

  async generateBookBatch(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
  ) {
    console.log(
      `[BATCH] Starting book batch for book ${bookId}, version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const { fileId, filePath, totalRequests } = await this.generateJSONLFile(
      bookId,
      bibleVersion,
      explanationTypes,
      model,
      skipExisting,
      effort,
    );

    // Add small delay before creating batch to ensure file is fully processed
    console.log(`[BATCH] Waiting before creating batch with file ${fileId}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const batch = await openai.batches.create({
      input_file_id: fileId,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    console.log(
      "[BATCH] Batch created successfully:",
      JSON.stringify(batch, null, 2),
    );

    // Log any initial errors
    if (batch.errors?.data && batch.errors.data.length > 0) {
      console.error(
        `[BATCH] Batch ${batch.id} created with errors:`,
        JSON.stringify(batch.errors, null, 2),
      );
    }

    await this.db
      .getOrCreateConnection()
      .insertInto("batch_jobs")
      .values({
        batch_type: "book",
        openai_batch_id: batch.id,
        status: "validating",
        book_id: bookId,
        bible_version: bibleVersion,
        model,
        explanation_types: explanationTypes,
        total_requests: totalRequests,
        completed_requests: 0,
        failed_requests: 0,
        input_file_path: filePath,
        created_by: adminUserId,
        created_at: new Date(),
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    return batch;
  }

  async generateBibleBatch(
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high" = "medium",
  ) {
    console.log(
      `[BATCH] Starting Bible batch for version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const connection = this.db.getOrCreateConnection();

    const books = await connection
      .selectFrom("books")
      .select(["book_id", "name"])
      .orderBy("book_id", "asc")
      .execute();

    if (!books || books.length === 0) {
      throw new Error("No books found in database");
    }

    console.log(`[BATCH] Processing ${books.length} books for Bible batch`);

    const batchResults = [];

    for (const book of books) {
      try {
        const bookBatch = await this.generateBookBatch(
          book.book_id,
          bibleVersion,
          explanationTypes,
          model,
          adminUserId,
          false,
          effort,
        );
        batchResults.push({ success: true, ...bookBatch });
      } catch (error) {
        console.error(`[BATCH] Error processing book ${book.name}:`, error);
        batchResults.push({
          success: false,
          bookId: book.book_id,
          bookName: book.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      message: `Bible batch creation started for ${books.length} books.`,
      results: batchResults,
    };
  }

  async getBatchStatus(batchId: string) {
    console.log(`[BATCH] Getting batch status for: ${batchId}`);
    const batchStatus = await openai.batches.retrieve(batchId);
    console.log(
      `[BATCH] Status response for ${batchId}:`,
      JSON.stringify(batchStatus, null, 2),
    );

    // Log any validation issues
    if (batchStatus.status === "validating") {
      const timeSinceCreation = Date.now() - batchStatus.created_at * 1000;
      console.log(
        `[BATCH] Batch has been validating for ${Math.round(timeSinceCreation / 60000)} minutes`,
      );
    }

    if (batchStatus.status === "failed" && batchStatus.errors) {
      console.error(
        `[BATCH] Batch ${batchId} failed with errors:`,
        JSON.stringify(batchStatus.errors, null, 2),
      );
      // Clean up JSONL file for failed batches
      await this.cleanupBatchFiles(batchId);
    }

    // Clean up JSONL files for expired or cancelled batches
    if (
      batchStatus.status === "expired" ||
      batchStatus.status === "cancelled"
    ) {
      await this.cleanupBatchFiles(batchId);
    }

    // If batch completed but has failed requests, download error file
    if (
      batchStatus.status === "completed" &&
      batchStatus.request_counts &&
      batchStatus.request_counts.failed > 0 &&
      batchStatus.error_file_id
    ) {
      console.error(
        `[BATCH] Batch ${batchId} completed with ${batchStatus.request_counts.failed} failed requests. Downloading error file...`,
      );
      try {
        const errorFileContent = await openai.files.content(
          batchStatus.error_file_id,
        );
        const errorText = await errorFileContent.text();
        console.error(`[BATCH] Error file content for ${batchId}:`);
        console.error(errorText);
      } catch (error) {
        console.error(
          `[BATCH] Could not download error file ${batchStatus.error_file_id}:`,
          error,
        );
      }
    }

    // Get current batch job info from database
    const currentBatchJob = await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("openai_batch_id", "=", batchId)
      .select([
        "status",
        "completed_requests",
        "failed_requests",
        "explanations_processed",
      ])
      .executeTakeFirst();

    // Use OpenAI's batch status and request counts as the authoritative source of truth
    if (currentBatchJob && batchStatus.request_counts) {
      const { total, completed, failed } = batchStatus.request_counts;

      // Determine correct status based on OpenAI's batch status and request counts
      let correctStatus: string = batchStatus.status; // Use OpenAI's status as primary

      // Only override if batch is completed but has specific success/failure patterns
      if (batchStatus.status === "completed") {
        if (completed === 0 && failed > 0) {
          correctStatus = "failed";
        } else if (failed > 0) {
          correctStatus = "partial_failure";
        }
        // If completed > 0 and failed === 0, keep as "completed"
      }

      // Update if status or counts are different
      if (
        currentBatchJob.status !== correctStatus ||
        currentBatchJob.completed_requests !== completed ||
        currentBatchJob.failed_requests !== failed
      ) {
        console.log(
          `[BATCH] Updating batch ${batchId} status to ${correctStatus} (${completed} completed, ${failed} failed out of ${total} total)`,
        );

        await this.db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({
            status: correctStatus,
            completed_requests: completed,
            failed_requests: failed,
          })
          .where("openai_batch_id", "=", batchId)
          .execute();

        // Clean up JSONL file for permanently failed batches
        if (correctStatus === "failed") {
          await this.cleanupBatchFiles(batchId);
        }
      }

      // Process explanations for completed batches that need processing
      if (
        (correctStatus === "completed" ||
          correctStatus === "partial_failure") &&
        batchStatus.output_file_id
      ) {
        console.log(
          `[BATCH] Checking if batch ${batchId} needs explanation processing:`,
        );
        console.log(`  - Status: ${correctStatus}`);
        console.log(`  - OpenAI completed: ${completed}, failed: ${failed}`);
        console.log(
          `  - DB completed: ${currentBatchJob.completed_requests}, failed: ${currentBatchJob.failed_requests}`,
        );
        console.log(
          `  - Explanations processed flag: ${currentBatchJob.explanations_processed}`,
        );
        console.log(`  - Output file: ${batchStatus.output_file_id}`);

        // Simple logic: if batch is completed with successes and not marked as processed, process it
        const needsProcessing =
          (correctStatus === "completed" ||
            correctStatus === "partial_failure") &&
          completed > 0 &&
          !currentBatchJob.explanations_processed;

        console.log(`  - Needs processing: ${needsProcessing}`);

        if (needsProcessing) {
          console.log(
            `[BATCH] Processing explanations for batch ${batchId} (${completed} successful responses)`,
          );
          await this.processOutputFile(batchId, batchStatus.output_file_id);
        } else {
          console.log(
            `[BATCH] Batch ${batchId} explanations already processed, skipping`,
          );
        }
      } else {
        console.log(
          `[BATCH] Batch ${batchId} not ready for explanation processing: status=${correctStatus}, output_file=${batchStatus.output_file_id}`,
        );
      }
    }

    return batchStatus;
  }

  async cancelBatch(batchId: string) {
    console.log(`[BATCH] Cancelling batch: ${batchId}`);
    return openai.batches.cancel(batchId);
  }

  async getAllBatches(limit = 50, offset = 0, adminUserId?: string) {
    console.log(
      `[BATCH] Getting all batches with limit: ${limit}, offset: ${offset}, adminUserId: ${adminUserId}`,
    );

    let query = this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .leftJoin("books", "batch_jobs.book_id", "books.book_id")
      .selectAll("batch_jobs")
      .select("books.name as book_name")
      .orderBy("batch_jobs.created_at", "desc")
      .limit(limit)
      .offset(offset);

    if (adminUserId) {
      query = query.where("batch_jobs.created_by", "=", adminUserId);
    }

    return await query.execute();
  }

  private async generateJSONLFile(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
  ): Promise<{ filePath: string; fileId: string; totalRequests: number }> {
    const connection = this.db.getOrCreateConnection();

    const systemPrompt = await this.promptRepository.getActivePrompt();
    if (!systemPrompt) {
      throw new Error("No active system prompt found");
    }

    const version = await connection
      .selectFrom("bible_versions")
      .select(["id", "language_code"])
      .where("version_key", "=", bibleVersion)
      .executeTakeFirst();

    if (!version) {
      throw new Error("Invalid bible version");
    }

    const language = getLanguageName(version.language_code);

    const book = await connection
      .selectFrom("books")
      .where("book_id", "=", bookId)
      .select(["name"])
      .executeTakeFirst();

    if (!book) {
      throw new Error(`Book ${bookId} not found`);
    }

    console.log(
      `[BATCH] Database query result: bookId=${bookId}, book.name="${book.name}"`,
    );

    const chapters = await connection
      .selectFrom("chapters")
      .where("book_id", "=", bookId)
      .select(["chapter_id", "chapter_number"])
      .orderBy("chapter_number", "asc")
      .execute();

    if (!chapters || chapters.length === 0) {
      throw new Error(`No chapters found for book ${bookId}`);
    }

    const batchRequests: BatchJobRequest[] = [];

    let existingExplanations: Set<string> = new Set();
    if (skipExisting) {
      const existing = await connection
        .selectFrom("explanations")
        .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
        .where("chapters.book_id", "=", bookId)
        .where("explanations.version_id", "=", version.id)
        .where("explanations.type", "in", explanationTypes)
        .select(["chapters.chapter_number", "explanations.type"])
        .execute();

      existingExplanations = new Set(
        existing.map((e) => `${e.chapter_number}-${e.type}`),
      );

      console.log(
        `[BATCH] Found ${existingExplanations.size} existing explanations to skip`,
      );
    }

    for (const chapter of chapters) {
      for (const explanationType of explanationTypes) {
        const chapterTypeKey = `${chapter.chapter_number}-${explanationType}`;

        if (skipExisting && existingExplanations.has(chapterTypeKey)) {
          console.log(
            `[BATCH] Skipping existing explanation: ${book.name} ${chapter.chapter_number} ${explanationType}`,
          );
          continue;
        }

        const explanationConfig = await getExplanationTypePrompt(
          explanationType,
          book.name,
          chapter.chapter_number,
          this.db,
          language,
        );

        const userPrompt = getUserPrompt({
          explanationPrompt: explanationConfig.prompt,
          language,
        });

        // Sanitize content to prevent JSONL parsing issues
        const sanitizedSystemPrompt = systemPrompt.prompt
          .replace(/\r\n/g, "\n") // Convert Windows line endings
          .replace(/\r/g, "\n"); // Convert old Mac line endings

        const sanitizedUserPrompt = userPrompt
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

        batchRequests.push({
          custom_id: `${book.name
            .toLowerCase()
            .replace(
              /\s+/g,
              "-",
            )}-${chapter.chapter_number}-${explanationType}`,
          method: "POST",
          url: "/v1/responses",
          body: {
            model,
            reasoning: { effort },
            instructions: sanitizedSystemPrompt,
            input: sanitizedUserPrompt,
            max_output_tokens: 25000,
          },
        });
      }
    }

    // Check if we have any requests to process
    if (batchRequests.length === 0) {
      throw new Error(
        `No requests to process for ${book.name}. All explanations may already exist.`,
      );
    }

    const batchDir = path.join(process.cwd(), "batch_files");
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    const filename = `batch_${book.name
      .toLowerCase()
      .replace(/\s+/g, "-")}_${bibleVersion}_${Date.now()}.jsonl`;
    const filePath = path.join(batchDir, filename);

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    fs.writeFileSync(filePath, jsonlContent);

    console.log(
      `[BATCH] Generated JSONL file: ${filePath} with ${batchRequests.length} requests`,
    );

    // Log first request for debugging
    if (batchRequests.length > 0) {
      console.log(
        "[BATCH] Sample JSONL request:",
        JSON.stringify(batchRequests[0], null, 2),
      );

      // Check line length - this might be the issue!
      const firstLine = JSON.stringify(batchRequests[0]);
      console.log(`[BATCH] First line length: ${firstLine.length} characters`);
      if (firstLine.length > 10000) {
        console.warn(
          `[BATCH] WARNING: Line length (${firstLine.length}) may be too long for OpenAI batch processing!`,
        );
      }
    }

    // Validate JSONL format by parsing each line
    const lines = jsonlContent.split("\n");
    let validLines = 0;
    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]);
        validLines++;

        // Additional validation checks
        if (
          !parsed.custom_id ||
          !parsed.method ||
          !parsed.url ||
          !parsed.body
        ) {
          console.error(
            `[BATCH] Line ${i + 1} missing required fields:`,
            Object.keys(parsed),
          );
        }
        if (parsed.body && (!parsed.body.model || !parsed.body.input)) {
          console.error(
            `[BATCH] Line ${i + 1} body missing required fields:`,
            Object.keys(parsed.body),
          );
        }
      } catch (error) {
        console.error(
          `[BATCH] Invalid JSON at line ${i + 1}:`,
          `${lines[i].substring(0, 200)}...`,
        );
        console.error("[BATCH] Parse error:", error);
      }
    }
    console.log(
      `[BATCH] JSONL validation: ${validLines}/${lines.length} lines valid`,
    );

    // Log file size and content info
    const stats = fs.statSync(filePath);
    console.log(
      `[BATCH] File size: ${stats.size} bytes, ${lines.length} lines, avg line length: ${Math.round(jsonlContent.length / lines.length)} chars`,
    );

    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "batch",
    });

    console.log(
      `[BATCH] File uploaded successfully: ${file.id}, status: ${file.status}, bytes: ${file.bytes}`,
    );

    // Wait a moment and verify file is processed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const fileCheck = await openai.files.retrieve(file.id);
    console.log(
      `[BATCH] File verification: ${fileCheck.id}, status: ${fileCheck.status}, bytes: ${fileCheck.bytes}`,
    );

    if (fileCheck.status === "error") {
      throw new Error(
        `File upload failed with error status: ${JSON.stringify(fileCheck)}`,
      );
    }

    return { filePath, fileId: file.id, totalRequests: batchRequests.length };
  }

  private async cleanupBatchFiles(batchId: string): Promise<void> {
    try {
      // Get the batch job to find the input file path
      const batchJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select("input_file_path")
        .executeTakeFirst();

      if (
        batchJob?.input_file_path &&
        fs.existsSync(batchJob.input_file_path)
      ) {
        fs.unlinkSync(batchJob.input_file_path);
        console.log(
          `[BATCH] Cleaned up JSONL file: ${batchJob.input_file_path}`,
        );
      }
    } catch (error) {
      console.error(
        `[BATCH] Error cleaning up files for batch ${batchId}:`,
        error,
      );
    }
  }

  private async processOutputFile(batchId: string, outputFileId: string) {
    try {
      // Get batch job info
      const batchJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select(["bible_version", "book_id", "model"])
        .executeTakeFirst();

      if (!batchJob) {
        console.error(`[BATCH] Batch job not found for ${batchId}`);
        return;
      }

      // Get the actual version_id (UUID) for the bible version
      const version = await this.db
        .getOrCreateConnection()
        .selectFrom("bible_versions")
        .where("version_key", "=", batchJob.bible_version)
        .select("id")
        .executeTakeFirst();

      if (!version) {
        console.error(
          `[BATCH] Bible version not found: ${batchJob.bible_version}`,
        );
        return;
      }

      // Download and process output file
      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      let processedCount = 0;
      let errorCount = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for (const line of lines) {
        try {
          const parsedLine = JSON.parse(line);

          // Track token usage for cost calculation
          if (parsedLine.response?.body?.usage) {
            totalPromptTokens +=
              parsedLine.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              parsedLine.response.body.usage.output_tokens || 0;
          }

          // Check if the response is successful and has content
          const responseBody = parsedLine.response?.body;

          // Determine if response has content and extract it robustly
          const outputText: string | undefined = responseBody?.output_text;
          let extractedText: string | undefined = outputText;

          if (!extractedText && Array.isArray(responseBody?.output)) {
            // Find the first text segment across all items
            for (const item of responseBody.output) {
              const textCandidate = item?.content?.find?.(
                (c: any) => typeof c?.text === "string",
              )?.text;
              if (textCandidate) {
                extractedText = textCandidate;
                break;
              }
            }
          }

          if (
            parsedLine.custom_id &&
            parsedLine.response?.status_code === 200 &&
            typeof extractedText === "string" &&
            extractedText.length > 0
          ) {
            // Parse custom_id to extract chapter and explanation type
            const customIdParts = parsedLine.custom_id.split("-");
            const explanationType = customIdParts[customIdParts.length - 1];
            const chapterNumber = Number.parseInt(
              customIdParts[customIdParts.length - 2],
            );

            const explanationContent = extractedText;

            // Get chapter_id
            const chapter = await this.db
              .getOrCreateConnection()
              .selectFrom("chapters")
              .where("book_id", "=", batchJob.book_id)
              .where("chapter_number", "=", chapterNumber)
              .select("chapter_id")
              .executeTakeFirst();

            if (!chapter) {
              console.error(
                `[BATCH] Chapter not found: book ${batchJob.book_id}, chapter ${chapterNumber}`,
              );
              errorCount++;
              continue;
            }

            // Insert/update explanation
            await this.db
              .getOrCreateConnection()
              .insertInto("explanations")
              .values({
                type: explanationType as any,
                explanation: explanationContent,
                chapter_id: chapter.chapter_id,
                version_id: version.id,
              })
              .onConflict((oc) =>
                oc.columns(["chapter_id", "type", "version_id"]).doUpdateSet({
                  explanation: explanationContent,
                }),
              )
              .execute();

            processedCount++;
            console.log(`[BATCH] Saved explanation: ${parsedLine.custom_id}`);
          } else {
            // Log detailed reason for skipping
            const customId = parsedLine.custom_id || "UNKNOWN";
            const statusCode = parsedLine.response?.status_code || "NO_STATUS";
            const hasContent = !!(
              parsedLine.response?.body?.output_text ||
              (parsedLine.response?.body?.output &&
                parsedLine.response.body.output.length > 1 &&
                parsedLine.response.body.output[1]?.content &&
                parsedLine.response.body.output[1].content.length > 0 &&
                parsedLine.response.body.output[1].content[0]?.text)
            );
            const error = parsedLine.response?.body?.error || null;

            console.warn(
              `[BATCH] Skipping failed response for ${customId}: status=${statusCode}, hasContent=${hasContent}`,
            );

            if (error) {
              console.warn("[BATCH] Error details:", error);
            }

            if (parsedLine.response?.body && !hasContent) {
              console.warn(
                "[BATCH] Response body:",
                JSON.stringify(parsedLine.response.body, null, 2),
              );
            }

            errorCount++;
          }
        } catch (error) {
          errorCount++;
          console.error("[BATCH] Error processing explanation line:", error);
        }
      }

      // Calculate total cost
      const actualCost = await calculateActualCost(
        totalPromptTokens,
        totalCompletionTokens,
        batchJob.model,
      );

      console.log(
        `[BATCH] Processed output file for batch ${batchId}: ${processedCount} explanations saved, ${errorCount} errors`,
      );
      console.log(
        `[BATCH] Token usage: ${totalPromptTokens} prompt + ${totalCompletionTokens} completion = ${totalPromptTokens + totalCompletionTokens} total`,
      );
      console.log(`[BATCH] Calculated cost: $${actualCost.toFixed(4)}`);

      // Mark batch as having explanations processed and update cost
      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({
          explanations_processed: true,
          actual_cost: actualCost,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        })
        .where("openai_batch_id", "=", batchId)
        .execute();

      console.log(
        `[BATCH] Marked batch ${batchId} as explanations processed with cost $${actualCost.toFixed(4)}`,
      );

      // Clean up JSONL file after successful processing
      await this.cleanupBatchFiles(batchId);
    } catch (error) {
      console.error(
        `[BATCH] Error processing output file for batch ${batchId}:`,
        error,
      );
    }
  }
}
