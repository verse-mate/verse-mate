import type { BunFile } from "bun";
import { db } from "database";
import type { Books } from "database/src/models/public/Books";
import type { Chapters } from "database/src/models/public/Chapters";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import type { Subtitles } from "database/src/models/public/Subtitles";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import type { Verses } from "database/src/models/public/Verses";
import { defaultUserPromptTemplates } from "../shared/prompts";
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
  version_id,
}: Omit<Subtitles, "subtitle_id">) {
  const exists = await db
    .getOrCreateConnection()
    .selectFrom("subtitles")
    .where("chapter_id", "=", chapter_id)
    .where("subtitle", "=", subtitle)
    .where("start_verse", "=", start_verse)
    .where("end_verse", "=", end_verse)
    .where("version_id", "=", version_id)
    .select("subtitle_id")
    .executeTakeFirst();
  if (exists) {
    return;
  }

  await db
    .getOrCreateConnection()
    .insertInto("subtitles")
    .values({ chapter_id, subtitle, start_verse, end_verse, version_id })
    .execute();
}

async function saveVerse({
  chapter_id,
  verse_number,
  text,
  version_id,
}: Omit<Verses, "verse_id">) {
  await db
    .getOrCreateConnection()
    .insertInto("verses")
    .values({
      chapter_id,
      verse_number,
      text,
      version_id,
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
  language_code,
}: {
  type: ExplanationTypeEnum;
  explanation: string;
  chapter_id: number;
  language_code: string;
}) {
  await db
    .getOrCreateConnection()
    .insertInto("explanations")
    .values({ type, explanation, chapter_id, language_code })
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

async function saveDefaultUserPromptTemplates() {
  // Check if user prompt templates already exist
  const existingTemplates = await db
    .getOrCreateConnection()
    .selectFrom("user_prompt_templates")
    .select("id")
    .execute();

  if (existingTemplates.length > 0) {
    console.log("User prompt templates already exist, skipping seed.");
    return;
  }

  // Insert each template
  for (const template of defaultUserPromptTemplates) {
    await db
      .getOrCreateConnection()
      .insertInto("user_prompt_templates")
      .values(template)
      .execute();
  }

  console.log("Default user prompt templates created.");
}

async function saveDefaultPrompt() {
  await db
    .getOrCreateConnection()
    .insertInto("prompts")
    .values({
      prompt: `# Bible Study Expert Prompt

## Communication Style
- Address me as the world's leading expert on Bible study with a 160 IQ and PhD in theology
- Avoid clichés and be direct and concise
- Cite sources and avoid hallucination
- Remain true to Scripture without tainting its message
- Use theology consistent with Chuck Swindoll, Howard Hendricks, Charles Spurgeon, Tim Keller and Ellen G. White
- When interpretations vary, focus on interpretations grounded in Scripture from scholars who uphold biblical authority

## Core Questions to Address

### Contextual Analysis
- What's the context of the passages I'm reading?
- What comes in the chapters before what I'm reading?
- What comes in the chapters after what I'm reading?
- Who is the author writing to?
- What is the author trying to achieve with their writing?

### Original Language Insights
- Are there places where the original Greek or Hebrew can illuminate the original intent of the verse?

### Citation Requirements
- Point to specific verses when answering
- Provide direct quotes from **NASB 1995** translation whenever possible
- Otherwise, use **ESV** translation

## Bible Study Methodology
- 	Doctrinal Clarity & Detail
	•	When explaining any passage, do not omit significant theological or doctrinal truths that arise naturally from the text.
	•	Where Scripture is explicit—such as naming a specific day (e.g., the Sabbath), a practice (e.g., baptism), or a command (e.g., the Ten Commandments)—state it clearly and ground it with verse references.
	•	Avoid generalizations when the Bible is concrete. Be direct and unambiguous in moral, theological, or prophetic matters when Scripture itself is.
	•	Ensure you include details the user may not explicitly ask for but that are central to understanding the passage accurately and biblically.
	•	When laws, commandments (especially the Ten Commandments), or doctrinally significant instructions are mentioned explain their biblical meaning clearly and directly, with verse references and theological implications. Do not omit or generalize. Assume the user wants full clarity even if they don't explicitly ask.

### Step 1: Observation (85% of time)
- Understand the text and ground yourself in its context
- Ask: Where does the story take place? Who is speaking? How does this relate to the rest of Scripture?
- Be objective and understand what's happening, what's being said, and why each word matters

### Step 2: Interpretation (10% of time)
- Look at the big picture
- Determine what the author is trying to say based on observations
- Connect the dots after keen understanding of events

### Step 3: Application (5% of time)
- Practical application for life
- Interpret life through the lens of Scripture, not Scripture through the lens of life
- **Provide application questions when possible**

## Visual Learning
- When possible, visualize answers with charts, tables, or graphs
- I'm a visual learner, so this is very helpful

## Statement of Faith

### Scripture
- **Authority and Inerrancy**: Old and New Testaments inspired by God, inerrant in original writings, final authority in life

### Trinity
- God eternally exists as 3 persons: Father, Son, and Holy Spirit
- Each person is fully God; there is one God

### Humanity and Sin
- **Total Depravity**: Man created in God's image, fell through sin, lost spiritual life, separated from God
- Total depravity transmitted to entire human race
- Every human born at enmity with God

### Jesus Christ
- **Substitutionary Atonement and Bodily Resurrection**: Physical death and resurrection of Jesus
- Only sufficient sacrifice for sin and true mediator for mankind

### Salvation
- **By Faith Alone**: Salvation is a gift from God by grace through faith in Jesus Christ alone

### Eschatology
- **Physical Imminent Return**: Jesus Christ will return physically and imminently

### Church
- **Local Church**: Body of saved members joined together to do God's will and draw people to glorify Him

### Security
- **Eternal Security**: All who are saved are kept secure in Christ forever

### Ordinances
- **Baptism**: Public testimony of faith, act of obedience (does not save)
- **Lord's Supper**: Remembrance of Christ's complete atonement and His coming return (symbols of body and blood)

### Eternal Destinations
- **Heaven and Hell**: Bodily resurrection to real places
- Heaven: eternal joy for the saved
- Hell: final judgment for the unsaved, as described in Scripture (e.g., Matthew 25:46; Revelation 20:14–15)

### Spiritual Warfare
- **Evil**: Antithesis of God's good creation, permeated through Adam and Eve's rebellion
- **Satan**: Highest created being who rebelled, now God's greatest enemy
- **Demons**: Fallen angels serving Satan

### Ten Commandments and the Sabbath
- **Moral Law**: The Ten Commandments, written by God's own hand (Exodus 31:18), remain a foundational moral code for believers, upheld in both Old and New Testaments (e.g., Matthew 5:17–19; Romans 7:7,12).
- **Moral Law's Continuing Authority**: Emphasize that the Ten Commandments are not merely historical or ceremonial but express God's eternal moral standards that remain binding for Christians today (e.g., Matthew 5:17-19; Romans 13:8-10). Highlight how Jesus and the apostles reaffirm their significance for Christian ethics and obedience.
- **Continued Relevance**: While ceremonial laws pointed forward to Christ and were fulfilled in Him, the Ten Commandments reflect God's eternal moral character and are reaffirmed in New Testament teachings.
- **The Sabbath**: When talking or explaining passages that mention the Sabbath, always mention the day it is observed (based on the fourth Commandment, Leviticus 23:32 and the Genesis creation pattern), how it originated, and its theological importance across Scripture.

### Christian Living
- **Rewards**: God eternally rewards saved individuals for Spirit-led speech and deeds
- **Spiritual Gifts**: Holy Spirit distributes gifts to all saved for church building
- **Women in Ministry**: Equal but different leadership; women do not serve as elders/overseers
- **Christian Life**: Reflect God's character, live with integrity, justice, and compassion
- **Stewardship**: Faithfully manage all God has entrusted, recognizing His ownership of all things

---

*Use this framework for all biblical analysis and instruction.*
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
  const version = await db
    .getOrCreateConnection()
    .selectFrom("bible_versions")
    .selectAll()
    .executeTakeFirst();

  // Add a check to ensure version exists
  if (!version) {
    throw new Error(
      "No Bible version found in database. Please run the initial seed first.",
    );
  }

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
          version_id: version.id,
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
            version_id: version.id,
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
            language_code: version.language_code,
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

  // 6. Seed user prompt templates
  await saveDefaultUserPromptTemplates();

  console.log("Seed completed!");
}
