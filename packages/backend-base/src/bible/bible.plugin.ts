import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import RoleEnum from "database/src/models/public/RoleEnum";
import { Elysia, t } from "elysia";
import OpenAI from "openai";
import shared from "../shared/shared.plugin";
import { parseBibleData } from "./bible";
import { ChapterDto } from "./dto/book/chapter.dto";
import { LastChapterReadDto } from "./dto/book/last-chapter-read.dto";
import { RatingDto } from "./dto/book/rating.dto";
import { AddMessageDto } from "./dto/chat/add-message.dto";
import { ChatHistoryDto } from "./dto/chat/chat-history.dto";
import { ChatDto } from "./dto/chat/chat.dto";
import { MessageHistoryDto } from "./dto/chat/message-history.dto";
import { NewChatDto } from "./dto/chat/new-chat.dto";
import { BibleRepository } from "./repository/bible.repository";
import { ChatRepository } from "./repository/chat.repository";
import { PromptRepository } from "./repository/prompt.repository";
import { BibleService } from "./services/bible.service";
import { ChatService } from "./services/chat.service";
import { PromptService } from "./services/prompt.service";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY, // This is the default and can be omitted
});
const model = "gpt-5";

async function gpt5Text({
  system,
  user,
}: {
  system?: string;
  user: string;
}) {
  const response = await openai.responses.create({
    model,
    reasoning: { effort: "high" },
    instructions: system,
    input: user,
    max_output_tokens: 10000,
  });

  return response.output_text || "";
}

