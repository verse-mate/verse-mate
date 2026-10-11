import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import { Elysia } from "elysia";

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
  it("with no link for its own address, only stamps: the account keeps its other sessions and links made for another address", async () => {
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

  it("drops links stored for the address it confirms and signs out the other sessions, keeping links made for another address", async () => {
    const client = getTestClient<AuthPlugin>(Backend);
    const { id, email } = await legacyAccount();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `same-address-${id}`,
      email: email.toUpperCase(),
    });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.apple,
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
    const audit = spyOn(console, "info");

    try {
      const confirmed = await client.auth["verify-email"].post(
        { token: keySentTo(email) },
        { headers: { authorization: `Bearer ${caller}` } },
      );

      expect(confirmed.error).toBeNull();
      expect(audit).toHaveBeenCalledWith(
        "Address confirmation took the account back",
        {
          userId: id,
          proof: "account-holder",
          linksDropped: 1,
          signOutOthers: true,
        },
      );
      expect((await row(id)).email_verified_at).not.toBeNull();
      expect(await sessionsOf(id)).toEqual([confirmed.data?.accessToken ?? ""]);
      expect(
        await links.findByProviderAndProviderId(
          SsoProviderEnum.google,
          `same-address-${id}`,
        ),
      ).toBeFalsy();
      expect(
        await links.findByProviderAndProviderId(
          SsoProviderEnum.apple,
          `before-${id}`,
        ),
      ).toBeTruthy();
    } finally {
      audit.mockRestore();
    }
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

  it("on an account confirmed before the stamp existed drops every sign-in link, its own address included, and stamps it", async () => {
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
    ).toBeFalsy();
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

  it("on an account confirmed before the stamp existed keeps the password and the identity signing in, drops every other link, signs out other sessions, and stamps it", async () => {
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
        SsoProviderEnum.google,
        `owner-${id}`,
      ),
    ).toBeTruthy();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `earlier-${id}`,
      ),
    ).toBeFalsy();
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

  it("refuses when the provider identity is already linked to another account, leaving the target as it was", async () => {
    const other = await account({ emailVerified: true });
    const target = await account({ password: true });
    await links.create({
      user_id: target.id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `target-${target.id}`,
      email: target.email,
    });
    await seedSession(target.id, "device-a");
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
    expect(await row(target.id)).toMatchObject({
      emailVerified: false,
      email_verified_at: null,
    });
    expect((await row(target.id)).password).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `target-${target.id}`,
      ),
    ).toBeTruthy();
    expect(await sessionsOf(target.id)).toEqual(["device-a"]);
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
      picture_source: SsoProviderEnum.google,
    });
  });
});

