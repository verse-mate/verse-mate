import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
  EmailNotificationConsumer,
  MAILGUN_TIMEOUT_MS,
} from "./email-notification.consumer";

const ENV = { ...process.env };
const TOUCHED = [
  "ENVIRONMENT",
  "EMAIL_FROM",
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
] as const;
afterEach(() => {
  mock.restore();
  for (const key of TOUCHED) {
    if (ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ENV[key];
  }
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
    await expect(consumer().sendEmail(MAIL)).resolves.toMatchObject({
      delivered: false,
      status: 500,
    });
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
      'h:Reply-To="Coach" <coach@example.test>',
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

describe("a send cannot hang the caller", () => {
  it("the request carries a timeout signal", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    let signal: unknown;
    const spy = spyOn(globalThis, "fetch").mockImplementation(
      async (_url: unknown, init?: unknown) => {
        signal = (init as { signal?: unknown })?.signal;
        return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
      },
    );
    await consumer().sendEmail(MAIL);
    spy.mockRestore();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(MAILGUN_TIMEOUT_MS);
    expect(MAILGUN_TIMEOUT_MS).toBe(30_000);
  });

  it("a request that times out or never connects is a failed send, not a throw", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const result = await consumer().sendEmail(MAIL);
    spy.mockRestore();
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("timed out");
  });
});

describe("the sender never passes Mailgun more than one recipient", () => {
  it("an address carrying a second recipient is refused before any request", async () => {
    const { spy, sent } = mockFetch(200);
    const result = await consumer().sendEmail({
      ...MAIL,
      to: {
        name: "Leader",
        email: "leader@example.test,attacker@example.test",
      },
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("recipient");
    expect(sent).toEqual([]);
    spy.mockRestore();
  });

  it("an unusual but single address still goes out", async () => {
    const { spy, sent } = mockFetch(200);
    const result = await consumer().sendEmail({
      ...MAIL,
      to: { name: "Leader", email: "o'brien@example.test" },
    });
    expect(result.delivered).toBe(true);
    expect(sent).toHaveLength(1);
    spy.mockRestore();
  });
});

describe("a non-sending environment logs only what identifies no one", () => {
  it("logs the recipient's domain and the subject's length, never the address, the subject or the body", async () => {
    consumer();
    process.env.ENVIRONMENT = "development";
    const dev = new EmailNotificationConsumer();
    const lines: string[] = [];
    const spies = (["log", "debug", "info", "warn", "error"] as const).map(
      (level) =>
        spyOn(console, level).mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(" "));
        }),
    );
    try {
      const result = await dev.sendEmail({
        subject: "Your report for the Tuesday group",
        to: { name: "Test Leader", email: "test.leader@example.org" },
        text: "Private feedback body",
        html: "<p>Private feedback body</p>",
      });
      expect(result).toEqual({ delivered: false, suppressed: true });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const logged = lines.join("\n");
    expect(logged).toContain("example.org");
    expect(logged).toContain(
      String("Your report for the Tuesday group".length),
    );
    expect(logged).not.toContain("test.leader");
    expect(logged).not.toContain("Test Leader");
    expect(logged).not.toContain("Tuesday");
    expect(logged).not.toContain("Private feedback");
  });
});

describe("sender and reply-to are one quoted mailbox each", () => {
  it("a display name with a comma or a quote stays one quoted name", async () => {
    const { sent } = mockFetch(200);
    await consumer().sendEmail({
      ...MAIL,
      from: { name: 'Team "A", Ops', email: "team@example.test" },
      replyTo: { name: "Smith, J", email: "smith@example.test" },
    });
    const form = new URLSearchParams(sent[0]);
    expect(form.get("from")).toBe('"Team \\"A\\", Ops" <team@example.test>');
    expect(form.get("h:Reply-To")).toBe('"Smith, J" <smith@example.test>');
  });

  it.each([
    [
      "a reply-to address with a second recipient",
      { replyTo: { name: "R", email: "r@example.test,x@example.test" } },
      "reply-to",
    ],
    [
      "a sender address with a second recipient",
      { from: { name: "F", email: "f@example.test x@example.test" } },
      "sender",
    ],
    [
      "a reply-to name with a line break",
      {
        replyTo: { name: "R\r\nBcc: x@example.test", email: "r@example.test" },
      },
      "reply-to name",
    ],
    [
      "a subject with a line break",
      { subject: "s\r\nBcc: x@example.test" },
      "subject",
    ],
  ])("%s is refused before any request", async (_label, extra, reason) => {
    const { sent } = mockFetch(200);
    const result = await consumer().sendEmail({ ...MAIL, ...extra });
    expect(result.delivered).toBe(false);
    expect(result.error).toContain(reason);
    expect(sent).toEqual([]);
  });

  it("a refused address is refused in a non-sending environment too, not reported as suppressed", async () => {
    consumer();
    process.env.ENVIRONMENT = "development";
    const result = await new EmailNotificationConsumer().sendEmail({
      ...MAIL,
      to: { name: "L", email: "a@example.test;b@example.test" },
    });
    expect(result.suppressed).toBeUndefined();
    expect(result.error).toContain("recipient");
  });
});

describe("the outcome of a real send", () => {
  it("staging sends like production", async () => {
    const { sent } = mockFetch(200);
    consumer();
    process.env.ENVIRONMENT = "staging";
    const result = await new EmailNotificationConsumer().sendEmail(MAIL);
    expect(result.delivered).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("a failure whose body is not JSON still names an error", async () => {
    spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    );
    const result = await consumer().sendEmail(MAIL);
    expect(result).toMatchObject({ delivered: false, status: 502 });
    expect(result.error).toBeTruthy();
  });

  it("the request carries the message, the domain and the key", async () => {
    let url = "";
    let init: RequestInit = {};
    spyOn(globalThis, "fetch").mockImplementation(
      async (u: unknown, i?: unknown) => {
        url = String(u);
        init = i as RequestInit;
        return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
      },
    );
    await consumer().sendEmail({ ...MAIL, html: "<p>hi</p>" });
    const form = new URLSearchParams(String(init.body));
    expect(url).toBe("https://api.mailgun.net/v3/mail.example.test/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("api:key")}`,
    );
    expect(form.get("from")).toBe("MyDomain <no-reply@example.test>");
    expect(form.get("to")).toBe("leader@example.test");
    expect(form.get("subject")).toBe("s");
    expect(form.get("text")).toBe("body");
    expect(form.get("html")).toBe("<p>hi</p>");
  });
});