const getExplanationTypePrompt = (
  type: ExplanationTypeEnum,
  bookName: string,
  chapterNumber: number,
): { prompt: string; temperature: number } => {
  switch (type) {
    case ExplanationTypeEnum.summary:
      return {
        prompt: `# Summary (start with title: "Summary of ${bookName} ${chapterNumber}" font size 20)

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
- Does the title follow the format "Summary of ${bookName} ${chapterNumber}" and is it of font size 20?
- Does the response use the specified Markdown formatting?

**Use this template to format your response:**

##Summary of ${bookName} ${chapterNumber}

Overview

Hebrews 3 contrasts Jesus Christ with Moses and issues a solemn warning against unbelief. The chapter emphasizes Jesus’ superiority in God’s redemptive plan, calls believers to steadfast faith, and warns against the dangers of hardened hearts, using Israel’s wilderness rebellion as a cautionary example.
Christ Greater than Moses (Hebrews 3:1–6)

The writer urges believers, described as “holy brethren, partakers of a heavenly calling” (v.1, NASB1995), to fix their attention on Jesus, who is both the Apostle (sent One) and High Priest of their confession. While Moses was faithful as a servant in God’s house, Christ is exalted as the Son who rules over the house. This comparison highlights Jesus’ unique status: Moses prefigured the covenant community, but Christ fulfills and surpasses it. The author stresses, “We are His house, if we hold fast our confidence” (v.6), underscoring perseverance as a mark of true belonging to Christ.
Warning Against Unbelief (Hebrews 3:7–19)

Quoting Psalm 95, the Holy Spirit’s warning is restated: “Today if you hear His voice, do not harden your hearts” (v.7–8). The Israelites’ rebellion in the wilderness is recalled—despite witnessing God’s works, they provoked Him, failed to trust His promises, and were excluded from entering His rest (vv. 9–11, 19). Their unbelief serves as a sobering example for Christians, showing that God’s promises demand faith and obedience.

The author admonishes believers to “encourage one another day after day… so that none of you will be hardened by the deceitfulness of sin” (v.13). The Christian life is communal, requiring mutual exhortation to remain faithful. Endurance in faith to the end reveals true participation in Christ (v.14).
Broader Themes

Hebrews 3 aligns with the biblical narrative of God’s covenant faithfulness and man’s frequent rebellion. The wilderness generation symbolizes unbelieving hearts, while Christ embodies the perfect Son leading His people into the greater “rest” of salvation (cf. Hebrews 4). This chapter contributes to the overarching theme of perseverance in faith, warning against apostasy, and elevating Christ as the ultimate High Priest who surpasses all previous mediators.`,
        temperature: 0.3,
      };
    case ExplanationTypeEnum.byline:
      return {
        prompt: `# Verse-by-Verse Analysis (start with title "Line-by-Line Analysis of ${bookName} ${chapterNumber}" font size 20)

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
readers, title should be in font size 20. 
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
- Does the title follow the format "Line-by-Line Analysis of ${bookName} ${chapterNumber}" and is it of font size 20?
  
  **Use this template to format your response:**

##Line-by-Line Analysis of ${bookName} ${chapterNumber}

**Hebrews 1:1**

"God, after He spoke long ago to the fathers in the prophets in many
portions and in many ways," ({bible_version})

**Summary**

This verse declares that God is the initiator of revelation. He spoke in
the past to Israel's ancestors through the prophets. The revelation came
in many parts and various forms, indicating progressive disclosure over
time.


**Analysis**

**Progressive revelation:**
- The Greek adverbs *polumerōs* ("in many
  parts") and *polutropōs* ("in many ways") denote truth given across
  eras, genres, and messengers, preparing for a climactic word.

**Covenantal continuity:**
-"To the fathers" anchors Christian faith within Israel's history, not apart from it.
`,
        temperature: 0.2,
      };
    case ExplanationTypeEnum.detailed:
      return {
        prompt: `# In-Depth Analysis (start with title "In-Depth Analysis of ${bookName} ${chapterNumber}" font size 20)

**Request Overview:** Provide an in-depth yet accessible
explanation of all of Hebrews 1 500-600 words per section. Focus on
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
- Does the title follow the format "In-Depth Analysis of ${bookName} ${chapterNumber}" and is it of font size 20?
- Are verses not included in the output before the introduction?

**Use this template to format your response:**

## In-Depth Analysis of ${bookName} ${chapterNumber}

**Introduction**

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

**Passage Analysis**

**God's Final Revelation in the Son (Hebrews 1:1--4)**

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

**The Superiority of the Son Over Angels (Hebrews 1:5--14)**

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

**Overall Significance**

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

**Interpretation and Application Questions:**

- How does understanding Jesus as the final revelation of God affect the
  way we approach Scripture and faith today?

- In what ways do people today look to "angels" or other mediators
  instead of relying fully on Christ?

- How does the assurance of Christ's supremacy provide encouragement in
  times of uncertainty or persecution?

By presenting Jesus as greater than prophets and angels, Hebrews 1 calls
believers to revere Him as the center of God's plan of salvation and to
remain steadfast in faith, knowing that He reigns eternally and
unshakably.
`,
        temperature: 0.1,
      };
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

const plugin = new Elysia()
  .use(shared)
  .state((state) => {
    return {
      ...state,
      bibleService: new BibleService(state.db, new BibleRepository(state.db)),
      chatService: new ChatService(
        new ChatRepository(state.db),
        new BibleRepository(state.db),
      ),
      promptService: new PromptService(
        new BibleService(state.db, new BibleRepository(state.db)),
        new PromptRepository(state.db),
      ),
    };
  })
  .group("/bible", (app) =>
    app
      .get("/books", async () => {
        const metadataFile = Bun.file(
          `${import.meta.dir}/data/key_english.json`,
        );
        const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
        const bible = await parseBibleData(bibleFile, metadataFile);

        return { books: bible.books };
      })
      .get(
        "/book/:bookId/:chapterNumber",
        async ({ params, store: { bibleService, db }, query }) => {
          const { bookId, chapterNumber } = params;
          const { versionKey = "NASB1995" } = query;

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            throw new Error("Invalid bible version");
          }

          const book = await bibleService.getBook({
            book_id: Number(bookId),
            chapter_number: Number(chapterNumber),
            version_id: version.id,
          });

          return book;
        },
        {
          query: t.Object({
            versionKey: t.Optional(t.String()),
          }),
        },
      )
      .get(
        "/book/explanation/:bookId/:chapterNumber",
        async ({
          params,
          store: { bibleService, promptService, db },
          query,
        }) => {
          const { bookId, chapterNumber } = params;
          const { versionKey = "NASB1995" } = query;

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            return { status: 400, body: { error: "Invalid bible version" } };
          }

          const explanation = await bibleService.getExplanation({
            book_id: Number(bookId),
            chapter_number: Number(chapterNumber),
            version_id: version.id,
          });

          const missingTypes = Object.keys(ExplanationTypeEnum).filter(
            (type) => !explanation?.some((exp) => exp.type === type),
          ) as ExplanationTypeEnum[];

          if (missingTypes.length > 0) {
            await Promise.all(
              missingTypes.map(async (type) => {
                const prompt = await promptService.getActivePrompt();

                if (!prompt) {
                  return { explanation };
                }

                try {
                  const { book } = await bibleService.getBook({
                    book_id: Number(bookId),
                    chapter_number: Number(chapterNumber),
                    version_id: version.id,
                  });

                  const explanationConfig = getExplanationTypePrompt(
                    type,
                    book?.name || "",
                    Number(chapterNumber),
                  );

                  const language = getLanguageName(version.language_code);

                  const text = await gpt5Text({
                    system: prompt.prompt,
                    user: getUserPrompt({
                      explanationPrompt: explanationConfig.prompt,
                      language,
                    }),
                  });

                  const { success } = await bibleService.saveExplanation({
                    type,
                    explanation: text || "",
                    book_id: Number(bookId),
                    chapter_number: Number(chapterNumber),
                    version_id: version.id,
                  });

                  if (success) return { explanation };
                } catch (e) {
                  console.error("[bible.plugin.ts][error]: ", e);
                  return { explanation };
                }
              }),
            );
          }

          return { explanation };
        },
        {
          query: t.Object({
            versionKey: t.Optional(t.String()),
          }),
        },
      )
      .get("/testaments", async ({ store: { bibleService } }) => {
        const { testaments } = await bibleService.getTestaments();
        return { testaments: testaments };
      })
      .post(
        "/book/conversations-history",
        async ({ body, store: { chatService } }) => {
          const userChatHistory = await chatService.getUserChatHistory({
            id: body.session.id,
          });
          return { userChatHistory };
        },
        {
          body: ChatHistoryDto,
        },
      )
      .post(
        "/book/messages-history",
        async ({ body, store: { chatService } }) => {
          const messagesHistory = await chatService.getUserChatMessageHistory({
            conversation_id: body.conversation_id,
            user_id: body.session.id,
          });
          return { messagesHistory };
        },
        {
          body: MessageHistoryDto,
        },
      )
      .post(
        "/book/conversation-exists",
        async ({ body, store: { chatService } }) => {
          const { chatExists } = await chatService.checkIfChatExists({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
          });
          return { chatExists };
        },
        {
          body: t.Intersect([
            t.Pick(NewChatDto, ["user_id", "book_id", "chapter_number"]),
          ]),
        },
      )
      .post(
        "/book/new-conversation",
        async ({ body, store: { chatService, bibleService, db }, query }) => {
          if (!body.user_id) return { message: "User ID is required" };
          const { versionKey = "NASB1995" } = query;

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            return { status: 400, body: { error: "Invalid bible version" } };
          }

          const { book } = await bibleService.getBook({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            version_id: version.id,
          });

          if (!book) {
            return { error: "book not found" };
          }

          const testamentMap = {
            OT: "Old Testament",
            NT: "New Testament",
          };

          const testament =
            book.testament !== null ? testamentMap[book.testament] : "";

          const bookAsContext = `
            Book ID: ${book.bookId}
            Book Name: ${book.name}
            Testament: ${testament}
            Genre: ${book.genre.n}
            Chapter Number: ${body.chapter_number}
          `;

          const prompt = `
            Answer my question in markdown format, limiting yourself to the context below.

            My question: ${body.content}

            Context: ${bookAsContext}
          `;

          const chatText = await gpt5Text({ user: prompt });

          const promptCreateChatTitle = `
          - Create a short title for this chat based on the chat below:
          ${chatText}
          `;

          const generatedTitleText = await gpt5Text({
            user: promptCreateChatTitle,
          });
          // await new Promise((resolve) => setTimeout(resolve, 3000));
          // const generatedTitle = {
          //   choices: [{ message: { content: "Fake title, test only" } }],
          // };

          const newConversation = await chatService.createNewChat({
            user_id: body.user_id,
            title: generatedTitleText || "",
            book_id: body.book_id,
            chapter_number: body.chapter_number,
          });

          return {
            newConversation,
            generatedTitle: generatedTitleText,
          };
        },
        {
          body: t.Intersect([
            t.Pick(NewChatDto, ["user_id", "book_id", "chapter_number"]),
            t.Pick(AddMessageDto, ["content"]),
          ]),
        },
      )
      .post(
        "/book/explanation/save-rating",
        async ({ body, store: { bibleService } }) => {
          const saveRating = await bibleService.saveRating({
            user: body.user,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            explanation_id: body.explanation_id,
            rating: body.rating,
          });
          return { result: saveRating };
        },
        {
          body: RatingDto,
        },
      )
      .put(
        "/book/explanation/update-rating",
        async ({ body, store: { bibleService } }) => {
          const { user, book_id, chapter_number, explanation_id, rating } =
            body;
          const updateRating = await bibleService.updatedUserRating({
            user,
            book_id,
            chapter_number,
            explanation_id,
            rating,
          });
          return { result: updateRating };
        },
        {
          body: RatingDto,
        },
      )
      .post(
        "/book/explanation/ratings",
        async ({ body, store: { bibleService } }) => {
          const { book_id, chapter_number, user, explanation_id } = body;

          const { userRating } = await bibleService.ratingByUser({
            book_id,
            chapter_number,
            user,
            explanation_id,
          });
          const totalUsersWhoRated = await bibleService.totalUsersWhoRated({
            book_id,
            chapter_number,
            explanation_id,
          });
          const averageRating = await bibleService.averageRating({
            book_id,
            chapter_number,
            explanation_id,
          });

          return {
            userRating: userRating.stars,
            totalUsersWhoRated: totalUsersWhoRated.total_users,
            averageRating: averageRating.averageRating,
          };
        },
        {
          body: t.Omit(RatingDto, ["rating"]),
        },
      )
      .post(
        "/book/chapter/save-last-read",
        async ({ body, store: { bibleService } }) => {
          const saveLastChapterRead = await bibleService.saveLastChapterRead({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            id: body.user_id,
          });

          return { result: saveLastChapterRead };
        },
        {
          body: t.Intersect([
            t.Pick(LastChapterReadDto, ["book_id", "chapter_number"]),
            t.Object({ user_id: t.String({ format: "uuid" }) }),
          ]),
        },
      )
      .post(
        "/book/chapter/last-read",
        async ({ body, store: { bibleService } }) => {
          const lastChapterReadByUser =
            await bibleService.lastChapterReadByUser({
              id: body.user_id,
            });
          return { result: lastChapterReadByUser };
        },
        {
          body: t.Intersect([
            t.Object({ user_id: t.String({ format: "uuid" }) }),
          ]),
        },
      )
      .post(
        "/book/ask-verse-mate/save-user-message",
        async ({ body, store: { chatService } }) => {
          const saveUserMessage = await chatService.addMessageToChat({
            chat_id: body.chat_id,
            role: RoleEnum.user,
            content: body.content,
          });

          return { result: saveUserMessage.newMessage };
        },
        {
          body: t.Pick(AddMessageDto, ["chat_id", "content"]),
        },
      )
      .post(
        "/book/ask-verse-mate/save-ai-message",
        async ({ body, store: { chatService, bibleService, db }, query }) => {
          const { versionKey = "NASB1995" } = query;

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            return { status: 400, body: { error: "Invalid bible version" } };
          }

          const { book } = await bibleService.getBook({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            version_id: version.id,
          });

          if (!book) {
            return { error: "book not found" };
          }

          const testamentMap = {
            OT: "Old Testament",
            NT: "New Testament",
          };

          const testament =
            book.testament !== null ? testamentMap[book.testament] : "";

          const bookAsContext = `
            Book ID: ${book.bookId}
            Book Name: ${book.name}
            Testament: ${testament}
            Genre: ${book.genre.n}
            Chapter Number: ${body.chapter_number}
          `;

          const prompt = `
            Answer my question in markdown format, limiting yourself to the context below.

            My question: ${body.content}

            Context: ${bookAsContext}
          `;

          const chatText = await gpt5Text({ user: prompt });
          // await new Promise((resolve) => setTimeout(resolve, 3000));
          // const chat = {
          //   choices: [{ message: { content: "Fake message, test only" } }],
          // };

          const saveAiMessage = await chatService.addMessageToChat({
            chat_id: body.chat_id,
            role: RoleEnum.assistant,
            content: chatText || "",
          });

          return { result: saveAiMessage.newMessage };
        },
        {
          body: t.Intersect([
            t.Pick(AddMessageDto, ["chat_id", "content"]),
            t.Pick(ChapterDto, ["book_id", "chapter_number"]),
          ]),
        },
      )
      .delete(
        "/book/delete-chat/:conversation_id",
        async ({ params, store: { chatService } }) => {
          const { conversation_id } = params;
          const disabledChat = await chatService.disableChat({
            conversation_id: Number(conversation_id),
          });
          return { disabledChat: disabledChat.chat_id };
        },
        {
          params: t.Pick(ChatDto, ["conversation_id"]),
        },
      )
      .get(
        "/book/bookmarks/:user_id",
        async ({ params, store: { bibleService } }) => {
          console.log("=== GET /book/bookmarks/:user_id ENDPOINT ===");
          console.log("Request params:", params);
          console.log("Environment:", {
            NODE_ENV: process.env.NODE_ENV,
            API_URL: process.env.API_URL,
            POSTGRES_URL: process.env.POSTGRES_URL
              ? "Set (value hidden)"
              : "Not set",
          });

          try {
            console.log(
              "Attempting to get bookmarks for user:",
              params.user_id,
            );
            const { favorites } = await bibleService.getBookmarks({
              id: params.user_id,
            });

            console.log(
              "Successfully retrieved bookmarks, count:",
              favorites.length,
            );
            return { favorites };
          } catch (error) {
            console.error("ERROR in GET /book/bookmarks/:user_id:", error);
            if (error instanceof Error) {
              console.error("Error details:", error.message);
              console.error("Error stack:", error.stack);
            }

            // Return a more detailed error response instead of just failing with 500
            return {
              error: "Failed to retrieve bookmarks",
              details: error instanceof Error ? error.message : String(error),
              favorites: [],
            };
          }
        },
        {
          params: t.Object({ user_id: t.String({ format: "uuid" }) }),
        },
      )
      .post(
        "/book/bookmark/add",
        async ({ body, store: { bibleService } }) => {
          try {
            console.log("Adding bookmark:", body);

            if (
              !body.user_id ||
              !body.book_id ||
              body.chapter_number === undefined
            ) {
              console.error("Missing required fields for adding bookmark");
              return {
                success: false,
                error: "Missing required fields",
              };
            }

            const { success } = await bibleService.addBookmark({
              user_id: body.user_id,
              book_id: body.book_id,
              chapter_number: body.chapter_number,
            });

            return { success };
          } catch (error) {
            console.error("Error adding bookmark:", error);
            return {
              success: false,
              error: "Failed to add bookmark",
            };
          }
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
          }),
        },
      )
      .delete(
        "/book/bookmark/remove",
        async ({ query, store: { bibleService } }) => {
          try {
            console.log("Removing bookmark - query params:", query);

            const user_id = query.user_id;
            const book_id = Number(query.book_id);
            const chapter_number = Number(query.chapter_number);

            if (
              !user_id ||
              Number.isNaN(book_id) ||
              Number.isNaN(chapter_number)
            ) {
              console.error(
                "Missing or invalid required fields for removing bookmark",
              );
              return {
                success: false,
                error: "Missing or invalid required fields",
              };
            }

            const { success } = await bibleService.removeBookmark({
              user_id,
              book_id,
              chapter_number,
            });

            return { success };
          } catch (error) {
            console.error("Error removing bookmark:", error);
            return {
              success: false,
              error: "Failed to remove bookmark",
            };
          }
        },
        {
          query: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.String(),
            chapter_number: t.String(),
          }),
        },
      )
      .post(
        "/book/bookmark/remove",
        async ({ body, request, store: { bibleService } }) => {
          try {
            console.log("POST method for removing bookmark:", body);
            console.log("Headers:", request.headers);

            // Check if this is meant to be a DELETE request
            const methodOverride = request.headers.get(
              "x-http-method-override",
            );
            if (methodOverride && methodOverride.toLowerCase() !== "delete") {
              console.warn(`Unexpected method override: ${methodOverride}`);
            }

            if (
              !body.user_id ||
              !body.book_id ||
              body.chapter_number === undefined
            ) {
              console.error("Missing required fields for removing bookmark");
              return {
                success: false,
                error: "Missing required fields",
              };
            }

            const { success } = await bibleService.removeBookmark({
              user_id: body.user_id,
              book_id: body.book_id,
              chapter_number: body.chapter_number,
            });

            return { success };
          } catch (error) {
            console.error("Error removing bookmark via POST:", error);
            return {
              success: false,
              error: "Failed to remove bookmark",
            };
          }
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
          }),
        },
      ),
  );

export type BiblePlugin = typeof plugin;

export default plugin;
