import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import { CoachService } from "../coach/coach.service";
import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

const db = shared.store.db;
const conn = db.getOrCreateConnection();
const jwt = { sign: async (p: { sub: string }) => `token-${p.sub}` };

let mails: Array<{ to: string; text: string }> = [];

function authService() {
  return new AuthService(db, shared.store.cache, shared.store.notification);
}

function tokenSentTo(email: string): string {
  const mail = [...mails].reverse().find((m) => m.to === email);
  return mail?.text.split("?key=").at(-1) ?? "";
}

async function account(emailVerified: boolean) {
  const email = `rename-${faker.string.uuid()}@example.test`;
  const row = await conn
    .insertInto("user")
    .values({ email, firstName: "R", lastName: "N", emailVerified })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(row.id);
  return { id: row.id, email };
}

async function verified(id: string): Promise<boolean> {
  const row = await conn
    .selectFrom("user")
    .select("emailVerified")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  return row.emailVerified;
}

let created: string[] = [];
const ADMIN = `rename-admin-${faker.string.uuid()}@example.test`;

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
  await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

describe("changing an account's email re-verifies it", () => {
  it("renaming a verified account onto a granted admin address does not grant admin authority", async () => {
    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    const attacker = await account(true);

    await authService().updateProfile(attacker.id, { email: ADMIN });

    expect(await new CoachService(db).isAdmin(attacker.id)).toBe(false);
  });

  it("an email change clears verification and mails a verification link to the new address", async () => {
    const user = await account(true);
    const next = `renamed-${faker.string.uuid()}@example.test`;

    await authService().updateProfile(user.id, { email: next });

    expect(await verified(user.id)).toBe(false);
    expect(tokenSentTo(next)).not.toBe("");
    expect(mails.some((m) => m.to === user.email)).toBe(false);
  });

  it("an update that keeps the same address leaves verification alone", async () => {
    const user = await account(true);

    await authService().updateProfile(user.id, {
      email: user.email.toUpperCase(),
      firstName: "Same",
    });

    expect(await verified(user.id)).toBe(true);
    expect(mails).toHaveLength(0);
  });

  it("a token mailed to the previous address cannot verify the new one", async () => {
    const user = await account(false);
    const service = authService();
    await service.sendVerifyEmail(user.id);
    const oldToken = tokenSentTo(user.email);
    expect(oldToken).not.toBe("");

    await service.updateProfile(user.id, { email: ADMIN });

    await expect(
      service.verifyEmail({
        token: oldToken,
        jwt: jwt as never,
        currentUserId: user.id,
      }),
    ).rejects.toThrow();
    expect(await verified(user.id)).toBe(false);

    await service.verifyEmail({
      token: tokenSentTo(ADMIN),
      jwt: jwt as never,
      currentUserId: user.id,
    });
    expect(await verified(user.id)).toBe(true);
  });
});

describe("an SSO sign-in that adopts an unverified account", () => {
  it("drops the SSO links that account already had, so its previous holder keeps no way in", async () => {
    const squatter = await account(false);
    const links = new UserSsoAccountRepository(db);
    const squatterProviderId = `squatter-${squatter.id}`;
    await links.create({
      user_id: squatter.id,
      provider: SsoProviderEnum.google,
      provider_user_id: squatterProviderId,
      email: squatter.email,
    });

    await authService().loginWithSSO(
      SsoProviderEnum.google,
      {
        providerUserId: `owner-${squatter.id}`,
        email: squatter.email,
        emailVerified: true,
      } as never,
      jwt as never,
    );

    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        squatterProviderId,
      ),
    ).toBeFalsy();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `owner-${squatter.id}`,
      ),
    ).toBeTruthy();
  });
});
