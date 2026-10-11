import { describe, expect, it, mock, spyOn } from "bun:test";
import { Elysia, status, t } from "elysia";

import { PosthogService } from "../shared/posthog.service";
import shared from "../shared/shared.plugin";
import { createErrorHandler } from "./error-handler";
import {
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from "./errors";

describe("createErrorHandler - Rate Limit Detection", () => {
  it("should detect plain objects with status 429 and return proper response", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      get: mock(async () => null),
      set: mock(async () => {}),
      ttl: mock(async () => 3600),
    };

    const rateLimitError = {
      status: 429,
      message: "Too many signup attempts, please try again later",
      retryAfter: 3600,
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(429);
    expect(response).toHaveProperty("error", "TOO_MANY_REQUESTS");
    expect(response).toHaveProperty(
      "message",
      "Too many signup attempts, please try again later",
    );
    expect(response).toHaveProperty("retryAfter");
  });

  it("should preserve original rate limit message", async () => {
    const errorHandler = createErrorHandler("auth plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      ttl: mock(async () => 60),
    };

    const rateLimitError = {
      status: 429,
      message: "Too many login attempts, please try again in a minute",
      retryAfter: 60,
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(response.message).toBe(
      "Too many login attempts, please try again in a minute",
    );
  });

  it("should pass retryAfter through, capped at a day", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      ttl: mock(async () => 1800), // 30 minutes
    };

    const rateLimitError = {
      status: 429,
      message: "Rate limited",
      retryAfter: 1800,
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(response.retryAfter).toBe(1800);
    expect(mockCache.ttl).not.toHaveBeenCalled();
    const capped = await errorHandler({
      ...context,
      error: { ...rateLimitError, retryAfter: 90 * 24 * 60 * 60 },
    });
    expect(capped.retryAfter).toBe(24 * 60 * 60);
  });

  it("should drop a retryAfter that is not a positive number", async () => {
    const errorHandler = createErrorHandler("test plugin");
    for (const retryAfter of [0, -5, "60"]) {
      const response = await errorHandler({
        code: "UNKNOWN",
        error: { status: 429, message: "Rate limited", retryAfter },
        set: { status: 200 },
        store: {},
      });
      expect(response.retryAfter).toBeUndefined();
    }
  });

  it("should handle rate limit errors without retryAfter", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };
    const mockCache = {
      ttl: mock(async () => 60),
    };

    const rateLimitError = {
      status: 429,
      message: "Rate limited",
    };

    const context = {
      code: "UNKNOWN",
      error: rateLimitError,
      set: mockSet,
      store: { cache: mockCache },
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(429);
    expect(response.error).toBe("TOO_MANY_REQUESTS");
    expect(response.message).toBe("Rate limited");
    expect(response.retryAfter).toBeUndefined();
  });

  it("should still handle ApiError instances correctly", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const apiError = new UnauthorizedError("Not authenticated");

    const context = {
      code: "UNKNOWN",
      error: apiError,
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(401);
    expect(response).toEqual({
      error: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  });

  it("should handle validation errors correctly", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const context = {
      code: "VALIDATION",
      error: new Error("Validation failed"),
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(422);
    expect(response).toEqual({
      error: "VALIDATION_ERROR",
      message: "Invalid request data",
    });
  });

  it("should handle NOT_FOUND errors correctly", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const context = {
      code: "NOT_FOUND",
      error: new Error("Route not found"),
      set: mockSet,
      store: {},
    };

    const response = await errorHandler(context);

    expect(mockSet.status).toBe(404);
    expect(response).toEqual({
      error: "NOT_FOUND",
      message: "Route not found",
    });
  });

  it("should handle generic errors as 500 Internal Server Error", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const mockSet = { status: 200 };

    const genericError = new Error("Something went wrong");

    const context = {
      code: "UNKNOWN",
      error: genericError,
      set: mockSet,
      store: {},
    };

    const logged = spyOn(console, "error").mockImplementation(() => {});
    let response: unknown;
    try {
      response = await errorHandler(context);
      expect(Bun.inspect(logged.mock.calls)).toContain("Something went wrong");
    } finally {
      logged.mockRestore();
    }

    expect(mockSet.status).toBe(500);
    expect(response).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });
  });

  it("answers the same for a thrown value that is not an Error", async () => {
    const errorHandler = createErrorHandler("test plugin");
    const set = { status: 200 };
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await errorHandler({
        code: "UNKNOWN",
        error: "connection to 10.0.0.5 refused",
        set,
      });
      expect(set.status).toBe(500);
      expect(response).toEqual({
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      });
    } finally {
      logged.mockRestore();
    }
  });
});

