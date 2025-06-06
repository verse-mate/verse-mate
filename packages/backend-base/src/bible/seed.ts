import type { BunFile } from "bun";
import { db } from "database";
import type { Books } from "database/src/models/public/Books";
import type { Chapters } from "database/src/models/public/Chapters";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import type { Subtitles } from "database/src/models/public/Subtitles";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import type { Verses } from "database/src/models/public/Verses";
import { parseBibleData } from "./bible";

// --------------- Utility Insert Functions ---------------

async function createGenres() {
  const genres = [
    "Law",
    "History",
    "Wisdom",
    "Prophets",
    "Gospels",
    "Acts",
    "Epistles",
    "Apocalyptic",
  ];

  for (const genre of genres) {
    await db
      .getOrCreateConnection()
      .insertInto("genres")
      .values({ name: genre })
      .execute();
  }
  return { message: "Genres created" };
}

async function saveBook({ name, testament, genre_id }: Omit<Books, "book_id">) {
  await db
    .getOrCreateConnection()
    .insertInto("books")
    .values({
      name,
      testament,
      genre_id,
    })
    .execute();

  const book_id = await db
    .getOrCreateConnection()
    .selectFrom("books")
    .where("name", "=", name)
    .select("book_id")
    .executeTakeFirst();

  return { book_id: book_id?.book_id };
}

async function saveChapter({
  book_id,
  chapter_number,
}: Omit<Chapters, "chapter_id">) {
  await db
    .getOrCreateConnection()
    .insertInto("chapters")
    .values({ book_id, chapter_number })
    .execute();

  return db
    .getOrCreateConnection()
    .selectFrom("chapters")
    .where("book_id", "=", book_id)
    .where("chapter_number", "=", chapter_number)
    .select("chapter_id")
    .executeTakeFirst();
}

async function saveSubtitles({
  chapter_id,
  subtitle,
  start_verse,
  end_verse,
}: Omit<Subtitles, "subtitle_id">) {
  const exists = await db
    .getOrCreateConnection()
    .selectFrom("subtitles")
    .where("chapter_id", "=", chapter_id)
    .where("subtitle", "=", subtitle)
    .where("start_verse", "=", start_verse)
    .where("end_verse", "=", end_verse)
    .select("subtitle_id")
    .executeTakeFirst();
  if (exists) {
    return;
  }

  await db
    .getOrCreateConnection()
    .insertInto("subtitles")
    .values({ chapter_id, subtitle, start_verse, end_verse })
    .execute();
}

async function saveVerse({
  chapter_id,
  verse_number,
  text,
}: Omit<Verses, "verse_id">) {
  await db
    .getOrCreateConnection()
    .insertInto("verses")
    .values({
      chapter_id,
      verse_number,
      text,
    })
    .execute();
}

// --------------- Explanation & Prompt Functions ---------------

async function checkExplanationExists({ chapter_id }: { chapter_id: number }) {
  const explanation = await db
    .getOrCreateConnection()
    .selectFrom("explanations")
    .where("chapter_id", "=", chapter_id)
    .select("explanation_id")
    .executeTakeFirst();
  return { exists: !!explanation };
}

async function getExplanationFromFile(bookName: string, chapterId: number) {
  const chapterIdTwoDigits = chapterId.toString().padStart(2, "0");
  const filePath = `${import.meta.dir}/explanations/${bookName}_Chapter_${chapterIdTwoDigits}.md`;

  try {
    const explanation = await Bun.file(filePath).text();
    return { explanation };
  } catch (err) {
    return { error: `Explanation not found for ${filePath}` };
  }
}

async function saveExplanation({
  type,
  explanation,
  chapter_id,
}: {
  type: ExplanationTypeEnum;
  explanation: string;
  chapter_id: number;
}) {
  await db
    .getOrCreateConnection()
    .insertInto("explanations")
    .values({ type, explanation, chapter_id })
    .execute();
}

async function checkPromptExists() {
  const prompts = await db
    .getOrCreateConnection()
    .selectFrom("prompts")
    .selectAll()
    .execute();

  return { exists: prompts.length > 0 };
}

async function saveDefaultPrompt() {
  await db
    .getOrCreateConnection()
    .insertInto("prompts")
    .values({
      prompt: `
    Request Overview:**
    Provide an in-depth yet accessible explanation of each section. Focus on clarity and depth to help readers understand their significance and message.

    **Instructions:**
    1. **Introduction:**
      Begin with a brief introduction that contextualizes each section of the passage within the Bible, highlighting its place in the broader narrative and any relevant background information.
      Title: use #
      Subtitle: use ##
      Text: no tags needed
      For each section on top add a separator: ---
      dont use any other tags that are not mentioned here;
    2. **Passage Analysis:**
      - **Analysis:** Provide a detailed examination focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details with bullet points.
      - **Connection to Broader Themes:** Where relevant, link the passage(s) to broader biblical themes or narratives.
    3. **Overall Significance:**
      Conclude with a discussion on the overall significance of the passage. Address how it contributes to the overarching narrative of the Bible and its relevance to contemporary readers.
    4. **Formatting:**
      - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights.
      - Ensure the explanation is comprehensive, typically spanning at least 500 words, but allow for flexibility depending on the complexity and length of the passage.
      - Aim for readability and engagement, making the analysis informative for both novice and experienced readers.

      **Content Requirements:**
        - **Accessibility:** Provide easy-to-understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar.
        - **Thoroughness:** Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text.
        - **Relevance:** Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.
    `,
      status: PromptStatusEnum.active,
    })
    .execute();
}

