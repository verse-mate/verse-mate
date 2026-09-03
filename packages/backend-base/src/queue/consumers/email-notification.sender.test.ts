import { afterEach, describe, expect, it, spyOn } from "bun:test";

import { EmailNotificationConsumer } from "./email-notification.consumer";

const ENV = { ...process.env };
afterEach(() => {
  process.env.ENVIRONMENT = ENV.ENVIRONMENT;
});

function consumer(): EmailNotificationConsumer {
  process.env.ENVIRONMENT = "production";
  process.env.EMAIL_FROM = "no-reply@example.test";
  process.env.MAILGUN_API_KEY = "key";
  process.env.MAILGUN_DOMAIN = "mail.example.test";
  return new EmailNotificationConsumer();
}

const MAIL = {
  subject: "s",
  to: { name: "Leader", email: "leader@example.test" },
  text: "body",
};

/**
 * Capture the request body ourselves rather than reading it back off the spy:
 * spyOn re-registers on the same global, and reading `mock.calls[0]` picked up
 * an earlier test's call, which made an assertion pass for the wrong reason.
 */
function mockFetch(status: number, body: unknown = { id: "ok" }) {
  const sent: string[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation(
    async (_url: unknown, init?: unknown) => {
      sent.push(String((init as { body?: string })?.body ?? ""));
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  );
  return { spy, sent };
}

/** The form encoding turns spaces into "+"; decode both. */
function readable(body: string): string {
  return decodeURIComponent(body).replace(/\+/g, " ");
}

describe("the sender reports what happened", () => {
  it("a 200 is a delivered result", async () => {
    const { spy } = mockFetch(200);
    const result = await consumer().sendEmail(MAIL);
    expect(result.delivered).toBe(true);
    expect(result.status).toBe(200);
    spy.mockRestore();
  });

  it("a non-2xx is an OBSERVABLE failure, not a console.log", async () => {
    // Before this, a failed send was logged and the method returned normally,
    // so no caller could tell. That makes 'confirm three sends' and 'reported
    // rather than reported as delivered' unverifiable as written.
    const { spy } = mockFetch(401, { message: "Forbidden" });
    const result = await consumer().sendEmail(MAIL);
    expect(result.delivered).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Forbidden");
    spy.mockRestore();
  });

  it("failure is a RESULT, never a throw", async () => {
    // auth.service.ts fires the password-reset mail WITHOUT awaiting it, so a
    // throwing sender would become an unhandled rejection on a path that is
    // otherwise fine.
    const { spy } = mockFetch(500, { message: "boom" });
    const c = consumer();
    let threw = false;
    try {
      c.sendEmail(MAIL);
      await new Promise((r) => setTimeout(r, 10));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    spy.mockRestore();
  });

  it("a non-sending environment is SUPPRESSED, never reported as delivered", async () => {
    // Otherwise a dev run could 'confirm three sends' having sent nothing.
    process.env.ENVIRONMENT = "development";
    const c = new EmailNotificationConsumer();
    const result = await c.sendEmail(MAIL);
    expect(result.delivered).toBe(false);
    expect(result.suppressed).toBe(true);
  });
});

describe("Reply-To has a mechanism", () => {
  it("sends h:Reply-To when asked", async () => {
    // From must be the Mailgun-authenticated sending domain or the message
    // fails SPF/DMARC and lands coaching reports in spam, so a leader's reply
    // needs somewhere else to go.
    const { spy, sent } = mockFetch(200);
    await consumer().sendEmail({
      ...MAIL,
      replyTo: { name: "Coach", email: "coach@example.test" },
    });
    expect(sent.length).toBe(1);
    expect(readable(sent[0])).toContain(
      "h:Reply-To=Coach <coach@example.test>",
    );
    spy.mockRestore();
  });

  it("omits the header entirely when no reply address is given", async () => {
    const { spy, sent } = mockFetch(200);
    await consumer().sendEmail(MAIL);
    expect(sent.length).toBe(1);
    expect(readable(sent[0])).not.toContain("Reply-To");
    spy.mockRestore();
  });
});
