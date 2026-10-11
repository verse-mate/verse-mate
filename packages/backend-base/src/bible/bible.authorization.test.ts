import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";

import authPlugin from "../auth/auth.plugin";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./bible.plugin";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe("Bible Plugin - user-scoped routes answer only the signed-in user", () => {
  const plugin = Backend.use(authPlugin);
  let owner: TestUser;
  let other: TestUser;
  let explanationId: number;
  let ownerNoteId: string;
  let ownerHighlightId: number;
  const ownerNoteContent = faker.lorem.sentence();

  const call = async (
    method: string,
    path: string,
    options: { token?: string; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    const response = await plugin.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: response.status, json };
  };

  const ownerNotes = async () => {
    const { json } = await call("GET", `/bible/book/notes/${owner.userId}`, {
      token: owner.accessToken,
    });
    return json.notes as Array<{ note_id: string; content: string }>;
  };

  const ownerFavorites = async () => {
    const { json } = await call(
      "GET",
      `/bible/book/bookmarks/${owner.userId}`,
      { token: owner.accessToken },
    );
    return json.favorites as Array<{ book_id: number; chapter_number: number }>;
  };

  const ownerHighlight = async () => {
    const { json } = await call("GET", `/bible/highlights/${owner.userId}`, {
      token: owner.accessToken,
    });
    return (
      json.highlights as Array<{ highlight_id: number; color: string }>
    ).find((h) => h.highlight_id === ownerHighlightId);
  };

  beforeAll(async () => {
    owner = await createTestUser();
    other = await createTestUser();

    const connection = plugin.store.db.getOrCreateConnection();
    const chapter = await connection
      .selectFrom("chapters")
      .select("chapter_id")
      .where("book_id", "=", 1)
      .where("chapter_number", "=", 1)
      .executeTakeFirstOrThrow();
    const explanation = await connection
      .insertInto("explanations")
      .values({
        type: ExplanationTypeEnum.summary,
        explanation: faker.lorem.paragraph(),
        chapter_id: chapter.chapter_id,
        version: 1,
        is_active: false,
        created_by_admin: true,
        parent_explanation_id: null,
        language_code: "en",
      })
      .returning("explanation_id")
      .executeTakeFirstOrThrow();
    explanationId = explanation.explanation_id;

    const note = await call("POST", "/bible/book/note/add", {
      token: owner.accessToken,
      body: {
        user_id: owner.userId,
        book_id: 1,
        chapter_number: 2,
        content: ownerNoteContent,
      },
    });
    expect(note.status).toBe(200);
    ownerNoteId = note.json.note.note_id;

    const bookmark = await call("POST", "/bible/book/bookmark/add", {
      token: owner.accessToken,
      body: { user_id: owner.userId, book_id: 1, chapter_number: 3 },
    });
    expect(bookmark.status).toBe(200);

    const highlight = await call("POST", "/bible/highlight/add", {
      token: owner.accessToken,
      body: {
        user_id: owner.userId,
        book_id: 2,
        chapter_number: 4,
        start_verse: 5,
        end_verse: 5,
        color: "yellow",
      },
    });
    expect(highlight.status).toBe(200);
    ownerHighlightId = highlight.json.highlight.highlight_id;

    const lastRead = await call("POST", "/bible/book/chapter/save-last-read", {
      token: owner.accessToken,
      body: { user_id: owner.userId, book_id: 1, chapter_number: 2 },
    });
    expect(lastRead.status).toBe(200);

    const rating = await call("POST", "/bible/book/explanation/save-rating", {
      token: owner.accessToken,
      body: {
        user: { id: owner.userId },
        book_id: 1,
        chapter_number: 1,
        explanation_id: explanationId,
        rating: 4,
      },
    });
    expect(rating.status).toBe(200);
  });

  afterAll(async () => {
    const connection = Backend.store.db.getOrCreateConnection();
    await connection
      .deleteFrom("explanation_ratings")
      .where("explanation_id", "=", explanationId)
      .execute();
    await connection
      .deleteFrom("explanations")
      .where("explanation_id", "=", explanationId)
      .execute();
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  describe("reads", () => {
    const readRoutes = () => [
      { method: "GET", path: `/bible/book/notes/${owner.userId}` },
      { method: "GET", path: `/bible/book/bookmarks/${owner.userId}` },
      { method: "GET", path: `/bible/highlights/${owner.userId}` },
      { method: "GET", path: `/bible/highlights/${owner.userId}/2/4` },
      {
        method: "POST",
        path: "/bible/book/chapter/last-read",
        body: { user_id: owner.userId },
      },
      {
        method: "POST",
        path: "/bible/book/explanation/ratings",
        body: {
          user: { id: owner.userId },
          book_id: 1,
          chapter_number: 1,
          explanation_id: explanationId,
        },
      },
    ];

    it("refuse a caller with no token", async () => {
      for (const route of readRoutes()) {
        const res = await call(route.method, route.path, { body: route.body });
        expect({ route: route.path, status: res.status }).toEqual({
          route: route.path,
          status: 401,
        });
      }
    });

    it("refuse a caller with a revoked token", async () => {
      const revoked = await createTestUser();
      const before = await call("GET", `/bible/book/notes/${revoked.userId}`, {
        token: revoked.accessToken,
      });
      expect(before.status).toBe(200);

      const logout = await call("POST", "/auth/logout", {
        token: revoked.accessToken,
      });
      expect(logout.status).toBe(200);

      const after = await call("GET", `/bible/book/notes/${revoked.userId}`, {
        token: revoked.accessToken,
      });
      expect(after.status).toBe(401);
    });

    it("refuse another signed-in user asking for the owner's data", async () => {
      for (const route of readRoutes()) {
        const res = await call(route.method, route.path, {
          token: other.accessToken,
          body: route.body,
        });
        expect({ route: route.path, status: res.status }).toEqual({
          route: route.path,
          status: 403,
        });
        expect(JSON.stringify(res.json)).not.toContain(ownerNoteContent);
      }
    });

    it("answer the owner with their own data", async () => {
      const notes = await ownerNotes();
      expect(notes.map((n) => n.note_id)).toContain(ownerNoteId);

      const favorites = await ownerFavorites();
      expect(
        favorites.some((f) => f.book_id === 1 && f.chapter_number === 3),
      ).toBe(true);

      expect(await ownerHighlight()).toBeDefined();

      const chapter = await call(
        "GET",
        `/bible/highlights/${owner.userId}/2/4`,
        {
          token: owner.accessToken,
        },
      );
      expect(chapter.status).toBe(200);
      expect(
        chapter.json.highlights.some(
          (h: { highlight_id: number }) => h.highlight_id === ownerHighlightId,
        ),
      ).toBe(true);

      const lastRead = await call("POST", "/bible/book/chapter/last-read", {
        token: owner.accessToken,
        body: { user_id: owner.userId },
      });
      expect(lastRead.status).toBe(200);
      expect(lastRead.json.result).toBeTruthy();

      const ratings = await call("POST", "/bible/book/explanation/ratings", {
        token: owner.accessToken,
        body: {
          user: { id: owner.userId },
          book_id: 1,
          chapter_number: 1,
          explanation_id: explanationId,
        },
      });
      expect(ratings.status).toBe(200);
      expect(ratings.json.userRating).toBe(4);
    });
  });

  describe("writes that name a user", () => {
    const writeRoutes = () => [
      {
        method: "POST",
        path: "/bible/book/note/add",
        body: {
          user_id: owner.userId,
          book_id: 1,
          chapter_number: 5,
          content: faker.lorem.sentence(),
        },
      },
      {
        method: "POST",
        path: "/bible/book/bookmark/add",
        body: { user_id: owner.userId, book_id: 1, chapter_number: 6 },
      },
      {
        method: "POST",
        path: "/bible/book/bookmark/remove",
        body: { user_id: owner.userId, book_id: 1, chapter_number: 3 },
      },
      {
        method: "DELETE",
        path: `/bible/book/bookmark/remove?user_id=${owner.userId}&book_id=1&chapter_number=3`,
      },
      {
        method: "POST",
        path: "/bible/highlight/add",
        body: {
          user_id: owner.userId,
          book_id: 2,
          chapter_number: 7,
          start_verse: 1,
          end_verse: 1,
          color: "green",
        },
      },
      {
        method: "PUT",
        path: `/bible/highlight/${ownerHighlightId}`,
        body: { user_id: owner.userId, color: "blue" },
      },
      {
        method: "POST",
        path: "/bible/book/chapter/save-last-read",
        body: { user_id: owner.userId, book_id: 9, chapter_number: 9 },
      },
      {
        method: "POST",
        path: "/bible/book/explanation/save-rating",
        body: {
          user: { id: owner.userId },
          book_id: 1,
          chapter_number: 1,
          explanation_id: explanationId,
          rating: 1,
        },
      },
      {
        method: "PUT",
        path: "/bible/book/explanation/update-rating",
        body: {
          user: { id: owner.userId },
          book_id: 1,
          chapter_number: 1,
          explanation_id: explanationId,
          rating: 1,
        },
      },
    ];

    const expectOwnerDataUntouched = async () => {
      const notes = await ownerNotes();
      expect(notes.length).toBe(1);
      expect(notes[0].content).toBe(ownerNoteContent);

      const favorites = await ownerFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0]).toMatchObject({ book_id: 1, chapter_number: 3 });

      expect((await ownerHighlight())?.color).toBe("yellow");
      const highlights = await call(
        "GET",
        `/bible/highlights/${owner.userId}`,
        { token: owner.accessToken },
      );
      expect(highlights.json.highlights.length).toBe(1);

      const lastRead = await call("POST", "/bible/book/chapter/last-read", {
        token: owner.accessToken,
        body: { user_id: owner.userId },
      });
      expect(lastRead.json.result.book_id).toBe(1);

      const ratings = await call("POST", "/bible/book/explanation/ratings", {
        token: owner.accessToken,
        body: {
          user: { id: owner.userId },
          book_id: 1,
          chapter_number: 1,
          explanation_id: explanationId,
        },
      });
      expect(ratings.json.userRating).toBe(4);
    };

    it("refuse a caller with no token and change nothing", async () => {
      for (const route of writeRoutes()) {
        const res = await call(route.method, route.path, { body: route.body });
        expect({ route: route.path, status: res.status }).toEqual({
          route: route.path,
          status: 401,
        });
      }
      await expectOwnerDataUntouched();
    });

    it("refuse another signed-in user writing as the owner and change nothing", async () => {
      for (const route of writeRoutes()) {
        const res = await call(route.method, route.path, {
          token: other.accessToken,
          body: route.body,
        });
        expect({ route: route.path, status: res.status }).toEqual({
          route: route.path,
          status: 403,
        });
      }
      await expectOwnerDataUntouched();
    });
  });

  describe("writes that name a note or highlight by id", () => {
    it("refuse a caller with no token and change nothing", async () => {
      const update = await call("PUT", "/bible/book/note/update", {
        body: { note_id: ownerNoteId, content: faker.lorem.sentence() },
      });
      expect(update.status).toBe(401);

      const remove = await call(
        "DELETE",
        `/bible/book/note/remove?note_id=${ownerNoteId}`,
      );
      expect(remove.status).toBe(401);

      const color = await call("PUT", `/bible/highlight/${ownerHighlightId}`, {
        body: { color: "red" },
      });
      expect(color.status).toBe(401);

      const notes = await ownerNotes();
      expect(notes.find((n) => n.note_id === ownerNoteId)?.content).toBe(
        ownerNoteContent,
      );
      expect((await ownerHighlight())?.color).toBe("yellow");
    });

    it("do not let another user change or delete the owner's note or highlight", async () => {
      const update = await call("PUT", "/bible/book/note/update", {
        token: other.accessToken,
        body: { note_id: ownerNoteId, content: faker.lorem.sentence() },
      });
      expect(update.status).toBe(200);
      expect(update.json.success).toBe(false);

      const remove = await call(
        "DELETE",
        `/bible/book/note/remove?note_id=${ownerNoteId}`,
        { token: other.accessToken },
      );
      expect(remove.status).toBe(200);
      expect(remove.json.success).toBe(false);

      const color = await call("PUT", `/bible/highlight/${ownerHighlightId}`, {
        token: other.accessToken,
        body: { color: "red" },
      });
      expect(color.status).toBe(200);
      expect(color.json.success).toBe(false);

      const removeHighlight = await call(
        "DELETE",
        `/bible/highlight/${ownerHighlightId}`,
        { token: other.accessToken },
      );
      expect(removeHighlight.status).toBe(200);
      expect(removeHighlight.json.success).toBe(false);

      const notes = await ownerNotes();
      expect(notes.find((n) => n.note_id === ownerNoteId)?.content).toBe(
        ownerNoteContent,
      );
      expect((await ownerHighlight())?.color).toBe("yellow");
    });

    it("let the owner change their own highlight with or without user_id in the body", async () => {
      const withId = await call("PUT", `/bible/highlight/${ownerHighlightId}`, {
        token: owner.accessToken,
        body: { user_id: owner.userId, color: "green" },
      });
      expect(withId.status).toBe(200);
      expect(withId.json.success).toBe(true);

      const withoutId = await call(
        "PUT",
        `/bible/highlight/${ownerHighlightId}`,
        { token: owner.accessToken, body: { color: "yellow" } },
      );
      expect(withoutId.status).toBe(200);
      expect(withoutId.json.success).toBe(true);
      expect((await ownerHighlight())?.color).toBe("yellow");
    });

    it("let the owner update and delete their own note", async () => {
      const added = await call("POST", "/bible/book/note/add", {
        token: owner.accessToken,
        body: {
          user_id: owner.userId,
          book_id: 3,
          chapter_number: 1,
          content: faker.lorem.sentence(),
        },
      });
      const noteId = added.json.note.note_id;
      const newContent = faker.lorem.sentence();

      const update = await call("PUT", "/bible/book/note/update", {
        token: owner.accessToken,
        body: { note_id: noteId, content: newContent },
      });
      expect(update.json.success).toBe(true);
      expect(
        (await ownerNotes()).find((n) => n.note_id === noteId)?.content,
      ).toBe(newContent);

      const remove = await call(
        "DELETE",
        `/bible/book/note/remove?note_id=${noteId}`,
        { token: owner.accessToken },
      );
      expect(remove.json.success).toBe(true);
      expect((await ownerNotes()).some((n) => n.note_id === noteId)).toBe(
        false,
      );
    });
  });

  describe("the owner's own writes", () => {
    it("remove a bookmark through POST and through DELETE", async () => {
      for (const chapter of [10, 11]) {
        const add = await call("POST", "/bible/book/bookmark/add", {
          token: owner.accessToken,
          body: { user_id: owner.userId, book_id: 1, chapter_number: chapter },
        });
        expect(add.status).toBe(200);
      }

      const viaPost = await call("POST", "/bible/book/bookmark/remove", {
        token: owner.accessToken,
        body: { user_id: owner.userId, book_id: 1, chapter_number: 10 },
      });
      expect(viaPost.status).toBe(200);
      expect(viaPost.json.success).toBe(true);

      const viaDelete = await call(
        "DELETE",
        `/bible/book/bookmark/remove?user_id=${owner.userId}&book_id=1&chapter_number=11`,
        { token: owner.accessToken },
      );
      expect(viaDelete.status).toBe(200);
      expect(viaDelete.json.success).toBe(true);

      const chapters = (await ownerFavorites())
        .filter((f) => f.book_id === 1)
        .map((f) => f.chapter_number);
      expect(chapters).not.toContain(10);
      expect(chapters).not.toContain(11);
    });

    it("update their rating and last-read chapter", async () => {
      const update = await call(
        "PUT",
        "/bible/book/explanation/update-rating",
        {
          token: owner.accessToken,
          body: {
            user: { id: owner.userId },
            book_id: 1,
            chapter_number: 1,
            explanation_id: explanationId,
            rating: 2,
          },
        },
      );
      expect(update.status).toBe(200);

      const ratings = await call("POST", "/bible/book/explanation/ratings", {
        token: owner.accessToken,
        body: {
          user: { id: owner.userId },
          book_id: 1,
          chapter_number: 1,
          explanation_id: explanationId,
        },
      });
      expect(ratings.json.userRating).toBe(2);

      const save = await call("POST", "/bible/book/chapter/save-last-read", {
        token: owner.accessToken,
        body: { user_id: owner.userId, book_id: 2, chapter_number: 3 },
      });
      expect(save.status).toBe(200);

      const lastRead = await call("POST", "/bible/book/chapter/last-read", {
        token: owner.accessToken,
        body: { user_id: owner.userId },
      });
      expect(lastRead.json.result.book_id).toBe(2);
    });

    it("accept their own id written in upper case", async () => {
      const res = await call(
        "GET",
        `/bible/book/notes/${owner.userId.toUpperCase()}`,
        { token: owner.accessToken },
      );
      expect(res.status).toBe(200);
    });

    it("cannot set the admin override on their own theme preference", async () => {
      const themes = await call("GET", "/bible/highlight-themes");
      const themeId = themes.json.data[0]?.theme_id;
      expect(themeId).toBeDefined();

      const patch = await call(
        "PATCH",
        `/bible/user/theme-preferences/${themeId}`,
        {
          token: owner.accessToken,
          body: { is_enabled: true, admin_override: true },
        },
      );
      expect(patch.status).toBe(200);

      const prefs = await call("GET", "/bible/user/theme-preferences", {
        token: owner.accessToken,
      });
      const pref = prefs.json.data.find(
        (p: { theme_id: number }) => p.theme_id === themeId,
      );
      expect(pref).toBeDefined();
      expect(pref.admin_override).not.toBe(true);
    });
  });
});