// --------------- MAIN SEED FUNCTION ---------------

export async function main() {
  // 1. Create genres if missing
  const existingGenres = await db
    .getOrCreateConnection()
    .selectFrom("genres")
    .select("name")
    .execute();

  if (existingGenres.length === 0) {
    await createGenres();
    console.log("Genres created.");
  }

  // 2. Parse the bible data ONCE
  const metadataFile = Bun.file(`${import.meta.dir}/data/key_english.json`);
  const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
  const bible = await parseBibleData(bibleFile, metadataFile);

  // 3. Insert Books, Chapters, Subtitles, Verses
  for (const book of bible.books) {
    // Make sure we have a valid genre (some data sets might not have it well-formed)
    if (typeof book.genre?.g !== "number") {
      console.log(`Skipping Book ${book.name}: Genre is invalid or missing.`);
      continue;
    }

    // Check if book already exists
    let savedBook = await db
      .getOrCreateConnection()
      .selectFrom("books")
      .where("name", "=", book.name)
      .select("book_id")
      .executeTakeFirst();

    // If not found, create it
    if (!savedBook) {
      const newBook = await saveBook({
        name: book.name,
        testament: book.testament as TestamentEnum,
        genre_id: book.genre.g,
      });
      if (!newBook.book_id) {
        console.log(`Book ${book.name} could not be saved.`);
        continue;
      }
      savedBook = { book_id: newBook.book_id };
      console.log(`Book created: ${book.name}`);
    }

    // Now loop over the chapters
    for (const chapter of book.chapters) {
      // Check if chapter already exists
      let savedChapter = await db
        .getOrCreateConnection()
        .selectFrom("chapters")
        .where("book_id", "=", savedBook.book_id)
        .where("chapter_number", "=", chapter.chapterId)
        .select("chapter_id")
        .executeTakeFirst();

      // Create if missing
      if (!savedChapter) {
        savedChapter = await saveChapter({
          book_id: savedBook.book_id,
          chapter_number: chapter.chapterId,
        });
        if (!savedChapter) {
          console.log(
            `Chapter ${chapter.chapterId} in book ${book.name} could not be saved.`,
          );
          continue;
        }
        // console.log(`Chapter ${chapter.chapterId} created for book ${book.name}`);
      }

      // Subtitles
      for (const sub of chapter.subtitles) {
        // You might check if the exact subtitle already exists, but often it's simpler to just insert
        await saveSubtitles({
          chapter_id: savedChapter.chapter_id,
          subtitle: sub.subtitle,
          start_verse: sub.start_verse,
          end_verse: sub.end_verse,
        });
        // console.log(`Subtitle created: ${sub.subtitle}`);
      }

      // Verses
      for (const verse of chapter.verses) {
        const existingVerse = await db
          .getOrCreateConnection()
          .selectFrom("verses")
          .where("chapter_id", "=", savedChapter.chapter_id)
          .where("verse_number", "=", verse.verseId)
          .select("verse_id")
          .executeTakeFirst();

        if (!existingVerse) {
          await saveVerse({
            chapter_id: savedChapter.chapter_id,
            verse_number: verse.verseId,
            text: verse.text,
          });
          // console.log(`Verse ${verse.verseId} created`);
        }
      }
    }
  }

  // 4. Insert Explanations if missing
  for (const book of bible.books) {
    // Lookup the savedBook in DB
    const savedBook = await db
      .getOrCreateConnection()
      .selectFrom("books")
      .where("name", "=", book.name)
      .select("book_id")
      .executeTakeFirst();

    if (!savedBook) {
      console.log(
        `No DB entry for book ${book.name}, skipping explanations...`,
      );
      continue;
    }

    for (const chapter of book.chapters) {
      // Get the chapter in DB
      const savedChapter = await db
        .getOrCreateConnection()
        .selectFrom("chapters")
        .where("book_id", "=", savedBook.book_id)
        .where("chapter_number", "=", chapter.chapterId)
        .select("chapter_id")
        .executeTakeFirst();

      if (!savedChapter) continue;

      // Check explanation
      const { exists } = await checkExplanationExists({
        chapter_id: savedChapter.chapter_id,
      });
      if (!exists) {
        const { explanation, error } = await getExplanationFromFile(
          book.name,
          chapter.chapterId,
        );
        if (explanation) {
          await saveExplanation({
            type: ExplanationTypeEnum.summary,
            explanation,
            chapter_id: savedChapter.chapter_id,
          });
          // console.log(`Explanation saved for book ${book.name} ch ${chapter.chapterId}`);
        } else {
          // You can log or ignore if not found
          // console.log(error);
        }
      }
    }
  }

  // 5. Check default prompt
  const promptCheck = await checkPromptExists();
  if (!promptCheck.exists) {
    await saveDefaultPrompt();
    console.log("Default prompt saved.");
  }

  console.log("Seed completed!");
}
