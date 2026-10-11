import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import { authRateLimiters } from "../common/rate-limit.middleware";
import cacheConstants from "../shared/cache.constants";
import shared from "../shared/shared.plugin";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";
import { AuthService } from "./auth.service";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

const db = shared.store.db;
const conn = db.getOrCreateConnection();
const cache = shared.store.cache;
const links = new UserSsoAccountRepository(db);
const jwt = { sign: async (p: { sub: string }) => `token-${p.sub}` };
const PASSWORD = "correct-horse-1";

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

async function legacyAccount(values: { password?: boolean } = {}) {
  const legacy = await account({
    emailVerified: true,
    password: values.password ?? true,
  });
  await conn
    .updateTable("user")
    .set({ email_verified_at: null })
    .where("id", "=", legacy.id)
    .execute();
  return legacy;
}

const sessionsOf = (id: string) =>
  cache.get<string[]>(cacheConstants.accessToken(id));

async function seedSession(id: string, session: string) {
  await cache.set(
    cacheConstants.accessToken(id),
    [...((await sessionsOf(id)) ?? []), session],
    "1h",
  );
}

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

describe("email confirmation through the route", () => {
  it("only stamps: the account keeps its other sessions and every sign-in link", async () => {
    const client = getTestClient<AuthPlugin>(Backend);
    const { id, email } = await account({ password: true });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `before-${id}`,
      email: address("before"),
    });
    const { data } = await client.auth.login.post({
      email,
      password: PASSWORD,
    });
    const caller = data?.accessToken ?? "";
    await seedSession(id, "another-device");
    await service().sendVerifyEmail(id);

    const confirmed = await client.auth["verify-email"].post(
      { token: keySentTo(email) },
      { headers: { authorization: `Bearer ${caller}` } },
    );

    expect(confirmed.error).toBeNull();
    expect((await row(id)).email_verified_at).not.toBeNull();
    const after = await sessionsOf(id);
    expect(after).toContain(caller);
    expect(after).toContain("another-device");
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `before-${id}`,
      ),
    ).toBeTruthy();
  });

  it("after a change of address, the provider account the user signed up with still reaches the same account", async () => {
    const original = address("signed-up");
    await google(`signed-up-${original}`, original);
    const { id } = await conn
      .selectFrom("user")
      .select("id")
      .where("email", "=", original)
      .executeTakeFirstOrThrow();
    created.push(id);
    const next = address("next");
    await service().updateProfile(id, { email: next });
    await service().verifyEmail({
      token: keySentTo(next),
      jwt: jwt as never,
      currentUserId: id,
    });

    const again = await google(`signed-up-${original}`, original);

    expect(again.accessToken).toBe(`token-${id}`);
    expect(
      await conn
        .selectFrom("user")
        .select("id")
        .where("email", "=", original)
        .executeTakeFirst(),
    ).toBeUndefined();
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

describe("the rename limit through the route", () => {
  it("answers 429 with a retry time and keeps the address", async () => {
    const client = getTestClient<AuthPlugin>(Backend);
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    const { data } = await client.auth.login.post({
      email,
      password: PASSWORD,
    });
    const headers = { authorization: `Bearer ${data?.accessToken}` };
    for (let i = 0; i < 5; i += 1) {
      const res = await client.auth.profile.put(
        { email: address(`route${i}`) },
        { headers },
      );
      expect(res.error).toBeNull();
    }
    const fifth = (await row(id)).email;

    const blocked = await client.auth.profile.put(
      { email: address("route-sixth") },
      { headers },
    );

    expect(blocked.status).toBe(429);
    expect(
      (blocked.error?.value as { retryAfter?: number }).retryAfter,
    ).toBeGreaterThan(0);
    expect((await row(id)).email).toBe(fifth);
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

  it("proves the address, so a later provider sign-in keeps the password just set", async () => {
    const { id, email } = await account({ password: true });
    await service().forgotPassword({ email });
    await service().resetPassword({
      key: keySentTo(email),
      password: "chosen-by-the-owner",
    });
    expect((await row(id)).email_verified_at).not.toBeNull();

    await google(`after-reset-${id}`, email);

    expect((await row(id)).password).not.toBeNull();
  });

  it("on an account confirmed before the stamp existed drops links made for another address, keeps its own, and stamps it", async () => {
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
      provider: SsoProviderEnum.google,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `own-${id}`,
      email: email.toUpperCase(),
    });
    await service().forgotPassword({ email });

    expect(
      await service().resetPassword({
        key: keySentTo(email),
        password: "a-fresh-password",
      }),
    ).toBe(true);

    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `elsewhere-${id}`,
      ),
    ).toBeFalsy();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `own-${id}`,
      ),
    ).toBeTruthy();
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

  it("drops the sign-in links an unconfirmed account already had", async () => {
    const { id, email } = await account({ password: true });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `planted-${id}`,
      email,
    });

    await google(`owner-${id}`, email);

    expect((await row(id)).password).toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `planted-${id}`,
      ),
    ).toBeFalsy();
  });

  it("on an account confirmed before the stamp existed keeps the password and its own links, drops links made for another address, signs out other sessions, and stamps it", async () => {
    const { id, email } = await legacyAccount();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `earlier-${id}`,
      email,
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    await seedSession(id, "device-a");

    await google(`owner-${id}`, email);

    expect((await row(id)).password).not.toBeNull();
    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `earlier-${id}`,
      ),
    ).toBeTruthy();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `elsewhere-${id}`,
      ),
    ).toBeFalsy();
    expect(await sessionsOf(id)).toEqual([`token-${id}`]);
  });

  it("on an account confirmed before the stamp existed with no link for another address, stamps it and keeps its other sessions", async () => {
    const { id, email } = await legacyAccount();
    await seedSession(id, "device-a");

    await google(`owner-${id}`, email);

    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(await sessionsOf(id)).toEqual(["device-a", `token-${id}`]);
  });

  it("keeps a confirmed account's password, other links, sessions and stamp", async () => {
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
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    await seedSession(id, "device-a");
    const stamp = (await row(id)).email_verified_at;

    await google(`google-${id}`, email);

    expect((await row(id)).password).not.toBeNull();
    expect((await row(id)).email_verified_at).toEqual(stamp);
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `apple-${id}`,
      ),
    ).toBeTruthy();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `elsewhere-${id}`,
      ),
    ).toBeTruthy();
    expect(await sessionsOf(id)).toEqual(["device-a", `token-${id}`]);
  });

  it("refuses when the provider identity is already linked to another account", async () => {
    const other = await account({ emailVerified: true });
    const target = await account();
    const providerUserId = `shared-${target.id}`;
    await links.create({
      user_id: other.id,
      provider: SsoProviderEnum.google,
      provider_user_id: providerUserId,
      email: other.email,
    });
    const adopting = service();
    const lookup = (
      adopting as unknown as {
        userSsoAccountRepository: UserSsoAccountRepository;
      }
    ).userSsoAccountRepository;
    spyOn(lookup, "findByProviderAndProviderId").mockResolvedValue(undefined);

    await expect(
      adopting.loginWithSSO(
        SsoProviderEnum.google,
        { providerUserId, email: target.email, emailVerified: true, name: "T" },
        jwt as never,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await row(target.id)).emailVerified).toBe(false);
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

describe("a sign-in through an identity already linked", () => {
  it("on an account confirmed before the stamp existed, stamps it, keeps that identity and drops other links made for another address, signing out other sessions", async () => {
    const { id, email } = await legacyAccount();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `owner-${id}`,
      email: address("before"),
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    await seedSession(id, "device-a");

    await google(`owner-${id}`, email);

    expect((await row(id)).email_verified_at).not.toBeNull();
    expect((await row(id)).password).not.toBeNull();
    expect(
      (
        await links.findByProviderAndProviderId(
          SsoProviderEnum.google,
          `owner-${id}`,
        )
      )?.email,
    ).toBe(email);
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `elsewhere-${id}`,
      ),
    ).toBeFalsy();
    expect(await sessionsOf(id)).toEqual([`token-${id}`]);
  });

  it("on an account confirmed before the stamp existed with no link for another address, stamps it and keeps its other sessions", async () => {
    const { id, email } = await legacyAccount();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `owner-${id}`,
      email,
    });
    await seedSession(id, "device-a");

    await google(`owner-${id}`, email);

    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(await sessionsOf(id)).toEqual(["device-a", `token-${id}`]);
  });

  it("on an unconfirmed account, keeps that identity, drops links made for another address and signs out other sessions", async () => {
    const { id, email } = await account({ password: true });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `owner-${id}`,
      email: address("before"),
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    await seedSession(id, "device-a");

    await google(`owner-${id}`, email);

    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `owner-${id}`,
      ),
    ).toBeTruthy();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `elsewhere-${id}`,
      ),
    ).toBeFalsy();
    expect(await sessionsOf(id)).toEqual([`token-${id}`]);
  });

  it("on a confirmed account, keeps its other sessions, its other links and its stamp, and takes the new picture", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `owner-${id}`,
      email,
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    await seedSession(id, "device-a");
    const stamp = (await row(id)).email_verified_at;

    await service().loginWithSSO(
      SsoProviderEnum.google,
      {
        providerUserId: `owner-${id}`,
        email,
        emailVerified: true,
        picture: "https://example.test/new.png",
      },
      jwt as never,
    );

    expect((await row(id)).email_verified_at).toEqual(stamp);
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `elsewhere-${id}`,
      ),
    ).toBeTruthy();
    expect(await sessionsOf(id)).toEqual(["device-a", `token-${id}`]);
    expect(
      await conn
        .selectFrom("user")
        .select(["imageSrc", "picture_source"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      imageSrc: "https://example.test/new.png",
      picture_source: SsoProviderEnum.google as never,
    });
  });
});

