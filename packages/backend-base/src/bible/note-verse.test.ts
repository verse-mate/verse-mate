import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import cacheConstants from "../shared/cache.constants";
import shared from "../shared/shared.plugin";
import plugin from "./bible.plugin";

/**
 * A note on one verse, by number. The mobile reader's selection menu offers Note on the words a
 * reader selected, and clients only know verse numbers, not the verse row ids `verse_id` wants.
 */

const conn = shared.store.db.getOrCreateConnection();
const cache = shared.store.cache;

let userId: string;
let token: string;

function addNote(body: Record<string, unknown>) {
  return plugin.handle(
    new Request("http://localhost/bible/book/note/add", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: userId,
        book_id: 43,
        chapter_number: 1,
        ...body,
      }),
    }),
  );
}

function listNotes() {
  return plugin.handle(
    new Request(`http://localhost/bible/book/notes/${userId}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

beforeAll(async () => {
  const user = await conn
    .insertInto("user")
    .values({
      email: `verse-notes-${faker.string.uuid()}@example.test`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      emailVerified: true,
      password: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  userId = user.id;
  token = await (shared as any).decorator.jwt.sign({ sub: userId });
  await cache.set(cacheConstants.accessToken(userId), [token], "15m");
});

afterAll(async () => {
  await conn.deleteFrom("notes").where("user_id", "=", userId).execute();
  await cache.delete(cacheConstants.accessToken(userId));
  await conn.deleteFrom("user").where("id", "=", userId).execute();
});

describe("a note on a verse by number", () => {
  it("stores the verse and returns its number", async () => {
    const response = await addNote({ verse_number: 5, content: "the light" });
    expect(response.status).toBe(200);
    const { note } = await response.json();
    expect(note.verse_number).toBe(5);
    expect(typeof note.verse_id).toBe("number");
  });

  it("lists the note with its verse number", async () => {
    await addNote({ verse_number: 14, content: "became flesh" });
    const { notes } = await (await listNotes()).json();
    const listed = notes.find(
      (n: { content: string }) => n.content === "became flesh",
    );
    expect(listed?.verse_number).toBe(14);
  });

  it("keeps a note without a verse on the whole chapter", async () => {
    const response = await addNote({ content: "chapter note" });
    expect(response.status).toBe(200);
    const { note } = await response.json();
    expect(note.verse_id).toBeNull();
    expect(note.verse_number).toBeNull();
  });

  it("refuses a verse the chapter does not have, storing nothing", async () => {
    const response = await addNote({ verse_number: 999, content: "nowhere" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    const stored = await conn
      .selectFrom("notes")
      .select("note_id")
      .where("user_id", "=", userId)
      .where("content", "=", "nowhere")
      .execute();
    expect(stored).toHaveLength(0);
  });

  it("refuses a verse number below 1", async () => {
    const response = await addNote({ verse_number: 0, content: "zero" });
    expect(response.status).toBe(422);
  });
});