describe("a route without its own error handler", () => {
  const app = new Elysia()
    .use(shared)
    .get("/boom", () => {
      throw new Error("relation users_private does not exist");
    })
    .get("/known", () => {
      throw new NotFoundError("Chapter not found");
    })
    .get("/limited", () => {
      throw { status: 429, message: "Slow down" };
    })
    .get("/typed", ({ query }) => query, {
      query: t.Object({ n: t.Numeric() }),
    });

  const call = async (path: string) => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await app.handle(new Request(`http://localhost${path}`));
      return {
        status: response.status,
        body: await response.text(),
        logged: Bun.inspect(logged.mock.calls),
      };
    } finally {
      logged.mockRestore();
    }
  };

  it("answers an unexpected error with a generic 500 and logs the detail", async () => {
    const { status, body, logged } = await call("/boom");
    expect(status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });
    expect(logged).toContain("relation users_private does not exist");
  });

  it("leaves API errors, rate limits and validation answers as they were", async () => {
    const known = await call("/known");
    expect(known.status).toBe(404);
    expect(JSON.parse(known.body)).toEqual({
      error: "NOT_FOUND",
      message: "Chapter not found",
    });
    expect((await call("/limited")).status).toBe(429);
    expect((await call("/typed?n=abc")).status).toBe(422);
  });
});

const withCode = (message: string, fields: Record<string, unknown>) =>
  Object.assign(new Error(message), fields);

const UpstreamNotFoundError = class NotFoundError extends Error {
  status = 404;
};

function routes(app: Elysia) {
  return app
    .get("/coded/:code", ({ params }) => {
      throw withCode("secret detail", { code: params.code });
    })
    .get("/string", () => {
      throw "secret detail";
    })
    .get("/storage", () => {
      throw new InternalServerError("storage failed: secret detail");
    })
    .get("/upstream-limit", () => {
      throw withCode("secret detail", { status: 429, retryAfter: 5 });
    })
    .get("/upstream-404", () => {
      throw new UpstreamNotFoundError("No batch found with id secret detail");
    })
    .get("/forbidden", () => {
      throw status(403, { error: "FORBIDDEN", message: "Not yours" });
    })
    .get("/bad-response", () => ({ count: "many" }) as never, {
      response: { 200: t.Object({ count: t.Number() }) },
    })
    .post("/typed", ({ body }) => body, {
      body: t.Object({ password: t.String({ minLength: 20 }) }),
    });
}

const plugins = {
  "a route with the shared handler": new Elysia().use(
    routes(
      new Elysia()
        .use(shared)
        .onError(createErrorHandler("test plugin")) as unknown as Elysia,
    ),
  ),
  "a route without its own handler": new Elysia().use(
    routes(new Elysia().use(shared) as unknown as Elysia),
  ),
};

