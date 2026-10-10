import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { faker } from "@faker-js/faker";

import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";

const conn = shared.store.db.getOrCreateConnection();
let mails: Array<{ text: string; html: string }> = [];
let created: string[] = [];

const authService = () =>
  new AuthService(
    shared.store.db,
    shared.store.cache,
    shared.store.notification,
  );

async function account() {
  const email = `mail-${faker.string.uuid()}@example.test`;
  const { id } = await conn
    .insertInto("user")
    .values({ email, firstName: "M", lastName: "L", emailVerified: false })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  return { id, email };
}

const linkIn = (text: string) => text.match(/\S*\?key=\S+/)?.[0];

beforeEach(() => {
  mails = [];
  spyOn(shared.store.notification, "sendEmail").mockImplementation(
    (message) => {
      mails.push({ text: message.text, html: String(message.html ?? "") });
      return Promise.resolve({ delivered: true });
    },
  );
});

afterEach(async () => {
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

describe("account emails show their link in the HTML part", () => {
  it("the confirmation email carries the same link as its text part", async () => {
    const { id } = await account();
    await authService().sendVerifyEmail(id);
    const link = linkIn(mails[0].text);
    expect(link).toBeTruthy();
    expect(mails[0].html).toContain(`href="${link}"`);
    expect(mails[0].html).not.toContain("Hello World");
  });

  it("the password reset email carries the same link as its text part", async () => {
    const { email } = await account();
    await authService().forgotPassword({ email });
    const link = linkIn(mails[0].text);
    expect(link).toBeTruthy();
    expect(mails[0].html).toContain(`href="${link}"`);
    expect(mails[0].html).not.toContain("Hello World");
  });
});
