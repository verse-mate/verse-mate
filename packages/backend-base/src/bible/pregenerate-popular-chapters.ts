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

// Popular chapters that users frequently read
const POPULAR_CHAPTERS = [
  // Genesis
  { bookId: 1, chapters: [1, 2, 3, 22] }, // Creation, Fall, Abraham's Test
  // Exodus
  { bookId: 2, chapters: [3, 14, 20] }, // Burning Bush, Red Sea, Ten Commandments
  // Psalms
  { bookId: 19, chapters: [1, 23, 51, 91, 139] }, // Most read psalms
  // Proverbs
  { bookId: 20, chapters: [31] }, // Virtuous Woman
  // Isaiah
  { bookId: 23, chapters: [53, 55] }, // Suffering Servant, Invitation to Salvation
  // Matthew
  { bookId: 40, chapters: [5, 6, 7, 28] }, // Sermon on the Mount, Great Commission
  // John
  { bookId: 43, chapters: [1, 3, 14, 15, 17] }, // Word became flesh, Born again, Upper Room
  // Romans
  { bookId: 45, chapters: [1, 3, 6, 8, 12] }, // Gospel, Justification, New Life
  // 1 Corinthians
  { bookId: 46, chapters: [13, 15] }, // Love, Resurrection
  // Ephesians
  { bookId: 49, chapters: [1, 2, 6] }, // Spiritual Blessings, Salvation, Armor of God
  // Philippians
  { bookId: 50, chapters: [2, 4] }, // Christ's Humility, Joy and Peace
  // Hebrews
  { bookId: 58, chapters: [7, 11, 12] }, // Melchizedek, Faith, Cloud of Witnesses
  // James
  { bookId: 59, chapters: [1, 2] }, // Trials and Faith, Faith and Works
  // 1 John
  { bookId: 62, chapters: [1, 4] }, // Fellowship, Love
  // Revelation
  { bookId: 66, chapters: [1, 21, 22] }, // Vision of Christ, New Heaven and Earth
];

async function pregeneratePopularChapters() {
  console.log("🚀 Starting pre-generation of popular chapters...");

  const metadataFile = Bun.file(`${import.meta.dir}/data/key_english.json`);
  const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
  const bible = await parseBibleData(bibleFile, metadataFile);

  // Get active prompt from database
  const activePrompt = await db
    .selectFrom("prompts")
    .selectAll()
    .where("is_active", "=", true)
    .executeTakeFirst();

  if (!activePrompt) {
    console.error("❌ No active prompt found in database");
    return;
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { bookId, chapters } of POPULAR_CHAPTERS) {
    const book = bible.books.find((b) => b.bookId === bookId);
    if (!book) {
      console.log(`⚠️ Book ${bookId} not found`);
      continue;
    }

    for (const chapterNumber of chapters) {
      const chapter = book.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) {
        console.log(`⚠️ Chapter ${chapterNumber} not found in ${book.name}`);
        continue;
      }

      console.log(`\n📖 Processing ${book.name} ${chapterNumber}...`);

      // Check existing explanations in database
      const existingExplanations = await db
        .selectFrom("explanations")
        .selectAll()
        .where("book_id", "=", bookId)
        .where("chapter_number", "=", chapterNumber)
        .execute();

      const existingTypes = existingExplanations.map((e) => e.type);
      const missingTypes = Object.values(ExplanationTypeEnum).filter(
        (type) => !existingTypes.includes(type),
      );

      if (missingTypes.length === 0) {
        console.log(
          `✅ ${book.name} ${chapterNumber} - All explanations already exist`,
        );
        skipped++;
        continue;
      }

      // Format chapter content
      const reference = formatChapterContent(chapter, book.name);

      // Generate missing explanations
      for (const type of missingTypes) {
        try {
          console.log(`  🤖 Generating ${type} explanation...`);

          const explanationConfig = getExplanationTypePrompt(
            type,
            book.name,
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

          // Save to database
          await db
            .insertInto("explanations")
            .values({
              type,
              explanation: text,
              book_id: bookId,
              chapter_number: chapterNumber,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .execute();

          console.log(`  ✅ ${type} explanation saved`);
          generated++;

          // Add delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(
            `  ❌ Failed to generate ${type} for ${book.name} ${chapterNumber}:`,
            error,
          );
          errors++;
        }
      }
    }
  }

  console.log("\n🎉 Pre-generation complete!");
  console.log("📊 Statistics:");
  console.log(`  - Generated: ${generated} explanations`);
  console.log(`  - Skipped: ${skipped} chapters (already complete)`);
  console.log(`  - Errors: ${errors} failures`);
}

function formatChapterContent(chapter: any, bookName: string): string {
  const { chapterNumber, verses, subtitles } = chapter;

  const subtitleSections = subtitles.map((subtitle: any) => {
    const subtitleVerses = verses
      .filter(
        (verse: any) =>
          verse.verseNumber >= subtitle.start_verse &&
          verse.verseNumber <= subtitle.end_verse,
      )
      .map((verse: any) => `${verse.verseNumber}\n${verse.text}`)
      .join("\n");
    return `${subtitle.subtitle}\n(${bookName} ${chapterNumber}:${subtitle.start_verse} - ${subtitle.end_verse})\n\n${subtitleVerses}`;
  });

  return `${bookName} ${chapterNumber}\n\n${subtitleSections.join("\n\n")}`;
}

// Run pre-generation
if (import.meta.main) {
  pregeneratePopularChapters().catch(console.error);
}
