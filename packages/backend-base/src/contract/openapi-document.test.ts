import { describe, expect, it } from "bun:test";
import { OptionalKind, type TSchema } from "@sinclair/typebox";

import { contractApp } from "./contract-app";
import { OPENAPI_SPEC_PATH, openapiDocs } from "./openapi-document";

type Json = Record<string, any>;

const app = contractApp().use(openapiDocs());
const document: Json = await (
  await app.handle(new Request(`http://localhost${OPENAPI_SPEC_PATH}`))
).json();

function* walk(value: unknown, path = ""): Generator<[string, Json]> {
  if (Array.isArray(value))
    for (const [i, item] of value.entries()) yield* walk(item, `${path}/${i}`);
  else if (value && typeof value === "object") {
    yield [path, value as Json];
    for (const [key, item] of Object.entries(value))
      yield* walk(item, `${path}/${key}`);
  }
}

const operations = Object.entries(document.paths as Json).flatMap(
  ([path, item]) =>
    Object.entries(item as Json).map(
      ([method, operation]) => [path, method, operation as Json] as const,
    ),
);

describe("the published document", () => {
  it("is OpenAPI 3.1 and names the production API as its server", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toContainEqual({
      url: "https://api.versemate.org",
      description: "Production",
    });
    expect(JSON.stringify(document.servers)).not.toContain("versemate.com");
  });

  it("marks every optional request body optional, account deletion included", () => {
    expect(document.paths["/auth/account"].delete.requestBody.required).toBe(
      false,
    );
    const optional = app.routes
      .filter(
        (route) =>
          (route.hooks as { body?: TSchema }).body?.[OptionalKind] ===
          "Optional",
      )
      .map((route) => [route.method.toLowerCase(), route.path] as const);
    expect(optional.length).toBeGreaterThan(0);
    for (const [method, path] of optional) {
      const documented = path.replace(/:([^/]+)/g, "{$1}");
      expect(
        document.paths[documented][method].requestBody?.required ?? false,
      ).toBe(false);
    }
  });

  it("declares responses without a body with no content", () => {
    const empty = operations.flatMap(([path, method, operation]) =>
      Object.entries(operation.responses ?? {})
        .filter(([, response]) => "type" in ((response as Json).content ?? {}))
        .map(([status]) => `${method} ${path} ${status}`),
    );
    expect(empty).toEqual([]);
    expect(
      document.paths["/auth/send-email-verification"].post.responses["204"],
    ).not.toHaveProperty("content");
  });

  it("declares the query the SSO redirects read", () => {
    for (const provider of ["google", "apple"]) {
      const parameters =
        document.paths[`/auth/sso/${provider}/redirect`].get.parameters;
      expect(parameters.map((p: Json) => [p.name, p.in, p.required])).toEqual([
        ["challenge", "query", false],
        ["returnTo", "query", false],
      ]);
    }
  });

  it("uses no keyword or type OpenAPI 3.1 does not define", () => {
    const offending = [...walk(document.paths)]
      .filter(
        ([, node]) =>
          "nullable" in node ||
          (typeof node.type === "string" &&
            ["Date", "void", "undefined"].includes(node.type)),
      )
      .map(([path]) => path);
    expect(offending).toEqual([]);
  });
});
