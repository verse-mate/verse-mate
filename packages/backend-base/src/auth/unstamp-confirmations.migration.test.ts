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

async function stamped(options: {
  linkedFor?: string;
  stampedAt?: string;
  spaced?: boolean;
}) {
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
  const own = email.toUpperCase();
  await conn
    .insertInto("user_sso_accounts")
    .values({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `unstamp-${id}`,
      email: options.linkedFor ?? (options.spaced ? `  ${own} ` : own),
    })
    .execute();
  return id;
}

type AfterUp = {
  emailVerified: boolean;
  email_verified_at: Date | null;
  links: number;
};

async function afterUp(ids: string[]) {
  const seen = new Map<string, AfterUp>();
  const outcome = await conn
    .transaction()
    .execute(async (trx) => {
      await up(trx);
      for (const id of ids) {
        const user = await trx
          .selectFrom("user")
          .select(["emailVerified", "email_verified_at"])
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        const links = await trx
          .selectFrom("user_sso_accounts")
          .select("id")
          .where("user_id", "=", id)
          .execute();
        seen.set(id, { ...user, links: links.length });
      }
      throw new RolledBack();
    })
    .catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(RolledBack);
  return seen;
}

describe("clearing confirmations stamped while a link for another address stayed", () => {
  it("clears only stamps written since the stamp existed on accounts that keep such a link, and touches nothing else", async () => {
    const { rows } = await sql<{ at: string }>`
      SELECT "timestamp" AS at FROM kysely_migration
      WHERE name = '20261011000000-user-confirmation-stamp'
    `.execute(conn);
    const stampExisted = new Date(rows[0].at).getTime();
    const foreign = `elsewhere-${faker.string.uuid()}@example.test`;

    const keptForeign = await stamped({ linkedFor: foreign });
    const stampedAtStart = await stamped({
      linkedFor: foreign,
      stampedAt: new Date(stampExisted).toISOString(),
    });
    const stampedBefore = await stamped({
      linkedFor: foreign,
      stampedAt: new Date(stampExisted - 60_000).toISOString(),
    });
    const ownLinkOnly = await stamped({});
    const ownLinkSpaced = await stamped({ spaced: true });
    expect(
      (
        await conn
          .selectFrom("user")
          .select("email_verified_at")
          .where("id", "=", keptForeign)
          .executeTakeFirstOrThrow()
      ).email_verified_at,
    ).not.toBeNull();

    const after = await afterUp([
      keptForeign,
      stampedAtStart,
      stampedBefore,
      ownLinkOnly,
      ownLinkSpaced,
    ]);

    expect(after.get(keptForeign)).toEqual({
      emailVerified: true,
      email_verified_at: null,
      links: 1,
    });
    expect(after.get(stampedAtStart)?.email_verified_at).toBeNull();
    expect(after.get(stampedBefore)?.email_verified_at).not.toBeNull();
    expect(after.get(ownLinkOnly)?.email_verified_at).not.toBeNull();
    expect(after.get(ownLinkSpaced)?.email_verified_at).not.toBeNull();
  });
});
