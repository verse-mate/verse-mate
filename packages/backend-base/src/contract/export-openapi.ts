import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { contractApp } from "./contract-app";
import { OPENAPI_SPEC_PATH, openapiDocs } from "./openapi-document";

const target = process.argv[2];
if (!target) {
  console.error("usage: bun run openapi:export <output file>");
  process.exit(2);
}

const response = await contractApp()
  .use(openapiDocs())
  .handle(new Request(`http://localhost${OPENAPI_SPEC_PATH}`));
if (!response.ok) {
  console.error(`building the document failed with ${response.status}`);
  process.exit(1);
}
const output = resolve(target);
writeFileSync(output, `${JSON.stringify(await response.json(), null, 2)}\n`);
console.log(`wrote ${output}`);
process.exit(0);