describe("a sign-in that lands while the address owner takes the account back", () => {
  async function takeover() {
    const { id, email } = await legacyAccount({ password: true });
    const holder = address("holder");
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `holder-${id}`,
      email: holder,
    });
    await service().forgotPassword({ email });
    return { id, email, holder, key: keySentTo(email) };
  }

  const resettingWhileIssuing = (key: string) => ({
    sign: async (p: { sub: string }) => {
      await service().resetPassword({ key, password: "the-owners-choice" });
      await seedSession(p.sub, "owner-after-reset");
      return `holder-${p.sub}`;
    },
  });

  function signingInAfterRevoke(id: string, signIn: () => Promise<string>) {
    const revoke = cache.delete.bind(cache);
    const signedIn: { session?: string } = {};
    const race = spyOn(cache, "delete").mockImplementation(
      async (target: string) => {
        const revoked = await revoke(target);
        if (target === cacheConstants.accessToken(id)) {
          race.mockRestore();
          signedIn.session = await signIn().catch(() => undefined);
        }
        return revoked;
      },
    );
    return { race, signedIn };
  }

  const holderJwt = {
    sign: async (p: { sub: string }) => `holder-${p.sub}`,
  };

  async function forget(email: string) {
    const extra = await conn
      .selectFrom("user")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();
    if (extra) created.push(extra.id);
  }

  it("through a link the owner's reset drops gets no session and leaves the picture alone", async () => {
    const { id, holder, key } = await takeover();

    await expect(
      service().loginWithSSO(
        SsoProviderEnum.google,
        {
          providerUserId: `holder-${id}`,
          email: holder,
          emailVerified: true,
          picture: "https://example.test/holder.png",
        },
        resettingWhileIssuing(key) as never,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await sessionsOf(id)).toEqual(["owner-after-reset"]);
    expect(
      (
        await conn
          .selectFrom("user")
          .select("imageSrc")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).imageSrc,
    ).toBeNull();
  });

  it("with the password the reset replaces gets no session", async () => {
    const { id, email, key } = await takeover();

    await expect(
      service().login(
        { email, password: PASSWORD },
        resettingWhileIssuing(key) as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(await sessionsOf(id)).toEqual(["owner-after-reset"]);
  });

  it("sees the reset committed by the time sessions are revoked", async () => {
    const { id, holder, key } = await takeover();
    const { race, signedIn } = signingInAfterRevoke(
      id,
      async () =>
        (
          await service().loginWithSSO(
            SsoProviderEnum.google,
            {
              providerUserId: `holder-${id}`,
              email: holder,
              emailVerified: true,
            },
            holderJwt as never,
          )
        ).accessToken,
    );

    try {
      await service().resetPassword({ key, password: "the-owners-choice" });
    } finally {
      race.mockRestore();
      await forget(holder);
    }

    expect(signedIn.session).toBeDefined();
    expect(signedIn.session).not.toBe(`holder-${id}`);
    expect((await sessionsOf(id)) ?? []).not.toContain(`holder-${id}`);
  });

  it("sees the owner's provider adoption committed by the time sessions are revoked", async () => {
    const { id, email, holder } = await takeover();
    const { race, signedIn } = signingInAfterRevoke(
      id,
      async () =>
        (
          await service().loginWithSSO(
            SsoProviderEnum.google,
            {
              providerUserId: `holder-${id}`,
              email: holder,
              emailVerified: true,
            },
            holderJwt as never,
          )
        ).accessToken,
    );

    try {
      await google(`owner-${id}`, email);
    } finally {
      race.mockRestore();
      await forget(holder);
    }

    expect(signedIn.session).toBeDefined();
    expect(await sessionsOf(id)).toEqual([`token-${id}`]);
  });

  it("sees the owner's sign-in through an identity already linked committed by the time sessions are revoked", async () => {
    const { id, email, holder } = await takeover();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `owner-${id}`,
      email,
    });
    const { race, signedIn } = signingInAfterRevoke(
      id,
      async () =>
        (
          await service().loginWithSSO(
            SsoProviderEnum.google,
            {
              providerUserId: `holder-${id}`,
              email: holder,
              emailVerified: true,
            },
            holderJwt as never,
          )
        ).accessToken,
    );

    try {
      await google(`owner-${id}`, email);
    } finally {
      race.mockRestore();
      await forget(holder);
    }

    expect(signedIn.session).toBeDefined();
    expect(await sessionsOf(id)).toEqual([`token-${id}`]);
  });

  it("with a password the owner's provider adoption removes gets no session, and the owner keeps theirs", async () => {
    const { id, email } = await account({ password: true });
    const adoptingWhileIssuing = {
      sign: async (p: { sub: string }) => {
        await google(`owner-${id}`, email);
        return `squatter-${p.sub}`;
      },
    };

    await expect(
      service().login(
        { email, password: PASSWORD },
        adoptingWhileIssuing as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(await sessionsOf(id)).toEqual([`token-${id}`]);
  });

  it("a password reset signs out every session, on a confirmed account too", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await seedSession(id, "device-a");
    await seedSession(id, "device-b");
    await service().forgotPassword({ email });

    expect(
      await service().resetPassword({
        key: keySentTo(email),
        password: "x-new-1",
      }),
    ).toBe(true);
    expect(await sessionsOf(id)).toBeNull();
  });

  it("a password reset on an account confirmed before the stamp existed with no link for another address still signs out every session", async () => {
    const { id, email } = await legacyAccount();
    await seedSession(id, "device-a");
    await service().forgotPassword({ email });

    await service().resetPassword({
      key: keySentTo(email),
      password: "x-new-1",
    });

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
    let release = () => {};
    const together = new Promise<void>((resolve) => {
      release = resolve;
    });
    const distinct = {
      sign: async (p: { sub: string }) => {
        issued += 1;
        const n = issued;
        if (n === 20) release();
        await together;
        return `token-${p.sub}-${n}`;
      },
    };

    await Promise.all(
      Array.from({ length: 20 }, () =>
        service().login({ email, password: PASSWORD }, distinct as never),
      ),
    );

    expect(new Set(await sessionsOf(id)).size).toBe(20);
  });

  it("a logout landing with a sign-in keeps the new session and does not bring back the one logged out", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await cache.set(cacheConstants.accessToken(id), ["a"], "1h");
    let arrived = 0;
    let release = () => {};
    const together = new Promise<void>((resolve) => {
      release = resolve;
    });
    const meet = async () => {
      arrived += 1;
      if (arrived === 2) release();
      await together;
    };
    const racing = {
      verify: async () => {
        await meet();
        return { sub: id };
      },
      sign: async () => {
        await meet();
        return "b";
      },
    };

    await Promise.all([
      service().logout("a", racing as never),
      service().login({ email, password: PASSWORD }, racing as never),
    ]);

    expect(await sessionsOf(id)).toEqual(["b"]);
  });

  it("gives two sign-ins in the same second different sessions, and ending one keeps the other", async () => {
    const client = getTestClient<AuthPlugin>(Backend);
    const { email } = await account({ emailVerified: true, password: true });
    const first = await client.auth.login.post({ email, password: PASSWORD });
    const second = await client.auth.login.post({
      email,
      password: PASSWORD,
    });
    const one = first.data?.accessToken ?? "";
    const two = second.data?.accessToken ?? "";

    await client.auth.logout.post(undefined, {
      headers: { authorization: `Bearer ${one}` },
    });

    const jtiOf = (token: string) =>
      JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).jti;
    expect(typeof jtiOf(one)).toBe("string");
    expect(jtiOf(one)).not.toBe(jtiOf(two));
    expect(one).not.toBe(two);
    const still = await client.auth.session.get({
      headers: { authorization: `Bearer ${two}` },
    });
    expect(still.error).toBeNull();
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
  });

  it("accepts and ends a session issued before sessions carried their own id", async () => {
    const client = getTestClient<AuthPlugin>(Backend);
    const { id } = await account({ emailVerified: true, password: true });
    const issuedBefore = await new Elysia()
      .use(shared)
      .get("/", ({ jwt }) => jwt.sign({ sub: id }))
      .handle(new Request("http://localhost/"))
      .then((response) => response.text());
    expect(
      JSON.parse(
        Buffer.from(issuedBefore.split(".")[1], "base64url").toString(),
      ).jti,
    ).toBeUndefined();
    await cache.set(cacheConstants.accessToken(id), [issuedBefore], "90d");

    const session = await client.auth.session.get({
      headers: { authorization: `Bearer ${issuedBefore}` },
    });
    await client.auth.logout.post(undefined, {
      headers: { authorization: `Bearer ${issuedBefore}` },
    });

    expect(session.error).toBeNull();
    expect(await sessionsOf(id)).toBeNull();
  });

  it("a new list lives for the session lifetime", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });

    await service().login({ email, password: PASSWORD }, jwt as never);

    expect(await cache.ttl(cacheConstants.accessToken(id))).toBeGreaterThan(
      90 * 86400 - 60,
    );
  });

  it("removing one session keeps the others' expiry", async () => {
    const key = `session-list-${faker.string.uuid()}`;
    await cache.set(key, ["a", "b"], "60s");

    await cache.removeFromJsonArray(key, "a");

    expect(await cache.get<string[]>(key)).toEqual(["b"]);
    const left = await cache.ttl(key);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(60);
    await cache.delete(key);
  });

  it("removing from a missing list creates nothing, an absent session changes nothing, duplicates all go, and the last one removes the list", async () => {
    const key = `session-list-${faker.string.uuid()}`;

    await cache.removeFromJsonArray(key, "x");
    expect(await cache.ttl(key)).toBe(-2);

    await cache.set(key, ["a", "a", "b"], "60s");
    await cache.removeFromJsonArray(key, "c");
    expect(await cache.get<string[]>(key)).toEqual(["a", "a", "b"]);
    await cache.removeFromJsonArray(key, "a");
    expect(await cache.get<string[]>(key)).toEqual(["b"]);
    await cache.removeFromJsonArray(key, "b");
    expect(await cache.get<string[]>(key)).toBeNull();
    expect(await cache.ttl(key)).toBe(-2);
  });
});

