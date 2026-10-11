import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import { sql } from "database";

import { ConflictError } from "../common/errors";
import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

const conn = shared.store.db.getOrCreateConnection();
const jwt = { sign: async (p: { sub: string }) => `token-${p.sub}` };
let created: string[] = [];
const ROSTER = `race-roster-${faker.string.uuid()}@example.test`;

afterEach(async () => {
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

async function account(emailVerified: boolean) {
  const email = `race-${faker.string.uuid()}@example.test`;
  const { id } = await conn
    .insertInto("user")
    .values({ email, firstName: "R", lastName: "C", emailVerified })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  return { id, email };
}

async function waitForARowLock() {
  for (let i = 0; i < 100; i += 1) {
    const { rows } = await sql<{ waiting: number }>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `.execute(conn);
    if (rows[0].waiting > 0) return;
    await Bun.sleep(20);
  }
  throw new Error("the sign-in never waited for the locked row");
}

const renameTo = (id: string, email: string) =>
  conn.updateTable("user").set({ email }).where("id", "=", id).execute();

async function stampOf(id: string) {
  return conn
    .selectFrom("user")
    .select(["email", "emailVerified", "email_verified_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

describe("a confirmation stamps only the address it proved, even when a rename races it", () => {
  it("the email link: a rename landing between the check and the write confirms nothing", async () => {
    const { id } = await account(false);
    const mails: string[] = [];
    spyOn(shared.store.notification, "sendEmail").mockImplementation((m) => {
      mails.push(m.text);
      return Promise.resolve({ delivered: true });
    });
    const service = new AuthService(
      shared.store.db,
      shared.store.cache,
      shared.store.notification,
    );
    await service.sendVerifyEmail(id);
    const token = mails[0].split("?key=").at(-1) ?? "";
    const realDelete = shared.store.cache.delete.bind(shared.store.cache);
    const race = spyOn(shared.store.cache, "delete").mockImplementation(
      async (key: string) => {
        await renameTo(id, ROSTER);
        return realDelete(key);
      },
    );
    try {
      await expect(
        service.verifyEmail({ token, jwt: jwt as never, currentUserId: id }),
      ).rejects.toThrow();
    } finally {
      race.mockRestore();
    }
    expect(await stampOf(id)).toMatchObject({
      email: ROSTER,
      emailVerified: false,
      email_verified_at: null,
    });
  });

  it("a provider sign-in on an existing account: a rename landing while it waits for the row links and confirms nothing", async () => {
    const { id, email } = await account(false);
    const service = new AuthService(
      shared.store.db,
      shared.store.cache,
      shared.store.notification,
    );
    const providerUserId = `race-${id}`;
    const { attempt } = await conn.transaction().execute(async (trx) => {
      await trx
        .selectFrom("user")
        .select("id")
        .where("id", "=", id)
        .forUpdate()
        .execute();
      const attempt = service
        .loginWithSSO(
          SsoProviderEnum.google,
          { providerUserId, email, emailVerified: true, name: "R" },
          jwt as never,
        )
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      await waitForARowLock();
      await trx
        .updateTable("user")
        .set({ email: ROSTER })
        .where("id", "=", id)
        .execute();
      return { attempt };
    });

    expect(await attempt).toBeInstanceOf(ConflictError);
    expect(await stampOf(id)).toMatchObject({
      email: ROSTER,
      emailVerified: false,
      email_verified_at: null,
    });
    expect(
      await new UserSsoAccountRepository(
        shared.store.db,
      ).findByProviderAndProviderId(SsoProviderEnum.google, providerUserId),
    ).toBeFalsy();
  });
});
