import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import cacheConstants from "../shared/cache.constants";
import { getTestClient } from "../shared/test-client";
import Backend, { type AuthPlugin } from "./auth.plugin";
import { AuthService } from "./auth.service";
import { UserSsoAccountRepository } from "./sso/user-sso-account.repository";

const db = Backend.store.db;
const conn = db.getOrCreateConnection();
const cache = Backend.store.cache;
const client = getTestClient<AuthPlugin>(Backend);
const jwt = { sign: async (p: { sub: string }) => `token-${p.sub}` };
const PASSWORD = "Change1234";

let mails: Array<{ to: string; subject: string; text: string }> = [];
let created: string[] = [];

const address = (label: string) =>
  `${label}-${faker.string.uuid()}@example.test`;

beforeEach(() => {
  mails = [];
  Backend.store.authService.emailChangeSettleMs = 0;
  spyOn(Backend.store.notification, "sendEmail").mockImplementation(
    (message) => {
      mails.push({
        to: message.to.email,
        subject: message.subject,
        text: message.text,
      });
      return Promise.resolve({ delivered: true });
    },
  );
});

afterEach(async () => {
  for (const id of created) {
    await cache.delete(cacheConstants.emailChangeMailsSent(id));
    await cache.delete(cacheConstants.emailChangeRequests(id));
    await cache.delete(cacheConstants.emailChangePending(id));
    await cache.delete(cacheConstants.emailChangeReverts(id));
  }
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

async function account(email = address("account")) {
  const { id } = await conn
    .insertInto("user")
    .values({
      email,
      firstName: "E",
      lastName: "C",
      emailVerified: true,
      password: await Bun.password.hash(PASSWORD, {
        algorithm: "bcrypt",
        cost: 4,
      }),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  return { id, email };
}

async function signIn(email: string) {
  const { data, error } = await client.auth.login.post({
    email,
    password: PASSWORD,
  });
  if (error || !data) throw error ?? new Error("login failed");
  return { authorization: `Bearer ${data.accessToken}` };
}

const row = (id: string) =>
  conn
    .selectFrom("user")
    .select(["email", "firstName", "emailVerified", "email_verified_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

async function mailTo(email: string) {
  for (let i = 0; i < 100; i += 1) {
    const mail = [...mails].reverse().find((m) => m.to === email);
    if (mail) return mail;
    await Bun.sleep(10);
  }
  throw new Error("no mail arrived");
}

const keyIn = (text: string) =>
  text.match(/confirm-email-change\?key=([A-Za-z0-9_-]+)/)?.[1] ?? "";

const confirmPage = (key: string) =>
  Backend.handle(
    new Request(
      `http://localhost/auth/confirm-email-change?key=${encodeURIComponent(key)}`,
    ),
  );

const confirm = (key: string, email: string) =>
  Backend.handle(
    new Request("http://localhost/auth/confirm-email-change", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, email }),
    }),
  );

async function requestChange(user: { id: string; email: string }, to: string) {
  const headers = await signIn(user.email);
  const res = await client.auth.profile.put({ email: to }, { headers });
  return { res, headers };
}

describe("a profile update that changes the email", () => {
  it("keeps the current address, updates the other fields at once, and reports the pending address", async () => {
    const user = await account();
    const next = address("next");
    const headers = await signIn(user.email);

    const { data, error } = await client.auth.profile.put(
      { email: next, firstName: "Renamed" },
      { headers },
    );

    expect(error).toBeNull();
    expect(data).toMatchObject({
      email: user.email,
      firstName: "Renamed",
      pendingEmail: next,
    });
    expect(await row(user.id)).toMatchObject({
      email: user.email,
      firstName: "Renamed",
      emailVerified: true,
    });
    expect((await row(user.id)).email_verified_at).not.toBeNull();
    const session = await client.auth.session.get({ headers });
    expect(session.data).toMatchObject({
      email: user.email,
      pendingEmail: next,
    });
  });

  it("mails a confirmation link to the new address only, and the link carries no account detail", async () => {
    const user = await account();
    const next = address("next");

    await requestChange(user, next);

    const mail = await mailTo(next);
    expect(keyIn(mail.text)).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(mail.text).not.toContain(user.id);
    expect(mail.text).not.toContain(user.email);
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(0);
  });

  it("answers the same whether or not another account uses the address, and mails that address that an account exists", async () => {
    const user = await account();
    const free = await requestChange(user, address("free"));
    const other = await account();
    const taker = await account();

    const taken = await requestChange(taker, other.email);

    expect(free.res.status).toBe(200);
    expect(taken.res.status).toBe(200);
    expect(Object.keys(taken.res.data ?? {}).sort()).toEqual(
      Object.keys(free.res.data ?? {}).sort(),
    );
    expect(taken.res.data).toMatchObject({
      email: taker.email,
      pendingEmail: other.email,
    });
    const mail = await mailTo(other.email);
    expect(mail.text).toContain("already has");
    expect(keyIn(mail.text)).toBe("");
    expect(await row(other.id)).toMatchObject({ email: other.email });
    expect(await row(taker.id)).toMatchObject({ email: taker.email });
  });

  it("leaves a pending change alone when a later save sends the current address back", async () => {
    const user = await account();
    const next = address("next");
    const { headers } = await requestChange(user, next);
    await mailTo(next);

    const { data } = await client.auth.profile.put(
      { email: user.email.toUpperCase(), firstName: "Later" },
      { headers },
    );

    expect(data).toMatchObject({ email: user.email, pendingEmail: next });
    expect(mails.filter((m) => m.to !== next)).toHaveLength(0);
  });

  it("mails only the last address when saves arrive while the address is still being typed", async () => {
    Backend.store.authService.emailChangeSettleMs = 200;
    const user = await account();
    const headers = await signIn(user.email);
    const base = `typed-${faker.string.uuid()}`;
    const partial = [`${base}@example.te`, `${base}@example.tes`];
    const final = `${base}@example.test`;

    for (const typed of [...partial, final])
      await client.auth.profile.put({ email: typed }, { headers });
    await mailTo(final);
    await Bun.sleep(300);

    expect(mails.map((m) => m.to)).toEqual([final]);
  });

  it("allows three change mails an hour per account and refuses the fourth change without touching the account", async () => {
    const user = await account();
    const headers = await signIn(user.email);
    for (let i = 0; i < 3; i += 1) {
      const to = address(`limit${i}`);
      const res = await client.auth.profile.put({ email: to }, { headers });
      expect(res.status).toBe(200);
      await mailTo(to);
    }

    const blocked = await client.auth.profile.put(
      { email: address("limit3"), firstName: "Blocked" },
      { headers },
    );

    expect(blocked.status).toBe(429);
    expect(mails).toHaveLength(3);
    expect(await row(user.id)).toMatchObject({
      email: user.email,
      firstName: "E",
    });
  });

  it("counts mails that tell an address an account already exists toward the limit", async () => {
    const user = await account();
    const headers = await signIn(user.email);
    for (let i = 0; i < 3; i += 1) {
      const owner = await account();
      await client.auth.profile.put({ email: owner.email }, { headers });
      await mailTo(owner.email);
    }

    const blocked = await client.auth.profile.put(
      { email: (await account()).email },
      { headers },
    );

    expect(blocked.status).toBe(429);
  });

  it("keeps the mailed link and sends no new mail when a later save repeats the pending address", async () => {
    const user = await account();
    const next = address("next");
    const { headers } = await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    const again = await client.auth.profile.put(
      { email: next, firstName: "Again" },
      { headers },
    );
    await Bun.sleep(50);

    expect(again.data).toMatchObject({
      firstName: "Again",
      pendingEmail: next,
    });
    expect((await confirmPage(key)).status).toBe(200);
    expect(mails.filter((m) => m.to === next)).toHaveLength(1);
  });

  it("mails again when a later save repeats a pending address whose mail was not delivered", async () => {
    const user = await account();
    const next = address("next");
    const send = spyOn(Backend.store.notification, "sendEmail");
    send.mockImplementationOnce(() =>
      Promise.resolve({ delivered: false, error: "provider down" }),
    );
    const { headers } = await requestChange(user, next);
    await Bun.sleep(50);
    expect(mails).toHaveLength(0);

    await client.auth.profile.put({ email: next }, { headers });
    const key = keyIn((await mailTo(next)).text);

    expect((await confirmPage(key)).status).toBe(200);
  });

  it("sends at most three change mails when many saves arrive at once", async () => {
    const user = await account();
    const headers = await signIn(user.email);

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        client.auth.profile.put({ email: address(`burst${i}`) }, { headers }),
      ),
    );
    await Bun.sleep(200);

    expect(mails.length).toBeLessThanOrEqual(3);
  });

  it("drops the pending address when its mail finds the hourly limit already used", async () => {
    Backend.store.authService.emailChangeSettleMs = 100;
    const user = await account();
    const next = address("next");
    const { headers, res } = await requestChange(user, next);
    expect(res.data).toMatchObject({ pendingEmail: next });
    for (let i = 0; i < 3; i += 1)
      await cache.increment(cacheConstants.emailChangeMailsSent(user.id), 3600);
    await Bun.sleep(250);

    expect(mails).toHaveLength(0);
    expect((await client.auth.session.get({ headers })).data).toMatchObject({
      pendingEmail: null,
    });
  });

  it("refuses an account that keeps asking for changes within the hour", async () => {
    const user = await account();
    const headers = await signIn(user.email);
    for (let i = 0; i < 30; i += 1)
      await cache.increment(cacheConstants.emailChangeRequests(user.id), 3600);

    const blocked = await client.auth.profile.put(
      { email: address("one-more") },
      { headers },
    );

    expect(blocked.status).toBe(429);
    expect((await client.auth.session.get({ headers })).data).toMatchObject({
      pendingEmail: null,
    });
  });

  it("mails one address at most three change links an hour, whichever accounts ask, and drops the change that got no link", async () => {
    const target = address("target");
    let headers: Record<string, string> = {};
    for (let i = 0; i < 4; i += 1)
      headers = (await requestChange(await account(), target)).headers;
    await Bun.sleep(100);

    expect(mails.filter((m) => m.to === target)).toHaveLength(3);
    expect((await client.auth.session.get({ headers })).data).toMatchObject({
      pendingEmail: null,
    });
  });
});

describe("the confirmation page", () => {
  it("shows a form that posts the key, sets no-store and a strict policy, runs no script, and does not use the key", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    const page = await confirmPage(key);
    const again = await confirmPage(key);
    const html = await page.text();

    expect(page.status).toBe(200);
    expect(again.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const policy = page.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("script-src");
    expect(html).not.toContain("<script");
    expect(html).toContain('method="post"');
    expect(html).toContain(`value="${key}"`);
    expect(html).not.toContain(user.email);
    expect(html).not.toContain(next);
    expect(await row(user.id)).toMatchObject({ email: user.email });
  });

  it("says the link cannot be used for an unknown key", async () => {
    const page = await confirmPage("not-a-real-key");

    expect(page.status).toBe(404);
    expect(await page.text()).not.toContain('method="post"');
  });

  it("keeps no state for a confirmation of a key that does not exist", async () => {
    const key = faker.string.alphanumeric(43);
    const hash = new Bun.CryptoHasher("sha256").update(key).digest("hex");

    expect((await confirm(key, address("guess"))).status).toBe(404);

    expect(await cache.get(cacheConstants.emailChangeTries(hash))).toBeNull();
  });
});

describe("confirming an email change", () => {
  it("moves and stamps the account, signs out every session, notifies the old address, and works once, answering a repeat with the same page", async () => {
    const user = await account();
    const next = address("next");
    const { headers } = await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    const res = await confirm(key, user.email.toUpperCase());

    expect(res.status).toBe(200);
    const moved = await row(user.id);
    expect(moved).toMatchObject({ email: next, emailVerified: true });
    expect(moved.email_verified_at).not.toBeNull();
    expect((await client.auth.session.get({ headers })).status).toBe(401);
    expect(await cache.get(cacheConstants.accessToken(user.id))).toBeFalsy();
    const notice = await mailTo(user.email);
    expect(notice.subject).toContain("changed");
    expect(notice.text).not.toContain(next);
    const replay = await confirm(key, user.email);
    expect(replay.status).toBe(200);
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(1);
    expect((await confirm(key, address("guess"))).status).toBe(404);
    const after = await signIn(next);
    expect(
      (await client.auth.session.get({ headers: after })).data,
    ).toMatchObject({ email: next, pendingEmail: null });
  });

  it("answers every attempt on a used link as unusable once five were made, whatever address is typed", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    expect((await confirm(key, user.email)).status).toBe(200);

    for (let i = 0; i < 5; i += 1)
      expect((await confirm(key, address("guess"))).status).toBe(404);

    expect((await confirm(key, user.email)).status).toBe(404);
  });

  it("changes nothing when the current address typed on the page is wrong, and burns the link after five wrong tries", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    for (let i = 0; i < 4; i += 1) {
      const wrong = await confirm(key, address("guess"));
      expect(wrong.status).toBe(400);
      expect(await row(user.id)).toMatchObject({ email: user.email });
    }
    const fifth = await confirm(key, address("guess"));
    const right = await confirm(key, user.email);

    expect(fifth.status).toBe(404);
    expect(right.status).toBe(404);
    expect((await confirmPage(key)).status).toBe(404);
    expect(await row(user.id)).toMatchObject({ email: user.email });
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(0);
  });

  it("lets only five of many simultaneous attempts compare the address", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    const answers = await Promise.all([
      ...Array.from({ length: 19 }, () => confirm(key, address("guess"))),
      confirm(key, user.email),
    ]);

    expect(answers.filter((a) => a.status !== 404).length).toBeLessThanOrEqual(
      5,
    );
    const moved = (await row(user.id)).email === next;
    expect(answers.at(-1)?.status).toBe(moved ? 200 : 404);
  });

  it("answers both of two simultaneous confirmations with the right address as confirmed, and moves the account once", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    const answers = await Promise.all([
      confirm(key, user.email),
      confirm(key, user.email),
    ]);
    const later = await confirm(key, user.email);

    expect(answers.map((a) => a.status)).toEqual([200, 200]);
    expect(later.status).toBe(200);
    expect(await row(user.id)).toMatchObject({ email: next });
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(1);
  });

  it("notifies the old address with its undo link even when signing the sessions out fails", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    spyOn(Backend.store.authService, "logoutAll").mockImplementationOnce(() =>
      Promise.reject(new Error("cache down")),
    );

    await confirm(key, user.email);

    expect(await row(user.id)).toMatchObject({ email: next });
    expect(revertKeyIn((await mailTo(user.email)).text)).not.toBe("");
  });

  it("leaves the account where it was when the undo link cannot be stored", async () => {
    const user = await account();
    const next = address("next");
    const { headers } = await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    spyOn(cache, "appendToJsonArray").mockImplementationOnce(() =>
      Promise.reject(new Error("cache down")),
    );

    expect((await confirm(key, user.email)).status).toBe(500);

    expect(await row(user.id)).toMatchObject({ email: user.email });
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(0);
    expect(
      await cache.get(
        cacheConstants.emailChangeReserved(
          new Bun.CryptoHasher("sha256").update(user.email).digest("hex"),
        ),
      ),
    ).toBeNull();
    expect((await client.auth.session.get({ headers })).data).toMatchObject({
      pendingEmail: null,
    });
  });

  it("shows the confirmed page when the notice to the old address cannot be sent", async () => {
    const user = await account();
    const next = address("next");
    const { headers } = await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    spyOn(Backend.store.notification, "sendEmail").mockImplementation(() =>
      Promise.reject(new Error("mailer down")),
    );

    const res = await confirm(key, user.email);

    expect(res.status).toBe(200);
    expect(await row(user.id)).toMatchObject({ email: next });
    expect((await client.auth.session.get({ headers })).status).toBe(401);
  });

  it("keeps a change asked while an earlier confirmation is finishing", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    const newer = {
      requestId: faker.string.uuid(),
      from: next,
      to: address("third"),
      requestedAt: Date.now(),
    };
    const service = Backend.store.authService;
    const logoutAll = service.logoutAll.bind(service);
    spyOn(service, "logoutAll").mockImplementationOnce(async (id) => {
      await cache.set(cacheConstants.emailChangePending(id), newer, "1h");
      return logoutAll(id);
    });

    expect((await confirm(key, user.email)).status).toBe(200);

    expect(
      await cache.get<typeof newer>(cacheConstants.emailChangePending(user.id)),
    ).toEqual(newer);
  });

  it("moves only one of two accounts confirming the same address at once", async () => {
    const first = await account();
    const second = await account();
    const target = address("contested");
    await requestChange(first, target);
    const firstKey = keyIn((await mailTo(target)).text);
    mails = [];
    await requestChange(second, target);
    const secondKey = keyIn((await mailTo(target)).text);

    const answers = await Promise.all([
      confirm(firstKey, first.email),
      confirm(secondKey, second.email),
    ]);

    expect(answers.map((a) => a.status).sort()).toEqual([200, 404]);
    const moved = [await row(first.id), await row(second.id)].filter(
      (r) => r.email === target,
    );
    expect(moved).toHaveLength(1);
  });

  it("refuses the key of an older request once a newer change was asked for", async () => {
    const user = await account();
    const first = address("first");
    const second = address("second");
    const { headers } = await requestChange(user, first);
    const oldKey = keyIn((await mailTo(first)).text);
    await client.auth.profile.put({ email: second }, { headers });
    const newKey = keyIn((await mailTo(second)).text);

    expect((await confirm(oldKey, user.email)).status).toBe(404);
    expect(await row(user.id)).toMatchObject({ email: user.email });
    expect((await confirm(newKey, user.email)).status).toBe(200);
    expect(await row(user.id)).toMatchObject({ email: second });
  });

  it("refuses when another account took the new address before the link was used", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    await account(next);

    const res = await confirm(key, user.email);

    expect(res.status).toBe(404);
    expect(await row(user.id)).toMatchObject({ email: user.email });
    expect(
      await cache.get(cacheConstants.emailChangePending(user.id)),
    ).toBeNull();
  });

  it("refuses when the account's address changed after the request", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    const elsewhere = address("elsewhere");
    await conn
      .updateTable("user")
      .set({ email: elsewhere })
      .where("id", "=", user.id)
      .execute();

    const guess = await confirm(key, address("guess"));
    const res = await confirm(key, elsewhere);

    expect(guess.status).toBe(404);
    expect(res.status).toBe(404);
    expect(await row(user.id)).toMatchObject({ email: elsewhere });
  });

  it("keeps the key only as a hash in the cache", async () => {
    const user = await account();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);
    const hash = new Bun.CryptoHasher("sha256").update(key).digest("hex");

    const byHash = await cache.get(cacheConstants.emailChangeKey(hash));
    const pending = await cache.get(cacheConstants.emailChangePending(user.id));

    expect(byHash).toBeTruthy();
    expect(await cache.get(cacheConstants.emailChangeKey(key))).toBeNull();
    expect(JSON.stringify([byHash, pending])).not.toContain(key);
  });

  it("follows the confirmation rule for provider links: a link stored for the old address stays and leaves the account unstamped", async () => {
    const user = await account();
    const links = new UserSsoAccountRepository(db);
    await links.create({
      user_id: user.id,
      provider: SsoProviderEnum.google,
      provider_user_id: `old-${user.id}`,
      email: user.email,
    });
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    expect((await confirm(key, user.email)).status).toBe(200);

    expect(await row(user.id)).toMatchObject({
      email: next,
      emailVerified: true,
      email_verified_at: null,
    });
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `old-${user.id}`,
      ),
    ).toBeTruthy();
  });
});

