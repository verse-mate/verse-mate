import bearer from "@elysiajs/bearer";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import RoleEnum from "database/src/models/public/RoleEnum";
import { Elysia, t } from "elysia";
import OpenAI from "openai";
import { authDerive } from "../auth/auth.utils";
import { NotFoundError, ValidationError } from "../common/errors";
import {
  AuthErrors,
  ErrorResponse,
  StandardErrors,
} from "../common/response-models";
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
const model = "gpt-5-nano";

async function gpt5Text({
  system,
  user,
}: {
  system?: string;
  user: string;
}) {
  const response = await openai.responses.create({
    model,
    reasoning: { effort: "medium" },
    instructions: system,
    input: user,
    max_output_tokens: 20000,
  });

  return response.output_text ?? "oopsies";
}

import { getExplanationTypePrompt } from "../shared/prompt-utils";

// Response Schemas
const BooksResponse = t.Object({
  books: t.Array(t.Any()),
});

const LanguagesResponse = t.Array(t.Any());

const BookResponse = t.Any();

const ExplanationResponse = t.Object({
  explanation: t.Any(),
});

const TestamentsResponse = t.Object({
  testaments: t.Array(t.Any()),
});

const ChapterIdResponse = t.Object({
  chapter_id: t.Union([t.Number(), t.Null()]),
});

const UserChatHistoryResponse = t.Object({
  userChatHistory: t.Any(),
});

const MessagesHistoryResponse = t.Object({
  messagesHistory: t.Any(),
});

const ChatExistsResponse = t.Object({
  chatExists: t.Boolean(),
});

const NewConversationResponse = t.Object({
  newConversation: t.Any(),
  generatedTitle: t.String(),
});

const SaveRatingResponse = t.Object({
  result: t.Any(),
});

const UpdateRatingResponse = t.Object({
  result: t.Any(),
});

const RatingsResponse = t.Object({
  userRating: t.Any(),
  totalUsersWhoRated: t.Number(),
  averageRating: t.Any(),
});

const LastChapterReadSaveResponse = t.Object({
  result: t.Any(),
});

const LastChapterReadResponse = t.Object({
  result: t.Any(),
});

const SaveUserMessageResponse = t.Object({
  result: t.Any(),
});

const SaveAiMessageResponse = t.Object({
  result: t.Any(),
});

const DisableChatResponse = t.Object({
  disabledChat: t.Number(),
});

const BookmarksResponse = t.Object({
  favorites: t.Array(t.Any()),
});

const NotesResponse = t.Object({
  notes: t.Array(t.Any()),
});

const AddNoteResponse = t.Object({
  success: t.Boolean(),
  note: t.Optional(t.Any()),
});

const UpdateNoteResponse = t.Object({
  success: t.Boolean(),
});

const DeleteNoteResponse = t.Object({
  success: t.Boolean(),
});

const AddBookmarkResponse = t.Object({
  success: t.Boolean(),
});

const RemoveBookmarkResponse = t.Object({
  success: t.Boolean(),
});

const HighlightsResponse = t.Object({
  highlights: t.Array(t.Any()),
});

const AddHighlightResponse = t.Union([
  t.Object({
    success: t.Boolean(),
    highlight: t.Optional(t.Any()),
  }),
  t.Object({
    success: t.Boolean(),
    error: t.Optional(t.String()),
  }),
]);

const UpdateHighlightResponse = t.Object({
  highlight: t.Optional(t.Any()),
  success: t.Boolean(),
});

