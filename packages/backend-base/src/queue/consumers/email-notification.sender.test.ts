import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
  EMAIL_TIMEOUT_MS,
  EmailNotificationConsumer,
  GMAIL_SEND_URL,
  GOOGLE_TOKEN_URL,
} from "./email-notification.consumer";

const ENV = { ...process.env };
const TOUCHED = [
  "ENVIRONMENT",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
] as const;
afterEach(() => {
  mock.restore();
  for (const key of TOUCHED) {
    if (ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ENV[key];
  }
});

function configure(environment = "production") {
  process.env.ENVIRONMENT = environment;
  process.env.EMAIL_FROM = "no-reply@example.test";
  Reflect.deleteProperty(process.env, "EMAIL_FROM_NAME");
  process.env.GMAIL_CLIENT_ID = "client-id";
  process.env.GMAIL_CLIENT_SECRET = "client-secret";
  process.env.GMAIL_REFRESH_TOKEN = "refresh-token";
}

function consumer(environment = "production"): EmailNotificationConsumer {
  configure(environment);
  return new EmailNotificationConsumer();
}

const MAIL = {
  subject: "s",
  to: { name: "Leader", email: "leader@example.test" },
  text: "body",
};

type Call = { url: string; init: RequestInit };

/**
 * Google, faked: the token endpoint answers `token`, the send endpoint answers
 * `send` (one response per send, the last one repeating). Every request is
 * recorded so a test can read exactly what went out.
 */
function google(
  send: Array<{ status: number; body?: unknown }> = [{ status: 200 }],
  token: { status: number; body?: unknown } = {
    status: 200,
    body: { access_token: "access-1", expires_in: 3600 },
  },
) {
  const calls: Call[] = [];
  let sends = 0;
  const spy = spyOn(globalThis, "fetch").mockImplementation(
    async (url: unknown, init?: unknown) => {
      calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
      const answer =
        String(url) === GOOGLE_TOKEN_URL
          ? token
          : send[Math.min(sends++, send.length - 1)];
      return new Response(JSON.stringify(answer.body ?? { id: "msg-1" }), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      });
    },
  );
  const sent = () =>
    calls
      .filter((c) => c.url === GMAIL_SEND_URL)
      .map((c) => message(JSON.parse(String(c.init.body)).raw));
  return { spy, calls, sent };
}

/** The RFC 5322 message, decoded: its headers and its text/html parts. */
function message(raw: string) {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const [head] = text.split("\r\n\r\n");
  const headers = Object.fromEntries(
    head.split("\r\n").map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()];
    }),
  );
  const parts: Record<string, string> = {};
  for (const m of text.matchAll(
    /Content-Type: text\/(plain|html); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)(?:\r\n--|\r\n$)/g,
  ))
    parts[m[1]] = Buffer.from(m[2].replace(/\r\n/g, ""), "base64").toString(
      "utf8",
    );
  return { text, headers, parts };
}

function decodedWord(value: string): string {
  return value.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b64) =>
    Buffer.from(b64, "base64").toString("utf8"),
  );
}

describe("the sender reports what happened", () => {
  it("a 200 from Gmail is a delivered result", async () => {
    google();
    const result = await consumer().sendEmail(MAIL);
    expect(result).toEqual({ delivered: true, status: 200 });
  });

  it("a non-2xx is an OBSERVABLE failure carrying Google's message", async () => {
    google([{ status: 403, body: { error: { message: "Forbidden" } } }]);
    const result = await consumer().sendEmail(MAIL);
    expect(result).toEqual({
      delivered: false,
      status: 403,
      error: "Forbidden",
    });
  });

  it("failure is a RESULT, never a throw", async () => {
    // auth.service.ts fires the password-reset mail WITHOUT awaiting it, so a
    // throwing sender would become an unhandled rejection on a path that is
    // otherwise fine.
    google([{ status: 500, body: { error: { message: "boom" } } }]);
    await expect(consumer().sendEmail(MAIL)).resolves.toMatchObject({
      delivered: false,
      status: 500,
    });
  });

  it("a refresh token Google refuses is a failed send naming the reason", async () => {
    const { sent } = google([{ status: 200 }], {
      status: 400,
      body: {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      },
    });
    const result = await consumer().sendEmail(MAIL);
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("invalid_grant");
    expect(sent()).toEqual([]);
  });

  it("a non-sending environment is SUPPRESSED, never reported as delivered", async () => {
    const { calls } = google();
    const result = await consumer("development").sendEmail(MAIL);
    expect(result).toEqual({ delivered: false, suppressed: true });
    expect(calls).toEqual([]);
  });

  it("staging sends like production", async () => {
    const { sent } = google();
    const result = await consumer("staging").sendEmail(MAIL);
    expect(result.delivered).toBe(true);
    expect(sent()).toHaveLength(1);
  });

  it("a failure whose body is not JSON still names an error", async () => {
    spyOn(globalThis, "fetch").mockImplementation(async (url: unknown) =>
      String(url) === GOOGLE_TOKEN_URL
        ? new Response(
            JSON.stringify({ access_token: "a", expires_in: 3600 }),
            { status: 200 },
          )
        : new Response("<html>Bad Gateway</html>", { status: 502 }),
    );
    const result = await consumer().sendEmail(MAIL);
    expect(result).toMatchObject({ delivered: false, status: 502 });
    expect(result.error).toBeTruthy();
  });
});