describe("a sign-in that lands while the address owner takes the account back", () => {
  it("through a link the owner's reset drops gets no session", async () => {
    const { id, email } = await legacyAccount({ password: true });
    const holder = address("holder");
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `holder-${id}`,
      email: holder,
    });
    await service().forgotPassword({ email });
    const key = keySentTo(email);
    const lookup =
      UserSsoAccountRepository.prototype.findByProviderAndProviderId;
    const race = spyOn(
      UserSsoAccountRepository.prototype,
      "findByProviderAndProviderId",
    ).mockImplementation(async function (
      this: UserSsoAccountRepository,
      provider,
      providerUserId,
    ) {
      const found = await lookup.call(this, provider, providerUserId);
      race.mockRestore();
      await service().resetPassword({ key, password: "the-owners-choice" });
      return found;
    });

    try {
      await expect(google(`holder-${id}`, holder)).rejects.toBeInstanceOf(
        ConflictError,
      );
    } finally {
      race.mockRestore();
    }
    expect(await sessionsOf(id)).toBeNull();
  });

  it("with the password the reset replaces gets no session", async () => {
    const { id, email } = await legacyAccount({ password: true });
    await service().forgotPassword({ email });
    const key = keySentTo(email);
    const verify = Bun.password.verify;
    const race = spyOn(Bun.password, "verify").mockImplementation(
      async (...args: Parameters<typeof Bun.password.verify>) => {
        const valid = await verify(...args);
        race.mockRestore();
        await service().resetPassword({ key, password: "the-owners-choice" });
        return valid;
      },
    );

    try {
      await expect(
        service().login({ email, password: PASSWORD }, jwt as never),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    } finally {
      race.mockRestore();
    }
    expect(await sessionsOf(id)).toBeNull();
  });
});

