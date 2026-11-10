import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

export const OPENAPI_SPEC_PATH = "/openapi/json";

export const OPENAPI_DOCUMENTATION = {
  openapi: "3.1.0",
  info: {
    title: "VerseMate API",
    version: "1.0.0",
    description:
      "Bible reading platform API with AI-driven translations and interactive Q&A",
  },
  servers: [
    { url: "http://localhost:4000", description: "Development" },
    { url: "https://api.versemate.org", description: "Production" },
  ],
};

export const OPTIONAL_REQUEST_BODIES: ReadonlyArray<[string, string]> = [
  ["delete", "/auth/account"],
];

type Operation = {
  requestBody?: { required?: boolean };
  responses?: Record<string, { content?: Record<string, unknown> }>;
};
type Document = { paths?: Record<string, Record<string, Operation>> };

const EMPTY_BODY_TYPES = new Set(["void", "undefined", "null"]);

export function publishedDocument<T extends Document>(document: T): T {
  const paths = structuredClone(document.paths ?? {});
  for (const item of Object.values(paths))
    for (const operation of Object.values(item))
      for (const response of Object.values(operation.responses ?? {})) {
        const type = response.content?.type;
        if (typeof type === "string" && EMPTY_BODY_TYPES.has(type))
          response.content = undefined;
      }
  for (const [method, path] of OPTIONAL_REQUEST_BODIES) {
    const body = paths[path]?.[method]?.requestBody;
    if (body) body.required = false;
  }
  return { ...document, paths };
}

const published = new WeakMap<Document, Document>();

function cachedPublishedDocument(document: Document): Document {
  let corrected = published.get(document);
  if (!corrected) {
    corrected = publishedDocument(document);
    published.set(document, corrected);
  }
  return corrected;
}

export const openapiDocs = () =>
  new Elysia({ name: "openapi-docs" })
    .onAfterHandle({ as: "global" }, ({ path, response }) =>
      path === OPENAPI_SPEC_PATH
        ? cachedPublishedDocument(response as Document)
        : undefined,
    )
    .use(
      openapi({
        specPath: OPENAPI_SPEC_PATH,
        documentation: OPENAPI_DOCUMENTATION as never,
      }),
    );
