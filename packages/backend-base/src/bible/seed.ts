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
  version_id,
}: {
  type: ExplanationTypeEnum;
  explanation: string;
  chapter_id: number;
  version_id: string;
}) {
  await db
    .getOrCreateConnection()
    .insertInto("explanations")
    .values({ type, explanation, chapter_id, version_id })
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

  // Define the default templates based on the hardcoded prompts from explanation-regeneration.service.ts
  const defaultTemplates = [
    {
      template_name: "Summary Template",
      explanation_type: "summary",
      prompt_template: `# Summary (start with title: "# Summary of {bookName} {chapterNumber}")

**Request Overview:** Provide a high-level summary
explanation of all of {bookName} {chapterNumber} in 300 words or so. Focus on clarity and
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
- Does the title follow the format "# Summary of {bookName} {chapterNumber}"?
- Does the response use the specified Markdown formatting?

**Use this template to format your response:**

# Summary of {bookName} {chapterNumber}


## Overview

Hebrews 3 contrasts Jesus Christ with Moses and issues a solemn warning against unbelief. The chapter emphasizes Jesus' superiority in God's redemptive plan, calls believers to steadfast faith, and warns against the dangers of hardened hearts, using Israel's wilderness rebellion as a cautionary example.
Christ Greater than Moses (Hebrews 3:1–6)

The writer urges believers, described as "holy brethren, partakers of a heavenly calling" (v.1, NASB1995), to fix their attention on Jesus, who is both the Apostle (sent One) and High Priest of their confession. While Moses was faithful as a servant in God's house, Christ is exalted as the Son who rules over the house. This comparison highlights Jesus' unique status: Moses prefigured the covenant community, but Christ fulfills and surpasses it. The author stresses, "We are His house, if we hold fast our confidence" (v.6), underscoring perseverance as a mark of true belonging to Christ.
Warning Against Unbelief (Hebrews 3:7–19)

Quoting Psalm 95, the Holy Spirit's warning is restated: "Today if you hear His voice, do not harden your hearts" (v.7–8). The Israelites' rebellion in the wilderness is recalled—despite witnessing God's works, they provoked Him, failed to trust His promises, and were excluded from entering His rest (vv. 9–11, 19). Their unbelief serves as a sobering example for Christians, showing that God's promises demand faith and obedience.

The author admonishes believers to "encourage one another day after day… so that none of you will be hardened by the deceitfulness of sin" (v.13). The Christian life is communal, requiring mutual exhortation to remain faithful. Endurance in faith to the end reveals true participation in Christ (v.14).
Broader Themes

Hebrews 3 aligns with the biblical narrative of God's covenant faithfulness and man's frequent rebellion. The wilderness generation symbolizes unbelieving hearts, while Christ embodies the perfect Son leading His people into the greater "rest" of salvation (cf. Hebrews 4). This chapter contributes to the overarching theme of perseverance in faith, warning against apostasy, and elevating Christ as the ultimate High Priest who surpasses all previous mediators.`,
      status: "active",
    },
    {
      template_name: "Byline Template",
      explanation_type: "byline",
      prompt_template: `# Verse-by-Verse Analysis (start with title "# Line-by-Line Analysis of {bookName} {chapterNumber}")

**Request Overview:**
- Provide a line-by-line explanation of all
of {bookName} {chapterNumber} without stopping until the full chapter is explained even if it's very long, in a single message. Ensure you do each line and do not group
for flow - even if the passage has many lines. Focus on clarity and
depth to help readers understand their significance and message.
- Be sure to output in full sentences - even within the bullets. Output without
any commentary or questions before or after the response.

**Instructions:**

1. **Introduction:**    Begin with the verse

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
- Does the title follow the format "# Line-by-Line Analysis of {bookName} {chapterNumber}"?
- Does the summary and analysis follow the format "### Summary" and "### Analysis"?
- Are all the markdown templates followed?
  
  **Use this template to format your response:**

# Line-by-Line Analysis of {bookName} {chapterNumber}


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
      status: "active",
    },
    {
      template_name: "Detailed Template",
      explanation_type: "detailed",
      prompt_template: `# In-Depth Analysis (start with title "# In-Depth Analysis of {bookName} {chapterNumber}")

**Request Overview:** Provide an in-depth yet accessible
explanation of all of {bookName} {chapterNumber} 500-600 words per section. Focus on
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

3. **Overall Significance:**     Conclude with a discussion on the
overall significance of the passage. Address how it contributes to the
overarching narrative of the Bible and its relevance to contemporary
readers.

4. **Formatting:**   - Use Markdown for the response, with clear
headings for the passages, subheadings for major analysis points, and
bullet points for key insights, title should be in size 20. - Ensure the explanation is
comprehensive, typically spanning at least 500-600 words, but allow for
flexibility depending on the complexity and length of the passage. -
Aim for readability and engagement, making the analysis informative for
both novice and experienced readers. Include bullets as appropriate. -
**Accessibility:** Provide easy-to- understand explanations suitable
for readers with varying levels of biblical knowledge. Clarify any
theological terms or concepts that might be unfamiliar. Include any
definitions as appropriate.     - **Thoroughness:** Ensure the
examination is thorough, covering the passage provided. Offer insights
into the meaning, context, and implications of the text.     -
**Relevance:** Draw connections to broader themes in the Bible and
suggest contemporary applications where appropriate. Include
interpretation and application questions.

**Evaluation Criteria:**
- Is there an introduction that contextualizes the passage?
- Is there a discussion of the overall significance?
- Are there interpretation and application questions?
- Does the title follow the format "# In-Depth Analysis of {bookName} {chapterNumber}"?
- Are all the markdown templates followed?
- Are verses not included in the output before the introduction?

**Use this template to format your response:**

# In-Depth Analysis of {bookName} {chapterNumber}


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
      status: "active",
    },
  ];

  // Insert each template
  for (const template of defaultTemplates) {
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

## MANDATORY FORMATTING REQUIREMENTS
You MUST follow these formatting rules in EVERY response - NO EXCEPTIONS:

- **Scripture Quotes**: ALWAYS use blockquote format (>) when quoting Scripture verses
  - ❌ Wrong: "For God so loved the world..." (John 3:16)
  - ✅ Correct: > "For God so loved the world..." (**John 3:16**)
- **Scripture References**: ALWAYS use bold formatting for book names and verse references
  - ✅ **John 3:16**, **Romans 8:28**, **Matthew 5:17-19**
- **Theological Terms**: ALWAYS bold important theological concepts
  - ✅ **justification**, **sanctification**, **atonement**, **salvation**
- **Lists**: ALWAYS use bullet points (-) or numbered lists for clarity
  - ✅ - Key point 1
  - ✅ - Key point 2
- **Section Headers**: Use appropriate heading levels (##, ###) to organize content
- **Emphasis**: Use *italics* for moderate emphasis, **bold** for strong emphasis
- **Original Language**: Use *italics* for Greek/Hebrew terms with English translation
  - ✅ The Greek word *agape* means unconditional love

Before submitting your response, verify:
□ All Scripture quotes use blockquote format (>)
□ All theological terms are bolded
□ All lists use proper bullet points
□ All verse references are bolded

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
    .executeTakeFirstOrThrow();

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
            version_id: version.id,
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
