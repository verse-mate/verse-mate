import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";

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

  it("a provider sign-in on an existing account: a rename landing before the write confirms nothing", async () => {
    const { id, email } = await account(false);
    const service = new AuthService(
      shared.store.db,
      shared.store.cache,
      shared.store.notification,
    );
    const repo = (
      service as unknown as {
        userSsoAccountRepository: { create: (...a: unknown[]) => unknown };
      }
    ).userSsoAccountRepository;
    const realCreate = repo.create.bind(repo);
    const race = spyOn(repo, "create").mockImplementation(async (...a) => {
      const linked = await realCreate(...a);
      await renameTo(id, ROSTER);
      return linked;
    });
    try {
      await service
        .loginWithSSO(
          SsoProviderEnum.google,
          {
            providerUserId: `race-${id}`,
            email,
            emailVerified: true,
            name: "R",
          },
          jwt as never,
        )
        .catch(() => undefined);
    } finally {
      race.mockRestore();
    }
    expect(await stampOf(id)).toMatchObject({
      email: ROSTER,
      email_verified_at: null,
    });
  });
});
