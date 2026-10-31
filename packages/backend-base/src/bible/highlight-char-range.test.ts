import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import authPlugin from "../auth/auth.plugin";
import { OfflineRepository } from "../offline/offline.repository";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./bible.plugin";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
type Highlight = {
  highlight_id: number;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  start_char: number | null;
  end_char: number | null;
  color: string;
  selected_text: string | null;
};
type AddBody = {
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  start_char?: number;
  end_char?: number;
  color?: string;
  selected_text?: string;
};

// Genesis; every test works in a chapter of its own so their highlights never
// meet.
const BOOK = 1;

describe("char-precise highlights", () => {
  const plugin = new Elysia().use(Backend).use(authPlugin);
  let user: TestUser;
  let other: TestUser;

  const call = async (
    method: string,
    path: string,
    as: TestUser,
    body?: unknown,
  ) => {
    const response = await plugin.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          authorization: `Bearer ${as.accessToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: response.status, json: (await response.json()) as any };
  };

  const add = (body: AddBody, as: TestUser = user) =>
    call("POST", "/bible/highlight/add", as, {
      user_id: as.userId,
      book_id: BOOK,
      ...body,
    });

  /** Adds and asserts it was saved; returns the saved highlight. */
  const added = async (body: AddBody, as: TestUser = user) => {
    const { status, json } = await add(body, as);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    return json.highlight as Highlight;
  };

  const chapter = async (chapterNumber: number, as: TestUser = user) => {
    const { status, json } = await call(
      "GET",
      `/bible/highlights/${as.userId}/${BOOK}/${chapterNumber}`,
      as,
    );
    expect(status).toBe(200);
    return (json.highlights as Highlight[]).sort(
      (a, b) => a.highlight_id - b.highlight_id,
    );
  };

  const range = (
    h: Pick<Highlight, "start_verse" | "start_char" | "end_verse" | "end_char">,
  ) => ({
    start_verse: h.start_verse,
    start_char: h.start_char,
    end_verse: h.end_verse,
    end_char: h.end_char,
  });

  beforeAll(async () => {
    user = await createTestUser();
    other = await createTestUser();
  });

  afterAll(async () => {
    await Backend.store.db
      .getOrCreateConnection()
      .deleteFrom("verse_highlights")
      .where("user_id", "in", [user.userId, other.userId])
      .execute();
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  it("a highlight across verses keeps start_char > end_char, on add and on every read", async () => {
    const sent = {
      start_verse: 12,
      start_char: 30,
      end_verse: 13,
      end_char: 5,
    };
    const { status, json } = await add({ chapter_number: 1, ...sent });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(range(json.highlight)).toEqual(sent);
    expect(json.merged_highlight_ids).toEqual([]);
    const id = json.highlight.highlight_id;

    const inChapter = await chapter(1);
    expect(inChapter.map(range)).toEqual([sent]);

    const all = await call("GET", `/bible/highlights/${user.userId}`, user);
    expect(all.status).toBe(200);
    const fromAll = (all.json.highlights as Highlight[]).find(
      (h) => h.highlight_id === id,
    );
    expect(fromAll && range(fromAll)).toEqual(sent);

    const offline = await new OfflineRepository(
      Backend.store.db,
    ).getAllUserHighlights(user.userId);
    const fromOffline = offline.find((h) => h.highlight_id === id);
    expect(fromOffline && range(fromOffline)).toEqual(sent);
  });

  it("a backwards range within one verse is stored the right way round", async () => {
    const saved = await added({
      chapter_number: 2,
      start_verse: 14,
      end_verse: 14,
      start_char: 20,
      end_char: 5,
    });

    expect(range(saved)).toEqual({
      start_verse: 14,
      start_char: 5,
      end_verse: 14,
      end_char: 20,
    });
    expect((await chapter(2)).map(range)).toEqual([range(saved)]);
  });

  it("a highlight overlapping another merges with it, in the new color", async () => {
    const first = await added({
      chapter_number: 3,
      start_verse: 3,
      end_verse: 3,
      start_char: 5,
      end_char: 15,
      color: "yellow",
      selected_text: "in the beg",
    });

    const { status, json } = await add({
      chapter_number: 3,
      start_verse: 3,
      end_verse: 3,
      start_char: 10,
      end_char: 25,
      color: "green",
      selected_text: "beginning God c",
    });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.merged_highlight_ids).toEqual([first.highlight_id]);
    expect(range(json.highlight)).toEqual({
      start_verse: 3,
      start_char: 5,
      end_verse: 3,
      end_char: 25,
    });
    expect(json.highlight.color).toBe("green");
    // The union is neither selection: its text is unknown here.
    expect(json.highlight.selected_text).toBeNull();

    const rows = await chapter(3);
    expect(rows.map((h) => h.highlight_id)).toEqual([
      json.highlight.highlight_id,
    ]);
  });

  it("a highlight overlapping two others merges all three across verses, and leaves the rest", async () => {
    const a = await added({
      chapter_number: 4,
      start_verse: 5,
      end_verse: 5,
      start_char: 10,
      end_char: 20,
    });
    const b = await added({
      chapter_number: 4,
      start_verse: 6,
      start_char: 30,
      end_verse: 7,
      end_char: 4,
    });
    const untouched = await added({
      chapter_number: 4,
      start_verse: 7,
      end_verse: 7,
      start_char: 10,
      end_char: 20,
    });

    const { json } = await add({
      chapter_number: 4,
      start_verse: 5,
      start_char: 15,
      end_verse: 6,
      end_char: 35,
      color: "blue",
    });

    expect(json.success).toBe(true);
    expect([...json.merged_highlight_ids].sort()).toEqual(
      [a.highlight_id, b.highlight_id].sort(),
    );
    expect(range(json.highlight)).toEqual({
      start_verse: 5,
      start_char: 10,
      end_verse: 7,
      end_char: 4,
    });
    expect(json.highlight.color).toBe("blue");

    const rows = await chapter(4);
    expect(rows.map((h) => h.highlight_id)).toEqual([
      untouched.highlight_id,
      json.highlight.highlight_id,
    ]);
    expect(range(rows[0])).toEqual(range(untouched));
  });

  it("a selection inside a highlight recolors that whole highlight and keeps its text; one covering it keeps the new text", async () => {
    const outer = await added({
      chapter_number: 5,
      start_verse: 2,
      end_verse: 2,
      start_char: 0,
      end_char: 30,
      color: "yellow",
      selected_text: "And the earth was without form",
    });
    const inside = await add({
      chapter_number: 5,
      start_verse: 2,
      end_verse: 2,
      start_char: 5,
      end_char: 10,
      color: "pink",
      selected_text: "he ea",
    });
    expect(inside.json.merged_highlight_ids).toEqual([outer.highlight_id]);
    expect(range(inside.json.highlight)).toEqual(range(outer));
    expect(inside.json.highlight.color).toBe("pink");
    expect(inside.json.highlight.selected_text).toBe(
      "And the earth was without form",
    );

    const small = await added({
      chapter_number: 5,
      start_verse: 4,
      end_verse: 4,
      start_char: 5,
      end_char: 10,
      selected_text: "small",
    });
    const covering = await add({
      chapter_number: 5,
      start_verse: 4,
      end_verse: 4,
      start_char: 0,
      end_char: 20,
      selected_text: "the whole selection.",
    });
    expect(covering.json.merged_highlight_ids).toEqual([small.highlight_id]);
    expect(covering.json.highlight.selected_text).toBe("the whole selection.");

    expect(await chapter(5)).toHaveLength(2);
  });

  it("ranges that only touch are both kept, within a verse and across verses", async () => {
    const touching = [
      { start_verse: 9, start_char: 0, end_verse: 9, end_char: 10 },
      { start_verse: 9, start_char: 10, end_verse: 9, end_char: 20 },
      { start_verse: 10, start_char: 5, end_verse: 11, end_char: 8 },
      { start_verse: 11, start_char: 8, end_verse: 12, end_char: 3 },
    ];
    for (const r of touching) {
      const { json } = await add({ chapter_number: 6, ...r });
      expect(json.success).toBe(true);
      expect(json.merged_highlight_ids).toEqual([]);
    }

    expect((await chapter(6)).map(range)).toEqual(touching);
  });

  it("whole-verse highlights neither block nor merge with char-precise ones: they layer", async () => {
    const whole = await added({
      chapter_number: 7,
      start_verse: 16,
      end_verse: 17,
    });
    expect(whole.start_char).toBeNull();

    const within = await add({
      chapter_number: 7,
      start_verse: 16,
      end_verse: 16,
      start_char: 3,
      end_char: 9,
    });
    expect(within.json.success).toBe(true);
    expect(within.json.merged_highlight_ids).toEqual([]);

    const across = await add({
      chapter_number: 7,
      start_verse: 17,
      start_char: 12,
      end_verse: 18,
      end_char: 6,
    });
    expect(across.json.success).toBe(true);
    expect(across.json.merged_highlight_ids).toEqual([]);

    const rows = await chapter(7);
    expect(rows.map((h) => h.highlight_id)).toEqual([
      whole.highlight_id,
      within.json.highlight.highlight_id,
      across.json.highlight.highlight_id,
    ]);
    expect(range(rows[0])).toEqual({
      start_verse: 16,
      start_char: null,
      end_verse: 17,
      end_char: null,
    });
  });

  it("only the same user's highlights in the same chapter merge", async () => {
    const r = { start_verse: 1, start_char: 0, end_verse: 1, end_char: 10 };
    const othersHighlight = await added({ chapter_number: 8, ...r }, other);
    const otherChapter = await added({ chapter_number: 9, ...r });

    const { json } = await add({
      chapter_number: 8,
      start_verse: 1,
      start_char: 5,
      end_verse: 1,
      end_char: 15,
    });
    expect(json.success).toBe(true);
    expect(json.merged_highlight_ids).toEqual([]);

    expect((await chapter(8, other)).map((h) => h.highlight_id)).toEqual([
      othersHighlight.highlight_id,
    ]);
    expect((await chapter(9)).map((h) => h.highlight_id)).toEqual([
      otherChapter.highlight_id,
    ]);
  });

  it("two overlapping adds sent at once end as one highlight", async () => {
    const [one, two] = await Promise.all([
      add({
        chapter_number: 10,
        start_verse: 1,
        end_verse: 1,
        start_char: 0,
        end_char: 10,
      }),
      add({
        chapter_number: 10,
        start_verse: 1,
        end_verse: 1,
        start_char: 5,
        end_char: 15,
      }),
    ]);
    expect(one.json.success).toBe(true);
    expect(two.json.success).toBe(true);

    expect((await chapter(10)).map(range)).toEqual([
      { start_verse: 1, start_char: 0, end_verse: 1, end_char: 15 },
    ]);
  });

  describe("whole-verse highlights (no offsets) behave as before", () => {
    it("are saved without merged_highlight_ids", async () => {
      const { status, json } = await add({
        chapter_number: 11,
        start_verse: 20,
        end_verse: 20,
      });
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(json).not.toHaveProperty("merged_highlight_ids");
      expect(range(json.highlight)).toEqual({
        start_verse: 20,
        start_char: null,
        end_verse: 20,
        end_char: null,
      });
    });

    it("are refused when they share a verse with any highlight, char-precise ones included", async () => {
      const sharing = await add({
        chapter_number: 11,
        start_verse: 19,
        end_verse: 20,
      });
      expect(sharing.status).toBe(200);
      expect(sharing.json.success).toBe(false);
      expect(sharing.json.error).toBe(
        "Highlight overlaps with existing highlights",
      );
      expect(sharing.json.overlaps).toHaveLength(1);

      await added({
        chapter_number: 11,
        start_verse: 24,
        end_verse: 24,
        start_char: 0,
        end_char: 5,
      });
      const overPartial = await add({
        chapter_number: 11,
        start_verse: 24,
        end_verse: 24,
      });
      expect(overPartial.json.success).toBe(false);

      const apart = await add({
        chapter_number: 11,
        start_verse: 22,
        end_verse: 22,
      });
      expect(apart.json.success).toBe(true);

      expect((await chapter(11)).map(range)).toEqual([
        { start_verse: 20, start_char: null, end_verse: 20, end_char: null },
        { start_verse: 24, start_char: 0, end_verse: 24, end_char: 5 },
        { start_verse: 22, start_char: null, end_verse: 22, end_char: null },
      ]);
    });
  });
});
