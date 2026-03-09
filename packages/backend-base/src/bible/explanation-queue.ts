import Queue from "bull";
import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { MAX_EXPLANATION_TOKENS } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

const getExplanationTypePrompt = (
  type: ExplanationTypeEnum,
  bookName: string,
  chapterNumber: number,
): { prompt: string; temperature: number } => {
  switch (type) {
    case ExplanationTypeEnum.summary:
      return {
        prompt: `# ${bookName} ${chapterNumber} - Summary (use this as title)

Summarize this chapter in approximately 250 words including relevant takeaways and
key theological themes. Do not go verse by verse but instead summarize the overall
passage in a clear, organized way, summarize based on section sub-titles (e.g. Babylon Is Fallen Revelation 18:1 - 8), format it in such way the subtitle is on a new line and the summary is underneath the sub-tittle.

**Theological Themes**

- [Include main theological themes with brief explanations]

**Key Takeaways**

- [Include key takeaways in bullet points]

**Application**

- [Include practical applications or lessons]`,
        temperature: 0.3,
      };
    case ExplanationTypeEnum.byline:
      return {
        prompt: `# ${bookName} ${chapterNumber}: Verse-by-Verse Analysis

Provide a verse-by-verse explanation of this chapter. For each verse:
1. Quote the verse using blockquote format (>)
2. Provide a clear summary
3. Include relevant key takeaways
4. Add key definitions as appropriate
5. Highlight theological themes as appropriate

CRITICAL INSTRUCTIONS:
- Keep chronological order at all times
- Do not group verses unless absolutely necessary
- Ensure takeaways and themes are full sentences
- Use proper markdown formatting with line breaks`,
        temperature: 0.2,
      };
    case ExplanationTypeEnum.detailed:
      return {
        prompt: `# In-Depth Analysis of ${bookName} ${chapterNumber}

Provide an in-depth yet accessible explanation of ${bookName} ${chapterNumber} with approximately 500 words per section. Focus on clarity and depth to help readers understand the significance and message.

**Instructions:**
1. **Introduction:** Begin with a brief introduction that contextualizes the passage within the Bible, highlighting its place in the broader narrative and any relevant background information.

2. **Passage Analysis:**
   - **Analysis:** Provide a detailed examination focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details with bullet points.
   - **Connection to Broader Themes:** Where relevant, link the passage(s) to broader biblical themes or narratives.

3. **Overall Significance:** Conclude with a discussion on the overall significance of the passage. Address how it contributes to the overarching narrative of the Bible and its relevance to contemporary readers.

**Formatting Requirements:**
- Use clear headings and subheadings for organization
- Use bullet points for key insights with proper line breaks
- Ensure comprehensive coverage (typically 500+ words)
- Make content accessible for both novice and experienced readers

**Content Requirements:**
- Include clear explanation of any commandments, laws, or doctrinally relevant instructions
- Treat doctrinal elements as high-priority details for analysis
- Clarify what the text is saying, what it means doctrinally, and how it connects with both Old and New Testament teachings
- Include these details even if not explicitly requested, as long as they are supported by the text
- Provide easy-to-understand explanations suitable for readers with varying levels of biblical knowledge
- Ensure thorough coverage of the passage, emphasizing specific doctrines, practices, or theological claims
- Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate`,
        temperature: 0.1,
      };
  }
};

async function gpt5Text({
  system,
  user,
}: {
  system?: string;
  user: string;
}) {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: user });

  const options: any = {
    model: "gpt-5",
    messages,
    max_completion_tokens: MAX_EXPLANATION_TOKENS,
  };

  const chat = await openai.chat.completions.create(options as any);
  return chat.choices[0].message.content || "";
}

