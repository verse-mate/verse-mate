import type { Queue } from "bullmq";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import OpenAI, { APIError } from "openai";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { ValidationError } from "../../common/errors";
import { BATCH_MONITORING_QUEUE } from "../../queue/batch-monitoring.queue";
import { getExplanationTypePrompt } from "../../shared/prompt-utils";
import type { db } from "../../shared/shared.plugin";
import { generateTopicSlug } from "../../topics/utils/slug.utils";

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

export const DEFAULT_MAX_OUTPUT_TOKENS = 50000;

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

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });
  return display.of(code) ?? display.of("en") ?? "English";
}

const getUserPrompt = ({
  explanationPrompt,
  language,
}: { explanationPrompt: string; language: string }) => {
  return `${explanationPrompt}\n\nThe response should be in ${language} using Markdown format only.`;
};

export class BatchOperationService {
  private promptRepository: PromptRepository;

  constructor(
    private readonly db: db,
    private readonly batchMonitoringQueue: Queue,
    private readonly batchProcessingQueue: Queue,
  ) {
    this.promptRepository = new PromptRepository(this.db);
  }

  async generateTopicDiscoveryBatch(
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high" = "medium",
    category?: string,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    const prompt =
      await this.promptRepository.getUserPromptByType("topic-discovery");
    if (!prompt) {
      throw new Error("No active topic-discovery prompt found.");
    }

    const discoveryTopicType = category || "all";

    const batchRequests: BatchJobRequest[] = [
      {
        custom_id: `topic-discovery-${discoveryTopicType}-${Date.now()}`,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          reasoning: { effort },
          instructions: "",
          input: prompt.prompt_template,
          max_output_tokens: maxOutputTokens,
        },
      },
    ];

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    // Check if the content exceeds OpenAI's file size limit (100MB)
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      // 100MB limit
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit. Please reduce the number of requests in this batch.`,
      );
    }

    // Create a proper File object for OpenAI API
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `topic_discovery_${discoveryTopicType}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await this.db
      .getOrCreateConnection()
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-discovery",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: 1,
        created_by: adminUserId,
        bible_version: "N/A",
        explanation_types: [],
        topic_category: discoveryTopicType,
        max_output_tokens: maxOutputTokens,
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    return [batch];
  }

  async generateTopicReferencesBatch(
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high" = "medium",
    category?: string,
    topicId?: string,
    skipExisting = false,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    // Modify the query to filter by category if provided
    let query = this.db
      .getOrCreateConnection()
      .selectFrom("topics")
      .select("topics.topic_id")
      .select("topics.name")
      .select("topics.description");

    // Filter by category if provided
    if (category) {
      query = query.where("topics.category", "=", category);
    }

    // Filter by specific topic if provided
    if (topicId) {
      query = query.where("topics.topic_id", "=", topicId);
    }

    if (skipExisting) {
      query = query
        .leftJoin(
          "topic_references",
          "topics.topic_id",
          "topic_references.topic_id",
        )
        .where("topic_references.reference_id", "is", null);
    }

    const topics = await query.execute();

    if (topics.length === 0) {
      throw new Error("No topics found that need references.");
    }

    const prompt =
      await this.promptRepository.getUserPromptByType("topic-references");
    if (!prompt) {
      throw new Error("No active topic-references prompt found.");
    }

    const batchRequests: BatchJobRequest[] = topics.map((topic) => ({
      custom_id: `topic-references-${topic.topic_id}-${Date.now()}`,
      method: "POST",
      url: "/v1/responses",
      body: {
        model,
        reasoning: { effort },
        instructions: "",
        input: prompt.prompt_template
          .replace("{topic_name}", topic.name)
          .replace("{topic_description}", topic.description || ""),
        max_output_tokens: maxOutputTokens,
      },
    }));

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    // Check if the content exceeds OpenAI's file size limit (100MB)
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      // 100MB limit
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit. Please reduce the number of requests in this batch.`,
      );
    }

    // Create a proper File object for OpenAI API
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `topic_references_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await this.db
      .getOrCreateConnection()
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-references",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        bible_version: "N/A",
        explanation_types: [],
        topic_category: category || null, // Store category if provided
        topic_id: topicId || null, // Store topic_id if provided
        max_output_tokens: maxOutputTokens,
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    return batch;
  }

  async generateTopicExplanationsBatch(
    model: string,
    adminUserId: string,
    languageCode: string,
    explanationTypes: string[] = ["summary", "byline", "detailed"],
    effort: "low" | "medium" | "high" = "medium",
    category?: string,
    topicId?: string,
    includeReferencesInSummary = false,
    includeReferencesInDetailed = false,
    skipExisting = true,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    const connection = this.db.getOrCreateConnection();

    // 1. Create the Parent Batch Job
    const parentBatch = await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-explanations-parent",
        status: "in_progress",
        model,
        created_by: adminUserId,
        bible_version: languageCode,
        explanation_types: explanationTypes,
        topic_category: category || null,
        topic_id: topicId || null,
        max_output_tokens: maxOutputTokens,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const parentBatchId = parentBatch.id;

    // 2. Find all topics that have active references
    let query = connection
      .selectFrom("topics")
      .innerJoin(
        "topic_references",
        "topics.topic_id",
        "topic_references.topic_id",
      )
      .where("topic_references.is_active", "=", true);

    // Only filter out existing explanations if skipExisting is true
    if (skipExisting) {
      query = query.where(({ eb, not, exists }) =>
        not(
          exists(
            eb
              .selectFrom("topic_explanations")
              .select("topic_explanations.topic_id")
              .whereRef("topic_explanations.topic_id", "=", "topics.topic_id")
              .where("topic_explanations.language_code", "=", languageCode)
              .where("topic_explanations.type", "in", explanationTypes)
              .where("topic_explanations.is_active", "=", true),
          ),
        ),
      );
    }

    if (category) {
      query = query.where("topics.category", "=", category);
    }
    if (topicId) {
      query = query.where("topics.topic_id", "=", topicId);
    }

    const topics = await query.selectAll("topics").execute();

    if (topics.length === 0) {
      // Throw an error to provide clear feedback to the frontend.
      console.error(
        "[BATCH] No topics found that need explanations. Throwing error.",
      );
      throw new Error(
        skipExisting
          ? "No topics found that need new explanations. Ensure that the 'References' batch has been run and that explanations do not already exist for the selected topics."
          : "No topics found with active references to generate explanations for.",
      );
    }

    // Update the parent batch with the total number of child batches to be created.
    await connection
      .updateTable("batch_jobs")
      .set({ total_requests: topics.length })
      .where("id", "=", parentBatchId)
      .execute();

    // 3. Loop through topics and create a child batch for each one
    const batchResults = [];
    for (const topic of topics) {
      try {
        const childBatch = await this.createSingleTopicExplanationBatch(
          topic,
          model,
          adminUserId,
          languageCode,
          explanationTypes,
          effort,
          parentBatchId,
          includeReferencesInSummary,
          includeReferencesInDetailed,
          maxOutputTokens,
        );
        batchResults.push({ success: true, ...childBatch });
      } catch (error) {
        console.error(
          `[BATCH] Error processing topic ${topic.name} for explanations:`,
          error,
        );
        batchResults.push({
          success: false,
          topicId: topic.topic_id,
          topicName: topic.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      message: `Topic explanations batch creation started for ${topics.length} topics under parent batch ${parentBatchId}.`,
      results: batchResults,
      parentBatchId,
    };
  }

  private async createSingleTopicExplanationBatch(
    topic: any,
    model: string,
    adminUserId: string,
    languageCode: string,
    explanationTypes: string[],
    effort: "low" | "medium" | "high",
    parentBatchId: number,
    includeReferencesInSummary: boolean,
    includeReferencesInDetailed: boolean,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    const batchRequests: BatchJobRequest[] = [];

    const systemPrompt =
      await this.promptRepository.getActivePromptByType("topic-system");
    if (!systemPrompt) {
      throw new Error("No active topic-system prompt found.");
    }

    // Fetch topic references once per topic
    const topicReference = await this.db
      .getOrCreateConnection()
      .selectFrom("topic_references")
      .where("topic_id", "=", topic.topic_id)
      .where("is_active", "=", true)
      .select("content")
      .executeTakeFirst();

    for (const type of explanationTypes) {
      const prompt = await new UserPromptRepository(
        this.db,
      ).getActivePromptByType(`topic-${type}`);
      if (!prompt) {
        console.warn(`No active prompt found for type: topic-${type}`);
        continue;
      }

      let finalInput = prompt.prompt_template
        .replace("{topic_name}", topic.name)
        .replace("{topic_description}", topic.description || "");

      // For byline, inject references (always).
      // For summary and detailed, inject references based on flags.
      // We assume the prompt template has {references} placeholder if intended to be used.
      const shouldInjectReferences =
        type === "byline" ||
        (type === "summary" && includeReferencesInSummary) ||
        (type === "detailed" && includeReferencesInDetailed);

      if (shouldInjectReferences) {
        finalInput = finalInput.replace(
          "{references}",
          topicReference?.content || "",
        );
        if (!topicReference?.content) {
          console.warn(
            `[BATCH] No active references found for topic "${topic.name}" (type: ${type}). The {references} placeholder was replaced with an empty string.`,
          );
        }
      } else {
        // If references are not included, remove the placeholder if it exists to avoid template issues
        finalInput = finalInput.replace("{references}", "");
      }

      batchRequests.push({
        custom_id: `topic-explanations-${topic.topic_id}-${type}-${languageCode}-${Date.now()}`,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          reasoning: { effort },
          instructions: systemPrompt.prompt,
          input: finalInput,
          max_output_tokens: maxOutputTokens,
        },
      });
    }

    if (batchRequests.length === 0) {
      console.log(
        `[BATCH] No prompts found for topic ${topic.name}. Skipping batch creation.`,
      );
      return;
    }

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    // Check if the content exceeds OpenAI's file size limit (100MB)
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      // 100MB limit
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit. Please reduce the number of requests in this batch.`,
      );
    }

    // Create a proper File object for OpenAI API
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `topic_explanations_${topic.topic_id}_${languageCode}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await this.db
      .getOrCreateConnection()
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-explanations",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        bible_version: languageCode,
        explanation_types: explanationTypes,
        target_language_code: languageCode,
        topic_category: topic.category,
        topic_id: topic.topic_id,
        parent_batch_id: parentBatchId,
        max_output_tokens: maxOutputTokens,
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    return batch;
  }
  async generateBookBatchByName(
    bookName: string,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
    chapters?: number[],
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    console.log(
      `[BATCH] Starting book batch for book "${bookName}", version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}${chapters ? `, chapters: ${chapters.join(", ")}` : ""}`,
    );

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

    return this.generateBookBatch(
      book.book_id,
      bibleVersion,
      explanationTypes,
      model,
      adminUserId,
      skipExisting,
      effort,
      undefined,
      chapters,
      maxOutputTokens,
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
    parentBatchId?: number,
    chapters?: number[],
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    console.log(
      `[BATCH] Starting book batch for book ${bookId}, version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}${chapters ? `, chapters: ${chapters.join(", ")}` : ""}`,
    );

    const { jsonlContent, totalRequests } = await this.generateJSONLContent(
      bookId,
      bibleVersion,
      explanationTypes,
      model,
      skipExisting,
      effort,
      chapters,
      maxOutputTokens,
    );

    // Check if the content exceeds OpenAI's file size limit (100MB)
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      // 100MB limit
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit. Please reduce the number of requests in this batch.`,
      );
    }

    // Create a proper File object for OpenAI API
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `batch_${bookId}_${bibleVersion}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    console.log(
      "[BATCH] Batch created successfully:",
      JSON.stringify(batch, null, 2),
    );

    if (batch.errors?.data && batch.errors.data.length > 0) {
      console.error(
        `[BATCH] Batch ${batch.id} created with errors`,
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
        created_by: adminUserId,
        created_at: new Date(),
        parent_batch_id: parentBatchId === undefined ? null : parentBatchId,
        max_output_tokens: maxOutputTokens,
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
    skipExisting = false,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    console.log(
      `[BATCH] Starting Bible batch for version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const connection = this.db.getOrCreateConnection();

    const parentBatch = await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "bible",
        status: "in_progress",
        bible_version: bibleVersion,
        model,
        explanation_types: explanationTypes,
        created_by: adminUserId,
        total_requests: 66,
        max_output_tokens: maxOutputTokens,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const parentBatchId = parentBatch.id;

    const books = await connection
      .selectFrom("books")
      .select(["book_id", "name"])
      .orderBy("book_id", "asc")
      .execute();

    if (!books || books.length === 0) {
      throw new Error("No books found in database");
    }

    console.log(
      `[BATCH] Processing ${books.length} books for Bible batch (Parent ID: ${parentBatchId})`,
    );

    const batchResults = [];

    for (const book of books) {
      try {
        const bookBatch = await this.generateBookBatch(
          book.book_id,
          bibleVersion,
          explanationTypes,
          model,
          adminUserId,
          skipExisting,
          effort,
          parentBatchId,
          undefined, // chapters
          maxOutputTokens,
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
      message: `Bible batch creation started for ${books.length} books under parent batch ${parentBatchId}.`,
      results: batchResults,
      parentBatchId: parentBatchId,
    };
  }

  async generateRephraseBatch(
    model: string,
    adminUserId: string,
    type: "bible" | "book",
    bibleVersion: string,
    effort: "low" | "medium" | "high" = "medium",
    bookName?: string,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    if (type === "book" && !bookName) {
      throw new Error(
        "Book name is required for a book-specific rephrase batch.",
      );
    }

    console.log(
      `[BATCH] Starting rephrase batch for type: ${type} with model ${model}`,
    );

    const connection = this.db.getOrCreateConnection();

    if (type === "bible") {
      const parentBatch = await connection
        .insertInto("batch_jobs")
        .values({
          batch_type: "rephrase-bible",
          status: "validating",
          model,
          created_by: adminUserId,
          total_requests: 66,
          bible_version: bibleVersion,
          explanation_types: [],
          max_output_tokens: maxOutputTokens,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const parentBatchId = parentBatch.id;

      // Add parent batch to monitoring queue
      await this.batchMonitoringQueue.add(
        BATCH_MONITORING_QUEUE,
        { batchId: `parent-${parentBatchId}`, model, isParent: true },
        {
          jobId: `parent-${parentBatchId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      const books = await connection
        .selectFrom("books")
        .select(["book_id", "name"])
        .orderBy("book_id", "asc")
        .execute();

      if (!books || books.length === 0) {
        throw new Error("No books found in database");
      }

      for (const book of books) {
        await this.createBookRephraseBatch(
          model,
          adminUserId,
          effort,
          book.name,
          bibleVersion,
          parentBatchId,
          maxOutputTokens,
        );
      }

      return {
        success: true,
        message: `Rephrase batch started for all books under parent ID ${parentBatchId}.`,
        parentBatchId,
      };
    }

    if (type === "book" && bookName) {
      return this.createBookRephraseBatch(
        model,
        adminUserId,
        effort,
        bookName,
        bibleVersion,
        undefined,
        maxOutputTokens,
      );
    }

    throw new Error("Invalid rephrase batch type or missing book name.");
  }

  async generateTranslateBatch(
    model: string,
    adminUserId: string,
    type: "bible" | "book",
    source_language_code: string,
    target_language_code: string,
    explanationTypes: string[],
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
    bookName?: string,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    if (type === "book" && !bookName) {
      throw new Error(
        "Book name is required for a book-specific translate batch.",
      );
    }

    console.log(
      `[BATCH] Starting translate batch for type: ${type} with model ${model}`,
    );
    console.log(
      `[BATCH] Source language: ${source_language_code}, Target language: ${target_language_code}`,
    );

    const connection = this.db.getOrCreateConnection();

    if (type === "bible") {
      console.log(
        `[BATCH] Creating parent batch for bible translation (${source_language_code} to ${target_language_code})`,
      );
      const parentBatch = await connection
        .insertInto("batch_jobs")
        .values({
          batch_type: "translate-bible",
          status: "validating",
          model,
          created_by: adminUserId,
          total_requests: 66,
          bible_version: source_language_code,
          source_language_code,
          target_language_code,
          explanation_types: [],
          max_output_tokens: maxOutputTokens,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const parentBatchId = parentBatch.id;

      console.log(`[BATCH] Created parent batch with ID: ${parentBatchId}`);

      // Add parent batch to monitoring queue
      await this.batchMonitoringQueue.add(
        BATCH_MONITORING_QUEUE,
        { batchId: `parent-${parentBatchId}`, model, isParent: true },
        {
          jobId: `parent-${parentBatchId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      const books = await connection
        .selectFrom("books")
        .select(["book_id", "name"])
        .orderBy("book_id", "asc")
        .execute();

      if (!books || books.length === 0) {
        const error = "No books found in database";
        console.error(`[BATCH] ${error}`);
        throw new Error(error);
      }

      console.log(`[BATCH] Found ${books.length} books to process`);

      for (const book of books) {
        console.log(
          `[BATCH] Processing book: ${book.name} (ID: ${book.book_id})`,
        );
        try {
          await this.createBookTranslateBatch(
            model,
            adminUserId,
            effort,
            book.name,
            source_language_code,
            target_language_code,
            explanationTypes,
            skipExisting,
            parentBatchId,
            maxOutputTokens,
          );
        } catch (error) {
          console.error(
            `[BATCH] Error creating translate batch for book ${book.name}:`,
            error,
          );
          // Continue with other books instead of failing the entire operation
        }
      }

      return {
        success: true,
        message: `Translate batch started for all books under parent ID ${parentBatchId}.`,
        parentBatchId,
      };
    }

    if (type === "book" && bookName) {
      console.log(
        `[BATCH] Creating single book translate batch for: ${bookName}`,
      );
      return this.createBookTranslateBatch(
        model,
        adminUserId,
        effort,
        bookName,
        source_language_code,
        target_language_code,
        explanationTypes,
        skipExisting,
        undefined,
        maxOutputTokens,
      );
    }

    throw new Error("Invalid translate batch type or missing book name.");
  }

  private async createBookRephraseBatch(
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high",
    bookName: string,
    bibleVersion: string,
    parentBatchId?: number,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    const connection = this.db.getOrCreateConnection();

    const book = await connection
      .selectFrom("books")
      .where("name", "=", bookName)
      .select("book_id")
      .executeTakeFirst();

    if (!book) {
      throw new Error(`Book "${bookName}" not found.`);
    }

    const version = await connection
      .selectFrom("bible_versions")
      .where("version_key", "=", bibleVersion)
      .select("language_code")
      .executeTakeFirst();

    if (!version) {
      throw new Error(`Bible version "${bibleVersion}" not found.`);
    }

    const rephrasePrompt = await connection
      .selectFrom("prompts")
      .where("prompt_type", "=", "rephrase")
      .where("status", "=", PromptStatusEnum.active)
      .select("prompt")
      .executeTakeFirst();

    if (!rephrasePrompt) {
      throw new Error("No active rephrase prompt found in the database.");
    }

    const activeExplanations = await connection
      .selectFrom("explanations")
      .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
      .where("chapters.book_id", "=", book.book_id)
      .where("explanations.language_code", "=", version.language_code)
      .where("is_active", "=", true)
      .select([
        "explanations.explanation_id",
        "explanations.explanation",
        "explanations.type",
        "chapters.chapter_number",
      ])
      .execute();

    if (activeExplanations.length === 0) {
      console.log(
        `[BATCH] No active explanations found for ${bookName} (${bibleVersion}) to rephrase. Skipping.`,
      );
      return;
    }

    const toSlug = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    const batchRequests: BatchJobRequest[] = activeExplanations.map(
      (explanation) => {
        const safeBook = toSlug(bookName);
        const safeType = toSlug(explanation.type);
        return {
          custom_id: `rephrase|${safeBook}|${explanation.chapter_number}|${safeType}|${bibleVersion}|${explanation.explanation_id}`,
          method: "POST",
          url: "/v1/responses",
          body: {
            model,
            reasoning: { effort },
            instructions: rephrasePrompt.prompt,
            input: explanation.explanation,
            max_output_tokens: maxOutputTokens,
          },
        };
      },
    );

    // Validate custom ID uniqueness before proceeding
    const validation = this.validateCustomIdUniqueness(batchRequests);
    if (!validation.isValid) {
      const error = `Custom ID validation failed for rephrase batch: ${validation.summary}. Duplicate IDs: ${validation.duplicates.join(", ")}`;
      console.error(`[BATCH] ${error}`);
      throw new Error(error);
    }

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    // Check if the content exceeds OpenAI's file size limit (100MB)
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      // 100MB limit
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit. Please reduce the number of requests in this batch.`,
      );
    }

    // Create a proper File object for OpenAI API
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `rephrase_batch_${book.book_id}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "rephrase",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        book_id: book.book_id,
        parent_batch_id: parentBatchId,
        bible_version: bibleVersion, // preserve actual version
        explanation_types: [],
        max_output_tokens: maxOutputTokens,
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    return batch;
  }

  private async createBookTranslateBatch(
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high",
    bookName: string,
    source_language_code: string,
    target_language_code: string,
    explanationTypes: string[],
    skipExisting: boolean,
    parentBatchId?: number,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ) {
    console.log(
      `[BATCH] Creating translate batch for book: ${bookName}, source: ${source_language_code}, target: ${target_language_code}`,
    );
    const connection = this.db.getOrCreateConnection();

    const book = await connection
      .selectFrom("books")
      .where("name", "=", bookName)
      .select("book_id")
      .executeTakeFirst();

    if (!book) {
      const error = `Book "${bookName}" not found.`;
      console.error(`[BATCH] ${error}`);
      throw new Error(error);
    }

    console.log(`[BATCH] Found book: ${bookName} with ID: ${book.book_id}`);

    const sourceVersion = await connection
      .selectFrom("bible_versions")
      .where("language_code", "=", source_language_code)
      .select("language_code")
      .executeTakeFirst();

    if (!sourceVersion) {
      const error = `Source Bible version with language "${source_language_code}" not found.`;
      console.error(`[BATCH] ${error}`);
      throw new Error(error);
    }

    console.log(
      `[BATCH] Found source version with language: ${sourceVersion.language_code}`,
    );

    const targetVersion = await connection
      .selectFrom("bible_versions")
      .where("language_code", "=", target_language_code)
      .select(["id", "language_code"])
      .executeTakeFirst();

    // For translation, target version doesn't need to exist in database
    // We can create explanations for any valid language code
    if (!targetVersion) {
      console.log(
        `[BATCH] Target Bible version with language "${target_language_code}" not found in database, but continuing with translation to custom language.`,
      );
    } else {
      console.log(
        `[BATCH] Found target version with language: ${targetVersion.language_code}, ID: ${targetVersion.id}`,
      );
    }

    const translatePrompt = await connection
      .selectFrom("prompts")
      .where("prompt_type", "=", "translate")
      .where("status", "=", PromptStatusEnum.active)
      .select("prompt")
      .executeTakeFirst();

    if (!translatePrompt) {
      const error = "No active translate prompt found in the database.";
      console.error(`[BATCH] ${error}`);
      throw new Error(error);
    }

    console.log("[BATCH] Found active translate prompt");

    const language = getLanguageName(target_language_code);
    const finalPrompt = translatePrompt.prompt.replace("{language}", language);

    console.log(`[BATCH] Target language name: ${language}`);

    // Fetch localized title templates for the target language
    const titleTemplates = await connection
      .selectFrom("translation_templates")
      .where("language_code", "=", target_language_code)
      .select(["type", "title_template"])
      .execute();

    const titleTemplateMap = new Map(
      titleTemplates.map((t) => [t.type, t.title_template]),
    );

    let query = connection
      .selectFrom("explanations")
      .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
      .where("chapters.book_id", "=", book.book_id)
      .where("explanations.language_code", "=", source_language_code)
      .where("is_active", "=", true);

    if (explanationTypes.length > 0) {
      query = query.where("explanations.type", "in", explanationTypes as any);
      console.log(
        `[BATCH] Filtering by explanation types: ${explanationTypes.join(", ")}`,
      );
    }

    const activeExplanations = await query
      .select([
        "explanations.explanation_id",
        "explanations.explanation",
        "explanations.type",
        "chapters.chapter_number",
      ])
      .execute();

    console.log(
      `[BATCH] Found ${activeExplanations.length} active explanations for ${bookName} in ${source_language_code}`,
    );

    let batchRequests: BatchJobRequest[] = [];

    if (skipExisting) {
      console.log("[BATCH] Checking for existing translations to skip...");
      const existingTargetExplanations = await connection
        .selectFrom("explanations")
        .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
        .where("chapters.book_id", "=", book.book_id)
        .where("explanations.language_code", "=", target_language_code)
        .where("explanations.type", "in", explanationTypes as any)
        .select(["chapters.chapter_number", "explanations.type"])
        .execute();

      console.log(
        `[BATCH] Found ${existingTargetExplanations.length} existing explanations in target language`,
      );

      const existingSet = new Set(
        existingTargetExplanations.map((e) => `${e.chapter_number}-${e.type}`),
      );

      for (const explanation of activeExplanations) {
        const key = `${explanation.chapter_number}-${explanation.type}`;
        if (!existingSet.has(key)) {
          let itemPrompt = finalPrompt;
          const titleTemplate = titleTemplateMap.get(explanation.type);

          if (titleTemplate) {
            const localizedTitle = titleTemplate
              .replace("{Book}", bookName)
              .replace(
                "{chapterNumber}",
                explanation.chapter_number.toString(),
              );
            itemPrompt = itemPrompt.replace(
              "{localized_title}",
              localizedTitle,
            );
          } else {
            // Fallback: just remove the placeholder if no template found
            itemPrompt = itemPrompt.replace("{localized_title}", "");
          }

          batchRequests.push({
            custom_id: `translate|${bookName}|${explanation.chapter_number}|${explanation.type}|${target_language_code}|${explanation.explanation_id}`,
            method: "POST",
            url: "/v1/responses",
            body: {
              model,
              reasoning: { effort },
              instructions: itemPrompt,
              input: explanation.explanation,
              max_output_tokens: maxOutputTokens,
            },
          });
        }
      }
      console.log(
        `[BATCH] After skipping existing, ${batchRequests.length} translations needed`,
      );
    } else {
      console.log("[BATCH] Not skipping existing translations");
      batchRequests = activeExplanations.map((explanation) => {
        let itemPrompt = finalPrompt;
        const titleTemplate = titleTemplateMap.get(explanation.type);

        if (titleTemplate) {
          const localizedTitle = titleTemplate
            .replace("{Book}", bookName)
            .replace("{chapterNumber}", explanation.chapter_number.toString());
          itemPrompt = itemPrompt.replace("{localized_title}", localizedTitle);
        } else {
          itemPrompt = itemPrompt.replace("{localized_title}", "");
        }

        return {
          custom_id: `translate|${bookName}|${explanation.chapter_number}|${explanation.type}|${target_language_code}|${explanation.explanation_id}`,
          method: "POST",
          url: "/v1/responses",
          body: {
            model,
            reasoning: { effort },
            instructions: itemPrompt,
            input: explanation.explanation,
            max_output_tokens: maxOutputTokens,
          },
        };
      });
    }

    if (batchRequests.length === 0) {
      console.log(
        `[BATCH] No new explanations to translate for ${bookName} (${source_language_code} to ${target_language_code}). Skipping.`,
      );
      return;
    }

    // Validate custom ID uniqueness before proceeding
    const validation = this.validateCustomIdUniqueness(batchRequests);
    if (!validation.isValid) {
      const error = `Custom ID validation failed: ${validation.summary}. Duplicate IDs: ${validation.duplicates.join(", ")}`;
      console.error(`[BATCH] ${error}`);
      throw new Error(error);
    }

    console.log(
      `[BATCH] Preparing to create ${batchRequests.length} translation requests for ${bookName}`,
    );

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    console.log(
      `[BATCH] Generated JSONL content with ${batchRequests.length} requests`,
    );

    // Check if the content exceeds OpenAI's file size limit (100MB)
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      // 100MB limit
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit. Please reduce the number of requests in this batch.`,
      );
    }

    // Create a proper File object for OpenAI API
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `translate_batch_${book.book_id}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    console.log(`[BATCH] Created OpenAI file: ${file.id}`);

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    console.log(`[BATCH] Created OpenAI batch: ${batch.id}`);

    await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "translate",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        book_id: book.book_id,
        parent_batch_id: parentBatchId,
        bible_version: target_language_code,
        source_language_code,
        target_language_code,
        explanation_types: [],
        max_output_tokens: maxOutputTokens,
      })
      .execute();

    console.log(
      `[BATCH] Saved batch job to database with parent_batch_id: ${parentBatchId}`,
    );

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    console.log(`[BATCH] Added batch ${batch.id} to monitoring queue`);

    return batch;
  }

  async getBatchStatus(batchId: string) {
    const batchStatus = await openai.batches.retrieve(batchId);

    if (batchStatus.status === "failed" && batchStatus.errors) {
      console.error(
        `[BATCH] Batch ${batchId} failed with errors`,
        JSON.stringify(batchStatus.errors, null, 2),
      );

      // Enhanced error detection for duplicate custom_id issues
      const errorAnalysis = await this.enhancedBatchErrorDetection(
        batchStatus,
        batchId,
      );

      if (errorAnalysis.hasDuplicateErrors) {
        console.error(
          `[BATCH] CRITICAL: Batch ${batchId} failed due to duplicate custom_id errors. This indicates the custom_id generation logic needs immediate attention. Affected custom_ids: ${errorAnalysis.duplicateCustomIds.join(", ")}`,
        );
      }
    }

    const currentBatchJob = await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("openai_batch_id", "=", batchId)
      .select([
        "status",
        "completed_requests",
        "failed_requests",
        "explanations_processed",
        "actual_cost",
      ])
      .executeTakeFirst();

    if (currentBatchJob && batchStatus.request_counts) {
      const { total, completed, failed } = batchStatus.request_counts;

      let correctStatus: string = batchStatus.status;

      if (batchStatus.status === "completed") {
        if (completed === 0 && failed > 0) {
          correctStatus = "failed";
        } else if (failed > 0) {
          correctStatus = "partial_failure";
        }
      }

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
      }

      const isFinished =
        correctStatus === "completed" ||
        correctStatus === "partial_failure" ||
        correctStatus === "failed";
      const needsProcessing =
        isFinished &&
        (!currentBatchJob.explanations_processed ||
          currentBatchJob.actual_cost === null ||
          currentBatchJob.actual_cost === 0);

      if (needsProcessing) {
        console.log(
          `[BATCH] Batch ${batchId} is complete and needs processing. Adding to queue.`,
        );
        await this.batchProcessingQueue.add("process-batch", {
          batchId,
          outputFileId: batchStatus.output_file_id,
        });
      }
    }

    return batchStatus;
  }

  async processBatch(batchId: string, outputFileId: string) {
    console.log(`[BATCH] Processing batch ${batchId} from queue.`);

    const batchStatus = await openai.batches.retrieve(batchId);

    if (
      batchStatus.request_counts &&
      batchStatus.request_counts.failed > 0 &&
      batchStatus.error_file_id
    ) {
      try {
        const errorFileContent = await openai.files.content(
          batchStatus.error_file_id,
        );
        const errorText = await errorFileContent.text();
        await this.db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({ error_file_content: errorText })
          .where("openai_batch_id", "=", batchId)
          .execute();
      } catch (error) {
        console.error(
          `[BATCH] Could not download error file ${batchStatus.error_file_id}:`,
          error,
        );
      }
    }

    if (outputFileId) {
      await this.processOutputFile(batchId, outputFileId);
    }
  }

  async cancelBatch(batchId: string) {
    console.log(`[BATCH] Cancelling batch: ${batchId}`);

    const batchJob = await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("id", "=", Number(batchId))
      .select(["batch_type", "openai_batch_id", "status"])
      .executeTakeFirst();

    if (!batchJob) {
      throw new Error(`Batch job ${batchId} not found.`);
    }

    if (
      batchJob.batch_type === "bible" ||
      batchJob.batch_type === "rephrase-bible" ||
      batchJob.batch_type === "translate-bible" ||
      batchJob.batch_type === "topic-explanations-parent" ||
      batchJob.batch_type === "topic-translate-all" ||
      batchJob.batch_type === "auto-highlight-bible"
    ) {
      console.log(
        `[BATCH] Cancelling parent batch ${batchId} and its children.`,
      );
      const children = await this.getBatchChildren(Number(batchId));

      for (const child of children) {
        if (
          child.openai_batch_id &&
          (child.status === "validating" ||
            child.status === "in_progress" ||
            child.status === "finalizing")
        ) {
          try {
            const openaiBatch = await openai.batches.cancel(
              child.openai_batch_id,
            );
            console.log(
              `[BATCH] Successfully sent cancel request for child batch ${child.openai_batch_id}`,
            );
            // Update child status in DB based on OpenAI API response
            await this.db
              .getOrCreateConnection()
              .updateTable("batch_jobs")
              .set({ status: openaiBatch.status }) // Use the status from OpenAI API response
              .where("id", "=", Number(child.id))
              .execute();
          } catch (error) {
            if (
              error instanceof APIError &&
              error.status === 409 &&
              error.message.includes(
                "Cannot cancel a batch with status 'completed'",
              )
            ) {
              console.warn(
                `[BATCH] Child batch ${child.openai_batch_id} was already completed and could not be cancelled.`,
              );
              // Mark child as failed_to_cancel if it was already completed and couldn't be cancelled
              await this.db
                .getOrCreateConnection()
                .updateTable("batch_jobs")
                .set({ status: "failed_to_cancel" })
                .where("id", "=", Number(child.id))
                .execute();
            } else {
              console.error(
                `[BATCH] Failed to cancel child batch ${child.openai_batch_id}:`,
                error,
              );
              // Mark child as failed_to_cancel to make UI accurate
              await this.db
                .getOrCreateConnection()
                .updateTable("batch_jobs")
                .set({ status: "failed_to_cancel" })
                .where("id", "=", Number(child.id))
                .execute();
            }
          }
        }
      }

      // Re-fetch children statuses to accurately determine parent status
      const updatedChildren = await this.getBatchChildren(Number(batchId));
      let newCancelledCount = 0;
      let newFailedToCancelCount = 0;
      let newCompletedCount = 0;

      for (const child of updatedChildren) {
        if (child.status === "cancelled") {
          newCancelledCount++;
        } else if (child.status === "failed_to_cancel") {
          newFailedToCancelCount++;
        } else if (child.status === "completed") {
          newCompletedCount++;
        }
      }

      let newParentStatus = "cancelled";
      if (newCancelledCount === 0 && newFailedToCancelCount > 0) {
        newParentStatus = "failed_to_cancel";
      } else if (newFailedToCancelCount > 0) {
        newParentStatus = "partially_cancelled";
      } else if (newCancelledCount > 0) {
        newParentStatus = "cancelled";
      } else if (newCompletedCount === updatedChildren.length) {
        newParentStatus = "completed"; // All children completed, parent is completed
      } else {
        newParentStatus = batchJob.status; // Fallback to original status if no change
      }

      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({ status: newParentStatus })
        .where("id", "=", Number(batchId))
        .execute();

      return {
        success: true,
        message: `Cancellation process initiated for ${newCancelledCount} child batches.`,
      };
    }

    if (!batchJob.openai_batch_id) {
      throw new Error(
        `Book batch ${batchId} does not have an OpenAI batch ID.`,
      );
    }
    const openaiBatch = await openai.batches.cancel(batchJob.openai_batch_id);
    console.log(
      `[BATCH] Successfully cancelled single book batch ${batchJob.openai_batch_id}`,
    );
    return openaiBatch;
  }

  async getAllBatches(limit = 50, offset = 0, adminUserId?: string) {
    console.log(
      `[BATCH] Getting all batches with limit: ${limit}, offset: ${offset}, adminUserId: ${adminUserId}`,
    );

    let query = this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("parent_batch_id", "is", null)
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

  async getBatchChildren(parentBatchId: number) {
    console.log(`[BATCH] Getting children for parent batch: ${parentBatchId}`);
    return await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("parent_batch_id", "=", parentBatchId)
      .leftJoin("books", "batch_jobs.book_id", "books.book_id")
      .leftJoin("topics", "batch_jobs.topic_id", "topics.topic_id") // Join with topics table
      .selectAll("batch_jobs")
      .select(["books.name as book_name", "topics.name as topic_name"]) // Select topic_name
      .orderBy("batch_jobs.book_id", "asc")
      .orderBy("batch_jobs.topic_id", "asc")
      .execute();
  }

  async monitorBibleBatch(parentBatchId: number) {
    console.log(`[BATCH] Monitoring bible batch: ${parentBatchId}`);

    try {
      const children = await this.getBatchChildren(parentBatchId);

      if (children.length === 0) {
        console.warn(
          `[BATCH] No child batches found for parent ${parentBatchId}. Checking for creation errors.`,
        );

        // Check if parent batch creation failed
        const parentBatch = await this.db
          .getOrCreateConnection()
          .selectFrom("batch_jobs")
          .where("id", "=", parentBatchId)
          .select(["status", "created_at", "batch_type"])
          .executeTakeFirst();

        if (parentBatch) {
          const timeSinceCreation =
            Date.now() - new Date(parentBatch.created_at).getTime();

          // If more than 5 minutes and no children, mark as failed
          if (timeSinceCreation > 5 * 60 * 1000) {
            console.error(
              `[BATCH] Parent batch ${parentBatchId} has no children after 5 minutes. Marking as failed.`,
            );
            console.error(
              `[BATCH] Batch type: ${parentBatch.batch_type}, Current status: ${parentBatch.status}`,
            );

            await this.db
              .getOrCreateConnection()
              .updateTable("batch_jobs")
              .set({ status: "failed" })
              .where("id", "=", parentBatchId)
              .execute();

            return {
              success: false,
              message: "Parent batch failed - no child batches created.",
            };
          }
          console.log(
            `[BATCH] Parent batch ${parentBatchId} created ${Math.round(timeSinceCreation / 1000)} seconds ago. Waiting for child batch creation...`,
          );
          return {
            success: true,
            message: "Waiting for child batch creation.",
          };
        }
        console.error(
          `[BATCH] Parent batch ${parentBatchId} not found in database`,
        );
        return { success: false, message: "Parent batch not found." };
      }

      console.log(
        `[BATCH] Found ${children.length} child batches for parent ${parentBatchId}`,
      );

      const childBatchesToMonitor = children
        .map((c) => c.openai_batch_id)
        .filter((id): id is string => !!id);

      console.log(
        `[BATCH] Monitoring ${childBatchesToMonitor.length} OpenAI batches`,
      );

      const concurrencyLimit = 6;
      const results = [];

      for (let i = 0; i < childBatchesToMonitor.length; i += concurrencyLimit) {
        const batch = childBatchesToMonitor.slice(i, i + concurrencyLimit);
        const promises = batch.map((id) => this.getBatchStatus(id));
        results.push(...(await Promise.all(promises)));
      }

      // After monitoring, update the parent batch status
      const summary = await this.getBatchSummary(parentBatchId);
      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({
          status: summary.aggregate_status,
          actual_cost: summary.total_cost,
        })
        .where("id", "=", parentBatchId)
        .execute();

      console.log(
        `[BATCH] Parent batch ${parentBatchId} status updated to ${summary.aggregate_status}`,
      );
      console.log(
        `[BATCH] Summary: ${summary.status_progress_text}, Total cost: ${summary.total_cost.toFixed(4)}`,
      );

      return { success: true, message: "Monitoring complete.", summary };
    } catch (error) {
      console.error(
        `[BATCH] Error monitoring bible batch ${parentBatchId}:`,
        error,
      );

      // Mark parent as failed if monitoring fails
      try {
        await this.db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({ status: "failed" })
          .where("id", "=", parentBatchId)
          .execute();
      } catch (updateError) {
        console.error(
          "[BATCH] Failed to update parent batch status:",
          updateError,
        );
      }

      return {
        success: false,
        message: `Monitoring failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async monitorAllActiveBatches() {
    console.log("[BATCH] Starting to monitor all active batches.");
    const activeBatches = await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("status", "not in", ["completed", "failed", "cancelled"])
      .where("parent_batch_id", "is", null)
      .selectAll()
      .execute();

    console.log(
      `[BATCH] Found ${activeBatches.length} active batches to monitor.`,
    );

    for (const batch of activeBatches) {
      const isParent =
        batch.batch_type === "bible" ||
        batch.batch_type === "rephrase-bible" ||
        batch.batch_type === "translate-bible" ||
        batch.batch_type === "topic-explanations-parent" ||
        batch.batch_type === "topic-translate-all" ||
        batch.batch_type === "auto-highlight-bible";
      const batchId = isParent ? `parent-${batch.id}` : batch.openai_batch_id;

      if (batchId) {
        await this.batchMonitoringQueue.add(
          BATCH_MONITORING_QUEUE,
          { batchId, model: batch.model, isParent },
          {
            jobId: `${batchId}-${Date.now()}`,
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      }
    }

    return {
      success: true,
      message: `Successfully queued monitoring for ${activeBatches.length} active batches.`,
    };
  }

  async getBatchSummary(parentBatchId: number) {
    console.log(`[BATCH] Getting summary for parent batch: ${parentBatchId}`);
    const children = await this.getBatchChildren(parentBatchId);
    const totalChildren = children.length;

    if (totalChildren === 0) {
      const parentJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("id", "=", parentBatchId)
        .select(["status", "created_at", "batch_type"])
        .executeTakeFirst();

      if (parentJob) {
        const timeSinceCreation =
          Date.now() - new Date(parentJob.created_at).getTime();
        const minutesSinceCreation = Math.round(timeSinceCreation / 60000);

        // If it's been more than 5 minutes without children, consider it failed
        if (timeSinceCreation > 5 * 60 * 1000) {
          console.warn(
            `[BATCH] Parent batch ${parentBatchId} has no children after ${minutesSinceCreation} minutes`,
          );
          return {
            aggregate_status: "failed",
            status_progress_text: `Failed - No child batches created after ${minutesSinceCreation} minutes`,
            total_cost: 0,
          };
        }
        return {
          aggregate_status: parentJob.status || "pending",
          status_progress_text: `Initializing... (${minutesSinceCreation}m since creation)`,
          total_cost: 0,
        };
      }

      return {
        aggregate_status: "failed",
        status_progress_text: "Failed - Parent batch not found",
        total_cost: 0,
      };
    }

    console.log(
      `[BATCH] Processing summary for ${totalChildren} child batches`,
    );

    const statusCounts = children.reduce(
      (acc, child) => {
        const status = child.status || "pending";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalCost = children.reduce(
      (acc, child) => acc + (child.actual_cost || 0),
      0,
    );

    const completedCount = statusCounts.completed || 0;
    const failedCount =
      (statusCounts.failed || 0) + (statusCounts.expired || 0);
    const cancellingCount = statusCounts.cancelling || 0;
    const cancelledCount = statusCounts.cancelled || 0;
    const inProgressCount = statusCounts.in_progress || 0;
    const finalizingCount = statusCounts.finalizing || 0;
    const validatingCount = statusCounts.validating || 0;

    console.log(
      `[BATCH] Status breakdown - Completed: ${completedCount}, Failed: ${failedCount}, In Progress: ${inProgressCount}, Validating: ${validatingCount}`,
    );

    if (cancellingCount > 0) {
      return {
        aggregate_status: "cancelling",
        status_progress_text: `Cancelling (${cancelledCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    if (cancelledCount > 0) {
      if (cancelledCount + failedCount === totalChildren) {
        return {
          aggregate_status: "cancelled",
          status_progress_text: `Cancelled (${cancelledCount}/${totalChildren})`,
          total_cost: totalCost,
        };
      }
      return {
        aggregate_status: "partial_failure",
        status_progress_text: `Partially Cancelled (${cancelledCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    if (validatingCount > 0) {
      return {
        aggregate_status: "validating",
        status_progress_text: `Validating (${totalChildren - validatingCount}/${totalChildren} processed)`,
        total_cost: totalCost,
      };
    }

    if (inProgressCount > 0 || finalizingCount > 0) {
      return {
        aggregate_status: "in_progress",
        status_progress_text: `In Progress (${completedCount}/${totalChildren} completed)`,
        total_cost: totalCost,
      };
    }

    if (completedCount === totalChildren) {
      return {
        aggregate_status: "completed",
        status_progress_text: `Completed (${completedCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    if (failedCount > 0) {
      if (failedCount === totalChildren) {
        return {
          aggregate_status: "failed",
          status_progress_text: `Failed (${failedCount}/${totalChildren})`,
          total_cost: totalCost,
        };
      }
      return {
        aggregate_status: "partial_failure",
        status_progress_text: `Partial Failure (${completedCount} completed, ${failedCount} failed)`,
        total_cost: totalCost,
      };
    }

    return {
      aggregate_status: "pending",
      status_progress_text: "Pending...",
      total_cost: totalCost,
    };
  }

  private async generateJSONLContent(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
    chapterNumbers?: number[],
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  ): Promise<{ jsonlContent: string; totalRequests: number }> {
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

    let chaptersQuery = connection
      .selectFrom("chapters")
      .where("book_id", "=", bookId)
      .select(["chapter_id", "chapter_number"])
      .orderBy("chapter_number", "asc");

    if (chapterNumbers && chapterNumbers.length > 0) {
      chaptersQuery = chaptersQuery.where(
        "chapter_number",
        "in",
        chapterNumbers,
      );
    }

    const chapters = await chaptersQuery.execute();

    if (!chapters || chapters.length === 0) {
      throw new Error(
        `No chapters found for book ${bookId}${chapterNumbers ? ` with numbers: ${chapterNumbers.join(", ")}` : ""}`,
      );
    }

    const batchRequests: BatchJobRequest[] = [];

    let existingExplanations: Set<string> = new Set();
    if (skipExisting) {
      const existing = await connection
        .selectFrom("explanations")
        .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
        .where("chapters.book_id", "=", bookId)
        .where("explanations.language_code", "=", version.language_code)
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

        const sanitizedSystemPrompt = systemPrompt.prompt
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

        const sanitizedUserPrompt = userPrompt
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

        batchRequests.push({
          custom_id: `${book.name
            .toLowerCase()
            .replace(
              /\s+/g,
              "-",
            )}-${chapter.chapter_number}-${explanationType}-${chapter.chapter_id}`,
          method: "POST",
          url: "/v1/responses",
          body: {
            model,
            reasoning: { effort },
            instructions: sanitizedSystemPrompt,
            input: sanitizedUserPrompt,
            max_output_tokens: maxOutputTokens,
          },
        });
      }
    }

    if (batchRequests.length === 0) {
      throw new Error(
        `No requests to process for ${book.name}. All explanations may already exist.`,
      );
    }

    // Validate custom ID uniqueness before proceeding
    const validation = this.validateCustomIdUniqueness(batchRequests);
    if (!validation.isValid) {
      const error = `Custom ID validation failed for generate batch: ${validation.summary}. Duplicate IDs: ${validation.duplicates.join(", ")}`;
      console.error(`[BATCH] ${error}`);
      throw new Error(error);
    }

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    return { jsonlContent, totalRequests: batchRequests.length };
  }

  private async processOutputFile(batchId: string, outputFileId: string) {
    try {
      const batchJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select([
          "batch_type",
          "bible_version",
          "book_id",
          "model",
          "created_by",
          "max_output_tokens",
        ])
        .executeTakeFirst();

      if (!batchJob) {
        console.error(`[BATCH] Batch job not found for ${batchId}`);
        return;
      }

      if (batchJob.batch_type === "rephrase") {
        return this.processRephraseOutputFile(batchId, outputFileId, batchJob);
      }
      if (batchJob.batch_type === "translate") {
        return this.processTranslateOutputFile(batchId, outputFileId, batchJob);
      }
      if (batchJob.batch_type === "topic-discovery") {
        return this.processTopicDiscoveryOutputFile(
          batchId,
          outputFileId,
          batchJob,
        );
      }
      if (batchJob.batch_type === "topic-references") {
        return this.processTopicReferencesOutputFile(
          batchId,
          outputFileId,
          batchJob,
        );
      }
      if (batchJob.batch_type === "topic-explanations") {
        return this.processTopicExplanationsOutputFile(
          batchId,
          outputFileId,
          batchJob,
        );
      }
      if (batchJob.batch_type === "topic-translate-names") {
        return this.processTopicNameTranslateOutputFile(
          batchId,
          outputFileId,
          batchJob,
        );
      }
      if (batchJob.batch_type === "topic-translate") {
        return this.processTopicExplanationTranslateOutputFile(
          batchId,
          outputFileId,
          batchJob,
        );
      }
      if (batchJob.batch_type === "auto-highlight") {
        return this.processAutoHighlightOutputFile(
          batchId,
          outputFileId,
          batchJob,
        );
      }

      const version = await this.db
        .getOrCreateConnection()
        .selectFrom("bible_versions")
        .where("version_key", "=", batchJob.bible_version)
        .select("language_code")
        .executeTakeFirst();

      if (!version) {
        console.error(
          `[BATCH] Bible version not found: ${batchJob.bible_version}`,
        );
        return;
      }

      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      let processedCount = 0;
      let errorCount = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      const successfulExplanations: {
        bookId: number;
        chapterNumber: number;
        type: string;
      }[] = [];

      for (const line of lines) {
        try {
          const parsedLine = JSON.parse(line);

          if (parsedLine.response?.body?.usage) {
            totalPromptTokens +=
              parsedLine.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              parsedLine.response.body.usage.output_tokens || 0;
          }

          const responseBody = parsedLine.response?.body;

          const outputText: string | undefined = responseBody?.output_text;
          let extractedText: string | undefined = outputText;

          if (!extractedText && Array.isArray(responseBody?.output)) {
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
            const customIdParts = parsedLine.custom_id.split("-");

            // Handle both new format (4 parts) and legacy format (3 parts) for backward compatibility
            let explanationType: string;
            let chapterNumber: number;
            let chapterId: number | undefined;

            if (customIdParts.length === 4) {
              // New format: book-chapter-type-chapter_id
              explanationType = customIdParts[customIdParts.length - 2];
              chapterNumber = Number.parseInt(
                customIdParts[customIdParts.length - 3],
              );
              chapterId = Number.parseInt(
                customIdParts[customIdParts.length - 1],
              );
              console.log(
                `[BATCH] Processing new format generate custom_id: ${parsedLine.custom_id}`,
              );
            } else if (customIdParts.length === 3) {
              // Legacy format: book-chapter-type
              explanationType = customIdParts[customIdParts.length - 1];
              chapterNumber = Number.parseInt(
                customIdParts[customIdParts.length - 2],
              );
              console.log(
                `[BATCH] Processing legacy format generate custom_id: ${parsedLine.custom_id}`,
              );
            } else {
              console.error(
                `[BATCH] Invalid generate custom_id format: ${parsedLine.custom_id}`,
              );
              errorCount++;
              continue;
            }

            const explanationContent = extractedText;

            let chapter: { chapter_id: number } | undefined;

            if (chapterId) {
              // Use direct chapter_id lookup for new format
              chapter = await this.db
                .getOrCreateConnection()
                .selectFrom("chapters")
                .where("chapter_id", "=", chapterId)
                .select("chapter_id")
                .executeTakeFirst();
            } else {
              // Fallback to book_id + chapter_number lookup for legacy format
              chapter = await this.db
                .getOrCreateConnection()
                .selectFrom("chapters")
                .where("book_id", "=", batchJob.book_id)
                .where("chapter_number", "=", chapterNumber)
                .select("chapter_id")
                .executeTakeFirst();
            }

            if (!chapter) {
              console.error(
                `[BATCH] Chapter not found: book ${batchJob.book_id}, chapter ${chapterNumber}`,
              );
              errorCount++;
              continue;
            }

            const newExplanation = {
              type: explanationType as any,
              explanation: explanationContent,
              chapter_id: chapter.chapter_id,
              language_code: version.language_code,
              version: 1, // Start with version 1
              is_active: true,
            };

            await this.db
              .getOrCreateConnection()
              .insertInto("explanations")
              .values(newExplanation)
              .onConflict((oc) =>
                oc
                  .columns(["chapter_id", "type", "language_code", "version"])
                  .doUpdateSet({
                    explanation: explanationContent,
                    is_active: true, // Ensure it's active on update
                  }),
              )
              .execute();

            processedCount++;
            console.log(`[BATCH] Saved explanation: ${parsedLine.custom_id}`);

            // Collect for auto-translation if it's the source language (usually English)
            if (version.language_code === "en" && batchJob.book_id) {
              successfulExplanations.push({
                bookId: batchJob.book_id,
                chapterNumber,
                type: explanationType,
              });
            }
          } else {
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
      console.log(`[BATCH] Calculated cost: ${actualCost.toFixed(4)}`);

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

      // Trigger auto-translations if we have successful source explanations
      if (successfulExplanations.length > 0) {
        console.log(
          `[BATCH] Triggering auto-translations for ${successfulExplanations.length} new source explanations.`,
        );
        // We'll implement triggerAutoTranslations as a separate method
        // For efficiency, we group them by book and type to minimize batches
        await this.triggerAutoTranslations(
          successfulExplanations,
          batchJob.model,
          batchJob.created_by,
          batchJob.max_output_tokens || DEFAULT_MAX_OUTPUT_TOKENS,
        );
      }
    } catch (error) {
      console.error(
        `[BATCH] Error processing output file for batch ${batchId}`,
        error,
      );
    }
  }

  private async processRephraseOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
    const fileContent = await openai.files.content(outputFileId);
    const jsonData =
      typeof (fileContent as any).text === "function"
        ? await (fileContent as any).text()
        : typeof (fileContent as any).arrayBuffer === "function"
          ? new TextDecoder().decode(await (fileContent as any).arrayBuffer())
          : String(fileContent);
    const lines = jsonData
      .split("\n")
      .filter((line: string) => line.trim() !== "");

    let processedCount = 0;
    let errorCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for (const line of lines) {
      let customId = "unknown";
      try {
        const parsedLine = JSON.parse(line);
        customId = parsedLine.custom_id || "unknown";
        console.log(`[BATCH] Processing line with custom_id: ${customId}`);

        if (parsedLine.response?.body?.usage) {
          totalPromptTokens += parsedLine.response.body.usage.input_tokens || 0;
          totalCompletionTokens +=
            parsedLine.response.body.usage.output_tokens || 0;
        }

        const responseBody = parsedLine.response?.body;

        let extractedText: string | undefined;
        if (responseBody?.output && Array.isArray(responseBody.output)) {
          for (const item of responseBody.output) {
            if (
              item.content &&
              Array.isArray(item.content) &&
              typeof item.content[0]?.text === "string"
            ) {
              extractedText = item.content[0].text;
              break; // Stop searching once we find the first valid text
            }
          }
        }

        // Fallback for the old format, just in case
        if (!extractedText) {
          extractedText = responseBody?.output_text;
        }

        if (
          parsedLine.custom_id?.startsWith("rephrase|") &&
          parsedLine.response?.status_code === 200 &&
          typeof extractedText === "string" &&
          extractedText.length > 0
        ) {
          const parts = parsedLine.custom_id.split("|");

          // Handle both new format (6 parts) and legacy format (5 parts) for backward compatibility
          let bookName: string;
          let chapterNumberStr: string;
          let explanationType: string;
          let bibleVersion: string;

          if (parts.length === 6) {
            // New format: rephrase|book|chapter|type|version|explanation_id
            [, bookName, chapterNumberStr, explanationType, bibleVersion] =
              parts;
            console.log(
              `[BATCH] Processing new format rephrase custom_id: ${parsedLine.custom_id}`,
            );
          } else if (parts.length === 5) {
            // Legacy format: rephrase|book|chapter|type|version
            [, bookName, chapterNumberStr, explanationType, bibleVersion] =
              parts;
            console.log(
              `[BATCH] Processing legacy format rephrase custom_id: ${parsedLine.custom_id}`,
            );
          } else {
            console.error(
              `[BATCH] Invalid rephrase custom_id format: ${parsedLine.custom_id}`,
            );
            errorCount++;
            continue;
          }

          const chapterNumber = Number(chapterNumberStr);

          const version = await this.db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .where("version_key", "=", bibleVersion)
            .select("language_code")
            .executeTakeFirst();

          if (!version) {
            errorCount++;
            console.error(
              `[BATCH] Bible version not found for rephrase: ${bibleVersion}`,
            );
            continue;
          }

          const book = await this.db
            .getOrCreateConnection()
            .selectFrom("books")
            .where("name", "=", bookName)
            .select("book_id")
            .executeTakeFirst();

          if (!book) {
            errorCount++;
            console.error(`[BATCH] Book not found for rephrase: ${bookName}`);
            continue;
          }

          const chapter = await this.db
            .getOrCreateConnection()
            .selectFrom("chapters")
            .where("book_id", "=", book.book_id)
            .where("chapter_number", "=", chapterNumber)
            .select("chapter_id")
            .executeTakeFirst();

          if (!chapter) {
            errorCount++;
            console.error(
              `[BATCH] Chapter not found for rephrase: ${bookName} ${chapterNumber}`,
            );
            continue;
          }

          // Find the most recent version of the explanation to rephrase
          const originalExplanation = await this.db
            .getOrCreateConnection()
            .selectFrom("explanations")
            .where("chapter_id", "=", chapter.chapter_id)
            .where("type", "=", explanationType as any)
            .where("language_code", "=", version.language_code)
            .orderBy("version", "desc")
            .selectAll()
            .executeTakeFirst();

          if (originalExplanation) {
            const originalExplanationId = originalExplanation.explanation_id;
            await this.db
              .getOrCreateConnection()
              .transaction()
              .execute(async (trx) => {
                // Deactivate all existing versions of this explanation
                await trx
                  .updateTable("explanations")
                  .set({ is_active: false })
                  .where("chapter_id", "=", chapter.chapter_id)
                  .where("type", "=", explanationType as any)
                  .where("language_code", "=", version.language_code)
                  .execute();

                // Insert the new, active version
                await trx
                  .insertInto("explanations")
                  .values({
                    type: originalExplanation.type,
                    explanation: extractedText,
                    chapter_id: originalExplanation.chapter_id,
                    language_code: originalExplanation.language_code,
                    version: originalExplanation.version + 1,
                    is_active: true,
                    created_by_admin: false,
                    parent_explanation_id: originalExplanationId,
                    created_at: new Date(),
                  })
                  .execute();
              });
            processedCount++;
          } else {
            errorCount++;
            console.error(
              `[BATCH] Original explanation not found for rephrase: ${bookName} ${chapterNumber} ${explanationType}`,
            );
          }
        } else if (parsedLine.custom_id?.startsWith("rephrase-")) {
          // Legacy support for old rephrase batches
          const originalExplanationId = Number.parseInt(
            parsedLine.custom_id.replace("rephrase-", ""),
          );

          const originalExplanation = await this.db
            .getOrCreateConnection()
            .selectFrom("explanations")
            .where("explanation_id", "=", originalExplanationId)
            .orderBy("version", "desc")
            .selectAll()
            .executeTakeFirst();

          if (originalExplanation) {
            await this.db
              .getOrCreateConnection()
              .transaction()
              .execute(async (trx) => {
                await trx
                  .updateTable("explanations")
                  .set({ is_active: false })
                  .where("explanation_id", "=", originalExplanationId)
                  .execute();

                await trx
                  .insertInto("explanations")
                  .values({
                    type: originalExplanation.type,
                    explanation: extractedText ?? "",
                    chapter_id: originalExplanation.chapter_id,
                    language_code: originalExplanation.language_code,
                    version: originalExplanation.version + 1,
                    is_active: true,
                    created_by_admin: false,
                    parent_explanation_id: originalExplanationId,
                    created_at: new Date(),
                  })
                  .execute();
              });
            processedCount++;
          } else {
            errorCount++;
            console.error(
              `[BATCH] SILENT FAILURE: Original explanation not found for ID: ${originalExplanationId}. This is likely the cause of the error.`,
            );
          }
        } else {
          errorCount++;
          console.error(
            `[BATCH] Failed to process rephrase line for custom_id: ${
              parsedLine.custom_id
            }. Response:`,
            JSON.stringify(parsedLine.response, null, 2),
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `[BATCH] Error processing rephrase line for custom_id: ${customId}:`,
          error,
        );
      }
    }

    const actualCost = await calculateActualCost(
      totalPromptTokens,
      totalCompletionTokens,
      batchJob.model,
    );

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
      `[BATCH] Rephrase batch ${batchId} processed: ${processedCount} saved, ${errorCount} errors. Cost: ${actualCost.toFixed(4)}`,
    );
  }

  private async processTranslateOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: {
      model: string;
      bible_version?: string;
      book_id?: number | null;
    },
  ) {
    const fileContent = await openai.files.content(outputFileId);
    const jsonData =
      typeof (fileContent as any).text === "function"
        ? await (fileContent as any).text()
        : typeof (fileContent as any).arrayBuffer === "function"
          ? new TextDecoder().decode(await (fileContent as any).arrayBuffer())
          : String(fileContent);
    const lines = jsonData
      .split("\n")
      .filter((line: string) => line.trim() !== "");

    let processedCount = 0;
    let errorCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const connection = this.db.getOrCreateConnection();

    for (const line of lines) {
      let customId = "unknown";
      try {
        const parsedLine = JSON.parse(line);
        customId = parsedLine.custom_id || "unknown";

        if (parsedLine.response?.body?.usage) {
          totalPromptTokens += parsedLine.response.body.usage.input_tokens || 0;
          totalCompletionTokens +=
            parsedLine.response.body.usage.output_tokens || 0;
        }

        const responseBody = parsedLine.response?.body;
        let extractedText: string | undefined;
        if (responseBody?.output && Array.isArray(responseBody.output)) {
          for (const item of responseBody.output) {
            if (
              item.content &&
              Array.isArray(item.content) &&
              typeof item.content[0]?.text === "string"
            ) {
              extractedText = item.content[0].text;
              break; // Stop searching once we find the first valid text
            }
          }
        }

        // Fallback for the old format, just in case
        if (!extractedText) {
          extractedText = responseBody?.output_text;
        }

        if (
          parsedLine.custom_id?.startsWith("translate|") &&
          parsedLine.response?.status_code === 200 &&
          typeof extractedText === "string" &&
          extractedText.length > 0
        ) {
          const parts = parsedLine.custom_id.split("|");

          // Handle both new format (6 parts) and legacy format (5 parts) for backward compatibility
          let bookName: string;
          let chapterNumberStr: string;
          let explanationType: string;
          let bibleVersion: string;

          if (parts.length === 6) {
            // New format: translate|book|chapter|type|version|explanation_id
            [, bookName, chapterNumberStr, explanationType, bibleVersion] =
              parts;
            console.log(
              `[BATCH] Processing new format translate custom_id: ${parsedLine.custom_id}`,
            );
          } else if (parts.length === 5) {
            // Legacy format: translate|book|chapter|type|version
            [, bookName, chapterNumberStr, explanationType, bibleVersion] =
              parts;
            console.log(
              `[BATCH] Processing legacy format translate custom_id: ${parsedLine.custom_id}`,
            );
          } else {
            console.error(
              `[BATCH] Invalid translate custom_id format: ${parsedLine.custom_id}`,
            );
            errorCount++;
            continue;
          }

          const chapterNumber = Number(chapterNumberStr);

          if (!bibleVersion) {
            errorCount++;
            console.error(
              `[BATCH] Bible version (language code) is missing in custom_id: ${parsedLine.custom_id}`,
            );
            continue;
          }

          const book = await connection
            .selectFrom("books")
            .where("name", "=", bookName)
            .select("book_id")
            .executeTakeFirst();

          if (!book) {
            errorCount++;
            console.error(`[BATCH] Book not found for translate: ${bookName}`);
            continue;
          }

          const chapter = await connection
            .selectFrom("chapters")
            .where("book_id", "=", book.book_id)
            .where("chapter_number", "=", chapterNumber)
            .select("chapter_id")
            .executeTakeFirst();

          if (!chapter) {
            errorCount++;
            console.error(
              `[BATCH] Chapter not found for translate: ${bookName} ${chapterNumber}`,
            );
            continue;
          }

          // Find the most recent version of this specific explanation
          const existingExplanation = await connection
            .selectFrom("explanations")
            .where("chapter_id", "=", chapter.chapter_id)
            .where("type", "=", explanationType as any)
            .where("language_code", "=", bibleVersion)
            .orderBy("version", "desc")
            .selectAll()
            .executeTakeFirst();

          const nextVersion = existingExplanation
            ? existingExplanation.version + 1
            : 1;
          const parentExplanationId =
            existingExplanation?.explanation_id || null;

          console.log(
            `[BATCH] Processing translation for ${bookName} ${chapterNumber} ${explanationType}, version: ${nextVersion}`,
          );

          await connection.transaction().execute(async (trx) => {
            // Deactivate all existing versions of this specific explanation
            await trx
              .updateTable("explanations")
              .set({ is_active: false })
              .where("chapter_id", "=", chapter.chapter_id)
              .where("type", "=", explanationType as any)
              .where("language_code", "=", bibleVersion)
              .execute();

            // Insert the new, active version with proper parent tracking
            await trx
              .insertInto("explanations")
              .values({
                type: explanationType as any,
                explanation: extractedText,
                chapter_id: chapter.chapter_id,
                language_code: bibleVersion,
                version: nextVersion,
                is_active: true,
                created_by_admin: false,
                parent_explanation_id: parentExplanationId,
                created_at: new Date(),
              })
              .execute();
          });
          processedCount++;
        } else {
          errorCount++;
          console.error(
            `[BATCH] Failed to process translate line for custom_id: ${
              parsedLine.custom_id
            }. Response:`,
            JSON.stringify(parsedLine.response, null, 2),
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `[BATCH] Error processing translate line for custom_id: ${customId}:`,
          error,
        );
      }
    }

    const actualCost = await calculateActualCost(
      totalPromptTokens,
      totalCompletionTokens,
      batchJob.model,
    );

    await connection
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
      `[BATCH] Translate batch ${batchId} processed: ${processedCount} saved, ${errorCount} errors. Cost: ${actualCost.toFixed(4)}`,
    );
  }

  private async processTopicDiscoveryOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
    console.log(
      `[BATCH_TOPIC_DISCOVERY] Processing output file for batch ${batchId}`,
    );

    try {
      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      let processedCount = 0;
      let errorCount = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.response?.body?.usage) {
            totalPromptTokens += data.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              data.response.body.usage.output_tokens || 0;
          }

          const content = data.response.body.output[1].content[0].text;
          const topics = JSON.parse(content);

          if (Array.isArray(topics)) {
            for (const topic of topics) {
              await this.db
                .getOrCreateConnection()
                .insertInto("topics")
                .values({
                  name: topic.name,
                  description: topic.description,
                  category: topic.category,
                  // Generate slug since it's now a required field and not explicitly passed
                  slug: generateTopicSlug(topic.name),
                })
                .execute();
              processedCount++;
            }
          }
        } catch (error) {
          console.error(
            `[BATCH] Error processing line for topic discovery batch ${batchId}:`,
            error,
          );
          errorCount++;
        }
      }

      const actualCost = await calculateActualCost(
        totalPromptTokens,
        totalCompletionTokens,
        batchJob.model,
      );

      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({
          explanations_processed: true,
          status: errorCount > 0 ? "partial_failure" : "completed",
          actual_cost: actualCost,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        })
        .where("openai_batch_id", "=", batchId)
        .execute();

      console.log(
        `[BATCH] Processed ${processedCount} topics for batch ${batchId}. Errors: ${errorCount}. Cost: $${actualCost.toFixed(4)}`,
      );
    } catch (error) {
      console.error(
        `[BATCH_TOPIC_DISCOVERY] Error processing output file for batch ${batchId}:`,
        error,
      );
      throw error;
    }
  }

  private async processTopicReferencesOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
    console.log(
      `[BATCH_TOPIC_REFERENCES] Processing output file for batch ${batchId}`,
    );

    try {
      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      let processedCount = 0;
      let errorCount = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      const connection = this.db.getOrCreateConnection();

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.response?.body?.usage) {
            totalPromptTokens += data.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              data.response.body.usage.output_tokens || 0;
          }

          const content = data.response.body.output[1].content[0].text;
          const customId = data.custom_id;

          if (content && customId) {
            try {
              // custom_id format: topic-references-{topicId}-{timestamp}
              let topicId: string;
              const prefix = "topic-references-";

              if (customId.startsWith(prefix)) {
                const remainder = customId.slice(prefix.length);
                // Check for timestamp suffix: -1234567890123
                const timestampMatch = remainder.match(/-(\d{13})$/);
                if (timestampMatch) {
                  // Remove the timestamp part (length of digits + 1 for hyphen)
                  topicId = remainder.slice(0, -timestampMatch[0].length);
                } else {
                  topicId = remainder; // Legacy format (no timestamp)
                }
              } else {
                console.warn(
                  `[BATCH_TOPIC_REFERENCES] Invalid custom_id prefix: ${customId}`,
                );
                errorCount++;
                continue;
              }

              // Verify topic exists
              const topic = await connection
                .selectFrom("topics")
                .where("topic_id", "=", topicId)
                .select("topic_id")
                .executeTakeFirst();

              if (!topic) {
                console.error(
                  `[BATCH_TOPIC_REFERENCES] Topic not found for ID: ${topicId}`,
                );
                errorCount++;
                continue;
              }

              await connection.transaction().execute(async (trx) => {
                // 1. Get max version AND lock the rows to prevent race conditions if running parallel
                const existingReference = await trx
                  .selectFrom("topic_references")
                  .where("topic_id", "=", topicId)
                  .orderBy("version", "desc")
                  .select("version")
                  .executeTakeFirst();

                const nextVersion = existingReference
                  ? existingReference.version + 1
                  : 1;

                // 2. Deactivate ANY existing active references
                await trx
                  .updateTable("topic_references")
                  .set({ is_active: false })
                  .where("topic_id", "=", topicId)
                  .where("is_active", "=", true)
                  .execute();

                // 3. Insert new active reference
                await trx
                  .insertInto("topic_references")
                  .values({
                    topic_id: topicId,
                    content: content,
                    version: nextVersion,
                    is_active: true,
                    created_by_admin: false,
                  })
                  .execute();
              });

              processedCount++;
            } catch (dbError: any) {
              errorCount++;
              // Check specifically for unique constraint violation on active index
              if (
                dbError.code === "23505" &&
                dbError.constraint === "unique_active_topic_reference"
              ) {
                console.warn(
                  `[BATCH_TOPIC_REFERENCES] Race condition detected for topic ${customId}, skipping duplicate.`,
                );
              } else {
                console.error(
                  `[BATCH_TOPIC_REFERENCES] Database error for topic in batch ${batchId}:`,
                  dbError,
                );
              }
            }
          } else {
            errorCount++;
            console.warn(
              `[BATCH_TOPIC_REFERENCES] Missing output text or custom ID in line for batch ${batchId}`,
            );
          }
        } catch (lineError) {
          errorCount++;
          console.error(
            `[BATCH_TOPIC_REFERENCES] Error processing line in batch ${batchId}:`,
            lineError,
          );
        }
      }

      const actualCost = await calculateActualCost(
        totalPromptTokens,
        totalCompletionTokens,
        batchJob.model,
      );

      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({
          explanations_processed: true,
          status: errorCount > 0 ? "partial_failure" : "completed",
          actual_cost: actualCost,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        })
        .where("openai_batch_id", "=", batchId)
        .execute();

      console.log(
        `[BATCH_TOPIC_REFERENCES] Batch ${batchId} completed: ${processedCount} references added, ${errorCount} errors. Cost: $${actualCost.toFixed(4)}`,
      );
    } catch (error) {
      console.error(
        `[BATCH_TOPIC_REFERENCES] Error processing output file for batch ${batchId}:`,
        error,
      );
      throw error;
    }
  }

  private async processTopicExplanationsOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
    console.log(
      `[BATCH_TOPIC_EXPLANATIONS] Processing output file for batch ${batchId}`,
    );

    try {
      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      let processedCount = 0;
      let errorCount = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.response?.body?.usage) {
            totalPromptTokens += data.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              data.response.body.usage.output_tokens || 0;
          }

          const content = data.response.body.output[1].content[0].text;
          const customId = data.custom_id;

          if (content && customId) {
            try {
              // Parse custom ID to extract topic_id, explanation_type, and language_code
              const parts = customId.split("-");
              if (parts.length >= 9) {
                const topicId = `${parts[2]}-${parts[3]}-${parts[4]}-${parts[5]}-${parts[6]}`;
                const explanationType = parts[7];
                const timestampIndex = parts.length - 1;
                const languageCode = parts.slice(8, timestampIndex).join("-");

                console.log(
                  `[BATCH_TOPIC_EXPLANATIONS] Parsing custom ID: ${customId}`,
                );
                console.log(
                  `[BATCH_TOPIC_EXPLANATIONS] Extracted topicId: ${topicId}`,
                );
                console.log(
                  `[BATCH_TOPIC_EXPLANATIONS] Extracted explanationType: ${explanationType}`,
                );
                console.log(
                  `[BATCH_TOPIC_EXPLANATIONS] Extracted languageCode: ${languageCode}`,
                );

                await this.db
                  .getOrCreateConnection()
                  .insertInto("topic_explanations")
                  .values({
                    topic_id: topicId,
                    type: explanationType,
                    explanation: content,
                    language_code: languageCode,
                    is_active: true,
                    default: false,
                    version: 1,
                  })
                  .onConflict((oc) =>
                    oc
                      .columns(["topic_id", "language_code", "type"])
                      .doUpdateSet({
                        explanation: content,
                        is_active: true,
                        default: false,
                        updated_at: new Date(),
                      }),
                  )
                  .execute();

                processedCount++;
              } else {
                errorCount++;
                console.warn(
                  `[BATCH_TOPIC_EXPLANATIONS] Invalid custom ID format in batch ${batchId}: ${customId}`,
                );
              }
            } catch (dbError) {
              errorCount++;
              console.error(
                `[BATCH_TOPIC_EXPLANATIONS] Database error for explanation in batch ${batchId}:`,
                dbError,
              );
            }
          } else {
            errorCount++;
            console.warn(
              `[BATCH_TOPIC_EXPLANATIONS] Missing output text or custom ID in line for batch ${batchId}`,
            );
          }
        } catch (lineError) {
          errorCount++;
          console.error(
            `[BATCH_TOPIC_EXPLANATIONS] Error processing line in batch ${batchId}:`,
            lineError,
          );
        }
      }

      const actualCost = await calculateActualCost(
        totalPromptTokens,
        totalCompletionTokens,
        batchJob.model,
      );

      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({
          explanations_processed: true,
          status: errorCount > 0 ? "partial_failure" : "completed",
          actual_cost: actualCost,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        })
        .where("openai_batch_id", "=", batchId)
        .execute();

      console.log(
        `[BATCH_TOPIC_EXPLANATIONS] Batch ${batchId} completed: ${processedCount} explanations added, ${errorCount} errors. Cost: $${actualCost.toFixed(4)}`,
      );
    } catch (error) {
      console.error(
        `[BATCH_TOPIC_EXPLANATIONS] Error processing output file for batch ${batchId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process topic name translation output file
   */
  private async processTopicNameTranslateOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
    console.log(
      `[BATCH] Processing topic name translation output for batch ${batchId}`,
    );

    const fileContent = await openai.files.content(outputFileId);
    const jsonData =
      typeof (fileContent as any).text === "function"
        ? await (fileContent as any).text()
        : typeof (fileContent as any).arrayBuffer === "function"
          ? new TextDecoder().decode(await (fileContent as any).arrayBuffer())
          : String(fileContent);
    const lines = jsonData
      .split("\n")
      .filter((line: string) => line.trim() !== "");

    let processedCount = 0;
    let errorCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const connection = this.db.getOrCreateConnection();

    for (const line of lines) {
      let customId = "unknown";
      try {
        const parsedLine = JSON.parse(line);
        customId = parsedLine.custom_id || "unknown";

        if (parsedLine.response?.body?.usage) {
          totalPromptTokens += parsedLine.response.body.usage.input_tokens || 0;
          totalCompletionTokens +=
            parsedLine.response.body.usage.output_tokens || 0;
        }

        const responseBody = parsedLine.response?.body;
        let extractedText: string | undefined;

        if (responseBody?.output && Array.isArray(responseBody.output)) {
          for (const item of responseBody.output) {
            // Check for message type with content array
            if (
              item.type === "message" &&
              item.content &&
              Array.isArray(item.content)
            ) {
              for (const contentItem of item.content) {
                if (
                  contentItem.type === "output_text" &&
                  typeof contentItem.text === "string"
                ) {
                  extractedText = contentItem.text;
                  break;
                }
              }
              if (extractedText) break;
            }
            // Legacy format: direct content array
            else if (
              item.content &&
              Array.isArray(item.content) &&
              typeof item.content[0]?.text === "string"
            ) {
              extractedText = item.content[0].text;
              break;
            }
          }
        }

        if (!extractedText) {
          extractedText = responseBody?.output_text;
        }

        if (
          parsedLine.custom_id?.startsWith("translate-topic-name|") &&
          parsedLine.response?.status_code === 200 &&
          typeof extractedText === "string" &&
          extractedText.length > 0
        ) {
          // Parse custom_id: translate-topic-name|{topic_id}|{target_lang}
          const parts = parsedLine.custom_id.split("|");

          if (parts.length !== 3) {
            console.error(
              `[BATCH] Invalid custom_id format: ${parsedLine.custom_id}`,
            );
            errorCount++;
            continue;
          }

          const [, topicId, targetLanguage] = parts;

          // Parse AI response - expect format:
          // Name: {translated name}
          // Description: {translated description}
          let translatedName: string | null = null;
          let translatedDescription: string | null = null;

          // Try JSON first
          try {
            const asJson = JSON.parse(extractedText);
            if (asJson && typeof asJson === "object") {
              if (typeof asJson.name === "string")
                translatedName = asJson.name.trim();
              if (typeof asJson.description === "string")
                translatedDescription = asJson.description.trim();
            }
          } catch {}

          // Fallback to "Name:" / "Description:" format
          if (!translatedName) {
            const nameMatch = extractedText.match(
              /^\s*Name\s*:\s*(.+?)\s*(?:\r?\n|$)/i,
            );
            const descMatch = extractedText.match(
              /^\s*Description\s*:\s*([\s\S]*?)$/im,
            );
            translatedName = nameMatch?.[1]?.trim() || null;
            translatedDescription =
              descMatch?.[1]?.trim() || translatedDescription;
          }

          // Final fallback: first line as name, rest as description
          if (!translatedName) {
            const [first, ...rest] = extractedText
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (first) {
              translatedName = first;
              translatedDescription = rest.length
                ? rest.join("\n")
                : translatedDescription;
            }
          }

          if (!translatedName) {
            console.error(
              `[BATCH] Could not extract translated name from response for ${customId}`,
            );
            errorCount++;
            continue;
          }

          // Insert/update translation
          await connection
            .insertInto("topic_translations")
            .values({
              topic_id: topicId,
              language_code: targetLanguage,
              translated_name: translatedName,
              translated_description: translatedDescription,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .onConflict((oc) =>
              oc.columns(["topic_id", "language_code"]).doUpdateSet({
                translated_name: translatedName,
                translated_description: translatedDescription,
                updated_at: new Date(),
              }),
            )
            .execute();

          processedCount++;
          console.log(
            `[BATCH] Saved translation for topic ${topicId}: ${translatedName}`,
          );
        } else {
          errorCount++;
          console.error(
            `[BATCH] Failed to process line for custom_id: ${customId}`,
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `[BATCH] Error processing line for custom_id: ${customId}:`,
          error,
        );
      }
    }

    const actualCost = await calculateActualCost(
      totalPromptTokens,
      totalCompletionTokens,
      batchJob.model,
    );

    await connection
      .updateTable("batch_jobs")
      .set({
        explanations_processed: true,
        actual_cost: actualCost,
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens,
        status: errorCount > 0 ? "partial_failure" : "completed",
      })
      .where("openai_batch_id", "=", batchId)
      .execute();

    console.log(
      `[BATCH] Topic name translation batch ${batchId} processed: ${processedCount} saved, ${errorCount} errors. Cost: $${actualCost.toFixed(4)}`,
    );
  }

  /**
   * Process topic explanation translation output file
   */
  private async processTopicExplanationTranslateOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
    console.log(
      `[BATCH] Processing topic explanation translation output for batch ${batchId}`,
    );

    const fileContent = await openai.files.content(outputFileId);
    const jsonData =
      typeof (fileContent as any).text === "function"
        ? await (fileContent as any).text()
        : typeof (fileContent as any).arrayBuffer === "function"
          ? new TextDecoder().decode(await (fileContent as any).arrayBuffer())
          : String(fileContent);
    const lines = jsonData
      .split("\n")
      .filter((line: string) => line.trim() !== "");

    let processedCount = 0;
    let errorCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const connection = this.db.getOrCreateConnection();

    for (const line of lines) {
      let customId = "unknown";
      try {
        const parsedLine = JSON.parse(line);
        customId = parsedLine.custom_id || "unknown";

        if (parsedLine.response?.body?.usage) {
          totalPromptTokens += parsedLine.response.body.usage.input_tokens || 0;
          totalCompletionTokens +=
            parsedLine.response.body.usage.output_tokens || 0;
        }

        const responseBody = parsedLine.response?.body;
        let extractedText: string | undefined;

        if (responseBody?.output && Array.isArray(responseBody.output)) {
          for (const item of responseBody.output) {
            // Check for message type with content array
            if (
              item.type === "message" &&
              item.content &&
              Array.isArray(item.content)
            ) {
              for (const contentItem of item.content) {
                if (
                  contentItem.type === "output_text" &&
                  typeof contentItem.text === "string"
                ) {
                  extractedText = contentItem.text;
                  break;
                }
              }
              if (extractedText) break;
            }
            // Legacy format: direct content array
            else if (
              item.content &&
              Array.isArray(item.content) &&
              typeof item.content[0]?.text === "string"
            ) {
              extractedText = item.content[0].text;
              break;
            }
          }
        }

        if (!extractedText) {
          extractedText = responseBody?.output_text;
        }

        if (
          parsedLine.custom_id?.startsWith("translate-topic|") &&
          parsedLine.response?.status_code === 200 &&
          typeof extractedText === "string" &&
          extractedText.length > 0
        ) {
          // Parse custom_id: translate-topic|{topic_id}|{type}|{target_lang}|{explanation_id}
          const parts = parsedLine.custom_id.split("|");

          if (parts.length !== 5) {
            console.error(
              `[BATCH] Invalid custom_id format: ${parsedLine.custom_id}`,
            );
            errorCount++;
            continue;
          }

          const [
            ,
            topicId,
            explanationType,
            targetLanguage,
            sourceExplanationId,
          ] = parts;

          // Find topic by ID
          const topic = await connection
            .selectFrom("topics")
            .where("topic_id", "=", topicId)
            .select("topic_id")
            .executeTakeFirst();

          if (!topic) {
            console.error(`[BATCH] Topic not found: ${topicId}`);
            errorCount++;
            continue;
          }

          // Find existing explanation in target language
          const existingExplanation = await connection
            .selectFrom("topic_explanations")
            .where("topic_id", "=", topic.topic_id)
            .where("type", "=", explanationType)
            .where("language_code", "=", targetLanguage)
            .orderBy("version", "desc")
            .selectAll()
            .executeTakeFirst();

          const nextVersion = existingExplanation
            ? (existingExplanation.version || 0) + 1
            : 1;

          // Get source explanation for parent tracking
          const sourceExplanation = await connection
            .selectFrom("topic_explanations")
            .where("explanation_id", "=", sourceExplanationId)
            .select("explanation_id")
            .executeTakeFirst();

          const parentExplanationId = sourceExplanation?.explanation_id || null;

          console.log(
            `[BATCH] Processing translation for topic ${topicId}, type ${explanationType}, version: ${nextVersion}`,
          );

          // Use transaction to deactivate old and insert new
          await connection.transaction().execute(async (trx) => {
            // Deactivate existing translations
            await trx
              .updateTable("topic_explanations")
              .set({ is_active: false })
              .where("topic_id", "=", topic.topic_id)
              .where("type", "=", explanationType)
              .where("language_code", "=", targetLanguage)
              .execute();

            // Insert new translation
            await trx
              .insertInto("topic_explanations")
              .values({
                topic_id: topic.topic_id,
                type: explanationType,
                explanation: extractedText,
                language_code: targetLanguage,
                version: nextVersion,
                is_active: true,
                parent_explanation_id: parentExplanationId,
                created_at: new Date(),
                updated_at: new Date(),
              })
              .execute();
          });

          processedCount++;
          console.log(
            `[BATCH] Saved translation for ${topicId} - ${explanationType}`,
          );
        } else {
          errorCount++;
          console.error(
            `[BATCH] Failed to process line for custom_id: ${customId}`,
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `[BATCH] Error processing line for custom_id: ${customId}:`,
          error,
        );
      }
    }

    const actualCost = await calculateActualCost(
      totalPromptTokens,
      totalCompletionTokens,
      batchJob.model,
    );

    await connection
      .updateTable("batch_jobs")
      .set({
        explanations_processed: true,
        actual_cost: actualCost,
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens,
        status: errorCount > 0 ? "partial_failure" : "completed",
      })
      .where("openai_batch_id", "=", batchId)
      .execute();

    console.log(
      `[BATCH] Topic explanation translation batch ${batchId} processed: ${processedCount} saved, ${errorCount} errors. Cost: $${actualCost.toFixed(4)}`,
    );
  }

  private async processAutoHighlightOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string; book_id: number | null },
  ) {
    try {
      const connection = this.db.getOrCreateConnection();

      // Parse custom_id to get book name: "auto-highlight-Genesis-1234567890"
      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      if (lines.length === 0) {
        console.warn(
          `[BATCH] No lines found in output file for batch ${batchId}`,
        );
        return;
      }

      let bookRecord: { book_id: number } | undefined;

      // Prefer DB book_id; if absent, try to parse from custom_id in output lines
      let resolvedBookId: number | null = batchJob.book_id ?? null;

      if (!resolvedBookId) {
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const customId = obj?.custom_id;
            if (typeof customId === "string") {
              // Parse: auto-highlight-{book_id}-{bookName}-{timestamp}
              const match = customId.match(/^auto-highlight-(\d+)-/);
              if (match) {
                const bookId = Number.parseInt(match[1], 10);
                if (Number.isFinite(bookId)) {
                  resolvedBookId = bookId;
                  break;
                }
              }
            }
          } catch {
            // skip invalid lines
          }
        }
      }

      if (resolvedBookId) {
        bookRecord = await connection
          .selectFrom("books")
          .where("book_id", "=", resolvedBookId)
          .select("book_id")
          .executeTakeFirst();
      }

      if (!bookRecord) {
        console.error(`[BATCH] Could not resolve book_id for batch ${batchId}`);
        return;
      }

      // Import services
      const { BibleRepository } = await import(
        "../../bible/repository/bible.repository"
      );
      const { AutoHighlightService } = await import(
        "../../bible/services/auto-highlight.service"
      );
      const { AutoHighlightRepository } = await import(
        "../../bible/repository/auto-highlight.repository"
      );

      const bibleRepository = new BibleRepository(this.db);
      const autoHighlightService = new AutoHighlightService(
        this.db,
        bibleRepository,
      );
      const autoHighlightRepo = new AutoHighlightRepository(this.db);

      // Delete existing auto-highlights for this book (regenerating)
      await autoHighlightRepo.deleteHighlightsByBook(bookRecord.book_id);

      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      // Process all lines to get AI content and calculate tokens
      let processedContent = false;
      for (const line of lines) {
        let response: any;
        try {
          response = JSON.parse(line);
        } catch (e) {
          console.warn(
            `[BATCH] Skipping invalid JSON line for batch ${batchId}:`,
            e,
          );
          continue;
        }

        if (response?.response?.body?.usage) {
          totalPromptTokens += response.response.body.usage.input_tokens || 0;
          totalCompletionTokens +=
            response.response.body.usage.output_tokens || 0;
        }

        // Only process the AI content from the first successful response
        if (!processedContent && response?.response?.status_code === 200) {
          const body = response.response.body as any;

          let aiContent: string | undefined;

          if (typeof body?.output_text === "string") {
            aiContent = body.output_text;
          } else if (Array.isArray(body?.output)) {
            for (const item of body.output) {
              const text = item?.content?.[0]?.text;
              if (typeof text === "string" && text.trim()) {
                aiContent = text;
                break;
              }
            }
          }

          if (aiContent) {
            const highlightCount = await autoHighlightService.processAIResponse(
              bookRecord.book_id,
              aiContent,
            );

            console.log(
              `[BATCH] Processed ${highlightCount} auto-highlights for book_id=${bookRecord.book_id}`,
            );
            processedContent = true;
          } else {
            console.warn(
              `[BATCH] No AI content found in response for book_id=${bookRecord.book_id}`,
            );
          }
        }
      }

      const actualCost = await calculateActualCost(
        totalPromptTokens,
        totalCompletionTokens,
        batchJob.model,
      );

      await connection
        .updateTable("batch_jobs")
        .set({
          explanations_processed: true,
          actual_cost: actualCost,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        } as any)
        .where("openai_batch_id", "=", batchId)
        .execute();

      console.log(
        `[BATCH] Marked auto-highlight batch ${batchId} as processed with cost $${actualCost.toFixed(4)}`,
      );
    } catch (error) {
      console.error(
        `[BATCH] Error processing auto-highlight output file for batch ${batchId}:`,
        error,
      );
    }
  }

  private async triggerAutoTranslations(
    explanations: { bookId: number; chapterNumber: number; type: string }[],
    model: string,
    adminUserId: string,
    maxOutputTokens: number,
  ) {
    const connection = this.db.getOrCreateConnection();

    // 1. Get all target languages (active versions excluding source 'en')
    const targetVersions = await connection
      .selectFrom("bible_versions")
      .where("language_code", "!=", "en")
      .where("is_active", "=", true)
      .select(["version_key", "language_code"])
      .execute();

    if (targetVersions.length === 0) {
      console.log(
        "[BATCH_AUTO_TRANS] No target languages found for auto-translation.",
      );
      return;
    }

    // 2. Group explanations by book for easier processing
    const bookMap = new Map<number, typeof explanations>();
    for (const exp of explanations) {
      const list = bookMap.get(exp.bookId) || [];
      list.push(exp);
      bookMap.set(exp.bookId, list);
    }

    // 3. For each book and each target language, trigger a batch
    for (const [bookId, items] of bookMap.entries()) {
      const book = await connection
        .selectFrom("books")
        .where("book_id", "=", bookId)
        .select("name")
        .executeTakeFirst();

      if (!book) continue;

      const types = Array.from(new Set(items.map((i) => i.type)));

      for (const targetVersion of targetVersions) {
        console.log(
          `[BATCH_AUTO_TRANS] Triggering translation for ${book.name} to ${targetVersion.language_code}`,
        );
        try {
          await this.createBookTranslateBatch(
            model,
            adminUserId,
            "medium", // Default effort
            book.name,
            "en", // Source language
            targetVersion.language_code,
            types,
            false, // Don't skip existing, we want to update them
            undefined, // parentBatchId
            maxOutputTokens,
          );
        } catch (error) {
          console.error(
            `[BATCH_AUTO_TRANS] Failed to trigger auto-translation for ${book.name} (${targetVersion.language_code}):`,
            error,
          );
        }
      }
    }
  }

  /**
   * Validates custom ID uniqueness within a batch and ensures no collisions
   * @param batchRequests Array of batch requests to validate
   * @returns Object containing validation results and any duplicates found
   */
  private validateCustomIdUniqueness(batchRequests: BatchJobRequest[]): {
    isValid: boolean;
    duplicates: string[];
    summary: string;
  } {
    const customIdSet = new Set<string>();
    const duplicates: string[] = [];

    for (const request of batchRequests) {
      if (customIdSet.has(request.custom_id)) {
        duplicates.push(request.custom_id);
      } else {
        customIdSet.add(request.custom_id);
      }
    }

    const isValid = duplicates.length === 0;
    const summary = isValid
      ? `All ${batchRequests.length} custom IDs are unique`
      : `Found ${duplicates.length} duplicate custom IDs out of ${batchRequests.length} total`;

    console.log(`[BATCH] Custom ID validation: ${summary}`);
    if (!isValid) {
      console.error("[BATCH] Duplicate custom IDs found:", duplicates);
    }

    return { isValid, duplicates, summary };
  }

  /**
   * Enhanced error detection and reporting for batch processing failures
   * @param batchStatus OpenAI batch status response
   * @param batchId The batch ID for logging context
   * @returns Enhanced error details with duplicate detection
   */
  private async enhancedBatchErrorDetection(
    batchStatus: any,
    batchId: string,
  ): Promise<{
    hasDuplicateErrors: boolean;
    duplicateCustomIds: string[];
    errorSummary: string;
    totalErrors: number;
  }> {
    const result = {
      hasDuplicateErrors: false,
      duplicateCustomIds: [] as string[],
      errorSummary: "No errors detected",
      totalErrors: 0,
    };

    if (!batchStatus.errors?.data || batchStatus.errors.data.length === 0) {
      return result;
    }

    result.totalErrors = batchStatus.errors.data.length;
    const duplicateErrors = [];
    const otherErrors = [];

    for (const error of batchStatus.errors.data) {
      const errorMessage = error.message || "";

      // Detect duplicate custom_id errors
      if (
        errorMessage.toLowerCase().includes("duplicate") &&
        errorMessage.toLowerCase().includes("custom_id")
      ) {
        result.hasDuplicateErrors = true;
        duplicateErrors.push(error);

        // Try to extract the custom_id from the error message
        const customIdMatch = errorMessage.match(
          /custom_id["']?[:\s]*["']?([^"'\s,]+)/i,
        );
        if (customIdMatch) {
          result.duplicateCustomIds.push(customIdMatch[1]);
        }
      } else {
        otherErrors.push(error);
      }
    }

    // Create comprehensive error summary
    const summaryParts = [];
    if (duplicateErrors.length > 0) {
      summaryParts.push(`${duplicateErrors.length} duplicate custom_id errors`);
    }
    if (otherErrors.length > 0) {
      summaryParts.push(`${otherErrors.length} other errors`);
    }

    result.errorSummary = summaryParts.join(", ");

    // Enhanced logging
    console.error(
      `[BATCH] Enhanced error detection for batch ${batchId}: ${result.errorSummary}`,
    );

    if (result.hasDuplicateErrors) {
      console.error(
        `[BATCH] Duplicate custom_id errors detected in batch ${batchId}:`,
        {
          duplicateCustomIds: result.duplicateCustomIds,
          duplicateErrorDetails: duplicateErrors,
        },
      );
    }

    if (otherErrors.length > 0) {
      console.error(
        `[BATCH] Other errors in batch ${batchId}:`,
        otherErrors.slice(0, 5), // Log first 5 other errors to avoid spam
      );
    }

    return result;
  }

  /**
   * Generate batch for translating topic names
   */
  async generateTopicNameTranslationBatch(
    model: string,
    adminUserId: string,
    source_language_code: string,
    target_language_code: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "low",
    category?: string,
    topicId?: string,
  ) {
    console.log(
      `[BATCH] Creating topic name translation batch: ${source_language_code} -> ${target_language_code}`,
    );

    const connection = this.db.getOrCreateConnection();

    // Query topics to translate
    let query = connection.selectFrom("topics").where("is_active", "=", true);

    if (category) {
      query = query.where("category", "=", category);
    }

    if (topicId) {
      query = query.where("topic_id", "=", topicId);
    }

    const topics = await query
      .select(["topic_id", "name", "description"])
      .execute();

    console.log(`[BATCH] Found ${topics.length} topics to translate`);

    if (topics.length === 0) {
      throw new Error("No topics found to translate");
    }

    // Get topic-translate prompt
    const translatePrompt = await connection
      .selectFrom("prompts")
      .where("prompt_type", "=", "topic-translate")
      .where("status", "=", PromptStatusEnum.active)
      .select("prompt")
      .executeTakeFirst();

    if (!translatePrompt) {
      throw new Error("No active topic-translate prompt found");
    }

    const language = getLanguageName(target_language_code);
    const finalPrompt = translatePrompt.prompt.replace("{language}", language);

    let batchRequests: BatchJobRequest[] = [];

    if (skipExisting) {
      // Check existing translations
      const existingTranslations = await connection
        .selectFrom("topic_translations")
        .where("language_code", "=", target_language_code)
        .where("is_active", "=", true)
        .select("topic_id")
        .execute();

      const existingTopicIds = new Set(
        existingTranslations.map((t) => t.topic_id),
      );

      for (const topic of topics) {
        if (!existingTopicIds.has(topic.topic_id)) {
          batchRequests.push({
            custom_id: `translate-topic-name|${topic.topic_id}|${target_language_code}`,
            method: "POST",
            url: "/v1/responses",
            body: {
              model,
              reasoning: { effort },
              instructions: finalPrompt,
              input: `Name: ${topic.name}\nDescription: ${topic.description || ""}`,
              max_output_tokens: 5000,
            },
          });
        }
      }

      console.log(
        `[BATCH] After skipping existing, ${batchRequests.length} translations needed`,
      );
    } else {
      batchRequests = topics.map((topic) => ({
        custom_id: `translate-topic-name|${topic.topic_id}|${target_language_code}`,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          reasoning: { effort },
          instructions: finalPrompt,
          input: `Name: ${topic.name}\nDescription: ${topic.description || ""}`,
          max_output_tokens: 5000,
        },
      }));
    }

    if (batchRequests.length === 0) {
      console.log("[BATCH] No new topic names to translate. Skipping.");
      return;
    }

    // Validate custom ID uniqueness
    const validation = this.validateCustomIdUniqueness(batchRequests);
    if (!validation.isValid) {
      throw new Error(
        `Custom ID validation failed: ${validation.summary}. Duplicates: ${validation.duplicates.join(", ")}`,
      );
    }

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    // Check file size limit
    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit`,
      );
    }

    // Create OpenAI file
    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `translate_topic_names_${target_language_code}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    console.log(`[BATCH] Created OpenAI file: ${file.id}`);

    // Create OpenAI batch
    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    console.log(`[BATCH] Created OpenAI batch: ${batch.id}`);

    // Save to database
    await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-translate-names",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        topic_category: category || null,
        topic_id: topicId || null,
        source_language_code,
        target_language_code,
        bible_version: "N/A",
        explanation_types: [],
      })
      .execute();

    console.log("[BATCH] Saved batch job to database");

    // Add to monitoring queue
    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    console.log(`[BATCH] Added batch ${batch.id} to monitoring queue`);

    return batch;
  }

  /**
   * Generate batch for translating topic explanations
   */
  async generateTopicExplanationTranslationBatch(
    model: string,
    adminUserId: string,
    source_language_code: string,
    target_language_code: string,
    explanationTypes: string[] = ["summary", "byline", "detailed"],
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
    category?: string,
    topicId?: string,
  ) {
    console.log(
      `[BATCH] Creating topic explanation translation batch: ${source_language_code} -> ${target_language_code}`,
    );

    const connection = this.db.getOrCreateConnection();

    // Query topics
    let topicsQuery = connection
      .selectFrom("topics")
      .where("is_active", "=", true);

    if (category) {
      topicsQuery = topicsQuery.where("category", "=", category);
    }

    if (topicId) {
      topicsQuery = topicsQuery.where("topic_id", "=", topicId);
    }

    const topics = await topicsQuery.select(["topic_id", "name"]).execute();

    console.log(`[BATCH] Found ${topics.length} topics`);

    if (topics.length === 0) {
      throw new Error("No topics found to translate");
    }

    // Get source explanations
    const sourceExplanations = await connection
      .selectFrom("topic_explanations")
      .where("language_code", "=", source_language_code)
      .where("is_active", "=", true)
      .where(
        "topic_id",
        "in",
        topics.map((t) => t.topic_id),
      )
      .where("type", "in", explanationTypes as any)
      .select(["explanation_id", "topic_id", "type", "explanation"])
      .execute();

    console.log(
      `[BATCH] Found ${sourceExplanations.length} source explanations`,
    );

    if (sourceExplanations.length === 0) {
      throw new Error(
        `No source explanations found in ${source_language_code}`,
      );
    }

    // Get topic-translate prompt
    const translatePrompt = await connection
      .selectFrom("prompts")
      .where("prompt_type", "=", "topic-translate")
      .where("status", "=", PromptStatusEnum.active)
      .select("prompt")
      .executeTakeFirst();

    if (!translatePrompt) {
      throw new Error("No active topic-translate prompt found");
    }

    const language = getLanguageName(target_language_code);
    const finalPrompt = translatePrompt.prompt.replace("{language}", language);

    let batchRequests: BatchJobRequest[] = [];

    if (skipExisting) {
      // Get existing translations
      const existingTranslations = await connection
        .selectFrom("topic_explanations")
        .where("language_code", "=", target_language_code)
        .where("is_active", "=", true)
        .where(
          "topic_id",
          "in",
          topics.map((t) => t.topic_id),
        )
        .where("type", "in", explanationTypes as any)
        .select(["topic_id", "type"])
        .execute();

      const existingSet = new Set(
        existingTranslations.map((e) => `${e.topic_id}|${e.type}`),
      );

      for (const exp of sourceExplanations) {
        const key = `${exp.topic_id}|${exp.type}`;
        if (!existingSet.has(key)) {
          const _topic = topics.find((t) => t.topic_id === exp.topic_id);
          batchRequests.push({
            custom_id: `translate-topic|${exp.topic_id}|${exp.type}|${target_language_code}|${exp.explanation_id}`,
            method: "POST",
            url: "/v1/responses",
            body: {
              model,
              reasoning: { effort },
              instructions: finalPrompt,
              input: exp.explanation,
              max_output_tokens: 50000,
            },
          });
        }
      }

      console.log(
        `[BATCH] After skipping existing, ${batchRequests.length} translations needed`,
      );
    } else {
      batchRequests = sourceExplanations.map((exp) => ({
        custom_id: `translate-topic|${exp.topic_id}|${exp.type}|${target_language_code}|${exp.explanation_id}`,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          reasoning: { effort },
          instructions: finalPrompt,
          input: exp.explanation,
          max_output_tokens: 50000,
        },
      }));
    }

    if (batchRequests.length === 0) {
      console.log("[BATCH] No new explanations to translate. Skipping.");
      return;
    }

    // Validate uniqueness
    const validation = this.validateCustomIdUniqueness(batchRequests);
    if (!validation.isValid) {
      throw new Error(`Custom ID validation failed: ${validation.summary}`);
    }

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      throw new ValidationError("Batch file size exceeds OpenAI's 100MB limit");
    }

    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `translate_topic_explanations_${target_language_code}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    console.log(`[BATCH] Created OpenAI file: ${file.id}`);

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    console.log(`[BATCH] Created OpenAI batch: ${batch.id}`);

    await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-translate",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        topic_category: category || null,
        topic_id: topicId || null,
        source_language_code,
        target_language_code,
        explanation_types: explanationTypes,
        bible_version: "N/A",
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    console.log(`[BATCH] Batch ${batch.id} added to monitoring queue`);

    return batch;
  }

  /**
   * Generate parent batch for translating all topics (names + explanations)
   */
  async generateTopicCompleteTranslationBatch(
    model: string,
    adminUserId: string,
    source_language_code: string,
    target_language_code: string,
    explanationTypes: string[] = ["summary", "byline", "detailed"],
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
    category?: string,
    topicId?: string,
  ) {
    console.log(
      `[BATCH] Creating complete topic translation parent batch: ${source_language_code} -> ${target_language_code}`,
    );

    const connection = this.db.getOrCreateConnection();

    // Create parent batch record
    const parentBatch = await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "topic-translate-all",
        openai_batch_id: `parent-topic-translate-${Date.now()}`,
        status: "validating",
        model,
        total_requests: 0,
        created_by: adminUserId,
        topic_category: category || null,
        topic_id: topicId || null,
        source_language_code,
        target_language_code,
        explanation_types: explanationTypes,
        bible_version: "N/A",
      })
      .returning("id")
      .executeTakeFirst();

    if (!parentBatch) {
      throw new Error("Failed to create parent batch");
    }

    console.log(`[BATCH] Created parent batch with ID: ${parentBatch.id}`);

    // Add parent batch to monitoring queue
    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: `parent-${parentBatch.id}`, model, isParent: true },
      {
        jobId: `parent-${parentBatch.id}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    const childBatches: any[] = [];
    let totalRequests = 0;

    try {
      // Create child batch 1: Topic names
      console.log("[BATCH] Creating child batch for topic names...");
      const namesBatch = await this.generateTopicNameTranslationBatch(
        model,
        adminUserId,
        source_language_code,
        target_language_code,
        skipExisting,
        "low", // Low effort for names
        category,
        topicId,
      );

      if (namesBatch) {
        childBatches.push({
          type: "names",
          batch_id: namesBatch.id,
        });

        // Get request count
        const nameBatchJob = await connection
          .selectFrom("batch_jobs")
          .where("openai_batch_id", "=", namesBatch.id)
          .select("total_requests")
          .executeTakeFirst();

        totalRequests += nameBatchJob?.total_requests || 0;

        // Update child batch to link to parent
        await connection
          .updateTable("batch_jobs")
          .set({ parent_batch_id: parentBatch.id })
          .where("openai_batch_id", "=", namesBatch.id)
          .execute();
      }

      // Create child batch 2: Topic explanations
      console.log("[BATCH] Creating child batch for topic explanations...");
      const explanationsBatch =
        await this.generateTopicExplanationTranslationBatch(
          model,
          adminUserId,
          source_language_code,
          target_language_code,
          explanationTypes,
          skipExisting,
          effort,
          category,
          topicId,
        );

      if (explanationsBatch) {
        childBatches.push({
          type: "explanations",
          batch_id: explanationsBatch.id,
        });

        const expBatchJob = await connection
          .selectFrom("batch_jobs")
          .where("openai_batch_id", "=", explanationsBatch.id)
          .select("total_requests")
          .executeTakeFirst();

        totalRequests += expBatchJob?.total_requests || 0;

        await connection
          .updateTable("batch_jobs")
          .set({ parent_batch_id: parentBatch.id })
          .where("openai_batch_id", "=", explanationsBatch.id)
          .execute();
      }

      // Update parent with total
      await connection
        .updateTable("batch_jobs")
        .set({
          total_requests: totalRequests,
          status: "in_progress",
        })
        .where("id", "=", parentBatch.id)
        .execute();

      console.log(
        `[BATCH] Parent batch created with ${childBatches.length} child batches, ${totalRequests} total requests`,
      );

      return {
        parentBatchId: parentBatch.id,
        childBatches,
        totalRequests,
      };
    } catch (error) {
      console.error("[BATCH] Error creating child batches:", error);

      // Mark parent as failed
      await connection
        .updateTable("batch_jobs")
        .set({ status: "failed" })
        .where("id", "=", parentBatch.id)
        .execute();

      throw error;
    }
  }

  async generateHighlightBatch(
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high" = "medium",
    bookName?: string,
    skipExisting = false,
  ): Promise<any> {
    const isBibleBatch = !bookName;

    if (isBibleBatch) {
      const connection = this.db.getOrCreateConnection();

      // Create parent batch first
      const parentBatch = await connection
        .insertInto("batch_jobs")
        .values({
          batch_type: "auto-highlight-bible",
          status: "in_progress",
          model,
          created_by: adminUserId,
          total_requests: 66, // Will be updated if we skip books
          bible_version: "N/A",
          explanation_types: [],
        } as any)
        .returning("id")
        .executeTakeFirstOrThrow();

      const parentBatchId = parentBatch.id;

      let booksQuery = connection
        .selectFrom("books")
        .select(["book_id", "name"])
        .orderBy("book_id", "asc");

      if (skipExisting) {
        // Filter out books that already have entries in auto_highlights
        booksQuery = booksQuery.where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom("auto_highlights")
                .select("auto_highlight_id")
                .whereRef("auto_highlights.book_id", "=", "books.book_id"),
            ),
          ),
        );
      }

      const books = await booksQuery.execute();

      // Update total requests if we skipped some
      if (books.length !== 66) {
        await connection
          .updateTable("batch_jobs")
          .set({ total_requests: books.length })
          .where("id", "=", parentBatchId)
          .execute();
      }

      if (books.length === 0) {
        // Mark parent as completed if nothing to do
        await connection
          .updateTable("batch_jobs")
          .set({ status: "completed" })
          .where("id", "=", parentBatchId)
          .execute();

        return {
          success: true,
          message:
            "No books found that need auto-highlights (all skipped or none found).",
          results: [],
          parentBatchId,
        };
      }

      const batchResults = [];

      for (const book of books) {
        try {
          // We already filtered via query, so no need to pass skipExisting to single batch here
          // unless we want double safety. But query filter is better.
          const bookBatch = await this.generateHighlightBookBatch(
            book.name,
            model,
            adminUserId,
            effort,
            parentBatchId,
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
        message: `Auto-highlight batch creation started for ${books.length} books under parent batch ${parentBatchId}.`,
        results: batchResults,
        parentBatchId,
      };
    }

    // bookName is required for single book batch
    if (!bookName) {
      throw new Error("Book name is required for single book batch");
    }

    // For single book, we check skipExisting inside the helper
    return this.generateHighlightBookBatch(
      bookName,
      model,
      adminUserId,
      effort,
      undefined,
      skipExisting,
    );
  }

  private async generateHighlightBookBatch(
    bookName: string,
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high",
    parentBatchId?: number,
    skipExisting = false,
  ): Promise<any> {
    const connection = this.db.getOrCreateConnection();

    const book = await connection
      .selectFrom("books")
      .where("name", "=", bookName)
      .select("book_id")
      .executeTakeFirst();

    if (!book) {
      throw new Error(`Book "${bookName}" not found.`);
    }

    if (skipExisting) {
      const existing = await connection
        .selectFrom("auto_highlights")
        .where("book_id", "=", book.book_id)
        .select("auto_highlight_id")
        .limit(1)
        .executeTakeFirst();

      if (existing) {
        console.log(
          `[BATCH] Skipping auto-highlight for ${bookName} as it already exists.`,
        );
        return {
          skipped: true,
          message: "Skipped existing",
          bookId: book.book_id,
        };
      }
    }

    const highlightPrompt = await connection
      .selectFrom("prompts")
      .where("prompt_type", "=", "auto-highlight")
      .where("status", "=", PromptStatusEnum.active)
      .select("prompt")
      .executeTakeFirst();

    if (!highlightPrompt) {
      throw new Error("No active auto-highlight prompt found.");
    }

    const batchRequests: BatchJobRequest[] = [
      {
        custom_id: `auto-highlight-${book.book_id}-${bookName}-${Date.now()}`,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          reasoning: { effort },
          instructions: "",
          input: highlightPrompt.prompt.replace("{book_name}", bookName),
          max_output_tokens: 50000,
        },
      },
    ];

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    const buffer = Buffer.from(jsonlContent, "utf8");
    if (buffer.length > 100 * 1024 * 1024) {
      throw new ValidationError(
        `Batch file size (${Math.round(buffer.length / (1024 * 1024))}MB) exceeds OpenAI's 100MB limit.`,
      );
    }

    const file = await openai.files.create({
      file: new File(
        [new Uint8Array(buffer)],
        `auto_highlight_${book.book_id}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "auto-highlight",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: 1,
        created_by: adminUserId,
        book_id: book.book_id,
        parent_batch_id: parentBatchId ?? null,
        bible_version: "N/A",
        explanation_types: [],
      } as any)
      .execute();

    try {
      await this.batchMonitoringQueue.add(
        BATCH_MONITORING_QUEUE,
        { batchId: batch.id, model },
        { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
      );
    } catch (e) {
      console.warn(`[BATCH] Failed to enqueue monitor for ${batch.id}:`, e);
    }

    return batch;
  }

  async retrieveAndSaveBatchErrors(batchJobId: string): Promise<{
    success: boolean;
    message: string;
    errorContent?: string;
  }> {
    const connection = this.db.getOrCreateConnection();

    // First, get the batch job to find the openai_batch_id
    const batchJob = await connection
      .selectFrom("batch_jobs")
      .where("id", "=", Number(batchJobId))
      .select(["openai_batch_id", "status", "error_file_content"])
      .executeTakeFirst();

    if (!batchJob) {
      return {
        success: false,
        message: `Batch job ${batchJobId} not found`,
      };
    }

    if (!batchJob.openai_batch_id) {
      return {
        success: false,
        message: `Batch job ${batchJobId} does not have an OpenAI batch ID`,
      };
    }

    // Check if we already have the error content
    if (batchJob.error_file_content) {
      return {
        success: true,
        message: "Error content already retrieved",
        errorContent: batchJob.error_file_content,
      };
    }

    try {
      // Retrieve batch status from OpenAI
      const batchStatus = await openai.batches.retrieve(
        batchJob.openai_batch_id,
      );

      console.log(
        `[BATCH] Batch ${batchJob.openai_batch_id} status: ${batchStatus.status}, has error_file_id: ${!!batchStatus.error_file_id}`,
      );

      if (!batchStatus.error_file_id) {
        return {
          success: false,
          message: `Batch ${batchJobId} (${batchJob.openai_batch_id}) does not have an error file. Status: ${batchStatus.status}`,
        };
      }

      // Download the error file
      console.log(
        `[BATCH] Downloading error file ${batchStatus.error_file_id}...`,
      );
      const errorFileContent = await openai.files.content(
        batchStatus.error_file_id,
      );
      const errorText = await errorFileContent.text();

      // Save to database
      await connection
        .updateTable("batch_jobs")
        .set({ error_file_content: errorText })
        .where("id", "=", Number(batchJobId))
        .execute();

      console.log(
        `[BATCH] Successfully saved error content for batch ${batchJobId}`,
      );

      return {
        success: true,
        message: `Successfully retrieved and saved error content for batch ${batchJobId}`,
        errorContent: errorText,
      };
    } catch (error) {
      console.error(
        `[BATCH] Error retrieving error file for batch ${batchJobId}:`,
        error,
      );
      return {
        success: false,
        message: `Failed to retrieve error file: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}
