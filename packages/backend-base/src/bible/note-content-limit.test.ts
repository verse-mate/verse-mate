import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import cacheConstants from "../shared/cache.constants";
import shared from "../shared/shared.plugin";
import plugin from "./bible.plugin";

const LIMIT = 20_000;
const conn = shared.store.db.getOrCreateConnection();
const cache = shared.store.cache;

let userId: string;
let token: string;

function send(method: "POST" | "PUT", path: string, body: unknown) {
  return plugin.handle(
    new Request(`http://localhost/bible/book/note/${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

function addNote(content: string) {
  return send("POST", "add", {
    user_id: userId,
    book_id: 1,
    chapter_number: 1,
    content,
  });
}

function notesOfUser() {
  return conn
    .selectFrom("notes")
    .select(["note_id", "content"])
    .where("user_id", "=", userId)
    .execute();
}

beforeAll(async () => {
  const user = await conn
    .insertInto("user")
    .values({
      email: `notes-${faker.string.uuid()}@example.test`,
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

describe("note content length", () => {
  it("refuses a new note longer than the limit with 422", async () => {
    const response = await addNote("a".repeat(LIMIT + 1));
    expect(response.status).toBe(422);
    expect(await notesOfUser()).toHaveLength(0);
  });

  it("stores a new note at the limit", async () => {
    const response = await addNote("a".repeat(LIMIT));
    expect(response.status).toBe(200);
    expect(await notesOfUser()).toHaveLength(1);
  });

  it("refuses an update longer than the limit with 422", async () => {
    const [note] = await notesOfUser();
    const response = await send("PUT", "update", {
      note_id: note.note_id,
      content: "b".repeat(LIMIT + 1),
    });
    expect(response.status).toBe(422);
    const [after] = await notesOfUser();
    expect(after.content).toBe(note.content);
  });
});
