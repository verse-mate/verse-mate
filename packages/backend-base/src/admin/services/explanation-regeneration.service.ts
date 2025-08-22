import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import type { db } from "../../shared/shared.plugin";

export class ExplanationRegenerationService {
  private openai: OpenAI;
  private promptRepository: PromptRepository;

  constructor(private readonly db: db) {
    this.openai = new OpenAI({
      apiKey: process.env.OPEN_AI_KEY,
    });
    this.promptRepository = new PromptRepository(this.db);
  }

  private async gpt5Text({
    instructions,
    input,
    model,
    effort = "medium",
  }: {
    instructions?: string;
    input: string;
    model: string;
    effort?: "low" | "medium" | "high";
  }) {
    const response = await this.openai.responses.create({
      model,
      reasoning: { effort },
      instructions,
      input,
      max_output_tokens: 20000,
    });

    return response.output_text || "";
  }

  private getLanguageName(code: string, locale = "en"): string {
    const display = new Intl.DisplayNames([locale], { type: "language" });
    return display.of(code) ?? display.of("en") ?? "English";
  }

  private getUserPrompt({
    explanationPrompt,
    language,
  }: { explanationPrompt: string; language: string }) {
    return `${explanationPrompt}

The response should be in ${language} using Markdown format only.`;
  }

  private async getExplanationTypePrompt(
    type: ExplanationTypeEnum,
    bookName: string,
    chapterNumber: number,
  ): Promise<{ prompt: string }> {
    try {
      const userPromptRepo = new UserPromptRepository(this.db);
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
  }

  async generateNewExplanation(
    regenerationId: string,
    bookId: number,
    chapterNumber: number,
    explanationType: ExplanationTypeEnum,
    bibleVersion: string,
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high" = "medium",
  ) {
    try {
      const connection = this.db.getOrCreateConnection();

      const { chapter_id } = (await connection
        .selectFrom("chapters")
        .where("book_id", "=", bookId)
        .where("chapter_number", "=", chapterNumber)
        .select("chapter_id")
        .executeTakeFirst()) || { chapter_id: null };

      if (!chapter_id) {
        throw new Error(
          `Chapter ${chapterNumber} not found for book ${bookId}`,
        );
      }

      const book = await connection
        .selectFrom("books")
        .where("book_id", "=", bookId)
        .select("name")
        .executeTakeFirst();

      if (!book) {
        throw new Error(`Book ${bookId} not found`);
      }

      const systemPrompt = await this.promptRepository.getActivePrompt();
      if (!systemPrompt) {
        throw new Error("No active system prompt found");
      }

      const explanationConfig = await this.getExplanationTypePrompt(
        explanationType,
        book.name,
        chapterNumber,
      );

      const version = await connection
        .selectFrom("bible_versions")
        .select(["id", "language_code"])
        .where("version_key", "=", bibleVersion)
        .executeTakeFirst();

      if (!version) {
        throw new Error(`Bible version ${bibleVersion} not found`);
      }

      const verses = await connection
        .selectFrom("verses")
        .where("chapter_id", "=", chapter_id)
        .where("version_id", "=", version.id)
        .select(["verse_number", "text"])
        .orderBy("verse_number", "asc")
        .execute();

      if (!verses || verses.length === 0) {
        throw new Error(
          `No verses found for chapter ${chapterNumber} in version ${bibleVersion}`,
        );
      }

      const language = this.getLanguageName(version.language_code);

      const versesText = verses
        .map((v) => `${v.verse_number}. ${v.text}`)
        .join("\n");

      const userPrompt = this.getUserPrompt({
        explanationPrompt: `${explanationConfig.prompt}\n\nBiblical Text (${book.name} ${chapterNumber}):\n${versesText}`,
        language,
      });

      console.log(
        `[REGENERATION] Generating new explanation for ${book.name} ${chapterNumber}, type: ${explanationType}, model: ${model}`,
      );

      const newExplanationContent = await this.gpt5Text({
        instructions: systemPrompt.prompt,
        input: userPrompt,
        model,
        effort,
      });

      const originalExplanation = await connection
        .selectFrom("explanations")
        .where("chapter_id", "=", chapter_id)
        .where("type", "=", explanationType)
        .where("version_id", "=", version.id)
        .select("explanation_id")
        .executeTakeFirst();

      if (!originalExplanation) {
        throw new Error("No active explanation found to regenerate");
      }

      console.log(`Saving regenerated explanation for ${regenerationId}`);
      console.log(
        `Original ID: ${originalExplanation.explanation_id}, New content length: ${newExplanationContent.length}`,
      );

      const result = {
        success: true,
        regenerationId,
        newExplanation: {
          id: Math.floor(Math.random() * 10000),
          content: newExplanationContent,
          version: 2,
          isActive: false,
        },
        status: "awaiting_admin_choice",
      };

      return {
        success: true,
        regenerationId,
        message: "New explanation generated successfully",
        newExplanation: result.newExplanation,
        status: "awaiting_admin_choice",
      };
    } catch (error) {
      console.error("[REGENERATION] Error generating explanation:", error);
      return {
        success: false,
        regenerationId,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        status: "failed",
      };
    }
  }
}
