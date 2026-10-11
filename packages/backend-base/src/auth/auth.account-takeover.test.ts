import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import { ConflictError, ValidationError } from "../common/errors";
import { authRateLimiters } from "../common/rate-limit.middleware";
import cacheConstants from "../shared/cache.constants";
import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

const db = shared.store.db;
const conn = db.getOrCreateConnection();
const cache = shared.store.cache;
const links = new UserSsoAccountRepository(db);
const jwt = { sign: async (p: { sub: string }) => `token-${p.sub}` };
const PASSWORD = "correct-horse-battery";

let mails: Array<{ to: string; text: string }> = [];
let created: string[] = [];

const service = () =>
  new AuthService(db, shared.store.cache, shared.store.notification);

const address = (label: string) =>
  `${label}-${faker.string.uuid()}@example.test`;

function keySentTo(email: string): string {
  const mail = [...mails].reverse().find((m) => m.to === email);
  return mail?.text.split("?key=").at(-1) ?? "";
}

async function account(
  values: { email?: string; emailVerified?: boolean; password?: boolean } = {},
) {
  const email = values.email ?? address("account");
  const { id } = await conn
    .insertInto("user")
    .values({
      email,
      firstName: "T",
      lastName: "A",
      emailVerified: values.emailVerified ?? false,
      password: values.password
        ? await Bun.password.hash(PASSWORD, { algorithm: "bcrypt", cost: 4 })
        : null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  return { id, email };
}

const row = (id: string) =>
  conn
    .selectFrom("user")
    .select(["email", "emailVerified", "email_verified_at", "password"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

const google = (providerUserId: string, email: string) =>
  service().loginWithSSO(
    SsoProviderEnum.google,
    { providerUserId, email, emailVerified: true, name: "T A" },
    jwt as never,
  );

beforeEach(() => {
  mails = [];
  spyOn(shared.store.notification, "sendEmail").mockImplementation(
    (message) => {
      mails.push({ to: message.to.email, text: message.text });
      return Promise.resolve({ delivered: true });
    },
  );
});

afterEach(async () => {
  for (const id of created)
    await cache.delete(`rate-limit:send-email-verification:${id}`);
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

describe("the database keeps a confirmation tied to the address it proved", () => {
  it("renaming a confirmed row directly drops the confirmation and its stamp", async () => {
    const { id } = await account({ emailVerified: true });
    expect((await row(id)).email_verified_at).not.toBeNull();

    await conn
      .updateTable("user")
      .set({ email: address("elsewhere") })
      .where("id", "=", id)
      .execute();

    expect(await row(id)).toMatchObject({
      emailVerified: false,
      email_verified_at: null,
    });
  });

  it("changing only the case or spacing of the address keeps the confirmation", async () => {
    const email = address("case");
    const { id } = await account({ email, emailVerified: true });
    const before = (await row(id)).email_verified_at;

    await conn
      .updateTable("user")
      .set({ email: ` ${email.toUpperCase()} ` })
      .where("id", "=", id)
      .execute();

    expect(await row(id)).toMatchObject({
      emailVerified: true,
      email_verified_at: before,
    });
  });

  it("an unconfirmed row carries no stamp, and unconfirming a row clears it", async () => {
    const unconfirmed = await account();
    expect((await row(unconfirmed.id)).email_verified_at).toBeNull();

    const { id } = await account({ emailVerified: true });
    await conn
      .updateTable("user")
      .set({ emailVerified: false })
      .where("id", "=", id)
      .execute();
    expect((await row(id)).email_verified_at).toBeNull();
  });

  it("changing or resetting the password keeps the confirmation and its stamp", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    const before = await row(id);

    await service().changePassword(id, {
      currentPassword: PASSWORD,
      password: "a-new-password-1",
    });
    await service().forgotPassword({ email });
    expect(
      await service().resetPassword({
        key: keySentTo(email),
        password: "another-password-2",
      }),
    ).toBe(true);

    expect(await row(id)).toMatchObject({
      emailVerified: true,
      email_verified_at: before.email_verified_at,
    });
  });
});

describe("email confirmation", () => {
  it("an address stored with capitals and spaces confirms through its link", async () => {
    const { id } = await account({
      email: ` Mixed-${faker.string.uuid()}@Example.TEST `,
    });
    await service().sendVerifyEmail(id);
    const stored = (await row(id)).email;

    const answer = await service().verifyEmail({
      token: keySentTo(stored),
      jwt: jwt as never,
      currentUserId: id,
    });

    expect(answer.verified).toBe(true);
    expect((await row(id)).emailVerified).toBe(true);
  });

  it("a link minted for another account with the same address in other case is refused", async () => {
    const lower = address("twin");
    const owner = await account({ email: lower });
    const twin = await account({ email: lower.toUpperCase() });
    await service().sendVerifyEmail(owner.id);

    await expect(
      service().verifyEmail({
        token: keySentTo(lower),
        jwt: jwt as never,
        currentUserId: twin.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await row(twin.id)).emailVerified).toBe(false);
  });

  it("a link mailed to a previous address is refused as invalid", async () => {
    const { id, email } = await account();
    await service().sendVerifyEmail(id);
    await conn
      .updateTable("user")
      .set({ email: address("moved") })
      .where("id", "=", id)
      .execute();

    await expect(
      service().verifyEmail({
        token: keySentTo(email),
        jwt: jwt as never,
        currentUserId: id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("the confirmation mail limit", () => {
  it("is counted per account: another account still gets its mail", async () => {
    const first = await account();
    const second = await account();
    const send = (id: string) =>
      authRateLimit(id).then(() => service().sendVerifyEmail(id));

    for (let i = 0; i < 5; i += 1) await send(first.id);
    await expect(send(first.id)).rejects.toMatchObject({ status: 429 });
    await send(second.id);
    expect(keySentTo(second.email)).not.toBe("");
  });

  it("covers renames too: the sixth address change within the hour is refused and leaves the address alone", async () => {
    const { id } = await account({ emailVerified: true });
    for (let i = 0; i < 5; i += 1)
      await service().updateProfile(id, { email: address(`rename${i}`) });
    const fifth = (await row(id)).email;

    await expect(
      service().updateProfile(id, { email: address("sixth") }),
    ).rejects.toMatchObject({ status: 429 });
    expect((await row(id)).email).toBe(fifth);
    expect(mails).toHaveLength(5);
  });
});

describe("a password reset link", () => {
  it("stops working once the account moves to another address", async () => {
    const { id, email } = await account({ password: true });
    await service().forgotPassword({ email });
    const key = keySentTo(email);
    expect(await service().resetPasswordVerify(key)).toBe(true);

    await service().updateProfile(id, { email: address("victim") });

    expect(await service().resetPasswordVerify(key)).toBe(false);
    expect(
      await service().resetPassword({ key, password: "taken-over-1" }),
    ).toBe(false);
  });

  it("a squatter's link no longer works after the address owner adopts the account with Google", async () => {
    const squatter = await account({ password: true });
    await service().forgotPassword({ email: squatter.email });
    const key = keySentTo(squatter.email);
    const victim = address("victim");
    await service().updateProfile(squatter.id, { email: victim });

    await google(`victim-${squatter.id}`, victim);

    expect(
      await service().resetPassword({ key, password: "taken-over-1" }),
    ).toBe(false);
    expect((await row(squatter.id)).password).toBeNull();
  });

  it("on an unconfirmed account drops provider links made for another address, so the previous holder keeps no way in", async () => {
    const attacker = address("attacker");
    await google(`attacker-${attacker}`, attacker);
    const { id } = await conn
      .selectFrom("user")
      .select("id")
      .where("email", "=", attacker)
      .executeTakeFirstOrThrow();
    created.push(id);
    const victim = address("victim");
    await service().updateProfile(id, { email: victim });

    await service().forgotPassword({ email: victim });
    expect(
      await service().resetPassword({
        key: keySentTo(victim),
        password: "the-owners-password",
      }),
    ).toBe(true);

    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `attacker-${attacker}`,
      ),
    ).toBeFalsy();
  });
});

describe("a provider sign-in that adopts an existing account", () => {
  it("revokes the previous holder's sessions and password when the account was unconfirmed", async () => {
    const { id, email } = await account({ password: true });
    await service().login({ email, password: PASSWORD }, jwt as never);
    expect(
      await cache.get<string[]>(cacheConstants.accessToken(id)),
    ).toHaveLength(1);

    await google(`owner-${id}`, email);

    expect((await row(id)).password).toBeNull();
    expect(await cache.get<string[]>(cacheConstants.accessToken(id))).toEqual([
      `token-${id}`,
    ]);
  });

  it("treats a confirmation from before the stamp existed as unproven", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await conn
      .updateTable("user")
      .set({ email_verified_at: null })
      .where("id", "=", id)
      .execute();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `planted-${id}`,
      email,
    });

    await google(`owner-${id}`, email);

    expect((await row(id)).password).toBeNull();
    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `planted-${id}`,
      ),
    ).toBeFalsy();
  });

  it("keeps a confirmed account's password and other links", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `apple-${id}`,
      email,
    });

    await google(`google-${id}`, email);

    expect((await row(id)).password).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `apple-${id}`,
      ),
    ).toBeTruthy();
  });

  it("does not confirm a linked account that moved to an address the provider never saw", async () => {
    const original = address("linked");
    await google(`moved-${original}`, original);
    const { id } = await conn
      .selectFrom("user")
      .select("id")
      .where("email", "=", original)
      .executeTakeFirstOrThrow();
    created.push(id);
    await service().updateProfile(id, { email: address("moved") });

    await google(`moved-${original}`, original);

    expect(await row(id)).toMatchObject({
      emailVerified: false,
      email_verified_at: null,
    });
  });
});

async function authRateLimit(id: string) {
  await authRateLimiters.sendEmailVerification({
    store: { cache },
    set: {},
    currentUserId: id,
  });
}