describe("the session list", () => {
  it("keeps every session when many sign-ins land at once", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    let issued = 0;
    const distinct = {
      sign: async (p: { sub: string }) => {
        issued += 1;
        return `token-${p.sub}-${issued}`;
      },
    };

    await Promise.all(
      Array.from({ length: 20 }, () =>
        service().login({ email, password: PASSWORD }, distinct as never),
      ),
    );

    expect(new Set(await sessionsOf(id)).size).toBe(20);
  });

  it("written in the existing format is still read, extended and trimmed", async () => {
    const client = getTestClient<AuthPlugin>(Backend);
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    const first = await client.auth.login.post({ email, password: PASSWORD });
    const earlier = first.data?.accessToken ?? "";
    await cache.set(cacheConstants.accessToken(id), [earlier], "90d");
    await Bun.sleep(1100);

    const second = await client.auth.login.post({
      email,
      password: PASSWORD,
    });
    const later = second.data?.accessToken ?? "";
    const session = await client.auth.session.get({
      headers: { authorization: `Bearer ${earlier}` },
    });
    await client.auth.logout.post(undefined, {
      headers: { authorization: `Bearer ${earlier}` },
    });

    expect(session.error).toBeNull();
    expect(await sessionsOf(id)).toEqual([later]);
    expect(await cache.ttl(cacheConstants.accessToken(id))).toBeGreaterThan(0);
  });
});

async function authRateLimit(id: string) {
  await authRateLimiters.sendEmailVerification({
    store: { cache },
    set: {},
    currentUserId: id,
  });
}
