import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { sql } from "database";
import {
  down,
  up,
} from "database/migrations/20261029120000-highlight-char-range-across-verses";
import type Database from "database/src/models/Database";
import type { Transaction } from "kysely";

import shared from "../shared/shared.plugin";

const conn = shared.store.db.getOrCreateConnection();
let userId: string;
let chapterId: number;

class RolledBack extends Error {}

/** Runs `body` in a transaction that is always rolled back. */
async function rolledBack(body: (trx: Transaction<Database>) => Promise<void>) {
  const outcome = await conn
    .transaction()
    .execute(async (trx) => {
      await body(trx);
      throw new RolledBack();
    })
    .catch((error: unknown) => error);
  if (!(outcome instanceof RolledBack)) throw outcome;
}

const insert = (
  trx: Transaction<Database>,
  r: {
    start_verse: number;
    end_verse: number;
    start_char: number | null;
    end_char: number | null;
  },
) =>
  trx
    .insertInto("verse_highlights")
    .values({
      user_id: userId,
      chapter_id: chapterId,
      book_id: 1,
      chapter_number: 1,
      ...r,
    })
    .returning("highlight_id")
    .executeTakeFirstOrThrow();

/** Inserts inside a savepoint; resolves to the constraint error or null. */
async function attempt(
  trx: Transaction<Database>,
  r: Parameters<typeof insert>[1],
): Promise<string | null> {
  await sql`SAVEPOINT attempt`.execute(trx);
  try {
    await insert(trx, r);
    await sql`RELEASE SAVEPOINT attempt`.execute(trx);
    return null;
  } catch (error) {
    await sql`ROLLBACK TO SAVEPOINT attempt`.execute(trx);
    return error instanceof Error ? error.message : String(error);
  }
}

const acrossVerses = {
  start_verse: 12,
  start_char: 30,
  end_verse: 13,
  end_char: 5,
};

beforeAll(async () => {
  ({ id: userId } = await conn
    .insertInto("user")
    .values({
      email: `highlight-range-${faker.string.uuid()}@example.test`,
      firstName: "H",
      lastName: "R",
    })
    .returning("id")
    .executeTakeFirstOrThrow());
  ({ chapter_id: chapterId } = await conn
    .selectFrom("chapters")
    .select("chapter_id")
    .where("book_id", "=", 1)
    .where("chapter_number", "=", 1)
    .executeTakeFirstOrThrow());
});

afterAll(async () => {
  await conn.deleteFrom("user").where("id", "=", userId).execute();
});

describe("check_valid_char_range after 20261029120000", () => {
  it("accepts start_char > end_char across verses", async () => {
    await rolledBack(async (trx) => {
      expect(await attempt(trx, acrossVerses)).toBeNull();
    });
  });

  it("still refuses a backwards range within one verse, and one offset without the other", async () => {
    await rolledBack(async (trx) => {
      for (const bad of [
        { start_verse: 14, start_char: 20, end_verse: 14, end_char: 5 },
        { start_verse: 14, start_char: 20, end_verse: 15, end_char: null },
        { start_verse: 14, start_char: null, end_verse: 15, end_char: 5 },
      ]) {
        expect(await attempt(trx, bad)).toContain("check_valid_char_range");
      }
      expect(
        await attempt(trx, {
          start_verse: 14,
          start_char: -1,
          end_verse: 15,
          end_char: 5,
        }),
      ).toContain("check_non_negative_chars");
    });
  });

  it("down restores the old rule for new rows without touching rows saved under the new one, and up returns", async () => {
    await rolledBack(async (trx) => {
      const kept = await insert(trx, acrossVerses);

      await down(trx);
      expect(await attempt(trx, acrossVerses)).toContain(
        "check_valid_char_range",
      );
      const survivor = await trx
        .selectFrom("verse_highlights")
        .select(["start_char", "end_char"])
        .where("highlight_id", "=", kept.highlight_id)
        .executeTakeFirstOrThrow();
      expect(survivor).toEqual({ start_char: 30, end_char: 5 });

      await up(trx);
      expect(await attempt(trx, acrossVerses)).toBeNull();
      const { rows } = await sql<{ def: string; validated: boolean }>`
        SELECT pg_get_constraintdef(oid) AS def, convalidated AS validated
        FROM pg_constraint
        WHERE conrelid = 'verse_highlights'::regclass
          AND conname = 'check_valid_char_range'
      `.execute(trx);
      expect(rows).toHaveLength(1);
      expect(rows[0].validated).toBe(true);
      expect(rows[0].def).toContain("start_verse < end_verse");
    });
  });
});