const DeleteHighlightResponse = t.Object({
  success: t.Boolean(),
});

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
      .get(
        "/books",
        async () => {
          const metadataFile = Bun.file(
            `${import.meta.dir}/data/key_english.json`,
          );
          const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
          const bible = await parseBibleData(bibleFile, metadataFile);

          return { books: bible.books };
        },
        {
          response: {
            200: BooksResponse,
            ...AuthErrors,
          },
        },
      )
      .get(
        "/languages",
        async ({ store: { bibleService } }) => {
          return await bibleService.getAvailableExplanationLanguages();
        },
        {
          response: {
            200: LanguagesResponse,
            ...AuthErrors,
          },
        },
      )
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
            throw new NotFoundError("Invalid bible version");
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
          response: {
            200: BookResponse,
            ...AuthErrors,
            404: ErrorResponse,
          },
        },
      )
      .use(bearer())
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/book/explanation/:bookId/:chapterNumber",
        async ({
          params,
          store: { bibleService, promptService, db },
          query,
          currentUserId,
        }) => {
          const { bookId, chapterNumber } = params;
          const { versionKey = "NASB1995", explanationType } = query;

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            throw new NotFoundError("Invalid bible version");
          }

          const explanation = await bibleService.getExplanation({
            book_id: Number(bookId),
            chapter_number: Number(chapterNumber),
            version_id: version.id,
            type: explanationType as ExplanationTypeEnum | undefined,
            user_id: currentUserId || undefined,
          });

          // const missingTypes = Object.keys(ExplanationTypeEnum).filter(
          //   (type) => !explanation?.some((exp) => exp.type === type),
          // ) as ExplanationTypeEnum[];

          // if (missingTypes.length > 0) {
          //   await Promise.all(
          //     missingTypes.map(async (type) => {
          //       const prompt = await promptService.getActivePrompt();

          //       if (!prompt) {
          //         return;
          //       }

          //       try {
          //         const { book } = await bibleService.getBook({
          //           book_id: Number(bookId),
          //           chapter_number: Number(chapterNumber),
          //           version_id: version.id,
          //         });

          //         const language = getLanguageName(version.language_code);

          //         const explanationConfig = await getExplanationTypePrompt(
          //           type,
          //           book?.name || "",
          //           Number(chapterNumber),
          //           db,
          //           language,
          //         );

          //         const text = await gpt5Text({
          //           system: prompt.prompt,
          //           user: getUserPrompt({
          //             explanationPrompt: explanationConfig.prompt,
          //             language,
          //           }),
          //         });

          //         await bibleService.saveExplanation({
          //           type,
          //           explanation: text || "",
          //           book_id: Number(bookId),
          //           chapter_number: Number(chapterNumber),
          //           version_id: version.id,
          //         });
          //       } catch (e) {
          //         console.error("[bible.plugin.ts][error]: ", e);
          //       }
          //     }),
          //   );

          //   // Refetch the explanations after generation
          //   explanation = await bibleService.getExplanation({
          //     book_id: Number(bookId),
          //     chapter_number: Number(chapterNumber),
          //     version_id: version.id,
          //   });
          // }

          return { explanation };
        },
        {
          query: t.Object({
            versionKey: t.Optional(t.String()),
            explanationType: t.Optional(t.String()),
          }),
          response: {
            200: ExplanationResponse,
            ...AuthErrors,
            404: ErrorResponse,
          },
        },
      )
      .get(
        "/testaments",
        async ({ store: { bibleService } }) => {
          const { testaments } = await bibleService.getTestaments();
          return { testaments: testaments.keys };
        },
        {
          response: {
            200: TestamentsResponse,
            ...AuthErrors,
          },
        },
      )
      .get(
        "/chapter-id/:bookId/:chapterNumber",
        async ({ params, store: { db } }) => {
          const { bookId, chapterNumber } = params;

          // Create repository instance to get chapter ID
          const bibleRepository = new BibleRepository(db);

          const { chapter_id } = await bibleRepository.getChapterId({
            book_id: Number(bookId),
            chapter_number: Number(chapterNumber),
          });

          return { chapter_id };
        },
        {
          params: t.Object({
            bookId: t.String(),
            chapterNumber: t.String(),
          }),
          response: {
            200: ChapterIdResponse,
            ...AuthErrors,
            404: ErrorResponse,
          },
        },
      )
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
          response: {
            200: UserChatHistoryResponse,
            ...AuthErrors,
          },
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
          response: {
            200: MessagesHistoryResponse,
            ...AuthErrors,
          },
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
          return {
            chatExists: Array.isArray(chatExists) && chatExists.length > 0,
          };
        },
        {
          body: t.Intersect([
            t.Pick(NewChatDto, ["user_id", "book_id", "chapter_number"]),
          ]),
          response: {
            200: ChatExistsResponse,
            ...AuthErrors,
          },
        },
      )
      .post(
        "/book/new-conversation",
        async ({ body, store: { chatService, bibleService, db }, query }) => {
          if (!body.user_id) {
            throw new ValidationError("User ID is required");
          }
          const { versionKey = "NASB1995" } = query;

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            throw new NotFoundError("Invalid bible version");
          }

          const { book } = await bibleService.getBook({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            version_id: version.id,
          });

          if (!book) {
            throw new NotFoundError("Book not found");
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
          response: {
            200: NewConversationResponse,
            ...StandardErrors,
            404: ErrorResponse,
          },
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
          response: {
            200: SaveRatingResponse,
            ...AuthErrors,
          },
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
          response: {
            200: UpdateRatingResponse,
            ...AuthErrors,
          },
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
          response: {
            200: RatingsResponse,
            ...AuthErrors,
          },
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
          response: {
            200: LastChapterReadSaveResponse,
            ...AuthErrors,
          },
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
          response: {
            200: LastChapterReadResponse,
            ...AuthErrors,
          },
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
          response: {
            200: SaveUserMessageResponse,
            ...AuthErrors,
          },
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
            throw new NotFoundError("Invalid bible version");
          }

          const { book } = await bibleService.getBook({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            version_id: version.id,
          });

          if (!book) {
            throw new NotFoundError("Book not found");
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
          response: {
            200: SaveAiMessageResponse,
            ...AuthErrors,
            404: ErrorResponse,
          },
        },
      )
      .delete(
        "/book/delete-chat/:conversation_id",
        async ({ params, store: { chatService } }) => {
          const { conversation_id } = params;
          const disabledChat = await chatService.disableChat({
            conversation_id: Number(conversation_id),
          });
          return { disabledChat: disabledChat.chat_id ?? 0 };
        },
        {
          params: t.Pick(ChatDto, ["conversation_id"]),
          response: {
            200: DisableChatResponse,
            ...AuthErrors,
          },
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

          console.log("Attempting to get bookmarks for user:", params.user_id);
          const { favorites } = await bibleService.getBookmarks({
            id: params.user_id,
          });

          console.log(
            "Successfully retrieved bookmarks, count:",
            favorites.length,
          );
          return { favorites };
        },
        {
          params: t.Object({ user_id: t.String({ format: "uuid" }) }),
          response: {
            200: BookmarksResponse,
            ...AuthErrors,
          },
        },
      )
      .get(
        "/book/notes/:user_id",
        async ({ params, store: { bibleService } }) => {
          console.log("=== GET /book/notes/:user_id ENDPOINT ===");
          console.log("Request params:", params);

          console.log("Attempting to get notes for user:", params.user_id);
          const { notes } = await bibleService.getNotes({
            id: params.user_id,
          });

          console.log("Successfully retrieved notes, count:", notes.length);
          return { notes };
        },
        {
          params: t.Object({ user_id: t.String({ format: "uuid" }) }),
          response: {
            200: NotesResponse,
            ...AuthErrors,
          },
        },
      )
      .post(
        "/book/note/add",
        async ({ body, store: { bibleService } }) => {
          console.log("Adding note:", body);

          const content =
            typeof body.content === "string" ? body.content.trim() : "";
          if (
            !body.user_id ||
            !body.book_id ||
            !body.chapter_number ||
            !content
          ) {
            console.error("Missing required fields for adding note");
            throw new ValidationError("Missing required fields");
          }

          // Normalize verse_id: keep a number or leave undefined; repo converts to null
          const verse_id =
            typeof body.verse_id === "number" ? body.verse_id : undefined;

          const { note } = await bibleService.addNote({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            verse_id,
            content,
          });

          return { success: true, note };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
            verse_id: t.Optional(t.Number()),
            content: t.String(),
          }),
          response: {
            200: AddNoteResponse,
            ...StandardErrors,
          },
        },
      )
      .put(
        "/book/note/update",
        async ({ body, store: { bibleService } }) => {
          console.log("Updating note:", body);

          if (!body.note_id || !body.content) {
            console.error("Missing required fields for updating note");
            throw new ValidationError("Missing required fields");
          }

          const { success } = await bibleService.updateNote(
            body.note_id,
            body.content,
          );

          return { success };
        },
        {
          body: t.Object({
            note_id: t.String({ format: "uuid" }),
            content: t.String(),
          }),
          response: {
            200: UpdateNoteResponse,
            ...StandardErrors,
          },
        },
      )
      .delete(
        "/book/note/remove",
        async ({ query, store: { bibleService } }) => {
          console.log("Removing note - query params:", query);

          if (!query.note_id) {
            console.error("Missing note_id for removing note");
            throw new ValidationError("Missing note_id");
          }

          const { success } = await bibleService.deleteNote(query.note_id);

          return { success };
        },
        {
          query: t.Object({
            note_id: t.String({ format: "uuid" }),
          }),
          response: {
            200: DeleteNoteResponse,
            ...StandardErrors,
          },
        },
      )
      .post(
        "/book/bookmark/add",
        async ({ body, store: { bibleService } }) => {
          console.log("Adding bookmark:", body);

          if (
            !body.user_id ||
            !body.book_id ||
            body.chapter_number === undefined
          ) {
            console.error("Missing required fields for adding bookmark");
            throw new ValidationError("Missing required fields");
          }

          const { success } = await bibleService.addBookmark({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
          });

          return { success };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
          }),
          response: {
            200: AddBookmarkResponse,
            ...StandardErrors,
          },
        },
      )
      .delete(
        "/book/bookmark/remove",
        async ({ query, store: { bibleService } }) => {
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
            throw new ValidationError("Missing or invalid required fields");
          }

          const { success } = await bibleService.removeBookmark({
            user_id,
            book_id,
            chapter_number,
          });

          return { success };
        },
        {
          query: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.String(),
            chapter_number: t.String(),
          }),
          response: {
            200: RemoveBookmarkResponse,
            ...StandardErrors,
          },
        },
      )
      .post(
        "/book/bookmark/remove",
        async ({ body, request, store: { bibleService } }) => {
          console.log("POST method for removing bookmark:", body);
          console.log("Headers:", request.headers);

          // Check if this is meant to be a DELETE request
          const methodOverride = request.headers.get("x-http-method-override");
          if (methodOverride && methodOverride.toLowerCase() !== "delete") {
            console.warn(`Unexpected method override: ${methodOverride}`);
          }

          if (
            !body.user_id ||
            !body.book_id ||
            body.chapter_number === undefined
          ) {
            console.error("Missing required fields for removing bookmark");
            throw new ValidationError("Missing required fields");
          }

          const { success } = await bibleService.removeBookmark({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
          });

          return { success };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
          }),
          response: {
            200: RemoveBookmarkResponse,
            ...StandardErrors,
          },
        },
      )
      // Highlight endpoints
      .get(
        "/highlights/:user_id",
        async ({ params, store: { bibleService } }) => {
          console.log("=== GET /highlights/:user_id ENDPOINT ===");
          console.log("Getting all highlights for user:", params.user_id);

          const { highlights } = await bibleService.getUserHighlights({
            user_id: params.user_id,
          });

          console.log(
            "Successfully retrieved highlights, count:",
            highlights.length,
          );
          return { highlights };
        },
        {
          params: t.Object({
            user_id: t.String({ format: "uuid" }),
          }),
          response: {
            200: HighlightsResponse,
            ...AuthErrors,
          },
        },
      )
      .get(
        "/highlights/:user_id/:book_id/:chapter_number",
        async ({ params, store: { bibleService } }) => {
          console.log(
            "=== GET /highlights/:user_id/:book_id/:chapter_number ENDPOINT ===",
          );
          console.log(
            "Getting chapter highlights for user:",
            params.user_id,
            "book:",
            params.book_id,
            "chapter:",
            params.chapter_number,
          );

          const { highlights } = await bibleService.getChapterHighlights({
            user_id: params.user_id,
            book_id: params.book_id,
            chapter_number: params.chapter_number,
          });

          console.log(
            "Successfully retrieved chapter highlights, count:",
            highlights.length,
          );
          return { highlights };
        },
        {
          params: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
          }),
          response: {
            200: HighlightsResponse,
            ...AuthErrors,
          },
        },
      )
      .post(
        "/highlight/add",
        async ({ body, store: { bibleService } }) => {
          console.log("Adding highlight:", body);

          if (
            !body.user_id ||
            !body.book_id ||
            !body.chapter_number ||
            !body.start_verse ||
            !body.end_verse
          ) {
            console.error("Missing required fields for adding highlight");
            throw new ValidationError("Missing required fields");
          }

          const result = await bibleService.createHighlight({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            start_verse: body.start_verse,
            end_verse: body.end_verse,
            color: body.color as any,
            start_char: body.start_char,
            end_char: body.end_char,
            selected_text: body.selected_text,
          });

          return result;
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
            start_verse: t.Number(),
            end_verse: t.Number(),
            color: t.Optional(t.String()),
            start_char: t.Optional(t.Number()),
            end_char: t.Optional(t.Number()),
            selected_text: t.Optional(t.String()),
          }),
          response: {
            200: AddHighlightResponse,
            ...StandardErrors,
          },
        },
      )
      .put(
        "/highlight/:highlight_id",
        async ({ params, body, store: { bibleService } }) => {
          console.log(
            "Updating highlight:",
            params.highlight_id,
            "with color:",
            body.color,
          );

          const { highlight, success } =
            await bibleService.updateHighlightColor({
              highlight_id: params.highlight_id,
              user_id: body.user_id,
              color: body.color as any,
            });

          return { highlight, success };
        },
        {
          params: t.Object({
            highlight_id: t.Number(),
          }),
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            color: t.String(),
          }),
          response: {
            200: UpdateHighlightResponse,
            ...AuthErrors,
          },
        },
      )
      .delete(
        "/highlight/:highlight_id",
        async ({ params, query, store: { bibleService } }) => {
          console.log("Deleting highlight:", params.highlight_id);

          if (!query.user_id) {
            throw new ValidationError("Missing user_id");
          }

          const { success } = await bibleService.deleteHighlight({
            highlight_id: params.highlight_id,
            user_id: query.user_id,
          });

          return { success };
        },
        {
          params: t.Object({
            highlight_id: t.Number(),
          }),
          query: t.Object({
            user_id: t.String({ format: "uuid" }),
          }),
          response: {
            200: DeleteHighlightResponse,
            ...StandardErrors,
          },
        },
      ),
  );

export type BiblePlugin = typeof plugin;

export default plugin;
