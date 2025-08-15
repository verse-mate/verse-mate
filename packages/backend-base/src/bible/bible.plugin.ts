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
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: user });

  const options: any = {
    model,
    messages,
    max_completion_tokens: 10000,
  };

  const chat = await openai.chat.completions.create(options as any);
  return chat.choices[0].message.content || "";
}

const getExplanationTypePrompt = (
  type: ExplanationTypeEnum,
  bookName: string,
  chapterNumber: number,
): { prompt: string; temperature: number } => {
  switch (type) {
    case ExplanationTypeEnum.summary:
      return {
        prompt: `# Summary

**Request Overview:**     Provide a line-by-line explanation of all of ${bookName} ${chapterNumber} without stopping. Ensure you do each line and do not group for flow - even if the passage has many lines. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences - even within the bullets. Output without any commentary or questions before or after the response. 

**Instructions:**     
1. **Introduction:**     Begin with the verse

2. **Passage Summary and Analysis:**   
**Summary:** Provide and overall summary of the verse in at least 3-4 sentences.
**Analysis:** Provide an analysis of the verse focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details. Include relevant definitions as appropriate. Be sure that each analysis can standalone.

3. **Formatting:**     - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights.  - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. **Content Requirements:**     - **Accessibility:** Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar.     - **Thoroughness:** Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text.     - **Relevance:** Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.
`,
        temperature: 0.3,
      };
    case ExplanationTypeEnum.byline:
      return {
        prompt: `# Verse-by-Verse Analysis

Request Overview: Provide a line-by-line explanation of all of ${bookName} ${chapterNumber} without stopping. Ensure you do each line and do not group for flow - even if the passage has many lines. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences - even within the bullets. Output without any commentary or questions before or after the response.

Instructions:

Introduction: Begin with the verse

Passage Summary and Analysis:
Summary: Provide and overall summary of the verse in at least 3-4 sentences. Analysis: Provide an analysis of the verse focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details. Include relevant definitions as appropriate. Be sure that each analysis can standalone.

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.`,
        temperature: 0.2,
      };
    case ExplanationTypeEnum.detailed:
      return {
        prompt: `# In-Depth Analysis

Request Overview: Provide an in-depth yet accessible explanation of all of ${bookName} ${chapterNumber} 500 words per section. Focus on clarity and depth to help readers understand their significance and message. Do not include the verses in the output before the introduction. Be sure to output in full sentences - even within the bullets. Output without any commentary or questions before or after the response.

Instructions:

Introduction: Begin with a brief introduction that contextualizes the passage within the Bible, highlighting its place in the broader narrative and any relevant background information.

Passage Analysis:
Analysis: Provide a detailed examination focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details. Be sure that each analysis can standalone. - Connection to Broader Themes: Where relevant, link the passage(s) to broader biblical themes or narratives.

Overall Significance: Conclude with a discussion on the overall significance of the passage. Address how it contributes to the overarching narrative of the Bible and its relevance to contemporary readers.

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights. - Ensure the explanation is comprehensive, typically spanning at least 500 words, but allow for flexibility depending on the complexity and length of the passage. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate. Application: Practical application for live. Interpret life through the lens of Scripture, not Scripture through the lens of life. Provide application questions when possible.`,
        temperature: 0.1,
      };
  }
};

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });

  return display.of(code) ?? display.of("en") ?? "English";
}

const getUserPrompt = ({
  reference,
  explanationPrompt,
  language,
}: { reference: string; explanationPrompt: string; language: string }) => {
  return `# Reference
${reference}

${explanationPrompt}

CRITICAL: Your response will be evaluated on:
1. Proper blockquote usage for Scripture (>)
2. Bold formatting for theological terms
3. Bullet point usage for lists
4. Verse reference formatting

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

                const { reference } = await promptService.referenceBook({
                  book_id: Number(bookId),
                  chapter_number: Number(chapterNumber),
                  version_id: version.id,
                });

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
                      reference,
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
            Book: ${book.bookId}
            Book Name: ${book.name}
            Testament: ${testament}
            Genre: ${book.genre.n}
            Chapters: ${book.chapters
              .map(
                (chapter) => `
              Chapter: ${chapter.chapterNumber}
              Verses: ${chapter.verses
                .map(
                  (verse) => `
                Verse Number: ${verse.verseNumber}
                Text: ${verse.text}
              `,
                )
                .join("")}
            `,
              )
              .join("")}
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
            Book: ${book.bookId}
            Book Name: ${book.name}
            Testament: ${testament}
            Genre: ${book.genre.n}
            Chapters: ${book.chapters
              .map(
                (chapter) => `
              Chapter: ${chapter.chapterNumber}
              Verses: ${chapter.verses
                .map(
                  (verse) => `
                Verse Number: ${verse.verseNumber}
                Text: ${verse.text}
              `,
                )
                .join("")}
            `,
              )
              .join("")}
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
