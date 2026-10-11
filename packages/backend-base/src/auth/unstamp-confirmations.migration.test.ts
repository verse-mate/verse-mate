import { afterEach, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { sql } from "database";
import { up } from "database/migrations/20261011130000-unstamp-confirmations-kept-with-foreign-links";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import shared from "../shared/shared.plugin";

const conn = shared.store.db.getOrCreateConnection();
let created: string[] = [];

class RolledBack extends Error {}

afterEach(async () => {
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

async function stamped(options: { linkedFor?: string; stampedAt?: string }) {
  const email = `unstamp-${faker.string.uuid()}@example.test`;
  const { id } = await conn
    .insertInto("user")
    .values({ email, firstName: "U", lastName: "S", emailVerified: true })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  if (options.stampedAt)
    await conn
      .updateTable("user")
      .set({ email_verified_at: new Date(options.stampedAt) })
      .where("id", "=", id)
      .execute();
  await conn
    .insertInto("user_sso_accounts")
    .values({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `unstamp-${id}`,
      email: options.linkedFor ?? email.toUpperCase(),
    })
    .execute();
  return id;
}

async function stampsAfterUp(ids: string[]) {
  let stamps: Array<{ id: string; email_verified_at: Date | null }> = [];
  const outcome = await conn
    .transaction()
    .execute(async (trx) => {
      await up(trx as never);
      stamps = await trx
        .selectFrom("user")
        .select(["id", "email_verified_at"])
        .where("id", "in", ids)
        .execute();
      throw new RolledBack();
    })
    .catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(RolledBack);
  return new Map(stamps.map((s) => [s.id, s.email_verified_at]));
}

describe("clearing confirmations stamped while a link for another address stayed", () => {
  it("clears only stamps written since the stamp existed on accounts that keep such a link", async () => {
    const { rows } = await sql<{ at: string }>`
      SELECT "timestamp" AS at FROM kysely_migration
      WHERE name = '20261011000000-user-confirmation-stamp'
    `.execute(conn);
    const stampExisted = new Date(rows[0].at).getTime();
    const before = new Date(stampExisted - 60_000).toISOString();
    const foreign = `elsewhere-${faker.string.uuid()}@example.test`;

    const keptForeign = await stamped({ linkedFor: foreign });
    const ownLinkOnly = await stamped({});
    const stampedBefore = await stamped({
      linkedFor: foreign,
      stampedAt: before,
    });

    const after = await stampsAfterUp([
      keptForeign,
      ownLinkOnly,
      stampedBefore,
    ]);

    expect(after.get(keptForeign)).toBeNull();
    expect(after.get(ownLinkOnly)).not.toBeNull();
    expect(after.get(stampedBefore)).not.toBeNull();
  });
});
