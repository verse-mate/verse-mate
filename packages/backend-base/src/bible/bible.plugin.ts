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
const model = "gpt-4-turbo";

const getExplanationTypePrompt = (type: ExplanationTypeEnum): string => {
  switch (type) {
    case ExplanationTypeEnum.summary:
      return "Give me a summary of bible reference above";
    case ExplanationTypeEnum.byline:
      return "Explain the bible reference above line by line";
    case ExplanationTypeEnum.detailed:
      return "Explain the bible reference above in detail";
  }
};

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });

  return display.of(code) ?? display.of("en") ?? "English";
}

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
        async ({ params, store: { bibleService } }) => {
          const { bookId, chapterNumber } = params;

          const book = await bibleService.getBook({
            book_id: Number(bookId),
            chapter_number: Number(chapterNumber),
          });

          return book;
        },
      )
      .get(
        "/book/explanation/:bookId/:chapterNumber",
        async ({
          params,
          store: { bibleService, promptService, db },
          query,
        }) => {
          console.log("query", query);
          const { bookId, chapterNumber } = params;
          const { versionKey = "NASB1995" } = query;

          const explanation = await bibleService.getExplanation({
            book_id: Number(bookId),
            chapter_number: Number(chapterNumber),
          });

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirstOrThrow();

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
                });

                try {
                  const chat = await openai.chat.completions.create({
                    messages: [
                      { role: "system", content: prompt.prompt },
                      {
                        role: "user",
                        content: `
                        # Reference
                        ${reference}
                      `,
                      },
                      {
                        role: "user",
                        content: getExplanationTypePrompt(type),
                      },
                      {
                        role: "user",
                        content: `Please respond in ${getLanguageName(version.language_code)}`,
                      },
                      {
                        role: "user",
                        content:
                          "The response should be with the result and in Markdown code only",
                      },
                    ],
                    model,
                  });

                  const { success } = await bibleService.saveExplanation({
                    type,
                    explanation: chat.choices[0].message.content || "",
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
        async ({ body, store: { chatService, bibleService } }) => {
          if (!body.user_id) return { message: "User ID is required" };

          const { book } = await bibleService.getBook({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
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

          const chat = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model,
          });

          const promptCreateChatTitle = `
          - Create a short title for this chat based on the chat below:
          ${chat.choices[0].message.content}
          `;

          const generatedTitle = await openai.chat.completions.create({
            messages: [{ role: "user", content: promptCreateChatTitle }],
            model,
          });
          // await new Promise((resolve) => setTimeout(resolve, 3000));
          // const generatedTitle = {
          //   choices: [{ message: { content: "Fake title, test only" } }],
          // };

          const newConversation = await chatService.createNewChat({
            user_id: body.user_id,
            title: generatedTitle.choices[0].message.content || "",
            book_id: body.book_id,
            chapter_number: body.chapter_number,
          });

          return {
            newConversation,
            generatedTitle: generatedTitle.choices[0].message.content,
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
        async ({ body, store: { chatService, bibleService } }) => {
          const { book } = await bibleService.getBook({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
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

          const chat = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model,
          });
          // await new Promise((resolve) => setTimeout(resolve, 3000));
          // const chat = {
          //   choices: [{ message: { content: "Fake message, test only" } }],
          // };

          const saveAiMessage = await chatService.addMessageToChat({
            chat_id: body.chat_id,
            role: RoleEnum.assistant,
            content: chat.choices[0].message.content || "",
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
      ),
  );

export type BiblePlugin = typeof plugin;

export default plugin;
