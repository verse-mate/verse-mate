import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { parseBibleData } from "./bible";

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
    max_completion_tokens: 10000,
  };

  const chat = await openai.chat.completions.create(options as any);
  return chat.choices[0].message.content || "";
}

async function pregenerateHebrewsChapters() {
  console.log("📖 Starting pre-generation of ALL Hebrews chapters...");

  const metadataFile = Bun.file(`${import.meta.dir}/data/key_english.json`);
  const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
  const bible = await parseBibleData(bibleFile, metadataFile);

  // Get database connection and active prompt
  const connection = db.getOrCreateConnection();
  const activePrompt = await connection
    .selectFrom("prompts")
    .selectAll()
    .where("status", "=", "active" as any)
    .executeTakeFirst();

  if (!activePrompt) {
    console.error("❌ No active prompt found in database");
    return;
  }

  // Get Hebrews chapters from database (proper source of truth)
  const hebrewsChapters = await connection
    .selectFrom("chapters")
    .selectAll()
    .where("book_id", "=", 8) // Hebrews book ID in database
    .orderBy("chapter_number", "asc")
    .execute();

  if (hebrewsChapters.length === 0) {
    console.error("❌ No Hebrews chapters found in database");
    return;
  }

  console.log(
    `📚 Found ${hebrewsChapters.length} Hebrews chapters in database`,
  );

  // Find Hebrews in parsed Bible data for content
  const hebrews = bible.books.find((b) => b.bookId === 58);
  if (!hebrews) {
    console.error("❌ Hebrews book not found in Bible data");
    return;
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  // Process each chapter from database
  for (const dbChapter of hebrewsChapters) {
    const chapterNumber = dbChapter.chapter_number;
    const chapterId = dbChapter.chapter_id;

    console.log(
      `\n📖 Processing Hebrews ${chapterNumber} (ID: ${chapterId})...`,
    );

    // Check existing explanations for this chapter
    const existingExplanations = await connection
      .selectFrom("explanations")
      .selectAll()
      .where("chapter_id", "=", chapterId)
      .execute();

    const existingTypes = existingExplanations.map((e) => e.type);
    const missingTypes = Object.values(ExplanationTypeEnum).filter(
      (type) => !existingTypes.includes(type),
    );

    if (missingTypes.length === 0) {
      console.log(
        `✅ Hebrews ${chapterNumber} - All explanations already exist`,
      );
      skipped++;
      continue;
    }

    console.log(
      `🔄 Hebrews ${chapterNumber} - Missing types: ${missingTypes.join(", ")}`,
    );

    // Find corresponding chapter in parsed Bible data
    const bibleChapter = hebrews.chapters.find(
      (c) => c.chapterId === chapterNumber,
    );
    if (!bibleChapter) {
      console.error(`❌ Chapter ${chapterNumber} not found in Bible data`);
      errors++;
      continue;
    }

    // Format chapter content for AI
    const reference = formatChapterContent(bibleChapter, "Hebrews");

    // Generate missing explanations
    for (const type of missingTypes) {
      try {
        console.log(
          `  🤖 Generating ${type} explanation for Hebrews ${chapterNumber}...`,
        );

        const explanationConfig = getExplanationTypePrompt(
          type,
          "Hebrews",
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
          system: activePrompt.prompt,
          user: userPrompt,
        });

        // Save to database using correct chapter_id and active version
        const activeVersion = await connection
          .selectFrom("bible_versions")
          .select(["id"])
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
            chapter_id: chapterId,
            version_id: activeVersion.id,
          })
          .execute();

        console.log(
          `    ✅ ${type} explanation saved for Hebrews ${chapterNumber} (Chapter ID: ${chapterId})`,
        );
        generated++;

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
      } catch (error) {
        console.error(
          `    ❌ Failed to generate ${type} for Hebrews ${chapterNumber}:`,
          error,
        );
        errors++;
      }
    }
  }

  console.log("\n🎉 Hebrews pre-generation complete!");
  console.log("📊 Statistics:");
  console.log(`  - Generated: ${generated} explanations`);
  console.log(`  - Skipped: ${skipped} chapters (already complete)`);
  console.log(`  - Errors: ${errors} failures`);
  console.log(
    `  - Total Hebrews chapters processed: ${hebrewsChapters.length}`,
  );
  console.log(
    `  - Expected total explanations: ${hebrewsChapters.length * 3} (${hebrewsChapters.length} chapters × 3 types)`,
  );
}

function formatChapterContent(chapter: any, bookName: string): string {
  const { chapterId, verses, subtitles } = chapter;

  const subtitleSections = subtitles.map((subtitle: any) => {
    const subtitleVerses = verses
      .filter(
        (verse: any) =>
          verse.verseId >= subtitle.start_verse &&
          verse.verseId <= subtitle.end_verse,
      )
      .map((verse: any) => `${verse.verseId}\n${verse.text}`)
      .join("\n");
    return `${subtitle.subtitle}\n(${bookName} ${chapterId}:${subtitle.start_verse} - ${subtitle.end_verse})\n\n${subtitleVerses}`;
  });

  return `${bookName} ${chapterId}\n\n${subtitleSections.join("\n\n")}`;
}

// Run pre-generation for Hebrews
if (import.meta.main) {
  pregenerateHebrewsChapters().catch(console.error);
}