describe("requests the previous holder started before the owner took the account back", () => {
  it("a password change checked against the old password does not overwrite the owner's reset", async () => {
    const { id, email } = await account({ password: true });
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
        service().changePassword(id, {
          currentPassword: PASSWORD,
          password: "the-holders-choice",
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    } finally {
      race.mockRestore();
    }
    expect(
      (
        await service().login(
          { email, password: "the-owners-choice" },
          jwt as never,
        )
      ).accessToken,
    ).toBe(`token-${id}`);
  });

  it("an account deletion checked against the old password does not delete the account the owner adopted", async () => {
    const { id, email } = await account({ password: true });
    const verify = Bun.password.verify;
    const race = spyOn(Bun.password, "verify").mockImplementation(
      async (...args: Parameters<typeof Bun.password.verify>) => {
        const valid = await verify(...args);
        race.mockRestore();
        await google(`owner-${id}`, email);
        return valid;
      },
    );

    try {
      await expect(
        service().deleteAccount(id, PASSWORD),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      race.mockRestore();
    }
    expect((await row(id)).email_verified_at).not.toBeNull();
  });

  function beforeDeleting(race: () => Promise<unknown>) {
    const begin = conn.transaction.bind(conn);
    const hook = spyOn(conn, "transaction").mockImplementation(() => {
      hook.mockRestore();
      const builder = begin();
      return {
        execute: async (work: Parameters<typeof builder.execute>[0]) => {
          await race();
          return builder.execute(work);
        },
      } as never;
    });
    return hook;
  }

  it("an account deletion that needs no password does not delete the account once the owner confirmed it, and signs nobody out", async () => {
    const { id, email } = await account();
    await seedSession(id, "device-a");
    const hook = beforeDeleting(() => google(`owner-${id}`, email));

    try {
      await expect(service().deleteAccount(id)).rejects.toBeInstanceOf(
        ConflictError,
      );
    } finally {
      hook.mockRestore();
    }
    expect((await row(id)).email_verified_at).not.toBeNull();
    expect(await sessionsOf(id)).toContain(`token-${id}`);
  });

  it("an account deletion does not delete an account whose address changed meanwhile", async () => {
    const { id } = await account({ emailVerified: true, password: true });
    await seedSession(id, "device-a");
    const elsewhere = address("moved");
    const hook = beforeDeleting(() =>
      conn
        .updateTable("user")
        .set({ email: elsewhere })
        .where("id", "=", id)
        .execute(),
    );

    try {
      await expect(
        service().deleteAccount(id, PASSWORD),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      hook.mockRestore();
    }
    expect((await row(id)).email).toBe(elsewhere);
    expect(await sessionsOf(id)).toEqual(["device-a"]);
  });

  it("an account deletion signs out every session once the account is gone", async () => {
    const { id } = await account({ emailVerified: true, password: true });
    await seedSession(id, "device-a");

    await service().deleteAccount(id, PASSWORD);

    expect(await sessionsOf(id)).toBeNull();
    expect(
      await conn
        .selectFrom("user")
        .select("id")
        .where("id", "=", id)
        .executeTakeFirst(),
    ).toBeUndefined();
  });
});

describe("closing the remaining ways back in", () => {
  it("a provider that has not verified the address cannot create an account with it", async () => {
    const email = address("unverified");

    await expect(
      service().loginWithSSO(
        SsoProviderEnum.google,
        { providerUserId: `unverified-${email}`, email, emailVerified: false },
        jwt as never,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await conn
        .selectFrom("user")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it("a reset on an account that was never confirmed drops every sign-in link, its own address included", async () => {
    const { id, email } = await account({ password: true });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `same-address-${id}`,
      email,
    });
    await service().forgotPassword({ email });

    await service().resetPassword({
      key: keySentTo(email),
      password: "the-owners-choice",
    });

    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `same-address-${id}`,
      ),
    ).toBeFalsy();
  });

  it("keeps at most fifty sessions, dropping the oldest, and renews the list's lifetime", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await cache.set(
      cacheConstants.accessToken(id),
      Array.from({ length: 50 }, (_, n) => `device-${n}`),
      "1h",
    );

    await service().login({ email, password: PASSWORD }, jwt as never);

    const sessions = await sessionsOf(id);
    expect(sessions).toHaveLength(50);
    expect(sessions).not.toContain("device-0");
    expect(sessions?.at(-1)).toBe(`token-${id}`);
    expect(await cache.ttl(cacheConstants.accessToken(id))).toBeGreaterThan(
      90 * 86400 - 60,
    );
  });

  it("brings a list already past fifty sessions down to the newest fifty", async () => {
    const { id, email } = await account({
      emailVerified: true,
      password: true,
    });
    await cache.set(
      cacheConstants.accessToken(id),
      Array.from({ length: 55 }, (_, n) => `device-${n}`),
      "1h",
    );

    await service().login({ email, password: PASSWORD }, jwt as never);

    expect(await sessionsOf(id)).toEqual([
      ...Array.from({ length: 49 }, (_, n) => `device-${n + 6}`),
      `token-${id}`,
    ]);
  });

  it("records who was taken back and how, without the address", async () => {
    const { id, email } = await legacyAccount();
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `elsewhere-${id}`,
      email: address("elsewhere"),
    });
    const audit = spyOn(console, "info");

    try {
      await google(`owner-${id}`, email);
      expect(audit).toHaveBeenCalledWith(
        "Address confirmation took the account back",
        { userId: id, proof: "provider", linksDropped: 1, signOutOthers: true },
      );
      expect(JSON.stringify(audit.mock.calls)).not.toContain(email);
    } finally {
      audit.mockRestore();
    }
  });

  it("records a reset that takes a never-confirmed account back, even with no link to drop", async () => {
    const { id, email } = await account({ password: true });
    await service().forgotPassword({ email });
    const audit = spyOn(console, "info");

    try {
      await service().resetPassword({
        key: keySentTo(email),
        password: "the-owners-choice",
      });
      expect(audit).toHaveBeenCalledWith(
        "Address confirmation took the account back",
        {
          userId: id,
          proof: "password-reset",
          linksDropped: 0,
          signOutOthers: true,
        },
      );
    } finally {
      audit.mockRestore();
    }
  });

  it("records nothing when a confirmation takes nothing back", async () => {
    const { id, email } = await legacyAccount();
    await service().sendVerifyEmail(id);
    const audit = spyOn(console, "info");

    try {
      await service().verifyEmail({
        token: keySentTo(email),
        jwt: jwt as never,
        currentUserId: id,
      });
      expect(audit).not.toHaveBeenCalledWith(
        "Address confirmation took the account back",
        expect.anything(),
      );
    } finally {
      audit.mockRestore();
    }
  });

  it("does not take a provider's picture through a link dropped after the sign-in checked it", async () => {
    const { id, email } = await account({ emailVerified: true });
    await links.create({
      user_id: id,
      provider: SsoProviderEnum.google,
      provider_user_id: `holder-${id}`,
      email,
    });
    const update = conn.updateTable.bind(conn);
    const race = spyOn(conn, "updateTable").mockImplementation(((
      table: "user",
    ) => {
      race.mockRestore();
      return {
        set: (values: never) => ({
          where: (...first: never[]) => ({
            where: (...second: never[]) => ({
              execute: async () => {
                await conn
                  .deleteFrom("user_sso_accounts")
                  .where("user_id", "=", id)
                  .execute();
                return update(table)
                  .set(values)
                  .where(...(first as [never, never, never]))
                  .where(...(second as [never]))
                  .execute();
              },
            }),
          }),
        }),
      };
    }) as never);

    try {
      await service().loginWithSSO(
        SsoProviderEnum.google,
        {
          providerUserId: `holder-${id}`,
          email,
          emailVerified: true,
          picture: "https://example.test/holder.png",
        },
        jwt as never,
      );
    } finally {
      race.mockRestore();
    }

    expect(
      (
        await conn
          .selectFrom("user")
          .select("imageSrc")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).imageSrc,
    ).toBeNull();
  });
});

async function authRateLimit(id: string) {
  await authRateLimiters.sendEmailVerification({
    store: { cache },
    set: {},
    currentUserId: id,
  });
}
