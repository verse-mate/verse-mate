import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";

import coachPlugin from "./coach.plugin";
import { COACH_REFUSALS } from "./coach.schema";

export const CONTRACT_PATH = join(
  import.meta.dir,
  "coach-contract.snapshot.json",
);

export function coachContract() {
  const routes = new Elysia()
    .use(coachPlugin)
    .routes.filter((r) => r.path.startsWith("/coach"))
    .map((r) => ({
      route: `${r.method} ${r.path}`,
      response: JSON.parse(
        JSON.stringify((r.hooks as { response?: unknown }).response ?? {}),
        (key, value) => (key === "additionalProperties" ? undefined : value),
      ) as Record<string, unknown>,
    }))
    .sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
  return {
    refusalBody: {
      error: "CONFLICT | NOT_FOUND | VALIDATION_ERROR",
      message: "the words listed for the code",
      details: { refusal: "the code" },
    },
    refusals: COACH_REFUSALS,
    routes,
  };
}

if (import.meta.main) {
  writeFileSync(CONTRACT_PATH, `${JSON.stringify(coachContract(), null, 2)}\n`);
  console.log(`wrote ${CONTRACT_PATH}`);
  process.exit(0);
}