// Create explanation generation queue
const explanationQueue = new Queue("explanation generation", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

// Configure queue processing
explanationQueue.process("generate-explanation", 1, async (job: any) => {
  const { bookId, chapterNumber, type, reference, systemPrompt, bookName } =
    job.data;

  console.log(
    `📄 Processing explanation job: ${bookName} ${chapterNumber} - ${type}`,
  );

  try {
    const explanationConfig = getExplanationTypePrompt(
      type,
      bookName,
      chapterNumber,
    );

    const userPrompt = `# Reference
${reference}

${explanationConfig.prompt}

CRITICAL: Your response will be evaluated on:
1. Proper blockquote usage for Scripture (>)
2. Bold formatting for theological terms
3. Bullet point usage for lists
4. Verse reference formatting

The response should be in Markdown format only.`;

    const text = await gpt5Text({
      system: systemPrompt,
      user: userPrompt,
    });

    const connection = db.getOrCreateConnection();

    const chapter = await connection
      .selectFrom("chapters")
      .select(["chapter_id"])
      .where("book_id", "=", bookId)
      .where("chapter_number", "=", chapterNumber)
      .executeTakeFirst();

    if (!chapter) {
      throw new Error(
        `Chapter not found for book ${bookId}, chapter ${chapterNumber}`,
      );
    }

    const activeVersion = await connection
      .selectFrom("bible_versions")
      .select(["language_code"])
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (!activeVersion) {
      throw new Error("No active bible version found");
    }

    await connection
      .insertInto("explanations")
      .values({
        type,
        explanation: text,
        chapter_id: chapter.chapter_id,
        language_code: activeVersion.language_code,
      })
      .execute();

    console.log(
      `✅ Generated and saved ${type} explanation for ${bookName} ${chapterNumber}`,
    );
  } catch (error) {
    console.error(
      `❌ Failed to generate ${type} explanation for ${bookName} ${chapterNumber}:`,
      error,
    );
    throw error;
  }
});

// Job event listeners
explanationQueue.on("completed", (job: any) => {
  console.log(
    `🎉 Explanation job completed: ${job.data.bookName} ${job.data.chapterNumber} - ${job.data.type}`,
  );
});

explanationQueue.on("failed", (job: any, err: any) => {
  const message =
    err && typeof err === "object" && "message" in err
      ? (err as Error).message
      : String(err);
  const stack =
    err && typeof err === "object" && "stack" in err
      ? (err as Error).stack
      : undefined;
  console.error(
    `💥 Explanation job failed: ${job.data.bookName} ${job.data.chapterNumber} - ${job.data.type}`,
    message,
    stack ?? "",
  );
});

// Function to add explanation generation job to queue
export async function queueExplanationGeneration(
  bookId: number,
  chapterNumber: number,
  type: ExplanationTypeEnum,
  reference: string,
  systemPrompt: string,
  bookName: string,
  priority: "high" | "normal" | "low" = "normal",
) {
  const priorityValue =
    priority === "high" ? 1 : priority === "normal" ? 0 : -1;

  const job = await explanationQueue.add(
    "generate-explanation",
    {
      bookId,
      chapterNumber,
      type,
      reference,
      systemPrompt,
      bookName,
    },
    {
      priority: priorityValue,
      delay: 0,
      removeOnComplete: 5, // Keep only 5 completed jobs
      removeOnFail: 10, // Keep 10 failed jobs for debugging
    },
  );

  console.log(
    `📋 Queued ${type} explanation generation for ${bookName} ${chapterNumber} (Job ID: ${job.id})`,
  );

  return job;
}

// Function to check if explanations are being generated
export async function checkExplanationStatus(
  bookId: number,
  chapterNumber: number,
  type: ExplanationTypeEnum,
) {
  const jobs = await explanationQueue.getJobs(["active", "waiting", "delayed"]);

  const relevantJob = jobs.find(
    (job: any) =>
      job.data.bookId === bookId &&
      job.data.chapterNumber === chapterNumber &&
      job.data.type === type,
  );

  if (relevantJob) {
    return {
      isGenerating: true,
      jobId: relevantJob.id,
      status: await relevantJob.getState(),
      progress: relevantJob.progress(),
    };
  }

  return { isGenerating: false };
}

// Function to get queue statistics
export async function getQueueStats() {
  const waiting = await explanationQueue.getWaiting();
  const active = await explanationQueue.getActive();
  const completed = await explanationQueue.getCompleted();
  const failed = await explanationQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
  };
}

export { explanationQueue };