describe("missing mail settings never take the API down", () => {
  it("production without them starts, logs what is missing, and every send fails without a request", async () => {
    configure();
    Reflect.deleteProperty(process.env, "GMAIL_REFRESH_TOKEN");
    const lines: string[] = [];
    spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const { calls } = google();
    const c = new EmailNotificationConsumer();
    expect(lines.join("\n")).toContain("GMAIL_REFRESH_TOKEN");
    const result = await c.sendEmail(MAIL);
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("not configured");
    expect(calls).toEqual([]);
  });

  it("an EMAIL_FROM that is not one address counts as missing", async () => {
    configure();
    process.env.EMAIL_FROM = "a@example.test, b@example.test";
    spyOn(console, "error").mockImplementation(() => {});
    const { calls } = google();
    const result = await new EmailNotificationConsumer().sendEmail(MAIL);
    expect(result.error).toContain("EMAIL_FROM");
    expect(calls).toEqual([]);
  });

  it("a development instance needs no mail settings at all", async () => {
    for (const key of TOUCHED) delete process.env[key];
    process.env.ENVIRONMENT = "development";
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const result = await new EmailNotificationConsumer().sendEmail(MAIL);
    expect(result.suppressed).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("the Gmail API calls", () => {
  it("the token request sends the client and the refresh token; the send carries the bearer and the message", async () => {
    const { calls } = google();
    await consumer().sendEmail({ ...MAIL, html: "<p>hi</p>" });
    expect(calls.map((c) => c.url)).toEqual([GOOGLE_TOKEN_URL, GMAIL_SEND_URL]);
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("client_id")).toBe("client-id");
    expect(form.get("client_secret")).toBe("client-secret");
    expect(form.get("refresh_token")).toBe("refresh-token");
    expect(
      (calls[1].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer access-1");
    expect(Object.keys(JSON.parse(String(calls[1].init.body)))).toEqual([
      "raw",
    ]);
  });

  it("the access token is reused until it is about to expire", async () => {
    const { calls } = google();
    const c = consumer();
    await c.sendEmail(MAIL);
    await c.sendEmail(MAIL);
    expect(calls.filter((x) => x.url === GOOGLE_TOKEN_URL)).toHaveLength(1);
    expect(calls.filter((x) => x.url === GMAIL_SEND_URL)).toHaveLength(2);
  });

  it("a 401 gets one fresh token and one retry", async () => {
    const { calls, sent } = google([{ status: 401 }, { status: 200 }]);
    const result = await consumer().sendEmail(MAIL);
    expect(result.delivered).toBe(true);
    expect(calls.filter((x) => x.url === GOOGLE_TOKEN_URL)).toHaveLength(2);
    expect(sent()).toHaveLength(2);
  });

  it("a second 401 is the caller's to see, not a loop", async () => {
    const { calls } = google([
      { status: 401, body: { error: { message: "Invalid Credentials" } } },
    ]);
    const result = await consumer().sendEmail(MAIL);
    expect(result).toMatchObject({
      delivered: false,
      status: 401,
      error: "Invalid Credentials",
    });
    expect(calls.filter((x) => x.url === GMAIL_SEND_URL)).toHaveLength(2);
  });
});

describe("the message", () => {
  it("text only: one plain part with the headers a mail client expects", async () => {
    const { sent } = google();
    await consumer().sendEmail(MAIL);
    const m = sent()[0];
    expect(m.headers.from).toBe('"VerseMate" <no-reply@example.test>');
    expect(m.headers.to).toBe('"Leader" <leader@example.test>');
    expect(m.headers.subject).toBe("s");
    expect(m.headers["mime-version"]).toBe("1.0");
    expect(m.headers["message-id"]).toMatch(/^<[0-9a-f-]+@example\.test>$/);
    expect(m.headers.date).toMatch(/\+0000$/);
    expect(m.parts.plain).toBe("body");
    expect(m.parts.html).toBeUndefined();
  });

  it("with html: text and html as alternatives", async () => {
    const { sent } = google();
    await consumer().sendEmail({ ...MAIL, html: "<p>hi</p>" });
    const m = sent()[0];
    expect(m.headers["content-type"]).toContain("multipart/alternative");
    expect(m.parts).toEqual({ plain: "body", html: "<p>hi</p>" });
  });

  it("the From address is always EMAIL_FROM; a caller's from only names it", async () => {
    // Gmail rewrites a From that is not the mailbox or a verified alias.
    process.env.EMAIL_FROM_NAME = "VerseMate Team";
    const { sent } = google();
    configure();
    process.env.EMAIL_FROM_NAME = "VerseMate Team";
    const c = new EmailNotificationConsumer();
    await c.sendEmail(MAIL);
    await c.sendEmail({
      ...MAIL,
      from: { name: "Coach", email: "elsewhere@example.test" },
    });
    const [plain, named] = sent();
    expect(plain.headers.from).toBe('"VerseMate Team" <no-reply@example.test>');
    expect(named.headers.from).toBe('"Coach" <no-reply@example.test>');
  });

  it("non-ASCII subjects, names and bodies survive", async () => {
    const { sent } = google();
    await consumer().sendEmail({
      subject: "Raportul tău — Săptămâna 3 ✝",
      to: { name: "Ștefan Pop", email: "stefan@example.test" },
      text: "Bună ziua, Ștefan",
      html: "<p>Bună ziua, Ștefan ✝</p>",
    });
    const m = sent()[0];
    expect(decodedWord(m.headers.subject)).toBe("Raportul tău — Săptămâna 3 ✝");
    expect(decodedWord(m.headers.to)).toBe("Ștefan Pop <stefan@example.test>");
    expect(m.parts.plain).toBe("Bună ziua, Ștefan");
    expect(m.parts.html).toBe("<p>Bună ziua, Ștefan ✝</p>");
  });

  it("Reply-To is sent when asked, and absent otherwise", async () => {
    const { sent } = google();
    const c = consumer();
    await c.sendEmail({
      ...MAIL,
      replyTo: { name: "Coach", email: "coach@example.test" },
    });
    await c.sendEmail(MAIL);
    const [withReply, without] = sent();
    expect(withReply.headers["reply-to"]).toBe('"Coach" <coach@example.test>');
    expect(without.text).not.toContain("Reply-To");
  });

  it("a display name with a comma or a quote stays one quoted name", async () => {
    const { sent } = google();
    await consumer().sendEmail({
      ...MAIL,
      from: { name: 'Team "A", Ops', email: "team@example.test" },
      replyTo: { name: "Smith, J", email: "smith@example.test" },
    });
    const m = sent()[0];
    expect(m.headers.from).toBe('"Team \\"A\\", Ops" <no-reply@example.test>');
    expect(m.headers["reply-to"]).toBe('"Smith, J" <smith@example.test>');
  });
});

describe("a send cannot hang the caller", () => {
  it("both requests carry a timeout signal", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    const { calls } = google();
    await consumer().sendEmail(MAIL);
    expect(calls.every((c) => c.init.signal instanceof AbortSignal)).toBe(true);
    expect(timeout).toHaveBeenCalledWith(EMAIL_TIMEOUT_MS);
    expect(EMAIL_TIMEOUT_MS).toBe(30_000);
  });

  it("a request that times out or never connects is a failed send, not a throw", async () => {
    spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const result = await consumer().sendEmail(MAIL);
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("timed out");
  });
});

describe("the sender never sends to more than one recipient", () => {
  it("an address carrying a second recipient is refused before any request", async () => {
    const { calls } = google();
    const result = await consumer().sendEmail({
      ...MAIL,
      to: {
        name: "Leader",
        email: "leader@example.test,attacker@example.test",
      },
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("recipient");
    expect(calls).toEqual([]);
  });

  it("an unusual but single address still goes out", async () => {
    const { sent } = google();
    const result = await consumer().sendEmail({
      ...MAIL,
      to: { name: "Leader", email: "o'brien@example.test" },
    });
    expect(result.delivered).toBe(true);
    expect(sent()).toHaveLength(1);
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
      "a recipient name with a line break",
      { to: { name: "L\r\nBcc: x@example.test", email: "l@example.test" } },
      "recipient name",
    ],
    [
      "a subject with a line break",
      { subject: "s\r\nBcc: x@example.test" },
      "subject",
    ],
  ])("%s is refused before any request", async (_label, extra, reason) => {
    const { calls } = google();
    const result = await consumer().sendEmail({ ...MAIL, ...extra });
    expect(result.delivered).toBe(false);
    expect(result.error).toContain(reason);
    expect(calls).toEqual([]);
  });

  it("a refused address is refused in a non-sending environment too, not reported as suppressed", async () => {
    const result = await consumer("development").sendEmail({
      ...MAIL,
      to: { name: "L", email: "a@example.test;b@example.test" },
    });
    expect(result.suppressed).toBeUndefined();
    expect(result.error).toContain("recipient");
  });
});

describe("a non-sending environment logs only what identifies no one", () => {
  it("logs the recipient's domain and the subject's length, never the address, the subject or the body", async () => {
    const dev = consumer("development");
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