for (const [name, app] of Object.entries(plugins))
  describe(`${name}: what a caller reads never carries internal detail`, () => {
    const call = async (path: string, init?: RequestInit) => {
      const logged = spyOn(console, "error").mockImplementation(() => {});
      try {
        const response = await app.handle(
          new Request(`http://localhost${path}`, init),
        );
        return { status: response.status, body: await response.text() };
      } finally {
        logged.mockRestore();
      }
    };
    const generic = JSON.stringify({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });

    const answers: Record<string, { status: number; body: string }> = {
      NOT_FOUND: { status: 500, body: generic },
      VALIDATION: {
        status: 422,
        body: JSON.stringify({
          error: "VALIDATION_ERROR",
          message: "Invalid request data",
        }),
      },
      PARSE: {
        status: 400,
        body: JSON.stringify({
          error: "BAD_REQUEST",
          message: "Invalid request",
        }),
      },
      "42P01": { status: 500, body: generic },
    };
    for (const [code, answer] of Object.entries(answers))
      it(`an Error carrying its own code ${code}`, async () => {
        expect(await call(`/coded/${code}`)).toEqual(answer);
      });

    it("an upstream error that only shares the framework's class name gets the generic 500", async () => {
      expect(await call("/upstream-404")).toEqual({
        status: 500,
        body: generic,
      });
    });

    it("a thrown status keeps its status and body", async () => {
      const { status, body } = await call("/forbidden");
      expect(status).toBe(403);
      expect(JSON.parse(body)).toEqual({
        error: "FORBIDDEN",
        message: "Not yours",
      });
    });

    it("an answer its own route schema rejects is the server's fault", async () => {
      expect(await call("/bad-response")).toEqual({
        status: 500,
        body: generic,
      });
    });

    it("an unknown path stays 404", async () => {
      expect((await call("/missing")).status).toBe(404);
    });

    it("a database error with its own SQLSTATE code answers the generic 500", async () => {
      expect(await call("/coded/42P01")).toEqual({
        status: 500,
        body: generic,
      });
    });

    it("a thrown value that is not an Error", async () => {
      expect(await call("/string")).toEqual({ status: 500, body: generic });
    });

    it("an API error with a 5xx status", async () => {
      expect(await call("/storage")).toEqual({ status: 500, body: generic });
    });

    it("an upstream error carrying status 429 keeps the status, not its text or wait", async () => {
      const { status, body } = await call("/upstream-limit");
      expect(status).toBe(429);
      expect(JSON.parse(body)).toEqual({
        error: "TOO_MANY_REQUESTS",
        message: "Too many requests",
      });
    });

    it("a body that fails validation does not echo what was sent", async () => {
      const { status, body } = await call("/typed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "hunter2-secret" }),
      });
      expect(status).toBe(422);
      expect(body).not.toContain("hunter2");
    });

    it("a body that is not JSON answers 400", async () => {
      const { status, body } = await call("/typed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad",
      });
      expect(status).toBe(400);
      expect(JSON.parse(body)).toEqual({
        error: "BAD_REQUEST",
        message: "Invalid request",
      });
    });
  });

describe("what reaches error reporting", () => {
  const reported = async (withHandler: boolean, thrown: () => unknown) => {
    const captured = spyOn(
      PosthogService.prototype,
      "captureException",
    ).mockImplementation(() => {});
    const quiet = [
      spyOn(console, "error").mockImplementation(() => {}),
      spyOn(console, "debug").mockImplementation(() => {}),
    ];
    try {
      const base = new Elysia().use(shared);
      const plugin = (
        withHandler ? base.onError(createErrorHandler("test plugin")) : base
      ).get("/boom", () => {
        throw thrown();
      });
      await new Elysia()
        .use(plugin as unknown as Elysia)
        .handle(new Request("http://localhost/boom"));
      return captured.mock.calls.map((call) => call[2]);
    } finally {
      captured.mockRestore();
      for (const spy of quiet) spy.mockRestore();
    }
  };

  for (const withHandler of [false, true]) {
    const name = withHandler ? "with the shared handler" : "without it";
    it(`a database error is reported once, with its code and path (${name})`, async () => {
      const calls = await reported(withHandler, () =>
        withCode("relation x does not exist", { code: "42P01" }),
      );
      expect(calls).toEqual([
        expect.objectContaining({ code: "42P01", $current_url: "/boom" }),
      ]);
    });

    it(`an upstream 429 is reported, the limiter's own refusal is not (${name})`, async () => {
      expect(
        await reported(withHandler, () =>
          withCode("upstream", { status: 429 }),
        ),
      ).toHaveLength(1);
      expect(
        await reported(withHandler, () => ({ status: 429, message: "Slow" })),
      ).toHaveLength(0);
    });

    it(`an Error carrying its own NOT_FOUND code is reported (${name})`, async () => {
      expect(
        await reported(withHandler, () =>
          withCode("secret detail", { code: "NOT_FOUND" }),
        ),
      ).toHaveLength(1);
    });
  }
});
