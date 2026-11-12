import { contractApp } from "./contract-app";
import { OPENAPI_SPEC_PATH, openapiDocs } from "./openapi-document";

const readDocument = async (app: {
  handle: (request: Request) => Promise<Response>;
}) =>
  (
    await app.handle(new Request(`http://localhost${OPENAPI_SPEC_PATH}`))
  ).text();

const before = await readDocument(contractApp().use(openapiDocs()));

const served = contractApp().use(openapiDocs());
await served.handle(new Request("http://localhost/bible/books"));
await served.handle(
  new Request("http://localhost/auth/login", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
  }),
);
const after = await readDocument(served);

const output = process.argv[2];
if (!output) {
  console.error("usage: bun openapi-after-traffic.fixture.ts <output file>");
  process.exit(2);
}
await Bun.write(output, JSON.stringify({ before, after }));
process.exit(0);
