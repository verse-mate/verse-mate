import { afterEach, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { sql } from "database";
import { down } from "database/migrations/20261011000000-user-confirmation-stamp";

import shared from "../shared/shared.plugin";

const conn = shared.store.db.getOrCreateConnection();
const FLAG = "ROLLBACK_DISCARD_CONFIRMATION_STAMPS";
const savedFlag = process.env[FLAG];
let created: string[] = [];

class RolledBack extends Error {}

afterEach(async () => {
  if (savedFlag === undefined) Reflect.deleteProperty(process.env, FLAG);
  else process.env[FLAG] = savedFlag;
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

async function stampedAccount() {
  const { id } = await conn
    .insertInto("user")
    .values({
      email: `stamp-${faker.string.uuid()}@example.test`,
      firstName: "S",
      lastName: "M",
      emailVerified: true,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
}

async function downThenRollBack() {
  let columnLeft: number | undefined;
  const outcome = await conn
    .transaction()
    .execute(async (trx) => {
      await down(trx as never);
      const { rows } = await sql<{ n: number }>`
        select count(*)::int as n from information_schema.columns
        where table_name = 'user' and column_name = 'email_verified_at'
      `.execute(trx);
      columnLeft = rows[0].n;
      throw new RolledBack();
    })
    .catch((error: unknown) => error);
  return { outcome, columnLeft };
}

describe("the confirmation stamp migration's down", () => {
  it("refuses while any account carries a stamp", async () => {
    await stampedAccount();
    Reflect.deleteProperty(process.env, FLAG);

    const { outcome, columnLeft } = await downThenRollBack();

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(RolledBack);
    expect(String((outcome as Error).message)).toContain(FLAG);
    expect(columnLeft).toBeUndefined();
  });

  it("drops the stamps when the rollback flag is set", async () => {
    await stampedAccount();
    process.env[FLAG] = "1";

    const { outcome, columnLeft } = await downThenRollBack();

    expect(outcome).toBeInstanceOf(RolledBack);
    expect(columnLeft).toBe(0);
  });
});
