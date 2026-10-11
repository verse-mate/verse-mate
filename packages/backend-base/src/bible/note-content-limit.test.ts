import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
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
    const stored = await notesOfUser();
    expect(stored.some((n) => n.content.length === LIMIT)).toBe(true);
  });

  it("refuses an update longer than the limit with 422", async () => {
    await addNote("original");
    const note = (await notesOfUser()).find((n) => n.content === "original");
    if (!note) throw new Error("note was not stored");
    const response = await send("PUT", "update", {
      note_id: note.note_id,
      content: "b".repeat(LIMIT + 1),
    });
    expect(response.status).toBe(422);
    const after = (await notesOfUser()).find((n) => n.note_id === note.note_id);
    expect(after?.content).toBe("original");
  });

  it("stores an update at the limit", async () => {
    await addNote("short");
    const note = (await notesOfUser()).find((n) => n.content === "short");
    if (!note) throw new Error("note was not stored");
    const response = await send("PUT", "update", {
      note_id: note.note_id,
      content: "c".repeat(LIMIT),
    });
    expect(response.status).toBe(200);
    const after = (await notesOfUser()).find((n) => n.note_id === note.note_id);
    expect(after?.content).toBe("c".repeat(LIMIT));
  });

  it("counts the limit in UTF-16 code units", async () => {
    const over = await addNote("\u{1F600}".repeat(LIMIT / 2 + 1));
    expect(over.status).toBe(422);
    const atLimit = await addNote("\u{1F600}".repeat(LIMIT / 2));
    expect(atLimit.status).toBe(200);
  });
});

describe("note text in server logs", () => {
  it("leaves the note text out of what adding and updating a note logs", async () => {
    const marker = `private-${faker.string.alphanumeric(24)}`;
    const updated = `${marker}-updated`;
    const logged: unknown[] = [];
    const spies = (["log", "info", "error", "warn"] as const).map((level) =>
      spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      }),
    );
    try {
      const added = await addNote(marker);
      expect(added.status).toBe(200);
      const note = (await notesOfUser()).find((n) => n.content === marker);
      if (!note) throw new Error("note was not stored");
      const response = await send("PUT", "update", {
        note_id: note.note_id,
        content: updated,
      });
      expect(response.status).toBe(200);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const text = logged
      .map((arg) => (typeof arg === "string" ? arg : Bun.inspect(arg)))
      .join("\n");
    expect(text).not.toContain(marker);
  });
});