const revertKeyIn = (text: string) =>
  text.match(/revert-email-change\?key=([A-Za-z0-9_-]+)/)?.[1] ?? "";

const revertPage = (key: string) =>
  Backend.handle(
    new Request(
      `http://localhost/auth/revert-email-change?key=${encodeURIComponent(key)}`,
    ),
  );

const revert = (key: string) =>
  Backend.handle(
    new Request("http://localhost/auth/revert-email-change", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key }),
    }),
  );

async function changeAndConfirm(
  user: { id: string; email: string },
  current = user.email,
) {
  const next = address("next");
  await requestChange({ ...user, email: current }, next);
  const key = keyIn((await mailTo(next)).text);
  expect((await confirm(key, current)).status).toBe(200);
  return { next, revertKey: revertKeyIn((await mailTo(current)).text) };
}

const passwordOf = async (id: string) =>
  (
    await conn
      .selectFrom("user")
      .select("password")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).password;

describe("undoing an email change from the old address", () => {
  it("moves the account back, removes the password and the sign-in links added since, signs out everywhere, and works once", async () => {
    const user = await account();
    const links = new UserSsoAccountRepository(db);
    await links.create({
      user_id: user.id,
      provider: SsoProviderEnum.apple,
      provider_user_id: `before-${user.id}`,
      email: user.email,
    });
    const { next, revertKey } = await changeAndConfirm(user);
    const afterChange = await signIn(next);
    await links.create({
      user_id: user.id,
      provider: SsoProviderEnum.google,
      provider_user_id: `after-${user.id}`,
      email: next,
    });

    const page = await revertPage(revertKey);
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).not.toContain("<script");
    const res = await revert(revertKey);

    expect(res.status).toBe(200);
    const back = await conn
      .selectFrom("user")
      .select(["email", "password", "email_verified_at"])
      .where("id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(back.email).toBe(user.email);
    expect(back.password).toBeNull();
    expect(back.email_verified_at).not.toBeNull();
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.apple,
        `before-${user.id}`,
      ),
    ).toBeTruthy();
    expect(
      (await client.auth.session.get({ headers: afterChange })).status,
    ).toBe(401);
    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `after-${user.id}`,
      ),
    ).toBeFalsy();
    expect((await revert(revertKey)).status).toBe(404);
    expect((await revertPage(revertKey)).status).toBe(404);
  });

  it("still works after the account was moved again", async () => {
    const user = await account();
    const { next, revertKey } = await changeAndConfirm(user);
    const third = address("third");
    await conn
      .updateTable("user")
      .set({ email: third })
      .where("id", "=", user.id)
      .execute();

    expect((await revert(revertKey)).status).toBe(200);

    expect(await row(user.id)).toMatchObject({ email: user.email });
    for (const moved of [next, third])
      expect((await mailTo(moved)).subject).toContain("undone");
    expect(mails.filter((m) => m.to === user.email)).toHaveLength(1);
  });

  it("ends the undo links of every later change, so an address the account passed through cannot take it back", async () => {
    const user = await account();
    const { next: first, revertKey: own } = await changeAndConfirm(user);
    const { next: second, revertKey: later } = await changeAndConfirm(
      user,
      first,
    );

    expect((await revert(own)).status).toBe(200);

    expect((await revertPage(later)).status).toBe(404);
    expect((await revert(later)).status).toBe(404);
    expect(await row(user.id)).toMatchObject({ email: user.email });
    const hashOf = (value: string) =>
      new Bun.CryptoHasher("sha256").update(value).digest("hex");
    expect(
      await cache.get(cacheConstants.emailChangeReserved(hashOf(first))),
    ).toBeNull();
    expect(second).not.toBe(first);
  });

  it("keeps the first undo link working after a later change was undone from its own previous address", async () => {
    const user = await account();
    const { next: first, revertKey: own } = await changeAndConfirm(user);
    const { revertKey: later } = await changeAndConfirm(user, first);

    expect((await revert(later)).status).toBe(200);
    expect(await row(user.id)).toMatchObject({ email: first });
    expect((await revert(own)).status).toBe(200);

    expect(await row(user.id)).toMatchObject({ email: user.email });
  });

  it("removes a sign-in link added after the change whatever time it records", async () => {
    const user = await account();
    const { next, revertKey } = await changeAndConfirm(user);
    const links = new UserSsoAccountRepository(db);
    await links.create({
      user_id: user.id,
      provider: SsoProviderEnum.google,
      provider_user_id: `backdated-${user.id}`,
      email: next,
    });
    await conn
      .updateTable("user_sso_accounts")
      .set({ created_at: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where("provider_user_id", "=", `backdated-${user.id}`)
      .execute();

    expect((await revert(revertKey)).status).toBe(200);

    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `backdated-${user.id}`,
      ),
    ).toBeFalsy();
  });

  it("keeps the link when the undo cannot apply yet, and undoes once it can", async () => {
    const user = await account();
    const { next, revertKey } = await changeAndConfirm(user);
    const holder = await account(user.email);

    expect((await revert(revertKey)).status).toBe(404);
    expect(await row(user.id)).toMatchObject({ email: next });
    expect((await revertPage(revertKey)).status).toBe(200);
    await conn.deleteFrom("user").where("id", "=", holder.id).execute();

    expect((await revert(revertKey)).status).toBe(200);
    expect(await row(user.id)).toMatchObject({ email: user.email });
  });

  it("refuses a new account through a sign-in provider for the old address while the link lives", async () => {
    const user = await account();
    await changeAndConfirm(user);

    const signUp = new AuthService(
      db,
      cache,
      Backend.store.notification,
    ).loginWithSSO(
      SsoProviderEnum.google,
      {
        providerUserId: `newcomer-${user.id}`,
        email: user.email,
        emailVerified: true,
      } as never,
      jwt as never,
    );

    await expect(signUp).rejects.toMatchObject({ status: 409 });
    expect(
      await conn
        .selectFrom("user")
        .select("id")
        .where("email", "=", user.email)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it("keeps the account from being deleted while the link lives, and deletes it once the link is gone", async () => {
    const user = await account();
    const { next, revertKey } = await changeAndConfirm(user);
    const headers = await signIn(next);

    const refused = await client.auth.account.delete(
      { password: PASSWORD },
      { headers },
    );

    expect(refused.status).toBe(409);
    expect(refused.error?.value).toMatchObject({
      details: { retryAfter: expect.any(Number) },
    });
    expect(await row(user.id)).toMatchObject({ email: next });
    await cache.delete(
      cacheConstants.emailChangeRevert(
        new Bun.CryptoHasher("sha256").update(revertKey).digest("hex"),
      ),
    );

    const deleted = await client.auth.account.delete(
      { password: PASSWORD },
      { headers },
    );

    expect(deleted.status).toBe(200);
    expect(
      await cache.get(cacheConstants.emailChangeReverts(user.id)),
    ).toBeNull();
  });

  it("keeps the old address from being taken by a signup or another account while the link lives", async () => {
    const user = await account();
    await changeAndConfirm(user);
    mails = [];

    const signup = Backend.store.authService.signup(
      {
        email: user.email,
        password: "Signup1234",
        firstName: "S",
        lastName: "U",
      },
      jwt as never,
    );
    await expect(signup).rejects.toMatchObject({ status: 409 });
    const other = await account();
    await requestChange(other, user.email);
    const mail = await mailTo(user.email);

    expect(mail.text).toContain("already has");
    expect(keyIn(mail.text)).toBe("");
  });

  it("refuses an unknown key", async () => {
    expect((await revertPage("not-a-real-key")).status).toBe(404);
    expect((await revert("not-a-real-key")).status).toBe(404);
  });
});

describe("confirming an email change on an account that was never confirmed", () => {
  it("removes the password, as any first confirmation of a contested address does", async () => {
    const user = await account();
    await conn
      .updateTable("user")
      .set({ emailVerified: false })
      .where("id", "=", user.id)
      .execute();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    expect((await confirm(key, user.email)).status).toBe(200);

    const moved = await conn
      .selectFrom("user")
      .select(["email", "password"])
      .where("id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(moved).toEqual({ email: next, password: null });
  });

  it("sends the old address no undo link and keeps nothing reserved for it", async () => {
    const user = await account();
    await conn
      .updateTable("user")
      .set({ emailVerified: false })
      .where("id", "=", user.id)
      .execute();
    const next = address("next");
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    expect((await confirm(key, user.email)).status).toBe(200);

    const notice = await mailTo(user.email);
    expect(notice.subject).toContain("changed");
    expect(revertKeyIn(notice.text)).toBe("");
    await Backend.store.authService.signup(
      {
        email: user.email,
        password: "Signup1234",
        firstName: "S",
        lastName: "U",
      },
      jwt as never,
    );
    const newcomer = await conn
      .selectFrom("user")
      .select("id")
      .where("email", "=", user.email)
      .executeTakeFirstOrThrow();
    created.push(newcomer.id);
  });
});

describe("confirming email changes on a confirmed account whose stamp a provider link cleared", () => {
  it("keeps the password across two changes", async () => {
    const user = await account();
    const links = new UserSsoAccountRepository(db);
    await links.create({
      user_id: user.id,
      provider: SsoProviderEnum.google,
      provider_user_id: `kept-${user.id}`,
      email: user.email,
    });
    await conn
      .updateTable("user")
      .set({ email_verified_at: null })
      .where("id", "=", user.id)
      .execute();

    const { next: first } = await changeAndConfirm(user);
    const { next: second } = await changeAndConfirm(user, first);

    expect(await passwordOf(user.id)).not.toBeNull();
    expect(await row(user.id)).toMatchObject({ email: second });
    await signIn(second);
  });
});

describe("confirming an email change and provider links", () => {
  it("drops a provider link stored for the new address when the change confirms", async () => {
    const user = await account();
    const next = address("next");
    const links = new UserSsoAccountRepository(db);
    await links.create({
      user_id: user.id,
      provider: SsoProviderEnum.google,
      provider_user_id: `new-${user.id}`,
      email: next,
    });
    await requestChange(user, next);
    const key = keyIn((await mailTo(next)).text);

    expect((await confirm(key, user.email)).status).toBe(200);

    expect(
      await links.findByProviderAndProviderId(
        SsoProviderEnum.google,
        `new-${user.id}`,
      ),
    ).toBeFalsy();
    expect((await row(user.id)).email_verified_at).not.toBeNull();
  });
});

describe("an SSO sign-in that adopts an unverified account", () => {
  it("drops the SSO links that account already had, so its previous holder keeps no way in", async () => {
    const squatter = await account();
    await conn
      .updateTable("user")
      .set({ emailVerified: false })
      .where("id", "=", squatter.id)
      .execute();
    const links = new UserSsoAccountRepository(db);
    const squatterProviderId = `squatter-${squatter.id}`;
    await links.create({
      user_id: squatter.id,
      provider: SsoProviderEnum.google,
      provider_user_id: squatterProviderId,
      email: squatter.email,
    });

    await new AuthService(db, cache, Backend.store.notification).loginWithSSO(
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
